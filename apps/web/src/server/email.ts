import "server-only";
import { env } from "./env";

/**
 * Transactional email adapter.
 *  - "resend": Resend HTTP API (has a free tier) — RESEND_API_KEY + EMAIL_FROM
 *  - "smtp":   any SMTP account via nodemailer — SMTP_URL (smtps://user:pass@host:465) + EMAIL_FROM
 *  - "log":    DEVELOPMENT/TEST ONLY — nothing is sent; the message is kept in memory and printed to the server
 *              console marked NOT SENT. Refused when NODE_ENV=production so delivery is never faked.
 * Without a provider, features that need email report themselves as unavailable.
 */
export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

const outbox: Mail[] = [];
/** test hook for the "log" driver */
export const __devOutbox = outbox;

export function emailProvider(): "resend" | "smtp" | "log" | null {
  const e = env();
  if (e.EMAIL_PROVIDER === "resend" && e.RESEND_API_KEY && e.EMAIL_FROM) return "resend";
  if (e.EMAIL_PROVIDER === "smtp" && e.SMTP_URL && e.EMAIL_FROM) return "smtp";
  if (e.EMAIL_PROVIDER === "log" && e.NODE_ENV !== "production") return "log";
  return null;
}

export async function sendMail(mail: Mail): Promise<void> {
  const e = env();
  const provider = emailProvider();
  if (provider === "resend") {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${e.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({ from: e.EMAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
    });
    if (!res.ok) throw new Error(`email provider responded ${res.status}`);
    return;
  }
  if (provider === "smtp") {
    const { createTransport } = await import("nodemailer");
    await createTransport(e.SMTP_URL!).sendMail({ from: e.EMAIL_FROM, ...mail });
    return;
  }
  if (provider === "log") {
    outbox.push(mail);
    if (outbox.length > 50) outbox.shift();
    console.info(`[email:DEV-ONLY — NOT SENT] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
    return;
  }
  throw new Error("email is not configured");
}
