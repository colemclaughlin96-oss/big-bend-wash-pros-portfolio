import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { settingsRouter, servicesRouter } from "./routers/admin";
import { quotesRouter } from "./routers/quotes";
import { teamRouter } from "./routers/team";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  settings: settingsRouter,
  services: servicesRouter,
  quotes: quotesRouter,
  team: teamRouter,
});

export type AppRouter = typeof appRouter;
