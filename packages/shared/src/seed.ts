import type { Branch, PaymentMethod, Product, Sale, SaleItem, User } from "./types";

export type StoredUser = User & { password: string };

export type Db = {
  version: number;
  branches: Branch[];
  users: StoredUser[];
  products: Product[];
  /** keyed by stockKey(branchId, productId) */
  stock: Record<string, number>;
  sales: Sale[];
  nextSaleNumber: number;
};

export const DB_VERSION = 1;

export const stockKey = (branchId: string, productId: string) =>
  `${branchId}:${productId}`;

/** Small deterministic PRNG so demo data is the same on every reset. */
function createRandom(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// [sku, name, category, price in cents]
const PRODUCTS: [string, string, string, number][] = [
  ["BEV-001", "Mineral Water 500ml", "Beverages", 120],
  ["BEV-002", "Orange Juice 1L", "Beverages", 390],
  ["BEV-003", "Iced Coffee Can", "Beverages", 250],
  ["BEV-004", "Green Tea 500ml", "Beverages", 180],
  ["SNK-001", "Potato Chips", "Snacks", 220],
  ["SNK-002", "Chocolate Bar", "Snacks", 190],
  ["SNK-003", "Mixed Nuts 200g", "Snacks", 550],
  ["SNK-004", "Granola Bar", "Snacks", 150],
  ["HOU-001", "Dish Soap 500ml", "Household", 320],
  ["HOU-002", "Paper Towels 6pk", "Household", 790],
  ["HOU-003", "Laundry Detergent 2L", "Household", 1290],
  ["HOU-004", "Trash Bags 30pk", "Household", 450],
  ["PER-001", "Toothpaste", "Personal Care", 340],
  ["PER-002", "Shampoo 400ml", "Personal Care", 890],
  ["PER-003", "Hand Sanitizer", "Personal Care", 290],
  ["PER-004", "Facial Tissue", "Personal Care", 360],
  ["STA-001", "Ballpoint Pens 5pk", "Stationery", 290],
  ["STA-002", "A4 Notebook", "Stationery", 350],
  ["STA-003", "Sticky Notes", "Stationery", 240],
  ["STA-004", "AA Batteries 4pk", "Stationery", 590],
];

export const DEMO_ACCOUNTS = [
  { email: "admin@demo.store", password: "admin123", label: "Admin (all branches)" },
  { email: "manager.dt@demo.store", password: "manager123", label: "Manager, Downtown" },
  { email: "cashier.dt@demo.store", password: "cashier123", label: "Cashier, Downtown" },
  { email: "cashier.rs@demo.store", password: "cashier123", label: "Cashier, Riverside" },
];

export function createSeedDb(now = new Date()): Db {
  const random = createRandom(42);
  const created = new Date(now.getTime() - 30 * 86_400_000).toISOString();

  const branches: Branch[] = [
    { id: "b-dt", code: "DT", name: "Downtown", address: "12 Market Street", active: true, createdAt: created },
    { id: "b-rs", code: "RS", name: "Riverside", address: "88 River Road", active: true, createdAt: created },
    { id: "b-ng", code: "NG", name: "Northgate", address: "5 Northgate Avenue", active: true, createdAt: created },
  ];

  const users: StoredUser[] = [
    { id: "u-admin", name: "Alex Admin", email: "admin@demo.store", password: "admin123", role: "admin", branchId: null },
    { id: "u-mgr-dt", name: "Morgan Lee", email: "manager.dt@demo.store", password: "manager123", role: "manager", branchId: "b-dt" },
    { id: "u-mgr-rs", name: "Riley Tan", email: "manager.rs@demo.store", password: "manager123", role: "manager", branchId: "b-rs" },
    { id: "u-cash-dt", name: "Casey Lim", email: "cashier.dt@demo.store", password: "cashier123", role: "cashier", branchId: "b-dt" },
    { id: "u-cash-rs", name: "Jordan Ng", email: "cashier.rs@demo.store", password: "cashier123", role: "cashier", branchId: "b-rs" },
    { id: "u-cash-ng", name: "Sam Ong", email: "cashier.ng@demo.store", password: "cashier123", role: "cashier", branchId: "b-ng" },
  ].map((u) => ({ ...u, role: u.role as User["role"], active: true, createdAt: created }));

  const products: Product[] = PRODUCTS.map(([sku, name, category, priceCents], i) => ({
    id: `p-${String(i + 1).padStart(3, "0")}`,
    sku,
    barcode: `888${String(i + 1).padStart(10, "0")}`,
    name,
    category,
    priceCents,
    active: true,
    createdAt: created,
  }));

  const stock = seedStock(random, branches, products);
  const sales = seedSales(random, { now, branches, users, products });

  return {
    version: DB_VERSION,
    branches,
    users,
    products,
    stock,
    sales,
    nextSaleNumber: sales.length + 1,
  };
}

// The helpers below must keep the order of random() calls unchanged, or the demo data changes.

type Random = () => number;

const pickFrom = <T,>(random: Random, items: T[]): T =>
  items[Math.floor(random() * items.length)]!;

/** Mostly well stocked, ~10% low stock, ~5% out of stock. */
function seedStock(random: Random, branches: Branch[], products: Product[]) {
  const stock: Record<string, number> = {};
  for (const branch of branches) {
    for (const product of products) {
      const roll = random();
      let quantity = 0;
      if (roll >= 0.15) quantity = 10 + Math.floor(random() * 50);
      else if (roll >= 0.05) quantity = 1 + Math.floor(random() * 4);
      stock[stockKey(branch.id, product.id)] = quantity;
    }
  }
  return stock;
}

function seedSaleItems(random: Random, products: Product[]): SaleItem[] {
  const lineCount = 1 + Math.floor(random() * 4);
  const items: SaleItem[] = [];
  for (let l = 0; l < lineCount; l++) {
    const product = pickFrom(random, products);
    if (items.some((i) => i.productId === product.id)) continue;
    const quantity = 1 + Math.floor(random() * 3);
    items.push({
      productId: product.id,
      sku: product.sku,
      name: product.name,
      unitPriceCents: product.priceCents,
      quantity,
      lineTotalCents: product.priceCents * quantity,
    });
  }
  return items;
}

function seedPaymentMethod(roll: number): PaymentMethod {
  if (roll < 0.55) return "cash";
  return roll < 0.95 ? "card" : "other";
}

function seedSale(
  random: Random,
  ctx: { number: number; branch: Branch; cashiers: StoredUser[]; manager?: StoredUser; at: Date; products: Product[] },
): Sale {
  const items = seedSaleItems(random, ctx.products);
  const subtotalCents = items.reduce((sum, i) => sum + i.lineTotalCents, 0);
  const discountCents = random() < 0.1 ? Math.min(100, subtotalCents) : 0;
  const totalCents = subtotalCents - discountCents;
  const paymentMethod = seedPaymentMethod(random());
  const tenderedCents = paymentMethod === "cash" ? Math.ceil(totalCents / 500) * 500 : totalCents;
  const refundedBy = ctx.manager !== undefined && random() < 0.05 ? ctx.manager : null;

  return {
    id: `s-${ctx.number}`,
    number: ctx.number,
    branchId: ctx.branch.id,
    cashierId: pickFrom(random, ctx.cashiers).id,
    status: refundedBy ? "refunded" : "completed",
    paymentMethod,
    items,
    subtotalCents,
    discountCents,
    totalCents,
    tenderedCents,
    changeCents: tenderedCents - totalCents,
    createdAt: ctx.at.toISOString(),
    refundedAt: refundedBy ? new Date(ctx.at.getTime() + 3_600_000).toISOString() : null,
    refundedById: refundedBy?.id ?? null,
    refundReason: refundedBy ? "Customer returned items" : null,
  };
}

/** Past week of sales so the Sales page has something to show. */
function seedSales(
  random: Random,
  data: { now: Date; branches: Branch[]; users: StoredUser[]; products: Product[] },
): Sale[] {
  const { now, branches, users, products } = data;
  const sales: Sale[] = [];
  for (let daysAgo = 7; daysAgo >= 0; daysAgo--) {
    for (const branch of branches) {
      const cashiers = users.filter((u) => u.branchId === branch.id);
      const manager = users.find((u) => u.branchId === branch.id && u.role === "manager");
      const count = 3 + Math.floor(random() * 5);
      for (let n = 0; n < count; n++) {
        const at = new Date(now);
        at.setDate(at.getDate() - daysAgo);
        at.setHours(9 + Math.floor(random() * 11), Math.floor(random() * 60), 0, 0);
        if (at > now) continue;
        sales.push(
          seedSale(random, { number: sales.length + 1, branch, cashiers, manager, at, products }),
        );
      }
    }
  }
  return sales.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}
