"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { NoBranch } from "@/components/app-shell";
import { Receipt } from "@/components/receipt";
import { Badge, Button, Card, cx, ErrorBanner, Input, Modal, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/data";
import { formatMoney, parseMoney } from "@/lib/format";
import { useSession } from "@/lib/session";
import {
  PAYMENT_LABELS,
  type PaymentMethod,
  type ProductWithStock,
  type SaleView,
} from "@/lib/types";

type CartLine = { product: ProductWithStock; quantity: number };

const ALL = "All";

/** Exact amount plus the next few round notes above the total. */
function quickCashOptions(totalCents: number): number[] {
  const options = new Set<number>([totalCents]);
  for (const step of [500, 1000, 2000, 5000, 10000]) {
    options.add(Math.ceil(totalCents / step) * step || step);
  }
  return [...options].filter((v) => v >= totalCents && v > 0).sort((a, b) => a - b).slice(0, 4);
}

export default function PosPage() {
  const { branch } = useSession();
  const branchId = branch?.id ?? null;
  const searchRef = useRef<HTMLInputElement>(null);

  const [products, setProducts] = useState<ProductWithStock[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState(ALL);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [discountInput, setDiscountInput] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [tenderedInput, setTenderedInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [receipt, setReceipt] = useState<SaleView | null>(null);

  useEffect(() => {
    if (!branchId) return;
    let active = true;
    api.products.list(branchId).then(
      (rows) => {
        if (!active) return;
        setProducts(rows);
        // Keep cart lines in sync with the latest stock and prices.
        setCart((lines) =>
          lines.flatMap((line) => {
            const fresh = rows.find((p) => p.id === line.product.id);
            return fresh ? [{ product: fresh, quantity: Math.min(line.quantity, fresh.stock) }] : [];
          }).filter((line) => line.quantity > 0),
        );
      },
      (err: unknown) => active && setLoadError(errorMessage(err)),
    );
    return () => {
      active = false;
    };
  }, [branchId, reloadKey]);

  const categories = useMemo(
    () => [ALL, ...new Set((products ?? []).map((p) => p.category))],
    [products],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (products ?? []).filter(
      (p) =>
        (category === ALL || p.category === category) &&
        (!q ||
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          p.barcode?.includes(q)),
    );
  }, [products, query, category]);

  const inCart = (productId: string) =>
    cart.find((line) => line.product.id === productId)?.quantity ?? 0;

  function addToCart(product: ProductWithStock) {
    setError(null);
    if (inCart(product.id) + 1 > product.stock) {
      setError(
        product.stock === 0
          ? `${product.name} is out of stock`
          : `Only ${product.stock} × ${product.name} in stock`,
      );
      return;
    }
    setCart((lines) =>
      lines.some((l) => l.product.id === product.id)
        ? lines.map((l) => (l.product.id === product.id ? { ...l, quantity: l.quantity + 1 } : l))
        : [...lines, { product, quantity: 1 }],
    );
  }

  function setQuantity(productId: string, quantity: number) {
    setError(null);
    setCart((lines) =>
      lines.flatMap((l) => {
        if (l.product.id !== productId) return [l];
        if (quantity <= 0) return [];
        return [{ ...l, quantity: Math.min(quantity, l.product.stock) }];
      }),
    );
  }

  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const code = query.trim().toLowerCase();
    if (!code) return;
    // Barcode scanners type the code and press Enter.
    const exact = (products ?? []).find(
      (p) => p.sku.toLowerCase() === code || p.barcode === code,
    );
    const target = exact ?? (filtered.length === 1 ? filtered[0] : undefined);
    if (target) {
      addToCart(target);
      setQuery("");
    } else {
      setError(`No product matches “${query.trim()}”`);
    }
  }

  const subtotal = cart.reduce((sum, l) => sum + l.product.priceCents * l.quantity, 0);
  const discount = parseMoney(discountInput) ?? 0;
  const total = Math.max(0, subtotal - discount);
  const tendered = method === "cash" ? parseMoney(tenderedInput) : total;
  const change = tendered !== null ? tendered - total : null;
  const itemCount = cart.reduce((sum, l) => sum + l.quantity, 0);

  const problem =
    cart.length === 0
      ? "Add items to start a sale"
      : discount > subtotal
        ? "Discount is more than the subtotal"
        : method === "cash" && (tendered === null || tendered < total)
          ? "Enter the cash received"
          : null;

  function clearSale() {
    setCart([]);
    setDiscountInput("");
    setTenderedInput("");
    setMethod("cash");
    setError(null);
  }

  async function charge() {
    if (!branchId || problem) return;
    setSubmitting(true);
    setError(null);
    try {
      const sale = await api.sales.create({
        branchId,
        items: cart.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
        paymentMethod: method,
        discountCents: discount,
        tenderedCents: method === "cash" ? (tendered ?? undefined) : undefined,
      });
      setReceipt(sale);
      clearSale();
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(errorMessage(err));
      setReloadKey((k) => k + 1); // stock may have changed
    } finally {
      setSubmitting(false);
    }
  }

  function closeReceipt() {
    setReceipt(null);
    searchRef.current?.focus();
  }

  if (!branch) return <NoBranch />;
  if (loadError) return <ErrorBanner message={loadError} />;
  if (!products) return <Spinner label="Loading products…" />;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      {/* Products */}
      <section className="min-w-0 space-y-4">
        <Input
          ref={searchRef}
          autoFocus
          placeholder="Search name, SKU, or scan barcode and press Enter"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onSearchKeyDown}
          className="h-12 text-base"
        />

        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCategory(c)}
              className={cx(
                "rounded-full px-3 py-1.5 text-sm font-medium whitespace-nowrap",
                c === category
                  ? "bg-zinc-900 text-white"
                  : "bg-white text-zinc-600 ring-1 ring-zinc-200 hover:bg-zinc-100",
              )}
            >
              {c}
            </button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <Card className="p-8 text-center text-sm text-zinc-500">No products found.</Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
            {filtered.map((p) => {
              const left = p.stock - inCart(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={left <= 0}
                  onClick={() => addToCart(p)}
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
        )}
      </section>

      {/* Cart & payment */}
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <Card className="flex flex-col">
          <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
            <h2 className="font-semibold text-zinc-900">
              Current sale{itemCount > 0 && <span className="text-zinc-500"> · {itemCount} items</span>}
            </h2>
            {cart.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearSale}>
                Clear
              </Button>
            )}
          </div>

          <div className="max-h-[40vh] overflow-y-auto">
            {cart.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-zinc-500">
                Tap a product or scan a barcode.
              </p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {cart.map((line) => (
                  <li key={line.product.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-zinc-900">{line.product.name}</p>
                      <p className="text-xs text-zinc-500">{formatMoney(line.product.priceCents)} each</p>
                    </div>
                    <div className="flex items-center rounded-lg border border-zinc-300">
                      <button
                        type="button"
                        aria-label={`Decrease ${line.product.name}`}
                        onClick={() => setQuantity(line.product.id, line.quantity - 1)}
                        className="size-8 text-zinc-600 hover:bg-zinc-100"
                      >
                        −
                      </button>
                      <input
                        aria-label={`Quantity of ${line.product.name}`}
                        inputMode="numeric"
                        value={line.quantity}
                        onChange={(e) => {
                          const n = Number.parseInt(e.target.value, 10);
                          if (!Number.isNaN(n)) setQuantity(line.product.id, n);
                        }}
                        className="w-9 border-x border-zinc-300 text-center text-sm focus:outline-none"
                      />
                      <button
                        type="button"
                        aria-label={`Increase ${line.product.name}`}
                        disabled={line.quantity >= line.product.stock}
                        onClick={() => setQuantity(line.product.id, line.quantity + 1)}
                        className="size-8 text-zinc-600 hover:bg-zinc-100 disabled:text-zinc-300"
                      >
                        +
                      </button>
                    </div>
                    <p className="w-20 text-right text-sm font-medium text-zinc-900">
                      {formatMoney(line.product.priceCents * line.quantity)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="space-y-3 border-t border-zinc-200 px-4 py-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-zinc-600">Subtotal</span>
              <span className="text-zinc-900">{formatMoney(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between gap-4 text-sm">
              <label htmlFor="discount" className="text-zinc-600">
                Discount
              </label>
              <Input
                id="discount"
                inputMode="decimal"
                placeholder="0.00"
                value={discountInput}
                onChange={(e) => setDiscountInput(e.target.value)}
                className="h-9 w-28 text-right"
              />
            </div>
            <div className="flex items-center justify-between text-lg font-semibold text-zinc-900">
              <span>Total</span>
              <span>{formatMoney(total)}</span>
            </div>

            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMethod(m)}
                  className={cx(
                    "h-10 rounded-lg text-sm font-medium ring-1",
                    m === method
                      ? "bg-indigo-600 text-white ring-indigo-600"
                      : "bg-white text-zinc-700 ring-zinc-300 hover:bg-zinc-50",
                  )}
                >
                  {PAYMENT_LABELS[m]}
                </button>
              ))}
            </div>

            {method === "cash" && (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-4 text-sm">
                  <label htmlFor="tendered" className="text-zinc-600">
                    Cash received
                  </label>
                  <Input
                    id="tendered"
                    inputMode="decimal"
                    placeholder="0.00"
                    value={tenderedInput}
                    onChange={(e) => setTenderedInput(e.target.value)}
                    className="h-9 w-28 text-right"
                  />
                </div>
                {total > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {quickCashOptions(total).map((amount) => (
                      <Button
                        key={amount}
                        variant="secondary"
                        size="sm"
                        onClick={() => setTenderedInput((amount / 100).toFixed(2))}
                      >
                        {amount === total ? "Exact" : formatMoney(amount)}
                      </Button>
                    ))}
                  </div>
                )}
                {change !== null && change >= 0 && cart.length > 0 && (
                  <div className="flex items-center justify-between rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                    <span>Change</span>
                    <span>{formatMoney(change)}</span>
                  </div>
                )}
              </div>
            )}

            <ErrorBanner message={error} />

            <Button
              size="lg"
              className="w-full"
              disabled={!!problem || submitting}
              onClick={() => void charge()}
            >
              {submitting ? "Processing…" : problem && cart.length > 0 ? problem : `Charge ${formatMoney(total)}`}
            </Button>
          </div>
        </Card>
      </aside>

      <Modal
        open={receipt !== null}
        title="Sale complete"
        size="sm"
        onClose={closeReceipt}
        footer={
          <>
            <Button variant="secondary" onClick={() => window.print()}>
              Print receipt
            </Button>
            <Button onClick={closeReceipt}>New sale</Button>
          </>
        }
      >
        {receipt && (
          <div className="space-y-4">
            {receipt.paymentMethod === "cash" && receipt.changeCents > 0 && (
              <div className="no-print rounded-lg bg-emerald-50 p-3 text-center">
                <p className="text-sm text-emerald-700">Change due</p>
                <p className="text-2xl font-semibold text-emerald-800">
                  {formatMoney(receipt.changeCents)}
                </p>
              </div>
            )}
            <Receipt sale={receipt} />
          </div>
        )}
      </Modal>
    </div>
  );
}
