import fs from 'node:fs';
import path from 'node:path';

export type Row = {
  isoWhen: string; nonTestLoc: number; totalTests: number; docLoc: number; shortSha: string; commitMsgLen: number; commitMsgLenAvg: number;
};

export function writeCsv(pathOut: string, rows: Row[], csvDecimals: number) {
  const header = 'timestamp_utc,non_test_loc,total_tests,doc_loc,commit,commit_msg_len,commit_msg_len_avg\n';
  function csvEscape(v: string|number) { const s = String(v); if (/[,"\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'; return s; }
  const csvBody = rows.map(r => [csvEscape(r.isoWhen), csvEscape(r.nonTestLoc), csvEscape(r.totalTests), csvEscape(r.docLoc), csvEscape(r.shortSha), csvEscape(r.commitMsgLen), csvEscape(Number(r.commitMsgLenAvg).toFixed(csvDecimals))].join(',')).join('\n') + '\n';
  fs.writeFileSync(pathOut, header + csvBody, 'utf8');
}

export function copyPlotlyToAssets(assetsDir: string, htmlPath: string, options?: { cwd?: string; verbose?: boolean }): string | undefined {
  const cwd = options?.cwd ?? process.cwd();
  const verbose = !!options?.verbose;
  try {
    const candidate = path.join(cwd, 'node_modules', 'plotly.js-dist-min', 'plotly.min.js');
    if (!fs.existsSync(candidate)) return undefined;
    const destDir = path.resolve(assetsDir);
    fs.mkdirSync(destDir, { recursive: true });
    const destPath = path.join(destDir, 'plotly.min.js');
    fs.copyFileSync(candidate, destPath);
    if (verbose) console.error(`Copied Plotly from ${candidate} to ${destPath}`);
    return path.relative(path.dirname(htmlPath) || '.', destPath).replace(/\\/g, '/');
  } catch (_ignored) {
    if (verbose) console.error('Failed to copy assets:', _ignored);
    return undefined;
  }
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

export function writePlotlyHtml(outPath: string, repoLabel: string, rev: string, rows: Row[], msgAvgWindow: number, plotlySrc?: string) {
  const dates = rows.map(r => r.isoWhen);
  const nonTestLoc = rows.map(r => r.nonTestLoc);
  const docLoc = rows.map(r => r.docLoc);
  const tests = rows.map(r => r.totalTests);
  const msgAvg = rows.map(r => r.commitMsgLenAvg);
  const title = `Code (non-test) & Markdown LOC vs Test Cases vs Commit Msg Length (avg ${msgAvgWindow})<br>${repoLabel} (rev: ${rev})`;
  const resolvedPlotlySrc = (function(){
    if (plotlySrc) return plotlySrc;
    try { const localCandidate = 'node_modules/plotly.js-dist-min/plotly.min.js'; if (fs.existsSync(localCandidate)) return localCandidate; } catch {
      // ignore
    }
    return 'https://cdn.plot.ly/plotly-2.35.2.min.js';
  })();

  // Friendly CSV link (same base name as output HTML)
  const csvName = path.basename(outPath).replace(/\.html?$/i, '.csv');

  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${escapeHtml(title)}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <style>
    :root { --bg: #ffffff; --fg: #111827; --muted: #6b7280; --card: #f8fafc; --accent-1: #1f77b4; --accent-2: #ff7f0e; --accent-3: #2ca02c; --accent-4: #d62728; }
    [data-theme="dark"] { --bg: #0b1220; --fg: #e6eef8; --muted: #9aa7b2; --card: #071025; }
    html,body{height:100%;margin:0;background:var(--bg);color:var(--fg);font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial}
    .topbar{display:flex;align-items:center;justify-content:space-between;padding:12px 18px;border-bottom:1px solid rgba(0,0,0,0.04);background:linear-gradient(90deg,rgba(255,255,255,0.02),transparent)}
    .brand{font-weight:600;font-size:14px}
    .meta{font-size:13px;color:var(--muted)}
    .controls{display:flex;gap:8px;align-items:center}
    .btn{background:transparent;border:1px solid rgba(0,0,0,0.08);padding:6px 10px;border-radius:6px;font-size:13px;color:var(--fg);cursor:pointer}
    .container{display:grid;grid-template-columns:1fr 320px;gap:16px;padding:12px}
    .card{background:var(--card);padding:12px;border-radius:8px;box-shadow:0 1px 2px rgba(0,0,0,0.03)}
    #plot{width:100%;height:72vh}
    .summary{display:flex;flex-direction:column;gap:8px}
    .stat{display:flex;justify-content:space-between;font-size:13px}
    .muted{color:var(--muted);font-size:12px}
    @media (max-width:900px){.container{grid-template-columns:1fr;padding:8px}.summary{flex-direction:row;flex-wrap:wrap}}
  </style>
</head>
<body data-theme="light">
  <div class="topbar">
    <div>
      <div class="brand">Repo metrics — ${escapeHtml(repoLabel)}</div>
      <div class="meta">Revision: <code style="font-family:monospace">${escapeHtml(rev)}</code></div>
    </div>
    <div class="controls">
      <a class="btn" href="${escapeHtml(csvName)}" download>Download CSV</a>
      <button id="themeToggle" class="btn">Toggle theme</button>
      <button id="imgExport" class="btn">Download image</button>
    </div>
  </div>

  <div class="container">
    <div class="card">
      <div id="plot"></div>
    </div>
    <aside class="card">
      <div class="summary">
        <div class="muted">Summary</div>
        <div class="stat"><span>Commits</span><strong id="statCommits">—</strong></div>
        <div class="stat"><span>First / Last</span><strong id="statRange">—</strong></div>
        <div class="stat"><span>Total non-test LOC</span><strong id="statCode">—</strong></div>
        <div class="stat"><span>Total docs LOC</span><strong id="statDocs">—</strong></div>
        <div class="stat"><span>Max tests</span><strong id="statTests">—</strong></div>
        <div class="muted">Hover the chart for per-commit numbers. Use the legend to toggle series.</div>
      </div>
    </aside>
  </div>

  <script src="${resolvedPlotlySrc}"></script>
  <script>
    const dates = ${JSON.stringify(dates)};
    const nonTestLoc = ${JSON.stringify(nonTestLoc)};
    const docLoc = ${JSON.stringify(docLoc)};
    const tests = ${JSON.stringify(tests)};
    const msgAvg = ${JSON.stringify(msgAvg)};
    const msgAvgWindow = ${JSON.stringify(msgAvgWindow)};

    // compute summary
    (function(){
      const commits = dates.length;
      const first = commits ? dates[0] : '—';
      const last = commits ? dates[dates.length-1] : '—';
      const totalCode = nonTestLoc.reduce((s,v)=>s+v,0);
      const totalDocs = docLoc.reduce((s,v)=>s+v,0);
      const maxTests = tests.length ? Math.max(...tests) : 0;
      document.getElementById('statCommits').textContent = String(commits);
  document.getElementById('statRange').textContent = first + ' - ' + last;
      document.getElementById('statCode').textContent = totalCode.toLocaleString();
      document.getElementById('statDocs').textContent = totalDocs.toLocaleString();
      document.getElementById('statTests').textContent = String(maxTests);
    })();

    const colorPalette = [getComputedStyle(document.documentElement).getPropertyValue('--accent-1') || '#1f77b4', getComputedStyle(document.documentElement).getPropertyValue('--accent-2') || '#ff7f0e', getComputedStyle(document.documentElement).getPropertyValue('--accent-3') || '#2ca02c', getComputedStyle(document.documentElement).getPropertyValue('--accent-4') || '#d62728'];

    const traceCode = { x: dates, y: nonTestLoc, name: 'Non-test LOC', mode: 'lines', line: { width: 2, color: colorPalette[0] }, yaxis: 'y', hovertemplate: '%{x}<br>Non-test LOC: %{y:,}<extra></extra>' };
    const traceDocs = { x: dates, y: docLoc, name: 'Markdown LOC', mode: 'lines', line: { width: 2, dash: 'dot', color: colorPalette[1] }, yaxis: 'y', hovertemplate: '%{x}<br>Markdown LOC: %{y:,}<extra></extra>' };
    const traceTests = { x: dates, y: tests, name: 'Total test cases', mode: 'lines', line: { width: 2, dash: 'dash', color: colorPalette[2] }, yaxis: 'y2', hovertemplate: '%{x}<br>Total tests: %{y:,}<extra></extra>' };
  const traceMsgAvg = { x: dates, y: msgAvg, name: 'Avg commit msg length (chars, last ' + msgAvgWindow + ')', mode: 'lines', line: { width: 2, dash: 'dashdot', color: colorPalette[3] }, yaxis: 'y3', hovertemplate: '%{x}<br>Avg msg len: %{y:.2f}<extra></extra>' };

    const layout = {
      title: { text: ${JSON.stringify(title)}, x: 0.02, xanchor: 'left' },
      xaxis: { title: 'Commit date', type: 'date', showgrid: false },
      yaxis: { title: 'LOC (non-test & markdown)', rangemode: 'tozero', gridcolor: 'rgba(0,0,0,0.05)' },
      yaxis2: { title: 'Total test cases', overlaying: 'y', side: 'right', position: 1.0, rangemode: 'tozero' },
      yaxis3: { title: 'Avg commit msg length (chars)', overlaying: 'y', side: 'right', position: 0.92, rangemode: 'tozero' },
      legend: { orientation: 'h', x: 0.02, y: 1.12 },
      margin: { l: 60, r: 80, t: 70, b: 60 },
      hovermode: 'x unified'
    };

    const config = { responsive: true, displaylogo: false, modeBarButtonsToAdd: ['toImage'], toImageButtonOptions: {format: 'png', filename: '${escapeHtml(repoLabel)}-metrics', height: 800, width: 1200} };

    Plotly.newPlot(document.getElementById('plot'), [traceCode, traceDocs, traceTests, traceMsgAvg], layout, config);

    // theme toggle
    const themeBtn = document.getElementById('themeToggle');
    themeBtn.addEventListener('click', () => {
      const el = document.documentElement;
      const next = el.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      el.setAttribute('data-theme', next);
    });

    // export image button
    document.getElementById('imgExport').addEventListener('click', () => {
      Plotly.toImage(document.getElementById('plot'), {format: 'png', height: 800, width: 1200}).then(function(url){
        const a = document.createElement('a'); a.href = url; a.download = '${escapeHtml(repoLabel)}-metrics.png'; document.body.appendChild(a); a.click(); a.remove();
      });
    });
  </script>
</body>
</html>`;

  fs.writeFileSync(outPath, html, 'utf8');
}
