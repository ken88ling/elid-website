import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import { findSessionUser, SESSION_COOKIE, type UserRow } from "../lib/auth";
import { fail } from "../lib/http";

export type AuthEnv = { Variables: { user: UserRow } };

/** Loads the signed-in user from the session cookie into `c.get("user")`, or responds 401. */
export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  const user = token ? await findSessionUser(token) : null;
  if (!user) fail(401, "Please sign in");
  c.set("user", user);
  await next();
});
