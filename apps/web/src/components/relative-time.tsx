"use client";
import { useEffect, useState } from "react";
import { dateTime, timeAgo } from "@/lib/format";

/**
 * Relative timestamps depend on "now", which differs between server render and hydration. Render the absolute
 * time first (identical on both sides) and switch to relative text after mount, refreshing every 15s.
 */
export function RelativeTime({ date }: { date: string | Date | null | undefined }) {
  const [mounted, setMounted] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => {
    setMounted(true);
    const t = setInterval(() => tick((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);
  if (!date) return <>—</>;
  const iso = typeof date === "string" ? date : date.toISOString();
  return (
    <time dateTime={iso} title={dateTime(iso)}>
      {mounted ? timeAgo(iso) : dateTime(iso)}
    </time>
  );
}
