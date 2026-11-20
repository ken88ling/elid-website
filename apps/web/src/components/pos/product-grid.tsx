"use client";

import { Badge, Card, cx } from "@/components/ui";
import { formatMoney } from "@/lib/format";
import type { ProductWithStock } from "@/lib/types";

export function CategoryTabs({
  categories,
  value,
  onChange,
}: {
  categories: string[];
  value: string;
  onChange: (category: string) => void;
}) {
  return (
    <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
      {categories.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          className={cx(
            "rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap",
            c === value
              ? "bg-zinc-900 text-white"
              : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-100",
          )}
        >
          {c}
        </button>
      ))}
    </div>
  );
}

export function ProductGrid({
  products,
  inCart,
  onAdd,
}: {
  products: ProductWithStock[];
  /** Quantity of a product already in the cart */
  inCart: (productId: string) => number;
  onAdd: (product: ProductWithStock) => void;
}) {
  if (products.length === 0) {
    return <Card className="p-8 text-center text-sm text-zinc-500">No products found.</Card>;
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
      {products.map((p) => {
        const left = p.stock - inCart(p.id);
        return (
          <button
            key={p.id}
            type="button"
            disabled={left <= 0}
            onClick={() => onAdd(p)}
            className="flex min-h-28 flex-col rounded-xl border border-zinc-200 bg-white p-3 text-left shadow-sm transition hover:border-indigo-400 hover:shadow disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-zinc-200"
          >
            <span className="line-clamp-2 text-sm font-medium text-zinc-900">{p.name}</span>
            <span className="mt-0.5 text-xs text-zinc-500">{p.sku}</span>
            <span className="mt-auto flex items-end justify-between gap-2 pt-2">
              <span className="font-semibold text-zinc-900">{formatMoney(p.priceCents)}</span>
              {p.stock === 0 ? (
                <Badge tone="red">Out</Badge>
              ) : (
                <Badge tone={left <= 5 ? "amber" : "neutral"}>{left} left</Badge>
              )}
            </span>
          </button>
        );
      })}
    </div>
  );
}
