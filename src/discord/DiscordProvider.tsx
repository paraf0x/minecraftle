// Runs the Discord Embedded App SDK when the page is loaded inside Discord,
// keeps the daily game of a Member in sync with the server, and offers
// "Share my grid" and "Source". Outside Discord it renders its children only.
import { useGlobal } from "@/context/Global/context";
import { trpc } from "@/utils/trpc";
import { useRouter } from "next/router";
import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { setSessionToken } from "./clientSession";
import { dateFromKey, pickDailySolution } from "./daily";
import type { TodayView } from "./service";

export const SOURCE_URL = "https://github.com/paraf0x/minecraftle";

type Mode = "off" | "connecting" | "member" | "guest" | "error";
type ShareState = "idle" | "sending" | "sent" | "error";

type DiscordValue = {
  mode: Mode;
  today: TodayView | null;
  shareState: ShareState;
  share: () => void;
  openSource: () => void;
};

const DiscordContext = createContext<DiscordValue>({
  mode: "off",
  today: null,
  shareState: "idle",
  share: () => {},
  openSource: () => {},
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
  const [shareState, setShareState] = useState<ShareState>("idle");
  const sdkRef = useRef<SdkLike | null>(null);
  const saving = useRef(false);
  const restorePending = useRef(false);
  const [restoreTick, setRestoreTick] = useState(0);

  const recipesReady = Object.keys(recipes).length > 0;
  const isRandom = !!router.query.random;

  // 1. Connect: ready, authorize, token exchange, authenticate.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("frame_id")) return;
    (async () => {
      setMode("connecting");
      try {
        let clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID || null;
        if (!clientId) {
          clientId = ((await (await fetch("/api/discord/config")).json()) as { clientId: string | null }).clientId;
        }
        if (!clientId) return setMode("off");

        const { DiscordSDK } = await import("@discord/embedded-app-sdk");
        const sdk = new DiscordSDK(clientId) as unknown as SdkLike;
        sdkRef.current = sdk;
        await sdk.ready();
        const { code } = await sdk.commands.authorize({
          client_id: clientId,
          response_type: "code",
          state: "",
          prompt: "none",
          scope: ["identify", "guilds.members.read"],
        });
        const res = await fetch("/api/discord/token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
        });
        if (res.status === 403) {
          setNotice("Results are saved for members with the Member role only. You can still play.");
          return setMode("guest");
        }
        if (!res.ok) throw new Error(`token ${res.status}`);
        const { access_token, session } = (await res.json()) as { access_token: string; session: string };
        await sdk.commands.authenticate({ access_token });
        setSessionToken(session);
        setMode("member");
      } catch (err) {
        console.error("discord connect failed", err);
        setNotice("Could not connect to Discord. Playing without saving.");
        setMode("error");
      }
    })();
  }, []);

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
      setNotice("Could not load your saved game. Playing without saving.");
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
  const saveGuesses = trpc.discord.saveGuesses.useMutation();
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
      .then((game) => setToday((t) => (t ? { ...t, game } : t)))
      .catch((err) => {
        const code = errorCode(err);
        if (code === "PRECONDITION_FAILED") {
          setNotice("A new daily puzzle is out. Reload the activity.");
        } else if (code === "CONFLICT") {
          setNotice("Today's puzzle was already played. Showing the saved game.");
          todayQuery.refetch();
        } else if (code === "UNAUTHORIZED") {
          setNotice("Session expired. Reload the activity.");
          setMode("error");
        } else {
          setNotice("Could not save your last guess. It is saved with the next one.");
        }
      })
      .finally(() => {
        saving.current = false;
      });
  }, [mode, today, recipesReady, router.isReady, isRandom, solution, craftingTables, colorTables]);

  // 6. Finish screen actions.
  const shareMutation = trpc.discord.share.useMutation();
  const share = useCallback(() => {
    if (!today || shareState === "sending") return;
    setShareState("sending");
    shareMutation
      .mutateAsync({ puzzleNumber: today.puzzleNumber })
      .then(() => setShareState("sent"))
      .catch((err) => setShareState(errorCode(err) === "TOO_MANY_REQUESTS" ? "sent" : "error"));
  }, [today, shareState]);

  const openSource = useCallback(() => {
    if (sdkRef.current) sdkRef.current.commands.openExternalLink({ url: SOURCE_URL }).catch(() => {});
    else window.open(SOURCE_URL, "_blank", "noopener");
  }, []);

  const value = useMemo(
    () => ({ mode, today, shareState, share, openSource }),
    [mode, today, shareState, share, openSource],
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
