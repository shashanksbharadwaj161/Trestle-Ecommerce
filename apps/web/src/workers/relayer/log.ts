/** Structured JSON logs (Render captures stdout). */
type Level = "debug" | "info" | "warn" | "error";
const threshold: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const min = threshold[(process.env.LOG_LEVEL as Level) ?? "info"] ?? 20;

function emit(level: Level, msg: string, data?: Record<string, unknown>) {
  if (threshold[level] < min) return;
  const line = JSON.stringify(
    { t: new Date().toISOString(), level, msg, ...data },
    (_k, v) => (typeof v === "bigint" ? v.toString() : v instanceof Error ? v.message : v),
  );
  (level === "error" || level === "warn" ? console.error : console.log)(line);
}

export const log = {
  debug: (m: string, d?: Record<string, unknown>) => emit("debug", m, d),
  info: (m: string, d?: Record<string, unknown>) => emit("info", m, d),
  warn: (m: string, d?: Record<string, unknown>) => emit("warn", m, d),
  error: (m: string, d?: Record<string, unknown>) => emit("error", m, d),
};
