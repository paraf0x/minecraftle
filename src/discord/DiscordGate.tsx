// Replaces the daily board while the activity is not ready to save results.
import LoadingSpinner from "@/components/LoadingSpinner.component";
import MCButton from "@/components/MCButton.component";
import Link from "next/link";
import { useDiscord } from "./DiscordProvider";
import { causeText } from "./gate";

export default function DiscordGate() {
  const { gate, failureStage, retry } = useDiscord();
  if (gate === "open") return null;

  return (
    <div className="box inv-background flex flex-col items-center gap-3 p-4 text-center text-gray-900">
      {gate === "loading" && (
        <>
          <LoadingSpinner />
          <p>Connecting to Discord…</p>
        </>
      )}
      {gate === "error" && (
        <>
          <p>Today&apos;s puzzle is locked because the connection to Discord failed, so your result could not be saved.</p>
          {failureStage && <p>{causeText(failureStage)}</p>}
          <MCButton onClick={retry}>Try again</MCButton>
          <p>Random mode still works.</p>
        </>
      )}
      {gate === "guest" && (
        <>
          <p>Today&apos;s puzzle counts for members with the Member role only.</p>
          <p>Random mode is open to everyone.</p>
        </>
      )}
      {gate !== "loading" && (
        <Link href="/?random=true">
          <MCButton>Play random</MCButton>
        </Link>
      )}
    </div>
  );
}
