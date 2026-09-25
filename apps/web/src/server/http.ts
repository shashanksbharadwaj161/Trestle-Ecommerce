import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError, type ZodType, type ZodTypeDef } from "zod";
import { toJsonSafe } from "@trestle/db";
import { rateLimit } from "./rate-limit";
import { SESSION_COOKIE, userFromToken, type AuthedUser } from "./session";
import { env } from "./env";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const unauthorized = (msg = "Sign in with your wallet to continue") => new ApiError(401, "unauthorized", msg);
export const forbidden = (msg = "You do not have access to this resource") => new ApiError(403, "forbidden", msg);
export const notFound = (what = "Resource") => new ApiError(404, "not_found", `${what} not found`);
export const badRequest = (msg: string, details?: unknown) => new ApiError(400, "bad_request", msg, details);
export const conflict = (msg: string, details?: unknown) => new ApiError(409, "conflict", msg, details);

export function json(data: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(toJsonSafe(data), init);
}

export function errorResponse(err: unknown): NextResponse {
  if (err instanceof ApiError) {
    return json({ error: { code: err.code, message: err.message, details: err.details } }, { status: err.status });
  }
  if (err instanceof ZodError) {
    return json(
      { error: { code: "validation_error", message: "Invalid request", details: err.flatten() } },
      { status: 400 },
    );
  }
  console.error("[api] unhandled error", err);
  return json({ error: { code: "internal_error", message: "Something went wrong. Please try again." } }, { status: 500 });
}

export function clientIp(req: NextRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  return (fwd?.split(",")[0] ?? req.headers.get("x-real-ip") ?? "local").trim();
}

type AuthLevel = "optional" | "user" | "seller" | "admin";

export interface RouteOptions {
  auth?: AuthLevel;
  rateLimit?: { bucket: string; limit: number; windowSec: number };
  /** reject cross-origin mutating requests (default: true for non-GET) */
  sameOrigin?: boolean;
}

export interface RouteContext<P> {
  req: NextRequest;
  params: P;
  user: AuthedUser | null;
  ip: string;
}

function assertSameOrigin(req: NextRequest) {
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser clients (curl, server-to-server) send no Origin; cookies are SameSite=Lax
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const allowed = new Set<string>();
  if (host) {
    allowed.add(`https://${host}`);
    allowed.add(`http://${host}`);
  }
  if (env().APP_URL) allowed.add(new URL(env().APP_URL!).origin);
  if (!allowed.has(origin)) throw new ApiError(403, "bad_origin", "Cross-origin request rejected");
}

/** Wraps a route handler with auth, rate limiting, CSRF-origin checks and uniform error handling. */
export function route<P extends Record<string, string> = Record<string, never>>(
  opts: RouteOptions,
  fn: (ctx: RouteContext<P>) => Promise<unknown>,
) {
  return async (req: NextRequest, context?: { params?: Promise<P> }) => {
    try {
      const mutating = !["GET", "HEAD", "OPTIONS"].includes(req.method);
      if (mutating && opts.sameOrigin !== false) assertSameOrigin(req);
      const params = ((await context?.params) ?? {}) as P;
      const user = await userFromToken(req.cookies.get(SESSION_COOKIE)?.value);
      const auth = opts.auth ?? "optional";
      if (auth !== "optional" && !user) throw unauthorized();
      if (auth === "seller" && user!.role !== "SELLER" && user!.role !== "ADMIN") {
        throw forbidden("Seller account required — complete seller onboarding first");
      }
      if (auth === "admin" && user!.role !== "ADMIN") throw forbidden("Admin access required");
      const ip = clientIp(req);
      if (opts.rateLimit) {
        const rl = await rateLimit(opts.rateLimit.bucket, user?.id ?? ip, opts.rateLimit.limit, opts.rateLimit.windowSec);
        if (!rl.ok) {
          const res = json(
            { error: { code: "rate_limited", message: `Too many requests. Try again in ${rl.resetSeconds}s.` } },
            { status: 429 },
          );
          res.headers.set("Retry-After", String(rl.resetSeconds));
          return res;
        }
      }
      const result = await fn({ req, params, user, ip });
      if (result instanceof Response) return result;
      return json(result ?? { ok: true });
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function parseBody<T>(req: NextRequest, schema: ZodType<T, ZodTypeDef, unknown>): Promise<T> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) throw new ApiError(415, "unsupported_media_type", "Expected application/json");
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw badRequest("Malformed JSON body");
  }
  return schema.parse(raw);
}

export function parseQuery<T>(req: NextRequest, schema: ZodType<T, ZodTypeDef, unknown>): T {
  const obj: Record<string, string | string[]> = {};
  for (const [k, v] of req.nextUrl.searchParams.entries()) {
    const prev = obj[k];
    obj[k] = prev === undefined ? v : Array.isArray(prev) ? [...prev, v] : [prev, v];
  }
  return schema.parse(obj);
}
