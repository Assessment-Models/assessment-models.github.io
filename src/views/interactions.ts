/**
 * Inter-Model Interactions & GitHub Actions CI Explorer (#/interactions).
 *
 * Showcases existing touchpoints and handshakes from data/ecosystem-registry.json
 * alongside the 3-level GitHub Actions CI architecture and a future-model
 * onboarding simulator (maturity-model-template -> repository_dispatch -> registry sync).
 */
import { h, repoUrl } from '../ui/dom';
import { personaViewportBanner } from './shared';

interface EcoArtifact {
  id: string;
  name: string;
  full_name: string;
  owner_type?: string;
  layer: string;
  version: string;
  conformance_status: string;
  has_manifest: boolean;
  html_url: string;
  dimensions?: string[];
}

interface EcoLink {
  id: string;
  label: string;
  kind: 'touchpoint' | 'handshake';
  from_station_id: string;
  to_station_id: string;
  line_id: string;
  direction?: string;
  contract_summary: string;
  compatibility: string;
}

interface EcoRegistry {
  generated_at: string;
  content_sha256: string;
  artifacts: EcoArtifact[];
  touchpoints: EcoLink[];
  handshakes: EcoLink[];
}

const CI_LEVELS = [
  {
    id: 'level-1',
    num: '01',
    title: 'Local Model Repository CI',
    workflow: '.github/workflows/local-model-ci.yml',
    scope: 'Inside each maturity-model-* or dea-assessment-* repository',
    trigger: 'Push / Pull Request to main',
    checks: [
      'Validates model.yaml, maturity/scale.yaml, and dimension/criterion YAML syntax',
      'Enforces MECE criterion placement and normalized dimension weight sums',
      'Verifies assessment-manifest.json schema compliance',
    ],
  },
  {
    id: 'level-2',
    num: '02',
    title: 'Contract Conformance CI',
    workflow: '.github/workflows/contract-conformance.yml',
    scope: 'Cross-repo verification against maturity-model-standard & dea-metamodel',
    trigger: 'Pull Request / Reusable workflow call',
    checks: [
      'Resolves standard.yaml coherence against AM-MODEL-REPOSITORY-STANDARD',
      'Checks maturity-scale-contract handshake against pinned dea-metamodel release',
      'Validates touchpoints.yaml reciprocity across peer models (CR-AM-13)',
    ],
  },
  {
    id: 'level-3',
    num: '03',
    title: 'Ecosystem Registry Sync & Dispatch',
    workflow: '.github/workflows/sync-catalog.yml + deploy.yml',
    scope: 'Org-wide synchronization into assessment-models.github.io',
    trigger: 'repository_dispatch [model-released, manifest-updated] · 6h schedule',
    checks: [
      'sync_org_catalog.py discovers all Assessment-Models repos and validates against schema',
      'Updates data/ecosystem-registry.json and triggers workflow_run rebuild',
      'verify-metro-layout.yml & validate-homepage-links.mjs gate Pages deployment',
    ],
  },
];

