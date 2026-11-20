"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { api } from "@/lib/data";
import { useSession } from "@/lib/session";
import { ROLE_LABELS, type Role } from "@/lib/types";
import { Badge, Button, cx, Modal, Select } from "./ui";

const NAV: { href: string; label: string; roles: Role[] }[] = [
  { href: "/pos", label: "POS", roles: ["admin", "manager", "cashier"] },
  { href: "/sales", label: "Sales", roles: ["admin", "manager", "cashier"] },
  { href: "/products", label: "Products", roles: ["admin", "manager"] },
  { href: "/users", label: "Users", roles: ["admin"] },
  { href: "/branches", label: "Branches", roles: ["admin"] },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, branches, branch, setBranchId, logout, hasRole } = useSession();
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);
  const activeBranches = branches.filter((b) => b.active);

  async function resetDemo() {
    setResetting(true);
    await api.demo.reset();
    window.location.reload();
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="no-print sticky top-0 z-40 border-b border-zinc-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/pos" className="flex items-center gap-2 font-semibold text-zinc-900">
            <span className="grid size-8 place-items-center rounded-lg bg-indigo-600 text-sm text-white">
              R
            </span>
            Retail Manager
          </Link>

          <nav className="order-last -mx-1 flex w-full gap-1 overflow-x-auto md:order-none md:w-auto">
            {NAV.filter((item) => item.roles.includes(user.role)).map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cx(
                    "rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap",
                    active
                      ? "bg-indigo-50 text-indigo-700"
                      : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900",
                  )}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {hasRole("admin") ? (
              <Select
                aria-label="Current branch"
                value={branch?.id ?? ""}
                onChange={(e) => setBranchId(e.target.value)}
                className="h-9 w-auto min-w-36"
              >
                {activeBranches.length === 0 && <option value="">No active branches</option>}
                {activeBranches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </Select>
            ) : (
              <span className="text-sm text-zinc-600">
                {branch ? `${branch.name} (${branch.code})` : "No branch"}
              </span>
            )}

            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight text-zinc-900">{user.name}</p>
              <Badge tone="indigo">{ROLE_LABELS[user.role]}</Badge>
            </div>

            {hasRole("admin") && (
              <Button variant="ghost" size="sm" onClick={() => setConfirmReset(true)}>
                Reset demo
              </Button>
            )}
            <Button variant="secondary" size="sm" onClick={() => void logout()}>
              Log out
            </Button>
          </div>
        </div>
      </header>

      {/* Remount pages when the branch changes so carts and filters start fresh. */}
      <main key={branch?.id ?? "none"} className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
        {children}
      </main>

      <Modal
        open={confirmReset}
        title="Reset demo data?"
        size="sm"
        onClose={() => setConfirmReset(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button variant="danger" disabled={resetting} onClick={() => void resetDemo()}>
              {resetting ? "Resetting…" : "Reset"}
            </Button>
          </>
        }
      >
        <p className="text-sm text-zinc-600">
          This restores the sample branches, users, products, stock and sales. Anything you
          changed will be lost.
        </p>
      </Modal>
    </div>
  );
}

/** Shows children only for the given roles. */
export function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const { hasRole } = useSession();
  if (!hasRole(...roles)) {
    return (
      <div className="py-16 text-center">
        <p className="font-medium text-zinc-900">You don&apos;t have access to this page</p>
        <Link href="/pos" className="mt-2 inline-block text-sm text-indigo-600 hover:underline">
          Go to POS
        </Link>
      </div>
    );
  }
  return <>{children}</>;
}

/** Shown when an admin has no active branch selected. */
export function NoBranch() {
  return (
    <div className="py-16 text-center">
      <p className="font-medium text-zinc-900">No active branch</p>
      <p className="mt-1 text-sm text-zinc-500">Create or activate a branch to continue.</p>
    </div>
  );
}
