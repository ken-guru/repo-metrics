import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { copyPlotlyToAssets } from '../src/repo_test_growth';

describe('assets helper', () => {
  it('returns undefined if no local plotly present', () => {
    const tmp = fs.mkdtempSync(path.join(process.cwd(), 'tmp-assets-'));
    try {
      const htmlPath = path.join(tmp, 'out.html');
      const res = copyPlotlyToAssets(path.join(tmp, 'assets'), htmlPath, { cwd: tmp, verbose: false });
      expect(res).toBeUndefined();
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });

  it('copies local plotly bundle into assets and returns relative path', () => {
    const tmp = fs.mkdtempSync(path.join(process.cwd(), 'tmp-assets-'));
    try {
      // create a fake node_modules plotly bundle
      const pkgDir = path.join(tmp, 'node_modules', 'plotly.js-dist-min');
      fs.mkdirSync(pkgDir, { recursive: true });
      const src = path.join(pkgDir, 'plotly.min.js');
      fs.writeFileSync(src, '// plotly stub');

      const htmlDir = path.join(tmp, 'outdir');
      fs.mkdirSync(htmlDir, { recursive: true });
      const htmlPath = path.join(htmlDir, 'index.html');

      const destAssets = path.join(tmp, 'assets');
      const res = copyPlotlyToAssets(destAssets, htmlPath, { cwd: tmp, verbose: false });
      expect(res).toBeDefined();
      const expected = path.relative(path.dirname(htmlPath), path.join(destAssets, 'plotly.min.js')).replace(/\\/g, '/');
      expect(res).toBe(expected);
      // file actually exists
      expect(fs.existsSync(path.join(destAssets, 'plotly.min.js'))).toBe(true);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
