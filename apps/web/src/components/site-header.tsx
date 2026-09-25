"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import * as NM from "@radix-ui/react-navigation-menu";
import { Heart, Menu, Search, ShoppingBag, User } from "lucide-react";
import { NAV } from "@/lib/nav";
import { cn } from "@/lib/cn";
import { useCart } from "@/hooks/use-cart";
import { useSession } from "@/hooks/use-session";
import { useHydrated } from "@/hooks/use-hydrated";
import { useUi } from "@/store/ui";
import { Wordmark } from "./logo";
import { SearchOverlay } from "./search-overlay";
import { BagDrawer } from "./bag-drawer";
import { MobileMenu } from "./mobile-menu";

export interface HeaderCollection {
  slug: string;
  title: string;
  image: string | null;
}

const iconBtn =
  "relative grid size-11 place-items-center text-foreground transition-opacity hover:opacity-60";

export function SiteHeader({ collections }: { collections: HeaderCollection[] }) {
  const { count } = useCart();
  const { user } = useSession();
  const hydrated = useHydrated();
  const pathname = usePathname();
  const { setBag, setSearch, setMenu } = useUi();

  // close overlays on navigation
  useEffect(() => {
    setSearch(false);
    setMenu(false);
  }, [pathname, setSearch, setMenu]);

  const feature = collections[0];

  return (
    <>
      <div className="bg-foreground text-background">
        <p className="container-page py-2 text-center text-[0.75rem] tracking-[0.02em]">
          Free standard delivery on orders over $150 ·{" "}
          <Link href="/returns" className="underline underline-offset-2">
            30-day returns
          </Link>
        </p>
      </div>
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85">
        <div className="container-page grid h-14 grid-cols-[1fr_auto_1fr] items-center md:h-16">
          <div className="flex items-center">
            <button
              type="button"
              className={cn(iconBtn, "-ml-3 lg:hidden")}
              aria-label="Open menu"
              onClick={() => setMenu(true)}
            >
              <Menu className="size-5" strokeWidth={1.5} />
            </button>
            <NM.Root className="hidden lg:block" aria-label="Main">
              <NM.List className="flex items-center gap-7">
                {NAV.map((g) => (
                  <NM.Item key={g.label}>
                    <NM.Trigger
                      className={cn(
                        "eyebrow flex h-16 items-center border-b border-transparent transition-colors data-[state=open]:border-foreground",
                        pathname.startsWith(g.href) && "border-foreground",
                      )}
                      onPointerMove={(e) => e.preventDefault()}
                      onPointerLeave={(e) => e.preventDefault()}
                    >
                      {g.label}
                    </NM.Trigger>
                    <NM.Content className="container-page grid grid-cols-[1fr_1fr_1.2fr] gap-10 py-10 animate-slide-down">
                      <div>
                        <p className="eyebrow mb-4 text-muted-foreground">Shop {g.label.toLowerCase()}</p>
                        <ul className="space-y-2.5">
                          {g.links.map((l) => (
                            <li key={l.href}>
                              <NM.Link asChild>
                                <Link href={l.href} className="text-[0.9375rem] hover:underline hover:underline-offset-4">
                                  {l.label}
                                </Link>
                              </NM.Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="eyebrow mb-4 text-muted-foreground">Collections</p>
                        <ul className="space-y-2.5">
                          {collections.map((c) => (
                            <li key={c.slug}>
                              <NM.Link asChild>
                                <Link href={`/collections/${c.slug}`} className="text-[0.9375rem] hover:underline hover:underline-offset-4">
                                  {c.title}
                                </Link>
                              </NM.Link>
                            </li>
                          ))}
                          <li>
                            <NM.Link asChild>
                              <Link href="/collections" className="text-[0.9375rem] text-muted-foreground hover:text-foreground">
                                All collections
                              </Link>
                            </NM.Link>
                          </li>
                        </ul>
                      </div>
                      {feature?.image && (
                        <NM.Link asChild>
                          <Link href={`/collections/${feature.slug}`} className="group relative block aspect-[4/3] overflow-hidden bg-muted">
                            <Image
                              src={feature.image}
                              alt=""
                              fill
                              sizes="400px"
                              className="object-cover object-[50%_30%] transition-transform duration-700 group-hover:scale-[1.03]"
                            />
                            <span className="absolute bottom-3 left-3 bg-background px-3 py-1.5 text-[0.8125rem]">
                              {feature.title}
                            </span>
                          </Link>
                        </NM.Link>
                      )}
                    </NM.Content>
                  </NM.Item>
                ))}
                <NM.Item>
                  <NM.Link asChild active={pathname === "/new"}>
                    <Link href="/new" className="eyebrow flex h-16 items-center border-b border-transparent data-[active]:border-foreground">
                      New in
                    </Link>
                  </NM.Link>
                </NM.Item>
                <NM.Item>
                  <NM.Link asChild active={pathname.startsWith("/collections")}>
                    <Link href="/collections" className="eyebrow flex h-16 items-center border-b border-transparent data-[active]:border-foreground">
                      Collections
                    </Link>
                  </NM.Link>
                </NM.Item>
              </NM.List>
              {/* anchored to the sticky <header> (a positioned ancestor), so it follows the header when scrolled */}
              <div className="absolute inset-x-0 top-full z-40">
                <NM.Viewport className="w-full border-b border-border bg-background shadow-card" />
              </div>
            </NM.Root>
          </div>

          <Link href="/" aria-label="Trestle — home" className="justify-self-center">
            <Wordmark />
          </Link>

          <div className="-mr-3 flex items-center justify-end">
            <button type="button" className={iconBtn} aria-label="Search" onClick={() => setSearch(true)}>
              <Search className="size-5" strokeWidth={1.5} />
            </button>
            <Link href="/wishlist" className={cn(iconBtn, "hidden sm:grid")} aria-label="Wishlist">
              <Heart className="size-5" strokeWidth={1.5} />
            </Link>
            <Link
              href={user ? "/account" : "/sign-in"}
              className={cn(iconBtn, "hidden sm:grid")}
              aria-label={user ? "Your account" : "Sign in"}
            >
              <User className="size-5" strokeWidth={1.5} />
            </Link>
            <button
              type="button"
              className={iconBtn}
              aria-label={`Bag, ${hydrated ? count : 0} item${count === 1 ? "" : "s"}`}
              onClick={() => setBag(true)}
            >
              <ShoppingBag className="size-5" strokeWidth={1.5} />
              {hydrated && count > 0 && (
                <span className="tabular absolute right-1.5 top-1.5 grid min-w-4 place-items-center rounded-full bg-foreground px-1 text-[10px] font-medium leading-4 text-background">
                  {count}
                </span>
              )}
            </button>
          </div>
        </div>
      </header>
      <SearchOverlay />
      <BagDrawer />
      <MobileMenu collections={collections} signedIn={!!user} />
    </>
  );
}
