// Token exchange and role check against the Discord API.
import type { DiscordConfig } from "./config.ts";

const API = "https://discord.com/api/v10";
const TIMEOUT_MS = 8000;

export type FetchFn = typeof fetch;

export type ExchangeResult =
  | { ok: true; accessToken: string }
  | { ok: false; reason: "invalid_code" | "discord_error" };

export type MemberResult =
  | { ok: true; discordId: string }
  | { ok: false; reason: "not_member" | "discord_error" };

export async function exchangeCode(
  code: string,
  cfg: Pick<DiscordConfig, "clientId" | "clientSecret">,
  fetchFn: FetchFn = fetch,
): Promise<ExchangeResult> {
  try {
    const res = await fetchFn(`${API}/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: cfg.clientId,
        client_secret: cfg.clientSecret,
        grant_type: "authorization_code",
        code,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 400) return { ok: false, reason: "invalid_code" };
    if (!res.ok) return { ok: false, reason: "discord_error" };
    const data = (await res.json()) as { access_token?: unknown };
    if (typeof data.access_token !== "string" || data.access_token === "") {
      return { ok: false, reason: "discord_error" };
    }
    return { ok: true, accessToken: data.access_token };
  } catch {
    return { ok: false, reason: "discord_error" };
  }
}

/**
 * Member with the configured role: ok. 404 from Discord means the player is
 * not in the guild. Any other failure rejects the player.
 */
export async function checkMembership(
  accessToken: string,
  cfg: Pick<DiscordConfig, "guildId" | "memberRoleId">,
  fetchFn: FetchFn = fetch,
): Promise<MemberResult> {
  try {
    const res = await fetchFn(`${API}/users/@me/guilds/${encodeURIComponent(cfg.guildId)}/member`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 404) return { ok: false, reason: "not_member" };
    if (!res.ok) return { ok: false, reason: "discord_error" };
    const member = (await res.json()) as { roles?: unknown; user?: { id?: unknown } };
    if (!Array.isArray(member.roles) || !member.roles.includes(cfg.memberRoleId)) {
      return { ok: false, reason: "not_member" };
    }
    if (typeof member.user?.id !== "string") {
      // The member object normally carries the user. Ask for the id if not.
      const me = await fetchFn(`${API}/users/@me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!me.ok) return { ok: false, reason: "discord_error" };
      const user = (await me.json()) as { id?: unknown };
      if (typeof user.id !== "string") return { ok: false, reason: "discord_error" };
      return { ok: true, discordId: user.id };
    }
    return { ok: true, discordId: member.user.id };
  } catch {
    return { ok: false, reason: "discord_error" };
  }
}
