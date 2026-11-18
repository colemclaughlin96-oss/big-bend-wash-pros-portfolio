import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  generateInviteToken,
  signTeamSession,
  verifyTeamSession,
  canAccessDashboard,
  canAccessAdminArea,
} from "./teamAuth";

describe("teamAuth: passwords", () => {
  it("hashes and verifies a correct password", async () => {
    const hash = await hashPassword("QuoteBid2026!");
    expect(hash).not.toBe("QuoteBid2026!");
    expect(await verifyPassword("QuoteBid2026!", hash)).toBe(true);
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("correct-horse");
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("returns false for an empty hash", async () => {
    expect(await verifyPassword("anything", "")).toBe(false);
  });
});

describe("teamAuth: invite tokens", () => {
  it("generates unique, sufficiently long tokens", () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a).not.toBe(b);
    expect(a.length).toBeGreaterThanOrEqual(32);
    expect(a).toMatch(/^[0-9a-f]+$/);
  });
});

describe("teamAuth: authorization policy", () => {
  it("lets any team session (admin or member) access the dashboard/workflow", () => {
    expect(canAccessDashboard({ teamSession: { role: "admin" } })).toBe(true);
    expect(canAccessDashboard({ teamSession: { role: "member" } })).toBe(true);
  });

  it("blocks unauthenticated principals from the dashboard", () => {
    expect(canAccessDashboard({ teamSession: null, manusUser: null })).toBe(false);
    expect(canAccessDashboard({})).toBe(false);
  });

  it("restricts admin areas to team admins, blocking members", () => {
    expect(canAccessAdminArea({ teamSession: { role: "admin" } })).toBe(true);
    expect(canAccessAdminArea({ teamSession: { role: "member" } })).toBe(false);
  });

  it("falls back to legacy Manus owner/admin when no team session", () => {
    expect(
      canAccessAdminArea({ manusUser: { openId: "owner-1" }, ownerOpenId: "owner-1" }),
    ).toBe(true);
    expect(canAccessAdminArea({ manusUser: { role: "admin" } })).toBe(true);
    expect(canAccessAdminArea({ manusUser: { role: "user", openId: "x" }, ownerOpenId: "owner-1" })).toBe(false);
    expect(canAccessAdminArea({ manusUser: null })).toBe(false);
  });
});

describe("teamAuth: session JWT", () => {
  it("signs and verifies a valid session payload", async () => {
    const token = await signTeamSession({ teamUserId: 7, email: "a@b.com", role: "admin" });
    const payload = await verifyTeamSession(token);
    expect(payload).toEqual({ teamUserId: 7, email: "a@b.com", role: "admin" });
  });

  it("returns null for a tampered/invalid token", async () => {
    const token = await signTeamSession({ teamUserId: 1, email: "x@y.com", role: "member" });
    const tampered = token.slice(0, -3) + "abc";
    expect(await verifyTeamSession(tampered)).toBeNull();
  });

  it("returns null for empty input", async () => {
    expect(await verifyTeamSession(undefined)).toBeNull();
    expect(await verifyTeamSession(null)).toBeNull();
    expect(await verifyTeamSession("")).toBeNull();
  });
});
