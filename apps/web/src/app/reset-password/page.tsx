"use client";
import Link from "@/components/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";

function ResetForm() {
  const sp = useSearchParams();
  const [token] = useState(() => sp.get("token") ?? "");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  // keep the token out of the address bar / history once read
  useEffect(() => {
    if (sp.get("token")) window.history.replaceState(null, "", "/reset-password");
  }, [sp]);
  const m = useMutation({
    mutationFn: () => api("/api/auth/password/reset", { body: { token, password } }),
  });
  if (m.isSuccess)
    return (
      <div role="status" className="mt-6">
        <p className="text-sm">
          Your password has been changed and you’ve been signed out everywhere.
        </p>
        <Button asChild className="mt-6">
          <Link href="/sign-in">Sign in</Link>
        </Button>
      </div>
    );
  const mismatch = confirm.length > 0 && confirm !== password;
  return (
    <form
      className="mt-8 space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (!mismatch) m.mutate();
      }}
    >
      <Field label="New password" htmlFor="rp-pw" hint="At least 10 characters.">
        <Input
          id="rp-pw"
          type="password"
          autoComplete="new-password"
          minLength={10}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Field
        label="Confirm new password"
        htmlFor="rp-pw2"
        error={mismatch ? "Passwords don’t match" : undefined}
      >
        <Input
          id="rp-pw2"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={mismatch}
        />
      </Field>
      {!token && (
        <p className="text-sm text-danger">This page needs the link from your reset email.</p>
      )}
      {m.isError && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(m.error)}{" "}
          <Link href="/forgot-password" className="underline">
            Request a new link
          </Link>
        </p>
      )}
      <Button
        type="submit"
        size="lg"
        className="w-full"
        loading={m.isPending}
        disabled={!token || mismatch}
      >
        Set new password
      </Button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="container-page max-w-md pt-12 md:pt-20">
      <h1 className="text-[2rem] tracking-[-0.03em]">Choose a new password</h1>
      <Suspense>
        <ResetForm />
      </Suspense>
    </div>
  );
}
