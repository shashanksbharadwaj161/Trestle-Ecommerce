"use client";
import * as T from "@radix-ui/react-tabs";
import { cn } from "@/lib/cn";

export const Tabs = T.Root;
export function TabsList({ className, ...props }: T.TabsListProps) {
  return (
    <T.List
      className={cn("inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1", className)}
      {...props}
    />
  );
}
export function TabsTrigger({ className, ...props }: T.TabsTriggerProps) {
  return (
    <T.Trigger
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm",
        className,
      )}
      {...props}
    />
  );
}
export const TabsContent = T.Content;
