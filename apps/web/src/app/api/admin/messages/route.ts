import { prisma } from "@trestle/db";
import { route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route({ auth: "admin" }, async () => ({
  items: await prisma.contactMessage.findMany({ orderBy: [{ handled: "asc" }, { createdAt: "desc" }], take: 200 }),
}));
