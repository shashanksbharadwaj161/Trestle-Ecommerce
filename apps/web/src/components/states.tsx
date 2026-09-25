import Link from "@/components/link";
import { AlertTriangle, Inbox } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
  level = 2,
}: {
  /** heading level — 1 when the state is the whole page (e.g. a sign-in gate) */
  level?: 1 | 2;
  title: string;
  description?: React.ReactNode;
  action?: { href: string; label: string } | React.ReactNode;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center border-y border-border px-6 py-16 text-center",
        className,
      )}
    >
      <div
        className="mb-4 grid size-12 place-items-center rounded-full bg-muted text-muted-foreground"
        aria-hidden
      >
        {icon ?? <Inbox className="size-5" />}
      </div>
      {level === 1 ? (
        <h1 className="text-lg font-medium">{title}</h1>
      ) : (
        <h2 className="text-lg font-medium">{title}</h2>
      )}
      {description && (
        <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>
      )}
      {action && (
        <div className="mt-5">
          {typeof action === "object" && action !== null && "href" in action ? (
            <Button asChild>
              <Link href={(action as { href: string }).href}>
                {(action as { label: string }).label}
              </Link>
            </Button>
          ) : (
            action
          )}
        </div>
      )}
    </div>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  retry,
}: {
  title?: string;
  message?: string;
  retry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center border border-danger/30 bg-danger-soft px-6 py-10 text-center"
    >
      <AlertTriangle className="mb-2 size-6 text-danger" aria-hidden />
      <h2 className="font-medium text-danger">{title}</h2>
      {message && <p className="mt-1 max-w-md text-sm text-foreground/80">{message}</p>}
      {retry && (
        <Button variant="outline" className="mt-4" onClick={retry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  eyebrow?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow && <div className="eyebrow mb-2 text-muted-foreground">{eyebrow}</div>}
        <h1 className="text-[1.75rem] leading-tight sm:text-[2.25rem]">{title}</h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Container({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("container-page py-8 md:py-10", className)} {...props} />;
}

export function Notice({
  tone = "info",
  children,
  className,
}: {
  tone?: "info" | "warning" | "danger" | "success";
  children: React.ReactNode;
  className?: string;
}) {
  const tones = {
    info: "border-info/30 bg-info-soft text-info",
    warning: "border-warning/30 bg-warning-soft text-warning",
    danger: "border-danger/30 bg-danger-soft text-danger",
    success: "border-success/30 bg-success-soft text-success",
  };
  return (
    <div className={cn("rounded-[2px] border px-4 py-3 text-sm", tones[tone], className)}>
      {children}
    </div>
  );
}
