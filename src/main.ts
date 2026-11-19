/**
 * Router + shell. Hash routes:
 *   #/                  → metro map (landing)
 *   #/catalog           → model catalog
 *   #/model/:id         → model drill-down
 *   #/trial/:id         → trial assessment runner
 *   #/report/:id        → generated report
 */
import './styles/main.css';
import { h, errorPanel } from './ui/dom';
import { mountPersonaPicker, onPersonaChange } from './ui/persona';
import { maybeRunWalkthrough, runWalkthrough } from './ui/walkthrough';
import { renderMetro, disposeActiveMetro } from './views/metro';
import { renderCatalog } from './views/catalog';
import { renderModel } from './views/model';
import { renderTrial } from './views/trial';
import { renderReport } from './views/report';
import { renderConformance } from './views/conformance';

const app = document.getElementById('app')!;

type ViewFn = (root: HTMLElement, param?: string) => Promise<void> | void;

const routes: { pattern: RegExp; view: ViewFn; crumb: (p?: string) => HTMLElement }[] = [
  {
    pattern: /^#?\/?$/,
    view: (root) => renderMetro(root),
    crumb: () => h('span', { class: 'here' }, 'Metro Map'),
  },
  {
    pattern: /^#\/catalog\/?$/,
    view: (root) => renderCatalog(root),
    crumb: () => crumbs(h('span', { class: 'here' }, 'Catalog')),
  },
  {
    pattern: /^#\/model\/([\w.-]+)/,
    view: (root, p) => renderModel(root, p!),
    crumb: (p) => crumbs(h('span', { class: 'here mono' }, p ?? '')),
  },
  {
    pattern: /^#\/trial\/([\w.-]+)/,
    view: (root, p) => renderTrial(root, p!),
    crumb: (p) => crumbs(h('span', { class: 'here' }, 'Trial — ', h('span', { class: 'mono' }, p ?? ''))),
  },
  {
    pattern: /^#\/report\/([\w.-]+)/,
    view: (root, p) => renderReport(root, p!),
    crumb: (p) => crumbs(h('span', { class: 'here' }, 'Report — ', h('span', { class: 'mono' }, p ?? ''))),
  },
  {
    pattern: /^#\/conformance\/?$/,
    view: (root) => renderConformance(root),
    crumb: () => crumbs(h('span', { class: 'here' }, 'Conformance dashboard')),
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

async function render(): Promise<void> {
  const hash = location.hash || '#/';
  const seq = ++renderSeq;
  closeOverlays();

  // unmount the metro canvas (listeners, observers, full-bleed mode)
  document.body.classList.remove('metro-mode');
  disposeActiveMetro();

  const route = routes.find((r) => r.pattern.test(hash));
  const crumbsEl = document.getElementById('crumbs')!;
  crumbsEl.innerHTML = '';

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
    if (seq !== renderSeq) return; // a newer navigation superseded this render
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
maybeRunWalkthrough(); // first-visit tour (fires after the landing render)

export {};
