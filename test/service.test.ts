import assert from "node:assert/strict";
import { test } from "node:test";
import { reportResult } from "../src/discord/concierge.ts";
import { puzzleNumber } from "../src/discord/daily.ts";
import { ServiceError, getToday, saveGuesses, shareGrid } from "../src/discord/service.ts";
import type { ServiceDeps } from "../src/discord/service.ts";
import { MemoryStore, winningGuess, wrongGuess } from "./helpers.ts";

const NOW = new Date("2026-10-07T12:00:00Z");
const N = puzzleNumber(NOW);
const cfg = { url: "http://concierge:3000", internalToken: "tok" };

type Call = { url: string; token: string | null; body: any };

function setup(opts: { fail?: number[]; now?: Date } = {}) {
  const calls: Call[] = [];
  let n = 0;
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(url),
      token: (init?.headers as Record<string, string>)["X-Internal-Token"] ?? null,
      body: JSON.parse(String(init?.body)),
    });
    const status = opts.fail?.[n++] ?? 200;
    return new Response("{}", { status });
  }) as typeof fetch;
  const store = new MemoryStore();
  const logs: string[] = [];
  const deps: ServiceDeps = {
    store,
    concierge: cfg,
    conciergeDeps: { fetch: fetchFn, sleep: async () => {}, log: (m) => logs.push(m) },
    now: () => opts.now ?? NOW,
  };
  return { deps, store, calls, logs, fetchFn };
}

const wrong = (n: number) => Array.from({ length: n }, (_, i) => wrongGuess(i));
const rejects = (p: Promise<unknown>, code: string) =>
  assert.rejects(p, (e: unknown) => e instanceof ServiceError && e.code === code);

test("a won game is reported exactly once with the documented payload", async () => {
  const { deps, calls } = setup();
  const guesses = [...wrong(3), winningGuess()];
  const { game, report } = await saveGuesses(deps, "42", N, guesses);
  await report;
  assert.equal(game.status, "won");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://concierge:3000/internal/minecraftle/result");
  assert.equal(calls[0].token, "tok");
  assert.deepEqual(Object.keys(calls[0].body).sort(), ["date", "discordId", "grid", "maxTries", "puzzleNumber", "solved", "tries"]);
  assert.equal(calls[0].body.discordId, "42");
  assert.equal(calls[0].body.puzzleNumber, N);
  assert.equal(calls[0].body.date, "2026-10-07");
  assert.equal(calls[0].body.tries, 4);
  assert.equal(calls[0].body.solved, true);
  assert.equal(calls[0].body.maxTries, 10);
  assert.equal(calls[0].body.grid.length, 4);
  assert.ok(calls[0].body.grid.every((row: string[]) => row.length === 9));
  assert.ok((await deps.store.find("42", N))?.reported);
});

test("repeating the final save does not report again", async () => {
  const { deps, calls } = setup();
  const guesses = [...wrong(2), winningGuess()];
  const first = await saveGuesses(deps, "42", N, guesses);
  await first.report;
  await rejects(saveGuesses(deps, "42", N, guesses), "ALREADY_FINISHED");
  assert.equal(calls.length, 1);
});

test("two concurrent finishing saves report once", async () => {
  const { deps, calls } = setup();
  await saveGuesses(deps, "42", N, wrong(2));
  const guesses = [...wrong(2), winningGuess()];
  const results = await Promise.allSettled([saveGuesses(deps, "42", N, guesses), saveGuesses(deps, "42", N, guesses)]);
  await Promise.all(results.map((r) => (r.status === "fulfilled" ? r.value.report : undefined)));
  assert.equal(calls.length, 1);
});

test("a lost game after 10 tries is reported as not solved", async () => {
  const { deps, calls } = setup();
  const { game, report } = await saveGuesses(deps, "42", N, wrong(10));
  await report;
  assert.equal(game.status, "lost");
  assert.equal(calls[0].body.solved, false);
  assert.equal(calls[0].body.tries, 10);
});

test("a running game is stored and not reported", async () => {
  const { deps, calls } = setup();
  const a = await saveGuesses(deps, "42", N, wrong(1));
  assert.equal(a.report, undefined);
  const b = await saveGuesses(deps, "42", N, wrong(3));
  assert.equal(b.game.status, "inprogress");
  assert.equal(calls.length, 0);
});

test("resuming returns the stored guesses and accepts the next ones", async () => {
  const { deps } = setup();
  await saveGuesses(deps, "42", N, wrong(2));
  const today = await getToday(deps, "42");
  assert.equal(today.puzzleNumber, N);
  assert.equal(today.date, "2026-10-07");
  assert.equal(today.game?.status, "inprogress");
  assert.deepEqual(today.game?.guesses, wrong(2));
  const next = await saveGuesses(deps, "42", N, wrong(3));
  assert.equal(next.game.guesses.length, 3);
  // resending the stored list changes nothing
  const again = await saveGuesses(deps, "42", N, wrong(3));
  assert.equal(again.game.guesses.length, 3);
});

test("other players start fresh", async () => {
  const { deps } = setup();
  await saveGuesses(deps, "42", N, wrong(2));
  assert.equal((await getToday(deps, "43")).game, null);
});

