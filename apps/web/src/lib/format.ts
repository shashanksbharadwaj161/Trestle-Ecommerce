import { formatTokenAmount, formatUsdMicros } from "@trestle/shared";

export function usd(
  micros: string | number | bigint | null | undefined,
  opts?: { cents?: boolean },
): string {
  if (micros === null || micros === undefined || micros === "") return "—";
  return formatUsdMicros(BigInt(micros), opts);
}

export function tokenAmount(
  amount: string | bigint | null | undefined,
  decimals: number,
  max = 6,
): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  return formatTokenAmount(BigInt(amount), decimals, max);
}

export function shortAddress(a?: string | null, chars = 4): string {
  if (!a) return "—";
  return `${a.slice(0, 2 + chars)}…${a.slice(-chars)}`;
}

export function shortHash(h?: string | null): string {
  if (!h) return "—";
  return `${h.slice(0, 10)}…${h.slice(-6)}`;
}

const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
export function timeAgo(date: string | Date | null | undefined): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  const s = Math.round((d.getTime() - Date.now()) / 1000);
  const abs = Math.abs(s);
  if (abs < 60) return rtf.format(s, "second");
  if (abs < 3600) return rtf.format(Math.round(s / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(s / 3600), "hour");
  return rtf.format(Math.round(s / 86_400), "day");
}

export function dateTime(date: string | Date | null | undefined): string {
  if (!date) return "—";
  // fixed time zone so server-rendered and hydrated output are identical
  return `${new Date(date).toLocaleString("en", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" })} UTC`;
}

export function duration(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined) return "—";
  if (seconds < 90) return `${Math.round(seconds)}s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} min`;
  return `${(seconds / 3600).toFixed(1)} h`;
}

export function scoreFromWad(wad: string | bigint | null | undefined): number {
  if (wad === null || wad === undefined) return 0;
  return Number(BigInt(wad) / 10n ** 15n) / 1000;
}
