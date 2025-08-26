import path from 'node:path';
import type { SimpleGit } from 'simple-git';
import { listTree, catBlob } from './git';

export type BlobMetrics = { codeLoc: number; testCases: number; docLoc: number };

const CODE_EXTS = new Set<string>([
  'py','js','jsx','ts','tsx','mjs','cjs','java','kt','kts','scala','c','cc','cpp','cxx','h','hh','hpp','hxx','cs','go','rs','swift','m','mm','rb','php','sh','bash','zsh','sql'
]);
const DOC_EXTS = new Set<string>(['md','markdown','mdx']);
const SKIP_DIR_FRAGMENTS = new Set<string>(['.git','node_modules','vendor','third_party','dist','build','out','target','bin','obj','.venv','venv','__pycache__','Pods','.idea','.vscode']);
const TEST_DIR_HINTS = new Set<string>(['test','tests','__tests__','spec','specs','integration-tests','e2e','acceptance']);
const TEST_FILE_SUFFIXES = ['_test', '.test', '.spec', 'Spec', 'Tests'];
const TEST_FILE_PREFIXES = ['test_','spec_'];
const COMMENT_PREFIXES_BY_EXT: Record<string,string[]> = { py: ['#'], js: ['//'], jsx: ['//'], ts: ['//'], tsx: ['//'], java: ['//'], kt: ['//'], kts: ['//'], scala: ['//'], c: ['//'], cc: ['//'], cpp: ['//'], cxx: ['//'], h: ['//'], hh: ['//'], hpp: ['//'], hxx: ['//'], go: ['//'], rs: ['//'], swift: ['//'], m: ['//'], mm: ['//'], rb: ['#'], php: ['//','#'], sh: ['#'], bash: ['#'], zsh: ['#'], sql: ['--'], cs: ['//'] };

export function extOf(p: string): string { return path.extname(p).toLowerCase().replace(/^\./, ''); }
export function pathShouldSkip(p: string): boolean { const parts = path.normalize(p).split(path.sep).map(s => s.toLowerCase()); return parts.some(part => SKIP_DIR_FRAGMENTS.has(part)); }
function isTestPath(p: string): boolean {
  const parts = p.split('/');
  for (let i=0;i<parts.length-1;i++){ const low=parts[i].toLowerCase(); if (TEST_DIR_HINTS.has(low) || Array.from(TEST_DIR_HINTS).some(h=>low.includes(h))) return true; }
  const filename = parts[parts.length-1] ?? '';
  const dot = filename.lastIndexOf('.');
  const base = dot>=0 ? filename.slice(0,dot) : filename;
  if (TEST_FILE_PREFIXES.some(pref=>base.startsWith(pref))) return true;
  if (TEST_FILE_SUFFIXES.some(sfx=>base.endsWith(sfx))) return true;
  return false;
}

export function countCodeLoc(text: string, ext: string): number {
  let count = 0; const prefixes = COMMENT_PREFIXES_BY_EXT[ext] ?? [];
  for (const line of text.split(/\r?\n/)) { const s = line.trim(); if (!s) continue; if (prefixes.some(pref => s.startsWith(pref))) continue; count++; }
  return count;
}
export function countDocLoc(text: string): number { let count = 0; for (const line of text.split(/\r?\n/)) if (line.trim().length>0) count++; return count; }
const TEST_CASE_PATTERNS: Record<string, RegExp[]> = { py: [/^\s*def\s+test_[A-Za-z0-9_]+\s*\(/gm,/^\s*class\s+Test[A-Za-z0-9_]*\s*[:\(]/gm], js: [ /\b(it|test)\s*\(/gm ], ts: [ /\b(it|test)\s*\(/gm ], jsx: [ /\b(it|test)\s*\(/gm ], tsx: [ /\b(it|test)\s*\(/gm ], mjs: [ /\b(it|test)\s*\(/gm ], cjs: [ /\b(it|test)\s*\(/gm ], java: [ /@Test\b/gm, /@ParameterizedTest\b/gm ], kt: [ /@Test\b/gm, /@ParameterizedTest\b/gm ], kts: [ /@Test\b/gm, /@ParameterizedTest\b/gm ], go: [/^\s*func\s+Test[A-Z][A-Za-z0-9_]*\s*\(/gm], rb: [/^\s*def\s+test_[A-Za-z0-9_]+\s*$/gm,/^\s*it\s+['"]/gm], swift: [/^\s*func\s+test[A-Z][A-Za-z0-9_]*\s*\(/gm], cs: [/\[(Fact|Theory|Test|TestCase)\]/gm], rs: [/#\[test\]/gm], php: [/@test\b/gm,/^\s*public\s+function\s+test[A-Z]/gm], c: [/\bTEST(_F|_P|_S)?\s*\(/gm], cpp: [/\bTEST(_F|_P|_S)?\s*\(/gm], cc: [/\bTEST(_F|_P|_S)?\s*\(/gm], cxx: [/\bTEST(_F|_P|_S)?\s*\(/gm], h: [/\bTEST(_F|_P|_S)?\s*\(/gm], hh: [/\bTEST(_F|_P|_S)?\s*\(/gm], hpp: [/\bTEST(_F|_P|_S)?\s*\(/gm], hxx: [/\bTEST(_F|_P|_S)?\s*\(/gm], scala: [/\b(it|test)\s*\(/gm], sql: [/\bTEST\b/gi] };

export function countTestCases(text: string, ext: string): number { const patterns = TEST_CASE_PATTERNS[ext] ?? []; let total = 0; for (const re of patterns) { const matches = text.match(re); if (matches) total += matches.length; } return total; }

export function seemsBinary(buf: Buffer): boolean { return buf.includes(0); }

export async function computeMetricsForCommit(git: SimpleGit, repoPath: string, commit: string, blobCache: Map<string, BlobMetrics>, maxFileBytes: number) {
  let nonTestLoc = 0, totalTests = 0, docLoc = 0;
  const entries = await listTree(git, commit);
  for (const e of entries) {
    if (e.type !== 'blob') continue;
    const p = e.path; const ext = extOf(p);
    const isDoc = DOC_EXTS.has(ext); const isCode = CODE_EXTS.has(ext);
    if (!isCode && !isDoc) continue;
    if (!isDoc && pathShouldSkip(p)) continue;
    if (e.size !== null && e.size > maxFileBytes) continue;
    let metrics = blobCache.get(e.sha);
    if (!metrics) {
      const text = await catBlob(git, e.sha, maxFileBytes);
      if (text == null) metrics = { codeLoc: 0, testCases: 0, docLoc: 0 };
      else {
        const codeLoc = isCode ? countCodeLoc(text, ext) : 0;
        const docLines = isDoc ? countDocLoc(text) : 0;
        const tCases = isCode ? countTestCases(text, ext) : 0;
        metrics = { codeLoc, testCases: tCases, docLoc: docLines };
      }
      blobCache.set(e.sha, metrics);
    }
    if (isDoc) docLoc += metrics.docLoc;
    else if (isCode) { if (isTestPath(p)) totalTests += metrics.testCases; else nonTestLoc += metrics.codeLoc; }
  }
  return { nonTestLoc, totalTests, docLoc };
}
