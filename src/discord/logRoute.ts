// Logic of POST /api/discord/log: the browser reports connection errors, the
// server writes one sanitized line per report to its log.
export const MAX_FIELD = 200;
export const RATE_LIMIT = 20;
export const RATE_WINDOW_MS = 60_000;

// C0 and C1 control characters plus the Unicode line and paragraph separators.
const CONTROL = new RegExp("[\\u0000-\\u001f\\u007f-\\u009f\\u2028\\u2029]", "g");

export const clean = (v: unknown): string =>
  typeof v === "string" ? v.replace(CONTROL, " ").slice(0, MAX_FIELD) : "";

export type LogLimiter = { hit: (ip: string, nowMs: number) => boolean };

export function createLimiter(limit = RATE_LIMIT, windowMs = RATE_WINDOW_MS): LogLimiter {
  const seen = new Map<string, { start: number; count: number }>();
  return {
    hit(ip, nowMs) {
      if (seen.size > 1000) {
        for (const [k, v] of seen) if (nowMs - v.start >= windowMs) seen.delete(k);
      }
      const e = seen.get(ip);
      if (!e || nowMs - e.start >= windowMs) {
        seen.set(ip, { start: nowMs, count: 1 });
        return true;
      }
      e.count += 1;
      return e.count <= limit;
    },
  };
}

/** 204 when logged, 400 for a malformed body, 429 over the rate limit. */
export function handleLogRequest(
  body: unknown,
  ip: string,
  limiter: LogLimiter,
  write: (line: string) => void = console.error,
  nowMs: number = Date.now(),
): number {
  const b = body as { stage?: unknown; message?: unknown } | null;
  if (!b || typeof b.stage !== "string" || typeof b.message !== "string") return 400;
  if (!limiter.hit(ip, nowMs)) return 429;
  write(`[discord-client] ${clean(b.stage)}: ${clean(b.message)}`);
  return 204;
}
