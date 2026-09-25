import "server-only";
import { prisma } from "@trestle/db";
import { kv } from "./kv";
import { badRequest } from "./http";

/** Server-side cart, stored in Redis per signed-in user (anonymous carts live in the browser and merge on sign-in). */
export interface CartLine {
  variantId: string;
  quantity: number;
}

const CART_TTL = 30 * 24 * 3600;
const MAX_LINES = 50;
const key = (userId: string) => `cart:${userId}`;

export async function readCart(userId: string): Promise<CartLine[]> {
  const raw = await kv().get(key(userId));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as CartLine[];
    return Array.isArray(parsed) ? parsed.filter((l) => typeof l.variantId === "string" && l.quantity > 0) : [];
  } catch {
    return [];
  }
}

export async function writeCart(userId: string, lines: CartLine[]) {
  if (lines.length > MAX_LINES) throw badRequest(`A cart can hold at most ${MAX_LINES} lines`);
  await kv().set(key(userId), JSON.stringify(lines), { ex: CART_TTL });
}

export async function clearCartLines(userId: string, variantIds: string[]) {
  const lines = await readCart(userId);
  await writeCart(
    userId,
    lines.filter((l) => !variantIds.includes(l.variantId)),
  );
}

/** Joins cart lines with live catalog data; drops variants that no longer exist or are not purchasable. */
export async function hydrateCart(lines: CartLine[]) {
  if (lines.length === 0) return { lines: [], groups: [], subtotalUsdMicros: 0n, warnings: [] as string[] };
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: lines.map((l) => l.variantId) } },
    include: {
      product: {
        select: {
          id: true,
          title: true,
          images: true,
          priceUsdMicros: true,
          status: true,
          chainListingOptions: true,
          seller: { select: { id: true, storefrontName: true, slug: true, verified: true, payoutChainId: true, payoutToken: true } },
        },
      },
    },
  });
  const byId = new Map(variants.map((v) => [v.id, v]));
  const warnings: string[] = [];
  const out = [];
  for (const l of lines) {
    const v = byId.get(l.variantId);
    if (!v || v.product.status !== "ACTIVE") {
      warnings.push("An item in your cart is no longer available and was removed.");
      continue;
    }
    const quantity = Math.min(l.quantity, Math.max(v.stock, 0));
    if (quantity < l.quantity) warnings.push(`Only ${v.stock} left of “${v.product.title} — ${v.name}”.`);
    if (quantity === 0) continue;
    out.push({
      variantId: v.id,
      variantName: v.name,
      sku: v.sku,
      stock: v.stock,
      quantity,
      product: v.product,
      lineTotalUsdMicros: v.product.priceUsdMicros * BigInt(quantity),
    });
  }
  const groupsMap = new Map<string, { seller: (typeof out)[number]["product"]["seller"]; lines: typeof out; subtotalUsdMicros: bigint }>();
  for (const line of out) {
    const g = groupsMap.get(line.product.seller.id) ?? { seller: line.product.seller, lines: [], subtotalUsdMicros: 0n };
    g.lines.push(line);
    g.subtotalUsdMicros += line.lineTotalUsdMicros;
    groupsMap.set(line.product.seller.id, g);
  }
  return {
    lines: out,
    groups: [...groupsMap.values()],
    subtotalUsdMicros: out.reduce((s, l) => s + l.lineTotalUsdMicros, 0n),
    warnings: [...new Set(warnings)],
  };
}

export function applyCartMutation(
  lines: CartLine[],
  m:
    | { op: "add"; variantId: string; quantity: number }
    | { op: "set"; variantId: string; quantity: number }
    | { op: "remove"; variantId: string }
    | { op: "clear" }
    | { op: "merge"; items: CartLine[] },
): CartLine[] {
  const map = new Map(lines.map((l) => [l.variantId, l.quantity]));
  switch (m.op) {
    case "add":
      map.set(m.variantId, Math.min(20, (map.get(m.variantId) ?? 0) + m.quantity));
      break;
    case "set":
      if (m.quantity === 0) map.delete(m.variantId);
      else map.set(m.variantId, m.quantity);
      break;
    case "remove":
      map.delete(m.variantId);
      break;
    case "clear":
      map.clear();
      break;
    case "merge":
      for (const it of m.items) map.set(it.variantId, Math.min(20, Math.max(map.get(it.variantId) ?? 0, it.quantity)));
      break;
  }
  return [...map.entries()].map(([variantId, quantity]) => ({ variantId, quantity }));
}
