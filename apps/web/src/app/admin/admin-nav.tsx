"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/hooks/use-session";
import { useHydrated } from "@/hooks/use-hydrated";
import { cn } from "@/lib/cn";

const LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/returns", label: "Returns" },
  { href: "/admin/messages", label: "Messages" },
  { href: "/admin/disputes", label: "Escrow disputes" },
  { href: "/admin/sellers", label: "Sellers" },
  { href: "/transparency", label: "Transparency" },
];

export function AdminNav() {
  const path = usePathname();
  const session = useSession();
  const hydrated = useHydrated();
  const user = hydrated ? session.user : null;
  if (user?.role !== "ADMIN") return null;
  return (
    <div className="border-b border-border bg-muted/40">
      <nav aria-label="Admin" className="container-page no-scrollbar flex gap-6 overflow-x-auto">
        <span className="eyebrow flex h-12 shrink-0 items-center text-muted-foreground">Admin</span>
        {LINKS.map((l) => {
          const active = l.href === "/admin" ? path === "/admin" : path.startsWith(l.href);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-12 shrink-0 items-center border-b border-transparent text-[0.8125rem] text-muted-foreground hover:text-foreground",
                active && "border-foreground text-foreground",
              )}
            >
              {l.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