export async function renderInteractions(root: HTMLElement): Promise<void> {
  const res = await fetch('../data/ecosystem-registry.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Could not load ecosystem-registry.json (HTTP ${res.status})`);
  const registry = (await res.json()) as EcoRegistry;

  const byId = new Map(registry.artifacts.map((a) => [a.id, a]));
  const allLinks: EcoLink[] = [...(registry.touchpoints ?? []), ...(registry.handshakes ?? [])];

  root.append(h('div', { class: 'page-head' },
    h('h1', {}, 'Inter-Model Interactions & GitHub Actions CI'),
    h('p', { class: 'lede' },
      'Navigate how existing maturity models, assessment instruments, and future repositories coordinate via explicit touchpoints, handshake contracts, and automated 3-level GitHub Actions CI.'),
  ));

  root.append(personaViewportBanner('Use this view to trace how changes in one model propagate through CI into the shared ecosystem registry.'));

  // ---------- 1. 3-Level GitHub Actions CI Architecture ----------
  let activeCi = 0;
  const ciSection = h('section', { class: 'panel', style: 'margin-bottom:1.25rem' });
  const ciStage = h('div', { class: 'ci-stage' });
  const ciDetail = h('div', { class: 'ci-detail' });

  function drawCi(): void {
    ciStage.innerHTML = '';
    ciDetail.innerHTML = '';

    CI_LEVELS.forEach((lvl, idx) => {
      const btn = h('button', {
        type: 'button',
        class: `ci-node${idx === activeCi ? ' is-active' : ''}`,
      },
        h('span', { class: 'ci-num mono' }, lvl.num),
        h('span', { class: 'ci-title' }, lvl.title),
        h('span', { class: 'ci-wf mono' }, lvl.workflow),
      );
      btn.addEventListener('click', () => {
        activeCi = idx;
        drawCi();
      });
      ciStage.append(btn);
      if (idx < CI_LEVELS.length - 1) {
        ciStage.append(h('div', { class: 'ci-connector', 'aria-hidden': 'true' },
          h('span', { class: 'ci-pulse-line' }),
          h('span', { class: 'ci-arrow' }, '→'),
        ));
      }
    });

    const cur = CI_LEVELS[activeCi];
    ciDetail.append(
      h('div', { class: 'ci-detail-head' },
        h('h3', {}, `${cur.num}. ${cur.title}`),
        h('span', { class: 'mono dim', style: 'font-size:.78rem' }, cur.trigger),
      ),
      h('p', { class: 'dim', style: 'margin:.35rem 0 .6rem' }, cur.scope),
      h('ul', { class: 'ci-checks' }, ...cur.checks.map((c) => h('li', {}, c))),
    );
  }

  ciSection.append(
    h('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:.5rem;margin-bottom:.8rem' },
      h('h2', { style: 'margin:0' }, 'Three-Level Cross-Repository CI Pipeline'),
      h('a', { class: 'mono', style: 'font-size:.8rem', href: repoUrl('assessment-ci'), target: '_blank', rel: 'noopener' },
        'Assessment-Models/assessment-ci ↗'),
    ),
    ciStage,
    ciDetail,
  );
  drawCi();
  root.append(ciSection);

  // ---------- 2. Existing Inter-Model Touchpoints & Handshakes ----------
  const linksSection = h('section', { class: 'panel', style: 'margin-bottom:1.25rem' });
  let kindFilter: 'all' | 'touchpoint' | 'handshake' = 'all';
  let modelFilter = 'all';

  const filterBar = h('div', { class: 'inter-filter-bar' });
  const kindTabs = h('div', { class: 'seg-control' });
  for (const [val, lbl] of [
    ['all', `All Contracts (${allLinks.length})`],
    ['touchpoint', `Touchpoints (${registry.touchpoints.length})`],
    ['handshake', `Handshakes (${registry.handshakes.length})`],
  ] as const) {
    const b = h('button', { type: 'button', class: `seg-btn${kindFilter === val ? ' is-active' : ''}` }, lbl);
    b.addEventListener('click', () => {
      kindFilter = val;
      kindTabs.querySelectorAll('.seg-btn').forEach((x) => x.classList.remove('is-active'));
      b.classList.add('is-active');
      drawLinks();
    });
    kindTabs.append(b);
  }

  const modelSelect = h('select', { class: 'persona-select', 'aria-label': 'Filter by artifact' },
    h('option', { value: 'all' }, 'All repositories & blueprints'),
    ...registry.artifacts.map((a) => h('option', { value: a.id }, a.name)),
  ) as HTMLSelectElement;
  modelSelect.addEventListener('change', () => {
    modelFilter = modelSelect.value;
    drawLinks();
  });

  filterBar.append(kindTabs, modelSelect);

  const linksGrid = h('div', { class: 'inter-links-grid' });

  function drawLinks(): void {
    linksGrid.innerHTML = '';
    const filtered = allLinks.filter((l) => {
      if (kindFilter !== 'all' && l.kind !== kindFilter) return false;
      if (modelFilter !== 'all' && l.from_station_id !== modelFilter && l.to_station_id !== modelFilter) return false;
      return true;
    });

    if (!filtered.length) {
      linksGrid.append(h('p', { class: 'dim', style: 'padding:1rem 0' }, 'No inter-model contracts match the current filter.'));
      return;
    }

    for (const l of filtered) {
      const fromArt = byId.get(l.from_station_id);
      const toArt = byId.get(l.to_station_id);
      const isHandshake = l.kind === 'handshake';
      const arrow = l.direction === 'bidirectional' ? '↔' : '→';

      linksGrid.append(h('article', { class: 'inter-link-card' },
        h('div', { class: 'inter-link-meta' },
          h('span', { class: `mono inter-kind ${isHandshake ? 'is-hs' : 'is-tp'}` },
            isHandshake ? 'Handshake' : 'Touchpoint'),
          h('span', { class: 'faint', 'aria-hidden': 'true' }, '·'),
          h('span', { class: 'mono faint' }, l.line_id),
          h('span', { class: 'faint', 'aria-hidden': 'true' }, '·'),
          h('span', { class: 'mono faint' }, l.compatibility),
        ),
        h('h3', { style: 'margin:.25rem 0 .35rem;font-size:.98rem' }, l.label),
        h('div', { class: 'inter-endpoints mono' },
          h('a', { href: `#/model/${l.from_station_id}` }, fromArt?.name ?? l.from_station_id),
          h('span', { class: 'inter-arrow' }, ` ${arrow} `),
          toArt?.owner_type === 'partner-ecosystem'
            ? h('a', { href: toArt.html_url, target: '_blank', rel: 'noopener' }, `${toArt.name} ↗`)
            : h('a', { href: `#/model/${l.to_station_id}` }, toArt?.name ?? l.to_station_id),
        ),
        h('p', { class: 'dim', style: 'font-size:.84rem;margin:.45rem 0 0' }, l.contract_summary),
      ));
    }
  }

  linksSection.append(
    h('h2', { style: 'margin:0 0 .35rem' }, 'Existing Model Touchpoints & Handshake Seams'),
    h('p', { class: 'dim', style: 'font-size:.87rem;margin-bottom:.85rem' },
      'Live contracts extracted from ecosystem-registry.json (CR-AM-11 & CR-AM-13 single-owner evidence seams).'),
    filterBar,
    linksGrid,
  );
  drawLinks();
  root.append(linksSection);

  // ---------- 3. Future Model Onboarding & Propagation Simulator ----------
  const simSection = h('section', { class: 'panel' });
  const domainInput = h('input', {
    class: 'search-input',
    style: 'margin:0;max-width:280px',
    type: 'text',
    value: 'ai-governance',
    'aria-label': 'Future domain slug',
    placeholder: 'e.g. cyber-resilience',
  }) as HTMLInputElement;

  const targetSelect = h('select', { class: 'persona-select', 'aria-label': 'Connect to existing model' },
    h('option', { value: 'maturity-model-operations' }, 'Seam with Operations Maturity Model'),
    h('option', { value: 'maturity-model-autonomous-operations' }, 'Seam with Autonomous Operations'),
    h('option', { value: 'maturity-model-digital-transformation' }, 'Roll up into Digital Transformation'),
  ) as HTMLSelectElement;

  const simOut = h('div', { class: 'sim-pipeline' });

  function updateSim(): void {
    const slug = (domainInput.value || 'new-domain')
      .toLowerCase()
      .replace(/[^a-z0-9-]+/g, '-')
      .replace(/^-|-$/g, '') || 'new-domain';
    const repoName = `maturity-model-${slug}`;
    const peerId = targetSelect.value;
    const peerName = byId.get(peerId)?.name ?? peerId;

    simOut.innerHTML = '';
    const steps = [
      {
        step: 'Step 1 · Template Scaffold',
        detail: `Create Assessment-Models/${repoName} from maturity-model-template with model.yaml, maturity/scale.yaml, and assessment-manifest.json.`,
        status: 'Ready',
      },
      {
        step: 'Step 2 · Seam & Contract Declaration',
        detail: `Declare standard.yaml (AM-MODEL-REPOSITORY-STANDARD) and touchpoints.yaml seam referencing ${peerName} plus dea-metamodel scale contract.`,
        status: 'Validated by Level 2 CI',
      },
      {
        step: 'Step 3 · Repository Dispatch',
        detail: `Tag release v1.0.0 → fires repository_dispatch (model-released) to assessment-models.github.io/sync-catalog.yml.`,
        status: 'Automated',
      },
      {
        step: 'Step 4 · Registry & Gateway Live',
        detail: `sync_org_catalog.py appends ${repoName} to data/ecosystem-registry.json; deploy.yml rebuilds Metro Map, Catalog, and Conformance Dashboard.`,
        status: 'Zero manual edits',
      },
    ];

    for (const s of steps) {
      simOut.append(h('div', { class: 'sim-step' },
        h('div', { style: 'display:flex;justify-content:space-between;gap:.5rem;align-items:baseline' },
          h('strong', { style: 'font-size:.9rem' }, s.step),
          h('span', { class: 'mono', style: 'font-size:.74rem;color:var(--good)' }, s.status),
        ),
        h('p', { class: 'dim', style: 'font-size:.84rem;margin:.3rem 0 0' }, s.detail),
      ));
    }
  }

  domainInput.addEventListener('input', updateSim);
  targetSelect.addEventListener('change', updateSim);
  updateSim();

  simSection.append(
    h('h2', { style: 'margin:0 0 .35rem' }, 'Future Model Onboarding & CI Propagation'),
    h('p', { class: 'dim', style: 'font-size:.87rem;margin-bottom:.85rem' },
      'Preview how a future domain repository instantiated from maturity-model-template integrates automatically into the ecosystem via GitHub Actions.'),
    h('div', { style: 'display:flex;gap:.75rem;flex-wrap:wrap;align-items:center;margin-bottom:1rem' },
      h('label', { class: 'mono dim', style: 'font-size:.78rem' }, 'New domain slug:'),
      domainInput,
      targetSelect,
      h('a', { class: 'btn small', href: repoUrl('maturity-model-template'), target: '_blank', rel: 'noopener' }, 'Open template repo ↗'),
    ),
    simOut,
  );
  root.append(simSection);
}
