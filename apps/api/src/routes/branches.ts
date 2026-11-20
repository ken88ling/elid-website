import type { Branch } from "@app/shared/types";
import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { branches } from "../db/schema";
import { requireRole } from "../lib/auth";
import { fail, isUniqueViolation, validate } from "../lib/http";
import { requireAuth, type AuthEnv } from "../middleware/auth";

type BranchRow = typeof branches.$inferSelect;

function toBranch(row: BranchRow): Branch {
  return { ...row, createdAt: row.createdAt.toISOString() };
}

const idParam = z.object({ id: z.string().min(1) });

const createInput = z.object({
  code: z
    .string()
    .trim()
    .transform((v) => v.toUpperCase())
    .pipe(z.string().regex(/^[A-Z0-9]{2,8}$/, "Code must be 2–8 letters or numbers")),
  name: z.string().trim().min(1, "Name is required").max(100),
  address: z.string().trim().max(200).default(""),
});

const updateInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(100).optional(),
  address: z.string().trim().max(200).optional(),
  active: z.boolean().optional(),
}).refine((v) => Object.keys(v).length > 0, "Nothing to update");

export const branchesRoute = new Hono<AuthEnv>()
  .use(requireAuth)

  /** Admin: all branches. Others: their own branch only. */
  .get("/", async (c) => {
    const user = c.get("user");
    const rows =
      user.role === "admin"
        ? await db.select().from(branches).orderBy(asc(branches.name))
        : await db.select().from(branches).where(eq(branches.id, user.branchId ?? ""));
    return c.json(rows.map(toBranch), 200);
  })

  .post("/", validate("json", createInput), async (c) => {
    requireRole(c.get("user"), "admin");
    const input = c.req.valid("json");
    try {
      const [row] = await db.insert(branches).values(input).returning();
      return c.json(toBranch(row!), 201);
    } catch (err) {
      if (isUniqueViolation(err)) fail(409, `Branch code ${input.code} is already used`);
      throw err;
    }
  })

  .patch("/:id", validate("param", idParam), validate("json", updateInput), async (c) => {
    requireRole(c.get("user"), "admin");
    const [row] = await db
      .update(branches)
      .set(c.req.valid("json"))
      .where(eq(branches.id, c.req.valid("param").id))
      .returning();
    if (!row) fail(404, "Branch not found");
    return c.json(toBranch(row), 200);
  });
