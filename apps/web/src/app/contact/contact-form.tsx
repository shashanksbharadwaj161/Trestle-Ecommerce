"use client";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { api, ApiClientError, errorMessage } from "@/lib/api";

const TOPICS = ["Order", "Returns", "Sizing", "Payment", "Other"] as const;

export function ContactForm() {
  const sp = useSearchParams();
  const initialTopic = TOPICS.find((t) => t === sp.get("topic")) ?? (sp.get("order") ? "Order" : "Order");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const m = useMutation({
    mutationFn: (body: Record<string, string>) => api<{ reference: string }>("/api/contact", { body }),
    onError: (err) => {
      const fe = err instanceof ApiClientError ? (err.details as { fieldErrors?: Record<string, string[]> })?.fieldErrors : null;
      if (fe) setFieldErrors(Object.fromEntries(Object.entries(fe).map(([k, v]) => [k, v[0] ?? ""])));
    },
  });

  if (m.isSuccess)
    return (
      <div className="border border-border p-8 text-center" role="status">
        <CheckCircle2 className="mx-auto size-7 text-success" strokeWidth={1.5} />
        <p className="mt-3 text-lg">Message sent</p>
        <p className="mt-1 text-sm text-muted-foreground">Reference {m.data.reference}. We’ll reply to the email you gave.</p>
      </div>
    );

  return (
    <form
      className="space-y-5"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setFieldErrors({});
        const f = new FormData(e.currentTarget);
        m.mutate(Object.fromEntries([...f.entries()].map(([k, v]) => [k, String(v)])));
      }}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Name" htmlFor="c-name" error={fieldErrors.name}>
          <Input id="c-name" name="name" autoComplete="name" required aria-invalid={!!fieldErrors.name} />
        </Field>
        <Field label="Email" htmlFor="c-email" error={fieldErrors.email}>
          <Input id="c-email" name="email" type="email" autoComplete="email" required aria-invalid={!!fieldErrors.email} />
        </Field>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Topic" htmlFor="c-topic">
          <Select id="c-topic" name="topic" defaultValue={initialTopic}>
            {TOPICS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </Select>
        </Field>
        <Field label="Order number (optional)" htmlFor="c-order">
          <Input id="c-order" name="orderRef" defaultValue={sp.get("order") ?? ""} />
        </Field>
      </div>
      <Field label="Message" htmlFor="c-message" error={fieldErrors.message}>
        <Textarea id="c-message" name="message" rows={6} required aria-invalid={!!fieldErrors.message} />
      </Field>
      {/* honeypot for bots; hidden from people and assistive tech */}
      <div aria-hidden className="absolute -left-[9999px]">
        <label htmlFor="c-website">Website</label>
        <input id="c-website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {m.isError && !Object.keys(fieldErrors).length && (
        <p role="alert" className="text-sm text-danger">
          {errorMessage(m.error)}
        </p>
      )}
      <Button type="submit" size="lg" loading={m.isPending}>
        Send message
      </Button>
    </form>
  );
}
