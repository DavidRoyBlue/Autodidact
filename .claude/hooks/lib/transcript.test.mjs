import { test } from "node:test";
import assert from "node:assert/strict";
import * as T from "./transcript.mjs";

const line = (obj) => JSON.stringify(obj);

const WRITE_SP = line({
  type: "assistant",
  message: { role: "assistant", content: [
    { type: "tool_use", name: "Write", input: { file_path: "/r/docs/superpowers/plans/to-be-reviewed/x.md", content: "# X" } },
  ] },
});
const WRITE_OTHER = line({
  type: "assistant",
  message: { role: "assistant", content: [
    { type: "tool_use", name: "Write", input: { file_path: "/r/src/index.ts", content: "x" } },
  ] },
});
const TEXT = (t) => line({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: t }] } });

test("parseTranscript skips blank and malformed lines", () => {
  const txt = [WRITE_OTHER, "", "not json", TEXT("hello")].join("\n");
  assert.equal(T.parseTranscript(txt).length, 2);
});

test("hasSuperpowersWrite: true only when a superpowers Write exists", () => {
  assert.equal(T.hasSuperpowersWrite(T.parseTranscript(WRITE_SP)), true);
  assert.equal(T.hasSuperpowersWrite(T.parseTranscript(WRITE_OTHER)), false);
  assert.equal(T.hasSuperpowersWrite(T.parseTranscript(TEXT("hi"))), false);
});

test("extractSummary: last N assistant text messages, newest-last, joined", () => {
  const txt = [TEXT("first"), TEXT("second"), TEXT("third")].join("\n");
  const s = T.extractSummary(T.parseTranscript(txt), 2);
  assert.ok(s.includes("second") && s.includes("third"));
  assert.ok(!s.includes("first"));
});
