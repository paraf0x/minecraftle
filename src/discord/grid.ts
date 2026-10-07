// Guess storage format, validation, and the mapping from game colours to the
// grid sent to the Concierge.
import { z } from "zod";

export const MAX_TRIES = 10;

// Colour codes the game stores in colorTables: 2 = right item in the right
// slot, 3 = item is needed but in another slot, 0 = not needed.
export const COLOR_GREEN = 2;
export const COLOR_ORANGE = 3;

export type GridValue = "green" | "orange" | "gray" | "empty";

const itemSchema = z.union([z.string().max(100), z.null()]);
const colorSchema = z.union([z.literal(0), z.literal(2), z.literal(3)]);
const row = <T extends z.ZodTypeAny>(s: T) => z.tuple([s, s, s]);
const table = <T extends z.ZodTypeAny>(s: T) => z.tuple([row(s), row(s), row(s)]);

export const guessSchema = z
  .object({ table: table(itemSchema), colors: table(colorSchema) })
  .refine((g) => g.table.some((r) => r.some((i) => i !== null)), "empty guess");
export const guessesSchema = z.array(guessSchema).min(1).max(MAX_TRIES);

export type Guess = z.infer<typeof guessSchema>;
export type GameStatus = "inprogress" | "won" | "lost";

/**
 * Slot with an item: green (2), orange (3), otherwise gray.
 * Slot without an item: empty, whatever colour the game stored for it. The
 * winning guess is stored with colour 2 in all nine slots, including empty ones.
 */
export function toGridValue(item: string | null | undefined, color: number | null | undefined): GridValue {
  if (item === null || item === undefined) return "empty";
  if (color === COLOR_GREEN) return "green";
  if (color === COLOR_ORANGE) return "orange";
  return "gray";
}

/** One list of 9 values per guess, row by row. */
export function toReportGrid(guesses: Guess[]): GridValue[][] {
  return guesses.map((g) => {
    const values: GridValue[] = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) values.push(toGridValue(g.table[r][c], g.colors[r][c]));
    }
    return values;
  });
}

export function isWinningGuess(g: Guess): boolean {
  return g.colors.every((r) => r.every((c) => c === COLOR_GREEN));
}

/** Won when the last guess is all green, lost at MAX_TRIES, else in progress. */
export function deriveStatus(guesses: Guess[]): GameStatus {
  if (guesses.length > 0 && isWinningGuess(guesses[guesses.length - 1])) return "won";
  if (guesses.length >= MAX_TRIES) return "lost";
  return "inprogress";
}

/** A winning guess may only be the last one. */
export function hasGuessAfterWin(guesses: Guess[]): boolean {
  return guesses.slice(0, -1).some(isWinningGuess);
}
