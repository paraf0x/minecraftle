// Extra buttons for the finish popup when the game runs inside Discord.
import MCButton from "@/components/MCButton.component";
import { useDiscord } from "./DiscordProvider";

export default function DiscordFinishActions() {
  const { mode, today, openSource } = useDiscord();
  if (mode === "off" || mode === "connecting") return null;

  const finished = !!today?.game && today.game.status !== "inprogress";

  return (
    <div className="flex flex-col items-center gap-2">
      {mode === "member" && (
        <p className="text-center text-sm">
          {finished
            ? `Puzzle #${today!.puzzleNumber} is saved. The next one starts at 00:00 UTC.`
            : "Saving your result..."}
        </p>
      )}
      {mode === "member" && finished && <p className="text-center text-sm">Your result is posted in #gamle.</p>}
      <div className="flex gap-2">
        <MCButton onClick={openSource}>Source</MCButton>
      </div>
    </div>
  );
}
