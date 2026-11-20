"use client";

import { useEffect, useState } from "react";
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
  Select,
  table,
} from "@/components/ui";
import { api, errorMessage } from "@/lib/data";
import { useSession } from "@/lib/session";
import { ROLE_LABELS, type Role, type User } from "@/lib/types";

type FormState = {
  name: string;
  email: string;
  password: string;
  role: Role;
  branchId: string;
  active: boolean;
};

function UsersView() {
  const { user: me, branches } = useSession();
  const [users, setUsers] = useState<User[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const [editing, setEditing] = useState<User | "new" | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    api.users.list().then(
      (rows) => active && setUsers(rows),
      (err: unknown) => active && setLoadError(errorMessage(err)),
    );
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const branchName = (id: string | null) =>
    id ? (branches.find((b) => b.id === id)?.name ?? "Unknown") : "All branches";

  function openEditor(target: User | "new") {
    setEditing(target);
    setFormError(null);
    setForm(
      target === "new"
        ? { name: "", email: "", password: "", role: "cashier", branchId: branches[0]?.id ?? "", active: true }
        : {
            name: target.name,
            email: target.email,
            password: "",
            role: target.role,
            branchId: target.branchId ?? branches[0]?.id ?? "",
            active: target.active,
          },
    );
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || !editing) return;
    setSaving(true);
    setFormError(null);
    const branchId = form.role === "admin" ? null : form.branchId || null;
    try {
      if (editing === "new") {
        await api.users.create({ ...form, branchId });
      } else {
        await api.users.update(editing.id, {
          name: form.name,
          role: form.role,
          branchId,
          active: form.active,
          password: form.password || undefined,
        });
      }
      setEditing(null);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setFormError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  const isSelf = editing !== null && editing !== "new" && editing.id === me.id;

  return (
    <div>
      <PageHeader
        title="Users"
        description="Staff accounts and what they can access"
        actions={<Button onClick={() => openEditor("new")}>Add user</Button>}
      />

      <DataTable
        error={loadError}
        loading={!users}
        isEmpty={users?.length === 0}
        emptyTitle="No users"
        columns={["Name", "Email", "Role", "Branch", "Status"]}
        actions
      >
        {users?.map((u) => (
          <tr key={u.id}>
            <td className={`${table.td} font-medium text-zinc-900`}>
              {u.name}
              {u.id === me.id && <span className="ml-2 text-xs text-zinc-500">(you)</span>}
            </td>
            <td className={table.td}>{u.email}</td>
            <td className={table.td}>
              <Badge tone={u.role === "admin" ? "indigo" : "neutral"}>{ROLE_LABELS[u.role]}</Badge>
            </td>
            <td className={table.td}>{branchName(u.branchId)}</td>
            <td className={table.td}>
              {u.active ? <Badge tone="green">Active</Badge> : <Badge>Deactivated</Badge>}
            </td>
            <td className={`${table.td} text-right`}>
              <Button variant="ghost" size="sm" onClick={() => openEditor(u)}>
                Edit
              </Button>
            </td>
          </tr>
        ))}
      </DataTable>

      <FormModal
        open={editing !== null && form !== null}
        title={editing === "new" ? "Add user" : "Edit user"}
        onClose={() => setEditing(null)}
        onSubmit={save}
        error={formError}
        saving={saving}
      >
        {form && (
          <>
            <Field label="Name">
              <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                required
                disabled={editing !== "new"}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </Field>
            <Field
              label={editing === "new" ? "Password" : "New password"}
              hint={editing === "new" ? "At least 8 characters" : "Leave blank to keep the current password"}
            >
              <Input
                type="password"
                autoComplete="new-password"
                required={editing === "new"}
                minLength={8}
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Role" hint={isSelf ? "You can't change your own role" : undefined}>
                <Select
                  value={form.role}
                  disabled={isSelf}
                  onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
                >
                  {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Branch" hint={form.role === "admin" ? "Admins can access all branches" : undefined}>
                <Select
                  value={form.role === "admin" ? "" : form.branchId}
                  disabled={form.role === "admin"}
                  onChange={(e) => setForm({ ...form, branchId: e.target.value })}
                >
                  {form.role === "admin" && <option value="">All branches</option>}
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.code}){b.active ? "" : " — inactive"}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {editing !== "new" && !isSelf && (
              <Checkbox
                label="Active (can sign in)"
                checked={form.active}
                onChange={(active) => setForm({ ...form, active })}
              />
            )}
          </>
        )}
      </FormModal>
    </div>
  );
}

export default withRole(["admin"], UsersView);
