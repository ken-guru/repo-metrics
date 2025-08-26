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
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
  <style>
    /* TailAdmin-inspired palette */
    :root{--bg:#f8fafc;--card:#ffffff;--fg:#0f1724;--muted:#64748b;--accent-1:#2563eb;--accent-2:#7c3aed;--accent-3:#06b6d4;--glass:rgba(255,255,255,0.6)}
    [data-theme="dark"]{--bg:#071124;--card:#071825;--fg:#e6eef8;--muted:#9aa7b2;--glass:rgba(10,18,30,0.6)}
    html,body{height:100%;margin:0;background:linear-gradient(180deg,var(--bg),#ffffff);color:var(--fg);font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Arial}
    .topbar{display:flex;align-items:center;justify-content:space-between;padding:14px 20px;backdrop-filter:blur(6px);background:linear-gradient(90deg,rgba(255,255,255,0.6),transparent);box-shadow:0 2px 12px rgba(2,6,23,0.06)}
    .brand{font-weight:700;font-size:16px}
    .meta{font-size:13px;color:var(--muted);margin-top:4px}
    .main{display:grid;grid-template-columns:280px 1fr;gap:18px;padding:18px;align-items:start}
    .panel{background:var(--card);border-radius:12px;padding:14px;box-shadow:0 8px 24px rgba(2,6,23,0.06)}
    .controls{display:flex;flex-direction:column;gap:12px}
    .row{display:flex;gap:8px;align-items:center}
    .btn{padding:8px 12px;border-radius:10px;font-size:13px;color:var(--fg);cursor:pointer;border:0}
    .btn-ghost{background:transparent;border:1px solid rgba(15,23,36,0.06);color:var(--fg)}
    .btn-primary{background:var(--accent-1);color:#fff;box-shadow:0 6px 18px rgba(37,99,235,0.12)}
    .small{font-size:12px;color:var(--muted)}
    #plot{width:100%;height:66vh;border-radius:8px}
    .cards{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:12px}
    .stat{padding:12px;border-radius:10px;background:linear-gradient(180deg,var(--glass),transparent);}
    .stat h3{margin:0;font-size:14px}
    .stat p{margin:6px 0 0;font-weight:700;font-size:18px}
    .legend{display:flex;flex-wrap:wrap;gap:8px}
    .legend label{display:inline-flex;align-items:center;gap:8px;padding:6px 8px;border-radius:8px;background:rgba(0,0,0,0.02);cursor:pointer}
    input[type=range]{width:100%}
    @media (max-width:920px){.main{grid-template-columns:1fr;}.cards{grid-template-columns:repeat(2,1fr)}}
  </style>
  <style>
    /* Fullscreen modal for expanded chart */
    .modal-overlay{position:fixed;inset:0;background:rgba(2,6,23,0.6);display:none;align-items:center;justify-content:center;z-index:1000}
    .modal-overlay.open{display:flex}
    .modal{width:90%;height:90%;background:var(--card);border-radius:12px;padding:12px;box-shadow:0 30px 80px rgba(2,6,23,0.6);display:flex;flex-direction:column}
    .modal .modal-header{display:flex;justify-content:space-between;align-items:center;padding-bottom:8px}
    .modal .modal-body{flex:1}
    .modal .close{background:transparent;border:0;font-size:16px;cursor:pointer}
  </style>
</head>
<body data-theme="light">
  <div class="topbar">
    <div>
      <div class="brand">Repo metrics</div>
      <div class="meta">${escapeHtml(repoLabel)} — <code style="font-family:monospace">${escapeHtml(rev)}</code></div>
    </div>
    <div class="row">
      <button id="themeToggle" class="btn btn-ghost small">Toggle</button>
      <button id="imgExport" class="btn btn-ghost small">Export</button>
      <a id="csvDownload" class="btn btn-ghost small" href="#">CSV</a>
    </div>
  </div>

  <div class="main">
    <aside class="panel">
      <div class="controls">
        <div class="cards">
          <div class="stat">
            <h3>Commits</h3>
            <p id="statCommits">—</p>
          </div>
          <div class="stat">
            <h3>Range</h3>
            <p id="statRange">—</p>
          </div>
          <div class="stat">
            <h3>Non-test LOC</h3>
            <p id="statCode">—</p>
          </div>
        </div>

        <div class="small">Series</div>
        <div class="legend" id="seriesToggles">
          <label><input type="checkbox" data-series="code" checked/> Non-test LOC</label>
          <label><input type="checkbox" data-series="docs" checked/> Markdown LOC</label>
          <label><input type="checkbox" data-series="tests" checked/> Test cases</label>
          <label><input type="checkbox" data-series="msgAvg" checked/> Avg msg len</label>
        </div>

        <div class="small">Filter by date</div>
        <div>
          <input id="dateStart" type="date" class="row" />
          <input id="dateEnd" type="date" class="row" />
          <button id="applyFilter" class="btn">Apply</button>
          <button id="resetFilter" class="btn">Reset</button>
        </div>

        <div class="small">Hints</div>
        <div class="small">Hover to inspect points. Use the series toggles to focus. Theme persists across reloads.</div>
      </div>
    </aside>

    <section>
      <div class="panel">
        <div style="display:flex;gap:12px;margin-bottom:12px;align-items:center;justify-content:space-between">
          <div>
            <strong style="font-size:16px">${escapeHtml(repoLabel)}</strong>
            <div class="small">${escapeHtml(title)}</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <div class="small">Avg window: ${msgAvgWindow}</div>
            <button id="exportMain" class="btn btn-primary small">Main</button>
            <button id="exportTests" class="btn btn-ghost small">Tests</button>
            <button id="exportMsg" class="btn btn-ghost small">Msg</button>
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 320px;gap:12px">
          <div id="plot-main" style="min-height:420px;border-radius:8px;position:relative">
            <button id="expandMain" class="btn btn-ghost" style="position:absolute;right:8px;top:8px">⤢</button>
          </div>
          <div style="display:flex;flex-direction:column;gap:12px">
            <div class="panel" style="padding:8px;min-height:180px">
              <div class="small">Tests over time</div>
              <div id="plot-tests" style="height:160px;position:relative">
                <button id="expandTests" class="btn btn-ghost" style="position:absolute;right:8px;top:6px">⤢</button>
              </div>
            </div>
            <div class="panel" style="padding:8px;min-height:180px">
              <div class="small">Avg commit msg length</div>
              <div id="plot-msg" style="height:160px;position:relative">
                <button id="expandMsg" class="btn btn-ghost" style="position:absolute;right:8px;top:6px">⤢</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>

  <!-- Modal overlay for expanded chart -->
  <div id="modalOverlay" class="modal-overlay" aria-hidden="true">
    <div class="modal" role="dialog" aria-modal="true">
      <div class="modal-header">
        <div id="modalTitle" class="small">Expanded chart</div>
        <div>
          <button id="modalExport" class="btn btn-primary small">Export</button>
          <button id="modalClose" class="close">✕</button>
        </div>
      </div>
      <div class="modal-body"><div id="modalPlot" style="width:100%;height:100%"></div></div>
    </div>
  </div>

  <script src="${resolvedPlotlySrc}"></script>
  <script>
    const raw = {
      dates: ${JSON.stringify(dates)},
      nonTestLoc: ${JSON.stringify(nonTestLoc)},
      docLoc: ${JSON.stringify(docLoc)},
      tests: ${JSON.stringify(tests)},
      msgAvg: ${JSON.stringify(msgAvg)}
    };

    function computeSummary(d){
      const commits = d.dates.length;
      const first = commits ? d.dates[0] : '—';
      const last = commits ? d.dates[d.dates.length-1] : '—';
      const totalCode = d.nonTestLoc.reduce((s,v)=>s+v,0);
      return { commits, first, last, totalCode };
    }

    function makeCsv(d){
      const header = ['timestamp_utc','non_test_loc','total_tests','doc_loc'].join(',') + '\n';
      const lines = d.dates.map((dt,i)=>[dt, d.nonTestLoc[i], d.tests[i], d.docLoc[i]].map(v=>String(v).includes(',')? '"'+String(v).replace(/"/g,'""')+'"': String(v)).join(','));
      return header + lines.join('\n');
    }

    function updateCsvLink(){
      const csv = makeCsv(filtered);
      const blob = new Blob([csv], {type:'text/csv'});
      const url = URL.createObjectURL(blob);
      const a = document.getElementById('csvDownload');
      a.href = url; a.download = '${escapeHtml(repoLabel)}-metrics.csv';
    }

    // filtering state
    let filtered = Object.assign({}, raw);

    function applyDateFilter(start, end){
      if(!start && !end){ filtered = Object.assign({}, raw); return; }
      const s = start ? new Date(start) : null;
      const e = end ? new Date(end) : null;
      const out = { dates:[], nonTestLoc:[], docLoc:[], tests:[], msgAvg:[] };
      for(let i=0;i<raw.dates.length;i++){
        const dt = new Date(raw.dates[i]);
        if(s && dt < s) continue;
        if(e && dt > e) continue;
        out.dates.push(raw.dates[i]); out.nonTestLoc.push(raw.nonTestLoc[i]); out.docLoc.push(raw.docLoc[i]); out.tests.push(raw.tests[i]); out.msgAvg.push(raw.msgAvg[i]);
      }
      filtered = out;
    }

    function renderSummary(){
      const s = computeSummary(filtered);
      document.getElementById('statCommits').textContent = String(s.commits);
      document.getElementById('statRange').textContent = s.first + ' - ' + s.last;
      document.getElementById('statCode').textContent = s.totalCode.toLocaleString();
    }

    // create traces and plot (split into three focused plots)
    function buildMainLayout(){
      return {
        title:{ text: ${JSON.stringify(title)}, x:0 },
        xaxis:{title:'Commit date', type:'date', showgrid:false},
        yaxis:{title:'LOC', rangemode:'tozero'},
        margin:{l:60,r:20,t:80,b:60},
        hovermode:'x unified'
      };
    }

    function buildSideLayout(){
      return {margin:{l:40,r:20,t:30,b:30},xaxis:{showgrid:false,visible:false},yaxis:{showgrid:false}};
    }

    const config = { responsive:true, displaylogo:false, modeBarButtonsToAdd:['toImage'], toImageButtonOptions:{format:'png',filename:'${escapeHtml(repoLabel)}-metrics',height:600,width:1000} };

    // series state controlled by checkboxes
    const seriesState = { code:true, docs:true, tests:true, msgAvg:true };

    function plot(){
      // main: code + docs
      const palette = [getComputedStyle(document.documentElement).getPropertyValue('--accent-1') || '#0ea5e9', getComputedStyle(document.documentElement).getPropertyValue('--accent-2') || '#7c3aed'];
      const mainTraces = buildMainTraces(palette);
      Plotly.react(document.getElementById('plot-main'), mainTraces, buildMainLayout(), config);

      // tests sparkline
      const testsTrace = [{ x: filtered.dates, y: filtered.tests, mode:'lines', line:{color:getComputedStyle(document.documentElement).getPropertyValue('--accent-3')||'#06b6d4',width:2}, hoverinfo:'y', fill:'tozeroy' }];
      Plotly.react(document.getElementById('plot-tests'), testsTrace, buildSideLayout(), config);

      // msg avg sparkline
      const msgTrace = [{ x: filtered.dates, y: filtered.msgAvg, mode:'lines', line:{color:'#ef4444',width:2}, hoverinfo:'y' }];
      Plotly.react(document.getElementById('plot-msg'), msgTrace, buildSideLayout(), config);

      updateCsvLink();
      renderSummary();
    }

    function buildMainTraces(palette){
      const t = [];
      if(seriesState.code) t.push({ x: filtered.dates, y: filtered.nonTestLoc, name:'Non-test LOC', mode:'lines', line:{color:palette[0],width:2}, hovertemplate:'%{x}<br>Non-test LOC: %{y:,}<extra></extra>' });
      if(seriesState.docs) t.push({ x: filtered.dates, y: filtered.docLoc, name:'Markdown LOC', mode:'lines', line:{color:palette[1],width:2,dash:'dot'}, hovertemplate:'%{x}<br>Markdown LOC: %{y:,}<extra></extra>' });
      return t;
    }

    // initialize inputs
    (function init(){
      // theme
      const saved = localStorage.getItem('repoMetrics:theme');
      if(saved) document.documentElement.setAttribute('data-theme', saved);
      document.getElementById('themeToggle').addEventListener('click', ()=>{
        const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
        const next = cur === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem('repoMetrics:theme', next);
      });

      // series toggles
      document.querySelectorAll('#seriesToggles input[type=checkbox]').forEach(el=>{
        el.addEventListener('change', (ev)=>{
          const s = el.getAttribute('data-series'); seriesState[s] = el.checked;
          plot();
        });
      });

      // date inputs
      const ds = document.getElementById('dateStart');
      const de = document.getElementById('dateEnd');
      if(raw.dates.length){ ds.value = raw.dates[0].slice(0,10); de.value = raw.dates[raw.dates.length-1].slice(0,10); }
      document.getElementById('applyFilter').addEventListener('click', ()=>{ applyDateFilter(ds.value, de.value); plot(); });
      document.getElementById('resetFilter').addEventListener('click', ()=>{ ds.value=''; de.value=''; filtered = Object.assign({}, raw); plot(); });

      // export and csv
      document.getElementById('imgExport')?.addEventListener('click', ()=>{
        Plotly.toImage(document.getElementById('plot-main'), {format:'png',height:800,width:1200}).then(url=>{ const a=document.createElement('a'); a.href=url; a.download='${escapeHtml(repoLabel)}-metrics.png'; document.body.appendChild(a); a.click(); a.remove(); });
      });

      document.getElementById('exportMain')?.addEventListener('click', ()=>{
        Plotly.toImage(document.getElementById('plot-main'), {format:'png',height:800,width:1200}).then(url=>{ const a=document.createElement('a'); a.href=url; a.download='${escapeHtml(repoLabel)}-main.png'; document.body.appendChild(a); a.click(); a.remove(); });
      });
      document.getElementById('exportTests')?.addEventListener('click', ()=>{
        Plotly.toImage(document.getElementById('plot-tests'), {format:'png',height:400,width:800}).then(url=>{ const a=document.createElement('a'); a.href=url; a.download='${escapeHtml(repoLabel)}-tests.png'; document.body.appendChild(a); a.click(); a.remove(); });
      });
      document.getElementById('exportMsg')?.addEventListener('click', ()=>{
        Plotly.toImage(document.getElementById('plot-msg'), {format:'png',height:400,width:800}).then(url=>{ const a=document.createElement('a'); a.href=url; a.download='${escapeHtml(repoLabel)}-msg.png'; document.body.appendChild(a); a.click(); a.remove(); });
      });

      // expand modal handlers
      function openModal(title, sourceEl){
        const overlay = document.getElementById('modalOverlay');
        const titleEl = document.getElementById('modalTitle');
        const modalPlot = document.getElementById('modalPlot');
        if(!overlay || !titleEl || !modalPlot) return;
        titleEl.textContent = title;
        overlay.classList.add('open');
        overlay.setAttribute('aria-hidden', 'false');
        // re-render the same trace(s) into modalPlot
        try{
          // find which plot to copy by id
          if(sourceEl === 'main'){
            Plotly.react(modalPlot, mainTracesForModal(), buildMainLayout(), config);
          } else if(sourceEl === 'tests'){
            Plotly.react(modalPlot, [{ x: filtered.dates, y: filtered.tests, mode:'lines', line:{color:getComputedStyle(document.documentElement).getPropertyValue('--accent-3')||'#06b6d4',width:2}, fill:'tozeroy' }], {margin:{l:60,r:60,t:60,b:60}}, config);
          } else if(sourceEl === 'msg'){
            Plotly.react(modalPlot, [{ x: filtered.dates, y: filtered.msgAvg, mode:'lines', line:{color:'#ef4444',width:2} }], {margin:{l:60,r:60,t:60,b:60}}, config);
          }
        }catch(e){ /* ignore */ }
      }

      function closeModal(){
        const overlay = document.getElementById('modalOverlay');
        if(!overlay) return; overlay.classList.remove('open'); overlay.setAttribute('aria-hidden', 'true');
      }

      document.getElementById('expandMain')?.addEventListener('click', ()=> openModal('Non-test & Markdown LOC', 'main'));
      document.getElementById('expandTests')?.addEventListener('click', ()=> openModal('Test cases over time', 'tests'));
      document.getElementById('expandMsg')?.addEventListener('click', ()=> openModal('Avg commit msg length', 'msg'));

      document.getElementById('modalClose')?.addEventListener('click', ()=> closeModal());
      document.getElementById('modalOverlay')?.addEventListener('click', (e)=>{ if(e.target === document.getElementById('modalOverlay')) closeModal(); });
      document.addEventListener('keydown', (e)=>{ if(e.key === 'Escape') closeModal(); });

      document.getElementById('modalExport')?.addEventListener('click', ()=>{
        const modalPlot = document.getElementById('modalPlot'); if(!modalPlot) return;
        Plotly.toImage(modalPlot, {format:'png',height:900,width:1400}).then(url=>{ const a=document.createElement('a'); a.href=url; a.download='${escapeHtml(repoLabel)}-expanded.png'; document.body.appendChild(a); a.click(); a.remove(); });
      });

      // initial render
      plot();
    })();

  </script>
</body>
</html>`;

  fs.writeFileSync(outPath, html, 'utf8');
}
