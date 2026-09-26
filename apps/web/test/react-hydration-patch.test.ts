import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";

/**
 * Regression for the intermittent React #418 on listing pages under slow networks: React 19.2 (vendored by
 * Next 15.5) replays a host element that suspended while hydrating (e.g. a <ul> whose <li> children are client
 * components whose JS chunk is still loading) without rewinding the hydration cursor. React 19.3 fixed it;
 * patches/next@15.5.26.patch backports the fix. If Next is upgraded or the patch stops applying, this fails —
 * then drop the patch only once the vendored React contains the fix.
 */
const require_ = createRequire(import.meta.url);
const nextDir = require_
  .resolve("next/package.json", { paths: [process.cwd()] })
  .replace(/package\.json$/, "");

describe("vendored react-dom has the host-replay hydration fix", () => {
  for (const file of [
    "react-dom-client.production.js",
    "react-dom-profiling.profiling.js",
    "react-dom-client.development.js",
  ]) {
    it(file, () => {
      const src = readFileSync(`${nextDir}dist/compiled/react-dom/cjs/${file}`, "utf8");
      const i =
        src.indexOf("resetHooksOnUnwind(next);") >= 0
          ? src.indexOf("case 5:\n      resetHooksOnUnwind(next);")
          : src.indexOf("case 5:\n          resetHooksOnUnwind(unitOfWork);");
      expect(i).toBeGreaterThan(0);
      const replayCase = src.slice(i, i + 700);
      expect(replayCase).toMatch(/nextHydratableInstance = (next|unitOfWork)\.stateNode/);
    });
  }
});
