import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { SimpleGit, simpleGit } from 'simple-git';
import { mkTempDir, looksLikeUrl, sanitizeRepoForDisplay } from './cli';

export async function ensureRepo(repoArg: string, opts?: { keepTemp?: boolean }) {
  if (looksLikeUrl(repoArg)) {
    const tmp = mkTempDir('repo_scan_');
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

export async function getRev(git: SimpleGit, branchArg: string | null): Promise<string> {
  if (branchArg) return branchArg;
  try {
    const b = await git.revparse(['--abbrev-ref', 'HEAD']);
    return b.trim();
  } catch {
    return 'HEAD';
  }
}

export async function listCommits(
  git: SimpleGit,
  rev: string,
  opts: { firstParent: boolean; includeMerges: boolean; maxCommits: number | null; }
): Promise<string[]> {
  const args = ['rev-list', '--reverse'];
  if (!opts.includeMerges) args.push('--no-merges');
  if (opts.firstParent) args.push('--first-parent');
  if (opts.maxCommits && Number.isFinite(opts.maxCommits)) args.push(`--max-count=${opts.maxCommits}`);
  args.push(rev);
  const out = await git.raw(args);
  return out.split('\n').map(s => s.trim()).filter(Boolean);
}

export type TreeEntry = { mode: string; type: 'blob' | 'tree'; sha: string; size: number | null; path: string; };

export async function listTree(git: SimpleGit, commit: string): Promise<TreeEntry[]> {
  const out = await git.raw(['ls-tree', '-r', '-l', commit]);
  const entries: TreeEntry[] = [];
  for (const line of out.split('\n')) {
    if (!line.trim()) continue;
    const tabIdx = line.indexOf('\t');
    if (tabIdx < 0) continue;
    const meta = line.slice(0, tabIdx).trim().split(/\s+/);
    const filePath = line.slice(tabIdx + 1);
    const mode = meta[0]!;
    const type = meta[1] as 'blob' | 'tree';
    const sha = meta[2]!;
    let size: number | null = null;
    if (meta.length >= 4 && /^\d+$/.test(meta[3]!)) size = parseInt(meta[3]!, 10);
    entries.push({ mode, type, sha, size, path: filePath });
  }
  return entries;
}

export function seemsBinary(buf: Buffer): boolean {
  return buf.includes(0);
}

export async function catBlob(git: SimpleGit, sha: string, maxBytes: number): Promise<string | null> {
  try {
    const out = await git.raw(['cat-file', '-p', sha]);
    if (!out) return null;
    const buf = Buffer.from(out, 'utf8');
    if (buf.length > maxBytes) return null;
    if (seemsBinary(buf)) return null;
    try { return buf.toString('utf8'); } catch { return buf.toString('latin1'); }
  } catch {
    return null;
  }
}

export async function commitDateIso(git: SimpleGit, commit: string): Promise<string> {
  const out = await git.raw(['show', '-s', '--format=%cI', commit]);
  return out.trim();
}

export async function commitMessage(git: SimpleGit, commit: string): Promise<string> {
  const out = await git.raw(['show', '-s', '--format=%B', commit]);
  return out;
}
