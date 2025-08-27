---
layout: default
title: repo-metrics — Examples & Docs
---

<div class="container">
  <div class="header">
    <div>
      <div class="brand">repo-metrics</div>
      <div class="lead">A tiny CLI to generate metrics (CSV + single-file Plotly HTML).</div>
    </div>
    <div>
      <a href="https://github.com/ken-guru/repo-metrics" target="_blank" style="color:inherit;text-decoration:none">View on GitHub</a>
    </div>
  </div>

  <div class="card">
    <h2>Quick start</h2>
    <p>Generate artifacts locally:</p>
    <pre>npm ci
npm run build
node dist/repo-metrics.js /path/to/repo --output-prefix metrics --max-commits 2000</pre>
    <p>Find generated files at <code>metrics.html</code> and <code>metrics.csv</code>.</p>
  </div>

  <div class="card">
    <h2>Examples</h2>
    <div class="examples-grid">
      <div class="example card">
        <h3>Sample metrics HTML</h3>
        <p class="lead">A small exported Plotly HTML showing the typical visualization.</p>
        <p><a href="examples/sample_metrics.html">Open example</a></p>
      </div>
      <div class="example card">
        <h3>Sample CSV</h3>
        <p class="lead">A tiny CSV demonstrating the output shape.</p>
        <p><a href="examples/sample_metrics.csv" download>Download CSV</a></p>
      </div>
    </div>
  </div>

  <div class="footer">This site is generated from the repository root's <code>docs/</code> folder; configure GitHub Pages to serve from <strong>Main branch / docs folder</strong>.</div>
</div>
