import type { NextApiRequest, NextApiResponse } from "next";
import { getDiscordConfig } from "@/discord/config";
import { handleTokenRequest } from "@/discord/tokenRoute";

// Exchanges an authorize() code for an access token, checks the Member role,
// and answers with a signed session token. Nothing is stored.
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  const { status, body } = await handleTokenRequest(req.body?.code, getDiscordConfig());
  return res.status(status).json(body);
}
