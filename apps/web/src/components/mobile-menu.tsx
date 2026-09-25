"use client";
import Link from "@/components/link";
import { Heart, User } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { NAV, HELP_LINKS } from "@/lib/nav";
import { useUi } from "@/store/ui";
import type { HeaderCollection } from "./site-header";

export function MobileMenu({
  collections,
  signedIn,
}: {
  collections: HeaderCollection[];
  signedIn: boolean;
}) {
  const { menuOpen, setMenu } = useUi();
  const close = () => setMenu(false);
  return (
    <Sheet open={menuOpen} onOpenChange={setMenu}>
      <SheetContent side="left" title="Menu">
        <nav aria-label="Mobile" className="px-5">
          <Accordion type="single" collapsible>
            {NAV.map((g) => (
              <AccordionItem key={g.label} value={g.label}>
                <AccordionTrigger className="eyebrow text-[0.75rem]">{g.label}</AccordionTrigger>
                <AccordionContent>
                  <ul className="space-y-1">
                    {g.links.map((l) => (
                      <li key={l.href}>
                        <Link
                          href={l.href}
                          onClick={close}
                          className="flex h-10 items-center text-[0.9375rem] text-foreground"
                        >
                          {l.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </AccordionContent>
              </AccordionItem>
            ))}
            <AccordionItem value="collections">
              <AccordionTrigger className="eyebrow text-[0.75rem]">Collections</AccordionTrigger>
              <AccordionContent>
                <ul className="space-y-1">
                  {collections.map((c) => (
                    <li key={c.slug}>
                      <Link
                        href={`/collections/${c.slug}`}
                        onClick={close}
                        className="flex h-10 items-center text-[0.9375rem] text-foreground"
                      >
                        {c.title}
                      </Link>
                    </li>
                  ))}
                  <li>
                    <Link
                      href="/collections"
                      onClick={close}
                      className="flex h-10 items-center text-[0.9375rem] text-foreground"
                    >
                      All collections
                    </Link>
                  </li>
                </ul>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
          <Link
            href="/new"
            onClick={close}
            className="eyebrow flex h-14 items-center border-b border-border text-[0.75rem]"
          >
            New in
          </Link>
          <div className="mt-6 space-y-1">
            <Link
              href={signedIn ? "/account" : "/sign-in"}
              onClick={close}
              className="flex h-11 items-center gap-3 text-[0.9375rem]"
            >
              <User className="size-5" strokeWidth={1.5} />{" "}
              {signedIn ? "Your account" : "Sign in / Create account"}
            </Link>
            <Link
              href="/wishlist"
              onClick={close}
              className="flex h-11 items-center gap-3 text-[0.9375rem]"
            >
              <Heart className="size-5" strokeWidth={1.5} /> Wishlist
            </Link>
          </div>
          <ul className="mb-10 mt-6 space-y-1 border-t border-border pt-6">
            {HELP_LINKS.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  onClick={close}
                  className="flex h-9 items-center text-sm text-muted-foreground"
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </SheetContent>
    </Sheet>
  );
}
