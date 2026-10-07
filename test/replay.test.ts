import assert from "node:assert/strict";
import { test } from "node:test";
import { replayRemainingVariants } from "../src/discord/replay.ts";
import { winningGuess } from "./helpers.ts";

const variant = (a: string | null, b: string | null, c: string | null) => [
  [a, b, null],
  [c, null, null],
  [null, null, null],
];

test("variants that disagree with the stored green slots are dropped", () => {
  const variants = [variant("x", "y", "z"), variant("x", "q", "z"), variant("w", "y", "z")];
  const guess = {
    table: [
      ["x", "y", null],
      [null, null, null],
      [null, null, null],
    ],
    colors: [
      [2, 2, 0],
      [0, 0, 0],
      [0, 0, 0],
    ],
  } as never;
  const left = replayRemainingVariants(variants, [guess]);
  assert.deepEqual(left, [variants[0]]);
});

test("a guess without green keeps only variants that match none of its items", () => {
  const variants = [variant("x", "y", "z"), variant("w", "q", "z")];
  const guess = {
    table: [
      ["x", null, null],
      [null, null, null],
      [null, null, null],
    ],
    colors: [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ],
  } as never;
  assert.deepEqual(replayRemainingVariants(variants, [guess]), [variants[1]]);
});

test("the winning guess does not trim", () => {
  const variants = [variant("x", "y", "z")];
  assert.deepEqual(replayRemainingVariants(variants, [winningGuess()]), variants);
});
