"use client";
import Link from "@/components/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { api, ApiClientError, errorMessage } from "@/lib/api";
import { signalNavigation } from "@/components/navigation-progress";

function safeNext(n: string | null) {
  // only same-site relative paths
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/account";
}

export function AuthForm({ mode }: { mode: "sign-in" | "register" }) {
  const router = useRouter();
  const sp = useSearchParams();
  const next = safeNext(sp.get("next"));
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body =
      mode === "register"
        ? {
            name: String(f.get("name") ?? ""),
            email: String(f.get("email") ?? ""),
            password: String(f.get("password") ?? ""),
          }
        : { email: String(f.get("email") ?? ""), password: String(f.get("password") ?? "") };
    setPending(true);
    setError(null);
    setFieldErrors({});
    try {
      await api(mode === "register" ? "/api/auth/register" : "/api/auth/login", { body });
      await qc.invalidateQueries();
      // no router.refresh(): it can cancel the in-flight navigation, and session state is client-side
      signalNavigation();
      router.push(next);
    } catch (err) {
      const fe =
        (err instanceof ApiClientError &&
          (err.details as { fieldErrors?: Record<string, string[]> })?.fieldErrors) ||
        null;
      if (fe)
        setFieldErrors(Object.fromEntries(Object.entries(fe).map(([k, v]) => [k, v[0] ?? ""])));
      else setError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {error && (
        <p role="alert" className="bg-danger-soft px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}
      {mode === "register" && (
        <Field label="Name" htmlFor="name" error={fieldErrors.name}>
          <Input
            id="name"
            name="name"
            autoComplete="name"
            required
            aria-invalid={!!fieldErrors.name}
          />
        </Field>
      )}
      <Field label="Email" htmlFor="email" error={fieldErrors.email}>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          aria-invalid={!!fieldErrors.email}
        />
      </Field>
      <Field
        label="Password"
        htmlFor="password"
        error={fieldErrors.password}
        hint={mode === "register" ? "At least 10 characters." : undefined}
      >
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete={mode === "register" ? "new-password" : "current-password"}
          required
          minLength={mode === "register" ? 10 : undefined}
          aria-invalid={!!fieldErrors.password}
        />
      </Field>
      <Button type="submit" size="lg" className="w-full" loading={pending}>
        {mode === "register" ? "Create account" : "Sign in"}
      </Button>
      <p className="text-center text-sm text-muted-foreground">
        {mode === "register" ? (
          <>
            Already have an account?{" "}
            <Link
              href={`/sign-in?next=${encodeURIComponent(next)}`}
              className="text-foreground underline underline-offset-4"
            >
              Sign in
            </Link>
          </>
        ) : (
          <>
            New to Trestle?{" "}
            <Link
              href={`/register?next=${encodeURIComponent(next)}`}
              className="text-foreground underline underline-offset-4"
            >
              Create an account
            </Link>
          </>
        )}
      </p>
    </form>
  );
}
