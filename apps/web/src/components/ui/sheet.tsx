"use client";
import * as React from "react";
import * as D from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";

/** shadcn-style Sheet built on Radix Dialog: side drawers and bottom sheets with focus trap. */
export const Sheet = D.Root;
export const SheetTrigger = D.Trigger;
export const SheetClose = D.Close;

const sides = {
  right: "inset-y-0 right-0 h-dvh w-full max-w-[440px] border-l animate-sheet-right",
  left: "inset-y-0 left-0 h-dvh w-[88vw] max-w-[400px] border-r animate-sheet-left",
  bottom: "inset-x-0 bottom-0 max-h-[88dvh] w-full border-t rounded-t-[10px] animate-sheet-bottom",
  top: "inset-x-0 top-0 w-full border-b animate-slide-down",
};

export function SheetContent({
  side = "right",
  title,
  description,
  hideTitle,
  children,
  className,
  footer,
  onOpenAutoFocus,
}: {
  side?: keyof typeof sides;
  title: string;
  description?: string;
  hideTitle?: boolean;
  children: React.ReactNode;
  className?: string;
  footer?: React.ReactNode;
  onOpenAutoFocus?: (e: Event) => void;
}) {
  return (
    <D.Portal>
      <D.Overlay className="fixed inset-0 z-50 bg-overlay animate-fade-in" />
      <D.Content
        onOpenAutoFocus={onOpenAutoFocus}
        className={cn(
          "fixed z-50 flex flex-col border-border bg-card text-card-foreground shadow-card outline-none",
          sides[side],
          className,
        )}
      >
        <div
          className={cn(
            "flex min-h-14 items-center justify-between gap-4 px-5",
            hideTitle ? "absolute right-0 top-0 z-10" : "border-b border-border",
          )}
        >
          <div className={hideTitle ? "sr-only" : undefined}>
            <D.Title className="text-[0.9375rem] font-medium">{title}</D.Title>
            {description ? (
              <D.Description className="text-xs text-muted-foreground">{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{title}</D.Description>
            )}
          </div>
          <D.Close
            className="-mr-2 grid size-11 place-items-center text-foreground/70 transition-colors hover:text-foreground"
            aria-label="Close"
          >
            <X className="size-5" strokeWidth={1.5} />
          </D.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">{children}</div>
        {footer && <div className="border-t border-border p-5">{footer}</div>}
      </D.Content>
    </D.Portal>
  );
}
