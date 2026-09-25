import Link from "next/link";
import { cn } from "@/lib/cn";

export function Breadcrumb({
  items,
  className,
}: {
  items: { label: string; href?: string }[];
  className?: string;
}) {
  return (
    <nav aria-label="Breadcrumb" className={cn("text-[0.8125rem] text-muted-foreground", className)}>
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((it, i) => (
          <li key={`${it.label}-${i}`} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden>/</span>}
            {it.href && i < items.length - 1 ? (
              <Link href={it.href} className="hover:text-foreground">
                {it.label}
              </Link>
            ) : (
              <span aria-current={i === items.length - 1 ? "page" : undefined} className="text-foreground">
                {it.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
