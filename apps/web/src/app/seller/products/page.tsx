"use client";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { RequireAuth } from "@/components/require-auth";
import { ConnectWallet } from "@/components/connect";
import { Container, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/input";
import { TxSteps } from "@/components/tx-steps";
import { ProductAdminList } from "@/components/product-admin-list";
import { useExecuteCalls, type TxCall } from "@/hooks/use-tx";
import { useSession } from "@/hooks/use-session";
import { api, errorMessage } from "@/lib/api";

export default function SellerProductsPage() {
  return <RequireAuth role="SELLER">{() => <Products />}</RequireAuth>;
}

function Products() {
  const qc = useQueryClient();
  const { user } = useSession();
  const [minting, setMinting] = useState<{ id: string; title: string } | null>(null);
  return (
    <Container>
      <PageHeader title="Products" description="Listings, colours and sizes, stock and provenance records." />
      <ProductAdminList
        basePath="/seller/products"
        extraActions={(p) =>
          user?.walletAddress ? (
            <Button size="sm" variant="ghost" onClick={() => setMinting(p)} title="Mint an on-chain provenance record">
              <ShieldCheck /> <span className="sr-only lg:not-sr-only">Provenance</span>
            </Button>
          ) : null
        }
      />
      {!user?.walletAddress && (
        <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          Link a wallet to mint on-chain provenance records for your products.
          <ConnectWallet size="sm" label="Connect & link wallet" />
        </div>
      )}
      {minting && (
        <MintDialog
          product={minting}
          onClose={() => setMinting(null)}
          onDone={() => qc.invalidateQueries({ queryKey: ["my-products"] })}
        />
      )}
    </Container>
  );
}

function MintDialog({
  product,
  onClose,
  onDone,
}: {
  product: { id: string; title: string };
  onClose: () => void;
  onDone: () => void;
}) {
  const [batch, setBatch] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const exec = useExecuteCalls();
  const m = useMutation({
    mutationFn: async () => {
      const res = await api<{ calls: TxCall[] }>("/api/certificates/mint", {
        body: { productId: product.id, batch, manufacturer: manufacturer || undefined },
      });
      await exec.run(res.calls);
    },
    onSuccess: () => {
      toast.success("Certificate minted on-chain");
      onDone();
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        title="Mint provenance record"
        description={`An ERC-721 record for “${product.title}”, minted to your payout wallet. It is a record you issue as the seller, not an independent certification. Transfer it to the buyer when the order completes.`}
      >
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            m.mutate();
          }}
        >
          <Field label="Batch / serial number" htmlFor="c-batch">
            <Input
              id="c-batch"
              value={batch}
              onChange={(e) => setBatch(e.target.value)}
              required
              maxLength={80}
              className="font-mono"
            />
          </Field>
          <Field label="Manufacturer" htmlFor="c-man">
            <Input
              id="c-man"
              value={manufacturer}
              onChange={(e) => setManufacturer(e.target.value)}
              maxLength={80}
            />
          </Field>
          <TxSteps steps={exec.steps} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button type="submit" loading={m.isPending} disabled={!batch.trim()}>
              Mint certificate
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
