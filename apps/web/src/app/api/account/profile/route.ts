import { prisma } from "@trestle/db";
import { profileInput } from "@/lib/schemas";
import { parseBody, route } from "@/server/http";
import { publicUser } from "@/server/auth";

export const PATCH = route({ auth: "user" }, async ({ req, user }) => {
  const input = await parseBody(req, profileInput);
  await prisma.user.update({ where: { id: user!.id }, data: { displayName: input.displayName } });
  return { user: await publicUser(user!.id) };
});
