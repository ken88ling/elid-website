"use client";

import { useEffect, useMemo, useState } from "react";
import { NoBranch, RequireRole } from "@/components/app-shell";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  Modal,
  PageHeader,
  Spinner,
  table,
} from "@/components/ui";
import { api, errorMessage } from "@/lib/data";
import { centsToInput, formatMoney, parseMoney } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { ProductWithStock } from "@/lib/types";

type FormState = {
  sku: string;
  barcode: string;
  name: string;
  category: string;
  price: string;
  active: boolean;
};

const emptyForm: FormState = { sku: "", barcode: "", name: "", category: "", price: "", active: true };

function ProductsView() {
  const { branch, hasRole } = useSession();
  const isAdmin = hasRole("admin");
  const branchId = branch?.id ?? null;

  const [products, setProducts] = useState<ProductWithStock[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [query, setQuery] = useState("");

  // Product form (admin)
  const [editing, setEditing] = useState<ProductWithStock | "new" | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Stock form (admin + manager)
  const [stockFor, setStockFor] = useState<ProductWithStock | null>(null);
  const [stockInput, setStockInput] = useState("");
  const [stockError, setStockError] = useState<string | null>(null);

  useEffect(() => {
    if (!branchId) return;
    let active = true;
    api.products.list(branchId, { includeInactive: true }).then(
      (rows) => active && setProducts(rows),
      (err: unknown) => active && setLoadError(errorMessage(err)),
    );
    return () => {
      active = false;
    };
  }, [branchId, reloadKey]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (products ?? []).filter(
      (p) =>
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.barcode?.includes(q),
    );
  }, [products, query]);

  function openEditor(product: ProductWithStock | "new") {
    setEditing(product);
    setFormError(null);
    setForm(
      product === "new"
        ? emptyForm
        : {
            sku: product.sku,
            barcode: product.barcode ?? "",
            name: product.name,
            category: product.category,
            price: centsToInput(product.priceCents),
            active: product.active,
          },
    );
  }

  async function saveProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const priceCents = parseMoney(form.price);
    if (priceCents === null) {
      setFormError("Enter a valid price");
      return;
    }
    setSaving(true);
    setFormError(null);
    const input = {
      sku: form.sku,
      barcode: form.barcode || null,
      name: form.name,
      category: form.category,
      priceCents,
    };
    try {
      if (editing === "new") await api.products.create(input);
      else if (editing) await api.products.update(editing.id, { ...input, active: form.active });
      setEditing(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function saveStock(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!stockFor || !branchId) return;
    const quantity = Number(stockInput);
    setSaving(true);
    setStockError(null);
    try {
      await api.products.setStock(stockFor.id, branchId, quantity);
      setStockFor(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setStockError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const categories = [...new Set((products ?? []).map((p) => p.category))].sort();

  if (!branch) return <NoBranch />;

  return (
    <div>
      <PageHeader
        title="Products"
        description={`Prices apply to all branches. Stock shown for ${branch.name}.`}
        actions={isAdmin && <Button onClick={() => openEditor("new")}>Add product</Button>}
      />

      <Input
        placeholder="Search name, SKU, barcode or category"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-4 max-w-md"
      />

      <Card>
        {loadError ? (
          <div className="p-4">
            <ErrorBanner message={loadError} />
          </div>
        ) : !products ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <EmptyState title="No products found" />
        ) : (
          <div className={table.wrap}>
            <table className={table.table}>
              <thead className="bg-zinc-50">
                <tr>
                  <th className={table.th}>Product</th>
                  <th className={table.th}>SKU</th>
                  <th className={table.th}>Barcode</th>
                  <th className={table.th}>Category</th>
                  <th className={`${table.th} text-right`}>Price</th>
                  <th className={`${table.th} text-right`}>Stock</th>
                  <th className={table.th}>Status</th>
                  <th className={table.th}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className={table.tbody}>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td className={`${table.td} font-medium text-zinc-900`}>{p.name}</td>
                    <td className={table.td}>{p.sku}</td>
                    <td className={`${table.td} font-mono text-xs`}>{p.barcode ?? "—"}</td>
                    <td className={table.td}>{p.category}</td>
                    <td className={`${table.td} text-right`}>{formatMoney(p.priceCents)}</td>
                    <td className={`${table.td} text-right`}>
                      {p.stock === 0 ? (
                        <Badge tone="red">0</Badge>
                      ) : p.stock <= 5 ? (
                        <Badge tone="amber">{p.stock}</Badge>
                      ) : (
                        p.stock
                      )}
                    </td>
                    <td className={table.td}>
                      {p.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}
                    </td>
                    <td className={`${table.td} text-right`}>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setStockFor(p);
                            setStockInput(String(p.stock));
                            setStockError(null);
                          }}
                        >
                          Set stock
                        </Button>
                        {isAdmin && (
                          <Button variant="ghost" size="sm" onClick={() => openEditor(p)}>
                            Edit
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={editing !== null}
        title={editing === "new" ? "Add product" : "Edit product"}
        onClose={() => setEditing(null)}
      >
        <form onSubmit={saveProduct} className="space-y-4">
          <ErrorBanner message={formError} />
          <Field label="Name">
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="SKU">
              <Input required value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </Field>
            <Field label="Barcode" hint="Optional">
              <Input value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} />
            </Field>
            <Field label="Category">
              <Input
                required
                list="product-categories"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
              <datalist id="product-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Price">
              <Input
                required
                inputMode="decimal"
                placeholder="0.00"
                value={form.price}
                onChange={(e) => setForm({ ...form, price: e.target.value })}
              />
            </Field>
          </div>
          {editing !== "new" && (
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="size-4 rounded border-zinc-300"
              />
              Active (available in POS)
            </label>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={stockFor !== null}
        title={`Set stock: ${stockFor?.name ?? ""}`}
        size="sm"
        onClose={() => setStockFor(null)}
      >
        <form onSubmit={saveStock} className="space-y-4">
          <ErrorBanner message={stockError} />
          <Field label={`Quantity at ${branch.name}`}>
            <Input
              type="number"
              min={0}
              step={1}
              required
              autoFocus
              value={stockInput}
              onChange={(e) => setStockInput(e.target.value)}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setStockFor(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

export default function ProductsPage() {
  return (
    <RequireRole roles={["admin", "manager"]}>
      <ProductsView />
    </RequireRole>
  );
}