test("a second round on a finished puzzle is refused", async () => {
  const { deps, store } = setup();
  const { report } = await saveGuesses(deps, "42", N, [wrongGuess(0), winningGuess()]);
  await report;
  await rejects(saveGuesses(deps, "42", N, [wrongGuess(1)]), "ALREADY_FINISHED");
  await rejects(saveGuesses(deps, "42", N, [wrongGuess(0), wrongGuess(1), winningGuess()]), "ALREADY_FINISHED");
  const stored = await store.find("42", N);
  assert.equal(stored?.guesses.length, 2);
  assert.equal((await getToday(deps, "42")).game?.status, "won");
});

test("guesses that rewrite history, shrink, or follow a win are refused", async () => {
  const { deps } = setup();
  await saveGuesses(deps, "42", N, wrong(3));
  await rejects(saveGuesses(deps, "42", N, wrong(2)), "CONFLICT");
  await rejects(saveGuesses(deps, "42", N, [wrongGuess(5), ...wrong(3)]), "CONFLICT");
  await rejects(saveGuesses(deps, "43", N, [winningGuess(), wrongGuess(0)]), "BAD_GUESSES");
  await rejects(saveGuesses(deps, "43", N, "nope"), "BAD_GUESSES");
  await rejects(saveGuesses(deps, "43", N, []), "BAD_GUESSES");
});

test("saving for a puzzle that is not today's is refused", async () => {
  const { deps } = setup();
  await rejects(saveGuesses(deps, "42", N - 1, wrong(1)), "STALE_PUZZLE");
  await rejects(saveGuesses(deps, "42", N + 1, wrong(1)), "STALE_PUZZLE");
});

test("the day rolls over at UTC midnight", async () => {
  const late = setup({ now: new Date("2026-10-07T23:59:59Z") });
  const early = setup({ now: new Date("2026-10-08T00:00:01Z") });
  assert.equal((await getToday(late.deps, "42")).puzzleNumber, N);
  assert.equal((await getToday(early.deps, "42")).puzzleNumber, N + 1);
  assert.equal((await getToday(early.deps, "42")).date, "2026-10-08");
});

test("a failing Concierge is retried at most 3 times, then logged; the game stays", async () => {
  const { deps, calls, logs } = setup({ fail: [500, 503, 500, 500, 500] });
  const { game, report } = await saveGuesses(deps, "42", N, [wrongGuess(0), winningGuess()]);
  await report;
  assert.equal(game.status, "won");
  assert.equal(calls.length, 4);
  assert.equal(logs.length, 1);
  assert.ok(!logs[0].includes("tok"));
  const stored = await deps.store.find("42", N);
  assert.equal(stored?.status, "won");
  assert.equal(stored?.reported, false);
});

test("a retry that succeeds marks the game reported", async () => {
  const { deps, calls } = setup({ fail: [500, 200] });
  const { report } = await saveGuesses(deps, "42", N, [winningGuess()]);
  await report;
  assert.equal(calls.length, 2);
  assert.equal((await deps.store.find("42", N))?.reported, true);
});

test("a 4xx answer is not retried", async () => {
  const { deps, calls, logs } = setup({ fail: [400] });
  const { report } = await saveGuesses(deps, "42", N, [winningGuess()]);
  await report;
  assert.equal(calls.length, 1);
  assert.equal(logs.length, 1);
});

test("report backs off between attempts", async () => {
  const waits: number[] = [];
  const f = (async () => new Response("{}", { status: 502 })) as typeof fetch;
  const ok = await reportResult(
    cfg,
    { discordId: "1", puzzleNumber: 1, date: "2026-10-07", tries: 1, solved: true, maxTries: 10, grid: [] },
    { fetch: f, sleep: async (ms) => void waits.push(ms), log: () => {}, backoffMs: [10, 20, 40] },
  );
  assert.equal(ok, false);
  assert.deepEqual(waits, [10, 20, 40]);
});

test("without Concierge settings a finished game is stored and nothing is sent", async () => {
  const { deps, calls } = setup();
  const { game, report } = await saveGuesses({ ...deps, concierge: null }, "42", N, [winningGuess()]);
  await report;
  assert.equal(game.status, "won");
  assert.equal(calls.length, 0);
});

test("share needs a finished game and posts discordId and puzzleNumber", async () => {
  const { deps, calls, fetchFn } = setup();
  await saveGuesses(deps, "42", N, wrong(1));
  await rejects(shareGrid(deps, "42", N, fetchFn), "NOT_FINISHED");
  await rejects(shareGrid(deps, "99", N, fetchFn), "NOT_FINISHED");
  const { report } = await saveGuesses(deps, "42", N, [...wrong(1), winningGuess()]);
  await report;
  calls.length = 0;
  await shareGrid(deps, "42", N, fetchFn);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://concierge:3000/internal/minecraftle/share");
  assert.equal(calls[0].token, "tok");
  assert.deepEqual(calls[0].body, { discordId: "42", puzzleNumber: N });
  await rejects(shareGrid(deps, "42", N, fetchFn), "COOLDOWN");
});

test("share failure surfaces as UNAVAILABLE and can be retried", async () => {
  const { deps, fetchFn } = setup();
  const { report } = await saveGuesses(deps, "7", N, [winningGuess()]);
  await report;
  const failing = (async () => new Response("{}", { status: 500 })) as typeof fetch;
  await rejects(shareGrid(deps, "7", N, failing), "UNAVAILABLE");
  await shareGrid(deps, "7", N, fetchFn);
});
