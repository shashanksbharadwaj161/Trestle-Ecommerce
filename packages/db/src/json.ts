/** Recursively converts bigint → string (and Prisma Decimal → string) so values are JSON-safe. */
export function toJsonSafe<T>(value: T): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => toJsonSafe(v));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const maybeDecimal = value as unknown as {
      toFixed?: unknown;
      d?: unknown;
      s?: unknown;
      e?: unknown;
    };
    if (typeof maybeDecimal.toFixed === "function" && "d" in maybeDecimal && "e" in maybeDecimal) {
      return (value as unknown as { toFixed: () => string }).toFixed();
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = toJsonSafe(v);
    return out;
  }
  return value;
}
