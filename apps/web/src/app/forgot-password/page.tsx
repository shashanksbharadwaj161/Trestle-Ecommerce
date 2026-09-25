"use client";
import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const status = useQuery({ queryKey: ["pw-reset-available"], queryFn: () => api<{ available: boolean }>("/api/auth/password/forgot") });
  const m = useMutation({ mutationFn: () => api<{ message: string }>("/api/auth/password/forgot", { body: { email } }) });
  return (
    <div className="container-page max-w-md pt-12 md:pt-20">
      <h1 className="text-[2rem] tracking-[-0.03em]">Reset your password</h1>
      {status.data && !status.data.available ? (
        <p className="mt-4 text-sm text-muted-foreground">
          Password reset by email isn’t available on this store yet.{" "}
          <Link href="/contact?topic=Other" className="text-foreground underline underline-offset-4">
            Contact us
          </Link>{" "}
          and we’ll help you get back in.
        </p>
      ) : m.isSuccess ? (
        <p role="status" className="mt-6 border border-border p-5 text-sm">
          {m.data.message}
        </p>
      ) : (
        <form
          className="mt-8 space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate();
          }}
        >
          <p className="text-sm text-muted-foreground">Enter the email you sign in with and we’ll send you a reset link.</p>
          <Field label="Email" htmlFor="fp-email">
            <Input id="fp-email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          {m.isError && (
            <p role="alert" className="text-sm text-danger">
              {errorMessage(m.error)}
            </p>
          )}
          <Button type="submit" size="lg" className="w-full" loading={m.isPending}>
            Send reset link
          </Button>
        </form>
      )}
      <p className="mt-8 text-sm">
        <Link href="/sign-in" className="underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
