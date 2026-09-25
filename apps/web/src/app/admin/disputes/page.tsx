"use client";
import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Gavel, Scale } from "lucide-react";
import { toast } from "sonner";
import { RequireAuth } from "@/components/require-auth";
import { Container, EmptyState, ErrorState, Notice, PageHeader } from "@/components/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Field, Textarea } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChainBadge, TxLink } from "@/components/chain";
import { TxSteps } from "@/components/tx-steps";
import { useExecuteCalls, type TxCall } from "@/hooks/use-tx";
import { api, errorMessage } from "@/lib/api";
import { dateTime, shortAddress, usd } from "@/lib/format";

interface D {
  id: string;
  status: string;
  reason: string;
  evidence: string | null;
  raisedByAddress: string;
  raiseTxHash: string | null;
  resolveTxHash: string | null;
  buyerShareBps: number | null;
  resolutionNotes: string | null;
  createdAt: string;
  resolvedAt: string | null;
  order: {
    id: string;
    status: string;
    subtotalUsdMicros: string;
    escrowChainId: number | null;
    escrowContractOrderId: string | null;
    buyerAccount: string | null;
    isSeedDemo: boolean;
    items: { titleSnapshot: string; quantity: number }[];
    buyer: {
      displayName: string | null;
      walletAddress: string;
      reputationScoreCache: string | null;
    };
    seller: {
      storefrontName: string;
      payoutAddress: string;
      verified: boolean;
      user: { reputationScoreCache: string | null };
    };
  };
}

export default function DisputesPage() {
  return <RequireAuth role="ADMIN">{() => <Queue />}</RequireAuth>;
}

function Queue() {
  const [status, setStatus] = useState<"OPEN" | "RESOLVED" | "ALL">("OPEN");
  const q = useQuery({
    queryKey: ["disputes", status],
    queryFn: () => api<{ disputes: D[] }>(`/api/disputes?status=${status}`),
  });
  return (
    <Container>
      <PageHeader
        eyebrow="Admin"
        title="Arbitration queue"
        description="Resolve frozen escrows. Your wallet signs resolveDispute with ARBITER_ROLE; the split is enforced by the escrow contract."
      />
      <Tabs value={status} onValueChange={(v) => setStatus(v as typeof status)} className="mb-4">
        <TabsList>
          <TabsTrigger value="OPEN">Open</TabsTrigger>
          <TabsTrigger value="RESOLVED">Resolved</TabsTrigger>
          <TabsTrigger value="ALL">All</TabsTrigger>
        </TabsList>
      </Tabs>
      {q.isLoading ? (
        <Skeleton className="h-72" />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} retry={() => q.refetch()} />
      ) : q.data!.disputes.length === 0 ? (
        <EmptyState
          icon={<Scale className="size-5" />}
          title={status === "OPEN" ? "No open disputes" : "Nothing here"}
          description="Disputes raised by buyers or sellers appear here with the frozen escrow."
        />
      ) : (
        <div className="space-y-4">
          {q.data!.disputes.map((d) => (
            <Case key={d.id} d={d} />
          ))}
        </div>
      )}
    </Container>
  );
}

