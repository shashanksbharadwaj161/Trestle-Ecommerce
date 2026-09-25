import { cn } from "@/lib/cn";

/** Typographic wordmark. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("select-none text-[1.0625rem] font-medium uppercase tracking-[0.34em]", className)}>
      Trestle
    </span>
  );
}

export function LogoMark({ className = "size-7" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" className="fill-foreground" />
      <path d="M9 10h14M16 10v13" className="stroke-background" strokeWidth="2.4" fill="none" />
    </svg>
  );
}
