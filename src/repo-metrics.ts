import { parseArgs, sanitizeRepoForDisplay, mkTempDir, looksLikeUrl, sanitizeOutputPrefix } from './cli';
import * as Git from './git';
import * as Metrics from './metrics';
import * as Output from './output';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export { parseArgs, sanitizeRepoForDisplay, mkTempDir, looksLikeUrl, sanitizeOutputPrefix };
export const computeMetricsForCommit = Metrics.computeMetricsForCommit;
export const writeCsv = Output.writeCsv;
export const writePlotlyHtml = Output.writePlotlyHtml;
export const copyPlotlyToAssets = Output.copyPlotlyToAssets;
export const ensureRepo = Git.ensureRepo;
export const extOf = Metrics.extOf;
export const countCodeLoc = Metrics.countCodeLoc;
export const countDocLoc = Metrics.countDocLoc;
export const countTestCases = Metrics.countTestCases;
export const seemsBinary = Metrics.seemsBinary;

export async function main() {
  const args = parseArgs();
  const verbose = !!args.verbose;
  function log(...s: unknown[]) { if (verbose) console.error(...s.map(String)); }
  if (args.dryRun) {
    console.error(`Dry run: would analyze ${sanitizeRepoForDisplay(args.repo)} on rev ${args.branch ?? 'HEAD'}; no files will be written.`);
    return;
  }

  const { repoPath, cleanup, git, displayName } = await Git.ensureRepo(args.repo, { keepTemp: args.keepTemp });
  try {
    const rev = await Git.getRev(git, args.branch ?? null);

    let commits = await Git.listCommits(git, rev, { firstParent: args.firstParent, includeMerges: args.includeMerges, maxCommits: args.maxCommits ?? null });
    if (args.sampleEvery > 1) commits = commits.filter((_, i) => (i % args.sampleEvery) === 0);
    if (commits.length === 0) { process.stderr.write('No commits found for the specified revision.\n'); process.exit(4); }

    process.stderr.write(`Processing ${commits.length} commits ...\n`);

    const blobCache = new Map<string, Metrics.BlobMetrics>();
    const rows: Output.Row[] = [];

    const win = Math.max(1, args.msgAvgWindow);
    const msgLenWindow: number[] = [];
    let msgLenSum = 0;

    for (let i = 0; i < commits.length; i++) {
      const c = commits[i];
      if ((i + 1) % 50 === 0 || i === 0) process.stderr.write(`  … ${i + 1}/${commits.length}\n`);
      const { nonTestLoc, totalTests, docLoc } = await Metrics.computeMetricsForCommit(git, repoPath, c, blobCache, args.maxFileBytes);
      const iso = await Git.commitDateIso(git, c);
      const isoUtc = new Date(iso).toISOString();
      const rawMsg = await Git.commitMessage(git, c);
      const msgLen = rawMsg.replace(/\s+$/s, '').length;
      msgLenWindow.push(msgLen); msgLenSum += msgLen; if (msgLenWindow.length > win) msgLenSum -= msgLenWindow.shift()!; const msgLenAvg = msgLenSum / msgLenWindow.length;
      rows.push({ isoWhen: isoUtc, nonTestLoc, totalTests, docLoc, shortSha: c.slice(0, 12), commitMsgLen: msgLen, commitMsgLenAvg: msgLenAvg });
    }

    const csvPath = `${args.outputPrefix}.csv`;
    Output.writeCsv(csvPath, rows, args.csvDecimals);
    log(`Wrote ${csvPath}`);

    const htmlPath = `${args.outputPrefix}.html`;
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
          plotlySrcToUse = path.relative(path.dirname(htmlPath) || '.', destPath).replace(/\\/g, '/');
          log(`Copied Plotly to ${destPath}`);
        } else {
          process.stderr.write('Plotly package not found locally; falling back to CDN for HTML output.\n');
        }
      } catch (err) { if (verbose) console.error('Failed to copy assets:', err); else process.stderr.write('Failed to copy assets; using CDN.\n'); }
    }

    Output.writePlotlyHtml(htmlPath, displayName, rev, rows, win, plotlySrcToUse);
    log(`Wrote ${htmlPath}`);

    } finally {
      cleanup();
    }
}

const __filename = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  main().catch((err: unknown) => {
    const verbose = process.argv.includes('--verbose');
    if (verbose) console.error(err);
    else {
      let msg: string;
      if (err instanceof Error) msg = err.message;
      else msg = String(err);
      console.error(msg);
    }
    process.exit(1);
  });
}
