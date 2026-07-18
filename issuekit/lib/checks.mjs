// Enforcement rules, one function per rule. Each returns { ok, message }; the CLI
// maps that to exit codes. With fix=false a rule only detects (for local debugging);
// with fix=true it applies the remedy and reports ok. Pure decision helpers are
// exported separately so they can be unit-tested without GitHub.
import { loadRules } from "./rules.mjs";
import { gh, graphql, nodeId, issueJson, repoOwner } from "./gh.mjs";

const pass = (message) => ({ ok: true, message });
const fail = (message) => ({ ok: false, message });

// --- parent-close: an issue with open sub-issues must stay open ---------------

function openSubIssues(issueNumber) {
  const data = graphql(
    `query($id:ID!){ node(id:$id){ ... on Issue {
       subIssues(first:100){ nodes { number state } } } } }`,
    { id: nodeId(issueNumber) });
  return (data.data.node?.subIssues?.nodes ?? [])
    .filter((s) => s.state === "OPEN").map((s) => s.number);
}

export function checkParentClose(issueNumber, { fix = false } = {}) {
  const { state } = issueJson(issueNumber, "state");
  if (state === "OPEN") return pass(`#${issueNumber} is open — nothing to enforce.`);

  const open = openSubIssues(issueNumber);
  if (open.length === 0) return pass(`#${issueNumber} closed with no open sub-issues — OK.`);

  const list = open.map((x) => `#${x}`).join(", ");
  if (!fix) return fail(`#${issueNumber} is closed but has ${open.length} open sub-issue(s): ${list}`);

  gh(["issue", "reopen", String(issueNumber)]);
  gh(["issue", "comment", String(issueNumber), "--body",
    `♻️ Reopened automatically — this is a parent with **${open.length} open sub-issue(s)** (${list}). ` +
    `A parent stays open until all of its sub-issues are closed. Close the children first, then this can close.`]);
  return pass(`Reopened #${issueNumber} (${open.length} open sub-issues: ${list}).`);
}

// --- board-sync: project board Status must be at least what the labels say ----

// Most-advanced flow label present wins. Returns a Status name or null.
export function boardTarget(labelNames, rules = loadRules()) {
  let target = null;
  for (const label of rules.flow.order) {
    if (labelNames.includes(label)) target = rules.board.labelToStatus[label];
  }
  return target;
}

export function statusRank(status, rules = loadRules()) {
  return rules.board.statusOrder.indexOf(status) + 1; // 0 = unknown/absent
}

// Forward-only: never move a card backward, never off the terminal status.
export function shouldAdvance(current, target, rules = loadRules()) {
  if (!target) return false;
  if (current === rules.board.terminalStatus) return false;
  if (!current) return true;
  return statusRank(current, rules) < statusRank(target, rules);
}

function boardIds(rules) {
  const ownerField = rules.board.ownerType === "org" ? "organization" : "user";
  const data = graphql(
    `query($login:String!, $number:Int!, $field:String!){
       ${ownerField}(login:$login){ projectV2(number:$number){
         id
         field(name:$field){ ... on ProjectV2SingleSelectField { id options { id name } } }
       } } }`,
    { login: repoOwner(), number: rules.board.projectNumber, field: rules.board.statusField });
  return data.data[ownerField].projectV2;
}

// The issue's item on this board (if any) and its current Status, read-only.
function boardItem(issueNumber, rules) {
  const data = graphql(
    `query($id:ID!, $field:String!){ node(id:$id){ ... on Issue {
       projectItems(first:20){ nodes {
         id
         project { number }
         fieldValueByName(name:$field){ ... on ProjectV2ItemFieldSingleSelectValue { name } }
       } } } } }`,
    { id: nodeId(issueNumber), field: rules.board.statusField });
  return (data.data.node?.projectItems?.nodes ?? [])
    .find((i) => i.project?.number === rules.board.projectNumber) ?? null;
}

export function checkBoardSync(issueNumber, { fix = false } = {}) {
  // In CI the board write needs PROJECT_PAT; without it this is a deliberate no-op.
  if (process.env.GITHUB_ACTIONS && !process.env.GH_TOKEN) {
    return pass("PROJECT_PAT secret not set — skipping (no-op).");
  }

  const rules = loadRules();
  const labels = issueJson(issueNumber, "labels").labels.map((l) => l.name);
  const target = boardTarget(labels, rules);
  if (!target) return pass(`#${issueNumber} has no flow label — nothing to sync.`);

  const item = boardItem(issueNumber, rules);
  const current = item?.fieldValueByName?.name ?? null;
  if (!shouldAdvance(current, target, rules)) {
    return pass(`#${issueNumber} already at '${current ?? "—"}' (>= '${target}') — leaving as-is.`);
  }
  if (!fix) return fail(`#${issueNumber} board Status is '${current ?? "absent"}', behind target '${target}'.`);

  const project = boardIds(rules);
  const option = project.field.options.find((o) => o.name === target);
  if (!option) return fail(`No '${target}' option on the board's ${rules.board.statusField} field.`);

  // Idempotent: returns the existing item if the issue is already on the board.
  const itemId = graphql(
    `mutation($projectId:ID!, $contentId:ID!){
       addProjectV2ItemById(input:{projectId:$projectId, contentId:$contentId}){ item { id } } }`,
    { projectId: project.id, contentId: nodeId(issueNumber) })
    .data.addProjectV2ItemById.item.id;

  graphql(
    `mutation($projectId:ID!, $itemId:ID!, $fieldId:ID!, $optId:String!){
       updateProjectV2ItemFieldValue(input:{
         projectId:$projectId, itemId:$itemId, fieldId:$fieldId,
         value:{ singleSelectOptionId:$optId } }){ projectV2Item { id } } }`,
    { projectId: project.id, itemId, fieldId: project.field.id, optId: option.id });
  return pass(`#${issueNumber} → Status '${target}'.`);
}

export const CHECKS = { "parent-close": checkParentClose, "board-sync": checkBoardSync };
