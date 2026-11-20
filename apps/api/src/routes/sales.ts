import type { SaleItem, SaleView } from "@app/shared/types";
import { and, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import {
  branches,
  branchStock,
  paymentMethodEnum,
  products,
  saleItems,
  sales,
  saleStatusEnum,
} from "../db/schema";
import { assertBranchAccess, requireRole, type UserRow } from "../lib/auth";
import { fail, validate } from "../lib/http";
import { requireAuth, type AuthEnv } from "../middleware/auth";

const idParam = z.object({ id: z.string().min(1) });

const createInput = z.object({
  branchId: z.string().min(1),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.int().min(1, "Quantities must be whole numbers of 1 or more"),
      }),
    )
    .min(1, "The cart is empty")
    .max(200),
  paymentMethod: z.enum(paymentMethodEnum.enumValues),
  discountCents: z.int().min(0, "Discount must be a positive amount").default(0),
  /** Required for cash payments */
  tenderedCents: z.int().min(0).optional(),
});

const listQuery = z.object({
  branchId: z.string().min(1).optional(),
  /** ISO timestamps, inclusive */
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  status: z.enum(saleStatusEnum.enumValues).optional(),
});

const refundInput = z.object({ reason: z.string().trim().max(500).default("") });

const receiptNo = (code: string, number: number) => `${code}-${String(number).padStart(6, "0")}`;

/** Relations loaded with every sale. */
const saleRelations = {
  items: true,
  branch: { columns: { id: true, code: true, name: true, address: true } },
  cashier: { columns: { name: true } },
  refundedBy: { columns: { name: true } },
} as const;

type SaleWithRelations = NonNullable<
  Awaited<ReturnType<typeof db.query.sales.findFirst<{ with: typeof saleRelations }>>>
>;

async function getSaleView(id: string): Promise<SaleView | null> {
  const sale = await db.query.sales.findFirst({ where: eq(sales.id, id), with: saleRelations });
  return sale ? toSaleView(sale) : null;
}

/** Shape a sale like the shared `SaleView` type the web app uses. */
function toSaleView(sale: SaleWithRelations): SaleView {
  const { cashier, refundedBy, branch, items, ...rest } = sale;
  return {
    ...rest,
    items: items.map(({ productId, sku, name, unitPriceCents, quantity, lineTotalCents }) => ({
      productId,
      sku,
      name,
      unitPriceCents,
      quantity,
      lineTotalCents,
    })),
    branch,
    receiptNo: receiptNo(branch.code, sale.number),
    cashierName: cashier.name,
    refundedByName: refundedBy?.name ?? null,
    createdAt: sale.createdAt.toISOString(),
    refundedAt: sale.refundedAt?.toISOString() ?? null,
  };
}

/** Merge duplicate cart lines into one quantity per product. */
function mergeQuantities(items: { productId: string; quantity: number }[]) {
  const quantities = new Map<string, number>();
  for (const item of items) {
    quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
  }
  return quantities;
}

/** Cash must cover the total; other methods are charged exactly the total. */
function settlePayment(input: z.infer<typeof createInput>, totalCents: number) {
  if (input.paymentMethod !== "cash") return { tenderedCents: totalCents, changeCents: 0 };
  if (input.tenderedCents === undefined || input.tenderedCents < totalCents) {
    fail(400, "Cash received is less than the total");
  }
  return { tenderedCents: input.tenderedCents, changeCents: input.tenderedCents - totalCents };
}

