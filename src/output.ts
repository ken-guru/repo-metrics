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

  const html = `<!doctype html>\n<html>\n<head>\n  <meta charset="utf-8"/>\n  <title>${escapeHtml(title)}</title>\n  <meta name="viewport" content="width=device-width, initial-scale=1"/>\n  <style>html, body { margin: 0; padding: 0; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; } #plot { width: 100%; height: 100vh; }</style>\n</head>\n<body>\n<div id="plot"></div>\n<script src="${resolvedPlotlySrc}"></script>\n<script>\n  const dates = ${JSON.stringify(dates)};\n  const nonTestLoc = ${JSON.stringify(nonTestLoc)};\n  const docLoc = ${JSON.stringify(docLoc)};\n  const tests = ${JSON.stringify(tests)};\n  const msgAvg = ${JSON.stringify(msgAvg)};\n  const msgAvgWindow = ${JSON.stringify(msgAvgWindow)};\n\n  const traceCode = { x: dates, y: nonTestLoc, name: 'Non-test LOC', mode: 'lines', line: { width: 2 }, yaxis: 'y' };\n  const traceDocs = { x: dates, y: docLoc, name: 'Markdown LOC', mode: 'lines', line: { width: 2, dash: 'dot' }, yaxis: 'y' };\n  const traceTests = { x: dates, y: tests, name: 'Total test cases', mode: 'lines', line: { width: 2, dash: 'dash' }, yaxis: 'y2' };\n  const traceMsgAvg = { x: dates, y: msgAvg, name: 'Avg commit msg length (chars, last ' + msgAvgWindow + ')', mode: 'lines', line: { width: 2, dash: 'longdashdot' }, yaxis: 'y3' };\n\n  const layout = { title: { text: ${JSON.stringify(title)}, x: 0.02, xanchor: 'left' }, xaxis: { title: 'Commit date', type: 'date' }, yaxis:  { title: 'LOC (non-test & markdown)', rangemode: 'tozero' }, yaxis2: { title: 'Total test cases', overlaying: 'y', side: 'right', position: 1.0, rangemode: 'tozero' }, yaxis3: { title: 'Avg commit msg length (chars)', overlaying: 'y', side: 'right', position: 0.96, rangemode: 'tozero' }, legend: { orientation: 'h', x: 0.02, y: 1.12 }, margin: { l: 60, r: 80, t: 90, b: 60 } };\n\n  Plotly.newPlot(document.getElementById('plot'), [traceCode, traceDocs, traceTests, traceMsgAvg], layout, { displaylogo: false, responsive: true });\n</script>\n</body>\n</html>`;

  fs.writeFileSync(outPath, html, 'utf8');
}
