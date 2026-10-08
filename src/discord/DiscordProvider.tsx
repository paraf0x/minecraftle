// Runs the Discord Embedded App SDK when the page is loaded inside Discord,
// keeps the daily game of a Member in sync with the server, and offers
// "Source". Outside Discord it renders its children only.
import { useGlobal } from "@/context/Global/context";
import { trpc } from "@/utils/trpc";
import { useRouter } from "next/router";
import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { clientLog } from "./clientLog";
import { setSessionToken } from "./clientSession";
import { dateFromKey, pickDailySolution } from "./daily";
import { dailyGate, describeError, saveBackoffMs } from "./gate";
import type { DailyGate, Mode, Stage } from "./gate";
import type { TodayView } from "./service";

export const SOURCE_URL = "https://github.com/paraf0x/minecraftle";

type DiscordValue = {
  mode: Mode;
  today: TodayView | null;
  openSource: () => void;
  // Gate for the daily puzzle: anything but "open" replaces the board.
  gate: DailyGate;
  failureStage: Stage | null;
  retry: () => void;
  // A move could not be saved yet: the board stays locked until it is.
  saveLocked: boolean;
  // True when the finish screen may show: random mode, outside Discord, or the
  // server holds the game as finished.
  finishConfirmed: boolean;
};

const DiscordContext = createContext<DiscordValue>({
  mode: "off",
  today: null,
  openSource: () => {},
  gate: "open",
  failureStage: null,
  retry: () => {},
  saveLocked: false,
  finishConfirmed: true,
});
export const useDiscord = () => useContext(DiscordContext);

type SdkLike = {
  ready: () => Promise<void>;
  commands: {
    authorize: (args: Record<string, unknown>) => Promise<{ code: string }>;
    authenticate: (args: { access_token: string }) => Promise<unknown>;
    openExternalLink: (args: { url: string }) => Promise<unknown>;
  };
};

const errorCode = (err: unknown): string | undefined => (err as { data?: { code?: string } })?.data?.code;

