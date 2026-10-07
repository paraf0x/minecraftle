import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveStatus, guessesSchema, hasGuessAfterWin, toGridValue, toReportGrid } from "../src/discord/grid.ts";
import { winningGuess, wrongGuess } from "./helpers.ts";

test("game colours map to grid values", () => {
  assert.equal(toGridValue("minecraft:stick", 2), "green");
  assert.equal(toGridValue("minecraft:stick", 3), "orange");
  assert.equal(toGridValue("minecraft:stick", 0), "gray");
  assert.equal(toGridValue("minecraft:stick", undefined), "gray");
  assert.equal(toGridValue(null, 0), "empty");
  assert.equal(toGridValue(undefined, undefined), "empty");
  // the winning guess stores colour 2 for empty slots too
  assert.equal(toGridValue(null, 2), "empty");
});

test("report grid has nine values per guess, row by row", () => {
  const grid = toReportGrid([
    {
      table: [
        ["a", "b", null],
        [null, "c", "d"],
        [null, null, "e"],
      ],
      colors: [
        [2, 3, 0],
        [0, 0, 2],
        [0, 0, 3],
      ],
    },
  ]);
  assert.deepEqual(grid, [["green", "orange", "empty", "empty", "gray", "green", "empty", "empty", "orange"]]);
});

test("winning guess becomes green only where an item sits", () => {
  assert.deepEqual(toReportGrid([winningGuess()])[0], [
    "green", "empty", "empty",
    "green", "empty", "empty",
    "empty", "empty", "empty",
  ]);
});

test("status: won on all-green last guess, lost at 10, else in progress", () => {
  const wrong = (n: number) => Array.from({ length: n }, (_, i) => wrongGuess(i));
  assert.equal(deriveStatus(wrong(3)), "inprogress");
  assert.equal(deriveStatus([...wrong(3), winningGuess()]), "won");
  assert.equal(deriveStatus(wrong(10)), "lost");
  assert.equal(deriveStatus([...wrong(9), winningGuess()]), "won");
  assert.equal(hasGuessAfterWin([winningGuess(), wrongGuess(0)]), true);
  assert.equal(hasGuessAfterWin([wrongGuess(0), winningGuess()]), false);
});

test("guess validation rejects bad shapes", () => {
  assert.ok(guessesSchema.safeParse([wrongGuess(0)]).success);
  assert.ok(!guessesSchema.safeParse([]).success);
  assert.ok(!guessesSchema.safeParse(Array.from({ length: 11 }, (_, i) => wrongGuess(i))).success);
  assert.ok(!guessesSchema.safeParse([{ table: [[null]], colors: [[0]] }]).success);
  const bad = wrongGuess(0);
  (bad.colors[0] as number[])[0] = 7;
  assert.ok(!guessesSchema.safeParse([bad]).success);
  const empty = wrongGuess(0);
  empty.table = [[null, null, null], [null, null, null], [null, null, null]];
  assert.ok(!guessesSchema.safeParse([empty]).success);
});
