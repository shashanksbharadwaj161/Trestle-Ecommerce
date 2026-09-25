"use client";
import { ArrowDown, ShieldCheck } from "lucide-react";
import { AddressLink, ChainBadge, TxLink } from "@/components/chain";
import { dateTime } from "@/lib/format";

export interface CertView {
  id: string;
  tokenId: string;
  chainId: number;
  contract: string;
  batch: string | null;
  manufacturer: string | null;
  owner: string;
  minter: string;
  mintTxHash: string;
  createdAt: string;
  history: { from: string; to: string; at: string | null; txHash: string }[];
}

const ZERO = "0x0000000000000000000000000000000000000000";

export function CertificateViewer({ certs }: { certs: CertView[] }) {
  if (certs.length === 0) {
    return (
      <p className="mt-3 rounded-xl border border-dashed border-border p-6 text-sm text-muted-foreground">
        This listing has no on-chain certificate yet. Verified sellers can mint an ERC-721
        certificate for each unit or batch.
      </p>
    );
  }
  return (
    <div className="mt-4 grid gap-4 md:grid-cols-2">
      {certs.map((c) => (
        <article
          key={c.id}
          className="rounded-xl border border-border bg-card p-5"
          aria-label={`Certificate #${c.tokenId}`}
        >
          <header className="flex items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 font-medium">
                <ShieldCheck className="size-4 text-primary" aria-hidden /> Certificate #{c.tokenId}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {c.manufacturer ?? "Manufacturer n/a"} · batch/serial{" "}
                <span className="font-mono">{c.batch ?? "—"}</span>
              </p>
            </div>
            <ChainBadge chainId={c.chainId} />
          </header>
          <dl className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <dt className="text-muted-foreground">Original seller</dt>
            <dd className="text-right">
              <AddressLink chainId={c.chainId} address={c.minter} />
            </dd>
            <dt className="text-muted-foreground">Current owner</dt>
            <dd className="text-right">
              <AddressLink chainId={c.chainId} address={c.owner} />
            </dd>
            <dt className="text-muted-foreground">Mint transaction</dt>
            <dd className="text-right">
              <TxLink chainId={c.chainId} hash={c.mintTxHash} />
            </dd>
          </dl>
          <h3 className="mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Provenance ({c.history.length} records)
          </h3>
          <ol className="mt-2 space-y-1">
            {c.history.map((h, i) => (
              <li key={h.txHash + i}>
                <div className="flex items-center justify-between rounded-lg bg-muted px-3 py-2 text-xs">
                  <span>
                    {h.from === ZERO ? "Minted to " : "Transferred to "}
                    <AddressLink chainId={c.chainId} address={h.to} />
                  </span>
                  <span className="text-muted-foreground">{dateTime(h.at)}</span>
                </div>
                {i < c.history.length - 1 && (
                  <ArrowDown className="mx-auto my-0.5 size-3 text-muted-foreground" aria-hidden />
                )}
              </li>
            ))}
          </ol>
          <a
            href={`/api/certificates/${c.chainId}/${c.tokenId}`}
            className="mt-3 inline-block text-xs text-primary hover:underline"
          >
            Verify live against the contract →
          </a>
        </article>
      ))}
    </div>
  );
}
