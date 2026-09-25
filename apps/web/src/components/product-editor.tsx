"use client";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  CATEGORY_LABEL,
  DEPARTMENTS,
  DEPARTMENT_LABEL,
  PRODUCT_CATEGORIES,
  SIZE_CHARTS,
  sortSizes,
} from "@trestle/shared";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { api, ApiClientError, errorMessage } from "@/lib/api";
import { cn } from "@/lib/cn";

interface EditableProduct {
  id: string;
  title: string;
  description: string;
  priceUsdMicros: string;
  department: string | null;
  category: string;
  subcategory: string | null;
  material: string | null;
  fit: string | null;
  care: string[];
  sizeChartKey: string | null;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  featured: boolean;
  chainListingOptions: number[];
  gallery: {
    url: string;
    alt: string;
    colour: string | null;
    credit: string | null;
    license: string | null;
    sourceUrl: string | null;
    width: number | null;
    height: number | null;
  }[];
  variants: { id: string; sku: string; colour: string | null; colourHex: string | null; size: string | null; stock: number }[];
  collections: { collection: { slug: string } }[];
}

interface VariantDraft {
  id?: string;
  sku: string;
  colour: string;
  colourHex: string;
  size: string;
  stock: number;
}

const SIZE_PRESETS: Record<string, string[]> = {
  "Women XS–XL": ["XS", "S", "M", "L", "XL"],
  "Men S–XXL": ["S", "M", "L", "XL", "XXL"],
  "Women denim 24–32": ["24", "25", "26", "27", "28", "29", "30", "31", "32"],
  "Men denim 28–38": ["28", "29", "30", "31", "32", "33", "34", "36", "38"],
  "One size": ["One size"],
};

const micros = (m: string) => {
  const n = BigInt(m);
  return `${n / 1_000_000n}.${(n % 1_000_000n).toString().padStart(6, "0").slice(0, 2)}`;
};

const skuPart = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "")
    .slice(0, 6) || "X";

/** Shared seller/admin product editor (create + edit). */
export function ProductEditor({
  productId,
  backHref,
  sellerParam,
}: {
  productId: string | null;
  backHref: string;
  /** admins creating a product choose the seller */
  sellerParam?: string;
}) {
  const q = useQuery({
    queryKey: ["edit-product", productId],
    queryFn: () => api<{ product: EditableProduct }>(`/api/products/${productId}?edit=1`),
    enabled: !!productId,
  });
  if (productId && q.isLoading) return <Skeleton className="h-[600px]" />;
  if (productId && q.isError) return <p className="text-danger">{errorMessage(q.error)}</p>;
  return <EditorForm initial={q.data?.product ?? null} backHref={backHref} sellerParam={sellerParam} />;
}

