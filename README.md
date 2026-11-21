# Assessment Models — Site & Gateway

The GitHub Pages site for the [Assessment-Models](https://github.com/Assessment-Models) ecosystem — https://assessment-models.github.io

Two entries, one Vite build:

- **`/` — the site homepage** (`index.html`): the organization's marketing front page — pillars, governance matrix, and the repositories & tooling catalog — in the corporate blueprint design language (alabaster canvas, hairline cards, Inter/JetBrains Mono, corporate navy & indigo accents).
- **`/gateway/` — the Assessment Gateway** (`gateway/index.html`): an application, not documentation. Explore the model constellation, drill into any model's structure (dimensions → sub-dimensions → criteria → level anchors), run trial assessments with cascade scoring, and generate shareable reports — **all client-side, no backend**. The gateway now shares the homepage's design ethos (light corporate theme; the 3D constellation stage deliberately stays dark, echoing the homepage's code panels). Hash routes are unchanged, now served under `/gateway/#/…`.

## How it works

- **Data-driven, never duplicated**: the constellation manifest (`models.json`) is generated at build time from the machine-readable sources of truth — [`assessment-registry`](https://github.com/Assessment-Models/assessment-registry) registration records and the [`maturity-model-standard`](https://github.com/Assessment-Models/maturity-model-standard) portfolio conformance registry.
- **Live model structures**: drill-downs and trials fetch `model.yaml` / `maturity/**/*.yaml` from `raw.githubusercontent.com` at runtime, with a build-time snapshot as offline fallback.
- **Scoring engine** (`src/scoring/engine.ts`): implements the evaluation contracts declared in each model's `evaluation.yaml` — e.g. for the operationalized line: `overall = Σ(dim × weight)`, `dim = mean(subdims)`, `subdim = mean(criteria 1–5 → 0–100)`, banded to L-0..L-4 by highest-conformant-level with the mandatory-dimension gate. Verified against the worked example shipped in `maturity-model-digital-transformation/examples/operationalized-2026.yaml` (67.20 → L-2).

## Development

```bash
npm install
npm run dev        # generate indexes + vite dev server
npm test           # scoring engine fixture tests
npm run build      # generate indexes + production build into dist/
npm run preview    # serve the production build
```

The index generator reads sibling clones by default (`../assessment-registry`, `../maturity-model-standard`, `../maturity-model-digital-transformation`); override with `--registry/--standard/--models` (the deploy workflow checks out those repos into `sources/`).

## Deployment

`push` to `main`, manual dispatch, and a weekly cron trigger the deploy workflow (`.github/workflows/deploy.yml`): sources are checked out, indexes regenerated, the site built and published via GitHub Actions → Pages.

## Repository hygiene

**This repository is public. Never commit local tooling scratch to it** — external authoring-tool artifacts (`.aistudio/`, `.tempmediaStorage/`), alternate lockfiles (`bun.lock`, `pnpm-lock.yaml`, `yarn.lock`), editor and language-runtime scratch, credential-bearing files (`.env*`), patch residue, or CI scratch logs.

Two mechanisms enforce this:

- `.gitignore` lists every such path, so an ordinary `git add` refuses them.
- `scripts/verify-no-local-residue.mjs` (run in CI by `verify-no-local-residue.yml`) checks the **tracked tree** against the same list, and fails if `.gitignore` has lost any of the rules.

The second mechanism exists because an archive extracted over this repository root can carry its own `.gitignore` and overwrite the repository's, silently dropping every ignore rule — at which point the residue becomes committable again. The tracked-tree check holds regardless of what `.gitignore` currently says.

When you extract an archive here, keep the repository's `.gitignore` and exclude the scratch paths; do not let the archive's copy replace it.

## Stack

Vite + TypeScript, no framework. SVG constellation, Chart.js reports, js-yaml for client-side YAML. Blueprint: see the gateway overview document in the org's planning materials.
