/** Shared helpers for the gateway views, including Persona Viewport callouts. */
import { fetchManifest, findNode } from '../data/loader';
import type { IndexNode } from '../types';
import { getPersonaDef } from '../ui/persona';
import { h } from '../ui/dom';

export { h } from '../ui/dom';
export {
  conformanceBadge,
  errorPanel,
  repoUrl,
  toast,
} from '../ui/dom';

export async function fetchNodeSafe(id: string): Promise<IndexNode> {
  const manifest = await fetchManifest();
  const node = findNode(manifest, id);
  if (!node) throw new Error(`Unknown asset “${id}” - is it registered in assessment-registry?`);
  return node;
}

/** Render a concise corporate Persona Viewport callout tailored to the active role. */
export function personaViewportBanner(contextNote?: string): HTMLElement {
  const persona = getPersonaDef();
  const currentHash = location.hash || '#/';
  const normalizedHash = currentHash.replace(/\/$/, '') || '#/';
  const targetNormalized = persona.step.href.replace(/\/$/, '') || '#/';
  const action = normalizedHash === targetNormalized
    ? (targetNormalized === '#/catalog'
        ? { href: '#/interactions', cta: 'View CI & Interactions →' }
        : { href: '#/catalog', cta: 'Browse Model Catalog →' })
    : { href: persona.step.href, cta: persona.step.cta };

  return h('div', { class: 'panel persona-callout no-print' },
    h('div', { class: 'persona-callout-head' },
      h('div', {},
        h('div', { class: 'callout-kicker' }, `Viewport · ${persona.label}`),
        h('div', { class: 'callout-title' }, persona.calloutTitle),
      ),
      h('a', { class: 'btn small primary', href: action.href }, action.cta),
    ),
    h('p', { class: 'dim', style: 'font-size:.87rem;margin:.35rem 0 .55rem' },
      contextNote ? `${persona.calloutSummary} ${contextNote}` : persona.calloutSummary),
    h('div', { class: 'callout-metrics' },
      ...persona.focusMetrics.flatMap((m, i) => [
        i > 0 ? h('span', { class: 'sep', 'aria-hidden': 'true' }, '·') : null,
        h('span', { class: 'mono', style: 'font-size:.76rem' }, m),
      ]),
    ),
  );
}
