"use client";
import Link from "@/components/link";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RequireAuth } from "@/components/require-auth";
import { Container, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";
import { shortAddress } from "@/lib/format";
import type { SessionUser } from "@/hooks/use-session";
import { usePublicConfig } from "@/lib/public-config";

export default function ProfilePage() {
  return (
    <RequireAuth title="Sign in to manage your profile">{(u) => <Profile user={u} />}</RequireAuth>
  );
}

function Profile({ user }: { user: SessionUser }) {
  const { payments } = usePublicConfig();
  const qc = useQueryClient();
  const [name, setName] = useState(user.displayName ?? "");
  const [email, setEmail] = useState(user.email ?? "");
  const [password, setPassword] = useState("");
  const [current, setCurrent] = useState("");
  const saveName = useMutation({
    mutationFn: () => api("/api/account/profile", { method: "PATCH", body: { displayName: name } }),
    onSuccess: () => {
      toast.success("Name updated");
      qc.invalidateQueries({ queryKey: ["session"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const saveCreds = useMutation({
    mutationFn: () =>
      api("/api/account/credentials", {
        body: { email, password, currentPassword: user.hasPassword ? current : undefined },
      }),
    onSuccess: () => {
      toast.success(user.hasPassword ? "Sign-in details updated" : "Email sign-in added");
      setPassword("");
      setCurrent("");
      qc.invalidateQueries({ queryKey: ["session"] });
    },
  });
  return (
    <Container className="max-w-2xl">
      <PageHeader title="Profile & security" />
      <section className="border-t border-border py-8">
        <h2 className="text-[0.9375rem] font-medium">Your name</h2>
        <form
          className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            saveName.mutate();
          }}
        >
          <Field label="Name" htmlFor="pname" className="flex-1">
            <Input
              id="pname"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </Field>
          <Button
            type="submit"
            variant="outline"
            loading={saveName.isPending}
            disabled={!name.trim()}
          >
            Save
          </Button>
        </form>
      </section>

      <section className="border-t border-border py-8">
        <h2 className="text-[0.9375rem] font-medium">
          {user.hasPassword ? "Email & password" : "Add email sign-in"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {user.hasPassword
            ? "Change the email or password you sign in with."
            : "You sign in with your wallet. Add an email and password to sign in without it."}
        </p>
        <form
          className="mt-5 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            saveCreds.mutate();
          }}
        >
          <Field label="Email" htmlFor="cemail">
            <Input
              id="cemail"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </Field>
          {user.hasPassword && (
            <Field label="Current password" htmlFor="cur">
              <Input
                id="cur"
                type="password"
                value={current}
                onChange={(e) => setCurrent(e.target.value)}
                autoComplete="current-password"
                required
              />
            </Field>
          )}
          <Field
            label={user.hasPassword ? "New password" : "Password"}
            htmlFor="npw"
            hint="At least 10 characters."
          >
            <Input
              id="npw"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              minLength={10}
              required
            />
          </Field>
          {saveCreds.isError && (
            <p role="alert" className="text-sm text-danger">
              {errorMessage(saveCreds.error)}
            </p>
          )}
          <Button type="submit" loading={saveCreds.isPending}>
            {user.hasPassword ? "Update sign-in details" : "Add email sign-in"}
          </Button>
        </form>
      </section>

      {(payments.crypto || user.walletAddress) && (
        <section className="border-t border-border py-8">
          <h2 className="text-[0.9375rem] font-medium">Wallet</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {user.walletAddress ? (
              <>
                Linked: <span className="font-mono">{shortAddress(user.walletAddress)}</span>. Used
                for stablecoin escrow, reputation and loyalty.
              </>
            ) : (
              "No wallet linked. You only need one to pay with stablecoins."
            )}
          </p>
          <Link
            href="/account/wallet"
            className="mt-3 inline-block text-sm underline underline-offset-4"
          >
            {user.walletAddress ? "Wallet & escrow" : "Link a wallet"}
          </Link>
        </section>
      )}

      <DeleteAccount hasPassword={user.hasPassword} />
    </Container>
  );
}

function DeleteAccount({ hasPassword }: { hasPassword: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState("");
  const del = useMutation({
    mutationFn: () =>
      api("/api/account", { method: "DELETE", body: { password: hasPassword ? pw : undefined } }),
    onSuccess: async () => {
      await qc.invalidateQueries();
      toast.success("Your account has been deleted");
      window.location.assign("/");
    },
  });
  return (
    <section className="border-t border-border py-8">
      <h2 className="text-[0.9375rem] font-medium">Delete account</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Removes your account, saved wishlist and bag. Accounts with orders or other records we must
        keep can’t be deleted here — contact us instead.
      </p>
      {!open ? (
        <Button type="button" variant="outline" className="mt-4" onClick={() => setOpen(true)}>
          Delete my account…
        </Button>
      ) : (
        <form
          className="mt-4 space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            del.mutate();
          }}
        >
          {del.isError && (
            <p role="alert" className="bg-danger-soft px-4 py-3 text-sm text-danger">
              {errorMessage(del.error)}
            </p>
          )}
          {hasPassword && (
            <Field label="Confirm with your password" htmlFor="delpw">
              <Input
                id="delpw"
                type="password"
                autoComplete="current-password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                required
              />
            </Field>
          )}
          <div className="flex gap-2">
            <Button type="submit" loading={del.isPending} disabled={hasPassword && !pw}>
              Permanently delete account
            </Button>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
