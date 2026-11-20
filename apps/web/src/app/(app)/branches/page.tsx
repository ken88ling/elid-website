"use client";

import { useState } from "react";
import { withRole } from "@/components/app-shell";
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

      <DataTable
        isEmpty={branches.length === 0}
        emptyTitle="No branches yet"
        emptyDescription="Add your first store location."
        columns={["Code", "Name", "Address", "Created", "Status"]}
        actions
      >
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
      </DataTable>

      <FormModal
        open={editing !== null}
        title={editing === "new" ? "Add branch" : "Edit branch"}
        onClose={() => setEditing(null)}
        onSubmit={save}
        error={formError}
        saving={saving}
      >
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
            <Checkbox
              label="Active (staff can sign in and sell here)"
              checked={form.active}
              onChange={(active) => setForm({ ...form, active })}
            />
          )}
      </FormModal>
    </div>
  );
}

export default withRole(["admin"], BranchesView);
