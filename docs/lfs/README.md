# Minecraftle for Low FPS Society

This fork runs Minecraftle as a Discord activity. Members with a given role
play the daily puzzle once each; finished games are sent to an internal
service (the Concierge). Design: `2026-10-07-minecraftle-design.md`.

Source: https://github.com/paraf0x/minecraftle (AGPL-3.0, see `LICENSE`).
The game shows a "Source" link in every mode. Item textures belong to Mojang.

## Setup

1. Configure the Discord application (section "Discord setup" below).
2. Copy `.env.example` to `.env` and fill it in (table below).
3. Create the Docker network once if it does not exist: `docker network create lfs-net`.
4. `docker compose -f docker-compose.lfs.yml up -d --build`

The app listens on `127.0.0.1:8095`. Point the Cloudflare Tunnel hostname
`minecraftle.paraf0x.win` at it. The host must not sit behind Cloudflare
Access, because Discord's proxy cannot log in. Migrations run on every start
and the container waits for the database for up to 60 seconds. Data lives in
`./data/postgres`.

## Discord setup

In the Developer Portal, in the application of the Concierge:

1. Activities: enable them and map URL `/` to `minecraftle.paraf0x.win`.
2. OAuth2: add at least one redirect URI, for example `https://127.0.0.1`. The
   URI is never opened. Without any redirect URI, `authorize()` fails, nobody
   can sign in, and the daily puzzle stays locked with the message "Discord
   refused the login step".
3. Players authorise the scopes `identify` and `guilds.members.read`.

When sign-in fails, the server log shows a line `[discord-client] <stage>:
<message>` with the failed stage (`config`, `ready`, `authorize`, `token`,
`authenticate`, `today`, `save`) and Discord's error code. Failed token
exchanges also log `[discord-token] <step> failed: status <n>, error <field>`.

## Variables

| Variable | Meaning |
|---|---|
| `DISCORD_CLIENT_ID` | Application id. Also passed as build argument for `NEXT_PUBLIC_DISCORD_CLIENT_ID`. |
| `DISCORD_CLIENT_SECRET` | OAuth2 secret, server only. |
| `DISCORD_GUILD_ID`, `MEMBER_ROLE_ID` | Guild and role that may save results. |
| `SESSION_SECRET` | At least 32 characters. Signs session tokens. |
| `CONCIERGE_URL`, `INTERNAL_TOKEN` | Internal API that receives results. Empty: results are stored, not sent. |
| `POSTGRES_PASSWORD` | Password of the bundled database (compose builds `DATABASE_URL` from it). |
| `DATABASE_URL` | Only for running outside compose. |
| `NEXT_PUBLIC_GA_ID` | Optional analytics id, build time. Off by default and never loaded in Discord. |

If any of the five Discord values is missing, the Discord features are off and
the game runs as before.

## How it works

- In Discord (URL has `frame_id`) the browser runs `ready()`, `authorize()`,
  posts the code to `POST /api/discord/token`, and calls `authenticate()` with
  the access token it gets back. Outside Discord nothing of this runs.
- The server exchanges the code, asks `GET /users/@me/guilds/{guild}/member`
  with the player's token, and requires `MEMBER_ROLE_ID` in `roles`. 404 means
  not a member (403). Any other Discord failure is refused (502). Access tokens
  are not stored.
- Session: a signed token (HMAC-SHA256, 8 hours) held in browser memory and sent
  as `Authorization: Bearer`. A cookie would need `SameSite=None; Secure;
  Partitioned`, which iOS and some Android WebViews still drop in iframes. A
  reload re-authorises silently (`prompt: none`).
- In Discord the daily puzzle opens only for a Member whose saved state is
  loaded. Until then the board shows "Connecting to Discord…". If the
  connection fails, the board is locked and offers "Try again", which repeats
  the whole flow. Players without the role see that the puzzle counts for
  members only. Random mode is open in every case.
- A move that cannot be saved locks the board and is retried with backoff
  (2 s up to 30 s). A finished game shows the finish screen after the server
  stored it as finished.
- `POST /api/discord/log` takes `{ stage, message }` without login, cuts each
  field to 200 characters, strips control characters, allows 20 requests per
  minute per IP (429 above that) and answers 204.
- The daily puzzle is chosen by UTC date (`seedrandom("YYYY-MM-DD")`).
  Puzzle number = days since 2024-01-18 (upstream's first migration) + 1.
- Each processed guess is saved (`discord_game`, one row per player and
  puzzle). Reloading resumes; a finished puzzle shows its result and refuses a
  second round. Random mode is never saved or reported.
- When a puzzle ends (solved or 10 tries) the server posts
  `/internal/minecraftle/result` with `X-Internal-Token`. Only the request that
  ends the game sends it. Network errors, 429 and 5xx are retried 3 times (1 s,
  3 s, 9 s), then logged; the game stays stored with `reported_at` empty.
- The Concierge posts the grid to `#gamle` when it receives the result. The
  activity has no share request; `/internal/minecraftle/share` stays on the
  Concierge for older clients.

Grid values sent to the Concierge, per guess nine fields row by row:

| Slot | Value |
|---|---|
| item, colour 2 (right item, right slot) | `green` |
| item, colour 3 (item needed elsewhere) | `orange` |
| item, any other colour | `gray` |
| no item | `empty` |

Colour 3 is yellow in the default theme and blue in high contrast; the grid
always says `orange`.

The server trusts the colours the browser sends. It does not recompute the
recipe match, so a member who edits requests can fake a result.

## Files added by the fork

`src/discord/*`, `src/pages/api/discord/*`, `src/server/routers/discord.ts`,
`prisma/migrations/20261007120000_discord_game`, `test/*`, `Dockerfile`,
`docker/`, `docker-compose.lfs.yml`, `docs/lfs/`.

## Upstream files changed

`src/context/Global/{index,context}.tsx` (UTC puzzle, restore a saved game),
`src/components/Popup.component.tsx` (finish buttons, UTC date in summary),
`src/pages/_app.tsx` (provider), `src/pages/index.tsx` (daily gate, finish screen after save), `src/pages/_document.tsx` (analytics off by
default), `src/server/trpc.ts`, `src/server/routers/_app.ts`,
`src/pages/api/trpc/[trpc].ts`, `src/utils/trpc.ts` (session context),
`next.config.js` (`frame-ancestors` instead of `X-Frame-Options`),
`prisma/schema.prisma`, `package.json`, `tsconfig.json`, `Makefile`.

## Tests

`pnpm test` runs `node --test` (Node 22 strips TypeScript types, no extra
dependency). `TEST_DATABASE_URL=<migrated disposable database> pnpm test` also
runs the Prisma store test.

## Following upstream

```
git fetch upstream
git merge upstream/master   # on branch lfs
```

Conflicts are most likely in the files listed under "Upstream files changed".
