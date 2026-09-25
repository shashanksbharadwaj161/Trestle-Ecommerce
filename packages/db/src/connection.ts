/** Use the official Supabase/Vercel integration without copying its secrets. */
export function configureDatabaseEnvironment() {
  const integrated = process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL;
  if (!process.env.DATABASE_URL && integrated) {
    const url = new URL(integrated);
    url.searchParams.set("schema", "trestle");
    // Supavisor's transaction pooler multiplexes client connections, so a few per function instance let a
    // page's parallel catalogue queries actually run in parallel (1 serialised every query behind the others).
    url.searchParams.set("connection_limit", "5");
    // fail fast instead of hanging a request when the pool or the database is unreachable
    url.searchParams.set("pool_timeout", "10");
    url.searchParams.set("connect_timeout", "10");
    url.searchParams.set("pgbouncer", "true");
    url.searchParams.set("sslmode", "require");
    process.env.DATABASE_URL = url.toString();
  }
  if (!process.env.DIRECT_URL && integrated) {
    // The session pooler is IPv4-compatible; the direct Supabase host may be IPv6-only.
    const url = new URL(integrated);
    url.port = "5432";
    url.searchParams.delete("pgbouncer");
    url.searchParams.set("schema", "trestle");
    url.searchParams.set("sslmode", "require");
    process.env.DIRECT_URL = url.toString();
  }
}
configureDatabaseEnvironment();
