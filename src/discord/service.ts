// Game rules for Discord players: one daily game each, resumable, reported once.
import type { ConciergeConfig } from "./config.ts";
import { reportResult, requestShare } from "./concierge.ts";
import type { ConciergeDeps } from "./concierge.ts";
import { puzzleNumber, utcDateKey } from "./daily.ts";
import { deriveStatus, guessesSchema, hasGuessAfterWin, toReportGrid } from "./grid.ts";
import type { GameStatus, Guess } from "./grid.ts";
import type { FetchFn } from "./member.ts";
import type { GameRecord, GameStore } from "./store.ts";

export type ServiceErrorCode =
  | "BAD_GUESSES"
  | "STALE_PUZZLE"
  | "ALREADY_FINISHED"
  | "CONFLICT"
  | "NOT_FINISHED"
  | "COOLDOWN"
  | "UNAVAILABLE";

export class ServiceError extends Error {
  code: ServiceErrorCode;
  constructor(code: ServiceErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}

export type ServiceDeps = {
  store: GameStore;
  concierge: ConciergeConfig | null;
  conciergeDeps?: ConciergeDeps;
  now?: () => Date;
};

export type PublicGame = { status: GameStatus; guesses: Guess[] };
export type TodayView = { puzzleNumber: number; date: string; game: PublicGame | null };

const view = (g: GameRecord): PublicGame => ({ status: g.status, guesses: g.guesses });
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

export async function getToday(deps: ServiceDeps, discordId: string): Promise<TodayView> {
  const now = (deps.now ?? (() => new Date()))();
  const number = puzzleNumber(now);
  const game = await deps.store.find(discordId, number);
  return { puzzleNumber: number, date: utcDateKey(now), game: game ? view(game) : null };
}

/**
 * Stores the full list of guesses so far. Resending the stored list is a no-op.
 * Returns the stored game and, when this call finished the game, the pending
 * report. Only the call that finishes the game starts a report.
 */
export async function saveGuesses(
  deps: ServiceDeps,
  discordId: string,
  number: number,
  rawGuesses: unknown,
): Promise<{ game: PublicGame; report?: Promise<void> }> {
  const now = (deps.now ?? (() => new Date()))();
  if (number !== puzzleNumber(now)) throw new ServiceError("STALE_PUZZLE", "This puzzle is no longer today's puzzle");

  const parsed = guessesSchema.safeParse(rawGuesses);
  if (!parsed.success || hasGuessAfterWin(parsed.data)) throw new ServiceError("BAD_GUESSES", "Invalid guesses");
  const guesses = parsed.data;
  const status = deriveStatus(guesses);

  const existing = await deps.store.find(discordId, number);
  if (existing && existing.status !== "inprogress") {
    throw new ServiceError("ALREADY_FINISHED", "Today's puzzle is already finished");
  }
  const storedTries = existing ? existing.guesses.length : 0;
  if (existing && same(existing.guesses, guesses)) return { game: view(existing) };
  if (guesses.length <= storedTries || !same(existing?.guesses ?? [], guesses.slice(0, storedTries))) {
    throw new ServiceError("CONFLICT", "Guesses do not continue the stored game");
  }

  const written = existing
    ? await deps.store.advance(discordId, number, storedTries, { guesses, status })
    : await deps.store.insert({
        discordId,
        puzzleNumber: number,
        puzzleDate: utcDateKey(now),
        guesses,
        status,
        reported: false,
      });
  if (!written) throw new ServiceError("CONFLICT", "The game changed in the meantime");

  const game: PublicGame = { status, guesses };
  if (status === "inprogress") return { game };
  return { game, report: startReport(deps, discordId, number, utcDateKey(now), guesses, status) };
}

function startReport(
  deps: ServiceDeps,
  discordId: string,
  number: number,
  date: string,
  guesses: Guess[],
  status: GameStatus,
): Promise<void> {
  const cfg = deps.concierge;
  if (!cfg) return Promise.resolve();
  return reportResult(
    cfg,
    {
      discordId,
      puzzleNumber: number,
      date,
      tries: guesses.length,
      solved: status === "won",
      maxTries: 10,
      grid: toReportGrid(guesses),
    },
    deps.conciergeDeps,
  ).then(async (ok) => {
    if (ok) await deps.store.markReported(discordId, number);
  });
}

const SHARE_COOLDOWN_MS = 15_000;
const lastShare = new Map<string, number>();

/** Asks the Concierge to post the player's grid. Needs a finished game. */
export async function shareGrid(deps: ServiceDeps, discordId: string, number: number, fetchFn?: FetchFn): Promise<void> {
  const game = await deps.store.find(discordId, number);
  if (!game || game.status === "inprogress") throw new ServiceError("NOT_FINISHED", "Finish the puzzle first");
  if (!deps.concierge) throw new ServiceError("UNAVAILABLE", "Sharing is not configured");

  const key = `${discordId}:${number}`;
  const nowMs = (deps.now ?? (() => new Date()))().getTime();
  const last = lastShare.get(key);
  if (last !== undefined && nowMs - last < SHARE_COOLDOWN_MS) {
    throw new ServiceError("COOLDOWN", "Grid was shared a moment ago");
  }
  lastShare.set(key, nowMs);
  try {
    await requestShare(deps.concierge, discordId, number, fetchFn);
  } catch (err) {
    lastShare.delete(key);
    console.error(`minecraftle: share failed for puzzle ${number}: ${err instanceof Error ? err.message : "error"}`);
    throw new ServiceError("UNAVAILABLE", "Could not share the grid");
  }
}
