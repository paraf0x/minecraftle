import type { NextApiRequest, NextApiResponse } from "next";
import { getDiscordConfig } from "@/discord/config";

// Public client id at runtime, for builds without NEXT_PUBLIC_DISCORD_CLIENT_ID.
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ clientId: getDiscordConfig()?.clientId ?? null });
}
