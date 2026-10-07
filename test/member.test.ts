import assert from "node:assert/strict";
import { test } from "node:test";
import { getDiscordConfig } from "../src/discord/config.ts";
import { checkMembership, exchangeCode } from "../src/discord/member.ts";
import { signSession, verifySession } from "../src/discord/session.ts";
import { handleTokenRequest } from "../src/discord/tokenRoute.ts";

const cfg = {
  clientId: "111",
  clientSecret: "secret",
  guildId: "222",
  memberRoleId: "333",
  sessionSecret: "s".repeat(40),
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
const fakeFetch = (handler: (url: string, init?: RequestInit) => Response | Promise<Response>) =>
  (async (url: string | URL | Request, init?: RequestInit) => handler(String(url), init)) as typeof fetch;

test("member with the role passes and the guild URL and bearer token are used", async () => {
  let seen: { url: string; auth?: string } | undefined;
  const f = fakeFetch((url, init) => {
    seen = { url, auth: (init?.headers as Record<string, string>).Authorization };
    return json(200, { roles: ["1", "333"], user: { id: "42" } });
  });
  assert.deepEqual(await checkMembership("tok", cfg, f), { ok: true, discordId: "42" });
  assert.equal(seen?.url, "https://discord.com/api/v10/users/@me/guilds/222/member");
  assert.equal(seen?.auth, "Bearer tok");
});

test("member without the role is refused", async () => {
  const f = fakeFetch(() => json(200, { roles: ["1"], user: { id: "42" } }));
  assert.deepEqual(await checkMembership("tok", cfg, f), { ok: false, reason: "not_member" });
});

test("404 means not a member", async () => {
  const f = fakeFetch(() => json(404, { code: 10007 }));
  assert.deepEqual(await checkMembership("tok", cfg, f), { ok: false, reason: "not_member" });
});

test("errors from Discord reject the player", async () => {
  for (const status of [401, 403, 429, 500, 503]) {
    const r = await checkMembership("tok", cfg, fakeFetch(() => json(status, {})));
    assert.deepEqual(r, { ok: false, reason: "discord_error" }, String(status));
  }
  const thrown = fakeFetch(() => {
    throw new Error("network down");
  });
  assert.deepEqual(await checkMembership("tok", cfg, thrown), { ok: false, reason: "discord_error" });
  const garbage = fakeFetch(() => new Response("not json", { status: 200 }));
  assert.deepEqual(await checkMembership("tok", cfg, garbage), { ok: false, reason: "discord_error" });
});

test("roles missing from the answer count as no role", async () => {
  const f = fakeFetch(() => json(200, { user: { id: "42" } }));
  assert.deepEqual(await checkMembership("tok", cfg, f), { ok: false, reason: "not_member" });
});

test("code exchange posts client credentials and returns the access token", async () => {
  let body = "";
  const f = fakeFetch((_url, init) => {
    body = String(init?.body);
    return json(200, { access_token: "at" });
  });
  assert.deepEqual(await exchangeCode("abc", cfg, f), { ok: true, accessToken: "at" });
  const p = new URLSearchParams(body);
  assert.equal(p.get("grant_type"), "authorization_code");
  assert.equal(p.get("code"), "abc");
  assert.equal(p.get("client_id"), "111");
  assert.equal(p.get("client_secret"), "secret");
});

test("exchange: 400 is an invalid code, other failures are Discord errors", async () => {
  assert.deepEqual(await exchangeCode("x", cfg, fakeFetch(() => json(400, { error: "invalid_grant" }))), { ok: false, reason: "invalid_code" });
  assert.deepEqual(await exchangeCode("x", cfg, fakeFetch(() => json(500, {}))), { ok: false, reason: "discord_error" });
  assert.deepEqual(await exchangeCode("x", cfg, fakeFetch(() => json(200, {}))), { ok: false, reason: "discord_error" });
});

test("token route: no code gives 400, no config 503", async () => {
  assert.equal((await handleTokenRequest(undefined, cfg)).status, 400);
  assert.equal((await handleTokenRequest("", cfg)).status, 400);
  assert.equal((await handleTokenRequest({}, cfg)).status, 400);
  assert.equal((await handleTokenRequest("abc", null)).status, 503);
});

test("token route: member gets a session, non-member 403, Discord failure 502", async () => {
  const ok = fakeFetch((url) =>
    url.endsWith("/oauth2/token") ? json(200, { access_token: "at" }) : json(200, { roles: ["333"], user: { id: "42" } }),
  );
  const res = await handleTokenRequest("abc", cfg, ok);
  assert.equal(res.status, 200);
  assert.equal(res.body.access_token, "at");
  assert.equal(verifySession(res.body.session as string, cfg.sessionSecret), "42");

  const nonMember = fakeFetch((url) =>
    url.endsWith("/oauth2/token") ? json(200, { access_token: "at" }) : json(200, { roles: [], user: { id: "42" } }),
  );
  const denied = await handleTokenRequest("abc", cfg, nonMember);
  assert.equal(denied.status, 403);
  assert.equal(denied.body.access_token, undefined);

  const broken = fakeFetch((url) =>
    url.endsWith("/oauth2/token") ? json(200, { access_token: "at" }) : json(500, {}),
  );
  assert.equal((await handleTokenRequest("abc", cfg, broken)).status, 502);
  assert.equal((await handleTokenRequest("abc", cfg, fakeFetch(() => json(400, {})))).status, 400);
});

test("session tokens verify, expire, and reject tampering", () => {
  const t0 = new Date("2026-10-07T10:00:00Z");
  const token = signSession("42", cfg.sessionSecret, t0);
  assert.equal(verifySession(token, cfg.sessionSecret, t0), "42");
  assert.equal(verifySession(token, "x".repeat(40), t0), null);
  assert.equal(verifySession(token, cfg.sessionSecret, new Date(t0.getTime() + 9 * 3600_000)), null);
  const [body, sig] = token.split(".");
  const forged = Buffer.from(JSON.stringify({ sub: "99", iat: 0, exp: 9_999_999_999 })).toString("base64url");
  assert.equal(verifySession(`${forged}.${sig}`, cfg.sessionSecret, t0), null);
  assert.equal(verifySession(`${body}.`, cfg.sessionSecret, t0), null);
  assert.equal(verifySession("garbage", cfg.sessionSecret, t0), null);
  assert.equal(verifySession(undefined, cfg.sessionSecret, t0), null);
});

test("config: missing or short values disable Discord features", () => {
  const env = {
    DISCORD_CLIENT_ID: "1",
    DISCORD_CLIENT_SECRET: "s",
    DISCORD_GUILD_ID: "2",
    MEMBER_ROLE_ID: "3",
    SESSION_SECRET: "k".repeat(32),
  };
  assert.ok(getDiscordConfig(env));
  assert.equal(getDiscordConfig({ ...env, MEMBER_ROLE_ID: "" }), null);
  assert.equal(getDiscordConfig({ ...env, SESSION_SECRET: "short" }), null);
  assert.equal(getDiscordConfig({}), null);
});

test("token route logs status and Discord error field, never code or secret", async () => {
  const lines: string[] = [];
  const f = fakeFetch(() => json(400, { error: "invalid_grant", error_description: "Invalid code secret-code" }));
  const r = await handleTokenRequest("secret-code", cfg, f, new Date(), (l) => lines.push(l));
  assert.equal(r.status, 400);
  assert.deepEqual(lines, ["[discord-token] exchange failed: status 400, error invalid_grant"]);
  const all = lines.join("\n");
  assert.ok(!all.includes("secret-code") && !all.includes(cfg.clientSecret) && !all.includes(cfg.sessionSecret));
});

test("token route logs a failed role check and a network error", async () => {
  const lines: string[] = [];
  const f = fakeFetch((url) => (url.endsWith("/oauth2/token") ? json(200, { access_token: "AT123" }) : json(401, { message: "401: Unauthorized" })));
  assert.equal((await handleTokenRequest("c", cfg, f, new Date(), (l) => lines.push(l))).status, 502);
  const down = fakeFetch(() => {
    throw new Error("boom");
  });
  assert.equal((await handleTokenRequest("c", cfg, down, new Date(), (l) => lines.push(l))).status, 502);
  assert.deepEqual(lines, ["[discord-token] member failed: status 401", "[discord-token] exchange failed: status none"]);
  assert.ok(!lines.join("").includes("AT123"));
});

test("token route stays silent on success and on not_member", async () => {
  const lines: string[] = [];
  const ok = fakeFetch((url) =>
    url.endsWith("/oauth2/token") ? json(200, { access_token: "at" }) : json(200, { roles: ["333"], user: { id: "42" } }),
  );
  assert.equal((await handleTokenRequest("c", cfg, ok, new Date(), (l) => lines.push(l))).status, 200);
  const no = fakeFetch((url) => (url.endsWith("/oauth2/token") ? json(200, { access_token: "at" }) : json(404, {})));
  assert.equal((await handleTokenRequest("c", cfg, no, new Date(), (l) => lines.push(l))).status, 403);
  assert.deepEqual(lines, []);
});
