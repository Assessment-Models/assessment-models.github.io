/**
 * Conformance dashboard — portfolio view of repository-standard adoption
 * (AM-MODEL-REPOSITORY-STANDARD), joined from maturity-model-standard's
 * conformance registry at build time. Primary screen for the Certifying
 * Body persona.
 */
import type { IndexNode } from '../types';
import { fetchManifest } from '../data/loader';
import { badge, groupLabel, h, repoUrl } from '../ui/dom';
import { getPersonaDef } from '../ui/persona';

const IDENTITY_COLORS: Record<string, string> = {
  coherent: '#55c47f',
  'version-anchor-missing': '#e8b04b',
  drift: '#e26d6d',
};

export async function renderConformance(root: HTMLElement): Promise<void> {
  const manifest = await fetchManifest();
  const portfolio = manifest.nodes
    .filter((n) => n.classification)
    .sort((a, b) => (a.classification ?? '').localeCompare(b.classification ?? '') || a.id.localeCompare(b.id));

  const structural = portfolio.filter((n) => n.conformance === 'structural').length;
  const full = portfolio.filter((n) => n.conformance === 'full').length;
  const standard = portfolio.find((n) => n.standardVersion)?.standardVersion ?? '1.0.1';
  const assessed = portfolio.filter((n) => n.phase2?.assessed).length;

  root.append(h('div', { class: 'page-head' },
    h('h1', {}, 'Conformance dashboard'),
    h('p', { class: 'lede' },
      'Repository-standard adoption across the portfolio, joined from the ',
      h('a', { href: repoUrl('maturity-model-standard'), target: '_blank', rel: 'noopener' },
        'AM-MODEL-REPOSITORY-STANDARD'),
      ` conformance registry (standard v${standard}). The identity spine — immutable release references and contract handshakes — lives in the `,
      h('a', { href: repoUrl('assessment-registry'), target: '_blank', rel: 'noopener' }, 'assessment-registry'),
      '.'),
    h('div', { class: 'stats' },
      stat(`${full}/${portfolio.length}`, 'full conformance'),
      stat(`${structural}/${portfolio.length}`, 'structural conformance'),
      stat(String(assessed), 'phase2 identity assessments'),
      stat(standard, 'standard version'),
    ),
  ));

  if (getPersonaDef().id === 'certifier') {
    root.append(h('div', { class: 'panel', style: 'margin-bottom:1rem;border-color:color-mix(in srgb, var(--c-external) 40%, transparent)' },
      h('span', { class: 'badge', style: '--badge-color:#c76fd1' }, 'Certifying Body view'),
      h('span', { class: 'dim', style: 'font-size:.85rem;margin-left:.6rem' },
        'Verify each asset’s declared contract handshake and standard adoption below; drill into any asset from the constellation.'),
    ));
  }

  const table = h('table', { class: 'report-table conf-table' },
    h('thead', {}, h('tr', {},
      h('th', {}, 'Repository'), h('th', {}, 'Classification'), h('th', {}, 'Standard'),
      h('th', {}, 'Conformance'), h('th', {}, 'Identity'), h('th', {}, 'Assessed'),
      h('th', {}, 'Phase2 result'),
    )),
    h('tbody', {}, ...portfolio.map((n) => h('tr', {},
      h('td', {},
        n.repo
          ? h('a', { href: `#/model/${n.id}`, class: 'mono' }, n.id)
          : h('span', { class: 'mono' }, n.id),
        h('div', { class: 'faint', style: 'font-size:.72rem' }, groupLabel(n.group)),
      ),
      h('td', {}, badge(n.classification ?? '', '#7d8aa5')),
      h('td', { class: 'mono' }, n.standardVersion ?? '—'),
      h('td', {}, conformanceCell(n)),
      h('td', {}, identityCell(n)),
      h('td', { class: 'mono faint' }, n.phase2?.assessed ?? '—'),
      h('td', { class: 'dim', style: 'font-size:.8rem;max-width:34ch' }, n.phase2?.result ?? '—'),
    ))),
  );

  root.append(h('div', { class: 'panel' }, table));

  root.append(h('p', { class: 'footer-note' },
    'Conformance levels: registered → structural → full (AM-MODEL-REPOSITORY-STANDARD §6). Identity assessments record repo/taxonomy coherence from the portfolio reconciliation.',
  ));

  function conformanceCell(n: IndexNode): HTMLElement {
    if (!n.conformance) return h('span', { class: 'faint mono' }, 'not-applicable');
    const color = n.conformance === 'full' ? '#55c47f' : n.conformance === 'structural' ? '#38c1d9' : '#e8b04b';
    return badge(n.conformance, color);
  }

  function identityCell(n: IndexNode): HTMLElement {
    const id = n.phase2?.identity;
    if (!id) return h('span', { class: 'faint mono' }, '—');
    return badge(id, IDENTITY_COLORS[id] ?? '#7d8aa5');
  }

  function stat(value: string, label: string): HTMLElement {
    return h('span', { class: 'stat' }, h('b', {}, value), h('span', {}, label));
  }
}
