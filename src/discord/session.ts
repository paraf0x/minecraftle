// Signed session token: base64url(payload) "." base64url(HMAC-SHA256).
// Issued after the role check, kept in client memory, sent as a bearer token.
import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_TTL_SECONDS = 8 * 60 * 60;

type Payload = { sub: string; iat: number; exp: number };

const b64 = (buf: Buffer | string) => Buffer.from(buf).toString("base64url");
const mac = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest();

export function signSession(discordId: string, secret: string, now: Date = new Date()): string {
  const iat = Math.floor(now.getTime() / 1000);
  const payload: Payload = { sub: discordId, iat, exp: iat + SESSION_TTL_SECONDS };
  const body = b64(JSON.stringify(payload));
  return `${body}.${b64(mac(secret, body))}`;
}

/** Returns the Discord id, or null for anything malformed, forged, or expired. */
export function verifySession(token: string | undefined | null, secret: string, now: Date = new Date()): string | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = mac(secret, body);
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as Payload;
    if (typeof payload.sub !== "string" || typeof payload.exp !== "number") return null;
    if (payload.exp <= Math.floor(now.getTime() / 1000)) return null;
    return payload.sub;
  } catch {
    return null;
  }
}
