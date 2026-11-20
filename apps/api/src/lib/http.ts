import { zValidator } from "@hono/zod-validator";
import type { ValidationTargets } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ZodType } from "zod";

/** Throw a JSON error response: `{ error: message }` with the given status (see app.onError). */
export function fail(status: ContentfulStatusCode, message: string): never {
  throw new HTTPException(status, { message });
}

/** zod validation that fails with a readable 400 message instead of the raw zod error. */
export const validate = <T extends ZodType, Target extends keyof ValidationTargets>(
  target: Target,
  schema: T,
) =>
  zValidator(target, schema, (result) => {
    if (!result.success) {
      const issue = result.error.issues[0];
      const field = issue?.path.join(".");
      fail(400, issue ? (field ? `${field}: ${issue.message}` : issue.message) : "Invalid request");
    }
  });

/** Postgres unique-constraint violation (also when wrapped by drizzle). */
export function isUniqueViolation(err: unknown): boolean {
  const code = (e: unknown) => (e as { code?: unknown } | null)?.code;
  return code(err) === "23505" || code((err as { cause?: unknown } | null)?.cause) === "23505";
}
