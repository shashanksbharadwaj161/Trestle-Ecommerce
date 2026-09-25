import { spawnSync } from "node:child_process";
import "../../../packages/db/src/connection";

function run(args: string[]) {
  const result = spawnSync("pnpm", args, { stdio: "inherit", env: process.env });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
// Never migrate or seed from previews against the production database.
if (process.env.VERCEL_ENV === "production" && process.env.POSTGRES_PRISMA_URL) {
  run(["--filter", "@trestle/db", "migrate:deploy"]);
  run(["--filter", "@trestle/db", "seed:catalog"]);
}
run(["build"]);
