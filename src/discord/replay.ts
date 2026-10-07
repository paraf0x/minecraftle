// Rebuilds the set of solution variants that are still possible after the
// stored guesses, so a resumed game gives the same hints as the original run.
import type { Guess } from "./grid.ts";
import { isWinningGuess } from "./grid.ts";

type Variant = (string | null | undefined | number)[][];

// Mirrors upstream's trimVariants: a variant stays when its set of exactly
// matching item slots equals the green slots stored for the guess. The
// winning guess does not trim anything in the game, so it is skipped.
export function replayRemainingVariants<V extends Variant>(variants: V[], guesses: Guess[]): V[] {
  let remaining = variants;
  for (const guess of guesses) {
    if (isWinningGuess(guess)) continue;
    remaining = remaining.filter((variant) => {
      for (let r = 0; r < 3; r++) {
        for (let c = 0; c < 3; c++) {
          const item = guess.table[r][c];
          const exact = item !== null && (variant[r][c] ?? null) === item;
          if (exact !== (guess.colors[r][c] === 2)) return false;
        }
      }
      return true;
    });
  }
  return remaining;
}
