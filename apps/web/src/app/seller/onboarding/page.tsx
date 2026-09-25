"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { RequireAuth } from "@/components/require-auth";
import { Container, ErrorState, Notice, PageHeader } from "@/components/states";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { api, ApiClientError, errorMessage } from "@/lib/api";

interface Resp {
  seller: null | {
    storefrontName: string;
    slug: string;
    bio: string;
    payoutChainId: number;
    payoutToken: string;
    payoutAddress: string;
    verified: boolean;
  };
  options: { chainId: number; chainName: string; tokens: { address: string; symbol: string }[] }[];
  wallet: string;
}

export default function OnboardingPage() {
  return <RequireAuth title="Sign in to open a storefront">{() => <Onboarding />}</RequireAuth>;
}

function Onboarding() {
  const router = useRouter();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["onboarding"],
    queryFn: () => api<Resp>("/api/seller/onboarding"),
  });
  const [form, setForm] = useState({
    storefrontName: "",
    slug: "",
    bio: "",
    payoutChainId: 0,
    payoutToken: "",
    payoutAddress: "",
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (!q.data) return;
    const s = q.data.seller;
    const first = q.data.options.at(-1);
    setForm({
      storefrontName: s?.storefrontName ?? "",
      slug: s?.slug ?? "",
      bio: s?.bio ?? "",
      payoutChainId: s?.payoutChainId ?? first?.chainId ?? 0,
      payoutToken: s?.payoutToken ?? first?.tokens[0]?.address ?? "",
      payoutAddress: s?.payoutAddress ?? q.data.wallet,
    });
  }, [q.data]);

  const save = useMutation({
    mutationFn: () =>
      api("/api/seller/onboarding", {
        body: { ...form, payoutAddress: form.payoutAddress || undefined },
      }),
    onSuccess: async () => {
      toast.success(
        q.data?.seller ? "Storefront updated" : "Storefront created — welcome to Trestle!",
      );
      await qc.invalidateQueries();
      if (!q.data?.seller) router.push("/seller/products");
    },
    onError: (err) => {
      if (
        err instanceof ApiClientError &&
        err.details &&
        typeof err.details === "object" &&
        "fieldErrors" in err.details
      ) {
        setErrors((err.details as { fieldErrors: Record<string, string[]> }).fieldErrors);
      }
      toast.error(errorMessage(err));
    },
  });

  if (q.isLoading)
    return (
      <Container>
        <Skeleton className="h-96 max-w-2xl" />
      </Container>
    );
  if (q.isError)
    return (
      <Container>
        <ErrorState message={errorMessage(q.error)} retry={() => q.refetch()} />
      </Container>
    );
  const chain = q.data!.options.find((o) => o.chainId === form.payoutChainId);
  const err = (k: string) => errors[k]?.[0];

  return (
    <Container className="max-w-3xl">
      <PageHeader
        eyebrow="Seller"
        title={q.data!.seller ? "Storefront settings" : "Open your storefront"}
        description="Choose where you get paid. Buyers can pay from any supported chain — you always receive this stablecoin on this chain."
        actions={
          q.data!.seller && (
            <Badge tone={q.data!.seller.verified ? "success" : "warning"}>
              {q.data!.seller.verified ? "Verified seller" : "Pending verification"}
            </Badge>
          )
        }
      />
      <Card>
        <CardContent className="pt-5">
          <form
            className="grid gap-5 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              setErrors({});
              save.mutate();
            }}
          >
            <Field label="Storefront name" htmlFor="s-name" error={err("storefrontName")}>
              <Input
                id="s-name"
                value={form.storefrontName}
                onChange={(e) => setForm({ ...form, storefrontName: e.target.value })}
                required
                minLength={3}
                maxLength={60}
              />
            </Field>
            <Field
              label="Storefront URL"
              htmlFor="s-slug"
              hint="Lowercase letters, digits and dashes"
              error={err("slug")}
            >
              <Input
                id="s-slug"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
                required
                pattern="[a-z0-9-]{3,40}"
              />
            </Field>
            <Field label="Bio" htmlFor="s-bio" className="sm:col-span-2" error={err("bio")}>
              <Textarea
                id="s-bio"
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                maxLength={600}
              />
            </Field>
            <Field label="Payout chain" htmlFor="s-chain" error={err("payoutChainId")}>
              <Select
                id="s-chain"
                value={form.payoutChainId}
                onChange={(e) => {
                  const id = Number(e.target.value);
                  const opt = q.data!.options.find((o) => o.chainId === id);
                  setForm({
                    ...form,
                    payoutChainId: id,
                    payoutToken: opt?.tokens[0]?.address ?? "",
                  });
                }}
              >
                {q.data!.options.map((o) => (
                  <option key={o.chainId} value={o.chainId}>
                    {o.chainName}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Payout stablecoin" htmlFor="s-token" error={err("payoutToken")}>
              <Select
                id="s-token"
                value={form.payoutToken}
                onChange={(e) => setForm({ ...form, payoutToken: e.target.value })}
              >
                {chain?.tokens.map((t) => (
                  <option key={t.address} value={t.address}>
                    {t.symbol}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Payout address"
              htmlFor="s-addr"
              className="sm:col-span-2"
              hint="Receives escrow releases and signs certificate mints. Defaults to your connected wallet."
              error={err("payoutAddress")}
            >
              <Input
                id="s-addr"
                className="font-mono"
                value={form.payoutAddress}
                onChange={(e) => setForm({ ...form, payoutAddress: e.target.value })}
                pattern="0x[0-9a-fA-F]{40}"
              />
            </Field>
            {q.data!.seller &&
              (form.payoutAddress !== q.data!.seller.payoutAddress ||
                form.payoutChainId !== q.data!.seller.payoutChainId) && (
                <Notice tone="warning" className="sm:col-span-2">
                  Changing where you get paid resets your verification until an admin re-verifies
                  it.
                </Notice>
              )}
            <div className="flex justify-end sm:col-span-2">
              <Button type="submit" loading={save.isPending}>
                {q.data!.seller ? "Save changes" : "Create storefront"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </Container>
  );
}