function Case({ d }: { d: D }) {
  const qc = useQueryClient();
  const [share, setShare] = useState(100);
  const [notes, setNotes] = useState("");
  const exec = useExecuteCalls();
  const resolve = useMutation({
    mutationFn: async () => {
      const res = await api<{ calls: TxCall[] }>(`/api/disputes/${d.id}/resolve`, {
        body: { buyerShareBps: share * 100, notes },
      });
      await exec.run(res.calls);
    },
    onSuccess: () => {
      toast.success("Dispute resolved on-chain");
      qc.invalidateQueries({ queryKey: ["disputes"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const amount = BigInt(d.order.subtotalUsdMicros);
  const buyerGets = (amount * BigInt(share)) / 100n;
  const open = d.status === "OPEN";
  return (
    <Card className={open ? "border-danger/30" : undefined}>
      <CardHeader className="flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Gavel className="size-4" aria-hidden />{" "}
            {d.order.items.map((i) => i.titleSnapshot).join(", ")}
          </CardTitle>
          <CardDescription>
            <Link href={`/orders/${d.order.id}`} className="font-mono hover:underline">
              {d.order.id.slice(0, 14)}
            </Link>{" "}
            · {usd(d.order.subtotalUsdMicros)} · filed {dateTime(d.createdAt)}
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ChainBadge chainId={d.order.escrowChainId} />
          <Badge tone={open ? (d.raiseTxHash ? "danger" : "warning") : "success"}>
            {open ? (d.raiseTxHash ? "Escrow frozen" : "Not yet on-chain") : "Resolved"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3 text-sm">
          <p className="rounded-lg bg-muted p-3">“{d.reason}”</p>
          {d.evidence && <p className="text-muted-foreground">Evidence: {d.evidence}</p>}
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <dt className="text-muted-foreground">Buyer</dt>
            <dd>
              {d.order.buyer.displayName ?? shortAddress(d.order.buyer.walletAddress)} · rep{" "}
              {d.order.buyer.reputationScoreCache
                ? Number(d.order.buyer.reputationScoreCache).toFixed(1)
                : "—"}
            </dd>
            <dt className="text-muted-foreground">Seller</dt>
            <dd>
              {d.order.seller.storefrontName} {d.order.seller.verified && "✓"} · rep{" "}
              {d.order.seller.user.reputationScoreCache
                ? Number(d.order.seller.user.reputationScoreCache).toFixed(1)
                : "—"}
            </dd>
            <dt className="text-muted-foreground">Raised by</dt>
            <dd className="font-mono">{shortAddress(d.raisedByAddress)}</dd>
            <dt className="text-muted-foreground">Raise tx</dt>
            <dd>
              <TxLink chainId={d.order.escrowChainId} hash={d.raiseTxHash} />
            </dd>
            <dt className="text-muted-foreground">Escrow</dt>
            <dd>#{d.order.escrowContractOrderId ?? "—"}</dd>
          </dl>
        </div>
        {open ? (
          d.raiseTxHash ? (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                resolve.mutate();
              }}
            >
              <div>
                <label htmlFor={`share-${d.id}`} className="text-sm font-medium">
                  Refund to buyer: {share}%
                </label>
                <input
                  id={`share-${d.id}`}
                  type="range"
                  min={0}
                  max={100}
                  step={5}
                  value={share}
                  onChange={(e) => setShare(Number(e.target.value))}
                  className="mt-2 w-full accent-[var(--primary)]"
                  aria-valuetext={`${share}% to buyer`}
                />
                <div className="mt-1 flex justify-between text-xs text-muted-foreground">
                  <span>Buyer ≈ {usd(buyerGets)}</span>
                  <span>Seller ≈ {usd(amount - buyerGets)}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {[
                    ["Full refund", 100],
                    ["Split 50/50", 50],
                    ["Release to seller", 0],
                  ].map(([l, v]) => (
                    <Button
                      key={l}
                      type="button"
                      size="sm"
                      variant={share === v ? "secondary" : "ghost"}
                      onClick={() => setShare(v as number)}
                    >
                      {l}
                    </Button>
                  ))}
                </div>
              </div>
              <Field
                label="Resolution notes"
                htmlFor={`notes-${d.id}`}
                hint="Shared with both parties"
              >
                <Textarea
                  id={`notes-${d.id}`}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  required
                  minLength={5}
                />
              </Field>
              <TxSteps steps={exec.steps} />
              <Button type="submit" loading={resolve.isPending} disabled={notes.trim().length < 5}>
                Sign resolution
              </Button>
            </form>
          ) : (
            <Notice tone="warning">
              The party has filed the case but hasn&apos;t confirmed the on-chain dispute yet;
              escrow is not frozen.
            </Notice>
          )
        ) : (
          <div className="space-y-2 text-sm">
            <p className="font-medium">
              {d.buyerShareBps === 10_000
                ? "Full refund to buyer"
                : d.buyerShareBps === 0
                  ? "Released to seller"
                  : `${(d.buyerShareBps ?? 0) / 100}% to buyer`}
            </p>
            {d.resolutionNotes && <p className="text-muted-foreground">{d.resolutionNotes}</p>}
            <p className="text-xs">
              Resolved {dateTime(d.resolvedAt)} ·{" "}
              <TxLink chainId={d.order.escrowChainId} hash={d.resolveTxHash} />
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
