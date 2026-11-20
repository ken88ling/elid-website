/**
 * Mock data layer (Phase 1).
 *
 * Every function is async and enforces the same rules the Hono API will enforce,
 * so Phase 3 only needs to swap these implementations for typed API calls.
 * Data lives in localStorage so it survives page reloads.
 */
import type {
  Branch,
  NewSaleInput,
  Product,
  ProductWithStock,
  Role,
  Sale,
  SaleFilters,
  SaleView,
  User,
} from "../types";
import { createSeedDb, DB_VERSION, stockKey, type Db, type StoredUser } from "./seed";

export { DEMO_ACCOUNTS } from "./seed";

const DB_KEY = "rbms.db";
const SESSION_KEY = "rbms.session";

export class DataError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "DataError";
  }
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong";
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

let cache: Db | null = null;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function load(): Db {
  if (cache) return cache;
  let db: Db | null = null;
  try {
    const raw = storage()?.getItem(DB_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Db;
      if (parsed.version === DB_VERSION) db = parsed;
    }
  } catch {
    db = null;
  }
  if (!db) {
    db = createSeedDb();
    save(db);
  }
  cache = db;
  return db;
}

function save(db: Db) {
  cache = db;
  try {
    storage()?.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    // Storage full or blocked: keep working in memory.
  }
}

function getSessionUserId(): string | null {
  try {
    return storage()?.getItem(SESSION_KEY) ?? null;
  } catch {
    return null;
  }
}

function setSessionUserId(id: string | null) {
  try {
    if (id) storage()?.setItem(SESSION_KEY, id);
    else storage()?.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

/** Simulated network latency so loading states are visible. */
const delay = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));
const clone = <T,>(value: T): T => structuredClone(value);
const newId = () => crypto.randomUUID();
const nowIso = () => new Date().toISOString();

// ---------------------------------------------------------------------------
// Rules & helpers
// ---------------------------------------------------------------------------

function publicUser(user: StoredUser): User {
  const { password, ...rest } = user;
  void password;
  return rest;
}

function currentUser(db: Db): StoredUser {
  const id = getSessionUserId();
  const user = id ? db.users.find((u) => u.id === id && u.active) : undefined;
  if (!user) throw new DataError("Please sign in", 401);
  return user;
}

function requireRole(user: StoredUser, ...roles: Role[]) {
  if (!roles.includes(user.role)) {
    throw new DataError("You don't have permission to do that", 403);
  }
}

function assertBranchAccess(user: StoredUser, branchId: string) {
  if (user.role !== "admin" && user.branchId !== branchId) {
    throw new DataError("You don't have access to this branch", 403);
  }
}

function requireText(value: string | undefined, field: string, max = 200): string {
  const text = (value ?? "").trim();
  if (!text) throw new DataError(`${field} is required`, 400);
  if (text.length > max) throw new DataError(`${field} must be at most ${max} characters`, 400);
  return text;
}

function requireCents(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new DataError(`${field} must be a positive amount`, 400);
  }
  return value;
}

function getStock(db: Db, branchId: string, productId: string): number {
  return db.stock[stockKey(branchId, productId)] ?? 0;
}

function findBranch(db: Db, id: string): Branch {
  const branch = db.branches.find((b) => b.id === id);
  if (!branch) throw new DataError("Branch not found", 404);
  return branch;
}

function receiptNo(code: string, number: number) {
  return `${code}-${String(number).padStart(6, "0")}`;
}

function toSaleView(db: Db, sale: Sale): SaleView {
  const branch = findBranch(db, sale.branchId);
  const nameOf = (id: string | null) =>
    id ? (db.users.find((u) => u.id === id)?.name ?? "Unknown") : null;
  return clone({
    ...sale,
    receiptNo: receiptNo(branch.code, sale.number),
    branch: { id: branch.id, code: branch.code, name: branch.name, address: branch.address },
    cashierName: nameOf(sale.cashierId) ?? "Unknown",
    refundedByName: nameOf(sale.refundedById),
  });
}

