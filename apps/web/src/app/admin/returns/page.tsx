"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { toast } from "sonner";
import { formatCents } from "@trestle/shared";
import { RequireAuth } from "@/components/require-auth";
import { Container, EmptyState, ErrorState, PageHeader } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ReturnStatusBadge } from "@/components/status-badge";
import { api, errorMessage } from "@/lib/api";
import { dateTime } from "@/lib/format";

interface Ret {
  id: string;
  status: string;
  reason: string;
  notes: string | null;
  adminNotes: string | null;
  refundCents: number | null;
  createdAt: string;
  items: { orderItemId: string; quantity: number }[];
  order: {
    id: string;
    cardPaymentId: string | null;
    items: { id: string; titleSnapshot: string; variantSnapshot: string; quantity: number }[];
    cardPayment: { email: string | null; totalCents: number; refundedCents: number } | null;
  };
}

export default function AdminReturns() {
  return <RequireAuth role="ADMIN">{() => <Inner />}</RequireAuth>;
}

function Inner() {
  const q = useQuery({ queryKey: ["admin-returns"], queryFn: () => api<{ items: Ret[] }>("/api/admin/returns") });
  return (
    <Container className="max-w-5xl">
      <PageHeader title="Returns" description="Approve, receive and refund return requests. Refunds go back through Stripe." />
      {q.isLoading ? (
        <Skeleton className="h-64" />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} retry={() => q.refetch()} />
      ) : q.data!.items.length === 0 ? (
        <EmptyState title="No return requests" />
      ) : (
        <ul className="space-y-4">
          {q.data!.items.map((r) => (
            <ReturnRow key={r.id} r={r} />
          ))}
        </ul>
      )}
    </Container>
  );
}

function ReturnRow({ r }: { r: Ret }) {
  const qc = useQueryClient();
  const [notes, setNotes] = useState(r.adminNotes ?? "");
  const suggested = useQuery({
    queryKey: ["return-suggested", r.id],
    queryFn: () => api<{ suggestedRefundCents: number }>(`/api/admin/returns/${r.id}`),
    enabled: r.status === "RECEIVED" || r.status === "APPROVED",
  });
  const m = useMutation({
    mutationFn: (action: string) => api(`/api/admin/returns/${r.id}`, { body: { action, adminNotes: notes || undefined } }),
    onSuccess: () => {
      toast.success("Return updated");
      qc.invalidateQueries({ queryKey: ["admin-returns"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <li className="border border-border p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ReturnStatusBadge status={r.status} />
          <span className="text-sm">{r.reason}</span>
        </div>
        <span className="text-xs text-muted-foreground">
          {dateTime(r.createdAt)} ·{" "}
          <Link href={`/admin/orders/${r.order.id}`} className="underline">
            {r.order.id}
          </Link>
        </span>
      </div>
      <ul className="mt-3 text-sm">
        {r.items.map((it) => {
          const line = r.order.items.find((x) => x.id === it.orderItemId);
          return (
            <li key={it.orderItemId}>
              {line?.titleSnapshot} · {line?.variantSnapshot} × {it.quantity}
            </li>
          );
        })}
      </ul>
      {r.notes && <p className="mt-2 text-sm text-muted-foreground">“{r.notes}”</p>}
      <p className="mt-2 text-xs text-muted-foreground">{r.order.cardPayment?.email}</p>
      {r.refundCents != null && <p className="mt-2 text-sm">Refunded {formatCents(r.refundCents)}</p>}
      {!["REFUNDED", "REJECTED"].includes(r.status) && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Input aria-label="Notes for the record" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} className="h-9 w-64" />
          {r.status === "REQUESTED" && (
            <Button size="sm" onClick={() => m.mutate("approve")} loading={m.isPending}>
              Approve
            </Button>
          )}
          {r.status === "APPROVED" && (
            <Button size="sm" onClick={() => m.mutate("receive")} loading={m.isPending}>
              Mark received (restock)
            </Button>
          )}
          {(r.status === "RECEIVED" || r.status === "APPROVED") && (
            <Button size="sm" variant="outline" onClick={() => m.mutate("refund")} loading={m.isPending}>
              Refund {suggested.data ? formatCents(suggested.data.suggestedRefundCents) : ""}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => m.mutate("reject")} loading={m.isPending}>
            Decline
          </Button>
        </div>
      )}
    </li>
  );
}
