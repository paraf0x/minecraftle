// Reports a connection error to the server log. Never throws, never waits.
// Callers pass an error code and text only, no tokens, codes or ids.
import type { Stage } from "./gate";

export function clientLog(stage: Stage, message: string): void {
  try {
    void fetch("/api/discord/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage, message }),
      keepalive: true,
    }).catch(() => {});
  } catch {
    // logging must not break the game
  }
}
