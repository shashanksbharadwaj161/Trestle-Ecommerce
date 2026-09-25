"use client";
import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { PRODUCT_CATEGORIES } from "@trestle/shared";
import { RequireAuth } from "@/components/require-auth";
import { Container, EmptyState, ErrorState, PageHeader } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { TxSteps } from "@/components/tx-steps";
import { useExecuteCalls, type TxCall } from "@/hooks/use-tx";
import { useChainProfiles } from "@/lib/public-config";
import { api, ApiClientError, errorMessage } from "@/lib/api";
import { usd } from "@/lib/format";

interface Row {
  id: string;
  title: string;
  images: string[];
  priceUsdMicros: string;
  category: string;
  status: string;
  manufacturer: string | null;
  chainListingOptions: number[];
  variants: { id: string; name: string; stock: number }[];
  _count: { certificates: number };
}
interface Full extends Row {
  description: string;
  variants: {
    id: string;
    name: string;
    stock: number;
    sku: string;
    attributes: Record<string, string>;
  }[];
}

export default function SellerProductsPage() {
  return <RequireAuth role="SELLER">{() => <Products />}</RequireAuth>;
}

function Products() {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["my-products"],
    queryFn: () => api<{ items: Row[] }>("/api/products?mine=1&pageSize=48&sort=newest"),
  });
  const [editing, setEditing] = useState<Full | "new" | null>(null);
  const [minting, setMinting] = useState<Row | null>(null);
  const del = useMutation({
    mutationFn: (id: string) =>
      api<{ archived: boolean; reason?: string }>(`/api/products/${id}`, { method: "DELETE" }),
    onSuccess: (r) => {
      toast.success(r.archived ? (r.reason ?? "Archived") : "Product deleted");
      qc.invalidateQueries({ queryKey: ["my-products"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  async function edit(id: string) {
    try {
      const { product } = await api<{ product: Full }>(`/api/products/${id}`);
      setEditing(product);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  return (
    <Container>
      <PageHeader
        title="Products"
        description="Listings, stock and authenticity certificates."
        actions={
          <Button onClick={() => setEditing("new")}>
            <Plus /> New product
          </Button>
        }
      />
      {q.isLoading ? (
        <Skeleton className="h-72" />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} retry={() => q.refetch()} />
      ) : q.data!.items.length === 0 ? (
        <EmptyState
          title="No products yet"
          description="List your first product — buyers on every supported chain can buy it."
          action={
            <Button onClick={() => setEditing("new")}>
              <Plus /> New product
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-3 font-medium">Product</th>
                <th className="p-3 font-medium">Price</th>
                <th className="p-3 font-medium">Stock</th>
                <th className="p-3 font-medium">Status</th>
                <th className="p-3 font-medium">Certificates</th>
                <th className="p-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {q.data!.items.map((p) => (
                <tr key={p.id} className="border-t border-border">
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={p.images[0]}
                        alt=""
                        className="size-10 rounded-md border border-border object-cover"
                      />
                      <div>
                        <Link href={`/products/${p.id}`} className="font-medium hover:underline">
                          {p.title}
                        </Link>
                        <p className="text-xs text-muted-foreground">{p.category}</p>
                      </div>
                    </div>
                  </td>
                  <td className="tabular p-3">{usd(p.priceUsdMicros)}</td>
                  <td className="tabular p-3">{p.variants.reduce((s, v) => s + v.stock, 0)}</td>
                  <td className="p-3">
                    <Badge
                      tone={
                        p.status === "ACTIVE"
                          ? "success"
                          : p.status === "DRAFT"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {p.status.toLowerCase()}
                    </Badge>
                  </td>
                  <td className="p-3">
                    {p._count.certificates > 0 ? (
                      <Badge tone="primary">
                        <ShieldCheck /> {p._count.certificates}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1">
                      <Button size="sm" variant="outline" onClick={() => setMinting(p)}>
                        <ShieldCheck /> Mint certificate
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Edit ${p.title}`}
                        onClick={() => edit(p.id)}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Delete ${p.title}`}
                        onClick={() =>
                          confirm(
                            `Delete “${p.title}”? Products with orders are archived instead.`,
                          ) && del.mutate(p.id)
                        }
                      >
                        <Trash2 />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && (
        <ProductDialog
          product={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(created) => {
            qc.invalidateQueries({ queryKey: ["my-products"] });
            // "mint authenticity certificate on publish": offer the mint step for newly listed products
            if (created) setMinting(created);
          }}
        />
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

function ProductDialog({
  product,
  onClose,
  onSaved,
}: {
  product: Full | null;
  onClose: () => void;
  onSaved: (created?: Row) => void;
}) {
  const profiles = useChainProfiles();
  const [form, setForm] = useState({
    title: product?.title ?? "",
    description: product?.description ?? "",
    price: product ? (Number(BigInt(product.priceUsdMicros) / 10_000n) / 100).toFixed(2) : "",
    category: product?.category ?? PRODUCT_CATEGORIES[0],
    images: (product?.images ?? []).join("\n"),
    manufacturer: product?.manufacturer ?? "",
    chains: product?.chainListingOptions ?? profiles.map((p) => p.chain.id),
    status: product?.status ?? "ACTIVE",
    variants: product?.variants.map((v) => ({
      id: v.id,
      name: v.name,
      sku: v.sku,
      stock: String(v.stock),
    })) ?? [{ id: undefined as string | undefined, name: "Default", sku: "", stock: "1" }],
  });
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const save = useMutation({
    mutationFn: () => {
      const body = {
        title: form.title,
        description: form.description,
        price: form.price,
        category: form.category,
        images: form.images.split(/\s+/).filter(Boolean).length
          ? form.images.split(/\s+/).filter(Boolean)
          : [
              `/art/${form.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "item"}?category=${encodeURIComponent(form.category)}`,
            ],
        manufacturer: form.manufacturer || null,
        chainListingOptions: form.chains,
        status: form.status,
        variants: form.variants.map((v) => ({
          id: v.id,
          name: v.name,
          sku: v.sku,
          stock: Number(v.stock),
          attributes: {},
        })),
      };
      return product
        ? api<{ product: Row }>(`/api/products/${product.id}`, { method: "PATCH", body })
        : api<{ product: Row }>("/api/products", { body });
    },
    onSuccess: (res) => {
      toast.success(
        product ? "Product updated" : "Product listed — mint its authenticity certificate next",
      );
      onClose();
      onSaved(product ? undefined : { ...res.product, _count: { certificates: 0 } });
    },
    onError: (err) => {
      if (
        err instanceof ApiClientError &&
        err.details &&
        typeof err.details === "object" &&
        "fieldErrors" in err.details
      )
        setErrors((err.details as { fieldErrors: Record<string, string[]> }).fieldErrors);
      toast.error(errorMessage(err));
    },
  });
  const e = (k: string) => errors[k]?.[0];
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent title={product ? "Edit product" : "New product"} className="max-w-2xl">
        <form
          className="grid gap-4 sm:grid-cols-2"
          onSubmit={(ev) => {
            ev.preventDefault();
            setErrors({});
            save.mutate();
          }}
        >
          <Field label="Title" htmlFor="p-title" className="sm:col-span-2" error={e("title")}>
            <Input
              id="p-title"
              value={form.title}
              onChange={(ev) => setForm({ ...form, title: ev.target.value })}
              required
            />
          </Field>
          <Field
            label="Description"
            htmlFor="p-desc"
            className="sm:col-span-2"
            error={e("description")}
          >
            <Textarea
              id="p-desc"
              value={form.description}
              onChange={(ev) => setForm({ ...form, description: ev.target.value })}
              required
            />
          </Field>
          <Field
            label="Price (USD)"
            htmlFor="p-price"
            hint="Exact, up to 2 decimals"
            error={e("price")}
          >
            <Input
              id="p-price"
              inputMode="decimal"
              value={form.price}
              onChange={(ev) => setForm({ ...form, price: ev.target.value })}
              required
            />
          </Field>
          <Field label="Category" htmlFor="p-cat" error={e("category")}>
            <Select
              id="p-cat"
              value={form.category}
              onChange={(ev) =>
                setForm({ ...form, category: ev.target.value as typeof form.category })
              }
            >
              {PRODUCT_CATEGORIES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </Select>
          </Field>
          <Field label="Manufacturer" htmlFor="p-man" error={e("manufacturer")}>
            <Input
              id="p-man"
              value={form.manufacturer}
              onChange={(ev) => setForm({ ...form, manufacturer: ev.target.value })}
            />
          </Field>
          <Field label="Status" htmlFor="p-status" error={e("status")}>
            <Select
              id="p-status"
              value={form.status}
              onChange={(ev) => setForm({ ...form, status: ev.target.value })}
            >
              <option value="ACTIVE">Active</option>
              <option value="DRAFT">Draft</option>
              <option value="ARCHIVED">Archived</option>
            </Select>
          </Field>
          <Field
            label="Image URLs (one per line)"
            htmlFor="p-img"
            className="sm:col-span-2"
            hint="https:// URLs. Leave empty to use generated artwork."
            error={e("images")}
          >
            <Textarea
              id="p-img"
              value={form.images}
              onChange={(ev) => setForm({ ...form, images: ev.target.value })}
              className="font-mono text-xs"
            />
          </Field>
          <fieldset className="sm:col-span-2">
            <legend className="mb-1 text-sm font-medium">Buyers can pay from</legend>
            <div className="flex flex-wrap gap-4">
              {profiles.map((p) => (
                <label key={p.chain.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="accent-[var(--primary)]"
                    checked={form.chains.includes(p.chain.id)}
                    onChange={(ev) =>
                      setForm({
                        ...form,
                        chains: ev.target.checked
                          ? [...form.chains, p.chain.id]
                          : form.chains.filter((c) => c !== p.chain.id),
                      })
                    }
                  />
                  {p.label}
                </label>
              ))}
            </div>
            {e("chainListingOptions") && (
              <p className="text-xs text-danger" role="alert">
                {e("chainListingOptions")}
              </p>
            )}
          </fieldset>
          <fieldset className="sm:col-span-2">
            <legend className="mb-2 text-sm font-medium">Variants</legend>
            <div className="space-y-2">
              {form.variants.map((v, i) => (
                <div key={i} className="grid grid-cols-[1fr_1fr_80px_auto] gap-2">
                  <Input
                    aria-label={`Variant ${i + 1} name`}
                    placeholder="Name"
                    value={v.name}
                    onChange={(ev) =>
                      setForm({
                        ...form,
                        variants: form.variants.map((x, j) =>
                          j === i ? { ...x, name: ev.target.value } : x,
                        ),
                      })
                    }
                  />
                  <Input
                    aria-label={`Variant ${i + 1} SKU`}
                    placeholder="SKU"
                    value={v.sku}
                    onChange={(ev) =>
                      setForm({
                        ...form,
                        variants: form.variants.map((x, j) =>
                          j === i ? { ...x, sku: ev.target.value } : x,
                        ),
                      })
                    }
                    className="font-mono"
                  />
                  <Input
                    aria-label={`Variant ${i + 1} stock`}
                    inputMode="numeric"
                    value={v.stock}
                    onChange={(ev) =>
                      setForm({
                        ...form,
                        variants: form.variants.map((x, j) =>
                          j === i ? { ...x, stock: ev.target.value } : x,
                        ),
                      })
                    }
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remove variant ${i + 1}`}
                    disabled={form.variants.length === 1}
                    onClick={() =>
                      setForm({ ...form, variants: form.variants.filter((_, j) => j !== i) })
                    }
                  >
                    <Trash2 />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() =>
                setForm({
                  ...form,
                  variants: [...form.variants, { id: undefined, name: "", sku: "", stock: "0" }],
                })
              }
            >
              <Plus /> Add variant
            </Button>
            {e("variants") && (
              <p className="text-xs text-danger" role="alert">
                {e("variants")}
              </p>
            )}
          </fieldset>
          <div className="flex justify-end gap-2 sm:col-span-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {product ? "Save" : "Publish"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MintDialog({
  product,
  onClose,
  onDone,
}: {
  product: Row;
  onClose: () => void;
  onDone: () => void;
}) {
  const [batch, setBatch] = useState("");
  const [manufacturer, setManufacturer] = useState(product.manufacturer ?? "");
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
        title="Mint authenticity certificate"
        description={`ERC-721 certificate for “${product.title}”, minted to your payout wallet. Transfer it to the buyer when the order completes to extend its provenance.`}
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
