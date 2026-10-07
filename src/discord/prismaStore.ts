import { Prisma } from "@prisma/client";
import prisma from "../utils/prisma.ts";
import type { GameStatus, Guess } from "./grid.ts";
import type { GameRecord, GameStore } from "./store.ts";

type Row = {
  discord_id: string;
  puzzle_number: number;
  puzzle_date: string;
  guesses: Prisma.JsonValue;
  status: string;
  reported_at: Date | null;
};

const toRecord = (row: Row): GameRecord => ({
  discordId: row.discord_id,
  puzzleNumber: row.puzzle_number,
  puzzleDate: row.puzzle_date,
  guesses: row.guesses as unknown as Guess[],
  status: row.status as GameStatus,
  reported: row.reported_at !== null,
});

export const prismaStore: GameStore = {
  async find(discordId, puzzleNumber) {
    const row = await prisma.discord_game.findUnique({
      where: { discord_id_puzzle_number: { discord_id: discordId, puzzle_number: puzzleNumber } },
    });
    return row ? toRecord(row) : null;
  },

  async insert(record) {
    try {
      await prisma.discord_game.create({
        data: {
          discord_id: record.discordId,
          puzzle_number: record.puzzleNumber,
          puzzle_date: record.puzzleDate,
          guesses: record.guesses as unknown as Prisma.InputJsonValue,
          tries: record.guesses.length,
          status: record.status,
          finished_at: record.status === "inprogress" ? null : new Date(),
        },
      });
      return true;
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return false;
      throw err;
    }
  },

  async advance(discordId, puzzleNumber, expectedTries, next) {
    const res = await prisma.discord_game.updateMany({
      where: { discord_id: discordId, puzzle_number: puzzleNumber, status: "inprogress", tries: expectedTries },
      data: {
        guesses: next.guesses as unknown as Prisma.InputJsonValue,
        tries: next.guesses.length,
        status: next.status,
        finished_at: next.status === "inprogress" ? null : new Date(),
      },
    });
    return res.count === 1;
  },

  async markReported(discordId, puzzleNumber) {
    await prisma.discord_game.updateMany({
      where: { discord_id: discordId, puzzle_number: puzzleNumber },
      data: { reported_at: new Date() },
    });
  },
};
