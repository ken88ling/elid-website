import type { Product, ProductWithStock } from "@app/shared/types";
import { and, asc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { branches, branchStock, products } from "../db/schema";
import { assertBranchAccess, requireRole, type UserRow } from "../lib/auth";
import { fail, isUniqueViolation, validate } from "../lib/http";
import { requireAuth, type AuthEnv } from "../middleware/auth";

type ProductRow = typeof products.$inferSelect;

const toProduct = (row: ProductRow): Product => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
});

const idParam = z.object({ id: z.string().min(1) });

const listQuery = z.object({
  branchId: z.string().min(1, "branchId is required"),
  includeInactive: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => v === "true"),
});

const productInput = z.object({
  sku: z
    .string()
    .trim()
    .min(1, "SKU is required")
    .max(40)
    .transform((v) => v.toUpperCase()),
  barcode: z
    .string()
    .trim()
    .max(64)
    .nullable()
    .transform((v) => v || null),
  name: z.string().trim().min(1, "Name is required").max(120),
  category: z.string().trim().min(1, "Category is required").max(60),
  priceCents: z.int("Price must be a positive amount").min(0, "Price must be a positive amount"),
});

const stockInput = z.object({
  branchId: z.string().min(1),
  quantity: z
    .int("Stock must be a whole number of 0 or more")
    .min(0, "Stock must be a whole number of 0 or more")
    .max(1_000_000),
});

/** Admin-only product write; maps unique-constraint errors to a readable 409. */
async function saveProduct(
  user: UserRow,
  input: z.infer<typeof productInput>,
  write: () => Promise<ProductRow[]>,
): Promise<Product> {
  requireRole(user, "admin");
  let rows: ProductRow[];
  try {
    rows = await write();
  } catch (err) {
    if (isUniqueViolation(err)) {
      fail(409, `SKU ${input.sku}${input.barcode ? ` or barcode ${input.barcode}` : ""} is already used`);
    }
    throw err;
  }
  if (!rows[0]) fail(404, "Product not found");
  return toProduct(rows[0]);
}

export const productsRoute = new Hono<AuthEnv>()
  .use(requireAuth)

  /** Products with stock for one branch, sorted by name. */
  .get("/", validate("query", listQuery), async (c) => {
    const { branchId, includeInactive } = c.req.valid("query");
    assertBranchAccess(c.get("user"), branchId);
    const rows = await db
      .select({
        product: products,
        stock: sql<number>`coalesce(${branchStock.quantity}, 0)`.mapWith(Number),
      })
      .from(products)
      .leftJoin(
        branchStock,
        and(eq(branchStock.productId, products.id), eq(branchStock.branchId, branchId)),
      )
      .where(includeInactive ? undefined : eq(products.active, true))
      .orderBy(asc(products.name));
    const result: ProductWithStock[] = rows.map((r) => ({ ...toProduct(r.product), stock: r.stock }));
    return c.json(result, 200);
  })

  .post("/", validate("json", productInput), async (c) => {
    const input = c.req.valid("json");
    const product = await saveProduct(c.get("user"), input, () =>
      db.insert(products).values(input).returning(),
    );
    return c.json(product, 201);
  })

  .patch(
    "/:id",
    validate("param", idParam),
    validate("json", productInput.extend({ active: z.boolean() })),
    async (c) => {
      const input = c.req.valid("json");
      const product = await saveProduct(c.get("user"), input, () =>
        db.update(products).set(input).where(eq(products.id, c.req.valid("param").id)).returning(),
      );
      return c.json(product, 200);
    },
  )

  /** Set the stock count of a product at one branch (Manager/Admin). */
  .put("/:id/stock", validate("param", idParam), validate("json", stockInput), async (c) => {
    const user = c.get("user");
    requireRole(user, "admin", "manager");
    const { branchId, quantity } = c.req.valid("json");
    const productId = c.req.valid("param").id;
    assertBranchAccess(user, branchId);

    const [branch] = await db.select({ id: branches.id }).from(branches).where(eq(branches.id, branchId));
    if (!branch) fail(404, "Branch not found");
    const [product] = await db.select({ id: products.id }).from(products).where(eq(products.id, productId));
    if (!product) fail(404, "Product not found");

    await db
      .insert(branchStock)
      .values({ branchId, productId, quantity })
      .onConflictDoUpdate({ target: [branchStock.branchId, branchStock.productId], set: { quantity } });
    return c.json({ quantity }, 200);
  });
