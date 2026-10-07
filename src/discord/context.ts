// tRPC context: the Discord id from a valid bearer session token, else null.
import type { IncomingMessage } from "node:http";
import { getDiscordConfig } from "./config.ts";
import { verifySession } from "./session.ts";

export type DiscordContext = { discordId: string | null };

export function createDiscordContext({ req }: { req: Pick<IncomingMessage, "headers"> }): DiscordContext {
  const cfg = getDiscordConfig();
  const header = req.headers.authorization;
  if (!cfg || !header?.startsWith("Bearer ")) return { discordId: null };
  return { discordId: verifySession(header.slice(7), cfg.sessionSecret) };
}
