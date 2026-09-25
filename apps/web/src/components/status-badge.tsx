import { Badge } from "@/components/ui/badge";

const ORDER: Record<
  string,
  {
    label: string;
    tone: "neutral" | "primary" | "success" | "warning" | "danger" | "info" | "accent";
  }
> = {
  PENDING_PAYMENT: { label: "Awaiting payment", tone: "warning" },
  ESCROWED: { label: "In escrow", tone: "primary" },
  SHIPPED: { label: "Shipped", tone: "info" },
  DELIVERED: { label: "Delivered", tone: "info" },
  DISPUTED: { label: "Disputed", tone: "danger" },
  COMPLETED: { label: "Completed", tone: "success" },
  REFUNDED: { label: "Refunded", tone: "accent" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

const INTENT: Record<
  string,
  { label: string; tone: "neutral" | "primary" | "success" | "warning" | "danger" | "info" }
> = {
  CREATED: { label: "Created", tone: "warning" },
  ROUTING: { label: "Routing", tone: "info" },
  FULFILLED: { label: "Fulfilled", tone: "success" },
  FAILED: { label: "Failed · refunded", tone: "danger" },
};

export function OrderStatusBadge({ status }: { status: string }) {
  const s = ORDER[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function IntentStatusBadge({ status }: { status: string }) {
  const s = INTENT[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

export function SeedDemoBadge() {
  return (
    <Badge tone="outline" title="Seeded demo record — there is no on-chain transaction for it">
      Demo record · not on-chain
    </Badge>
  );
}
