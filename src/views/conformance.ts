/**
 * Conformance dashboard - portfolio view of repository-standard adoption
 * (AM-MODEL-REPOSITORY-STANDARD) and ecosystem identity coherence.
 */
import type { IndexNode } from '../types';
import { fetchManifest } from '../data/loader';
import { groupLabel, h, repoUrl } from '../ui/dom';
import { personaViewportBanner } from './shared';

const IDENTITY_STATUS_CLASS: Record<string, string> = {
  coherent: 'status-good',
  'version-anchor-missing': 'status-warn',
  drift: 'status-bad',
};

export async function renderConformance(root: HTMLElement): Promise<void> {
  const manifest = await fetchManifest();
  const portfolio = manifest.nodes
    .filter((n) => n.classification || n.group !== 'external')
    .sort((a, b) => (a.classification ?? a.group).localeCompare(b.classification ?? b.group) || a.id.localeCompare(b.id));

  const structural = portfolio.filter((n) => n.conformance === 'structural').length;
  const full = portfolio.filter((n) => n.conformance === 'full').length;
  const registered = portfolio.filter((n) => n.conformance === 'registered').length;
  const standard = portfolio.find((n) => n.standardVersion)?.standardVersion ?? '1.0.1';
  const assessed = portfolio.filter((n) => n.phase2?.assessed).length;

  root.append(h('div', { class: 'page-head' },
    h('h1', {}, 'Conformance Dashboard'),
    h('p', { class: 'lede' },
      'Portfolio adoption of ',
      h('a', { href: repoUrl('maturity-model-standard'), target: '_blank', rel: 'noopener' },
        'AM-MODEL-REPOSITORY-STANDARD'),
      ` (v${standard}) paired with immutable identity spine references from `,
      h('a', { href: repoUrl('assessment-registry'), target: '_blank', rel: 'noopener' }, 'assessment-registry'),
      '.'),
    h('div', { class: 'stats' },
      stat(`${structural + full}/${portfolio.length}`, 'structural or full conformance'),
      stat(String(registered), 'registered instruments'),
      stat(String(assessed || portfolio.length), 'indexed artifacts'),
      stat(`v${standard}`, 'repository standard'),
    ),
  ));

  root.append(personaViewportBanner(
    'Verify each repository’s standard adoption, contract handshake coherence, and automated conformance signals.',
  ));

  const table = h('table', { class: 'report-table conf-table' },
    h('thead', {}, h('tr', {},
      h('th', {}, 'Repository'),
      h('th', {}, 'Classification'),
      h('th', {}, 'Version / Std'),
      h('th', {}, 'Conformance'),
      h('th', {}, 'Identity'),
      h('th', {}, 'Assessed'),
      h('th', {}, 'Verification Summary'),
    )),
    h('tbody', {}, ...portfolio.map((n) => h('tr', {},
      h('td', {},
        n.repo
          ? h('a', { href: `#/model/${n.id}`, class: 'mono' }, n.id)
          : h('span', { class: 'mono' }, n.id),
        h('div', { class: 'faint', style: 'font-size:.74rem' }, groupLabel(n.group)),
      ),
      h('td', { class: 'mono', style: 'font-size:.78rem' }, n.classification ?? groupLabel(n.group)),
      h('td', { class: 'mono' }, n.standardVersion ? `std ${n.standardVersion}` : n.version ? `v${n.version.replace(/^v/, '')}` : '-'),
      h('td', {}, conformanceCell(n)),
      h('td', {}, identityCell(n)),
      h('td', { class: 'mono faint' }, n.phase2?.assessed ?? '-'),
      h('td', { class: 'dim', style: 'font-size:.82rem;max-width:34ch' },
        n.phase2?.result ?? (n.contract ? `Contract: ${n.contract}` : 'Indexed via ecosystem registry')),
    ))),
  );

  root.append(h('div', { class: 'panel', style: 'overflow-x:auto' }, table));

  root.append(h('p', { class: 'footer-note' },
    'Conformance ladder: draft → registered → structural → full (AM-MODEL-REPOSITORY-STANDARD §6). Automated verification executes on every pull request and release dispatch.',
  ));

  function conformanceCell(n: IndexNode): HTMLElement {
    const level = n.conformance ?? 'registered';
    const cls = level === 'full' || level === 'structural'
      ? 'status-good'
      : level === 'registered'
        ? 'status-info'
        : 'status-warn';
    return h('span', { class: `status-indicator ${cls}` },
      h('span', { class: 'status-dot', 'aria-hidden': 'true' }),
      h('span', { class: 'mono' }, level),
    );
  }

  function identityCell(n: IndexNode): HTMLElement {
    const id = n.phase2?.identity;
    if (!id) return h('span', { class: 'faint mono' }, 'coherent');
    const cls = IDENTITY_STATUS_CLASS[id] ?? 'status-info';
    return h('span', { class: `status-indicator ${cls}` },
      h('span', { class: 'status-dot', 'aria-hidden': 'true' }),
      h('span', { class: 'mono' }, id),
    );
  }

  function stat(value: string, label: string): HTMLElement {
    return h('span', { class: 'stat' }, h('b', {}, value), h('span', {}, label));
  }
}
