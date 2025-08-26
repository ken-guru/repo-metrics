import { describe, it, expect } from 'vitest';
import { countCodeLoc, countTestCases, extOf, seemsBinary, countDocLoc } from '../src/repo-metrics';

describe('helpers', () => {
  it('extOf extracts extension', () => {
    expect(extOf('src/foo/bar.ts')).toBe('ts');
    expect(extOf('README.md')).toBe('md');
    expect(extOf('noext')).toBe('');
  });

  it('countCodeLoc ignores blank lines and line-prefix comments', () => {
    const py = `# comment\n\ndef foo():\n  # inner comment\n  return 1\n`;
    expect(countCodeLoc(py, 'py')).toBe(2);
    const js = `// hi\nfunction a() {\n  // inner\n  return 2;\n}\n`;
    // note: closing brace '}' counts as a non-empty non-comment line in current heuristic
    expect(countCodeLoc(js, 'js')).toBe(3);
  });

  it('countDocLoc counts non-empty lines', () => {
    const md = `# Title\n\nSome text\n\nMore\n`;
    expect(countDocLoc(md)).toBe(3);
  });

  it('countTestCases finds python and js tests', () => {
    const py = `def test_one():\n  pass\nclass TestFoo:\n  pass\n`;
    expect(countTestCases(py, 'py')).toBeGreaterThanOrEqual(1);
    const js = `it('works', () => {});\ntest('also', () => {});\n`;
    expect(countTestCases(js, 'js')).toBeGreaterThanOrEqual(2);
  });

  it('seemsBinary detects NUL', () => {
    const b = Buffer.from([0,1,2,3]);
    expect(seemsBinary(b)).toBe(true);
    const t = Buffer.from('hello world');
    expect(seemsBinary(t)).toBe(false);
  });
});
