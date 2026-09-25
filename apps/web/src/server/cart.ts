import "server-only";
import { randomBytes } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { prisma } from "@trestle/db";
import { kv } from "./kv";
import { badRequest } from "./http";
import { env } from "./env";

/**
 * Server-side bag in the KV store. Signed-in users: `cart:<userId>`. Guests: `cart:g:<random id>` keyed by
 * the httpOnly `trestle_cart` cookie, so a guest bag survives reloads and is merged into the account bag
 * on sign-in.
 */
export interface CartLine {
  variantId: string;
  quantity: number;
}

export const GUEST_CART_COOKIE = "trestle_cart";
const CART_TTL = 30 * 24 * 3600;
const MAX_LINES = 50;
/** Cart keys are either a user id or "g:<guest id>" */
const key = (owner: string) => `cart:${owner}`;

export function guestOwner(guestId: string) {
  return `g:${guestId}`;
}

/** Resolves the cart owner for a request; creates a guest id when needed (caller sets the cookie). */
export function cartOwner(
  req: NextRequest,
  user: { id: string } | null,
): { owner: string; newGuestId?: string } {
  if (user) return { owner: user.id };
  const existing = req.cookies.get(GUEST_CART_COOKIE)?.value;
  if (existing && /^[A-Za-z0-9_-]{22,64}$/.test(existing)) return { owner: guestOwner(existing) };
  const id = randomBytes(18).toString("base64url");
  return { owner: guestOwner(id), newGuestId: id };
}

export function setGuestCartCookie(res: NextResponse, guestId: string) {
  res.cookies.set(GUEST_CART_COOKIE, guestId, {
    httpOnly: true,
    sameSite: "lax",
    secure: env().NODE_ENV === "production",
    path: "/",
    maxAge: CART_TTL,
  });
}

/** Moves a guest bag into the account bag (max of quantities) — called after every sign-in. */
export async function mergeGuestCart(req: NextRequest, userId: string) {
  const guestId = req.cookies.get(GUEST_CART_COOKIE)?.value;
  if (!guestId) return;
  const guest = await readCart(guestOwner(guestId));
  if (guest.length === 0) return;
  const merged = applyCartMutation(await readCart(userId), { op: "merge", items: guest });
  await writeCart(userId, merged.slice(0, MAX_LINES));
  await kv().del(key(guestOwner(guestId)));
}

export async function readCart(owner: string): Promise<CartLine[]> {
  const raw = await kv().get(key(owner));
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as CartLine[];
    return Array.isArray(parsed)
      ? parsed.filter((l) => typeof l.variantId === "string" && l.quantity > 0)
      : [];
  } catch {
    return [];
  }
}

export async function writeCart(owner: string, lines: CartLine[]) {
  if (lines.length > MAX_LINES) throw badRequest(`A bag can hold at most ${MAX_LINES} lines`);
  await kv().set(key(owner), JSON.stringify(lines), { ex: CART_TTL });
}

export async function clearCartLines(owner: string, variantIds: string[]) {
  const lines = await readCart(owner);
  await writeCart(
    owner,
    lines.filter((l) => !variantIds.includes(l.variantId)),
  );
}

/** Joins cart lines with live catalog data; drops variants that no longer exist or are not purchasable. */
export async function hydrateCart(lines: CartLine[]) {
  if (lines.length === 0)
    return { lines: [], groups: [], subtotalUsdMicros: 0n, warnings: [] as string[] };
  const variants = await prisma.productVariant.findMany({
    where: { id: { in: lines.map((l) => l.variantId) } },
    include: {
      product: {
        select: {
          id: true,
          slug: true,
          title: true,
          images: true,
          priceUsdMicros: true,
          status: true,
          department: true,
          chainListingOptions: true,
          gallery: { select: { url: true, colour: true }, orderBy: { position: "asc" } },
          seller: {
            select: {
              id: true,
              storefrontName: true,
              slug: true,
              verified: true,
              payoutChainId: true,
              payoutToken: true,
            },
          },
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
    if (quantity < l.quantity)
      warnings.push(
        v.stock <= 0
          ? `“${v.product.title}” in ${v.name} has sold out and was removed.`
          : `Only ${v.stock} left of “${v.product.title}” in ${v.name} — quantity updated.`,
      );
    if (quantity === 0) continue;
    const image =
      v.product.gallery.find((g) => g.colour && g.colour === v.colour)?.url ??
      v.product.gallery[0]?.url ??
      v.product.images[0] ??
      null;
    out.push({
      variantId: v.id,
      variantName: v.name,
      colour: v.colour,
      size: v.size,
      image,
      sku: v.sku,
      stock: v.stock,
      quantity,
      product: v.product,
      lineTotalUsdMicros: v.product.priceUsdMicros * BigInt(quantity),
    });
  }
  const groupsMap = new Map<
    string,
    {
      seller: (typeof out)[number]["product"]["seller"];
      lines: typeof out;
      subtotalUsdMicros: bigint;
    }
  >();
  for (const line of out) {
    const g = groupsMap.get(line.product.seller.id) ?? {
      seller: line.product.seller,
      lines: [],
      subtotalUsdMicros: 0n,
    };
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
      for (const it of m.items)
        map.set(it.variantId, Math.min(20, Math.max(map.get(it.variantId) ?? 0, it.quantity)));
      break;
  }
  return [...map.entries()].map(([variantId, quantity]) => ({ variantId, quantity }));
}
