"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { parseUnits } from "viem";
import { Coins, Fuel, Vote } from "lucide-react";
import { toast } from "sonner";
import { RequireAuth } from "@/components/require-auth";
import { ConnectWallet } from "@/components/connect";
import { Container, EmptyState, ErrorState, PageHeader } from "@/components/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { ChainBadge, TxLink } from "@/components/chain";
import { TxSteps } from "@/components/tx-steps";
import { useExecuteCalls, useGasless, type TxCall } from "@/hooks/use-tx";
import { api, errorMessage } from "@/lib/api";
import { dateTime, tokenAmount } from "@/lib/format";

interface Account {
  kind: "wallet" | "smart";
  address: string;
  balance: string;
  staked: string;
  pendingRewards: string;
  feeDiscountBps: number;
  votingWeight: string;
}
interface Loyalty {
  chains: {
    chainId: number;
    chainName: string;
    accounts: Account[];
    tiers: { minStake: string; discountBps: number }[];
    rewardAprBps: number;
    online: boolean;
  }[];
  history: {
    id: string;
    type: string;
    amount: string;
    chainId: number;
    txHash: string | null;
    createdAt: string;
    isSeedDemo: boolean;
  }[];
  gasless: boolean;
}

export function LoyaltyView() {
  return (
    <RequireAuth title="Sign in to manage TRST" wallet walletAction={<ConnectWallet label="Connect & link wallet" />}>
      {() => <LoyaltyInner />}
    </RequireAuth>
  );
}

