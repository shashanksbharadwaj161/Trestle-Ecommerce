"use client";
import Image from "next/image";
import Link from "@/components/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { CATEGORY_LABEL, type Category } from "@trestle/shared";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/states";
import { Price } from "@/components/price";
import { api, errorMessage } from "@/lib/api";
import type { CardData } from "./product-card";

/** Product table for sellers (own products) and admins (every product, every status). */
export function ProductAdminList({
  basePath,
  extraActions,
}: {
  basePath: string;
  extraActions?: (p: CardData) => React.ReactNode;
}) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [term, setTerm] = useState("");
  const q = useQuery({
    queryKey: ["my-products", term],
    queryFn: () =>
      api<{ items: CardData[]; total: number }>(
        `/api/products?mine=1&pageSize=96&sort=newest${term ? `&q=${encodeURIComponent(term)}` : ""}`,
      ),
  });
  const del = useMutation({
    mutationFn: (id: string) =>
      api<{ archived: boolean; reason?: string }>(`/api/products/${id}`, { method: "DELETE" }),
    onSuccess: (r) => {
      toast.success(r.archived ? (r.reason ?? "Archived") : "Product deleted");
      qc.invalidateQueries({ queryKey: ["my-products"] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <form
          role="search"
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setTerm(search.trim());
          }}
        >
          <Input
            aria-label="Search products"
            placeholder="Search products"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-64"
          />
          <Button type="submit" variant="outline" size="sm" className="h-10" aria-label="Search">
            <Search />
          </Button>
        </form>
        <Button asChild>
          <Link href={`${basePath}/new`}>
            <Plus /> New product
          </Link>
        </Button>
      </div>
      {q.isLoading ? (
        <Skeleton className="h-96" />
      ) : q.isError ? (
        <ErrorState message={errorMessage(q.error)} retry={() => q.refetch()} />
      ) : q.data!.items.length === 0 ? (
        <EmptyState
          title={term ? "No matching products" : "No products yet"}
          action={{ href: `${basePath}/new`, label: "Create a product" }}
        />
      ) : (
        <div
          className="overflow-x-auto border border-border"
          tabIndex={0}
          role="region"
          aria-label="Table (scrolls horizontally)"
        >
          <table className="w-full min-w-[760px] text-sm">
            <caption className="sr-only">Products</caption>
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="p-3 font-medium">
                  Product
                </th>
                <th scope="col" className="p-3 font-medium">
                  Price
                </th>
                <th scope="col" className="p-3 font-medium">
                  Colours
                </th>
                <th scope="col" className="p-3 font-medium">
                  Stock
                </th>
                <th scope="col" className="p-3 font-medium">
                  Status
                </th>
                <th scope="col" className="p-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {q.data!.items.map((p) => {
                const stock = p.sizes.flatMap((s) => s.variants).reduce((a, v) => a + v.stock, 0);
                const soldOutSkus = p.sizes
                  .flatMap((s) => s.variants)
                  .filter((v) => v.stock <= 0).length;
                return (
                  <tr key={p.id} className="border-t border-border">
                    <td className="p-3">
                      <div className="flex items-center gap-3">
                        <div className="relative aspect-[3/4] w-10 shrink-0 bg-muted">
                          {p.colours[0]?.image?.startsWith("/") && (
                            <Image
                              src={p.colours[0].image}
                              alt=""
                              fill
                              sizes="40px"
                              className="object-cover"
                            />
                          )}
                        </div>
                        <div>
                          <Link
                            href={`${basePath}/${p.id}`}
                            className="font-medium hover:underline"
                          >
                            {p.title}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            {CATEGORY_LABEL[p.category as Category] ?? p.category}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="p-3">
                      <Price micros={p.priceUsdMicros} />
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        {p.colours.map((c) => (
                          <span
                            key={c.name}
                            title={c.name}
                            className="size-4 rounded-full ring-1 ring-foreground/15"
                            style={{ background: c.hex ?? "var(--muted)" }}
                          />
                        ))}
                      </div>
                    </td>
                    <td className="tabular p-3">
                      {stock}
                      {soldOutSkus > 0 && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({soldOutSkus} SKU sold out)
                        </span>
                      )}
                    </td>
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
                        {(p.status ?? "").toLowerCase()}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <div className="flex justify-end gap-1">
                        {extraActions?.(p)}
                        <Button asChild size="icon" variant="ghost" aria-label={`Edit ${p.title}`}>
                          <Link href={`${basePath}/${p.id}`}>
                            <Pencil />
                          </Link>
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
