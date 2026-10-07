// Logic of POST /api/discord/token, kept apart from the Next handler for tests.
import type { DiscordConfig } from "./config.ts";
import { checkMembership, exchangeCode } from "./member.ts";
import type { FetchFn } from "./member.ts";
import { signSession } from "./session.ts";

export type TokenResponse = { status: number; body: Record<string, unknown> };

export async function handleTokenRequest(
  code: unknown,
  cfg: DiscordConfig | null,
  fetchFn: FetchFn = fetch,
  now: Date = new Date(),
): Promise<TokenResponse> {
  if (typeof code !== "string" || code === "" || code.length > 512) {
    return { status: 400, body: { error: "missing_code" } };
  }
  if (!cfg) return { status: 503, body: { error: "not_configured" } };

  const exchanged = await exchangeCode(code, cfg, fetchFn);
  if (!exchanged.ok) {
    return exchanged.reason === "invalid_code"
      ? { status: 400, body: { error: "invalid_code" } }
      : { status: 502, body: { error: "discord_unavailable" } };
  }
  const member = await checkMembership(exchanged.accessToken, cfg, fetchFn);
  if (!member.ok) {
    return member.reason === "not_member"
      ? { status: 403, body: { error: "not_member" } }
      : { status: 502, body: { error: "discord_unavailable" } };
  }
  return {
    status: 200,
    body: {
      access_token: exchanged.accessToken,
      session: signSession(member.discordId, cfg.sessionSecret, now),
    },
  };
}
