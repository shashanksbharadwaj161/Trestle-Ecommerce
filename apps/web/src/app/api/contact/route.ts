import { prisma } from "@trestle/db";
import { contactInput } from "@/lib/schemas";
import { parseBody, route } from "@/server/http";

/** Stores the message for the support team (admin → Messages). No email is sent from this build. */
export const POST = route(
  { rateLimit: { bucket: "contact", limit: 5, windowSec: 600 } },
  async ({ req }) => {
    const input = await parseBody(req, contactInput);
    if (input.website) return { ok: true }; // honeypot hit: accept silently, store nothing
    const msg = await prisma.contactMessage.create({
      data: {
        name: input.name,
        email: input.email,
        topic: input.topic,
        orderRef: input.orderRef || null,
        message: input.message,
      },
    });
    return { ok: true, reference: msg.id.slice(-8).toUpperCase() };
  },
);
