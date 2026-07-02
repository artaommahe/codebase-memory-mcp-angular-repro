# Reproduction: Angular component sibling files merged into one `File` node

**Affects:** codebase-memory-mcp 0.8.1 (standard variant, macOS arm64), `index_repository` mode `full` (also reproduces in `fast`/`moderate`).

## Summary

When indexing an Angular project, the indexer creates **one `File` node per component** and folds the component's sibling files (`foo.component.ts` / `.html` / `.scss`) into it. Only **one** sibling's path survives as `file_path`, and which one wins is inconsistent. The other siblings disappear from the file inventory entirely.

Consequences:

1. **`search_code` silently returns incomplete results** — it only greps files that have their own `File` node, so text matches inside merged-away templates/styles are never found. No truncation warning is emitted; the response looks complete.
2. **Wrong-facet paths in results** — a component may be represented by its `.scss` path, so callers/results can point at a stylesheet.
3. **`extension` / `file_path` mismatch** — in larger projects, nodes appear with `extension: '.html'` but a `file_path` ending in `.ts` or `.scss` (observed on a ~10k-file repo; in this minimal repro the extension always matches the surviving path, but the sibling loss reproduces deterministically).

On a real ~10k-file Angular monorepo this dropped ~630 of 1,041 `.html` templates from the index, and a `search_code` sweep for a CSS class found 95 of 137 matches (~70%).

## Layout (13 source files)

| Case | Files on disk | Purpose |
|---|---|---|
| ts-wins | `src/app/add-absence/` — `.component.ts` + `.component.html` | template merged away |
| html-wins | `src/app/checkbox/` — `.component.ts` + `.component.html` + `.spec.ts` + `.stories.ts` | component `.ts` merged away |
| scss-wins | `src/app/badge/` — `.component.ts` + `.component.html` + `.component.scss` | **both** `.ts` and `.html` merged away |
| control | `src/standalone/help.html` (no component sibling) | indexed correctly |
| call graph | `src/app/feature.service.ts` — `isEnabled()` called from two components | shows CALLS extraction is fine; only file modeling is wrong |

All four `.html` files plus `help.html` contain the literal marker class `repro-marker`.

## Steps to reproduce

1. `index_repository(repo_path=<this repo>, mode='full')`
2. `query_graph(query="MATCH (f:File) RETURN f.file_path, f.extension ORDER BY f.file_path")`
3. `search_code(pattern='repro-marker', mode='files')`
4. `grep -rl repro-marker src/` for comparison

## Expected

- 13 `File` nodes (or at least one per source file), including all 4 `.html` files.
- `search_code('repro-marker')` returns 4 files, matching grep.

## Actual (observed output, v0.8.1)

`query_graph` — **7** `File` nodes:

```
src/app/add-absence/add-absence.component.ts   .ts     <- add-absence.component.html GONE
src/app/badge/badge.component.scss             .scss   <- badge .ts AND .html GONE
src/app/checkbox/checkbox.component.html       .html   <- checkbox.component.ts GONE
src/app/checkbox/checkbox.component.spec.ts    .ts
src/app/checkbox/checkbox.component.stories.ts .ts
src/app/feature.service.ts                     .ts
src/standalone/help.html                       .html
```

`search_code('repro-marker')` — **2 of 4** files, silently:

```
src/app/checkbox/checkbox.component.html
src/standalone/help.html
```

(missing: `add-absence.component.html`, `badge.component.html` — both match with plain grep)

`trace_path(function_name='isEnabled', direction='inbound')` — correct, both callers found (`AddAbsenceComponent.save`, `BadgeComponent.isHighlighted`), so call extraction itself handles the merge fine; the problem is only the file inventory.

## Notes

- Which sibling wins looks related to what else references the file set (checkbox, whose `.html` won, is the only component with `.spec.ts`/`.stories.ts` siblings; badge, with a `styleUrls` entry, ended up represented by its `.scss`), but from the outside it is effectively arbitrary.
- Treating component + template as one unit for **call-graph** purposes is reasonable (template event bindings usefully show up as callers). The bug is that the merged siblings also vanish from the **file** inventory that `search_code` and file-level queries operate on.

The TypeScript files intentionally don't compile (no `node_modules`) — the indexer's tree-sitter parsing doesn't need them to.

## Follow-up: `extension` corruption on merged nodes (requires git history)

The `extension`/`file_path` mismatch from the summary (point 3) also reproduces here, but **only once the repo has git history**:

1. Index the repo at the initial commit (`bbc0779`) → extensions are consistent with the surviving path (`add-absence.component.ts` → `.ts`, `badge.component.scss` → `.scss`).
2. Add commits that touch the merged siblings separately (see history: one commit edits `add-absence.component.html`, one edits `badge.component.scss`, one edits `add-absence.component.ts`).
3. Re-run `index_repository` (mode `full`) and query again:

```
src/app/add-absence/add-absence.component.ts   ""      <- was ".ts" before the history existed
src/app/badge/badge.component.scss             ""      <- was ".scss"
src/app/checkbox/checkbox.component.html       .html   <- unaffected (template path won the merge)
src/app/checkbox/checkbox.component.spec.ts    .ts
src/app/checkbox/checkbox.component.stories.ts .ts
```

Stable across repeated re-indexes. Only merged component nodes where a **non-template** sibling won are affected. On the large real-world repo the same class of nodes shows `extension: '.html'` with a `.ts`/`.scss` `file_path` instead of an empty string — i.e. the value is environment/order-dependent, three different outcomes for the same logical situation.
