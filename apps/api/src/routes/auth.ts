import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import { db } from "../db";
import { branches, users } from "../db/schema";
import { env } from "../env";
import {
  createSession,
  deleteSession,
  findSessionUser,
  hashPassword,
  SESSION_COOKIE,
  toPublicUser,
  verifyPassword,
} from "../lib/auth";
import { fail, validate } from "../lib/http";

const loginInput = z.object({
  email: z.string().trim().min(1, "Email is required"),
  password: z.string().min(1, "Password is required"),
});

export const authRoute = new Hono()
  .post("/login", validate("json", loginInput), async (c) => {
    const { email, password } = c.req.valid("json");
    const [user] = await db.select().from(users).where(eq(users.email, email.toLowerCase()));
    // Hash anyway when the user doesn't exist so response time doesn't reveal valid emails.
    const valid = user
      ? await verifyPassword(password, user.passwordHash)
      : (await hashPassword(password), false);
    if (!user || !valid) fail(401, "Invalid email or password");
    if (!user.active) fail(403, "This account has been deactivated");
    if (user.branchId) {
      const [branch] = await db
        .select({ active: branches.active })
        .from(branches)
        .where(eq(branches.id, user.branchId));
      if (!branch?.active) fail(403, "Your branch is inactive. Contact an admin.");
    }

    const { token, expiresAt } = await createSession(user.id);
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "Lax",
      secure: env.NODE_ENV === "production",
      path: "/",
      expires: expiresAt,
    });
    return c.json(toPublicUser(user), 200);
  })

  .post("/logout", async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    if (token) await deleteSession(token);
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true }, 200);
  })

  /** The signed-in user, or null (not an error) when signed out. */
  .get("/me", async (c) => {
    const token = getCookie(c, SESSION_COOKIE);
    const user = token ? await findSessionUser(token) : null;
    return c.json(user ? toPublicUser(user) : null, 200);
  });
