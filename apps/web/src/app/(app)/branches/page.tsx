"use client";

import { useState } from "react";
import { RequireRole } from "@/components/app-shell";
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
  table,
} from "@/components/ui";
import { api, errorMessage } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { useSession } from "@/lib/session";
import type { Branch } from "@/lib/types";

type FormState = { code: string; name: string; address: string; active: boolean };

function BranchesView() {
  // Admins already have every branch in the session; reload it after changes.
  const { branches, reloadBranches } = useSession();
  const [editing, setEditing] = useState<Branch | "new" | null>(null);
  const [form, setForm] = useState<FormState>({ code: "", name: "", address: "", active: true });
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function openEditor(target: Branch | "new") {
    setEditing(target);
    setFormError(null);
    setForm(
      target === "new"
        ? { code: "", name: "", address: "", active: true }
        : { code: target.code, name: target.name, address: target.address, active: target.active },
    );
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    try {
      if (editing === "new") {
        await api.branches.create(form);
      } else if (editing) {
        await api.branches.update(editing.id, {
          name: form.name,
          address: form.address,
          active: form.active,
        });
      }
      await reloadBranches();
      setEditing(null);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Branches"
        description="Store locations. Each branch has its own stock and sales."
        actions={<Button onClick={() => openEditor("new")}>Add branch</Button>}
      />

      <Card>
        {branches.length === 0 ? (
          <EmptyState title="No branches yet" description="Add your first store location." />
        ) : (
          <div className={table.wrap}>
            <table className={table.table}>
              <thead className="bg-zinc-50">
                <tr>
                  <th className={table.th}>Code</th>
                  <th className={table.th}>Name</th>
                  <th className={table.th}>Address</th>
                  <th className={table.th}>Created</th>
                  <th className={table.th}>Status</th>
                  <th className={table.th}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className={table.tbody}>
                {branches.map((b) => (
                  <tr key={b.id}>
                    <td className={`${table.td} font-mono font-medium text-zinc-900`}>{b.code}</td>
                    <td className={`${table.td} font-medium text-zinc-900`}>{b.name}</td>
                    <td className={table.td}>{b.address || "—"}</td>
                    <td className={table.td}>{formatDateTime(b.createdAt)}</td>
                    <td className={table.td}>
                      {b.active ? <Badge tone="green">Active</Badge> : <Badge>Inactive</Badge>}
                    </td>
                    <td className={`${table.td} text-right`}>
                      <Button variant="ghost" size="sm" onClick={() => openEditor(b)}>
                        Edit
                      </Button>
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
        title={editing === "new" ? "Add branch" : "Edit branch"}
        onClose={() => setEditing(null)}
      >
        <form onSubmit={save} className="space-y-4">
          <ErrorBanner message={formError} />
          <div className="grid gap-4 sm:grid-cols-[120px_1fr]">
            <Field label="Code" hint={editing === "new" ? "2–8 letters/numbers" : "Can't be changed"}>
              <Input
                required
                disabled={editing !== "new"}
                maxLength={8}
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
              />
            </Field>
            <Field label="Name">
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
          </div>
          <Field label="Address">
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </Field>
          {editing !== "new" && (
            <label className="flex items-center gap-2 text-sm text-zinc-700">
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="size-4 rounded border-zinc-300"
              />
              Active (staff can sign in and sell here)
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
    </div>
  );
}

export default function BranchesPage() {
  return (
    <RequireRole roles={["admin"]}>
      <BranchesView />
    </RequireRole>
  );
}
