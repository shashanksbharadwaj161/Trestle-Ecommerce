"use client";
import Link from "@/components/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RequireAuth } from "@/components/require-auth";
import { Container, EmptyState, ErrorState, PageHeader } from "@/components/states";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api, errorMessage } from "@/lib/api";
import { dateTime } from "@/lib/format";

interface Msg {
  id: string;
  name: string;
  email: string;
  topic: string;
  orderRef: string | null;
  message: string;
  handled: boolean;
  createdAt: string;
}

export default function AdminMessages() {
  return <RequireAuth role="ADMIN">{() => <Inner />}</RequireAuth>;
}

function Inner() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["admin-messages"],
    queryFn: () => api<{ items: Msg[] }>("/api/admin/messages"),
  });
  const m = useMutation({
    mutationFn: ({ id, handled }: { id: string; handled: boolean }) =>
      api(`/api/admin/messages/${id}`, { method: "PATCH", body: { handled } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-messages"] }),
  });
  return (
    <Container className="max-w-4xl">
      <PageHeader
        title="Messages"
        description="From the contact form. Reply from your own mailbox."
      />
      {q.isLoading ? (
        <Skeleton className="h-64" />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} retry={() => q.refetch()} />
      ) : q.data!.items.length === 0 ? (
        <EmptyState title="No messages yet" />
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {q.data!.items.map((x) => (
            <li key={x.id} className="py-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm">
                  <Badge tone={x.handled ? "neutral" : "warning"}>
                    {x.handled ? "Handled" : "New"}
                  </Badge>
                  <span className="font-medium">{x.name}</span>
                  <a href={`mailto:${x.email}`} className="text-muted-foreground underline">
                    {x.email}
                  </a>
                  <span className="text-muted-foreground">· {x.topic}</span>
                  {x.orderRef && (
                    <Link
                      href={`/admin/orders?q=${encodeURIComponent(x.orderRef)}`}
                      className="text-muted-foreground underline"
                    >
                      {x.orderRef}
                    </Link>
                  )}
                </div>
                <span className="text-xs text-muted-foreground">{dateTime(x.createdAt)}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{x.message}</p>
              <Button
                size="sm"
                variant="ghost"
                className="mt-2"
                onClick={() => m.mutate({ id: x.id, handled: !x.handled })}
              >
                Mark as {x.handled ? "new" : "handled"}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </Container>
  );
}
