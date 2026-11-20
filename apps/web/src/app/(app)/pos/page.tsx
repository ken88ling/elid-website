"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { NoBranch } from "@/components/app-shell";
import { CartPanel, type CartLine, type Payment } from "@/components/pos/cart-panel";
import { CategoryTabs, ProductGrid } from "@/components/pos/product-grid";
import { Receipt } from "@/components/receipt";
import { Button, ErrorBanner, Input, Modal, Spinner } from "@/components/ui";
import { api, errorMessage } from "@/lib/data";
import { formatMoney } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { ProductWithStock, SaleView } from "@/lib/types";

const ALL = "All";

function matchesQuery(product: ProductWithStock, q: string) {
  return (
    !q ||
    product.name.toLowerCase().includes(q) ||
    product.sku.toLowerCase().includes(q) ||
    !!product.barcode?.includes(q)
  );
}

/** Keep cart lines in sync with freshly loaded stock and prices. */
function syncCart(lines: CartLine[], products: ProductWithStock[]): CartLine[] {
  return lines.flatMap((line) => {
    const fresh = products.find((p) => p.id === line.product.id);
    const quantity = fresh ? Math.min(line.quantity, fresh.stock) : 0;
    return fresh && quantity > 0 ? [{ product: fresh, quantity }] : [];
  });
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
        setCart((lines) => syncCart(lines, rows));
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
      (p) => (category === ALL || p.category === category) && matchesQuery(p, q),
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
        return quantity <= 0 ? [] : [{ ...l, quantity: Math.min(quantity, l.product.stock) }];
      }),
    );
  }

  /** Barcode scanners type the code and press Enter. */
  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const code = query.trim().toLowerCase();
    if (!code) return;
    const exact = (products ?? []).find((p) => p.sku.toLowerCase() === code || p.barcode === code);
    const target = exact ?? (filtered.length === 1 ? filtered[0] : undefined);
    if (target) {
      addToCart(target);
      setQuery("");
    } else {
      setError(`No product matches “${query.trim()}”`);
    }
  }

  async function charge(payment: Payment): Promise<boolean> {
    if (!branchId) return false;
    setSubmitting(true);
    setError(null);
    try {
      const sale = await api.sales.create({
        branchId,
        items: cart.map((l) => ({ productId: l.product.id, quantity: l.quantity })),
        paymentMethod: payment.method,
        discountCents: payment.discountCents,
        tenderedCents: payment.tenderedCents,
      });
      setReceipt(sale);
      setCart([]);
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    } finally {
      setSubmitting(false);
      setReloadKey((k) => k + 1); // refresh stock either way
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
        <CategoryTabs categories={categories} value={category} onChange={setCategory} />
        <ProductGrid products={filtered} inCart={inCart} onAdd={addToCart} />
      </section>

      <aside className="lg:sticky lg:top-20 lg:self-start">
        <CartPanel
          cart={cart}
          error={error}
          submitting={submitting}
          onQuantity={setQuantity}
          onClear={() => {
            setCart([]);
            setError(null);
          }}
          onCharge={charge}
        />
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
