"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Menu, Search, ShoppingBag, X, ShieldCheck } from "lucide-react";
import * as DM from "@radix-ui/react-dropdown-menu";
import { useQueryClient } from "@tanstack/react-query";
import { LogoMark } from "./logo";
import { ThemeToggle } from "./theme-toggle";
import { ConnectWallet } from "./connect";
import { Button } from "@/components/ui/button";
import { useCart } from "@/hooks/use-cart";
import { useSession } from "@/hooks/use-session";
import { useHydrated } from "@/hooks/use-hydrated";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { shortAddress } from "@/lib/format";

const NAV = [
  { href: "/products", label: "Shop" },
  { href: "/admin/transparency", label: "Transparency" },
  { href: "/seller/onboarding", label: "Sell" },
];

function AccountMenu() {
  const { user } = useSession();
  const qc = useQueryClient();
  const hydrated = useHydrated();
  if (!user || !hydrated) return null;
  const items = [
    { href: "/account", label: "Account & orders" },
    { href: "/account/loyalty", label: "Loyalty & staking" },
    ...(user.sellerId ? [{ href: "/seller/products", label: "Seller dashboard" }] : []),
    ...(user.role === "ADMIN"
      ? [
          { href: "/admin/disputes", label: "Arbitration queue" },
          { href: "/admin/sellers", label: "Seller verification" },
        ]
      : []),
  ];
  return (
    <DM.Root>
      <DM.Trigger asChild>
        <Button variant="ghost" size="sm" className="hidden md:inline-flex">
          {user.displayName ?? shortAddress(user.walletAddress)}
          {user.role !== "BUYER" && (
            <span className="rounded bg-primary-soft px-1.5 text-[10px] font-semibold uppercase text-primary">
              {user.role}
            </span>
          )}
        </Button>
      </DM.Trigger>
      <DM.Portal>
        <DM.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-52 rounded-lg border border-border bg-card p-1 shadow-card"
        >
          {items.map((i) => (
            <DM.Item key={i.href} asChild>
              <Link
                href={i.href}
                className="block rounded-md px-3 py-2 text-sm outline-none data-[highlighted]:bg-muted"
              >
                {i.label}
              </Link>
            </DM.Item>
          ))}
          <DM.Separator className="my-1 h-px bg-border" />
          <DM.Item
            className="cursor-pointer rounded-md px-3 py-2 text-sm text-danger outline-none data-[highlighted]:bg-muted"
            onSelect={async () => {
              await api("/api/auth/logout", { body: {} });
              await qc.invalidateQueries();
            }}
          >
            Sign out
          </DM.Item>
        </DM.Content>
      </DM.Portal>
    </DM.Root>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const router = useRouter();
  const { count: rawCount } = useCart();
  const { user: rawUser } = useSession();
  const hydrated = useHydrated();
  const count = hydrated ? rawCount : 0;
  const user = hydrated ? rawUser : null;
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold tracking-tight"
          aria-label="Trestle home"
        >
          <LogoMark />
          <span className="text-lg">Trestle</span>
        </Link>
        <nav aria-label="Main" className="ml-4 hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={cn(
                "rounded-md px-3 py-2 text-sm text-muted-foreground hover:text-foreground",
                pathname.startsWith(n.href) && "text-foreground font-medium",
              )}
              aria-current={pathname.startsWith(n.href) ? "page" : undefined}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <form
          role="search"
          className="ml-auto hidden max-w-xs flex-1 lg:block"
          onSubmit={(e) => {
            e.preventDefault();
            router.push(`/products${q ? `?q=${encodeURIComponent(q)}` : ""}`);
          }}
        >
          <label htmlFor="site-search" className="sr-only">
            Search products
          </label>
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <input
              id="site-search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search watches, sneakers…"
              className="h-9 w-full rounded-lg border border-input bg-card pl-9 pr-3 text-sm placeholder:text-muted-foreground"
            />
          </div>
        </form>
        <div className="ml-auto flex items-center gap-1 lg:ml-2">
          <ThemeToggle />
          <Button variant="ghost" size="icon" asChild>
            <Link
              href="/cart"
              aria-label={`Cart, ${count} item${count === 1 ? "" : "s"}`}
              className="relative"
            >
              <ShoppingBag />
              {count > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-white dark:text-black">
                  {count}
                </span>
              )}
            </Link>
          </Button>
          <AccountMenu />
          <div className="hidden sm:block">
            <ConnectWallet size="sm" />
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </Button>
        </div>
      </div>
      {open && (
        <div className="border-t border-border bg-background md:hidden">
          <nav aria-label="Mobile" className="mx-auto flex max-w-7xl flex-col px-4 py-3">
            {[
              ...NAV,
              ...(user
                ? [
                    { href: "/account", label: "Account" },
                    { href: "/account/loyalty", label: "Loyalty" },
                  ]
                : []),
              ...(user?.sellerId ? [{ href: "/seller/products", label: "Seller dashboard" }] : []),
              ...(user?.role === "ADMIN"
                ? [{ href: "/admin/disputes", label: "Arbitration" }]
                : []),
            ].map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className="rounded-md px-2 py-2.5 text-sm hover:bg-muted"
              >
                {n.label}
              </Link>
            ))}
            <div className="pt-2 sm:hidden">
              <ConnectWallet size="md" />
            </div>
          </nav>
        </div>
      )}
      {user?.role === "ADMIN" && pathname.startsWith("/admin") && (
        <div className="border-t border-border bg-primary-soft text-primary">
          <p className="mx-auto flex max-w-7xl items-center gap-2 px-4 py-1.5 text-xs sm:px-6">
            <ShieldCheck className="size-3.5" aria-hidden /> Signed in as platform arbiter
          </p>
        </div>
      )}
    </header>
  );
}
