import { TRPCError } from "@trpc/server";
import { z } from "zod";
import * as db from "../db";
import { getSessionCookieOptions } from "../_core/cookies";
import {
  publicProcedure,
  router,
  teamAdminProcedure,
  teamProcedure,
} from "../_core/trpc";
import {
  INVITE_TTL_MS,
  TEAM_COOKIE_NAME,
  TEAM_SESSION_MS,
  generateInviteToken,
  hashPassword,
  signTeamSession,
  verifyPassword,
} from "../teamAuth";

const emailSchema = z.string().trim().toLowerCase().email();
const passwordSchema = z.string().min(8, "Password must be at least 8 characters");

/** Strip sensitive fields before returning a team user to the client. */
function publicTeamUser(u: {
  id: number;
  email: string;
  name: string | null;
  role: "admin" | "member";
  status: "invited" | "active";
  lastLoginAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    status: u.status,
    lastLoginAt: u.lastLoginAt,
    createdAt: u.createdAt,
  };
}

export const teamRouter = router({
  /* ----------------------------- Session ----------------------------- */

  // Current logged-in team user (or null). Refreshed from DB so role/status changes apply.
  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.teamSession) return null;
    const user = await db.getTeamUserById(ctx.teamSession.teamUserId);
    if (!user || user.status !== "active") return null;
    return publicTeamUser(user);
  }),

  login: publicProcedure
    .input(z.object({ email: emailSchema, password: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const user = await db.getTeamUserByEmail(input.email);
      const invalid = () =>
        new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });

      if (!user || user.status !== "active" || !user.passwordHash) throw invalid();
      const ok = await verifyPassword(input.password, user.passwordHash);
      if (!ok) throw invalid();

      await db.updateTeamUser(user.id, { lastLoginAt: new Date() });

      const token = await signTeamSession({
        teamUserId: user.id,
        email: user.email,
        role: user.role,
      });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(TEAM_COOKIE_NAME, token, {
        ...cookieOptions,
        maxAge: TEAM_SESSION_MS,
      });
      return publicTeamUser(user);
    }),

  logout: publicProcedure.mutation(({ ctx }) => {
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(TEAM_COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return { success: true } as const;
  }),

  // Look up an invite by token (for the accept-invite page to show who/what).
  getInvite: publicProcedure
    .input(z.object({ token: z.string().min(1) }))
    .query(async ({ input }) => {
      const user = await db.getTeamUserByInviteToken(input.token);
      if (!user || user.status !== "invited") return null;
      if (user.inviteExpiresAt && user.inviteExpiresAt.getTime() < Date.now()) {
        return { expired: true as const, email: user.email, name: user.name };
      }
      return { expired: false as const, email: user.email, name: user.name };
    }),

  // Invitee sets their password to activate their account.
  acceptInvite: publicProcedure
    .input(
      z.object({
        token: z.string().min(1),
        name: z.string().trim().min(1).max(200),
        password: passwordSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await db.getTeamUserByInviteToken(input.token);
      if (!user || user.status !== "invited") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This invite is no longer valid." });
      }
      if (user.inviteExpiresAt && user.inviteExpiresAt.getTime() < Date.now()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This invite has expired. Ask an admin to resend it." });
      }

      const passwordHash = await hashPassword(input.password);
      await db.updateTeamUser(user.id, {
        name: input.name,
        passwordHash,
        status: "active",
        inviteToken: null,
        inviteExpiresAt: null,
        lastLoginAt: new Date(),
      });

      const token = await signTeamSession({
        teamUserId: user.id,
        email: user.email,
        role: user.role,
      });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(TEAM_COOKIE_NAME, token, {
        ...cookieOptions,
        maxAge: TEAM_SESSION_MS,
      });
      return { success: true } as const;
    }),

  // Logged-in user changes their own password.
  changePassword: teamProcedure
    .input(
      z.object({
        currentPassword: z.string().min(1),
        newPassword: passwordSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const user = await db.getTeamUserById(ctx.teamSession.teamUserId);
      if (!user || !user.passwordHash) {
        throw new TRPCError({ code: "UNAUTHORIZED" });
      }
      const ok = await verifyPassword(input.currentPassword, user.passwordHash);
      if (!ok) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Current password is incorrect." });
      }
      const passwordHash = await hashPassword(input.newPassword);
      await db.updateTeamUser(user.id, { passwordHash });
      return { success: true } as const;
    }),

  /* ----------------------------- Admin: team management ----------------------------- */

  list: teamAdminProcedure.query(async () => {
    const users = await db.listTeamUsers();
    return users.map(publicTeamUser);
  }),

  invite: teamAdminProcedure
    .input(
      z.object({
        email: emailSchema,
        name: z.string().trim().max(200).optional(),
        role: z.enum(["admin", "member"]).default("member"),
        origin: z.string().url(),
      })
    )
    .mutation(async ({ input }) => {
      const existing = await db.getTeamUserByEmail(input.email);
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            existing.status === "active"
              ? "That email already has an active account."
              : "That email already has a pending invite.",
        });
      }
      const token = generateInviteToken();
      const created = await db.createTeamUser({
        email: input.email,
        name: input.name || null,
        role: input.role,
        status: "invited",
        inviteToken: token,
        inviteExpiresAt: new Date(Date.now() + INVITE_TTL_MS),
      });
      const inviteUrl = `${input.origin}/admin/accept-invite?token=${token}`;
      return { user: publicTeamUser(created), inviteUrl };
    }),

  // Re-generate an invite link for a pending user.
  resendInvite: teamAdminProcedure
    .input(z.object({ id: z.number().int(), origin: z.string().url() }))
    .mutation(async ({ input }) => {
      const user = await db.getTeamUserById(input.id);
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });
      if (user.status !== "invited") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That user is already active." });
      }
      const token = generateInviteToken();
      await db.updateTeamUser(user.id, {
        inviteToken: token,
        inviteExpiresAt: new Date(Date.now() + INVITE_TTL_MS),
      });
      return { inviteUrl: `${input.origin}/admin/accept-invite?token=${token}` };
    }),

  updateRole: teamAdminProcedure
    .input(z.object({ id: z.number().int(), role: z.enum(["admin", "member"]) }))
    .mutation(async ({ ctx, input }) => {
      const user = await db.getTeamUserById(input.id);
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      // Prevent removing the last active admin.
      if (user.role === "admin" && input.role === "member") {
        const adminCount = await db.countTeamAdmins();
        if (adminCount <= 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You can't demote the last admin. Promote someone else first.",
          });
        }
      }
      await db.updateTeamUser(input.id, { role: input.role });
      return { success: true } as const;
    }),

  remove: teamAdminProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      if (input.id === ctx.teamSession.teamUserId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You can't remove your own account." });
      }
      const user = await db.getTeamUserById(input.id);
      if (!user) throw new TRPCError({ code: "NOT_FOUND" });

      if (user.role === "admin" && user.status === "active") {
        const adminCount = await db.countTeamAdmins();
        if (adminCount <= 1) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "You can't remove the last admin.",
          });
        }
      }
      await db.deleteTeamUser(input.id);
      return { success: true } as const;
    }),
});
