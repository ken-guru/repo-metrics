import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export type Args = {
  repo: string; branch?: string | null; firstParent: boolean; includeMerges: boolean; sampleEvery: number; maxCommits?: number | null; maxFileBytes: number; outputPrefix: string; msgAvgWindow: number; verbose: boolean; plotlySrc?: string | null; csvDecimals: number; dryRun: boolean; keepTemp: boolean; assetsDir?: string | null;
};

export function parseArgs(): Args {
  const a = process.argv.slice(2);
  if (a.length === 0) {
  console.error('Usage: node dist/repo-metrics.js <repo-url-or-path> [--branch main] [--first-parent] [--include-merges] [--sample-every N] [--max-commits N] [--max-file-bytes BYTES] [--msg-avg-window N] [--output-prefix metrics]');
    process.exit(2);
  }
  const args: Args = { repo: a[0], branch: null, firstParent: false, includeMerges: false, sampleEvery: 1, maxCommits: null, maxFileBytes: 1_000_000, outputPrefix: 'metrics', msgAvgWindow: 50, verbose: false, plotlySrc: null, csvDecimals: 2, dryRun: false, keepTemp: false, assetsDir: undefined };
  for (let i = 1; i < a.length; i++) {
    const t = a[i];
    if (t === '--branch') args.branch = a[++i] ?? null;
    else if (t === '--first-parent') args.firstParent = true;
    else if (t === '--include-merges') args.includeMerges = true;
    else if (t === '--sample-every') args.sampleEvery = parseInt(a[++i], 10);
    else if (t === '--max-commits') args.maxCommits = parseInt(a[++i], 10);
    else if (t === '--max-file-bytes') args.maxFileBytes = parseInt(a[++i], 10);
    else if (t === '--msg-avg-window') args.msgAvgWindow = parseInt(a[++i], 10);
    else if (t === '--verbose') args.verbose = true;
    else if (t === '--plotly-src') args.plotlySrc = a[++i] ?? null;
    else if (t === '--csv-decimals') args.csvDecimals = parseInt(a[++i], 10);
    else if (t === '--dry-run') args.dryRun = true;
    else if (t === '--keep-temp') args.keepTemp = true;
    else if (t === '--assets') { const next = a[i+1]; if (!next || next.startsWith('--')) args.assetsDir = null; else args.assetsDir = a[++i]!; }
    else if (t === '--output-prefix') args.outputPrefix = a[++i]!;
    else { console.error(`Unknown arg: ${t}`); process.exit(2); }
  }
  if (!Number.isFinite(args.sampleEvery) || args.sampleEvery < 1) args.sampleEvery = 1;
  if (!Number.isFinite(args.msgAvgWindow) || args.msgAvgWindow < 1) args.msgAvgWindow = 50;
  if (!Number.isFinite(args.csvDecimals) || args.csvDecimals < 0) args.csvDecimals = 2;
  args.outputPrefix = sanitizeOutputPrefix(args.outputPrefix);
  return args;
}

export function looksLikeUrl(s: string): boolean { return /^(https?|git):\/\//.test(s) || s.endsWith('.git'); }

export function sanitizeRepoForDisplay(s: string): string {
  if (/^[a-z]+:\/\//i.test(s) || s.endsWith('.git')) {
    try { const u = new URL(s); if (u.username) u.username = '****'; if (u.password) u.password = ''; return `${u.protocol}//${u.host}${u.pathname}`; } catch { return s.replace(/\/\/[^@]+@/, '//****@'); }
  }
  try { return path.basename(path.resolve(s)); } catch { return s; }
}

export function mkTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix)); try { fs.chmodSync(dir, 0o700); } catch(_) {} return dir;
}

export function sanitizeOutputPrefix(p: string): string {
  if (!p || typeof p !== 'string') return 'metrics';
  // Remove leading ./ or ../ sequences to avoid creating names like '.._etc'
  let s = p;
  while (s.startsWith('./') || s.startsWith('../')) {
    if (s.startsWith('./')) s = s.slice(2);
    else if (s.startsWith('../')) s = s.slice(3);
  }
  // Join remaining path segments with underscores and sanitize characters
  const parts = s.split(/[\/]+/).filter(Boolean);
  const joined = parts.join('_') || s;
  const clean = joined.replace(/[^A-Za-z0-9._-]/g, '_');
  if (!clean || clean.length === 0) return 'metrics';
  if (clean === '.' || clean === '..') return 'metrics';
  return clean;
}