async function createSale(user: UserRow, input: z.infer<typeof createInput>): Promise<string> {
  return db.transaction(async (tx) => {
    const [branch] = await tx.select().from(branches).where(eq(branches.id, input.branchId));
    if (!branch || !branch.active) fail(400, "This branch is inactive");

    const quantities = mergeQuantities(input.items);
    const found = await tx
      .select()
      .from(products)
      .where(and(inArray(products.id, [...quantities.keys()]), eq(products.active, true)));
    if (found.length !== quantities.size) {
      fail(400, "One or more products are no longer available");
    }

    const items: SaleItem[] = found.map((p) => {
      const quantity = quantities.get(p.id)!;
      return {
        productId: p.id,
        sku: p.sku,
        name: p.name,
        unitPriceCents: p.priceCents,
        quantity,
        lineTotalCents: p.priceCents * quantity,
      };
    });
    const subtotalCents = items.reduce((sum, i) => sum + i.lineTotalCents, 0);
    if (input.discountCents > subtotalCents) {
      fail(400, "Discount cannot be more than the subtotal");
    }
    const totalCents = subtotalCents - input.discountCents;
    const payment = settlePayment(input, totalCents);

    // Atomic decrement: only succeeds while enough stock remains, even with concurrent sales.
    for (const item of items) {
      const updated = await tx
        .update(branchStock)
        .set({ quantity: sql`${branchStock.quantity} - ${item.quantity}` })
        .where(
          and(
            eq(branchStock.branchId, branch.id),
            eq(branchStock.productId, item.productId),
            gte(branchStock.quantity, item.quantity),
          ),
        )
        .returning({ quantity: branchStock.quantity });
      if (updated.length === 0) fail(409, `Not enough stock for ${item.name}`);
    }

    const [sale] = await tx
      .insert(sales)
      .values({
        branchId: branch.id,
        cashierId: user.id,
        paymentMethod: input.paymentMethod,
        subtotalCents,
        discountCents: input.discountCents,
        totalCents,
        ...payment,
      })
      .returning({ id: sales.id });
    await tx.insert(saleItems).values(items.map((item) => ({ ...item, saleId: sale!.id })));
    return sale!.id;
  });
}

/** Restock every item and mark the sale refunded; the row lock prevents double refunds. */
async function refundSale(user: UserRow, id: string, reason: string) {
  await db.transaction(async (tx) => {
    const [sale] = await tx.select().from(sales).where(eq(sales.id, id)).for("update");
    if (!sale) fail(404, "Sale not found");
    assertBranchAccess(user, sale.branchId);
    if (sale.status !== "completed") fail(409, "This sale is already refunded");

    const items = await tx.select().from(saleItems).where(eq(saleItems.saleId, id));
    for (const item of items) {
      await tx
        .insert(branchStock)
        .values({ branchId: sale.branchId, productId: item.productId, quantity: item.quantity })
        .onConflictDoUpdate({
          target: [branchStock.branchId, branchStock.productId],
          set: { quantity: sql`${branchStock.quantity} + ${item.quantity}` },
        });
    }
    await tx
      .update(sales)
      .set({
        status: "refunded",
        refundedAt: new Date(),
        refundedById: user.id,
        refundReason: reason || null,
      })
      .where(eq(sales.id, id));
  });
}

export const salesRoute = new Hono<AuthEnv>()
  .use(requireAuth)

  .post("/", validate("json", createInput), async (c) => {
    const user = c.get("user");
    const input = c.req.valid("json");
    assertBranchAccess(user, input.branchId);
    const id = await createSale(user, input);
    return c.json((await getSaleView(id))!, 201);
  })

  /** Newest first. Non-admins are always limited to their own branch. */
  .get("/", validate("query", listQuery), async (c) => {
    const user = c.get("user");
    const filters = c.req.valid("query");
    const branchId = user.role === "admin" ? filters.branchId : (user.branchId ?? "none");

    const conditions: SQL[] = [];
    if (branchId) conditions.push(eq(sales.branchId, branchId));
    if (filters.status) conditions.push(eq(sales.status, filters.status));
    if (filters.from) conditions.push(gte(sales.createdAt, new Date(filters.from)));
    if (filters.to) conditions.push(lte(sales.createdAt, new Date(filters.to)));

    const rows = await db.query.sales.findMany({
      where: and(...conditions),
      orderBy: [desc(sales.createdAt)],
      limit: 1000,
      with: saleRelations,
    });
    return c.json(rows.map(toSaleView), 200);
  })

  .get("/:id", validate("param", idParam), async (c) => {
    const sale = await getSaleView(c.req.valid("param").id);
    if (!sale) fail(404, "Sale not found");
    assertBranchAccess(c.get("user"), sale.branch.id);
    return c.json(sale, 200);
  })

  .post("/:id/refund", validate("param", idParam), validate("json", refundInput), async (c) => {
    const user = c.get("user");
    requireRole(user, "admin", "manager");
    const { id } = c.req.valid("param");
    await refundSale(user, id, c.req.valid("json").reason);
    return c.json((await getSaleView(id))!, 200);
  });
