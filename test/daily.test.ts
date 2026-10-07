import assert from "node:assert/strict";
import { test } from "node:test";
import { PUZZLE_EPOCH_UTC, dateFromKey, pickDailySolution, puzzleNumber, utcDateKey } from "../src/discord/daily.ts";

const keys = Array.from({ length: 200 }, (_, i) => `recipe_${i}`);

test("utcDateKey uses the UTC day, not the local day", () => {
  assert.equal(utcDateKey(new Date("2026-10-07T23:59:59.999Z")), "2026-10-07");
  assert.equal(utcDateKey(new Date("2026-10-08T00:00:00.000Z")), "2026-10-08");
  // 23:30 in UTC-5 is 04:30 UTC the next day
  assert.equal(utcDateKey(new Date("2026-10-07T23:30:00-05:00")), "2026-10-08");
  // 01:00 in UTC+11 is 14:00 UTC the previous day
  assert.equal(utcDateKey(new Date("2026-10-08T01:00:00+11:00")), "2026-10-07");
});

test("puzzle changes exactly at UTC midnight", () => {
  const before = new Date("2026-10-07T23:59:59.999Z");
  const after = new Date("2026-10-08T00:00:00.000Z");
  assert.equal(puzzleNumber(after), puzzleNumber(before) + 1);
  assert.notEqual(pickDailySolution(keys, before), pickDailySolution(keys, after));
  assert.equal(pickDailySolution(keys, new Date("2026-10-08T00:00:00Z")), pickDailySolution(keys, new Date("2026-10-08T23:59:59Z")));
});

test("players in different time zones get the same puzzle", () => {
  const sydney = new Date("2026-10-08T09:00:00+11:00"); // 22:00 UTC on the 7th
  const chicago = new Date("2026-10-07T17:00:00-05:00"); // 22:00 UTC on the 7th
  assert.equal(pickDailySolution(keys, sydney), pickDailySolution(keys, chicago));
  assert.equal(puzzleNumber(sydney), puzzleNumber(chicago));
});

test("puzzle numbers count days from the epoch, starting at 1", () => {
  assert.equal(puzzleNumber(new Date(PUZZLE_EPOCH_UTC)), 1);
  assert.equal(puzzleNumber(new Date(PUZZLE_EPOCH_UTC + 86_400_000 * 10 + 5000)), 11);
  assert.equal(puzzleNumber(dateFromKey("2026-10-07")), 994);
});

test("selection is stable for a date and depends on the date key", () => {
  const d = dateFromKey("2026-10-07");
  assert.equal(pickDailySolution(keys, d), pickDailySolution(keys, new Date(d)));
  const picks = new Set(Array.from({ length: 30 }, (_, i) => pickDailySolution(keys, new Date(d.getTime() + i * 86_400_000))));
  assert.ok(picks.size > 15);
});
