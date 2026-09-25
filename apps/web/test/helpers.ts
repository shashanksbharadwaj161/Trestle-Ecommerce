import { NextRequest } from "next/server";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { prisma } from "@trestle/db";

export const ORIGIN = "http://localhost:3000";

export interface Jar {
  cookies: Map<string, string>;
}
export const newJar = (): Jar => ({ cookies: new Map() });

function cookieHeader(jar?: Jar) {
  if (!jar || jar.cookies.size === 0) return undefined;
  return [...jar.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

export function req(
  path: string,
  init: { method?: string; body?: unknown; jar?: Jar; headers?: Record<string, string>; rawBody?: string } = {},
) {
  const headers: Record<string, string> = { host: "localhost:3000", ...(init.headers ?? {}) };
  const ck = cookieHeader(init.jar);
  if (ck) headers.cookie = ck;
  let body: string | undefined = init.rawBody;
  if (init.body !== undefined) {
    body = JSON.stringify(init.body);
    headers["content-type"] = "application/json";
  }
  return new NextRequest(`${ORIGIN}${path}`, { method: init.method ?? "GET", headers, body });
}

export function absorb(jar: Jar, res: Response) {
  const setCookies = (res.headers as Headers & { getSetCookie?: () => string[] }).getSetCookie?.() ?? [];
  for (const c of setCookies) {
    const [pair] = c.split(";");
    const [k, ...v] = pair!.split("=");
    const value = v.join("=");
    if (!value || /expires=Thu, 01 Jan 1970/i.test(c) || /max-age=0/i.test(c)) jar.cookies.delete(k!.trim());
    else jar.cookies.set(k!.trim(), value);
  }
}

type Handler = (r: NextRequest, ctx?: { params?: Promise<Record<string, string>> }) => Promise<Response>;

export async function call(handler: unknown, r: NextRequest, params?: Record<string, string>, jar?: Jar) {
  const res = await (handler as Handler)(r, params ? { params: Promise.resolve(params) } : undefined);
  if (jar) absorb(jar, res);
  const text = await res.text();
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

export async function signIn(pk = generatePrivateKey(), opts: { chainId?: number } = {}) {
  const { GET: nonceGET } = await import("@/app/api/auth/nonce/route");
  const { POST: verifyPOST } = await import("@/app/api/auth/verify/route");
  const account = privateKeyToAccount(pk);
  const jar = newJar();
  const n = await call(nonceGET, req("/api/auth/nonce", { jar }), undefined, jar);
  const message = createSiweMessage({
    address: account.address,
    chainId: opts.chainId ?? 31338,
    domain: "localhost:3000",
    nonce: n.data.nonce,
    uri: ORIGIN,
    version: "1",
    statement: "Sign in to Trestle",
    issuedAt: new Date(),
  });
  const signature = await account.signMessage({ message });
  const v = await call(verifyPOST, req("/api/auth/verify", { method: "POST", body: { message, signature }, jar, headers: { origin: ORIGIN } }), undefined, jar);
  if (v.status !== 200) throw new Error(`sign-in failed: ${JSON.stringify(v.data)}`);
  return { jar, account, user: v.data.user as { id: string; walletAddress: string; role: string } };
}

export async function resetDb() {
  await prisma.$executeRawUnsafe(`TRUNCATE "AuditLog","Review","Dispute","PaymentIntent","OrderItem","Order","AuthenticityCertificate","ProductVariant","Product","Seller","ReputationEvent","LoyaltyTransaction","SmartAccount","User","ChainEvent","RelayerCheckpoint","SupportedChain" CASCADE`);
}

/** Creates a seller (with its own user) and one product with two variants on local chain B. */
export async function fixtureSeller(opts: { payoutChainId?: number; payoutToken?: string; stock?: number } = {}) {
  const pk = generatePrivateKey();
  const addr = privateKeyToAccount(pk).address.toLowerCase();
  const user = await prisma.user.create({ data: { walletAddress: addr, role: "SELLER" } });
  const seller = await prisma.seller.create({
    data: {
      userId: user.id,
      storefrontName: "Fixture Store",
      slug: `fixture-${addr.slice(2, 10)}`,
      payoutChainId: opts.payoutChainId ?? 31338,
      payoutToken: (opts.payoutToken ?? "0x5fbdb2315678afecb367f032d93f642f64180aa3").toLowerCase(),
      payoutAddress: addr,
      verified: true,
    },
  });
  const product = await prisma.product.create({
    data: {
      sellerId: seller.id,
      title: "Fixture Watch",
      description: "A watch used in automated tests.",
      images: ["/art/fixture?category=Watches"],
      priceUsdMicros: 125_000_000n,
      category: "Watches",
      chainListingOptions: [31337, 31338],
      variants: {
        create: [
          { name: "Black", sku: `FX-${addr.slice(2, 8)}-1`, stock: opts.stock ?? 3 },
          { name: "Blue", sku: `FX-${addr.slice(2, 8)}-2`, stock: 1 },
        ],
      },
    },
    include: { variants: { orderBy: { sku: "asc" } } },
  });
  return { pk, user, seller, product };
}
