"use client";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";

const OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex border border-border">
      {OPTIONS.map((o) => {
        const active = mounted && theme === o.value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${o.label} theme`}
            onClick={() => setTheme(o.value)}
            className={cn(
              "grid size-10 place-items-center text-muted-foreground transition-colors hover:text-foreground",
              active && "bg-foreground text-background hover:text-background",
            )}
          >
            <o.icon className="size-4" strokeWidth={1.5} />
          </button>
        );
      })}
    </div>
  );
}
