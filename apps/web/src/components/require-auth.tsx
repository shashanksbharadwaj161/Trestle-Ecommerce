"use client";
import Link from "@/components/link";
import { usePathname } from "next/navigation";
import { LockKeyhole, Wallet } from "lucide-react";
import { useSession, type SessionUser } from "@/hooks/use-session";
import { useHydrated } from "@/hooks/use-hydrated";
import { Container, EmptyState } from "./states";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

/**
 * Gate for signed-in pages. `wallet` pages additionally need a verified wallet on the account; they must be
 * rendered inside <CryptoProviders> and pass the connect button as `walletAction`.
 */
export function RequireAuth({
  children,
  role,
  wallet,
  walletAction,
  title = "Sign in to continue",
  description = "Sign in or create an account to see this page.",
}: {
  children: (user: SessionUser) => React.ReactNode;
  role?: "SELLER" | "ADMIN";
  wallet?: boolean;
  walletAction?: React.ReactNode;
  title?: string;
  description?: string;
}) {
  const { user, loading } = useSession();
  const hydrated = useHydrated();
  const path = usePathname();
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
          level={1}
          icon={<LockKeyhole className="size-5" strokeWidth={1.5} />}
          title={title}
          description={description}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button asChild>
                <Link href={`/sign-in?next=${encodeURIComponent(path)}`}>Sign in</Link>
              </Button>
              {walletAction}
            </div>
          }
        />
      </Container>
    );
  }
  if (role === "ADMIN" && user.role !== "ADMIN") {
    return (
      <Container>
        <EmptyState
          level={1}
          title="Admins only"
          description="This area is restricted to the Trestle team."
          action={{ href: "/", label: "Back to the shop" }}
        />
      </Container>
    );
  }
  if (role === "SELLER" && !user.sellerId && user.role !== "ADMIN") {
    return (
      <Container>
        <EmptyState
          level={1}
          title="Set up your storefront first"
          description="Create a seller profile and choose where you want to be paid."
          action={{ href: "/seller/onboarding", label: "Start selling" }}
        />
      </Container>
    );
  }
  if (wallet && !user.walletAddress) {
    return (
      <Container>
        <EmptyState
          level={1}
          icon={<Wallet className="size-5" strokeWidth={1.5} />}
          title="Link a wallet to continue"
          description="This page uses stablecoin escrow. Connect your wallet and sign a message (no gas, no transaction) to link it to your account."
          action={walletAction}
        />
      </Container>
    );
  }
  return <>{children(user)}</>;
}
