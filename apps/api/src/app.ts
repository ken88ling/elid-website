import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { env } from "./env";
import { todosRoute } from "./routes/todos";

const app = new Hono()
  .use(logger())
  .use("/api/*", cors({ origin: env.CORS_ORIGIN }))
  .get("/health", (c) => c.json({ status: "ok" }))
  .route("/api/todos", todosRoute)
  .notFound((c) => c.json({ error: "Not found" }, 404))
  .onError((err, c) => {
    console.error(err);
    return c.json({ error: "Internal server error" }, 500);
  });

export default app;

/** Imported by the web app (type-only) for an end-to-end typed client. */
export type AppType = typeof app;
