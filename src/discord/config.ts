// Discord settings from the environment. A missing group disables the
// matching feature; the game itself keeps working.
export type DiscordConfig = {
  clientId: string;
  clientSecret: string;
  guildId: string;
  memberRoleId: string;
  sessionSecret: string;
};

export type ConciergeConfig = {
  url: string;
  internalToken: string;
};

type Env = Record<string, string | undefined>;

const filled = (v: string | undefined): v is string => typeof v === "string" && v.trim() !== "";

export function getDiscordConfig(env: Env = process.env): DiscordConfig | null {
  const { DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET, DISCORD_GUILD_ID, MEMBER_ROLE_ID, SESSION_SECRET } = env;
  if (
    !filled(DISCORD_CLIENT_ID) ||
    !filled(DISCORD_CLIENT_SECRET) ||
    !filled(DISCORD_GUILD_ID) ||
    !filled(MEMBER_ROLE_ID) ||
    !filled(SESSION_SECRET) ||
    SESSION_SECRET.length < 32
  ) {
    return null;
  }
  return {
    clientId: DISCORD_CLIENT_ID.trim(),
    clientSecret: DISCORD_CLIENT_SECRET.trim(),
    guildId: DISCORD_GUILD_ID.trim(),
    memberRoleId: MEMBER_ROLE_ID.trim(),
    sessionSecret: SESSION_SECRET,
  };
}

export function getConciergeConfig(env: Env = process.env): ConciergeConfig | null {
  const { CONCIERGE_URL, INTERNAL_TOKEN } = env;
  if (!filled(CONCIERGE_URL) || !filled(INTERNAL_TOKEN)) return null;
  return { url: CONCIERGE_URL.trim().replace(/\/+$/, ""), internalToken: INTERNAL_TOKEN.trim() };
}
