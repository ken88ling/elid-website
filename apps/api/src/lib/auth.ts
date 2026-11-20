import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import type { Role, User } from "@app/shared/types";
import { and, eq, gt } from "drizzle-orm";
import { db } from "../db";
import { sessions, users } from "../db/schema";
import { fail } from "./http";

export type UserRow = typeof users.$inferSelect;

export const SESSION_COOKIE = "rbms_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function scryptAsync(password: string, salt: Buffer, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, length, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/** Format: `scrypt$<salt hex>$<key hex>` */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${key.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, saltHex, keyHex] = stored.split("$");
  if (algorithm !== "scrypt" || !saltHex || !keyHex) return false;
  const key = Buffer.from(keyHex, "hex");
  const derived = await scryptAsync(password, Buffer.from(saltHex, "hex"), key.length);
  return derived.length === key.length && timingSafeEqual(derived, key);
}

/** Only the hash is stored, so a leaked sessions table can't be used to sign in. */
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt });
  return { token, expiresAt };
}

/** The active user for a session token, or null when missing, expired or deactivated. */
export async function findSessionUser(token: string): Promise<UserRow | null> {
  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, hashToken(token)), gt(sessions.expiresAt, new Date())));
  return row && row.user.active ? row.user : null;
}

export async function deleteSession(token: string) {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

export async function deleteUserSessions(userId: string) {
  await db.delete(sessions).where(eq(sessions.userId, userId));
}

export function toPublicUser(user: UserRow): User {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    branchId: user.branchId,
    active: user.active,
    createdAt: user.createdAt.toISOString(),
  };
}

export function requireRole(user: UserRow, ...roles: Role[]) {
  if (!roles.includes(user.role)) fail(403, "You don't have permission to do that");
}

/** Admins can access every branch; everyone else only their own. */
export function assertBranchAccess(user: UserRow, branchId: string) {
  if (user.role !== "admin" && user.branchId !== branchId) {
    fail(403, "You don't have access to this branch");
  }
}
