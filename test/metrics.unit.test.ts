import { describe, it, expect } from 'vitest';
import { extOf, countCodeLoc, countDocLoc, countTestCases, computeMetricsForCommit } from '../src/repo-metrics';
import { simpleGit } from 'simple-git';
import fs from 'node:fs';
import path from 'node:path';

describe('metrics module (unit)', () => {
  it('extOf handles paths', () => {
    expect(extOf('a/b/c.ts')).toBe('ts');
    expect(extOf('README')).toBe('');
  });

  it('countCodeLoc / countDocLoc basic behavior', () => {
    const js = `// hi\nfunction a() {\n  // inner\n  return 2;\n}\n`;
    expect(countCodeLoc(js, 'js')).toBe(3);
    const md = `# x\n\ncontent\n`;
    expect(countDocLoc(md)).toBe(2);
  });

  it('countTestCases recognizes patterns', () => {
    const py = `def test_foo():\n  pass\n`;
    expect(countTestCases(py, 'py')).toBeGreaterThanOrEqual(1);
    const js = `it('ok', ()=>{}); test('also', ()=>{});`;
    expect(countTestCases(js, 'js')).toBeGreaterThanOrEqual(2);
  });
});
