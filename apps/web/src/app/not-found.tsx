import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="container-page max-w-xl py-24 text-center md:py-32">
      <p className="eyebrow text-muted-foreground">404</p>
      <h1 className="mt-3 text-[2rem] tracking-[-0.03em]">We can’t find that page</h1>
      <p className="mt-3 text-sm text-muted-foreground">It may have moved, or the product is no longer available.</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button asChild>
          <Link href="/new">See what’s new</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/help">Help centre</Link>
        </Button>
      </div>
    </div>
  );
}
