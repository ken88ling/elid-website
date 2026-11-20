"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Badge, Card, EmptyState, ErrorBanner, Field, Input, PageHeader, Select, Spinner, table } from "@/components/ui";
import { api, errorMessage } from "@/lib/data";
import { endOfDayIso, formatDateTime, formatMoney, startOfDayIso, toDateInput } from "@/lib/format";
import { useSession } from "@/lib/session";
import { PAYMENT_LABELS, type SaleStatus, type SaleView } from "@/lib/types";

type Result = { key: string; sales?: SaleView[]; error?: string };

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <Card className="p-4">
      <p className="text-sm text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tracking-tight text-zinc-900">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>}
    </Card>
  );
}

export default function SalesPage() {
  const router = useRouter();
  const { user, branches, hasRole } = useSession();
  const isAdmin = hasRole("admin");
  const today = toDateInput(new Date());

  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [status, setStatus] = useState<SaleStatus | "">("");
  const [branchFilter, setBranchFilter] = useState("");
  const [result, setResult] = useState<Result | null>(null);

  const key = JSON.stringify([from, to, status, branchFilter]);

  useEffect(() => {
    let active = true;
    const k = JSON.stringify([from, to, status, branchFilter]);
    api.sales
      .list({
        branchId: branchFilter || undefined,
        from: from ? startOfDayIso(from) : undefined,
        to: to ? endOfDayIso(to) : undefined,
        status: status || undefined,
      })
      .then(
        (sales) => active && setResult({ key: k, sales }),
        (err: unknown) => active && setResult({ key: k, error: errorMessage(err) }),
      );
    return () => {
      active = false;
    };
  }, [from, to, status, branchFilter]);

  const loading = result?.key !== key;
  const sales = useMemo(() => result?.sales ?? [], [result]);

  const summary = useMemo(() => {
    const completed = sales.filter((s) => s.status === "completed");
    const refunded = sales.filter((s) => s.status === "refunded");
    const sum = (list: SaleView[]) => list.reduce((total, s) => total + s.totalCents, 0);
    return {
      completedCount: completed.length,
      revenue: sum(completed),
      refundedCount: refunded.length,
      refunded: sum(refunded),
      items: completed.reduce((n, s) => n + s.items.reduce((m, i) => m + i.quantity, 0), 0),
      average: completed.length ? Math.round(sum(completed) / completed.length) : 0,
    };
  }, [sales]);

  const ownBranch = branches.find((b) => b.id === user.branchId);

  return (
    <div>
      <PageHeader
        title="Sales"
        description={isAdmin ? "Sales across all branches" : `Sales at ${ownBranch?.name ?? "your branch"}`}
      />

      <Card className="mb-6 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="From">
          <Input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="To">
          <Input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </Field>
        <Field label="Status">
          <Select value={status} onChange={(e) => setStatus(e.target.value as SaleStatus | "")}>
            <option value="">All</option>
            <option value="completed">Completed</option>
            <option value="refunded">Refunded</option>
          </Select>
        </Field>
        {isAdmin && (
          <Field label="Branch">
            <Select value={branchFilter} onChange={(e) => setBranchFilter(e.target.value)}>
              <option value="">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </Select>
          </Field>
        )}
      </Card>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Net sales" value={formatMoney(summary.revenue)} sub={`${summary.completedCount} completed`} />
        <Stat label="Average sale" value={formatMoney(summary.average)} />
        <Stat label="Items sold" value={String(summary.items)} />
        <Stat label="Refunds" value={formatMoney(summary.refunded)} sub={`${summary.refundedCount} refunded`} />
      </div>

      <Card>
        {result?.error ? (
          <div className="p-4">
            <ErrorBanner message={result.error} />
          </div>
        ) : loading ? (
          <Spinner />
        ) : sales.length === 0 ? (
          <EmptyState title="No sales" description="Try a different date range or filter." />
        ) : (
          <div className={table.wrap}>
            <table className={table.table}>
              <thead className="bg-zinc-50">
                <tr>
                  <th className={table.th}>Receipt</th>
                  <th className={table.th}>Date</th>
                  {isAdmin && <th className={table.th}>Branch</th>}
                  <th className={table.th}>Cashier</th>
                  <th className={table.th}>Items</th>
                  <th className={table.th}>Payment</th>
                  <th className={`${table.th} text-right`}>Total</th>
                  <th className={table.th}>Status</th>
                </tr>
              </thead>
              <tbody className={table.tbody}>
                {sales.map((sale) => (
                  <tr
                    key={sale.id}
                    onClick={() => router.push(`/sales/${sale.id}`)}
                    className="cursor-pointer hover:bg-zinc-50"
                  >
                    <td className={`${table.td} font-medium text-zinc-900`}>
                      <Link href={`/sales/${sale.id}`} className="hover:text-indigo-600" onClick={(e) => e.stopPropagation()}>
                        {sale.receiptNo}
                      </Link>
                    </td>
                    <td className={table.td}>{formatDateTime(sale.createdAt)}</td>
                    {isAdmin && <td className={table.td}>{sale.branch.name}</td>}
                    <td className={table.td}>{sale.cashierName}</td>
                    <td className={table.td}>{sale.items.reduce((n, i) => n + i.quantity, 0)}</td>
                    <td className={table.td}>{PAYMENT_LABELS[sale.paymentMethod]}</td>
                    <td className={`${table.td} text-right font-medium text-zinc-900`}>
                      {formatMoney(sale.totalCents)}
                    </td>
                    <td className={table.td}>
                      {sale.status === "completed" ? (
                        <Badge tone="green">Completed</Badge>
                      ) : (
                        <Badge tone="red">Refunded</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
