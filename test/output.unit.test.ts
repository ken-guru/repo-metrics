import { describe, it, expect } from 'vitest';
import { writeCsv, copyPlotlyToAssets } from '../src/repo_test_growth';
import fs from 'node:fs';
import path from 'node:path';

describe('output module (unit)', () => {
  it('writeCsv writes a file', () => {
    const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'test-out-'));
    const out = path.join(tmp, 'data.csv');
    writeCsv(out, [{ isoWhen: '2020-01-01T00:00:00Z', nonTestLoc: 1, totalTests: 2, docLoc: 3, shortSha: 'abc', commitMsgLen: 4, commitMsgLenAvg: 4 }], 2);
    const s = fs.readFileSync(out, 'utf8');
    expect(s.includes('timestamp_utc')).toBe(true);
  });

  it('copyPlotlyToAssets returns undefined when plotly not present', () => {
    const tmp = fs.mkdtempSync(path.join(require('os').tmpdir(), 'test-asset-'));
    const html = path.join(tmp, 'out.html');
    const res = copyPlotlyToAssets(path.join(tmp, 'assets'), html, { cwd: tmp, verbose: false });
    expect(res).toBeUndefined();
  });
});
