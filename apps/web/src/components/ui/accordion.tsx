"use client";
import * as React from "react";
import * as A from "@radix-ui/react-accordion";
import { Plus } from "lucide-react";
import { cn } from "@/lib/cn";

export const Accordion = A.Root;

export function AccordionItem({ className, ...props }: React.ComponentProps<typeof A.Item>) {
  return <A.Item className={cn("border-b border-border", className)} {...props} />;
}

export function AccordionTrigger({
  className,
  children,
  level = 3,
  ...props
}: React.ComponentProps<typeof A.Trigger> & {
  /** heading level of the item header (document outline) */ level?: 2 | 3 | 4;
}) {
  const H = `h${level}` as "h2" | "h3" | "h4";
  return (
    <A.Header asChild>
      <H className="flex">
        <A.Trigger
          className={cn(
            "group flex min-h-13 flex-1 items-center justify-between gap-4 py-4 text-left text-[0.875rem] font-medium transition-colors hover:text-foreground/70",
            className,
          )}
          {...props}
        >
          {children}
          <Plus
            className="size-4 shrink-0 transition-transform duration-200 group-data-[state=open]:rotate-45"
            strokeWidth={1.5}
            aria-hidden
          />
        </A.Trigger>
      </H>
    </A.Header>
  );
}

export function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof A.Content>) {
  return (
    <A.Content className="overflow-hidden text-sm text-muted-foreground" {...props}>
      <div className={cn("pb-5", className)}>{children}</div>
    </A.Content>
  );
}
