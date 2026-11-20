import { Hono } from "hono";
import { cors } from "hono/cors";
import { HTTPException } from "hono/http-exception";
import { logger } from "hono/logger";
import { env } from "./env";
import { isUniqueViolation } from "./lib/http";
import { authRoute } from "./routes/auth";
import { branchesRoute } from "./routes/branches";
import { productsRoute } from "./routes/products";
import { salesRoute } from "./routes/sales";
import { usersRoute } from "./routes/users";

const app = new Hono()
  .use(logger())
  // The web app normally calls the API same-origin through a Next.js rewrite; CORS is for direct calls.
  .use("/api/*", cors({ origin: env.CORS_ORIGIN, credentials: true }))
  .get("/health", (c) => c.json({ status: "ok" }))
  .route("/api/auth", authRoute)
  .route("/api/branches", branchesRoute)
  .route("/api/products", productsRoute)
  .route("/api/sales", salesRoute)
  .route("/api/users", usersRoute)
  .notFound((c) => c.json({ error: "Not found" }, 404))
  // Every error is `{ error: string }` with an HTTP status, like the web data layer's DataError.
  .onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    if (isUniqueViolation(err)) return c.json({ error: "That value is already used" }, 409);
    console.error(err);
    return c.json({ error: "Internal server error" }, 500);
  });

export default app;

/** Imported by the web app (type-only) for an end-to-end typed client. */
export type AppType = typeof app;
