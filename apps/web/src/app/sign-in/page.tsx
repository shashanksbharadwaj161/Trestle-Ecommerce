import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthForm } from "./auth-form";

export const metadata: Metadata = { title: "Sign in" };

export default function SignInPage() {
  return (
    <div className="container-page max-w-md pt-12 md:pt-20">
      <h1 className="text-[2rem] tracking-[-0.03em]">Sign in</h1>
      <p className="mt-2 text-sm text-muted-foreground">See your orders, returns and wishlist.</p>
      <div className="mt-8">
        <Suspense>
          <AuthForm mode="sign-in" />
        </Suspense>
      </div>
      <div className="mt-10 border-t border-border pt-6 text-[0.8125rem] text-muted-foreground">
        <p>
          <Link href="/forgot-password" className="text-foreground underline underline-offset-4">
            Forgot your password?
          </Link>
        </p>
        <p className="mt-3">
          Paying with stablecoins? You can also{" "}
          <Link href="/account/wallet" className="text-foreground underline underline-offset-4">
            sign in with your wallet
          </Link>
          .
        </p>
      </div>
    </div>
  );
}
