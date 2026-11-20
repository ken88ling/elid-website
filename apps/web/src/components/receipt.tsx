import { formatDateTime, formatMoney } from "@/lib/format";
import { PAYMENT_LABELS, type SaleView } from "@/lib/types";

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={strong ? "flex justify-between font-bold" : "flex justify-between"}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}

/** Printable receipt. Only `.print-area` is visible when printing (see globals.css). */
export function Receipt({ sale }: { sale: SaleView }) {
  return (
    <div className="print-area mx-auto w-full max-w-xs font-mono text-xs leading-relaxed text-zinc-900">
      <div className="text-center">
        <p className="text-sm font-bold">{sale.branch.name}</p>
        {sale.branch.address && <p>{sale.branch.address}</p>}
        <p className="mt-2">Receipt {sale.receiptNo}</p>
        <p>{formatDateTime(sale.createdAt)}</p>
        <p>Cashier: {sale.cashierName}</p>
      </div>

      <hr className="my-3 border-dashed border-zinc-400" />

      <div className="space-y-2">
        {sale.items.map((item) => (
          <div key={item.productId}>
            <p>{item.name}</p>
            <Row
              label={`  ${item.quantity} × ${formatMoney(item.unitPriceCents)}`}
              value={formatMoney(item.lineTotalCents)}
            />
          </div>
        ))}
      </div>

      <hr className="my-3 border-dashed border-zinc-400" />

      <Row label="Subtotal" value={formatMoney(sale.subtotalCents)} />
      {sale.discountCents > 0 && (
        <Row label="Discount" value={`-${formatMoney(sale.discountCents)}`} />
      )}
      <Row label="TOTAL" value={formatMoney(sale.totalCents)} strong />

      <hr className="my-3 border-dashed border-zinc-400" />

      <Row label={PAYMENT_LABELS[sale.paymentMethod]} value={formatMoney(sale.tenderedCents)} />
      {sale.paymentMethod === "cash" && (
        <Row label="Change" value={formatMoney(sale.changeCents)} />
      )}

      {sale.status === "refunded" && (
        <div className="mt-3 border border-zinc-900 p-2 text-center">
          <p className="font-bold">REFUNDED</p>
          {sale.refundedAt && <p>{formatDateTime(sale.refundedAt)}</p>}
          {sale.refundedByName && <p>By {sale.refundedByName}</p>}
          {sale.refundReason && <p>{sale.refundReason}</p>}
        </div>
      )}

      <p className="mt-4 text-center">Thank you for shopping with us!</p>
    </div>
  );
}
