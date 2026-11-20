# Retail Business Management System — TODO

Scope (v1): **POS / sales**, **staff login with roles** (Admin, Manager, Cashier),
**multiple branches**, **plain Tailwind** UI.

Approach: build the **web (Next.js) first with mock data**, behind a data layer
(`apps/web/src/lib/data`) that has the same shape the Hono API will have later.
Swapping mock → real API should only touch that layer.

Legend: `[ ]` todo · `[x]` done · `[~]` in progress

---

## Phase 1 — Web foundation (mock data)

### Setup
- [x] Remove the todo demo (page, component, typed client usage)
- [x] App metadata, fonts, base colours (light + dark) in `globals.css`
- [x] Shared UI kit in plain Tailwind: Button, Input, Select, Label, Card, Badge, Table, Modal, EmptyState (inline messages instead of toasts)
- [x] Money helpers (store integer cents, format with configurable currency `NEXT_PUBLIC_CURRENCY`)
- [x] Date helpers (today / date range, display formats)

### Mock data layer
- [x] Types: `Branch`, `User` (role, branchId), `Product`, `BranchStock`, `Sale`, `SaleItem`, `PaymentMethod`, `SaleStatus`
- [x] Seed data: 2–3 branches, admin / manager / cashier users per branch, ~20 products with stock per branch, some past sales
- [x] Mock store persisted to `localStorage` (with “Reset demo data” action)
- [x] Data functions with async signatures matching future API:
  - [x] `auth.login / logout / me`
  - [x] `branches.list / create / update`
  - [x] `products.list(branchId, query) / create / update / setStock`
  - [x] `sales.create / list(filters) / get(id) / refund(id, reason)`
  - [x] `users.list / create / update`
- [x] Business rules enforced in the data layer (so they move to the API unchanged):
  - [x] Cannot sell more than branch stock; stock decremented on sale
  - [x] Refund restocks items, only once, Manager/Admin only
  - [x] Cash payment requires tendered ≥ total; change calculated
  - [x] Discount cannot exceed subtotal
  - [x] Non-admin users only see / act on their own branch

### Auth & roles
- [x] Login page (email + password, demo account hints)
- [x] Session context (`useSession`): current user, current branch
- [x] Protected app layout: redirect to `/login` when signed out
- [x] Role-based navigation and page guards
  - Admin: all branches, POS, Sales, Products, Users, Branches
  - Manager: own branch, POS, Sales (+ refunds), Products (stock)
  - Cashier: own branch, POS, Sales (view own branch)
- [x] Branch switcher (Admin only); remembered per browser
- [x] Logout

### POS (checkout)
- [x] Product search (name / SKU) + barcode/SKU exact match on Enter adds to cart
- [x] Product grid with price and branch stock; out-of-stock disabled
- [x] Cart: add, change quantity (capped by stock), remove, clear
- [x] Discount (amount)
- [x] Totals: subtotal, discount, total
- [x] Payment: Cash (tendered + change), Card, Other
- [x] Complete sale → receipt modal (print, new sale)
- [x] Keyboard-friendly flow; works on tablet width

### Sales
- [x] Sales list: date range (default today), status filter, branch filter (Admin)
- [x] Summary: number of sales, gross revenue, refunds, net
- [x] Sale detail / receipt view with print
- [x] Refund with reason (Manager/Admin), shows refunded by / at

### Products (minimal, to support POS)
- [x] Product list with stock for current branch
- [x] Add / edit product (Admin): SKU, barcode, name, price, active
- [x] Set stock for current branch (Manager/Admin)

### Users (Admin)
- [x] List users with role, branch, status
- [x] Create user (name, email, password, role, branch)
- [x] Edit role / branch, activate / deactivate, reset password
- [x] Cannot deactivate or demote yourself

### Branches (Admin)
- [x] List branches
- [x] Create / edit branch (code, name, address), activate / deactivate

### Quality
- [x] Lint + typecheck + build pass
- [~] Responsive check — desktop verified; tablet/phone still to check
- [x] Manual test pass per role — admin, manager and cashier tested in browser (sale, scan, discount, cash change, receipt, refund + restock, set stock, role/branch guards)

---

## Phase 2 — Backend (Hono + Drizzle + Postgres)

- [x] Schema: branches, users, sessions, products, branch_stock, sales, sale_items (money as integer cents)
- [x] Migrations + seed script (`pnpm db:seed`, `--reset` to wipe) using the same demo data as the web mock (`packages/shared`)
- [x] Auth: password hashing (scrypt), session cookie (httpOnly), `/api/auth/login|logout|me`
- [x] Middleware: `requireAuth`, `requireRole`, branch access check
- [x] Routes: `/api/branches`, `/api/products`, `/api/products/:id/stock`, `/api/sales`, `/api/sales/:id/refund`, `/api/users`
- [x] Sale creation in a DB transaction with atomic stock decrement
- [x] Consistent JSON errors (validation → 400, auth → 401/403, conflicts → 409)
- [x] Remove todo demo routes/table
- [x] Next.js rewrite `/api/*` → Hono (same-origin cookies, no CORS issues)
- [x] End-to-end API checks with curl: auth, role/branch guards, sale validation, atomic stock under 5 concurrent sales of the last unit, refunds + restock, user rules
- [ ] Automated API test suite (none yet)

## Phase 3 — Connect web to API

- [ ] Add `"@app/api": "workspace:*"` and `hono` to apps/web and replace mock data layer with typed Hono RPC client (`hc<AppType>`)
- [ ] Error handling + 401 → login redirect
- [ ] Remove mock store / reset demo action
- [ ] End-to-end test of each role against real DB

## Later / nice to have

- [ ] Inventory: stock adjustments with reasons, transfers between branches, low-stock alerts
- [ ] Customers: records, purchase history, loyalty
- [ ] Suppliers & purchase orders
- [ ] Dashboard & reports: daily sales, top products, per-branch comparison, export CSV
- [ ] Tax (e.g. GST) configuration and tax lines on receipts
- [ ] Shifts / cash drawer open-close and cash reconciliation
- [ ] Receipt printer (thermal) and barcode scanner support
- [ ] Audit log
- [ ] Deployment (Docker, CI, env management)
