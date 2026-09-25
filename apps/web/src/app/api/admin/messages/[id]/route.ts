import { z } from "zod";
import { prisma } from "@trestle/db";
import { parseBody, route } from "@/server/http";

export const PATCH = route<{ id: string }>({ auth: "admin" }, async ({ req, params }) => {
  const { handled } = await parseBody(req, z.object({ handled: z.boolean() }));
  return { message: await prisma.contactMessage.update({ where: { id: params.id }, data: { handled } }) };
});
