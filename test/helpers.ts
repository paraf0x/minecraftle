import type { Guess } from "../src/discord/grid.ts";
import type { GameRecord, GameStore } from "../src/discord/store.ts";

export class MemoryStore implements GameStore {
  rows = new Map<string, GameRecord>();
  private key = (id: string, n: number) => `${id}:${n}`;

  async find(id: string, n: number) {
    const r = this.rows.get(this.key(id, n));
    return r ? structuredClone(r) : null;
  }
  async insert(record: GameRecord) {
    const k = this.key(record.discordId, record.puzzleNumber);
    if (this.rows.has(k)) return false;
    this.rows.set(k, structuredClone(record));
    return true;
  }
  async advance(id: string, n: number, expectedTries: number, next: { guesses: Guess[]; status: GameRecord["status"] }) {
    const r = this.rows.get(this.key(id, n));
    if (!r || r.status !== "inprogress" || r.guesses.length !== expectedTries) return false;
    r.guesses = structuredClone(next.guesses);
    r.status = next.status;
    return true;
  }
  async markReported(id: string, n: number) {
    const r = this.rows.get(this.key(id, n));
    if (r) r.reported = true;
  }
}

const ITEMS = ["minecraft:stick", "minecraft:planks", "minecraft:cobblestone"];

/** A wrong guess: one item in slot (0, i % 3), gray. */
export function wrongGuess(i: number): Guess {
  const table: Guess["table"] = [
    [null, null, null],
    [null, null, null],
    [null, null, null],
  ];
  table[0][i % 3] = ITEMS[i % 3];
  table[1][(i + 1) % 3] = ITEMS[(i + 1) % 3];
  const colors: Guess["colors"] = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  colors[0][i % 3] = i % 2 ? 3 : 2;
  return { table, colors };
}

/** The winning guess as the game stores it: colour 2 in all nine slots. */
export function winningGuess(): Guess {
  return {
    table: [
      ["minecraft:planks", null, null],
      ["minecraft:planks", null, null],
      [null, null, null],
    ],
    colors: [
      [2, 2, 2],
      [2, 2, 2],
      [2, 2, 2],
    ],
  };
}
