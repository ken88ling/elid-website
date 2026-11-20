import { relations } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// Ids are text (UUIDs for new rows) so the shared demo seed's readable ids ("b-dt") also fit.
const id = () =>
  text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID());
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();

export const roleEnum = pgEnum("role", ["admin", "manager", "cashier"]);
export const saleStatusEnum = pgEnum("sale_status", ["completed", "refunded"]);
export const paymentMethodEnum = pgEnum("payment_method", ["cash", "card", "other"]);

export const branches = pgTable("branches", {
  id: id(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  address: text("address").notNull().default(""),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const users = pgTable("users", {
  id: id(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull(),
  /** null for admins (access to all branches) */
  branchId: text("branch_id").references(() => branches.id),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
});

export const sessions = pgTable(
  "sessions",
  {
    /** sha256 of the session token; the raw token only lives in the cookie */
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const products = pgTable(
  "products",
  {
    id: id(),
    sku: text("sku").notNull().unique(),
    barcode: text("barcode").unique(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    priceCents: integer("price_cents").notNull(),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
  },
  (t) => [check("products_price_non_negative", sql`${t.priceCents} >= 0`)],
);

export const branchStock = pgTable(
  "branch_stock",
  {
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    quantity: integer("quantity").notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.branchId, t.productId] }),
    check("branch_stock_quantity_non_negative", sql`${t.quantity} >= 0`),
  ],
);

export const sales = pgTable(
  "sales",
  {
    id: id(),
    /** Global running number; receipt no. is `${branch.code}-${number padded to 6}` */
    number: integer("number").notNull().unique().generatedByDefaultAsIdentity(),
    branchId: text("branch_id")
      .notNull()
      .references(() => branches.id),
    cashierId: text("cashier_id")
      .notNull()
      .references(() => users.id),
    status: saleStatusEnum("status").notNull().default("completed"),
    paymentMethod: paymentMethodEnum("payment_method").notNull(),
    subtotalCents: integer("subtotal_cents").notNull(),
    discountCents: integer("discount_cents").notNull().default(0),
    totalCents: integer("total_cents").notNull(),
    tenderedCents: integer("tendered_cents").notNull(),
    changeCents: integer("change_cents").notNull(),
    createdAt: createdAt(),
    refundedAt: timestamp("refunded_at", { withTimezone: true }),
    refundedById: text("refunded_by_id").references(() => users.id),
    refundReason: text("refund_reason"),
  },
  (t) => [index("sales_branch_created_idx").on(t.branchId, t.createdAt)],
);

export const saleItems = pgTable(
  "sale_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    saleId: text("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),
    productId: text("product_id")
      .notNull()
      .references(() => products.id),
    // Snapshot of the product at the time of sale.
    sku: text("sku").notNull(),
    name: text("name").notNull(),
    unitPriceCents: integer("unit_price_cents").notNull(),
    quantity: integer("quantity").notNull(),
    lineTotalCents: integer("line_total_cents").notNull(),
  },
  (t) => [index("sale_items_sale_idx").on(t.saleId)],
);

export const salesRelations = relations(sales, ({ one, many }) => ({
  items: many(saleItems),
  branch: one(branches, { fields: [sales.branchId], references: [branches.id] }),
  cashier: one(users, { fields: [sales.cashierId], references: [users.id] }),
  refundedBy: one(users, { fields: [sales.refundedById], references: [users.id] }),
}));

export const saleItemsRelations = relations(saleItems, ({ one }) => ({
  sale: one(sales, { fields: [saleItems.saleId], references: [sales.id] }),
}));
