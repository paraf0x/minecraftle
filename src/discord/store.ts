// Storage for daily games of Discord players.
import type { GameStatus, Guess } from "./grid.ts";

export type GameRecord = {
  discordId: string;
  puzzleNumber: number;
  puzzleDate: string; // YYYY-MM-DD
  guesses: Guess[];
  status: GameStatus;
  reported: boolean;
};

export interface GameStore {
  find(discordId: string, puzzleNumber: number): Promise<GameRecord | null>;
  /** Inserts a new game. False if one exists for this player and puzzle. */
  insert(record: GameRecord): Promise<boolean>;
  /**
   * Replaces guesses and status while the stored game is still in progress
   * with exactly `expectedTries` guesses. False if that no longer holds, so
   * of two concurrent writers only one wins.
   */
  advance(
    discordId: string,
    puzzleNumber: number,
    expectedTries: number,
    next: { guesses: Guess[]; status: GameStatus },
  ): Promise<boolean>;
  markReported(discordId: string, puzzleNumber: number): Promise<void>;
}
