import type { User } from "@app/shared/types";
import { asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { branches, roleEnum, users } from "../db/schema";
import { deleteUserSessions, hashPassword, requireRole, toPublicUser } from "../lib/auth";
import { fail, isUniqueViolation, validate } from "../lib/http";
import { requireAuth, type AuthEnv } from "../middleware/auth";

type Role = (typeof roleEnum.enumValues)[number];

const idParam = z.object({ id: z.string().min(1) });
const password = z.string().min(8, "Password must be at least 8 characters").max(200);

const createInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(100),
  email: z
    .email("Enter a valid email address")
    .max(200)
    .transform((v) => v.toLowerCase()),
  password,
  role: z.enum(roleEnum.enumValues),
  branchId: z.string().min(1).nullable(),
});

const updateInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(100).optional(),
  role: z.enum(roleEnum.enumValues).optional(),
  branchId: z.string().min(1).nullable().optional(),
  active: z.boolean().optional(),
  password: password.optional(),
});

/** Admins have no branch; managers and cashiers must belong to an existing branch. */
async function resolveBranchId(role: Role, branchId: string | null | undefined) {
  if (role === "admin") return null;
  if (!branchId) fail(400, "Managers and cashiers must belong to a branch");
  const [branch] = await db.select({ id: branches.id }).from(branches).where(eq(branches.id, branchId));
  if (!branch) fail(404, "Branch not found");
  return branchId;
}

/** Admin only. */
export const usersRoute = new Hono<AuthEnv>()
  .use(requireAuth)
  .use(async (c, next) => {
    requireRole(c.get("user"), "admin");
    await next();
  })

  .get("/", async (c) => {
    const rows = await db.select().from(users).orderBy(asc(users.name));
    const result: User[] = rows.map(toPublicUser);
    return c.json(result, 200);
  })

  .post("/", validate("json", createInput), async (c) => {
    const input = c.req.valid("json");
    const branchId = await resolveBranchId(input.role, input.branchId);
    try {
      const [row] = await db
        .insert(users)
        .values({
          name: input.name,
          email: input.email,
          passwordHash: await hashPassword(input.password),
          role: input.role,
          branchId,
        })
        .returning();
      return c.json(toPublicUser(row!), 201);
    } catch (err) {
      if (isUniqueViolation(err)) fail(409, "A user with this email already exists");
      throw err;
    }
  })

  .patch("/:id", validate("param", idParam), validate("json", updateInput), async (c) => {
    const me = c.get("user");
    const { id } = c.req.valid("param");
    const input = c.req.valid("json");
    const [user] = await db.select().from(users).where(eq(users.id, id));
    if (!user) fail(404, "User not found");

    const role = input.role ?? user.role;
    if (user.id === me.id && role !== "admin") fail(400, "You cannot change your own role");
    if (user.id === me.id && input.active === false) {
      fail(400, "You cannot deactivate your own account");
    }

    const [row] = await db
      .update(users)
      .set({
        name: input.name,
        role,
        branchId: await resolveBranchId(role, input.branchId !== undefined ? input.branchId : user.branchId),
        active: input.active,
        passwordHash: input.password ? await hashPassword(input.password) : undefined,
      })
      .where(eq(users.id, id))
      .returning();

    // Sign the user out everywhere when they're deactivated or their password changes.
    if (input.active === false || input.password) await deleteUserSessions(id);
    return c.json(toPublicUser(row!), 200);
  });
