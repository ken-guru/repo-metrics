import { describe, it, expect } from 'vitest';
import { sanitizeOutputPrefix, looksLikeUrl, sanitizeRepoForDisplay } from '../src/repo_test_growth';

describe('cli module (unit)', () => {
  it('sanitizeOutputPrefix removes unsafe chars', () => {
    expect(sanitizeOutputPrefix('../etc/passwd')).toBe('etc_passwd');
    expect(sanitizeOutputPrefix('good-name')).toBe('good-name');
  });

  it('looksLikeUrl and sanitizeRepoForDisplay', () => {
    expect(looksLikeUrl('https://github.com/ken/repo.git')).toBe(true);
    expect(looksLikeUrl('/tmp/local')).toBe(false);
    expect(typeof sanitizeRepoForDisplay('https://user:pw@github.com/ken/repo.git')).toBe('string');
  });
});