function validateRoleBranch(db: Db, role: Role, branchId: string | null | undefined) {
  if (role === "admin") return null;
  if (!branchId) throw new DataError("Managers and cashiers must belong to a branch", 400);
  findBranch(db, branchId);
  return branchId;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

const auth = {
  async login(email: string, password: string): Promise<User> {
    await delay(300);
    const db = load();
    const user = db.users.find((u) => u.email === email.trim().toLowerCase());
    if (!user || user.password !== password) {
      throw new DataError("Invalid email or password", 401);
    }
    if (!user.active) throw new DataError("This account has been deactivated", 403);
    if (user.branchId && !findBranch(db, user.branchId).active) {
      throw new DataError("Your branch is inactive. Contact an admin.", 403);
    }
    setSessionUserId(user.id);
    return clone(publicUser(user));
  },

  async logout(): Promise<void> {
    await delay();
    setSessionUserId(null);
  },

  async me(): Promise<User | null> {
    await delay();
    const db = load();
    const id = getSessionUserId();
    const user = id ? db.users.find((u) => u.id === id && u.active) : undefined;
    return user ? clone(publicUser(user)) : null;
  },
};

// ---------------------------------------------------------------------------
// Branches
// ---------------------------------------------------------------------------

const branches = {
  /** Admin: all branches. Others: their own branch only. */
  async list(): Promise<Branch[]> {
    await delay();
    const db = load();
    const user = currentUser(db);
    const rows =
      user.role === "admin" ? db.branches : db.branches.filter((b) => b.id === user.branchId);
    return clone([...rows].sort((a, b) => a.name.localeCompare(b.name)));
  },

  async create(input: { code: string; name: string; address: string }): Promise<Branch> {
    await delay();
    const db = load();
    requireRole(currentUser(db), "admin");
    const code = requireText(input.code, "Code", 8).toUpperCase();
    if (!/^[A-Z0-9]{2,8}$/.test(code)) {
      throw new DataError("Code must be 2–8 letters or numbers", 400);
    }
    if (db.branches.some((b) => b.code === code)) {
      throw new DataError(`Branch code ${code} is already used`, 409);
    }
    const branch: Branch = {
      id: newId(),
      code,
      name: requireText(input.name, "Name", 100),
      address: (input.address ?? "").trim(),
      active: true,
      createdAt: nowIso(),
    };
    db.branches.push(branch);
    save(db);
    return clone(branch);
  },

  async update(
    id: string,
    input: Partial<{ name: string; address: string; active: boolean }>,
  ): Promise<Branch> {
    await delay();
    const db = load();
    requireRole(currentUser(db), "admin");
    const branch = findBranch(db, id);
    if (input.name !== undefined) branch.name = requireText(input.name, "Name", 100);
    if (input.address !== undefined) branch.address = input.address.trim();
    if (input.active !== undefined) branch.active = input.active;
    save(db);
    return clone(branch);
  },
};

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

type ProductInput = {
  sku: string;
  barcode: string | null;
  name: string;
  category: string;
  priceCents: number;
};

function validateProduct(db: Db, input: ProductInput, existingId?: string): ProductInput {
  const sku = requireText(input.sku, "SKU", 40).toUpperCase();
  const barcode = input.barcode?.trim() || null;
  if (db.products.some((p) => p.id !== existingId && p.sku === sku)) {
    throw new DataError(`SKU ${sku} is already used`, 409);
  }
  if (barcode && db.products.some((p) => p.id !== existingId && p.barcode === barcode)) {
    throw new DataError(`Barcode ${barcode} is already used`, 409);
  }
  return {
    sku,
    barcode,
    name: requireText(input.name, "Name", 120),
    category: requireText(input.category, "Category", 60),
    priceCents: requireCents(input.priceCents, "Price"),
  };
}

const products = {
  async list(
    branchId: string,
    options: { includeInactive?: boolean } = {},
  ): Promise<ProductWithStock[]> {
    await delay();
    const db = load();
    assertBranchAccess(currentUser(db), branchId);
    return clone(
      db.products
        .filter((p) => options.includeInactive || p.active)
        .map((p) => ({ ...p, stock: getStock(db, branchId, p.id) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    );
  },

  async create(input: ProductInput): Promise<Product> {
    await delay();
    const db = load();
    requireRole(currentUser(db), "admin");
    const product: Product = {
      id: newId(),
      ...validateProduct(db, input),
      active: true,
      createdAt: nowIso(),
    };
    db.products.push(product);
    save(db);
    return clone(product);
  },

  async update(id: string, input: ProductInput & { active: boolean }): Promise<Product> {
    await delay();
    const db = load();
    requireRole(currentUser(db), "admin");
    const product = db.products.find((p) => p.id === id);
    if (!product) throw new DataError("Product not found", 404);
    Object.assign(product, validateProduct(db, input, id), { active: input.active });
    save(db);
    return clone(product);
  },

  async setStock(productId: string, branchId: string, quantity: number): Promise<number> {
    await delay();
    const db = load();
    const user = currentUser(db);
    requireRole(user, "admin", "manager");
    assertBranchAccess(user, branchId);
    findBranch(db, branchId);
    if (!db.products.some((p) => p.id === productId)) {
      throw new DataError("Product not found", 404);
    }
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 1_000_000) {
      throw new DataError("Stock must be a whole number of 0 or more", 400);
    }
    db.stock[stockKey(branchId, productId)] = quantity;
    save(db);
    return quantity;
  },
};

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

const sales = {
  async create(input: NewSaleInput): Promise<SaleView> {
    await delay(250);
    const db = load();
    const user = currentUser(db);
    assertBranchAccess(user, input.branchId);
    const branch = findBranch(db, input.branchId);
    if (!branch.active) throw new DataError("This branch is inactive", 400);
    if (input.items.length === 0) throw new DataError("The cart is empty", 400);

    // Merge duplicate lines.
    const quantities = new Map<string, number>();
    for (const item of input.items) {
      if (!Number.isInteger(item.quantity) || item.quantity < 1) {
        throw new DataError("Quantities must be whole numbers of 1 or more", 400);
      }
      quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
    }

    // Validate everything before changing any stock (all-or-nothing, like a DB transaction).
    const items = [...quantities].map(([productId, quantity]) => {
      const product = db.products.find((p) => p.id === productId && p.active);
      if (!product) throw new DataError("One or more products are no longer available", 400);
      if (getStock(db, branch.id, productId) < quantity) {
        throw new DataError(`Not enough stock for ${product.name}`, 409);
      }
      return {
        productId,
        sku: product.sku,
        name: product.name,
        unitPriceCents: product.priceCents,
        quantity,
        lineTotalCents: product.priceCents * quantity,
      };
    });

    const subtotalCents = items.reduce((sum, i) => sum + i.lineTotalCents, 0);
    const discountCents = requireCents(input.discountCents, "Discount");
    if (discountCents > subtotalCents) {
      throw new DataError("Discount cannot be more than the subtotal", 400);
    }
    const totalCents = subtotalCents - discountCents;

    let tenderedCents = totalCents;
    if (input.paymentMethod === "cash") {
      if (input.tenderedCents === undefined || input.tenderedCents < totalCents) {
        throw new DataError("Cash received is less than the total", 400);
      }
      tenderedCents = requireCents(input.tenderedCents, "Cash received");
    }

    for (const item of items) {
      db.stock[stockKey(branch.id, item.productId)] =
        getStock(db, branch.id, item.productId) - item.quantity;
    }

    const sale: Sale = {
      id: newId(),
      number: db.nextSaleNumber++,
      branchId: branch.id,
      cashierId: user.id,
      status: "completed",
      paymentMethod: input.paymentMethod,
      items,
      subtotalCents,
      discountCents,
      totalCents,
      tenderedCents,
      changeCents: tenderedCents - totalCents,
      createdAt: nowIso(),
      refundedAt: null,
      refundedById: null,
      refundReason: null,
    };
    db.sales.push(sale);
    save(db);
    return toSaleView(db, sale);
  },

  /** Non-admins are always limited to their own branch. Newest first. */
  async list(filters: SaleFilters = {}): Promise<SaleView[]> {
    await delay();
    const db = load();
    const user = currentUser(db);
    const branchId = user.role === "admin" ? filters.branchId : (user.branchId ?? "none");
    return db.sales
      .filter(
        (s) =>
          (!branchId || s.branchId === branchId) &&
          (!filters.status || s.status === filters.status) &&
          (!filters.from || s.createdAt >= filters.from) &&
          (!filters.to || s.createdAt <= filters.to),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((s) => toSaleView(db, s));
  },

  async get(id: string): Promise<SaleView> {
    await delay();
    const db = load();
    const user = currentUser(db);
    const sale = db.sales.find((s) => s.id === id);
    if (!sale) throw new DataError("Sale not found", 404);
    assertBranchAccess(user, sale.branchId);
    return toSaleView(db, sale);
  },

  /** Manager/Admin only. Restocks every item and marks the sale refunded. */
  async refund(id: string, reason: string): Promise<SaleView> {
    await delay(250);
    const db = load();
    const user = currentUser(db);
    requireRole(user, "admin", "manager");
    const sale = db.sales.find((s) => s.id === id);
    if (!sale) throw new DataError("Sale not found", 404);
    assertBranchAccess(user, sale.branchId);
    if (sale.status !== "completed") throw new DataError("This sale is already refunded", 409);

    for (const item of sale.items) {
      db.stock[stockKey(sale.branchId, item.productId)] =
        getStock(db, sale.branchId, item.productId) + item.quantity;
    }
    sale.status = "refunded";
    sale.refundedAt = nowIso();
    sale.refundedById = user.id;
    sale.refundReason = reason.trim() || null;
    save(db);
    return toSaleView(db, sale);
  },
};

// ---------------------------------------------------------------------------
// Users (Admin)
// ---------------------------------------------------------------------------

type UserInput = {
  name: string;
  email: string;
  password: string;
  role: Role;
  branchId: string | null;
};

const users = {
  async list(): Promise<User[]> {
    await delay();
    const db = load();
    requireRole(currentUser(db), "admin");
    return clone(
      db.users.map(publicUser).sort((a, b) => a.name.localeCompare(b.name)),
    );
  },

  async create(input: UserInput): Promise<User> {
    await delay();
    const db = load();
    requireRole(currentUser(db), "admin");
    const email = requireText(input.email, "Email", 200).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new DataError("Enter a valid email address", 400);
    }
    if (db.users.some((u) => u.email === email)) {
      throw new DataError("A user with this email already exists", 409);
    }
    if ((input.password ?? "").length < 8) {
      throw new DataError("Password must be at least 8 characters", 400);
    }
    const user: StoredUser = {
      id: newId(),
      name: requireText(input.name, "Name", 100),
      email,
      password: input.password,
      role: input.role,
      branchId: validateRoleBranch(db, input.role, input.branchId),
      active: true,
      createdAt: nowIso(),
    };
    db.users.push(user);
    save(db);
    return clone(publicUser(user));
  },

  async update(
    id: string,
    input: Partial<Omit<UserInput, "email"> & { active: boolean }>,
  ): Promise<User> {
    await delay();
    const db = load();
    const me = currentUser(db);
    requireRole(me, "admin");
    const user = db.users.find((u) => u.id === id);
    if (!user) throw new DataError("User not found", 404);

    const role = input.role ?? user.role;
    if (user.id === me.id && role !== "admin") {
      throw new DataError("You cannot change your own role", 400);
    }
    if (user.id === me.id && input.active === false) {
      throw new DataError("You cannot deactivate your own account", 400);
    }
    if (input.password) {
      if (input.password.length < 8) {
        throw new DataError("Password must be at least 8 characters", 400);
      }
      user.password = input.password;
    }
    if (input.name !== undefined) user.name = requireText(input.name, "Name", 100);
    user.branchId = validateRoleBranch(
      db,
      role,
      input.branchId !== undefined ? input.branchId : user.branchId,
    );
    user.role = role;
    if (input.active !== undefined) user.active = input.active;
    save(db);
    return clone(publicUser(user));
  },
};

// ---------------------------------------------------------------------------
// Demo helpers (removed in Phase 3)
// ---------------------------------------------------------------------------

const demo = {
  async reset(): Promise<void> {
    await delay();
    save(createSeedDb());
  },
};

export const api = { auth, branches, products, sales, users, demo };
