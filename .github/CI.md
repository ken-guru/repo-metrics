# CI and Publishing

This repository provides a small CLI generator (see `src/`) that produces metrics artifacts (an HTML file and a CSV). There is no built-in publishing workflow in this repository — publishing to GitHub Pages is handled by configuring Pages in the repository settings.

Typical actions you might run (locally or in your own workflow):

- Install dependencies (`npm ci`)
- Run tests (`npm test`)
- Build (`npm run build`)
- Generate metrics artifacts (HTML + CSV) using the CLI
- Optionally attach artifacts to a release or upload them from your own CI workflow

Publishing
----------

Publishing the generated artifacts to GitHub Pages is configured through the repository's Pages settings (Settings → Pages). Because this repository no longer contains an automatic publishing workflow, enable Pages and point it to the branch/folder you want to serve (for example, `gh-pages` branch or the repository root of a `docs/` folder) via the repository's UI.

Permissions to check
--------------------

- Ensure Pages is enabled in Settings → Pages and that the chosen source (branch/folder) is correct.
- If you use an Actions-based workflow you create yourself to build and deploy, make sure repository Actions permissions allow the `GITHUB_TOKEN` to write (Read & write) or supply a `GH_PAT` secret with `repo` scope.

Note on CI tokens
-----------------

This repository does not include any built-in publishing workflows that require repository tokens. If you create your own CI workflow that needs to perform privileged operations (create releases, upload assets, or deploy), you will need to follow GitHub's documentation for storing and using secrets; we intentionally leave token guidance to your CI's documentation rather than embedding PAT examples here.

Downloading artifacts

- If you run the generator in CI, uploaded artifacts are available from the workflow run's "Artifacts" section.
- Otherwise run the generator locally (or in your own CI) to produce the `metrics/` files described below.

Local testing

```bash
npm ci
npm run build
node dist/repo-metrics.js . --output-prefix artifacts/metrics --max-commits 2000 --verbose
mkdir -p artifacts/metrics
mv artifacts_metrics.html artifacts/metrics/index.html
mv artifacts_metrics.csv artifacts/metrics/metrics.csv
```

Troubleshooting

- If create-release fails with "Resource not accessible by integration", ensure:
  - Workflow permissions (Settings → Actions → General) allow "Read and write permissions" for the `GITHUB_TOKEN`, or
  - You have added a `GH_PAT` secret with `repo` scope and re-run the workflow.

Contact

If you want me to change the naming convention, or attach the artifacts to comments/PRs, say so and I'll add those steps to the workflow.