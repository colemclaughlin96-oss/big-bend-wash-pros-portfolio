import { randomBytes } from "crypto";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { ENV } from "./_core/env";

/**
 * Team authentication for the admin dashboard. This is a self-contained
 * email + password system layered alongside the Manus OAuth flow. It uses its
 * own cookie ("qb_team_session") and the project's JWT_SECRET for signing, so
 * it never collides with the framework's Manus session cookie.
 */

export const TEAM_COOKIE_NAME = "qb_team_session";
export const TEAM_SESSION_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
export const INVITE_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

export type TeamSessionPayload = {
  teamUserId: number;
  email: string;
  role: "admin" | "member";
};

function getSecret() {
  return new TextEncoder().encode(ENV.cookieSecret);
}

/* ----------------------------- Passwords ----------------------------- */

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 10);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(plain, hash);
}

/* ----------------------------- Invite tokens ----------------------------- */

export function generateInviteToken(): string {
  return randomBytes(24).toString("hex");
}

/* ----------------------------- Session JWT ----------------------------- */

export async function signTeamSession(payload: TeamSessionPayload): Promise<string> {
  const expirationSeconds = Math.floor((Date.now() + TEAM_SESSION_MS) / 1000);
  return new SignJWT({
    teamUserId: payload.teamUserId,
    email: payload.email,
    role: payload.role,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(getSecret());
}

export async function verifyTeamSession(
  cookieValue: string | undefined | null
): Promise<TeamSessionPayload | null> {
  if (!cookieValue) return null;
  try {
    const { payload } = await jwtVerify(cookieValue, getSecret(), {
      algorithms: ["HS256"],
    });
    const teamUserId = payload.teamUserId;
    const email = payload.email;
    const role = payload.role;
    if (
      typeof teamUserId !== "number" ||
      typeof email !== "string" ||
      (role !== "admin" && role !== "member")
    ) {
      return null;
    }
    return { teamUserId, email, role };
  } catch {
    return null;
  }
}

export function getTeamSessionFromRequest(req: Request): Promise<TeamSessionPayload | null> {
  const cookies = req.headers.cookie ? parseCookieHeader(req.headers.cookie) : {};
  return verifyTeamSession(cookies[TEAM_COOKIE_NAME]);
}

/* ----------------------------- Authorization policy ----------------------------- */

/**
 * Pure authorization decisions for the dashboard, mirrored by the tRPC
 * middlewares in `_core/trpc.ts`. Kept dependency-free so the policy is
 * unit-testable without a live request context.
 *
 * - `canAccessDashboard`: any authenticated principal (team session OR legacy
 *   Manus owner/admin) may read workflow data (quotes, customers, reports).
 * - `canAccessAdminArea`: settings/services/branding require an admin. A team
 *   session must have role "admin"; legacy access requires the Manus owner or
 *   an admin-role Manus user.
 */
type AuthPrincipals = {
  teamSession?: { role: "admin" | "member" } | null;
  manusUser?: { role?: string; openId?: string } | null;
  ownerOpenId?: string | null;
};

export function canAccessDashboard({ teamSession, manusUser }: AuthPrincipals): boolean {
  return !!teamSession || !!manusUser;
}

export function canAccessAdminArea({ teamSession, manusUser, ownerOpenId }: AuthPrincipals): boolean {
  if (teamSession) return teamSession.role === "admin";
  if (!manusUser) return false;
  const isOwner = !!ownerOpenId && manusUser.openId === ownerOpenId;
  return manusUser.role === "admin" || isOwner;
}
