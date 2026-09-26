"use client";
import Link from "@/components/link";
import { usePathname, useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useSession } from "@/hooks/use-session";
import { useHydrated } from "@/hooks/use-hydrated";
import { cn } from "@/lib/cn";
import { usePublicConfig } from "@/lib/public-config";

const LINKS = [
  { href: "/account", label: "Orders" },
  { href: "/account/profile", label: "Profile & security" },
  { href: "/wishlist", label: "Wishlist" },
  { href: "/account/wallet", label: "Wallet & escrow", crypto: true },
  { href: "/account/loyalty", label: "Loyalty", crypto: true },
];

export function AccountNav() {
  const path = usePathname();
  const session = useSession();
  const hydrated = useHydrated();
  const user = hydrated ? session.user : null;
  const qc = useQueryClient();
  const router = useRouter();
  const { payments } = usePublicConfig();
  // wallet features are listed only where stablecoin payments are live (or the account already uses a wallet)
  const links = LINKS.filter((l) => !l.crypto || payments.crypto || !!user?.walletAddress);
  if (!user) return null;
  return (
    <div className="border-b border-border">
      <nav
        aria-label="Account"
        className="container-page no-scrollbar flex items-center gap-6 overflow-x-auto"
      >
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            aria-current={path === l.href ? "page" : undefined}
            className={cn(
              "flex h-12 shrink-0 items-center border-b border-transparent text-[0.8125rem] text-muted-foreground transition-colors hover:text-foreground",
              path === l.href && "border-foreground text-foreground",
            )}
          >
            {l.label}
          </Link>
        ))}
        {(user.sellerId || user.role === "ADMIN") && (
          <Link
            href={user.role === "ADMIN" ? "/admin" : "/seller/products"}
            className="flex h-12 shrink-0 items-center text-[0.8125rem] text-muted-foreground hover:text-foreground"
          >
            {user.role === "ADMIN" ? "Admin" : "Seller dashboard"}
          </Link>
        )}
        <button
          type="button"
          onClick={async () => {
            await api("/api/auth/logout", { body: {} });
            await qc.invalidateQueries();
            router.push("/");
          }}
          className="ml-auto h-12 shrink-0 text-[0.8125rem] text-muted-foreground hover:text-foreground"
        >
          Sign out
        </button>
      </nav>
    </div>
  );
}
