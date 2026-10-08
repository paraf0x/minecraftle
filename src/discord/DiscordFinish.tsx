// Extra buttons for the finish popup when the game runs inside Discord.
import MCButton from "@/components/MCButton.component";
import { useDiscord } from "./DiscordProvider";

export default function DiscordFinishActions() {
  const { mode, today, shareState, share, openSource } = useDiscord();
  if (mode === "off" || mode === "connecting") return null;

  const finished = !!today?.game && today.game.status !== "inprogress";
  const canShare = mode === "member" && finished;
  const shareLabel = shareState === "sending" ? "Sharing..." : shareState === "sent" ? "Shared" : "Share my grid";

  return (
    <div className="flex flex-col items-center gap-2">
      {mode === "member" && (
        <p className="text-center text-sm">
          {finished
            ? `Puzzle #${today!.puzzleNumber} is saved. The next one starts at 00:00 UTC.`
            : "Saving your result..."}
        </p>
      )}
      <div className="flex gap-2">
        {canShare && <MCButton onClick={share}>{shareLabel}</MCButton>}
        <MCButton onClick={openSource}>Source</MCButton>
      </div>
      {shareState === "sent" && <p className="text-sm">Your grid was sent to the channel.</p>}
      {shareState === "error" && <p className="text-sm">Could not share the grid. Try again.</p>}
    </div>
  );
}
