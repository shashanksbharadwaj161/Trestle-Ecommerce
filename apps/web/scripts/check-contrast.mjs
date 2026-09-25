// Checks WCAG contrast of the design token pairs declared in globals.css (light + dark).
import { readFileSync } from "node:fs";
const css = readFileSync(new URL("../src/app/globals.css", import.meta.url), "utf8");
const block = (sel) => {
  const m = css.match(new RegExp(`${sel.replace(".", "\\.")}\\s*\\{([^}]*)\\}`));
  return Object.fromEntries([...m[1].matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map((x) => [x[1], x[2]]));
};
const lum = (hex) => {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const pairs = [["foreground","background"],["muted-foreground","background"],["muted-foreground","card"],["muted-foreground","muted"],["primary-foreground","primary"],["accent","background"],["trust","background"],["trust","trust-soft"],["success","success-soft"],["warning","warning-soft"],["danger","danger-soft"],["info","info-soft"],["danger","background"],["foreground","muted"]];
let fail = 0;
for (const [name, sel] of [["light", ":root"], ["dark", ".dark"]]) {
  const t = block(sel);
  for (const [fg, bg] of pairs) {
    const r = ratio(t[fg], t[bg]);
    const ok = r >= 4.5;
    if (!ok) fail++;
    console.log(`${name.padEnd(5)} ${fg.padEnd(18)} on ${bg.padEnd(12)} ${r.toFixed(2)} ${ok ? "ok" : "FAIL"}`);
  }
}
process.exit(fail ? 1 : 0);
