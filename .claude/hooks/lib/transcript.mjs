import { isSuperpowersFile } from "./issues.mjs";

export function parseTranscript(jsonlText) {
  const out = [];
  for (const raw of jsonlText.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    try { out.push(JSON.parse(line)); } catch { /* skip malformed */ }
  }
  return out;
}

function contentItems(entry) {
  const c = entry?.message?.content;
  if (Array.isArray(c)) return c;
  if (typeof c === "string") return [{ type: "text", text: c }];
  return [];
}

export function hasSuperpowersWrite(entries) {
  for (const e of entries) {
    for (const item of contentItems(e)) {
      if (item.type === "tool_use" && item.name === "Write" &&
          typeof item.input?.file_path === "string" &&
          isSuperpowersFile(item.input.file_path)) {
        return true;
      }
    }
  }
  return false;
}

export function extractSummary(entries, maxMessages = 4) {
  const texts = [];
  for (const e of entries) {
    if (e?.message?.role !== "assistant") continue;
    const t = contentItems(e).filter((i) => i.type === "text").map((i) => i.text).join(" ").trim();
    if (t) texts.push(t);
  }
  return texts.slice(-maxMessages).join("\n\n").slice(0, 2000);
}
