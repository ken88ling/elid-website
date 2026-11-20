"use client";

import { useEffect, useMemo, useState } from "react";
import { NoBranch, withRole } from "@/components/app-shell";
import {
  Badge,
  Button,
  Checkbox,
  DataTable,
  Field,
  FormModal,
  Input,
  PageHeader,
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

      <DataTable
        error={loadError}
        loading={!products}
        isEmpty={filtered.length === 0}
        emptyTitle="No products found"
        columns={[
          "Product",
          "SKU",
          "Barcode",
          "Category",
          { label: "Price", align: "right" },
          { label: "Stock", align: "right" },
          "Status",
        ]}
        actions
      >
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
      </DataTable>

      <FormModal
        open={editing !== null}
        title={editing === "new" ? "Add product" : "Edit product"}
        onClose={() => setEditing(null)}
        onSubmit={saveProduct}
        error={formError}
        saving={saving}
      >
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
            <Checkbox
              label="Active (available in POS)"
              checked={form.active}
              onChange={(active) => setForm({ ...form, active })}
            />
          )}
      </FormModal>

      <FormModal
        open={stockFor !== null}
        title={`Set stock: ${stockFor?.name ?? ""}`}
        size="sm"
        onClose={() => setStockFor(null)}
        onSubmit={saveStock}
        error={stockError}
        saving={saving}
      >
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
      </FormModal>
    </div>
  );
}

export default withRole(["admin", "manager"], ProductsView);
