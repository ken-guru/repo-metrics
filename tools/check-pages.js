#!/usr/bin/env node
/*
 Playwright site checker: loads a page, captures network responses and console messages,
 and reports 404s and other failed resources. Designed to be run locally or in CI.

 Usage:
 1) Install Playwright (once):
    npm install -D playwright
    npx playwright install --with-deps chromium
 2) Run the checker:
    node tools/check-pages.js https://ken-guru.github.io/repo-metrics/

 The script exits with code 0 if no 4xx/5xx asset failures and no console errors, else exits 2.
*/
const url = process.argv[2] || 'https://ken-guru.github.io/repo-metrics/';
const timeout = 20000;

(async () => {
  try {
    const { chromium } = require('playwright');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    const failures = [];
    const consoleErrors = [];

    page.on('requestfailed', req => {
      const failure = req.failure();
      failures.push({ url: req.url(), status: null, failure: failure && failure.errorText });
    });

    page.on('response', resp => {
      const status = resp.status();
      if (status >= 400) {
        failures.push({ url: resp.url(), status });
      }
    });

    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push({ text: msg.text() });
    });

    console.log(`Checking ${url} ... (timeout ${timeout}ms)`);
    await page.goto(url, { waitUntil: 'networkidle', timeout });

    // give a moment for any late network activity
    await page.waitForTimeout(500);

    await browser.close();

    if (consoleErrors.length === 0 && failures.length === 0) {
      console.log('OK: no console errors and no failed asset requests detected.');
      process.exit(0);
    }

    if (consoleErrors.length) {
      console.log('\nConsole errors:');
      consoleErrors.forEach((c, i) => console.log(`${i + 1}. ${c.text}`));
    }

    if (failures.length) {
      console.log('\nFailed network requests (>=400 or aborted):');
      failures.forEach((f, i) => console.log(`${i + 1}. ${f.status || 'ERR'} ${f.url} ${f.failure ? '- ' + f.failure : ''}`));
    }

    process.exit(2);
  } catch (err) {
    console.error('Error running Playwright checker:', err && err.message ? err.message : err);
    process.exit(3);
  }
})();
