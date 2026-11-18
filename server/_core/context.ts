import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { getTeamSessionFromRequest, type TeamSessionPayload } from "../teamAuth";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  teamSession: TeamSessionPayload | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // Authentication is optional for public procedures.
    user = null;
  }

  let teamSession: TeamSessionPayload | null = null;
  try {
    teamSession = await getTeamSessionFromRequest(opts.req);
  } catch {
    teamSession = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
    teamSession,
  };
}