function LoyaltyInner() {
  const q = useQuery({ queryKey: ["loyalty"], queryFn: () => api<Loyalty>("/api/loyalty") });
  if (q.isLoading)
    return (
      <Container>
        <Skeleton className="mb-4 h-9 w-64" />
        <Skeleton className="h-72" />
      </Container>
    );
  if (q.isError)
    return (
      <Container>
        <ErrorState message={errorMessage(q.error)} retry={() => q.refetch()} />
      </Container>
    );
  const data = q.data!;
  const hasAny = data.chains.some((c) =>
    c.accounts.some((a) => a.balance !== "0" || a.staked !== "0"),
  );
  return (
    <Container>
      <PageHeader
        title="Loyalty & staking"
        description="TRST is minted by escrow when orders complete (5% of order value). Stake it for checkout-fee discounts, staking rewards and governance weight. Balances are per chain."
      />
      {!hasAny && (
        <EmptyState
          className="mb-6"
          icon={<Coins className="size-5" />}
          title="No TRST yet"
          description="Complete an order — when escrow releases, TRST is minted to the account that placed it."
          action={{ href: "/products", label: "Shop now" }}
        />
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        {data.chains.map((c) => (
          <Card key={c.chainId}>
            <CardHeader className="flex-row items-start justify-between">
              <div>
                <CardTitle>{c.chainName}</CardTitle>
                <CardDescription>
                  Staking APR {(c.rewardAprBps / 100).toFixed(1)}% (paid in TRST)
                </CardDescription>
              </div>
              <ChainBadge chainId={c.chainId} />
            </CardHeader>
            <CardContent className="space-y-4">
              {!c.online && (
                <p className="text-sm text-warning">
                  Chain RPC unreachable — balances unavailable.
                </p>
              )}
              {c.accounts.map((a) => (
                <AccountPanel
                  key={a.address}
                  chainId={c.chainId}
                  account={a}
                  gasless={data.gasless}
                  onChanged={() => q.refetch()}
                />
              ))}
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Fee discount tiers
                </p>
                <ul className="grid grid-cols-3 gap-2 text-center text-xs">
                  {c.tiers.map((t) => (
                    <li key={t.minStake} className="rounded-lg bg-muted p-2">
                      <p className="font-semibold">{t.discountBps / 100}% off</p>
                      <p className="text-muted-foreground">
                        stake ≥ {tokenAmount(t.minStake, 18, 0)}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <section className="mt-8" aria-labelledby="hist">
        <h2 id="hist" className="mb-3 text-xl font-semibold">
          Rewards history
        </h2>
        {data.history.length === 0 ? (
          <p className="text-sm text-muted-foreground">No loyalty activity yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card" tabIndex={0} role="region" aria-label="Table (scrolls horizontally)">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-3 font-medium">Type</th>
                  <th className="p-3 font-medium">Amount</th>
                  <th className="p-3 font-medium">Chain</th>
                  <th className="p-3 font-medium">Tx</th>
                  <th className="p-3 font-medium">When</th>
                </tr>
              </thead>
              <tbody>
                {data.history.map((h) => (
                  <tr key={h.id} className="border-t border-border">
                    <td className="p-3">
                      <Badge
                        tone={
                          h.type === "EARNED" || h.type === "CLAIMED"
                            ? "success"
                            : h.type === "STAKED"
                              ? "primary"
                              : "neutral"
                        }
                      >
                        {h.type}
                      </Badge>
                    </td>
                    <td className="tabular p-3">{tokenAmount(h.amount, 18, 4)} TRST</td>
                    <td className="p-3">
                      <ChainBadge chainId={h.chainId} />
                    </td>
                    <td className="p-3">
                      {h.isSeedDemo ? (
                        <Badge tone="outline">demo</Badge>
                      ) : (
                        <TxLink chainId={h.chainId} hash={h.txHash} />
                      )}
                    </td>
                    <td className="p-3 text-muted-foreground">{dateTime(h.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </Container>
  );
}

function AccountPanel({
  chainId,
  account,
  gasless,
  onChanged,
}: {
  chainId: number;
  account: Account;
  gasless: boolean;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const exec = useExecuteCalls();
  const aa = useGasless();
  const smart = account.kind === "smart";
  const m = useMutation({
    mutationFn: async (action: "stake" | "unstake" | "claimRewards") => {
      let raw = "0";
      if (action !== "claimRewards") {
        try {
          raw = parseUnits(amount || "0", 18).toString();
        } catch {
          throw new Error("Enter a valid amount");
        }
        if (raw === "0") throw new Error("Enter an amount greater than zero");
        const limit = BigInt(action === "stake" ? account.balance : account.staked);
        if (BigInt(raw) > limit)
          throw new Error(
            action === "stake" ? "Amount exceeds your balance" : "Amount exceeds your stake",
          );
      }
      if (smart) {
        await aa.run(
          action === "claimRewards" ? { action, chainId } : { action, chainId, amount: raw },
        );
      } else {
        const res = await api<{ calls: TxCall[] }>("/api/loyalty/intent", {
          body: { chainId, action, amount: action === "claimRewards" ? undefined : raw },
        });
        await exec.run(res.calls);
      }
    },
    onMutate: () => setError(null),
    onSuccess: () => {
      toast.success("Loyalty updated");
      setAmount("");
      onChanged();
      qc.invalidateQueries({ queryKey: ["loyalty"] });
    },
    onError: (err) => setError(errorMessage(err)),
  });
  const id = `amt-${chainId}-${account.kind}`;
  return (
    <div className="rounded-lg border border-border p-4">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-medium">
          {smart ? (
            <>
              <Fuel className="size-4 text-primary" aria-hidden /> Smart account (gasless)
            </>
          ) : (
            "Wallet"
          )}
        </p>
        {account.feeDiscountBps > 0 && (
          <Badge tone="success">{account.feeDiscountBps / 100}% fee discount</Badge>
        )}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-xs text-muted-foreground">Balance</dt>
          <dd className="tabular font-semibold">{tokenAmount(account.balance, 18, 2)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Staked</dt>
          <dd className="tabular font-semibold">{tokenAmount(account.staked, 18, 2)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Pending rewards</dt>
          <dd className="tabular">{tokenAmount(account.pendingRewards, 18, 4)}</dd>
        </div>
        <div>
          <dt className="flex items-center gap-1 text-xs text-muted-foreground">
            <Vote className="size-3" aria-hidden /> Voting weight
          </dt>
          <dd className="tabular">{tokenAmount(account.votingWeight, 18, 2)}</dd>
        </div>
      </dl>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Label htmlFor={id} className="text-xs">
            Amount (TRST)
          </Label>
          <Input
            id={id}
            inputMode="decimal"
            placeholder="0.0"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-err` : undefined}
          />
        </div>
        <div className="flex gap-2">
          <Button
            size="md"
            disabled={(smart && !gasless) || m.isPending}
            onClick={() => m.mutate("stake")}
          >
            Stake
          </Button>
          <Button
            size="md"
            variant="outline"
            disabled={(smart && !gasless) || m.isPending}
            onClick={() => m.mutate("unstake")}
          >
            Unstake
          </Button>
          <Button
            size="md"
            variant="ghost"
            disabled={(smart && !gasless) || m.isPending || account.pendingRewards === "0"}
            onClick={() => m.mutate("claimRewards")}
          >
            Claim
          </Button>
        </div>
      </div>
      {error && (
        <p id={`${id}-err`} role="alert" className="mt-2 text-xs text-danger">
          {error}
        </p>
      )}
      {aa.busy && (
        <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
          {aa.state === "signing"
            ? "Sign the UserOperation hash in your wallet…"
            : "Submitting sponsored UserOperation…"}
        </p>
      )}
      {exec.steps.length > 0 && (
        <div className="mt-3">
          <TxSteps steps={exec.steps} />
        </div>
      )}
    </div>
  );
}
