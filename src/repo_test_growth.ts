#!/usr/bin/env node
/**
 * repo_test_growth.ts
 *
 * Analyze a Git repo’s history and plot:
 * - Non-test LOC (code files)
 * - Markdown LOC (docs)
 * - Total test cases (heuristic across major languages)
 * - Rolling average commit message length (characters)
 *
 * Outputs:
 * - <prefix>.csv
 * - <prefix>.html (Plotly, interactive)
 *
 * Industry-standard tools:
 * - simple-git (wrapper over system git)
 * - plotly.js-dist-min (interactive chart)
 * - System git (must be installed)
 */

import fs, { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from 'node:url';
import { SimpleGit, simpleGit } from "simple-git";

export type Regex = RegExp;

export type BlobMetrics = {
  codeLoc: number;   // non-empty, non-comment lines in code files
  testCases: number; // "test cases" found in test files (by regex)
  docLoc: number;    // non-empty lines in Markdown docs
};

export type Row = {
  isoWhen: string;        // commit date in ISO 8601 (UTC)
  nonTestLoc: number;
  totalTests: number;
  docLoc: number;
  shortSha: string;
  commitMsgLen: number;     // raw commit message length (characters)
  commitMsgLenAvg: number;  // rolling mean of commit message length
};

/** ---------- Heuristics & configuration ---------- */

const CODE_EXTS = new Set<string>([
  // Python
  "py",
  // JS/TS
  "js", "jsx", "ts", "tsx", "mjs", "cjs",
  // Java/Kotlin/Scala
  "java", "kt", "kts", "scala",
  // C/C++
  "c", "cc", "cpp", "cxx", "h", "hh", "hpp", "hxx",
  // C#
  "cs",
  // Go, Rust
  "go", "rs",
  // Swift, ObjC
  "swift", "m", "mm",
  // Ruby, PHP
  "rb", "php",
  // Shell
  "sh", "bash", "zsh",
  // SQL
  "sql",
]);

// Documentation restricted to Markdown only, anywhere in the tree.
const DOC_EXTS = new Set<string>([
  "md", "markdown", "mdx"
]);

const SKIP_DIR_FRAGMENTS = new Set<string>([
  ".git", "node_modules", "vendor", "third_party",
  "dist", "build", "out", "target", "bin", "obj",
  ".venv", "venv", "__pycache__", "Pods", ".idea", ".vscode"
]);

const TEST_DIR_HINTS = new Set<string>([
  "test", "tests", "__tests__", "spec", "specs",
  "integration-tests", "e2e", "acceptance"
]);

const TEST_FILE_SUFFIXES = ["_test", ".test", ".spec", "Spec", "Tests"];
const TEST_FILE_PREFIXES = ["test_", "spec_"] as const;

const COMMENT_PREFIXES_BY_EXT: Record<string, string[]> = {
  c: ["//"], cc: ["//"], cpp: ["//"], cxx: ["//"],
  h: ["//"], hh: ["//"], hpp: ["//"], hxx: ["//"],
  java: ["//"], kt: ["//"], kts: ["//"], scala: ["//"],
  js: ["//"], jsx: ["//"], ts: ["//"], tsx: ["//"], mjs: ["//"], cjs: ["//"],
  go: ["//"], rs: ["//"], swift: ["//"], cs: ["//"], php: ["//", "#"],
  py: ["#"], rb: ["#"], sh: ["#"], bash: ["#"], zsh: ["#"],
  sql: ["--"], m: ["//"], mm: ["//"]
};

const TEST_CASE_PATTERNS: Record<string, Regex[]> = {
  // Python
  py: [
    /^\s*def\s+test_[A-Za-z0-9_]+\s*\(/gm,
    /^\s*class\s+Test[A-Za-z0-9_]*\s*[:\(]/gm
  ],
  // JS/TS
  js: [/\b(it|test)\s*\(/gm],
  jsx: [/\b(it|test)\s*\(/gm],
  ts: [/\b(it|test)\s*\(/gm],
  tsx: [/\b(it|test)\s*\(/gm],
  mjs: [/\b(it|test)\s*\(/gm],
  cjs: [/\b(it|test)\s*\(/gm],
  // Java/Kotlin
  java: [/@Test\b/gm, /@ParameterizedTest\b/gm],
  kt: [/@Test\b/gm, /@ParameterizedTest\b/gm],
  kts: [/@Test\b/gm, /@ParameterizedTest\b/gm],
  // Go
  go: [/^\s*func\s+Test[A-Z][A-Za-z0-9_]*\s*\(/gm],
  // Ruby
  rb: [/^\s*def\s+test_[A-Za-z0-9_]+\s*$/gm, /^\s*it\s+['"]/gm],
  // Swift
  swift: [/^\s*func\s+test[A-Z][A-Za-z0-9_]*\s*\(/gm],
  // C#
  cs: [/\[(Fact|Theory|Test|TestCase)\]/gm],
  // Rust
  rs: [/#\[test\]/gm],
  // PHP
  php: [/@test\b/gm, /^\s*public\s+function\s+test[A-Z]/gm],
  // C/C++ GoogleTest
  c: [/\bTEST(_F|_P|_S)?\s*\(/gm],
  cc: [/\bTEST(_F|_P|_S)?\s*\(/gm],
  cpp: [/\bTEST(_F|_P|_S)?\s*\(/gm],
  cxx: [/\bTEST(_F|_P|_S)?\s*\(/gm],
  h: [/\bTEST(_F|_P|_S)?\s*\(/gm],
  hh: [/\bTEST(_F|_P|_S)?\s*\(/gm],
  hpp: [/\bTEST(_F|_P|_S)?\s*\(/gm],
  hxx: [/\bTEST(_F|_P|_S)?\s*\(/gm],
  // ScalaTest
  scala: [/\b(it|test)\s*\(/gm],
  // SQL (rare test harnesses)
  sql: [/\bTEST\b/gi]
};

/** ---------- CLI arg parsing ---------- */

type Args = {
  repo: string;              // URL or local path
  branch?: string | null;    // ref to analyze
  firstParent: boolean;
  includeMerges: boolean;
  sampleEvery: number;
  maxCommits?: number | null;
  maxFileBytes: number;
  outputPrefix: string;
  msgAvgWindow: number;      // rolling mean window for commit message length
  verbose: boolean;
  plotlySrc?: string | null;
  csvDecimals: number;
  dryRun: boolean;
  keepTemp: boolean;
  assetsDir?: string | null;
};

function parseArgs(): Args {
  const a = process.argv.slice(2);
  if (a.length === 0) {
    console.error(`Usage:
  node dist/repo_test_growth.js <repo-url-or-path> [--branch main] [--first-parent] [--include-merges]
                                   [--sample-every N] [--max-commits N] [--max-file-bytes BYTES]
                                   [--msg-avg-window N]
                                   [--output-prefix metrics]`);
    process.exit(2);
  }
  const args: Args = {
    repo: a[0],
    branch: null,
    firstParent: false,
    includeMerges: false,
    sampleEvery: 1,
    maxCommits: null,
    maxFileBytes: 1_000_000,
    outputPrefix: "metrics",
    msgAvgWindow: 50
    ,
    verbose: false,
    plotlySrc: null,
    csvDecimals: 2
    , dryRun: false
    , keepTemp: false
    , assetsDir: undefined
  };
  for (let i = 1; i < a.length; i++) {
    const t = a[i];
    if (t === "--branch") args.branch = a[++i] ?? null;
    else if (t === "--first-parent") args.firstParent = true;
    else if (t === "--include-merges") args.includeMerges = true;
    else if (t === "--sample-every") args.sampleEvery = parseInt(a[++i]!, 10);
    else if (t === "--max-commits") args.maxCommits = parseInt(a[++i]!, 10);
    else if (t === "--max-file-bytes") args.maxFileBytes = parseInt(a[++i]!, 10);
    else if (t === "--msg-avg-window") args.msgAvgWindow = parseInt(a[++i]!, 10);
    else if (t === "--verbose") args.verbose = true;
    else if (t === "--plotly-src") args.plotlySrc = a[++i] ?? null;
  else if (t === "--csv-decimals") args.csvDecimals = parseInt(a[++i]!, 10);
    else if (t === "--dry-run") args.dryRun = true;
    else if (t === "--keep-temp") args.keepTemp = true;
    else if (t === "--assets") {
      // optional directory: if next token looks like an option, treat as flag-only
      const next = a[i+1];
      if (!next || next.startsWith('--')) {
        args.assetsDir = null;
      } else {
        args.assetsDir = a[++i]!;
      }
    }
    else if (t === "--output-prefix") args.outputPrefix = a[++i]!;
    else {
      console.error(`Unknown arg: ${t}`);
      process.exit(2);
    }
  }
  if (!Number.isFinite(args.sampleEvery) || args.sampleEvery < 1) args.sampleEvery = 1;
  if (!Number.isFinite(args.msgAvgWindow) || args.msgAvgWindow < 1) args.msgAvgWindow = 50;
  if (!Number.isFinite(args.csvDecimals) || args.csvDecimals < 0) args.csvDecimals = 2;
  // sanitize output prefix to avoid path traversal or writing outside cwd
  args.outputPrefix = sanitizeOutputPrefix(args.outputPrefix);
  return args;
}

/** ---------- Helpers ---------- */

export function looksLikeUrl(s: string): boolean {
  return /^(https?|git):\/\//.test(s) || s.endsWith(".git");
}

/** Return a sanitized display string for the repo arg (mask credentials, avoid absolute paths). */
export function sanitizeRepoForDisplay(s: string): string {
  if (/^[a-z]+:\/\//i.test(s) || s.endsWith('.git')) {
    try {
      const u = new URL(s);
      if (u.username) u.username = '****';
      if (u.password) u.password = '';
      // Return origin + pathname to avoid embedding userinfo
      return `${u.protocol}//${u.host}${u.pathname}`;
    } catch {
      return s.replace(/\/\/[^@]+@/, '//****@');
    }
  }
  // For local paths, only show basename to avoid leaking filesystem layout
  try { return path.basename(path.resolve(s)); } catch { return s; }
}

export function mkTempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  try { fs.chmodSync(dir, 0o700); } catch (_) {}
  return dir;
}

/** If a local plotly bundle exists under cwd's node_modules, copy it to `assetsDir`.
 * Returns a relative URL (from the HTML path) to the copied asset, or undefined if not copied.
 */
export function copyPlotlyToAssets(assetsDir: string, htmlPath: string, options?: { cwd?: string; verbose?: boolean }): string | undefined {
  const cwd = options?.cwd ?? process.cwd();
  const verbose = !!options?.verbose;
  try {
    const candidate = path.join(cwd, 'node_modules', 'plotly.js-dist-min', 'plotly.min.js');
    if (!fs.existsSync(candidate)) return undefined;
    const destDir = path.resolve(assetsDir);
    fs.mkdirSync(destDir, { recursive: true });
    const destPath = path.join(destDir, 'plotly.min.js');
    fs.copyFileSync(candidate, destPath);
    if (verbose) console.error(`Copied Plotly from ${candidate} to ${destPath}`);
    return path.relative(path.dirname(htmlPath) || '.', destPath).replace(/\\/g, '/');
  } catch (err) {
    if (verbose) console.error('Failed to copy assets:', err);
    return undefined;
  }
}

/** Sanitize an output prefix so it cannot write outside the cwd or contain path traversal. */
export function sanitizeOutputPrefix(p: string): string {
  if (!p || typeof p !== 'string') return 'metrics';
  // only allow a limited character set (alphanum, dot, dash, underscore)
  const base = path.basename(p);
  const clean = base.replace(/[^A-Za-z0-9._-]/g, '_');
  if (!clean || clean.length === 0) return 'metrics';
  // avoid names that look like parent traversal
  if (clean === '.' || clean === '..') return 'metrics';
  return clean;
}

export function pathShouldSkip(p: string): boolean {
  const parts = path.normalize(p).split(path.sep).map(s => s.toLowerCase());
  return parts.some(part => SKIP_DIR_FRAGMENTS.has(part));
}

function isTestPath(p: string): boolean {
  const parts = p.split("/");
  for (let i = 0; i < parts.length - 1; i++) {
    const low = parts[i].toLowerCase();
    if (TEST_DIR_HINTS.has(low) || Array.from(TEST_DIR_HINTS).some(h => low.includes(h))) {
      return true;
    }
  }
  const filename = parts[parts.length - 1] ?? "";
  const dot = filename.lastIndexOf(".");
  const base = dot >= 0 ? filename.slice(0, dot) : filename;
  if (TEST_FILE_PREFIXES.some(pref => base.startsWith(pref))) return true;
  if (TEST_FILE_SUFFIXES.some(sfx => base.endsWith(sfx))) return true;
  return false;
}

export function extOf(p: string): string {
  return path.extname(p).toLowerCase().replace(/^\./, "");
}

export function seemsBinary(buf: Buffer): boolean {
  return buf.includes(0); // NUL byte heuristic
}

export function countCodeLoc(text: string, ext: string): number {
  let count = 0;
  const prefixes = COMMENT_PREFIXES_BY_EXT[ext] ?? [];
  for (const line of text.split(/\r?\n/)) {
    const s = line.trim();
    if (!s) continue;
    if (prefixes.some(pref => s.startsWith(pref))) continue;
    count++;
  }
  return count;
}

export function countDocLoc(text: string): number {
  let count = 0;
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().length > 0) count++;
  }
  return count;
}

export function countTestCases(text: string, ext: string): number {
  const patterns = TEST_CASE_PATTERNS[ext] ?? [];
  let total = 0;
  for (const re of patterns) {
    const matches = text.match(re);
    if (matches) total += matches.length;
  }
  return total;
}

/** ---------- Git plumbing (via simple-git + system git for blobs) ---------- */

export async function ensureRepo(repoArg: string, opts?: { keepTemp?: boolean }): Promise<{
  repoPath: string;
  cleanup: () => void;
  git: SimpleGit;
  displayName: string;
}> {
  if (looksLikeUrl(repoArg)) {
    const tmp = mkTempDir("repo_scan_");
    const git = simpleGit();
    process.stderr.write(`Cloning ${sanitizeRepoForDisplay(repoArg)} ...\n`);
    await git.clone(repoArg, tmp);
    const g = simpleGit(tmp);
    const keep = !!(opts && opts.keepTemp);
    return {
      repoPath: tmp,
      cleanup: keep ? () => {} : () => fs.rmSync(tmp, { recursive: true, force: true }),
      git: g,
      displayName: sanitizeRepoForDisplay(repoArg)
    };
  } else {
    const abs = path.resolve(repoArg);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) {
      const masked = abs.startsWith(os.homedir()) ? abs.replace(os.homedir(), '~') : abs;
      process.stderr.write(`Path does not exist or is not a directory: ${masked}\n`);
      process.exit(2);
    }
    const g = simpleGit(abs);
    return { repoPath: abs, cleanup: () => {}, git: g, displayName: sanitizeRepoForDisplay(abs) };
  }
}

async function getRev(git: SimpleGit, branchArg: string | null): Promise<string> {
  if (branchArg) return branchArg;
  try {
    const b = await git.revparse(["--abbrev-ref", "HEAD"]);
    return b.trim();
  } catch {
    return "HEAD";
  }
}

async function listCommits(
  git: SimpleGit,
  rev: string,
  opts: { firstParent: boolean; includeMerges: boolean; maxCommits: number | null; }
): Promise<string[]> {
  const args = ["rev-list", "--reverse"];
  if (!opts.includeMerges) args.push("--no-merges");
  if (opts.firstParent) args.push("--first-parent");
  if (opts.maxCommits && Number.isFinite(opts.maxCommits)) args.push(`--max-count=${opts.maxCommits}`);
  args.push(rev);
  const out = await git.raw(args);
  return out.split("\n").map(s => s.trim()).filter(Boolean);
}

type TreeEntry = { mode: string; type: "blob" | "tree"; sha: string; size: number | null; path: string; };

async function listTree(git: SimpleGit, commit: string): Promise<TreeEntry[]> {
  const out = await git.raw(["ls-tree", "-r", "-l", commit]);
  const entries: TreeEntry[] = [];
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    // Format: <mode> <type> <sha> <size>\t<path>
    const tabIdx = line.indexOf("\t");
    if (tabIdx < 0) continue;
    const meta = line.slice(0, tabIdx).trim().split(/\s+/);
    const filePath = line.slice(tabIdx + 1);
    const mode = meta[0]!;
    const type = meta[1] as "blob" | "tree";
    const sha = meta[2]!;
    let size: number | null = null;
    if (meta.length >= 4 && /^\d+$/.test(meta[3]!)) size = parseInt(meta[3]!, 10);
    entries.push({ mode, type, sha, size, path: filePath });
  }
  return entries;
}

async function catBlob(git: SimpleGit, repoPath: string, sha: string, maxBytes: number): Promise<string | null> {
  // Use git.raw via simple-git to read the blob asynchronously (avoids spawning shell)
  try {
    const out = await git.raw(["cat-file", "-p", sha]);
    if (!out) return null;
    const buf = Buffer.from(out, 'utf8');
    if (buf.length > maxBytes) return null;
    if (seemsBinary(buf)) return null;
    try { return buf.toString('utf8'); } catch { return buf.toString('latin1'); }
  } catch {
    return null;
  }
}

async function commitDateIso(git: SimpleGit, commit: string): Promise<string> {
  const out = await git.raw(["show", "-s", "--format=%cI", commit]);
  return out.trim(); // ISO 8601 with timezone
}

async function commitMessage(git: SimpleGit, commit: string): Promise<string> {
  const out = await git.raw(["show", "-s", "--format=%B", commit]);
  return out; // keep original message with internal newlines
}

/** ---------- Core analysis ---------- */

export async function computeMetricsForCommit(
  git: SimpleGit,
  repoPath: string,
  commit: string,
  blobCache: Map<string, BlobMetrics>,
  maxFileBytes: number
): Promise<{ nonTestLoc: number; totalTests: number; docLoc: number; }> {
  let nonTestLoc = 0;
  let totalTests = 0;
  let docLoc = 0;

  const entries = await listTree(git, commit);
  for (const e of entries) {
    if (e.type !== "blob") continue;

    const p = e.path;
    const ext = extOf(p);
    const isDoc = DOC_EXTS.has(ext);
    const isCode = CODE_EXTS.has(ext);

    // Only consider code or Markdown; skip everything else early.
    if (!isCode && !isDoc) continue;

    // Apply directory skip ONLY for non-doc files.
    if (!isDoc && pathShouldSkip(p)) continue;

    if (e.size !== null && e.size > maxFileBytes) continue;

    let metrics = blobCache.get(e.sha);
    if (!metrics) {
      const text = await catBlob(git, repoPath, e.sha, maxFileBytes);
      if (text == null) {
        metrics = { codeLoc: 0, testCases: 0, docLoc: 0 };
      } else {
        const codeLoc = isCode ? countCodeLoc(text, ext) : 0;
        const docLines = isDoc ? countDocLoc(text) : 0;
        const tCases = isCode ? countTestCases(text, ext) : 0;
        metrics = { codeLoc, testCases: tCases, docLoc: docLines };
      }
      blobCache.set(e.sha, metrics);
    }

    if (isDoc) {
      docLoc += metrics.docLoc;
    } else if (isCode) {
      if (isTestPath(p)) {
        totalTests += metrics.testCases;
      } else {
        nonTestLoc += metrics.codeLoc;
      }
    }
  }

  return { nonTestLoc, totalTests, docLoc };
}

/** ---------- Plot (Plotly HTML) ---------- */

function writePlotlyHtml(
  outPath: string,
  repoLabel: string,
  rev: string,
  rows: Row[],
  msgAvgWindow: number,
  plotlySrc?: string
): void {
  const dates = rows.map(r => r.isoWhen);
  const nonTestLoc = rows.map(r => r.nonTestLoc);
  const docLoc = rows.map(r => r.docLoc);
  const tests = rows.map(r => r.totalTests);
  const msgAvg = rows.map(r => r.commitMsgLenAvg);

  const title = `Code (non-test) & Markdown LOC vs Test Cases vs Commit Msg Length (avg ${msgAvgWindow})<br>${repoLabel} (rev: ${rev})`;

  // Determine which Plotly source to use. Priority:
  // 1. explicit function parameter `plotlySrc` (from CLI --plotly-src)
  // 2. runtime override via globalThis.__repo_plotly_src
  // 3. local node_modules copy (if present next to current cwd)
  // 4. CDN fallback
  const resolvedPlotlySrc = (function(){
    if (plotlySrc) return plotlySrc;
    if (typeof (globalThis as any).__repo_plotly_src === 'string') return (globalThis as any).__repo_plotly_src;
    try {
      const localCandidate = 'node_modules/plotly.js-dist-min/plotly.min.js';
      if (fs.existsSync(localCandidate)) return localCandidate;
    } catch (_) {}
    return 'https://cdn.plot.ly/plotly-2.35.2.min.js';
  })();

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(title)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <style>
    html, body { margin: 0; padding: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; }
    #plot { width: 100%; height: 100vh; }
  </style>
</head>
<body>
<div id="plot"></div>
<script src="${resolvedPlotlySrc}"></script>
<script>
  const dates = ${JSON.stringify(dates)};
  const nonTestLoc = ${JSON.stringify(nonTestLoc)};
  const docLoc = ${JSON.stringify(docLoc)};
  const tests = ${JSON.stringify(tests)};
  const msgAvg = ${JSON.stringify(msgAvg)};
  const msgAvgWindow = ${JSON.stringify(msgAvgWindow)};

  const traceCode = {
    x: dates, y: nonTestLoc, name: 'Non-test LOC', mode: 'lines',
    line: { width: 2 },
    yaxis: 'y'
  };
  const traceDocs = {
    x: dates, y: docLoc, name: 'Markdown LOC', mode: 'lines',
    line: { width: 2, dash: 'dot' },
    yaxis: 'y'
  };
  const traceTests = {
    x: dates, y: tests, name: 'Total test cases', mode: 'lines',
    line: { width: 2, dash: 'dash' },
    yaxis: 'y2'
  };
  const traceMsgAvg = {
    x: dates, y: msgAvg, name: 'Avg commit msg length (chars, last ' + msgAvgWindow + ')', mode: 'lines',
    line: { width: 2, dash: 'longdashdot' },
    yaxis: 'y3'
  };

  const layout = {
    title: { text: ${JSON.stringify(title)}, x: 0.02, xanchor: 'left' },
    xaxis: { title: 'Commit date', type: 'date' },
    yaxis:  { title: 'LOC (non-test & markdown)', rangemode: 'tozero' },
    yaxis2: { title: 'Total test cases', overlaying: 'y', side: 'right', position: 1.0, rangemode: 'tozero' },
    yaxis3: { title: 'Avg commit msg length (chars)', overlaying: 'y', side: 'right', position: 0.96, rangemode: 'tozero' },
    legend: { orientation: 'h', x: 0.02, y: 1.12 },
    margin: { l: 60, r: 80, t: 90, b: 60 }
  };

  Plotly.newPlot(document.getElementById('plot'),
    [traceCode, traceDocs, traceTests, traceMsgAvg],
    layout,
    { displaylogo: false, responsive: true }
  );
</script>
</body>
</html>`;
  fs.writeFileSync(outPath, html, "utf8");
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}

/** ---------- Main ---------- */

export async function main() {
  const args = parseArgs();
  const verbose = !!args.verbose;
  function log(...s: any[]) { if (verbose) console.error(...s); }
  // If dryRun, avoid clone/work and just show what would be done.
  if (args.dryRun) {
    console.error(`Dry run: would analyze ${sanitizeRepoForDisplay(args.repo)} on rev ${args.branch ?? 'HEAD'}; no files will be written.`);
    return;
  }

  const { repoPath, cleanup, git, displayName } = await ensureRepo(args.repo, { keepTemp: args.keepTemp });
  try {
    const rev = await getRev(git, args.branch ?? null);

    let commits = await listCommits(git, rev, {
      firstParent: args.firstParent,
      includeMerges: args.includeMerges,
      maxCommits: args.maxCommits ?? null
    });

    if (args.sampleEvery > 1) {
      commits = commits.filter((_, i) => (i % args.sampleEvery) === 0);
    }

    if (commits.length === 0) {
      process.stderr.write("No commits found for the specified revision.\n");
      process.exit(4);
    }

    process.stderr.write(`Processing ${commits.length} commits ...\n`);

    const blobCache = new Map<string, BlobMetrics>();
    const rows: Row[] = [];

    // Rolling average state for commit message lengths (mean)
    const win = Math.max(1, args.msgAvgWindow);
    const msgLenWindow: number[] = [];
    let msgLenSum = 0;

    for (let i = 0; i < commits.length; i++) {
      const c = commits[i]!;
      if ((i + 1) % 50 === 0 || i === 0) {
        process.stderr.write(`  … ${i + 1}/${commits.length}\n`);
      }

      const { nonTestLoc, totalTests, docLoc } = await computeMetricsForCommit(
        git, repoPath, c, blobCache, args.maxFileBytes
      );

  // Commit date (normalize to UTC ISO)
  const iso = await commitDateIso(git, c);
  const isoUtc = new Date(iso).toISOString();

      // Commit message length in characters (subject + body)
      const rawMsg = await commitMessage(git, c);
      const msgLen = rawMsg.replace(/\s+$/s, "").length;

      // Rolling mean maintenance
      msgLenWindow.push(msgLen);
      msgLenSum += msgLen;
      if (msgLenWindow.length > win) {
        msgLenSum -= msgLenWindow.shift()!;
      }
      const msgLenAvg = msgLenSum / msgLenWindow.length;

      rows.push({
        isoWhen: isoUtc,
        nonTestLoc,
        totalTests,
        docLoc,
        shortSha: c.slice(0, 12),
        commitMsgLen: msgLen,
        commitMsgLenAvg: msgLenAvg
      });
    }

    // CSV with proper escaping and decimals
    const csvPath = `${args.outputPrefix}.csv`;
    const header = "timestamp_utc,non_test_loc,total_tests,doc_loc,commit,commit_msg_len,commit_msg_len_avg\n";
    function csvEscape(v: string|number) {
      const s = String(v);
      if (/[,"\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
      return s;
    }
    const csvBody = rows
      .map(r => [
        csvEscape(r.isoWhen),
        csvEscape(r.nonTestLoc),
        csvEscape(r.totalTests),
        csvEscape(r.docLoc),
        csvEscape(r.shortSha),
        csvEscape(r.commitMsgLen),
        csvEscape(Number(r.commitMsgLenAvg).toFixed(args.csvDecimals))
      ].join(","))
      .join("\n") + "\n";
    fs.writeFileSync(csvPath, header + csvBody, "utf8");
    log(`Wrote ${csvPath}`);

  // HTML plot
  const htmlPath = `${args.outputPrefix}.html`;
  // Optionally copy Plotly to a local assets directory for offline viewing
  let plotlySrcToUse: string | undefined = undefined;
  if (typeof args.assetsDir !== 'undefined') {
    const assetsDir = args.assetsDir === null ? 'assets' : args.assetsDir;
    try {
      const candidate = path.join(process.cwd(), 'node_modules', 'plotly.js-dist-min', 'plotly.min.js');
      if (fs.existsSync(candidate)) {
        const destDir = path.resolve(assetsDir);
        fs.mkdirSync(destDir, { recursive: true });
        const destPath = path.join(destDir, 'plotly.min.js');
        fs.copyFileSync(candidate, destPath);
        // Use a relative path from the HTML file to the asset
        plotlySrcToUse = path.relative(path.dirname(htmlPath) || '.', destPath).replace(/\\/g, '/');
        log(`Copied Plotly to ${destPath}`);
      } else {
        process.stderr.write('Plotly package not found locally; falling back to CDN for HTML output.\n');
      }
    } catch (err) {
      if (verbose) console.error('Failed to copy assets:', err);
      else process.stderr.write('Failed to copy assets; using CDN.\n');
    }
  }

  writePlotlyHtml(htmlPath, displayName, rev, rows, win, plotlySrcToUse);
  log(`Wrote ${htmlPath}`);

  } finally {
    cleanup();
  }
}

// Only run main if this file is the entrypoint (avoid running during tests/imports)
const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch(err => {
    // Prefer minimal error message to avoid leaking environment details; stack printed only in verbose mode
    const verbose = process.argv.includes('--verbose');
    if (verbose) console.error(err);
    else console.error(err && (err.message || String(err)));
    process.exit(1);
  });
}
