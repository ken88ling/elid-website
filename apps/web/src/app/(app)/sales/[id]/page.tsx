"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Receipt } from "@/components/receipt";
import { Badge, Button, Card, ErrorBanner, Field, Modal, Spinner, Textarea } from "@/components/ui";
import { api, errorMessage } from "@/lib/data";
import { formatDateTime, formatMoney } from "@/lib/format";
import { useSession } from "@/lib/session";
import { PAYMENT_LABELS, type SaleView } from "@/lib/types";

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 py-2 text-sm">
      <dt className="text-zinc-500">{label}</dt>
      <dd className="text-right font-medium text-zinc-900">{children}</dd>
    </div>
  );
}

export default function SaleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { hasRole } = useSession();
  const [sale, setSale] = useState<SaleView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [refundOpen, setRefundOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [refunding, setRefunding] = useState(false);
  const [refundError, setRefundError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.sales.get(id).then(
      (s) => active && setSale(s),
      (err: unknown) => active && setLoadError(errorMessage(err)),
    );
    return () => {
      active = false;
    };
  }, [id]);

  async function refund() {
    setRefunding(true);
    setRefundError(null);
    try {
      setSale(await api.sales.refund(id, reason));
      setRefundOpen(false);
      setReason("");
    } catch (err) {
      setRefundError(errorMessage(err));
    } finally {
      setRefunding(false);
    }
  }

  const back = (
    <Link href="/sales" className="no-print mb-4 inline-block text-sm text-indigo-600 hover:underline">
      ← Back to sales
    </Link>
  );

  if (loadError) {
    return (
      <div>
        {back}
        <ErrorBanner message={loadError} />
      </div>
    );
  }
  if (!sale) return <Spinner />;

  const canRefund = sale.status === "completed" && hasRole("admin", "manager");

  return (
    <div>
      {back}
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{sale.receiptNo}</h1>
          {sale.status === "completed" ? (
            <Badge tone="green">Completed</Badge>
          ) : (
            <Badge tone="red">Refunded</Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => window.print()}>
            Print receipt
          </Button>
          {canRefund && (
            <Button variant="danger" onClick={() => setRefundOpen(true)}>
              Refund
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="no-print p-5">
          <h2 className="font-semibold text-zinc-900">Details</h2>
          <dl className="mt-2 divide-y divide-zinc-100">
            <Detail label="Date">{formatDateTime(sale.createdAt)}</Detail>
            <Detail label="Branch">
              {sale.branch.name} ({sale.branch.code})
            </Detail>
            <Detail label="Cashier">{sale.cashierName}</Detail>
            <Detail label="Payment">{PAYMENT_LABELS[sale.paymentMethod]}</Detail>
            <Detail label="Items">{sale.items.reduce((n, i) => n + i.quantity, 0)}</Detail>
            <Detail label="Subtotal">{formatMoney(sale.subtotalCents)}</Detail>
            {sale.discountCents > 0 && <Detail label="Discount">-{formatMoney(sale.discountCents)}</Detail>}
            <Detail label="Total">{formatMoney(sale.totalCents)}</Detail>
            {sale.paymentMethod === "cash" && (
              <>
                <Detail label="Cash received">{formatMoney(sale.tenderedCents)}</Detail>
                <Detail label="Change">{formatMoney(sale.changeCents)}</Detail>
              </>
            )}
            {sale.status === "refunded" && (
              <>
                <Detail label="Refunded">{sale.refundedAt ? formatDateTime(sale.refundedAt) : "—"}</Detail>
                <Detail label="Refunded by">{sale.refundedByName ?? "—"}</Detail>
                <Detail label="Reason">{sale.refundReason ?? "—"}</Detail>
              </>
            )}
          </dl>
        </Card>

        <Card className="p-5">
          <Receipt sale={sale} />
        </Card>
      </div>

      <Modal
        open={refundOpen}
        title={`Refund ${sale.receiptNo}`}
        onClose={() => setRefundOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRefundOpen(false)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={refunding} onClick={() => void refund()}>
              {refunding ? "Refunding…" : `Refund ${formatMoney(sale.totalCents)}`}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-zinc-600">
            The full amount is refunded and all items go back into stock at {sale.branch.name}.
            This can&apos;t be undone.
          </p>
          <ErrorBanner message={refundError} />
          <Field label="Reason (optional)">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
