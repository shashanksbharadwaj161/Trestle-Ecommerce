"use client";
import { Check, CircleDashed, Loader2, X, SkipForward } from "lucide-react";
import type { Step } from "@/hooks/use-tx";
import { TxLink } from "./chain";

const LABEL: Record<Step["status"], string> = {
  idle: "Waiting",
  switching: "Switching network…",
  signing: "Confirm in your wallet…",
  pending: "Waiting for confirmation…",
  syncing: "Recording on Trestle…",
  done: "Confirmed",
  skipped: "Not needed",
  error: "Failed",
};

export function TxSteps({ steps }: { steps: Step[] }) {
  if (steps.length === 0) return null;
  return (
    <ol className="space-y-2" aria-live="polite">
      {steps.map((s, i) => (
        <li key={i} className="flex items-start gap-3 rounded-lg border border-border p-3">
          <span className="mt-0.5" aria-hidden>
            {s.status === "done" ? (
              <Check className="size-4 text-success" />
            ) : s.status === "error" ? (
              <X className="size-4 text-danger" />
            ) : s.status === "skipped" ? (
              <SkipForward className="size-4 text-muted-foreground" />
            ) : s.status === "idle" ? (
              <CircleDashed className="size-4 text-muted-foreground" />
            ) : (
              <Loader2 className="size-4 animate-spin text-primary" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{s.description}</p>
            <p className="text-xs text-muted-foreground">
              {LABEL[s.status]} {s.hash && <TxLink chainId={s.chainId} hash={s.hash} />}
            </p>
            {s.error && <p className="mt-1 break-words text-xs text-danger">{s.error}</p>}
          </div>
        </li>
      ))}
    </ol>
  );
}
