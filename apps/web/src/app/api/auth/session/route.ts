import { route } from "@/server/http";
import { publicUser } from "@/server/auth";

export const dynamic = "force-dynamic";

export const GET = route({}, async ({ user }) => ({
  user: user ? await publicUser(user.id) : null,
}));
