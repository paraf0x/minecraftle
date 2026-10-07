// Daily puzzle selection, shared by browser and server. One puzzle per UTC day.
import seedrandom from "seedrandom";

// Upstream has no puzzle numbers. Counting starts at upstream's first
// migration date, so 2024-01-18 is #1.
export const PUZZLE_EPOCH_UTC = Date.UTC(2024, 0, 18);
const DAY_MS = 24 * 60 * 60 * 1000;

/** `YYYY-MM-DD` of the UTC day containing `date`. */
export function utcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Midnight UTC of a `YYYY-MM-DD` key. */
export function dateFromKey(key: string): Date {
  return new Date(key + "T00:00:00.000Z");
}

/** Running puzzle number for the UTC day containing `date`. */
export function puzzleNumber(date: Date): number {
  const dayStart = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.round((dayStart - PUZZLE_EPOCH_UTC) / DAY_MS) + 1;
}

/** Recipe key of the daily puzzle. Same date key, same recipe list, same answer. */
export function pickDailySolution(recipeKeys: string[], date: Date): string {
  const random = seedrandom(utcDateKey(date));
  return recipeKeys[Math.floor(random() * recipeKeys.length)];
}
