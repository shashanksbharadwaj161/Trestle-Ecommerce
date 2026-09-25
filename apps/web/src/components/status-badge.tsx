import { Badge } from "@/components/ui/badge";

const ORDER: Record<
  string,
  {
    label: string;
    tone: "neutral" | "primary" | "success" | "warning" | "danger" | "info" | "accent" | "trust";
  }
> = {
  PENDING_PAYMENT: { label: "Awaiting payment", tone: "warning" },
  ESCROWED: { label: "Paid · in escrow", tone: "trust" },
  PROCESSING: { label: "Preparing", tone: "info" },
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

const CARD: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" | "accent" }> = {
  OPEN: { label: "Awaiting payment", tone: "warning" },
  PROCESSING: { label: "Payment processing", tone: "info" },
  PAID: { label: "Paid", tone: "success" },
  FAILED: { label: "Payment failed", tone: "danger" },
  EXPIRED: { label: "Checkout expired", tone: "neutral" },
  PARTIALLY_REFUNDED: { label: "Partially refunded", tone: "accent" },
  REFUNDED: { label: "Refunded", tone: "accent" },
};

export function CardPaymentBadge({ status }: { status: string }) {
  const s = CARD[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}

const RETURN: Record<string, { label: string; tone: "neutral" | "success" | "warning" | "danger" | "info" | "accent" }> = {
  REQUESTED: { label: "Return requested", tone: "warning" },
  APPROVED: { label: "Return approved", tone: "info" },
  REJECTED: { label: "Return declined", tone: "neutral" },
  RECEIVED: { label: "Return received", tone: "info" },
  REFUNDED: { label: "Refunded", tone: "success" },
};

export function ReturnStatusBadge({ status }: { status: string }) {
  const s = RETURN[status] ?? { label: status, tone: "neutral" as const };
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
