import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { ENV } from "./env";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
});

export const router = t.router;
export const publicProcedure = t.procedure;

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  // Accept either the team-auth session (dashboard email+password) or the
  // legacy Manus OAuth user. The dashboard now logs in via team sessions.
  if (!ctx.user && !ctx.teamSession) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }

  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    // Team session is the primary dashboard auth. A team admin passes; a team
    // member is forbidden from admin-only procedures.
    if (ctx.teamSession) {
      if (ctx.teamSession.role !== "admin") {
        throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
      }
      return next({ ctx: { ...ctx, user: ctx.user } });
    }

    // Legacy fallback: Manus OAuth owner/admin.
    const isOwner = !!ctx.user && !!ENV.ownerOpenId && ctx.user.openId === ENV.ownerOpenId;
    if (!ctx.user || (ctx.user.role !== 'admin' && !isOwner)) {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    return next({
      ctx: {
        ...ctx,
        user: ctx.user,
      },
    });
  }),
);

/**
 * Team-auth procedures (dashboard email+password). Independent of Manus OAuth.
 * `teamProcedure` requires a valid team session; `teamAdminProcedure` also
 * requires the team session role to be "admin".
 */
export const teamProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    if (!ctx.teamSession) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    return next({ ctx: { ...ctx, teamSession: ctx.teamSession } });
  }),
);

export const teamAdminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;
    if (!ctx.teamSession) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
    }
    if (ctx.teamSession.role !== "admin") {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }
    return next({ ctx: { ...ctx, teamSession: ctx.teamSession } });
  }),
);
