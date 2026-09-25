import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "../sign-in/auth-form";

export const metadata: Metadata = { title: "Create an account" };

export default function RegisterPage() {
  return (
    <div className="container-page max-w-md pt-12 md:pt-20">
      <h1 className="text-[2rem] tracking-[-0.03em]">Create an account</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Keep your orders in one place and save your wishlist across devices. You never need an account to check out.
      </p>
      <div className="mt-8">
        <Suspense>
          <AuthForm mode="register" />
        </Suspense>
      </div>
    </div>
  );
}
