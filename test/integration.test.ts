import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { mkdtempSync } from 'node:fs';
import { simpleGit } from 'simple-git';
import { computeMetricsForCommit } from '../src/repo-metrics';

// Integration test: create a tiny git repo and assert metrics
describe('integration', () => {
  it('computes metrics on a tiny repo', async () => {
    const tmp = mkdtempSync(path.join(process.cwd(), 'tmp_repo_'));
    try {
      // init git via simple-git and configure local user to allow commits in CI environments
      const g = simpleGit(tmp);
      await g.init();
      await g.addConfig('user.email', 'test@example.com');
      await g.addConfig('user.name', 'Test User');
      // create files
      fs.writeFileSync(path.join(tmp, 'foo.py'), "# comment\ndef f():\n  return 1\n");
      fs.writeFileSync(path.join(tmp, 'test_foo.py'), "def test_one():\n  assert True\n");
      fs.writeFileSync(path.join(tmp, 'README.md'), "# hello\ntext\n");
      await g.add(['.']);
      await g.commit('initial commit');

      const commits = (await g.raw(['rev-list', '--reverse', 'HEAD'])).trim().split('\n').filter(Boolean);
      expect(commits.length).toBeGreaterThan(0);
      const commit = commits[commits.length - 1];

      const blobCache = new Map();
      const metrics = await computeMetricsForCommit(g, tmp, commit, blobCache, 1000000);
      // nonTestLoc: foo.py has 2 non-comment lines (def and return)
      expect(metrics.nonTestLoc).toBeGreaterThanOrEqual(1);
      // totalTests: test_foo.py contains test function
      expect(metrics.totalTests).toBeGreaterThanOrEqual(1);
      // docLoc: README.md lines
      expect(metrics.docLoc).toBeGreaterThanOrEqual(1);
    } finally {
      // cleanup
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch(_) {}
    }
  });
});
