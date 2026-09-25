"use client";
import Link from "@/components/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";

const TABS = [
  { href: "/seller/products", label: "Products" },
  { href: "/seller/orders", label: "Orders" },
  { href: "/seller/analytics", label: "Analytics" },
  { href: "/seller/onboarding", label: "Storefront settings" },
];

export function SellerNav() {
  const path = usePathname();
  return (
    <div className="border-b border-border bg-muted/30">
      <nav
        aria-label="Seller dashboard"
        className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6"
      >
        {TABS.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            aria-current={path === t.href ? "page" : undefined}
            className={cn(
              "whitespace-nowrap border-b-2 px-3 py-3 text-sm",
              path === t.href
                ? "border-primary font-medium text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}
