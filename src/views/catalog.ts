/** Model catalog — card grid of maturity / assessment models. */
import { fetchManifest } from '../data/loader';
import { h, groupLabel, conformanceBadge } from '../ui/dom';
import type { IndexNode } from '../types';

export async function renderCatalog(root: HTMLElement): Promise<void> {
  const manifest = await fetchManifest();
  const models = manifest.nodes.filter((n) =>
    ['maturity-models', 'assessment-models', 'assessment-tools'].includes(n.group),
  );

  const head = h('div', { class: 'page-head' },
    h('h1', {}, 'Model Catalog'),
    h('p', { class: 'lede' }, 'Discover, evaluate and start a trial assessment on any registered model.'),
  );

  const grid = h('div', { class: 'catalog-grid' });
  for (const node of models) {
    grid.append(modelCard(node));
  }

  root.append(head, grid);
}

function modelCard(node: IndexNode): HTMLElement {
  return h('div', { class: 'panel', style: 'display:flex;flex-direction:column;min-height:220px' },
    h('h3', { style: 'margin-bottom:.4rem' }, node.name),
    h('p', { class: 'dim', style: 'font-size:.88rem;flex:1;min-height:3.4em' }, node.description ?? ''),
    h('div', { style: 'display:flex;gap:.4rem;flex-wrap:wrap;margin:.6rem 0' },
      node.version ? h('span', { class: 'badge' }, `v${node.version}`) : null,
      h('span', { class: 'badge', style: '--badge-color:#55c47f' }, node.status ?? 'active'),
      h('span', { class: 'badge' }, groupLabel(node.group)),
      node.contract ? h('span', { class: 'badge', style: '--badge-color:var(--c-external)' }, node.contract) : null,
    ),
    h('div', { style: 'display:flex;gap:.5rem;margin-top:auto' },
      h('a', { class: 'btn small', href: `#/model/${node.id}` }, 'View details'),
      h('a', { class: 'btn primary small', href: `#/trial/${node.id}` }, 'Start trial'),
    ),
  );
}
