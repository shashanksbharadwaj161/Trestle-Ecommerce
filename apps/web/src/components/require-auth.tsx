"use client";
import { LockKeyhole } from "lucide-react";
import { useSession, type SessionUser } from "@/hooks/use-session";
import { useHydrated } from "@/hooks/use-hydrated";
import { ConnectWallet } from "./connect";
import { Container, EmptyState } from "./states";
import { Skeleton } from "@/components/ui/skeleton";

export function RequireAuth({
  children,
  role,
  title = "Sign in to continue",
  description = "Connect your wallet and sign a message (no gas, no transaction) to access this page.",
}: {
  children: (user: SessionUser) => React.ReactNode;
  role?: "SELLER" | "ADMIN";
  title?: string;
  description?: string;
}) {
  const { user, loading } = useSession();
  const hydrated = useHydrated();
  if (loading || !hydrated) {
    return (
      <Container>
        <Skeleton className="mb-4 h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </Container>
    );
  }
  if (!user) {
    return (
      <Container>
        <EmptyState
          icon={<LockKeyhole className="size-5" />}
          title={title}
          description={description}
          action={<ConnectWallet size="lg" />}
        />
      </Container>
    );
  }
  if (role === "ADMIN" && user.role !== "ADMIN") {
    return (
      <Container>
        <EmptyState
          title="Admins only"
          description="This area is restricted to Trestle arbiters."
          action={{ href: "/", label: "Back to the shop" }}
        />
      </Container>
    );
  }
  if (role === "SELLER" && !user.sellerId) {
    return (
      <Container>
        <EmptyState
          title="Set up your storefront first"
          description="Create a seller profile and choose where you want to be paid."
          action={{ href: "/seller/onboarding", label: "Start selling" }}
        />
      </Container>
    );
  }
  return <>{children(user)}</>;
}
