// Runs only with TEST_DATABASE_URL pointing at a migrated, disposable database.
import assert from "node:assert/strict";
import { test } from "node:test";
import { puzzleNumber } from "../src/discord/daily.ts";
import { saveGuesses } from "../src/discord/service.ts";
import { winningGuess, wrongGuess } from "./helpers.ts";

const url = process.env.TEST_DATABASE_URL;

test("prisma store: insert, resume, finish once, refuse a second round", { skip: !url }, async () => {
  process.env.DATABASE_URL = url;
  const { prismaStore } = await import("../src/discord/prismaStore.ts");
  const now = new Date("2026-10-07T12:00:00Z");
  const n = puzzleNumber(now);
  const id = `it-${Date.now()}`;
  const calls: string[] = [];
  const fetchFn = (async (u: string) => (calls.push(u), new Response("{}"))) as unknown as typeof fetch;
  const deps = {
    store: prismaStore,
    concierge: { url: "http://c", internalToken: "t" },
    conciergeDeps: { fetch: fetchFn, sleep: async () => {}, log: () => {} },
    now: () => now,
  };
  await saveGuesses(deps, id, n, [wrongGuess(0)]);
  assert.equal((await prismaStore.find(id, n))?.guesses.length, 1);
  const final = [wrongGuess(0), winningGuess()];
  const results = await Promise.allSettled([saveGuesses(deps, id, n, final), saveGuesses(deps, id, n, final)]);
  await Promise.all(results.map((r) => (r.status === "fulfilled" ? r.value.report : undefined)));
  assert.equal(calls.length, 1);
  const row = await prismaStore.find(id, n);
  assert.equal(row?.status, "won");
  assert.equal(row?.reported, true);
  await assert.rejects(saveGuesses(deps, id, n, [wrongGuess(1)]));
});
