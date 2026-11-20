/**
 * Load the shared demo data (same branches, users, products, stock and sales history
 * as the web mock) into Postgres. Replaces ALL existing data, so it requires --reset
 * when the database is not empty.
 *
 *   pnpm db:seed            # empty database only
 *   pnpm db:seed --reset    # wipe and reseed
 */
import { createSeedDb } from "@app/shared/seed";
import { sql } from "drizzle-orm";
import { hashPassword } from "../lib/auth";
import { client, db } from "./index";
import { branches, branchStock, products, saleItems, sales, sessions, users } from "./schema";

const reset = process.argv.includes("--reset");
const data = createSeedDb();

const [{ count }] = (await db.select({ count: sql<number>`count(*)::int` }).from(users)) as [
  { count: number },
];
if (count > 0 && !reset) {
  console.error("Database already has data. Run `pnpm db:seed --reset` to wipe and reseed.");
  await client.end();
  process.exit(1);
}

// Hash outside the transaction: scrypt is deliberately slow.
const userRows = await Promise.all(
  data.users.map(async ({ password, createdAt, ...user }) => ({
    ...user,
    passwordHash: await hashPassword(password),
    createdAt: new Date(createdAt),
  })),
);

await db.transaction(async (tx) => {
  for (const table of [saleItems, sales, sessions, branchStock, users, products, branches]) {
    await tx.delete(table);
  }
  await tx.insert(branches).values(data.branches.map((b) => ({ ...b, createdAt: new Date(b.createdAt) })));
  await tx.insert(users).values(userRows);
  await tx.insert(products).values(data.products.map((p) => ({ ...p, createdAt: new Date(p.createdAt) })));
  await tx.insert(branchStock).values(
    Object.entries(data.stock).map(([key, quantity]) => {
      const [branchId, productId] = key.split(":") as [string, string];
      return { branchId, productId, quantity };
    }),
  );
  if (data.sales.length > 0) {
    await tx.insert(sales).values(
      data.sales.map(({ items: _items, createdAt, refundedAt, ...sale }) => ({
        ...sale,
        createdAt: new Date(createdAt),
        refundedAt: refundedAt ? new Date(refundedAt) : null,
      })),
    );
    await tx
      .insert(saleItems)
      .values(data.sales.flatMap((sale) => sale.items.map((item) => ({ ...item, saleId: sale.id }))));
  }
  // Seeded sales use explicit numbers; continue the receipt sequence after them.
  await tx.execute(sql.raw(`ALTER TABLE sales ALTER COLUMN number RESTART WITH ${data.nextSaleNumber}`));
});

console.log(
  `Seeded ${data.branches.length} branches, ${data.users.length} users, ${data.products.length} products, ${data.sales.length} sales.`,
);
console.log("Demo logins: admin@demo.store / admin123, manager.dt@demo.store / manager123, cashier.dt@demo.store / cashier123");
await client.end();
