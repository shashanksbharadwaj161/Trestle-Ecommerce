import { publicStats } from "@/server/stats";
import { route } from "@/server/http";

export const dynamic = "force-dynamic";

/** Public protocol metrics for the transparency dashboard (trust should be verifiable by anyone). */
export const GET = route({ rateLimit: { bucket: "stats", limit: 60, windowSec: 60 } }, async () =>
  publicStats(),
);
