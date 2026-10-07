import assert from "node:assert/strict";
import { test } from "node:test";
import { clean, createLimiter, handleLogRequest } from "../src/discord/logRoute.ts";

test("log route writes one line and answers 204", () => {
  const lines: string[] = [];
  const s = handleLogRequest({ stage: "authorize", message: "code 5000: bad" }, "1.1.1.1", createLimiter(), (l) => lines.push(l));
  assert.equal(s, 204);
  assert.deepEqual(lines, ["[discord-client] authorize: code 5000: bad"]);
});

test("fields are cut to 200 characters and lose control characters", () => {
  const lines: string[] = [];
  handleLogRequest({ stage: "x".repeat(500), message: "a\nb\r[discord-client] fake\u0000\u001b" + "y".repeat(500) }, "ip", createLimiter(), (l) => lines.push(l));
  assert.equal(lines.length, 1);
  assert.ok(!/[\n\r\u0000\u001b]/.test(lines[0]));
  assert.equal(lines[0].length, "[discord-client] ".length + 200 + 2 + 200);
  assert.equal(clean("a\tb"), "a b");
});

test("malformed bodies are rejected and not logged", () => {
  const lines: string[] = [];
  for (const body of [null, undefined, "x", {}, { stage: 1, message: "m" }, { stage: "s" }]) {
    assert.equal(handleLogRequest(body, "ip", createLimiter(), (l) => lines.push(l)), 400);
  }
  assert.deepEqual(lines, []);
});

test("rate limit is 20 per minute per IP and resets after the window", () => {
  const limiter = createLimiter();
  const lines: string[] = [];
  const send = (ip: string, t: number) => handleLogRequest({ stage: "s", message: "m" }, ip, limiter, (l) => lines.push(l), t);
  for (let i = 0; i < 20; i++) assert.equal(send("a", 1000 + i), 204);
  assert.equal(send("a", 2000), 429);
  assert.equal(send("b", 2000), 204);
  assert.equal(send("a", 1000 + 60_000), 204);
  assert.equal(lines.length, 22);
});