export function DiscordProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { recipes, solution, craftingTables, colorTables, restoreGame, dailyRestorerRef } = useGlobal();
  const [mode, setMode] = useState<Mode>("off");
  const [notice, setNotice] = useState<string | null>(null);
  const [today, setToday] = useState<TodayView | null>(null);
  const [failureStage, setFailureStage] = useState<Stage | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [saveFailures, setSaveFailures] = useState(0);
  const [retryTick, setRetryTick] = useState(0);
  const utils = trpc.useUtils();
  const sdkRef = useRef<SdkLike | null>(null);
  const saving = useRef(false);
  const restorePending = useRef(false);
  const [restoreTick, setRestoreTick] = useState(0);

  const recipesReady = Object.keys(recipes).length > 0;
  const isRandom = !!router.query.random;

  // 1. Connect: ready, authorize, token exchange, authenticate. Any failure
  // reports its stage to the server log and locks the daily puzzle.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("frame_id")) return;
    let cancelled = false;
    (async () => {
      let stage: Stage = "config";
      setMode("connecting");
      try {
        let clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID || null;
        if (!clientId) {
          const res = await fetch("/api/discord/config");
          if (!res.ok) throw new Error(`config request status ${res.status}`);
          clientId = ((await res.json()) as { clientId: string | null }).clientId;
        }
        if (!clientId) throw new Error("server has no Discord client id");

        stage = "ready";
        const { DiscordSDK } = await import("@discord/embedded-app-sdk");
        const sdk = new DiscordSDK(clientId) as unknown as SdkLike;
        sdkRef.current = sdk;
        await sdk.ready();

        stage = "authorize";
        const { code } = await sdk.commands.authorize({
          client_id: clientId,
          response_type: "code",
          state: "",
          prompt: "none",
          scope: ["identify", "guilds.members.read"],
        });

        stage = "token";
        const res = await fetch("/api/discord/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        if (res.status === 403) {
          if (!cancelled) setMode("guest");
          return;
        }
        if (!res.ok) {
          const key = ((await res.json().catch(() => ({}))) as { error?: unknown }).error;
          throw new Error(`token request status ${res.status}${typeof key === "string" ? ` ${key}` : ""}`);
        }
        const { access_token, session } = (await res.json()) as { access_token: string; session: string };

        stage = "authenticate";
        await sdk.commands.authenticate({ access_token });
        if (cancelled) return;
        setSessionToken(session);
        setMode("member");
      } catch (err) {
        console.error("discord connect failed", stage, err);
        clientLog(stage, describeError(err));
        if (cancelled) return;
        setFailureStage(stage);
        setMode("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // Runs the whole connection flow again.
  const retry = useCallback(() => {
    setSessionToken(null);
    setFailureStage(null);
    setNotice(null);
    setToday(null);
    setSaveFailures(0);
    saving.current = false;
    utils.discord.today.reset();
    setAttempt((n) => n + 1);
  }, [utils]);

  // 2. External links go through Discord, which blocks plain navigation.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || !sdkRef.current || !/^https?:/.test(a.href) || a.origin === window.location.origin) return;
      e.preventDefault();
      sdkRef.current.commands.openExternalLink({ url: a.href }).catch(() => {});
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // 3. Load today's saved game.
  const todayQuery = trpc.discord.today.useQuery(undefined, {
    enabled: mode === "member",
    refetchOnWindowFocus: false,
    staleTime: Infinity,
    retry: false,
  });
  useEffect(() => {
    if (!todayQuery.data) return;
    setToday(todayQuery.data);
    restorePending.current = true;
    setRestoreTick((n) => n + 1);
  }, [todayQuery.data]);
  useEffect(() => {
    if (todayQuery.error) {
      clientLog("today", describeError(todayQuery.error));
      setFailureStage("today");
      setMode("error");
    }
  }, [todayQuery.error]);

  // 4. Put the saved game on the board. In random mode this waits for "Daily".
  const applyRestore = useCallback(() => {
    if (!today || !recipesReady) return false;
    restorePending.current = false;
    restoreGame(dateFromKey(today.date), {
      status: today.game?.status ?? "inprogress",
      guesses: today.game?.guesses ?? [],
    });
    return true;
  }, [today, recipesReady, restoreGame]);

  useEffect(() => {
    if (restorePending.current && router.isReady && !isRandom) applyRestore();
  }, [restoreTick, recipesReady, router.isReady, isRandom, applyRestore]);

  useEffect(() => {
    if (mode !== "member") return;
    dailyRestorerRef.current = applyRestore;
    return () => {
      dailyRestorerRef.current = null;
    };
  }, [mode, applyRestore, dailyRestorerRef]);

  // 5. Save each new guess. Always sends the full list; the server accepts
  // a list that continues what it holds.
  // A failed save locks the board and retries with backoff until it works.
  const saveGuesses = trpc.discord.saveGuesses.useMutation();
  useEffect(() => {
    if (saveFailures === 0) return;
    const t = setTimeout(() => setRetryTick((n) => n + 1), saveBackoffMs(saveFailures));
    return () => clearTimeout(t);
  }, [saveFailures]);
  useEffect(() => {
    if (mode !== "member" || !today || !recipesReady || !router.isReady || isRandom || saving.current) return;
    if (today.game && today.game.status !== "inprogress") return;
    if (solution !== pickDailySolution(Object.keys(recipes), dateFromKey(today.date))) return;

    const guesses: { table: unknown; colors: unknown }[] = [];
    craftingTables.forEach((table, i) => {
      const colors = colorTables[i];
      if (colors && colors[0][0] !== undefined) guesses.push({ table, colors });
    });
    const stored = today.game?.guesses ?? [];
    if (guesses.length <= stored.length) return;
    if (JSON.stringify(guesses.slice(0, stored.length)) !== JSON.stringify(stored)) return;

    saving.current = true;
    saveGuesses
      .mutateAsync({ puzzleNumber: today.puzzleNumber, guesses })
      .then((game) => {
        setSaveFailures(0);
        setToday((t) => (t ? { ...t, game } : t));
      })
      .catch((err) => {
        const code = errorCode(err);
        clientLog("save", describeError(err));
        if (code === "PRECONDITION_FAILED") {
          setNotice("A new daily puzzle is out. Reload the activity.");
        } else if (code === "CONFLICT") {
          setNotice("Today's puzzle was already played. Showing the saved game.");
          todayQuery.refetch();
        } else if (code === "UNAUTHORIZED") {
          setFailureStage("save");
          setMode("error");
        } else {
          setSaveFailures((n) => n + 1);
        }
      })
      .finally(() => {
        saving.current = false;
      });
  }, [mode, today, recipesReady, router.isReady, isRandom, solution, craftingTables, colorTables, retryTick]);

  // 6. Finish screen actions.
  const openSource = useCallback(() => {
    if (sdkRef.current) sdkRef.current.commands.openExternalLink({ url: SOURCE_URL }).catch(() => {});
    else window.open(SOURCE_URL, "_blank", "noopener");
  }, []);

  const gate = dailyGate(mode, today !== null, isRandom);
  const saveLocked = saveFailures > 0 && mode === "member";
  const finishConfirmed = isRandom || mode === "off" || (!!today?.game && today.game.status !== "inprogress");

  const value = useMemo(
    () => ({ mode, today, openSource, gate, failureStage, retry, saveLocked, finishConfirmed }),
    [mode, today, openSource, gate, failureStage, retry, saveLocked, finishConfirmed],
  );

  return (
    <DiscordContext.Provider value={value}>
      {notice && <p className="m-auto max-w-xl p-2 text-center text-white">{notice}</p>}
      {children}
      <footer className="p-2 text-center text-white">
        <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer" className="underline">
          Source (AGPL-3.0)
        </a>
      </footer>
    </DiscordContext.Provider>
  );
}
