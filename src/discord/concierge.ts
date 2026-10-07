// Calls to the Concierge's internal HTTP API.
import type { ConciergeConfig } from "./config.ts";
import type { FetchFn } from "./member.ts";
import type { GridValue } from "./grid.ts";
import { MAX_TRIES } from "./grid.ts";

export type ResultPayload = {
  discordId: string;
  puzzleNumber: number;
  date: string;
  tries: number;
  solved: boolean;
  maxTries: typeof MAX_TRIES;
  grid: GridValue[][];
};

export type ConciergeDeps = {
  fetch?: FetchFn;
  sleep?: (ms: number) => Promise<void>;
  log?: (msg: string) => void;
  backoffMs?: number[];
};

const TIMEOUT_MS = 5000;
// Three retries after the first attempt.
export const DEFAULT_BACKOFF_MS = [1000, 3000, 9000];

async function post(cfg: ConciergeConfig, path: string, body: unknown, fetchFn: FetchFn): Promise<Response> {
  return fetchFn(`${cfg.url}/internal/minecraftle/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Token": cfg.internalToken },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
}

/**
 * Reports a finished daily game. Network errors, 429 and 5xx are retried with
 * backoff, at most 3 times. The Concierge keys on discordId + puzzleNumber, so
 * a repeat after an unseen success is harmless. Returns true on success.
 */
export async function reportResult(cfg: ConciergeConfig, payload: ResultPayload, deps: ConciergeDeps = {}): Promise<boolean> {
  const fetchFn = deps.fetch ?? fetch;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const log = deps.log ?? ((m: string) => console.error(m));
  const backoff = deps.backoffMs ?? DEFAULT_BACKOFF_MS;
  const label = `puzzle ${payload.puzzleNumber} player ${payload.discordId}`;

  for (let attempt = 0; attempt <= backoff.length; attempt++) {
    let retryable = true;
    let why: string;
    try {
      const res = await post(cfg, "result", payload, fetchFn);
      if (res.ok) return true;
      why = `HTTP ${res.status}`;
      retryable = res.status === 429 || res.status >= 500;
    } catch (err) {
      why = err instanceof Error ? err.name : "error";
    }
    if (!retryable) {
      log(`minecraftle: result report rejected (${why}) for ${label}`);
      return false;
    }
    if (attempt === backoff.length) {
      log(`minecraftle: result report failed after ${attempt + 1} attempts (${why}) for ${label}`);
      return false;
    }
    await sleep(backoff[attempt]);
  }
  return false;
}

/** Asks the Concierge to post the player's grid. Throws on failure. */
export async function requestShare(cfg: ConciergeConfig, discordId: string, puzzleNumber: number, fetchFn: FetchFn = fetch): Promise<void> {
  const res = await post(cfg, "share", { discordId, puzzleNumber }, fetchFn);
  if (!res.ok) throw new Error(`share failed: HTTP ${res.status}`);
}
