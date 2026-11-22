/**
 * Router + shell. Hash routes:
 *   #/                  → metro map (landing)
 *   #/catalog           → model & instrument catalog
 *   #/interactions      → inter-model seams & GitHub Actions CI propagation
 *   #/model/:id         → model drill-down
 *   #/trial/:id         → trial assessment runner
 *   #/report/:id        → generated report
 *   #/conformance       → portfolio conformance dashboard
 */
import './styles/main.css';
import { h, errorPanel } from './ui/dom';
import { mountPersonaPicker, onPersonaChange } from './ui/persona';
import { runWalkthrough } from './ui/walkthrough';
import { renderMetro, disposeActiveMetro } from './views/metro';
import { renderCatalog } from './views/catalog';
import { renderModel } from './views/model';
import { renderTrial } from './views/trial';
import { renderReport } from './views/report';
import { renderConformance } from './views/conformance';
import { renderRegistry } from './views/registry';
import { renderCompare } from './views/compare';
import { renderInteractions } from './views/interactions';

const app = document.getElementById('app')!;

type ViewFn = (root: HTMLElement, param?: string) => Promise<void> | void;

const routes: { pattern: RegExp; nav?: string; view: ViewFn; crumb: (p?: string) => HTMLElement }[] = [
  {
    pattern: /^#?\/?$/,
    nav: '#/',
    view: (root) => renderMetro(root),
    crumb: () => h('span', { class: 'here' }, 'Metro Map'),
  },
  {
    pattern: /^#\/catalog\/?$/,
    nav: '#/catalog',
    view: (root) => renderCatalog(root),
    crumb: () => crumbs(h('span', { class: 'here' }, 'Catalog')),
  },
  {
    pattern: /^#\/interactions\/?$/,
    nav: '#/interactions',
    view: (root) => renderInteractions(root),
    crumb: () => crumbs(h('span', { class: 'here' }, 'Interactions & CI')),
  },
  {
    pattern: /^#\/model\/([\w.-]+)/,
    nav: '#/catalog',
    view: (root, p) => renderModel(root, p!),
    crumb: (p) => crumbs(h('a', { href: '#/catalog' }, 'Catalog'), h('span', { class: 'sep' }, ' / '), h('span', { class: 'here mono' }, p ?? '')),
  },
  {
    pattern: /^#\/trial\/([\w.-]+)/,
    nav: '#/catalog',
    view: (root, p) => renderTrial(root, p!),
    crumb: (p) => crumbs(h('span', { class: 'here' }, 'Trial — ', h('span', { class: 'mono' }, p ?? ''))),
  },
  {
    pattern: /^#\/report\/([\w.-]+)/,
    nav: '#/catalog',
    view: (root, p) => renderReport(root, p!),
    crumb: (p) => crumbs(h('span', { class: 'here' }, 'Report — ', h('span', { class: 'mono' }, p ?? ''))),
  },
  {
    pattern: /^#\/registry\/?$/,
    view: (root) => renderRegistry(root),
    crumb: () => crumbs(h('span', { class: 'here' }, 'Registry')),
  },
  {
    pattern: /^#\/compare\/?$/,
    view: (root) => renderCompare(root),
    crumb: () => crumbs(h('span', { class: 'here' }, 'Compare')),
  },
  {
    pattern: /^#\/conformance\/?$/,
    nav: '#/conformance',
    view: (root) => renderConformance(root),
    crumb: () => crumbs(h('span', { class: 'here' }, 'Conformance Dashboard')),
  },
];

function crumbs(...nodes: Node[]): HTMLElement {
  return h('span', {},
    h('a', { href: '#/' }, 'Metro Map'),
    h('span', { class: 'sep' }, ' / '),
    ...nodes,
  );
}

let renderSeq = 0;

function updateNavActive(activeNav?: string): void {
  document.querySelectorAll<HTMLAnchorElement>('[data-gw-route]').forEach((a) => {
    a.classList.toggle('active', a.dataset.gwRoute === activeNav);
  });
}

async function render(): Promise<void> {
  const hash = location.hash || '#/';
  const seq = ++renderSeq;
  closeOverlays();

  document.body.classList.remove('metro-mode');
  disposeActiveMetro();

  const route = routes.find((r) => r.pattern.test(hash));
  const crumbsEl = document.getElementById('crumbs')!;
  crumbsEl.innerHTML = '';
  updateNavActive(route?.nav);

  if (!route) {
    app.innerHTML = '';
    app.append(errorPanel('Not found', `No route for ${hash}`));
    return;
  }

  const param = hash.match(route.pattern)?.[1];
  crumbsEl.append(route.crumb(param));

  window.scrollTo(0, 0);
  app.innerHTML = '';
  const loading = h('div', { class: 'spinner-box' }, h('span', { class: 'spinner' }), h('span', {}, 'Loading…'));
  app.append(loading);

  try {
    const root = h('div', {});
    await route.view(root, param);
    if (seq !== renderSeq) return;
    app.innerHTML = '';
    app.append(root);
  } catch (err) {
    if (seq !== renderSeq) return;
    app.innerHTML = '';
    app.append(errorPanel('Something went wrong', err instanceof Error ? err.message : String(err)));
  }
}

function closeOverlays(): void {
  for (const id of ['tooltip', 'drawer', 'toast']) {
    const el = document.getElementById(id);
    if (el) el.hidden = true;
  }
}

window.addEventListener('hashchange', render);
onPersonaChange(() => render());
mountPersonaPicker(document.getElementById('persona-slot')!);
document.getElementById('help-btn')?.addEventListener('click', () => void runWalkthrough());
render();

export {};
