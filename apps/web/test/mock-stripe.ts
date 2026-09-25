/**
 * MOCK Stripe API for contract tests — NOT Stripe. It implements just enough of the REST surface used by
 * server/card-checkout.ts (coupons, checkout sessions create/retrieve/expire, refunds) so the real Stripe
 * Node SDK can talk to it over HTTP. Nothing here proves that Stripe itself accepts these requests; it proves
 * our request shapes, idempotency keys, amounts and state handling.
 */
import { createServer, type Server } from "node:http";
import { randomBytes } from "node:crypto";

export interface MockSession {
  id: string;
  object: "checkout.session";
  status: "open" | "complete" | "expired";
  payment_status: "unpaid" | "paid";
  amount_total: number;
  amount_subtotal: number;
  currency: string;
  client_reference_id: string | null;
  metadata: Record<string, string>;
  url: string;
  payment_intent: string | null;
  customer_email: string | null;
  expires_at: number;
  params: Record<string, string>;
}

export interface MockRequest {
  method: string;
  path: string;
  params: Record<string, string>;
  idempotencyKey: string | null;
}

export class MockStripe {
  server!: Server;
  port = 0;
  sessions = new Map<string, MockSession>();
  coupons = new Map<string, { id: string; amount_off: number }>();
  refunds: { id: string; payment_intent: string; amount: number | null; idempotencyKey: string | null }[] = [];
  requests: MockRequest[] = [];
  /** idempotency-key → response body (like Stripe, replays return the first response) */
  private idem = new Map<string, unknown>();
  failNextSessionCreate = false;

  async start(port: number) {
    this.server = createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        const params = Object.fromEntries(new URLSearchParams(body));
        const url = new URL(req.url ?? "/", "http://mock");
        const idempotencyKey = (req.headers["idempotency-key"] as string) ?? null;
        this.requests.push({ method: req.method ?? "GET", path: url.pathname, params, idempotencyKey });
        const send = (status: number, data: unknown) => {
          res.writeHead(status, { "content-type": "application/json", "request-id": `req_${randomBytes(6).toString("hex")}` });
          res.end(JSON.stringify(data));
        };
        if (idempotencyKey && this.idem.has(`${url.pathname}:${idempotencyKey}`)) {
          return send(200, this.idem.get(`${url.pathname}:${idempotencyKey}`));
        }
        const remember = (data: unknown) => {
          if (idempotencyKey) this.idem.set(`${url.pathname}:${idempotencyKey}`, data);
          send(200, data);
        };
        const p = url.pathname;
        if (req.method === "POST" && p === "/v1/coupons") {
          const c = { id: `coupon_${randomBytes(6).toString("hex")}`, object: "coupon", amount_off: Number(params.amount_off) };
          this.coupons.set(c.id, c);
          return remember(c);
        }
        if (req.method === "POST" && p === "/v1/checkout/sessions") {
          if (this.failNextSessionCreate) {
            this.failNextSessionCreate = false;
            return send(400, { error: { type: "invalid_request_error", message: "mock failure" } });
          }
          let subtotal = 0;
          for (let i = 0; params[`line_items[${i}][quantity]`]; i++) {
            subtotal += Number(params[`line_items[${i}][quantity]`]) * Number(params[`line_items[${i}][price_data][unit_amount]`]);
          }
          const shipping = Number(params["shipping_options[0][shipping_rate_data][fixed_amount][amount]"] ?? 0);
          const coupon = params["discounts[0][coupon]"] ? this.coupons.get(params["discounts[0][coupon]"]) : undefined;
          const id = `cs_test_${randomBytes(10).toString("hex")}`;
          const s: MockSession = {
            id,
            object: "checkout.session",
            status: "open",
            payment_status: "unpaid",
            amount_subtotal: subtotal,
            amount_total: subtotal - (coupon?.amount_off ?? 0) + shipping,
            currency: params.currency ?? params["line_items[0][price_data][currency]"] ?? "usd",
            client_reference_id: params.client_reference_id ?? null,
            metadata: { cardPaymentId: params["metadata[cardPaymentId]"] ?? "" },
            url: `https://checkout.stripe.test/pay/${id}`,
            payment_intent: null,
            customer_email: params.customer_email ?? null,
            expires_at: Number(params.expires_at),
            params,
          };
          this.sessions.set(id, s);
          return remember(this.public(s));
        }
        const m = p.match(/^\/v1\/checkout\/sessions\/([^/]+)(\/expire)?$/);
        if (m) {
          const s = this.sessions.get(m[1]!);
          if (!s) return send(404, { error: { type: "invalid_request_error", message: "No such session" } });
          if (m[2]) {
            if (s.status !== "open")
              return send(400, { error: { type: "invalid_request_error", message: `Session is ${s.status}` } });
            s.status = "expired";
          }
          return send(200, this.public(s));
        }
        if (req.method === "POST" && p === "/v1/refunds") {
          const r = {
            id: `re_${randomBytes(8).toString("hex")}`,
            object: "refund",
            payment_intent: params.payment_intent!,
            amount: params.amount ? Number(params.amount) : null,
            status: "succeeded",
          };
          this.refunds.push({ ...r, idempotencyKey });
          return remember(r);
        }
        send(404, { error: { type: "invalid_request_error", message: `mock: unhandled ${req.method} ${p}` } });
      });
    });
    await new Promise<void>((r) => this.server.listen(port, "127.0.0.1", () => r()));
    this.port = port;
  }

  stop() {
    return new Promise<void>((r) => this.server.close(() => r()));
  }

  /** Simulates the buyer paying on the hosted page. */
  pay(sessionId: string, opts: { async?: boolean } = {}) {
    const s = this.sessions.get(sessionId)!;
    s.status = "complete";
    s.payment_status = opts.async ? "unpaid" : "paid";
    s.payment_intent = `pi_${randomBytes(8).toString("hex")}`;
    return s;
  }

  public(s: MockSession) {
    const { params: _p, ...rest } = s;
    return rest;
  }

  /** Builds a checkout.session.* event payload the way Stripe would deliver it. */
  sessionEvent(
    type: string,
    s: MockSession,
    overrides: Partial<MockSession> & { shipping?: boolean; email?: string } = {},
  ) {
    const { shipping = true, email = "guest@example.test", ...o } = overrides;
    return {
      id: `evt_${randomBytes(10).toString("hex")}`,
      object: "event",
      type,
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          ...this.public(s),
          ...o,
          customer_details: { email },
          collected_information: shipping
            ? {
                shipping_details: {
                  name: "Test Buyer",
                  address: { line1: "1 Test Street", line2: null, city: "Testville", state: "CA", postal_code: "94000", country: "US" },
                },
              }
            : null,
        },
      },
    };
  }

  chargeRefundedEvent(paymentIntent: string, amountRefunded: number) {
    return {
      id: `evt_${randomBytes(10).toString("hex")}`,
      object: "event",
      type: "charge.refunded",
      created: Math.floor(Date.now() / 1000),
      data: { object: { id: `ch_${randomBytes(6).toString("hex")}`, object: "charge", payment_intent: paymentIntent, amount_refunded: amountRefunded } },
    };
  }
}
