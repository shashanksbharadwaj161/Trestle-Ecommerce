import { Prisma } from "@prisma/client";

let cachedSchema: string | undefined;

/** The Postgres schema Prisma uses (`?schema=` on DATABASE_URL; Prisma's default is "public"). */
export function dbSchema(): string {
  if (cachedSchema) return cachedSchema;
  let schema = "public";
  try {
    schema = new URL(process.env.DATABASE_URL ?? "").searchParams.get("schema") || "public";
  } catch {
    /* no URL (tooling) */
  }
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(schema))
    throw new Error("invalid database schema name");
  return (cachedSchema = schema);
}

/**
 * A schema-qualified table reference for raw SQL. Prisma qualifies its own queries, but raw SQL resolves
 * unqualified names through search_path — and behind a transaction pooler (Supabase Supavisor) the backend
 * connection's search_path is not guaranteed to be the app schema, so `"AppKV"` intermittently failed with
 * 42P01 (undefined table). Always use `${table("Name")}` in $queryRaw/$executeRaw.
 */
export function table(name: string): Prisma.Sql {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,62}$/.test(name)) throw new Error("invalid table name");
  return Prisma.raw(`"${dbSchema()}"."${name}"`);
}
