import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getConciergeConfig } from "@/discord/config";
import { prismaStore } from "@/discord/prismaStore";
import { ServiceError, getToday, saveGuesses, shareGrid } from "@/discord/service";
import type { ServiceDeps, ServiceErrorCode } from "@/discord/service";
import { createRouter, publicProcedure } from "../trpc";

const deps = (): ServiceDeps => ({ store: prismaStore, concierge: getConciergeConfig() });

const codes: Record<ServiceErrorCode, TRPCError["code"]> = {
  BAD_GUESSES: "BAD_REQUEST",
  STALE_PUZZLE: "PRECONDITION_FAILED",
  ALREADY_FINISHED: "CONFLICT",
  CONFLICT: "CONFLICT",
  NOT_FINISHED: "PRECONDITION_FAILED",
  COOLDOWN: "TOO_MANY_REQUESTS",
  UNAVAILABLE: "BAD_GATEWAY",
};

async function run<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof ServiceError) throw new TRPCError({ code: codes[err.code], message: err.message });
    console.error(err);
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "error" });
  }
}

// Every procedure needs a session from /api/discord/token.
const memberProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.discordId) throw new TRPCError({ code: "UNAUTHORIZED", message: "No session" });
  return next({ ctx: { discordId: ctx.discordId } });
});

export const discordRouter = createRouter({
  today: memberProcedure.query(({ ctx }) => run(() => getToday(deps(), ctx.discordId))),

  saveGuesses: memberProcedure
    .input(z.object({ puzzleNumber: z.number().int(), guesses: z.unknown() }))
    .mutation(({ ctx, input }) =>
      run(async () => {
        const { game } = await saveGuesses(deps(), ctx.discordId, input.puzzleNumber, input.guesses);
        return game;
      }),
    ),

  share: memberProcedure
    .input(z.object({ puzzleNumber: z.number().int() }))
    .mutation(({ ctx, input }) => run(async () => {
      await shareGrid(deps(), ctx.discordId, input.puzzleNumber);
      return { ok: true };
    })),
});