function EditorForm({
  initial,
  backHref,
  sellerParam,
}: {
  initial: EditableProduct | null;
  backHref: string;
  sellerParam?: string;
}) {
  const router = useRouter();
  const qc = useQueryClient();
  const collections = useQuery({
    queryKey: ["collections"],
    queryFn: () => api<{ items: { slug: string; title: string }[] }>("/api/collections"),
  });
  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [price, setPrice] = useState(initial ? micros(initial.priceUsdMicros) : "");
  const [department, setDepartment] = useState(initial?.department ?? "women");
  const [category, setCategory] = useState(initial?.category ?? "dresses");
  const [subcategory, setSubcategory] = useState(initial?.subcategory ?? "");
  const [material, setMaterial] = useState(initial?.material ?? "");
  const [fit, setFit] = useState(initial?.fit ?? "");
  const [care, setCare] = useState((initial?.care ?? []).join("\n"));
  const [sizeChartKey, setSizeChartKey] = useState(initial?.sizeChartKey ?? "women-tops");
  const [status, setStatus] = useState<EditableProduct["status"]>(initial?.status ?? "DRAFT");
  const [featured, setFeatured] = useState(initial?.featured ?? false);
  const [cols, setCols] = useState<string[]>(initial?.collections.map((c) => c.collection.slug) ?? []);
  const [images, setImages] = useState(
    initial?.gallery.map((g) => ({ ...g, colour: g.colour ?? "" })) ?? [],
  );
  const [variants, setVariants] = useState<VariantDraft[]>(
    initial?.variants.map((v) => ({
      id: v.id,
      sku: v.sku,
      colour: v.colour ?? "Default",
      colourHex: v.colourHex ?? "#cccccc",
      size: v.size ?? "One size",
      stock: v.stock,
    })) ?? [],
  );
  const [newImage, setNewImage] = useState("");
  const [newColour, setNewColour] = useState({ name: "", hex: "#1c1c1c" });
  const [preset, setPreset] = useState("Women XS–XL");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const colours = useMemo(() => {
    const m = new Map<string, string>();
    for (const v of variants) if (!m.has(v.colour)) m.set(v.colour, v.colourHex);
    return [...m.entries()];
  }, [variants]);
  const sizes = useMemo(() => sortSizes([...new Set(variants.map((v) => v.size))]), [variants]);

  function addColour() {
    const name = newColour.name.trim();
    if (!name || colours.some(([c]) => c.toLowerCase() === name.toLowerCase())) return;
    const useSizes = sizes.length ? sizes : SIZE_PRESETS[preset]!;
    const base = skuPart(title || "ITEM");
    setVariants([
      ...variants,
      ...useSizes.map((size) => ({
        sku: `${base}-${skuPart(name)}-${skuPart(size)}`,
        colour: name,
        colourHex: newColour.hex,
        size,
        stock: 0,
      })),
    ]);
    setNewColour({ name: "", hex: "#1c1c1c" });
  }

  function applySizes(list: string[]) {
    const base = skuPart(title || "ITEM");
    const next: VariantDraft[] = [];
    for (const [colour, hex] of colours.length ? colours : [["Default", "#cccccc"] as [string, string]]) {
      for (const size of list) {
        next.push(
          variants.find((v) => v.colour === colour && v.size === size) ?? {
            sku: `${base}-${skuPart(colour)}-${skuPart(size)}`,
            colour,
            colourHex: hex,
            size,
            stock: 0,
          },
        );
      }
    }
    setVariants(next);
  }

  const save = useMutation({
    mutationFn: () => {
      const body = {
        title,
        description,
        price,
        department,
        category,
        subcategory: subcategory || null,
        material: material || null,
        fit: fit || null,
        care: care
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean),
        sizeChartKey: sizeChartKey || null,
        status,
        featured,
        collections: cols,
        chainListingOptions: initial?.chainListingOptions ?? [],
        images: images.map((i) => ({
          url: i.url,
          alt: i.alt,
          colour: i.colour || null,
          credit: i.credit,
          license: i.license,
          sourceUrl: i.sourceUrl,
          width: i.width,
          height: i.height,
        })),
        variants: variants.map((v) => ({
          id: v.id,
          sku: v.sku,
          colour: v.colour,
          colourHex: v.colourHex,
          size: v.size,
          stock: Number(v.stock) || 0,
        })),
      };
      return initial
        ? api<{ product: EditableProduct }>(`/api/products/${initial.id}`, { method: "PATCH", body })
        : api<{ product: EditableProduct }>(`/api/products${sellerParam ? `?seller=${encodeURIComponent(sellerParam)}` : ""}`, { body });
    },
    onSuccess: (r) => {
      toast.success(initial ? "Product saved" : "Product created");
      qc.invalidateQueries({ queryKey: ["my-products"] });
      qc.invalidateQueries({ queryKey: ["edit-product", r.product.id] });
      if (!initial) router.replace(`${backHref}/${r.product.id}`);
    },
    onError: (err) => {
      const fe = err instanceof ApiClientError ? (err.details as { fieldErrors?: Record<string, string[]> })?.fieldErrors : null;
      if (fe) setErrors(Object.fromEntries(Object.entries(fe).map(([k, v]) => [k, v[0] ?? ""])));
      toast.error(errorMessage(err));
    },
  });

  return (
    <form
      className="space-y-12"
      onSubmit={(e) => {
        e.preventDefault();
        setErrors({});
        save.mutate();
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={backHref} className="text-sm text-muted-foreground hover:text-foreground">
          ← All products
        </Link>
        <div className="flex gap-2">
          {initial && (
            <Button asChild variant="outline">
              <Link href={`/products/${initial.id}`} target="_blank">
                View in store
              </Link>
            </Button>
          )}
          <Button type="submit" loading={save.isPending}>
            {initial ? "Save changes" : "Create product"}
          </Button>
        </div>
      </div>

      <Section title="Details">
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Title" htmlFor="p-title" error={errors.title} className="md:col-span-2">
            <Input id="p-title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </Field>
          <Field label="Description" htmlFor="p-desc" error={errors.description} className="md:col-span-2">
            <Textarea id="p-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} required />
          </Field>
          <Field label="Price (USD)" htmlFor="p-price" error={errors.price} hint="Whole cents, e.g. 129.00">
            <Input id="p-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} required />
          </Field>
          <Field label="Status" htmlFor="p-status">
            <Select id="p-status" value={status} onChange={(e) => setStatus(e.target.value as EditableProduct["status"])}>
              <option value="DRAFT">Draft (hidden)</option>
              <option value="ACTIVE">Active (for sale)</option>
              <option value="ARCHIVED">Archived</option>
            </Select>
          </Field>
          <Field label="Department" htmlFor="p-dept">
            <Select id="p-dept" value={department} onChange={(e) => setDepartment(e.target.value)}>
              {DEPARTMENTS.map((d) => (
                <option key={d} value={d}>
                  {DEPARTMENT_LABEL[d]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Category" htmlFor="p-cat">
            <Select id="p-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
              {PRODUCT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {CATEGORY_LABEL[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Style (subcategory)" htmlFor="p-sub" hint="e.g. Maxi dresses">
            <Input id="p-sub" value={subcategory} onChange={(e) => setSubcategory(e.target.value)} />
          </Field>
          <label className="flex items-center gap-3 self-end pb-3 text-sm">
            <Checkbox checked={featured} onCheckedChange={(v) => setFeatured(v === true)} /> Featured (sorted first)
          </label>
        </div>
      </Section>

      <Section title="Fit, material & care">
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Material" htmlFor="p-mat" hint="Fibre composition as on the care label">
            <Input id="p-mat" value={material} onChange={(e) => setMaterial(e.target.value)} />
          </Field>
          <Field label="Fit" htmlFor="p-fit">
            <Input id="p-fit" value={fit} onChange={(e) => setFit(e.target.value)} />
          </Field>
          <Field label="Care (one instruction per line)" htmlFor="p-care" className="md:col-span-2">
            <Textarea id="p-care" value={care} onChange={(e) => setCare(e.target.value)} rows={3} />
          </Field>
          <Field label="Size chart" htmlFor="p-chart">
            <Select id="p-chart" value={sizeChartKey} onChange={(e) => setSizeChartKey(e.target.value)}>
              <option value="">None</option>
              {Object.values(SIZE_CHARTS).map((c) => (
                <option key={c.key} value={c.key}>
                  {c.title}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </Section>

      <Section title="Collections">
        {collections.isLoading ? (
          <Skeleton className="h-10" />
        ) : (
          <div className="flex flex-wrap gap-x-6 gap-y-3">
            {collections.data?.items.map((c) => (
              <label key={c.slug} className="flex items-center gap-2.5 text-sm">
                <Checkbox
                  checked={cols.includes(c.slug)}
                  onCheckedChange={(v) => setCols(v === true ? [...cols, c.slug] : cols.filter((x) => x !== c.slug))}
                />
                {c.title}
              </label>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Images"
        description="First image is the main image. Tag each image with the colour it shows so shoppers only see matching photos. Use an https:// URL or a /images/… path."
      >
        {errors.images && <p className="mb-3 text-sm text-danger">{errors.images}</p>}
        <ul className="space-y-3">
          {images.map((img, i) => (
            <li key={`${img.url}-${i}`} className="flex flex-wrap items-start gap-4 border border-border p-3">
              <div className="w-16 shrink-0">
                <div className="relative aspect-[3/4] w-16 bg-muted">
                  {img.url.startsWith("/") ? (
                    <Image src={img.url} alt="" fill sizes="64px" className="object-cover" />
                  ) : img.url.startsWith("https://") ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img.url} alt="" className="size-full object-cover" />
                  ) : null}
                </div>
                {img.width && img.height ? (
                  <p className={cn("mt-1 text-[10px]", Math.max(img.width, img.height) < 1600 ? "text-warning" : "text-muted-foreground")}>
                    {img.width}×{img.height}
                  </p>
                ) : null}
              </div>
              <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                <Input aria-label="Image URL" value={img.url} onChange={(e) => setImages(images.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} className="h-10 text-xs sm:col-span-2" />
                <Input aria-label="Alt text" placeholder="Alt text (what the image shows)" value={img.alt} onChange={(e) => setImages(images.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)))} className="h-10" />
                <Select aria-label="Colour shown" value={img.colour} onChange={(e) => setImages(images.map((x, j) => (j === i ? { ...x, colour: e.target.value } : x)))} className="h-10">
                  <option value="">All colours</option>
                  {colours.map(([c]) => (
                    <option key={c}>{c}</option>
                  ))}
                </Select>
              </div>
              <div className="flex gap-1">
                <IconBtn label="Move up" disabled={i === 0} onClick={() => setImages(move(images, i, -1))}>
                  <ArrowUp />
                </IconBtn>
                <IconBtn label="Move down" disabled={i === images.length - 1} onClick={() => setImages(move(images, i, 1))}>
                  <ArrowDown />
                </IconBtn>
                <IconBtn label="Remove image" onClick={() => setImages(images.filter((_, j) => j !== i))}>
                  <Trash2 />
                </IconBtn>
              </div>
            </li>
          ))}
        </ul>
        <UploadButton
          onUploaded={(u) =>
            setImages((prev) => [
              ...prev,
              { url: u.url, alt: title ? `${title}` : "Product image", colour: "", credit: null, license: null, sourceUrl: null, width: u.width, height: u.height },
            ])
          }
        />
        <div className="mt-3 flex gap-2">
          <Input aria-label="New image URL" placeholder="https://… or /images/…" value={newImage} onChange={(e) => setNewImage(e.target.value)} className="h-10" />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-10"
            onClick={() => {
              if (!newImage.trim()) return;
              setImages([...images, { url: newImage.trim(), alt: title || "Product image", colour: "", credit: null, license: null, sourceUrl: null, width: null, height: null }]);
              setNewImage("");
            }}
          >
            <Plus /> Add image
          </Button>
        </div>
      </Section>

      <Section title="Colours, sizes & stock" description="Each colour × size is a SKU with its own stock. Stock 0 shows as sold out.">
        {errors.variants && <p className="mb-3 text-sm text-danger">{errors.variants}</p>}
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Size range" htmlFor="p-preset">
            <Select id="p-preset" value={preset} onChange={(e) => setPreset(e.target.value)} className="h-10 w-52">
              {Object.keys(SIZE_PRESETS).map((k) => (
                <option key={k}>{k}</option>
              ))}
            </Select>
          </Field>
          <Button type="button" variant="outline" size="sm" className="h-10" onClick={() => applySizes(SIZE_PRESETS[preset]!)}>
            Apply sizes
          </Button>
          <span className="mx-2 hidden h-10 w-px bg-border sm:block" />
          <Field label="New colour" htmlFor="p-ncol">
            <div className="flex gap-2">
              <Input id="p-ncol" placeholder="e.g. Ecru" value={newColour.name} onChange={(e) => setNewColour({ ...newColour, name: e.target.value })} className="h-10 w-36" />
              <input aria-label="Colour swatch" type="color" value={newColour.hex} onChange={(e) => setNewColour({ ...newColour, hex: e.target.value })} className="h-10 w-12 cursor-pointer border border-input bg-card p-1" />
            </div>
          </Field>
          <Button type="button" variant="outline" size="sm" className="h-10" onClick={addColour}>
            <Plus /> Add colour
          </Button>
        </div>
        {colours.length === 0 ? (
          <p className="mt-6 text-sm text-muted-foreground">Add a colour to create its SKUs.</p>
        ) : (
          <div className="mt-6 space-y-6">
            {colours.map(([colour, hex]) => (
              <div key={colour} className="border border-border">
                <div className="flex items-center justify-between gap-3 border-b border-border bg-muted/50 px-3 py-2">
                  <div className="flex items-center gap-2 text-sm">
                    <input
                      type="color"
                      aria-label={`${colour} swatch`}
                      value={hex}
                      onChange={(e) => setVariants(variants.map((v) => (v.colour === colour ? { ...v, colourHex: e.target.value } : v)))}
                      className="size-7 cursor-pointer border border-input bg-card p-0.5"
                    />
                    {colour}
                    <span className="text-muted-foreground">
                      · {variants.filter((v) => v.colour === colour).reduce((s, v) => s + Number(v.stock || 0), 0)} in stock
                    </span>
                  </div>
                  <IconBtn label={`Remove ${colour}`} onClick={() => setVariants(variants.filter((v) => v.colour !== colour))}>
                    <X />
                  </IconBtn>
                </div>
                <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Table (scrolls horizontally)">
                  <table className="w-full min-w-[520px] text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Size</th>
                        <th className="px-3 py-2 font-medium">SKU</th>
                        <th className="px-3 py-2 font-medium">Stock</th>
                      </tr>
                    </thead>
                    <tbody>
                      {variants
                        .map((v, idx) => ({ v, idx }))
                        .filter(({ v }) => v.colour === colour)
                        .map(({ v, idx }) => (
                          <tr key={`${v.colour}-${v.size}`} className="border-t border-border">
                            <td className="px-3 py-2">{v.size}</td>
                            <td className="px-3 py-2">
                              <Input aria-label={`SKU ${colour} ${v.size}`} value={v.sku} onChange={(e) => setVariants(variants.map((x, j) => (j === idx ? { ...x, sku: e.target.value } : x)))} className="h-9 font-mono text-xs" />
                            </td>
                            <td className="px-3 py-2">
                              <Input
                                aria-label={`Stock ${colour} ${v.size}`}
                                type="number"
                                min={0}
                                value={v.stock}
                                onChange={(e) => setVariants(variants.map((x, j) => (j === idx ? { ...x, stock: Math.max(0, Number(e.target.value)) } : x)))}
                                className={cn("h-9 w-24", Number(v.stock) === 0 && "text-danger")}
                              />
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <div className="flex justify-end border-t border-border pt-6">
        <Button type="submit" size="lg" loading={save.isPending}>
          {initial ? "Save changes" : "Create product"}
        </Button>
      </div>
    </form>
  );
}

function UploadButton({ onUploaded }: { onUploaded: (u: { url: string; width: number; height: number }) => void }) {
  const driver = useQuery({ queryKey: ["upload-driver"], queryFn: () => api<{ driver: string | null }>("/api/uploads") });
  const [busy, setBusy] = useState(false);
  if (driver.isLoading) return null;
  if (!driver.data?.driver)
    return <p className="mt-4 text-[0.8125rem] text-muted-foreground">Image uploads are not configured on this deployment — paste image URLs below.</p>;
  return (
    <label className="mt-4 flex cursor-pointer items-center justify-center gap-2 border border-dashed border-input px-4 py-6 text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground">
      <Plus className="size-4" />
      {busy ? "Uploading…" : "Upload images (JPEG, PNG, WebP or AVIF · 1600–2000px long edge recommended)"}
      <input
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp,image/avif"
        className="sr-only"
        disabled={busy}
        onChange={async (e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          setBusy(true);
          for (const f of files) {
            const fd = new FormData();
            fd.append("file", f);
            try {
              const res = await fetch("/api/uploads", { method: "POST", body: fd, credentials: "same-origin" });
              const data = await res.json();
              if (!res.ok) throw new Error(data?.error?.message ?? `Upload failed (${res.status})`);
              onUploaded(data);
              if (!data.recommended) toast.warning(`${f.name}: ${data.width}×${data.height}px — below the 1600px recommended for zoom`);
            } catch (err) {
              toast.error(`${f.name}: ${(err as Error).message}`);
            }
          }
          setBusy(false);
        }}
      />
    </label>
  );
}

function move<T>(list: T[], i: number, d: number): T[] {
  const next = [...list];
  const [x] = next.splice(i, 1);
  next.splice(i + d, 0, x!);
  return next;
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-6 border-t border-border pt-8 lg:grid-cols-[240px_1fr]">
      <div>
        <h2 className="text-[0.9375rem] font-medium">{title}</h2>
        {description && <p className="mt-1 text-[0.8125rem] text-muted-foreground">{description}</p>}
      </div>
      <div>{children}</div>
    </section>
  );
}

function IconBtn({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} disabled={disabled} className="grid size-9 place-items-center text-muted-foreground hover:text-foreground disabled:opacity-30 [&_svg]:size-4">
      {children}
    </button>
  );
}
