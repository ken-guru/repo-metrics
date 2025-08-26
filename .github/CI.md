# CI and Publishing

This repository includes an optional GitHub Actions workflow that dogfoods the generator by running it on the repository itself and producing artifacts.

What's run by default (push to `main`)

- Install dependencies (`npm ci`)
- Run tests (`npm test`)
- Build (`npm run build`)
- Generate metrics artifacts and upload them as a workflow artifact (no publishing to GitHub Pages by default)
- Create a release (pushes only) and attach `metrics/index.html` and `metrics/metrics.csv` as release assets (if release creation succeeds)

Publishing
----------

This repository is public and the workflow publishes automatically on pushes to the `main` branch. The `publish-pages` job runs after the `build-and-package` job completes and deploys the generated `public/` directory using GitHub's official Pages actions.

Permissions to check
--------------------

Ensure repository Actions permissions allow Pages deployments. Check repository Settings → Actions → General and confirm:

- "Allow all actions" or allow the specific Pages actions used (`configure-pages`, `upload-pages-artifact`, `deploy-pages`).
- Workflow permissions allow the `GITHUB_TOKEN` to access repository contents for publishing (Read & write).

Optional: supply a Personal Access Token (GH_PAT)
---------------------------------------------

If you prefer to use an explicit PAT for release/comment/upload operations, add a `GH_PAT` secret (PAT with `repo` scope). The workflow will use `GH_PAT` when present; otherwise it uses the built-in `GITHUB_TOKEN`.

1. Create a PAT: https://github.com/settings/tokens (give it `repo` scope).
2. Go to the repository → Settings → Secrets & variables → Actions → New repository secret
3. Name: `GH_PAT` and paste the token value.

Downloading artifacts

- After the default push job completes, artifacts can be downloaded from the workflow run's "Artifacts" section.
- The artifacts are in a `metrics/` folder containing `index.html` and `metrics.csv`.

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