import { listCollections } from "@/server/catalog";
import { route } from "@/server/http";

export const dynamic = "force-dynamic";

export const GET = route({}, async () => ({
  items: (await listCollections()).map((c) => ({ slug: c.slug, title: c.title, count: c._count.products })),
}));
