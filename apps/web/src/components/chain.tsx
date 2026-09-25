"use client";
import { ExternalLink } from "lucide-react";
import { useChainProfiles } from "@/lib/public-config";
import { shortAddress, shortHash } from "@/lib/format";

export function ChainBadge({
  chainId,
  className = "",
}: {
  chainId: number | null | undefined;
  className?: string;
}) {
  const profiles = useChainProfiles();
  const p = profiles.find((x) => x.chain.id === chainId);
  if (!chainId) return null;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground ${className}`}
    >
      <span
        className="size-2 rounded-full"
        style={{ background: p?.accent ?? "#888" }}
        aria-hidden
      />
      {p?.shortName ?? `Chain ${chainId}`}
    </span>
  );
}

export function TxLink({
  chainId,
  hash,
}: {
  chainId: number | null | undefined;
  hash: string | null | undefined;
}) {
  const profiles = useChainProfiles();
  if (!hash) return <span className="text-muted-foreground">—</span>;
  const p = profiles.find((x) => x.chain.id === chainId);
  const url = p?.explorerUrl ? `${p.explorerUrl}/tx/${hash}` : undefined;
  return url ? (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-mono text-xs text-primary hover:underline"
    >
      {shortHash(hash)} <ExternalLink className="size-3" aria-hidden />
      <span className="sr-only">(opens block explorer)</span>
    </a>
  ) : (
    <span className="font-mono text-xs" title={hash}>
      {shortHash(hash)}
    </span>
  );
}

export function AddressLink({
  chainId,
  address,
}: {
  chainId?: number | null;
  address: string | null | undefined;
}) {
  const profiles = useChainProfiles();
  if (!address) return <span className="text-muted-foreground">—</span>;
  const p = profiles.find((x) => x.chain.id === chainId);
  const url = p?.explorerUrl ? `${p.explorerUrl}/address/${address}` : undefined;
  return url ? (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="font-mono text-xs text-primary hover:underline"
      title={address}
    >
      {shortAddress(address)}
    </a>
  ) : (
    <span className="font-mono text-xs" title={address}>
      {shortAddress(address)}
    </span>
  );
}
