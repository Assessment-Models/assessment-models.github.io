# Assessment-Models Gateway

The interactive GitHub Pages gateway for the [Assessment-Models](https://github.com/Assessment-Models) ecosystem — https://assessment-models.github.io

An application, not a documentation site: explore the model constellation, drill into any model's structure (dimensions → sub-dimensions → criteria → level anchors), run trial assessments with cascade scoring, and generate shareable reports — **all client-side, no backend**.

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

## Stack

Vite + TypeScript, no framework. SVG constellation, Chart.js reports, js-yaml for client-side YAML. Blueprint: see the gateway overview document in the org's planning materials.
