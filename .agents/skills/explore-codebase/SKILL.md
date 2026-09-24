---
name: explore-codebase
description: Find your way around this repo through its code-review-graph index — locate a symbol, trace callers and callees, size the impact of a change, find the tests for it — before reading source. Use when asked where something is defined, what calls it, what a change affects, or to orient in an unfamiliar area.
---

## Explore codebase

The repo serves six code-review-graph MCP tools (`.mcp.json`). Use them to
narrow scope, then read the source.

### Steps

1. `get_minimal_context_tool(task="<your task>")` first: ~100 tokens of
   orientation and a `next_tool_suggestions` field. `status: not_ready` means
   the index is still building; grep meanwhile.
2. `semantic_search_nodes_tool(query, limit=5, detail_level="minimal")` to
   find a function, class or file by name, path or signature. Identifier-like
   queries only; it never searches source text.
3. `query_graph_tool(pattern, target)` with `callers_of`, `callees_of`,
   `imports_of`, `tests_for` or `children_of` to trace relationships.
   `target` is the `qualified_name` a search returned.
4. `get_impact_radius_tool(changed_files, max_depth=1)` for the blast radius
   of a change; `detect_changes_tool` and `get_review_context_tool` to review
   a diff without reading whole files.

### Rules

- Budget: about five graph calls and 800 tokens of graph output per task.
- Grep is fine for a single lookup ("where is X defined"); the graph earns
  its cost on callers, impact and tests.
- When the graph and the source disagree, the source wins. An empty result
  means "not indexed" or "not statically visible", not "does not exist".
- Read the implementation and its tests before changing code. The graph
  narrows scope; it does not replace the source.
