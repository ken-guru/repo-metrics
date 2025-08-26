# repo-metrics

Small CLI that scans a Git repository and produces two outputs:

- `metrics.csv` — per-commit metrics (non-test LOC, markdown LOC, test cases, commit message lengths)
- `metrics.html` — interactive Plotly visualization

Usage

Install dependencies and build (local):

```bash
npm install
npm run build
```

CI-friendly install (recommended in CI):

```bash
# use the lockfile for deterministic installs
npm ci
npm test
npm run build
```

Run directly against a local repo:

```bash
node dist/repo-metrics.js /path/to/repo --output-prefix my-metrics
```

Or run with `ts-node` (development):

```bash
npm run scan -- /path/to/repo --output-prefix my-metrics
```

CLI options (not exhaustive)

- `--branch <ref>` — specify ref to analyze (defaults to `HEAD`)
- `--first-parent` — follow only first-parent history
- `--include-merges` — include merge commits in analysis
- `--sample-every N` — sample every Nth commit (default 1)
- `--max-commits N` — limit number of commits to analyze
- `--max-file-bytes BYTES` — skip blobs larger than this
- `--msg-avg-window N` — commit message rolling average window
- `--output-prefix NAME` — prefix for `NAME.csv` and `NAME.html` (sanitized)
- `--csv-decimals N` — decimals for averages in CSV (default 2)
- `--dry-run` — show what would be done, but don't clone or write files
- `--keep-temp` — keep temporary clone for debugging (default: removed)
- `--verbose` — enable extra logging and stack traces

Security & privacy notes

- The tool may clone repositories and read blob contents; do not run on untrusted repositories or URLs containing embedded credentials.
- The script sanitizes display of repository URLs (masks credentials) and sanitizes output filenames to avoid path traversal.
- Temporary clones are created with `0700` permissions and removed by default; pass `--keep-temp` to retain them for debugging.
- Child processes spawned to read blobs receive a minimized environment to avoid leaking env vars.

Testing

Unit and integration tests are provided using `vitest`.

```bash
npm install
npm test
```

The integration test creates a small temporary git repository to validate metrics computation. Tests run non-interactively.

Notes & suggestions

- This tool is heuristic-based and attempts to estimate test cases and LOC by file extension and simple regexes. It will not be perfect, especially for languages with unconventional test/matching patterns.
- For offline HTML output, install `plotly.js-dist-min` locally or let the generated HTML use the CDN; the script prefers a local `node_modules/plotly.js-dist-min/plotly.min.js` path if present.
- Consider running this tool in an isolated environment (container or VM) when scanning many or untrusted repositories.

Dist / compiled artifacts

- This repository previously committed `dist/` files. For a single source-of-truth and cleaner diffs we recommend not committing compiled artifacts; instead build in CI and publish artifacts from the CI run. If you prefer to keep `dist/` in git, you may ignore this guidance.

Module layout

- `src/cli.ts` - CLI parsing and small helpers used by the tool
- `src/git.ts` - Git plumbing (cloning, listing commits, reading blobs)
- `src/metrics.ts` - Counting heuristics and `computeMetricsForCommit`
- `src/output.ts` - CSV and HTML writers, Plotly asset helpers
- `src/repo-metrics.ts` - top-level orchestrator/entrypoint; re-exports helpers used in tests

Running module-level tests

The repository includes module-level unit tests under `test/` which exercise the `cli`, `metrics`, and `output` modules directly.

Run the test suite with:

```bash
npm test
```

If you add new modules, add tests under `test/` and name them `*.unit.test.ts` for clarity.
