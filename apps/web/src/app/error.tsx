"use client";
import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className="container-page max-w-xl py-24 text-center md:py-32" role="alert">
      <h1 className="text-[2rem] tracking-[-0.03em]">Something went wrong</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        We couldn’t load this page{error.digest ? ` (reference ${error.digest})` : ""}. Please try again.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/">Home</Link>
        </Button>
      </div>
    </div>
  );
}
