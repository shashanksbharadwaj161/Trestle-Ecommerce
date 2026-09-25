"use client";
import { CryptoProviders } from "@/components/crypto-providers";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BadgeCheck } from "lucide-react";
import { toast } from "sonner";
import { RequireAuth } from "@/components/require-auth";
import { Container, EmptyState, ErrorState, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AddressLink, ChainBadge } from "@/components/chain";
import { TxSteps } from "@/components/tx-steps";
import { useExecuteCalls, type TxCall } from "@/hooks/use-tx";
import { api, errorMessage } from "@/lib/api";

interface S {
  id: string;
  storefrontName: string;
  slug: string;
  verified: boolean;
  payoutChainId: number;
  payoutAddress: string;
  onchainSellerRole: boolean | null;
  _count: { products: number; orders: number };
}

function SellersAdminPageInner() {
  return <RequireAuth role="ADMIN">{() => <Inner />}</RequireAuth>;
}

function Inner() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-sellers"],
    queryFn: () => api<{ sellers: S[] }>("/api/admin/sellers"),
  });
  const exec = useExecuteCalls();
  const act = useMutation({
    mutationFn: async ({
      sellerId,
      action,
    }: {
      sellerId: string;
      action: "grant" | "verify" | "unverify";
    }) => {
      const res = await api<{ calls?: TxCall[] }>("/api/admin/sellers", {
        body: { sellerId, action },
      });
      if (res.calls) await exec.run(res.calls);
    },
    onSuccess: () => {
      toast.success("Updated");
      qc.invalidateQueries({ queryKey: ["admin-sellers"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <Container>
      <PageHeader
        eyebrow="Admin"
        title="Seller verification"
        description="Verification requires SELLER_ROLE on the authenticity contract of the seller's payout chain — granted by your admin wallet."
      />
      <TxSteps steps={exec.steps} />
      {q.isLoading ? (
        <Skeleton className="h-64" />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} retry={() => q.refetch()} />
      ) : q.data!.sellers.length === 0 ? (
        <EmptyState title="No sellers yet" />
      ) : (
        <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3 font-medium">Storefront</th>
                <th className="p-3 font-medium">Payout</th>
                <th className="p-3 font-medium">On-chain role</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {q.data!.sellers.map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="p-3">
                    <p className="font-medium">{s.storefrontName}</p>
                    <p className="text-xs text-muted-foreground">
                      {s._count.products} products · {s._count.orders} orders
                    </p>
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      <ChainBadge chainId={s.payoutChainId} />
                      <AddressLink chainId={s.payoutChainId} address={s.payoutAddress} />
                    </div>
                  </td>
                  <td className="p-3">
                    {s.onchainSellerRole === null ? (
                      <Badge tone="neutral">unknown</Badge>
                    ) : s.onchainSellerRole ? (
                      <Badge tone="success">SELLER_ROLE</Badge>
                    ) : (
                      <Badge tone="warning">not granted</Badge>
                    )}
                  </td>
                  <td className="p-3">
                    {s.verified ? (
                      <Badge tone="success">
                        <BadgeCheck /> verified
                      </Badge>
                    ) : (
                      <Badge tone="neutral">unverified</Badge>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex justify-end gap-2">
                      {!s.onchainSellerRole && (
                        <Button
                          size="sm"
                          variant="outline"
                          loading={act.isPending}
                          onClick={() => act.mutate({ sellerId: s.id, action: "grant" })}
                        >
                          Grant role
                        </Button>
                      )}
                      {s.onchainSellerRole && !s.verified && (
                        <Button
                          size="sm"
                          loading={act.isPending}
                          onClick={() => act.mutate({ sellerId: s.id, action: "verify" })}
                        >
                          Verify
                        </Button>
                      )}
                      {s.verified && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => act.mutate({ sellerId: s.id, action: "unverify" })}
                        >
                          Unverify
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Container>
  );
}

export default function SellersAdminPage() {
  return (
    <CryptoProviders>
      <SellersAdminPageInner />
    </CryptoProviders>
  );
}
