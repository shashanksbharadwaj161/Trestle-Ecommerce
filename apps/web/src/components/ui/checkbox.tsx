"use client";
import * as React from "react";
import * as C from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import { cn } from "@/lib/cn";

export function Checkbox({ className, ...props }: React.ComponentProps<typeof C.Root>) {
  return (
    <C.Root
      className={cn(
        "grid size-[18px] shrink-0 place-items-center rounded-[2px] border border-input bg-card transition-colors hover:border-foreground data-[state=checked]:border-foreground data-[state=checked]:bg-foreground data-[state=checked]:text-background",
        className,
      )}
      {...props}
    >
      <C.Indicator>
        <Check className="size-3.5" strokeWidth={2} />
      </C.Indicator>
    </C.Root>
  );
}
