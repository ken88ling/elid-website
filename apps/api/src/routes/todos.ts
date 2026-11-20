import { zValidator } from "@hono/zod-validator";
import { desc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { db } from "../db";
import { todos } from "../db/schema";

const idParam = z.object({ id: z.uuid() });

const createTodo = z.object({
  title: z.string().trim().min(1).max(200),
});

const updateTodo = z
  .object({
    title: z.string().trim().min(1).max(200),
    completed: z.boolean(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: "Provide at least one field to update",
  });

export const todosRoute = new Hono()
  .get("/", async (c) => {
    const rows = await db.select().from(todos).orderBy(desc(todos.createdAt));
    return c.json(rows);
  })
  .post("/", zValidator("json", createTodo), async (c) => {
    const [row] = await db.insert(todos).values(c.req.valid("json")).returning();
    return c.json(row!, 201);
  })
  .patch(
    "/:id",
    zValidator("param", idParam),
    zValidator("json", updateTodo),
    async (c) => {
      const [row] = await db
        .update(todos)
        .set(c.req.valid("json"))
        .where(eq(todos.id, c.req.valid("param").id))
        .returning();
      if (!row) return c.json({ error: "Todo not found" }, 404);
      return c.json(row, 200);
    },
  )
  .delete("/:id", zValidator("param", idParam), async (c) => {
    const [row] = await db
      .delete(todos)
      .where(eq(todos.id, c.req.valid("param").id))
      .returning({ id: todos.id });
    if (!row) return c.json({ error: "Todo not found" }, 404);
    return c.json(row, 200);
  });
