import { DEFAULT_OPTIONS } from "@/constants";
import { ColorTable, GameState, ItemMap, MatchMap, Options, RecipeMap, Table, TableItem } from "@/types";
import type { GameStatus, Guess } from "@/discord/grid";
import { Dispatch, MutableRefObject, SetStateAction, createContext, useContext } from "react";

export type SavedGame = { status: GameStatus; guesses: Guess[] };

export type GlobalContextProps = {
  userId: string;
  setUserId: Dispatch<SetStateAction<string>>;
  solution: string;
  items: ItemMap;
  cursorItem: TableItem;
  setCursorItem: Dispatch<SetStateAction<TableItem>>;
  craftingTables: Table[];
  setCraftingTables: Dispatch<SetStateAction<Table[]>>;
  colorTables: ColorTable[];
  setColorTables: Dispatch<SetStateAction<ColorTable[]>>;
  recipes: RecipeMap;
  trimVariants: (guess: Table) => MatchMap;
  checkAllVariants: (guess: Table) => string | undefined;
  gameState: GameState;
  setGameState: Dispatch<SetStateAction<GameState>>;
  options: Options;
  setOptions: Dispatch<SetStateAction<Options>>;
  resetGame: (isRandom: boolean) => void;
  gameDate: Date;
  remainingSolutionVariants: Table[];
  // LFS: restore a stored daily game, and a slot where src/discord registers
  // a function that resetGame(false) calls instead of starting an empty game.
  restoreGame: (date: Date, saved: SavedGame) => void;
  dailyRestorerRef: MutableRefObject<(() => boolean) | null>;
};

const GlobalContext = createContext<GlobalContextProps>({
  userId: "",
  setUserId: () => {},
  solution: "stick",
  items: {},
  cursorItem: undefined,
  setCursorItem: () => {},
  craftingTables: [],
  setCraftingTables: () => {},
  colorTables: [],
  setColorTables: () => {},
  recipes: {},
  trimVariants: () => [
    [-1, -1, -1],
    [-1, -1, -1],
    [-1, -1, -1],
  ],
  checkAllVariants: () => undefined,
  gameState: "inprogress",
  setGameState: () => {},
  options: DEFAULT_OPTIONS,
  setOptions: () => {},
  resetGame: () => {},
  gameDate: new Date(),
  remainingSolutionVariants: [],
  restoreGame: () => {},
  dailyRestorerRef: { current: null },
});

export const GlobalContextProvider = GlobalContext.Provider;

export const useGlobal = () => useContext(GlobalContext);
