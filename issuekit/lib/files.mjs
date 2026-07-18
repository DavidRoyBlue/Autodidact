// Pure plan/spec-file logic: which files are mirrored to issues, and what
// title/body/label/parent an issue gets. Paths and mappings come from rules.json.
import { loadRules } from "./rules.mjs";

export function isSuperpowersFile(filePath, rules = loadRules()) {
  if (!filePath.endsWith(".md")) return false;
  if (!filePath.includes(`${rules.plans.root}/`)) return false;
  if (filePath.endsWith("/README.md")) return false;
  return rules.plans.statusFolders.some((f) => filePath.includes(`/${f}/`));
}

export function labelForPath(filePath, rules = loadRules()) {
  for (const [folder, label] of Object.entries(rules.plans.folderLabels)) {
    if (filePath.includes(`/${folder}/`)) return label;
  }
  return rules.plans.defaultLabel;
}

export function isDonePath(filePath, rules = loadRules()) {
  return filePath.includes(`/${rules.plans.doneFolder}/`);
}

export function titleFromContent(content, fallbackBasename) {
  const m = content.match(/^#\s+(.+?)\s*$/m);
  return m ? m[1].trim() : fallbackBasename.replace(/\.md$/, "");
}

export function bodyFromContent(content, title) {
  const paras = [];
  let cur = [];
  for (const line of content.split("\n")) {
    if (line.trim() === "") {
      if (cur.length) { paras.push(cur.join(" ").trim()); cur = []; }
      continue;
    }
    cur.push(line);
  }
  if (cur.length) paras.push(cur.join(" ").trim());
  const skip = (p) => p.startsWith("#") || (p.startsWith("**") && p.includes(":**")) || p.startsWith(">") || p.startsWith("---");
  for (const p of paras) {
    if (!skip(p)) return p.slice(0, 500);
  }
  return title;
}

export function parentFromContent(content) {
  const m = content.match(/^\*\*Parent:\*\*\s*(\S+)/m);
  return m ? m[1].trim() : null;
}
