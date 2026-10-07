// Rules for when the daily puzzle may be played inside Discord. Pure, so the
// provider and the tests share one definition.
export type Mode = "off" | "connecting" | "member" | "guest" | "error";
export type DailyGate = "open" | "loading" | "error" | "guest";

/**
 * Outside Discord (mode "off") and in random mode the board is always open.
 * In Discord the daily puzzle needs a Member whose saved state is loaded.
 */
export function dailyGate(mode: Mode, todayLoaded: boolean, isRandom: boolean): DailyGate {
  if (isRandom || mode === "off") return "open";
  if (mode === "guest") return "guest";
  if (mode === "error") return "error";
  if (mode === "member" && todayLoaded) return "open";
  return "loading";
}

export const canPlayDaily = (mode: Mode, todayLoaded: boolean, isRandom: boolean) =>
  dailyGate(mode, todayLoaded, isRandom) === "open";

export type Stage = "config" | "ready" | "authorize" | "token" | "authenticate" | "today" | "save";

const CAUSE: Record<Stage, string> = {
  config: "The server did not hand over the Discord settings.",
  ready: "Discord did not answer when the activity started.",
  authorize:
    "Discord refused the login step. The Discord application probably has no OAuth2 redirect URI set in the Developer Portal.",
  token: "The server could not sign you in with Discord.",
  authenticate: "Discord did not accept the login.",
  today: "Your saved game for today could not be loaded.",
  save: "Your session ended.",
};

export const causeText = (stage: Stage) => CAUSE[stage];

/** Error code and text of an SDK, fetch or tRPC error, without anything else. */
export function describeError(err: unknown): string {
  const e = err as { code?: unknown; message?: unknown; data?: { code?: unknown } } | null | undefined;
  const parts: string[] = [];
  const code = e?.code ?? e?.data?.code;
  if (typeof code === "string" || typeof code === "number") parts.push(`code ${code}`);
  if (typeof e?.message === "string" && e.message) parts.push(e.message);
  return parts.join(": ") || "unknown error";
}

/** Retry delay for a failed save: 2 s, 4 s, 8 s, 16 s, then 30 s. */
export const saveBackoffMs = (failures: number) => Math.min(30_000, 2000 * 2 ** Math.max(0, failures - 1));
