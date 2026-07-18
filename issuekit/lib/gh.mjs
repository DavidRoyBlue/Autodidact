// All GitHub interaction for the issue system goes through this module.
import { execFileSync } from "node:child_process";

export const sh = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { encoding: "utf8", ...opts }).trim();

export const gh = (args, opts) => sh("gh", args, opts);

export function repoRoot() {
  return sh("git", ["rev-parse", "--show-toplevel"]);
}

export function repoOwner() {
  return gh(["repo", "view", "--json", "owner", "-q", ".owner.login"]);
}

export function nodeId(issueNumber) {
  return gh(["issue", "view", String(issueNumber), "--json", "id", "-q", ".id"]);
}

export function issueJson(issueNumber, fields) {
  return JSON.parse(gh(["issue", "view", String(issueNumber), "--json", fields]));
}

export function linkSubIssue(parentNumber, childNumber) {
  gh(["api", "graphql", "-f", `query=
    mutation($parentId: ID!, $childId: ID!) {
      addSubIssue(input: { issueId: $parentId, subIssueId: $childId }) { issue { number } }
    }`,
    "-f", `parentId=${nodeId(parentNumber)}`,
    "-f", `childId=${nodeId(childNumber)}`]);
}

// Exact-title match across all states → idempotent creation (spec D10).
export function adoptByTitle(title) {
  const out = gh(["issue", "list", "--state", "all", "--search", `in:title "${title}"`,
    "--json", "number,title"]);
  const found = JSON.parse(out).find((i) => i.title === title);
  return found ? String(found.number) : null;
}

export function createIssue({ title, body, label }) {
  const url = gh(["issue", "create", "--title", title, "--body", body, "--label", label]);
  return (url.match(/\/issues\/(\d+)/) || [])[1] ?? null;
}

export function closeIssue(issueNumber, comment) {
  gh(["issue", "close", String(issueNumber), "-c", comment]);
}

export function existingLabels() {
  return JSON.parse(gh(["label", "list", "--json", "name", "--limit", "200"])).map((l) => l.name);
}

export function createLabel(name, { color, description }) {
  gh(["label", "create", name, "--color", color, "--description", description]);
}

// vars: numbers are passed as -F (typed Int), everything else as -f (String).
export function graphql(query, vars = {}) {
  const args = ["api", "graphql", "-f", `query=${query}`];
  for (const [k, v] of Object.entries(vars)) {
    args.push(typeof v === "number" ? "-F" : "-f", `${k}=${v}`);
  }
  return JSON.parse(gh(args));
}
