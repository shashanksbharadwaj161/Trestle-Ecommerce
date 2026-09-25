"use client";
import * as React from "react";
import * as S from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";

/** Radix Select, styled like shadcn/ui (keyboard + screen-reader friendly). */
export function SelectMenu({
  value,
  onValueChange,
  options,
  label,
  id,
  className,
  placeholder,
}: {
  value: string;
  onValueChange: (v: string) => void;
  options: { value: string; label: string }[];
  label: string;
  id?: string;
  className?: string;
  placeholder?: string;
}) {
  return (
    <S.Root value={value} onValueChange={onValueChange}>
      <S.Trigger
        id={id}
        aria-label={label}
        className={cn(
          "inline-flex h-11 min-w-40 items-center justify-between gap-3 rounded-[2px] border border-input bg-card px-3 text-sm hover:border-foreground/50 focus-visible:outline-2 focus-visible:outline-ring",
          className,
        )}
      >
        <S.Value placeholder={placeholder} />
        <S.Icon>
          <ChevronDown className="size-4 opacity-70" strokeWidth={1.5} />
        </S.Icon>
      </S.Trigger>
      <S.Portal>
        <S.Content
          position="popper"
          sideOffset={4}
          className="z-[60] min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-[4px] border border-border bg-card shadow-card animate-fade-in"
        >
          <S.Viewport className="p-1">
            {options.map((o) => (
              <S.Item
                key={o.value}
                value={o.value}
                className="relative flex h-10 cursor-pointer select-none items-center rounded-[2px] pl-8 pr-3 text-sm outline-none data-[highlighted]:bg-muted"
              >
                <S.ItemIndicator className="absolute left-2">
                  <Check className="size-4" strokeWidth={1.5} />
                </S.ItemIndicator>
                <S.ItemText>{o.label}</S.ItemText>
              </S.Item>
            ))}
          </S.Viewport>
        </S.Content>
      </S.Portal>
    </S.Root>
  );
}
