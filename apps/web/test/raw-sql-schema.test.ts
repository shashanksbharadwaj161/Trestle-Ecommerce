import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { dbSchema, table } from "@trestle/db";

/**
 * Regression: on Supabase's transaction pooler the backend search_path is not guaranteed to be the app schema,
 * so unqualified raw SQL ("AppKV") intermittently failed with 42P01 on the live site (bag reads → HTTP 500).
 */
describe("raw SQL is schema-qualified", () => {
  it("table() qualifies with the schema from DATABASE_URL", () => {
    expect(table("AppKV").sql).toBe(`"${dbSchema()}"."AppKV"`);
    expect(() => table('x"; DROP TABLE y; --')).toThrow();
  });

  it("no $queryRaw/$executeRaw template names a quoted table directly", () => {
    const roots = [
      path.resolve(__dirname, "../src"),
      path.resolve(__dirname, "../../../packages/db/src"),
    ];
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = path.join(d, f);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(f)) files.push(p);
      }
    };
    roots.forEach(walk);
    const offenders: string[] = [];
    for (const f of files) {
      const src = readFileSync(f, "utf8");
      for (const m of src.matchAll(/\$(?:queryRaw|executeRaw)(?:<[^`]*?>)?`([^`]*)`/g)) {
        if (/\b(FROM|INTO|UPDATE|JOIN)\s+"[A-Z]/.test(m[1]!))
          offenders.push(`${path.relative(process.cwd(), f)}: ${m[1]!.slice(0, 80)}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
