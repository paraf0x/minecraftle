import assert from "node:assert/strict";
import { test } from "node:test";
import { canPlayDaily, dailyGate, describeError, saveBackoffMs } from "../src/discord/gate.ts";

test("daily puzzle opens only for a Member with loaded state", () => {
  assert.equal(canPlayDaily("member", true, false), true);
  assert.equal(canPlayDaily("member", false, false), false);
  assert.equal(canPlayDaily("connecting", false, false), false);
  assert.equal(canPlayDaily("connecting", true, false), false);
  assert.equal(canPlayDaily("error", false, false), false);
  assert.equal(canPlayDaily("error", true, false), false);
  assert.equal(canPlayDaily("guest", false, false), false);
  assert.equal(canPlayDaily("guest", true, false), false);
});

test("outside Discord the daily puzzle is always open", () => {
  assert.equal(canPlayDaily("off", false, false), true);
  assert.equal(canPlayDaily("off", true, false), true);
});

test("random mode is open in every mode", () => {
  for (const mode of ["off", "connecting", "member", "guest", "error"] as const) {
    assert.equal(canPlayDaily(mode, false, true), true, mode);
  }
});

test("gate names the reason for a closed board", () => {
  assert.equal(dailyGate("connecting", false, false), "loading");
  assert.equal(dailyGate("member", false, false), "loading");
  assert.equal(dailyGate("guest", false, false), "guest");
  assert.equal(dailyGate("error", false, false), "error");
});

test("describeError keeps code and text only", () => {
  assert.equal(describeError({ code: 5000, message: "Invalid redirect" }), "code 5000: Invalid redirect");
  assert.equal(describeError({ data: { code: "UNAUTHORIZED" }, message: "nope" }), "code UNAUTHORIZED: nope");
  assert.equal(describeError(null), "unknown error");
});

test("save retry backs off and caps at 30 s", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 9].map(saveBackoffMs), [2000, 4000, 8000, 16000, 30000, 30000]);
});
