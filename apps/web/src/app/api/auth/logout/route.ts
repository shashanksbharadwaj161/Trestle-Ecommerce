import { json, route } from "@/server/http";
import { revokeSession, SESSION_COOKIE } from "@/server/session";

export const POST = route({}, async ({ user }) => {
  if (user) await revokeSession(user.sessionId);
  const res = json({ ok: true });
  res.cookies.delete(SESSION_COOKIE);
  return res;
});
