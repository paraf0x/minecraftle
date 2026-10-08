# Minecraftle as a Discord activity for Low FPS Society

Date: 2026-10-07. Status: draft, waiting for review.

## Goal

Minecraftle, the daily crafting-recipe guessing game, playable inside Discord
the way Wordle is: started from the app launcher or a button, played in an
embedded window, and every finished game shows up in `#gamle` so the group
sees each other's results.

## Decisions already made

- Base: a fork of `zachpmanson/minecraftle` (AGPL-3.0, Next.js, Prisma,
  PostgreSQL), changed as little as possible.
- Results are shown in `#gamle`, Wordle style.
- Channel `#wordle` is renamed to `#gamle` (done 2026-10-07).
- No new bot. The activity belongs to the existing application LFS Concierge
  (`1557006049884639322`), and the Concierge process posts results and
  answers the command.

## What players see

1. `/lfs minecraftle` in any channel, or the activity entry in Discord's app launcher,
   opens the game in an embedded window. In `#gamle` a message carries a
   "Play" button that does the same; Maksym pins it by hand.
2. The game is today's daily puzzle. Random mode stays available for practice;
   random games are not posted.
3. On finishing the daily puzzle the bot updates one message per day in
   `#gamle`:

   ```
   Minecraftle #412 · 7 October

   Maksym     4/10  🟩🟧⬜ …
   Bobby      7/10
   Saskia     X/10
   ```

   One line per player in order of finishing, tries and a compact colour row
   of the last guess. A player's own full grid of guesses is shown to them in
   the activity and can be posted on request with a "Share my grid" button.
   Below the list, the current streaks of everyone with a streak of 3 or more.
4. Each player can play the daily puzzle once. Reloading the activity resumes
   the game in progress.

## Daily puzzle

One puzzle per UTC day for everyone, so the group compares the same recipe.
For Sydney that means the new puzzle arrives at 10:00 or 11:00 local time;
for Chicago at 19:00 or 18:00 the evening before.

## Access

- Discord embeds the activity through its own proxy
  (`<application id>.discordsays.com`), which forwards to the public origin
  `minecraftle.paraf0x.win`. That host cannot sit behind Cloudflare Access, because
  Discord's proxy cannot log in.
- The game itself is public there, like the original site. Everything that
  writes or reads player data needs a Discord access token obtained through
  the Embedded App SDK's authorise flow; the server checks that the player
  holds the Member role in Low FPS Society and refuses everyone else.
- Results are stored only for Low FPS Society members: Discord id, puzzle
  number, tries, solved, finished at. No message content, no other data.

## Licence duty

AGPL-3.0 section 13: the modified source is published as a public fork on
GitHub under the same licence, and the activity shows a "Source" link. The
item textures are Mojang's, as in the original.

## Building blocks

- Fork changes, kept in few files so upstream updates merge cleanly:
  - Discord Embedded App SDK on load; authorise and token exchange through a
    new route `/api/discord/token`.
  - A new tRPC route that records a finished daily game for the signed-in
    player and returns the day's results.
  - Daily puzzle seeded by UTC date.
  - "Share my grid" and "Source" in the finish screen.
- In `~/lfs-concierge`: `/lfs minecraftle` answered with a launch-activity response,
  the "Play" message in `#gamle`, and the day's results message. The game
  server tells the Concierge about a finished game over a local HTTP call
  inside the Docker network; the Concierge owns everything posted to Discord.
- Containers in `~/lfs-minecraftle`: the Next.js app and PostgreSQL. Data in `./data`. Public
  host `minecraftle.paraf0x.win` through the existing Cloudflare Tunnel.

## Discord setup

- On the existing application LFS Concierge: Activities enabled, URL mapping
  `/` to `minecraftle.paraf0x.win`, OAuth2 redirect `https://127.0.0.1` (required by
  the SDK, not used). Players authorise with `identify` and
  `guilds.members.read`.
- No new bot permissions: the Concierge already has View Channels, Send
  Messages, Embed Links and Read Message History. `#gamle` gets an overwrite
  for the Concierge role.
- The game server needs the application's client secret for the token
  exchange, in `~/lfs-minecraftle/.env`.

## Out of scope

- Schmeckles for solved puzzles (possible later through The Bookie).
- Other games.
- Changing the puzzle set or the rules.

## Open points

- Whether the public fork lives under `paraf0x` on GitHub.
