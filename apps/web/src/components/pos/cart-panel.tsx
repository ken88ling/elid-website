"use client";

import { useState } from "react";
import { Button, Card, cx, ErrorBanner, Input } from "@/components/ui";
import { formatMoney, parseMoney } from "@/lib/format";
import { PAYMENT_LABELS, type PaymentMethod, type ProductWithStock } from "@/lib/types";

export type CartLine = { product: ProductWithStock; quantity: number };

export type Payment = {
  method: PaymentMethod;
  discountCents: number;
  /** Only for cash */
  tenderedCents?: number;
};

/** Exact amount plus the next few round notes above the total. */
function quickCashOptions(totalCents: number): number[] {
  const options = new Set<number>([totalCents]);
  for (const step of [500, 1000, 2000, 5000, 10000]) {
    options.add(Math.ceil(totalCents / step) * step || step);
  }
  return [...options].filter((v) => v >= totalCents && v > 0).sort((a, b) => a - b).slice(0, 4);
}

function CartLineRow({
  line,
  onQuantity,
}: {
  line: CartLine;
  onQuantity: (quantity: number) => void;
}) {
  const { product, quantity } = line;
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-900">{product.name}</p>
        <p className="text-xs text-zinc-500">{formatMoney(product.priceCents)} each</p>
      </div>
      <div className="flex items-center rounded-lg border border-zinc-300">
        <button
          type="button"
          aria-label={`Decrease ${product.name}`}
          onClick={() => onQuantity(quantity - 1)}
          className="size-8 text-zinc-600 hover:bg-zinc-100"
        >
          −
        </button>
        <input
          aria-label={`Quantity of ${product.name}`}
          inputMode="numeric"
          value={quantity}
          onChange={(e) => {
            const n = Number.parseInt(e.target.value, 10);
            if (!Number.isNaN(n)) onQuantity(n);
          }}
          className="w-9 border-x border-zinc-300 text-center text-sm focus:outline-none"
        />
        <button
          type="button"
          aria-label={`Increase ${product.name}`}
          disabled={quantity >= product.stock}
          onClick={() => onQuantity(quantity + 1)}
          className="size-8 text-zinc-600 hover:bg-zinc-100 disabled:text-zinc-300"
        >
          +
        </button>
      </div>
      <p className="w-20 text-right text-sm font-medium text-zinc-900">
        {formatMoney(product.priceCents * quantity)}
      </p>
    </li>
  );
}

function MoneyField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <label htmlFor={id} className="text-zinc-600">
        {label}
      </label>
      <Input
        id={id}
        inputMode="decimal"
        placeholder="0.00"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 w-28 text-right"
      />
    </div>
  );
}

/**
 * Cart, totals and payment. Owns the payment inputs; the parent owns the cart
 * and performs the sale in `onCharge` (return true on success to reset inputs).
 */
export function CartPanel({
  cart,
  error,
  submitting,
  onQuantity,
  onClear,
  onCharge,
}: {
  cart: CartLine[];
  error: string | null;
  submitting: boolean;
  onQuantity: (productId: string, quantity: number) => void;
  onClear: () => void;
  onCharge: (payment: Payment) => Promise<boolean>;
}) {
  const [discountInput, setDiscountInput] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [tenderedInput, setTenderedInput] = useState("");

  const subtotal = cart.reduce((sum, l) => sum + l.product.priceCents * l.quantity, 0);
  const discount = parseMoney(discountInput) ?? 0;
  const total = Math.max(0, subtotal - discount);
  const tendered = method === "cash" ? parseMoney(tenderedInput) : total;
  const change = tendered !== null ? tendered - total : null;
  const itemCount = cart.reduce((sum, l) => sum + l.quantity, 0);

  let problem: string | null = null;
  if (cart.length === 0) problem = "Add items to start a sale";
  else if (discount > subtotal) problem = "Discount is more than the subtotal";
  else if (method === "cash" && (tendered === null || tendered < total)) {
    problem = "Enter the cash received";
  }

  function resetPayment() {
    setDiscountInput("");
    setTenderedInput("");
    setMethod("cash");
  }

  async function charge() {
    if (problem) return;
    const ok = await onCharge({
      method,
      discountCents: discount,
      tenderedCents: method === "cash" ? (tendered ?? undefined) : undefined,
    });
    if (ok) resetPayment();
  }

  let chargeLabel = `Charge ${formatMoney(total)}`;
  if (submitting) chargeLabel = "Processing…";
  else if (problem && cart.length > 0) chargeLabel = problem;

  return (
    <Card className="flex flex-col">
      <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3">
        <h2 className="font-semibold text-zinc-900">
          Current sale{itemCount > 0 && <span className="text-zinc-500"> · {itemCount} items</span>}
        </h2>
        {cart.length > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              resetPayment();
              onClear();
            }}
          >
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
              <CartLineRow
                key={line.product.id}
                line={line}
                onQuantity={(q) => onQuantity(line.product.id, q)}
              />
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-3 border-t border-zinc-200 px-4 py-4">
        <div className="flex items-center justify-between text-sm">
          <span className="text-zinc-600">Subtotal</span>
          <span className="text-zinc-900">{formatMoney(subtotal)}</span>
        </div>
        <MoneyField id="discount" label="Discount" value={discountInput} onChange={setDiscountInput} />
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
            <MoneyField
              id="tendered"
              label="Cash received"
              value={tenderedInput}
              onChange={setTenderedInput}
            />
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
          {chargeLabel}
        </Button>
      </div>
    </Card>
  );
}
