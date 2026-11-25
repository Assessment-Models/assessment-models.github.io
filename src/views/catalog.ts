/** Model catalog - searchable, role-aware catalog of maturity models, EA instruments, and capability repos. */
import { fetchManifest } from '../data/loader';
import { groupLabel, h, repoUrl } from '../ui/dom';
import { personaViewportBanner } from './shared';
import type { IndexNode } from '../types';

type CatalogTab = 'all' | 'maturity' | 'instruments' | 'catalogs';

function isScorableModel(node: IndexNode): boolean {
  if (!node.repo) return false;
  if (node.id === 'maturity-model-standard' || node.id === 'maturity-model-template') return false;
  if (node.id === 'dea-catalog-maturity-models' || node.id === 'dea-catalog-assessment-tools' || node.id === 'maturity') {
    return false;
  }
  return node.group === 'maturity-models' || node.group === 'assessment-models';
}

function categoryOf(node: IndexNode): Exclude<CatalogTab, 'all'> {
  if (
    node.id === 'dea-catalog-maturity-models' ||
    node.id === 'dea-catalog-assessment-tools' ||
    node.id === 'maturity' ||
    node.group === 'components' ||
    node.group === 'assessment-tools'
  ) {
    return 'catalogs';
  }
  if (node.group === 'assessment-models') return 'instruments';
  return 'maturity';
}

export async function renderCatalog(root: HTMLElement): Promise<void> {
  const manifest = await fetchManifest();
  const catalogNodes = manifest.nodes.filter((n) =>
    ['maturity-models', 'assessment-models', 'assessment-tools', 'components'].includes(n.group),
  );

  root.append(h('div', { class: 'page-head' },
    h('h1', {}, 'Model & Instrument Catalog'),
    h('p', { class: 'lede' },
      'Explore governed maturity models, OpenDEA assessment instruments, and reusable capability repositories. Select any scorable asset to inspect its YAML structure or run a client-side trial assessment.'),
  ));

  root.append(personaViewportBanner('Filter by architectural line or launch a browser-local L-1..L-5 trial directly below.'));

  let activeTab: CatalogTab = 'all';
  let query = '';

  const controls = h('div', { class: 'catalog-controls-bar' });
  const seg = h('div', { class: 'seg-control', role: 'tablist', 'aria-label': 'Filter catalog category' });
  const search = h('input', {
    class: 'search-input',
    style: 'margin:0;max-width:300px',
    type: 'search',
    placeholder: 'Filter models, domains, contracts…',
    'aria-label': 'Filter catalog models',
  }) as HTMLInputElement;

  const tabsMeta: { id: CatalogTab; label: string }[] = [
    { id: 'all', label: `All Assets (${catalogNodes.length})` },
    { id: 'maturity', label: `Maturity Models (${catalogNodes.filter((n) => categoryOf(n) === 'maturity').length})` },
    { id: 'instruments', label: `EA Instruments (${catalogNodes.filter((n) => categoryOf(n) === 'instruments').length})` },
    { id: 'catalogs', label: `Portfolio & Capabilities (${catalogNodes.filter((n) => categoryOf(n) === 'catalogs').length})` },
  ];

  for (const t of tabsMeta) {
    const btn = h('button', {
      type: 'button',
      role: 'tab',
      class: `seg-btn${t.id === activeTab ? ' is-active' : ''}`,
      'aria-selected': String(t.id === activeTab),
    }, t.label);
    btn.addEventListener('click', () => {
      activeTab = t.id;
      seg.querySelectorAll('.seg-btn').forEach((b) => {
        const on = b === btn;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', String(on));
      });
      drawGrid();
    });
    seg.append(btn);
  }

  controls.append(seg, search);
  const grid = h('div', { class: 'catalog-grid' });

  function drawGrid(): void {
    grid.innerHTML = '';
    const q = query.trim().toLowerCase();
    const list = catalogNodes.filter((n) => {
      if (activeTab !== 'all' && categoryOf(n) !== activeTab) return false;
      if (!q) return true;
      const hay = `${n.name} ${n.id} ${n.description ?? ''} ${n.contract ?? ''} ${n.group}`.toLowerCase();
      return hay.includes(q);
    });

    if (!list.length) {
      grid.append(h('div', { class: 'panel dim', style: 'grid-column:1 / -1;text-align:center;padding:2rem' },
        'No models or repositories match the current filter.'));
      return;
    }

    for (const node of list) {
      grid.append(modelCard(node));
    }
  }

  search.addEventListener('input', () => {
    query = search.value;
    drawGrid();
  });

  drawGrid();
  root.append(controls, grid);
}

function modelCard(node: IndexNode): HTMLElement {
  const scorable = isScorableModel(node);
  const metaParts = [
    node.version ? `v${node.version.replace(/^v/, '')}` : null,
    groupLabel(node.group),
    node.conformance ? `${node.conformance} conformance` : null,
    node.status ?? null,
  ].filter(Boolean) as string[];

  const metaLine = h('div', { class: 'catalog-meta-line mono' });
  metaParts.forEach((part, idx) => {
    if (idx > 0) metaLine.append(h('span', { class: 'faint', 'aria-hidden': 'true' }, ' · '));
    metaLine.append(h('span', {}, part));
  });

  const actions = h('div', { class: 'catalog-card-actions' });
  if (scorable) {
    actions.append(
      h('a', { class: 'btn small', href: `#/model/${node.id}` }, 'Inspect Structure'),
      h('a', { class: 'btn primary small', href: `#/trial/${node.id}` }, 'Start Trial'),
    );
  } else {
    actions.append(h('a', { class: 'btn small', href: '#/interactions' }, 'View Seams & CI'));
    if (node.repo) {
      actions.append(h('a', { class: 'btn primary small', href: repoUrl(node.repo), target: '_blank', rel: 'noopener' }, 'Open GitHub ↗'));
    }
  }

  return h('article', { class: 'panel catalog-card' },
    h('div', { class: 'catalog-card-top' },
      metaLine,
      node.contract
        ? h('div', { class: 'mono catalog-contract' }, node.contract)
        : null,
    ),
    h('h3', { class: 'catalog-card-title' }, node.name),
    h('p', { class: 'dim catalog-card-desc' }, node.description ?? ''),
    actions,
  );
}
