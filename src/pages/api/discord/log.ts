import type { NextApiRequest, NextApiResponse } from "next";
import { createLimiter, handleLogRequest } from "@/discord/logRoute";

const limiter = createLimiter();

const clientIp = (req: NextApiRequest): string => {
  const h = req.headers["cf-connecting-ip"] ?? req.headers["x-forwarded-for"];
  const first = (Array.isArray(h) ? h[0] : h)?.split(",")[0].trim();
  return first || req.socket.remoteAddress || "unknown";
};

// Client-side Discord errors end up in the server log. No login needed, so the
// route is rate limited and writes sanitized text only.
export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "method_not_allowed" });
  }
  const status = handleLogRequest(req.body, clientIp(req), limiter);
  return status === 204 ? res.status(204).end() : res.status(status).json({ error: "rejected" });
}
