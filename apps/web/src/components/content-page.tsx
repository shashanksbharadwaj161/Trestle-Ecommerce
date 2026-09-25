import Link from "next/link";
import { HELP_LINKS } from "@/lib/nav";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { cn } from "@/lib/cn";

/** Help-centre style layout for policy and guide pages. */
export function ContentPage({
  title,
  intro,
  current,
  children,
  ownerContent,
}: {
  title: string;
  intro?: React.ReactNode;
  current: string;
  children: React.ReactNode;
  /** marks pages whose wording must be replaced by the store owner */
  ownerContent?: boolean;
}) {
  return (
    <div className="container-page pt-6 md:pt-8">
      <Breadcrumb items={[{ label: "Home", href: "/" }, { label: "Help", href: "/help" }, { label: title }]} />
      <div className="mt-8 grid gap-10 md:mt-12 md:grid-cols-12">
        <nav aria-label="Help topics" className="min-w-0 md:col-span-3">
          <ul className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:block md:space-y-1 md:px-0">
            {HELP_LINKS.map((l) => (
              <li key={l.href} className="shrink-0">
                <Link
                  href={l.href}
                  aria-current={current === l.href ? "page" : undefined}
                  className={cn(
                    "flex h-9 items-center rounded-full border border-border px-4 text-[0.8125rem] md:h-9 md:rounded-none md:border-0 md:px-0",
                    current === l.href ? "border-foreground text-foreground md:underline md:underline-offset-4" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <article className="min-w-0 md:col-span-8 lg:col-span-7">
          <h1 className="text-[2rem] leading-tight tracking-[-0.03em] md:text-[2.5rem]">{title}</h1>
          {intro && <div className="mt-3 max-w-[60ch] text-[0.9375rem] text-muted-foreground">{intro}</div>}
          {ownerContent && (
            <p className="mt-6 border border-warning/40 bg-warning-soft px-4 py-3 text-[0.8125rem] text-warning">
              Placeholder policy for a demo store. The store owner must replace this text with their own terms before
              selling.
            </p>
          )}
          <div className="prose-trestle mt-8">{children}</div>
        </article>
      </div>
    </div>
  );
}
