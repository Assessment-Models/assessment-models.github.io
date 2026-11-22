/**
 * Registry view — two data planes, one screen:
 *  1. Registration records (assessment-registry, fetched live from the repo
 *     with the build snapshot as fallback): the ecosystem identity spine —
 *     immutable release references, contract handshakes, compatibility axes.
 *  2. Ecosystem artifacts (data/ecosystem-registry.json, bot-synced): the
 *     org-wide catalog by layer, with touchpoint/handshake counts.
 */
import type { IndexNode } from '../types';
import { fetchEcosystemRegistry, fetchManifest, loadRegistryRecord } from '../data/loader';
import { badge, groupLabel, h } from '../ui/dom';

const REGISTRY_SUBDIRS: Record<string, string> = {
  'maturity-models': 'maturity-models',
  'assessment-models': 'assessment-models',
  'assessment-tools': 'assessment-tools',
  components: 'components',
};

interface RecordView {
  node: IndexNode;
  rec: Record<string, unknown> | null;
  err?: string;
}

export async function renderRegistry(root: HTMLElement): Promise<void> {
  const manifest = await fetchManifest();

  const registered = manifest.nodes.filter((n) => REGISTRY_SUBDIRS[n.group]);

  root.append(h('div', { class: 'page-head' },
    h('h1', {}, 'Ecosystem registry'),
    h('p', { class: 'lede' },
      'The identity spine: registration records from the ',
      h('a', { href: 'https://github.com/Assessment-Models/assessment-registry', target: '_blank', rel: 'noopener' }, 'assessment-registry'),
      ' (fetched live, immutable release references) alongside the bot-synced ecosystem catalog. ',
      'Every record pins an immutable release reference — verify release versions, contracts and compatibility axes below.'),
  ));

  // ---------- plane 1: registration records (live) ----------
  root.append(h('h2', { style: 'margin:.6rem 0 .2rem' }, 'Registration records'),
    h('p', { class: 'dim', style: 'font-size:.85rem;margin-bottom:.8rem' },
      `Fetched live from assessment-registry — ${registered.length} records across four asset classes.`));

  const results: RecordView[] = await Promise.all(
    registered.map(async (node) => {
      try {
        const rec = await loadRegistryRecord('assessment-registry', REGISTRY_SUBDIRS[node.group], node.id);
        return { node, rec };
      } catch (err) {
        return { node, rec: null, err: err instanceof Error ? err.message : String(err) };
      }
    }),
  );

  const rel = (rec: Record<string, unknown> | null): { version: string; reference: string; commit: string } => {
    const r = (rec?.release ?? {}) as Record<string, string>;
    return { version: r.version ?? '—', reference: r.reference ?? '', commit: r.commit ?? '' };
  };

  const recTable = h('table', { class: 'report-table reg-table' },
    h('thead', {}, h('tr', {},
      h('th', {}, 'Record'), h('th', {}, 'Class'), h('th', {}, 'Release'),
      h('th', {}, 'Immutable reference'), h('th', {}, 'Contract'),
      h('th', {}, 'Components'), h('th', {}, 'Status'), h('th', {}, ''),
    )),
    h('tbody', {}, ...results.map(({ node, rec, err }) => {
      const r = rel(rec);
      const commit = r.commit;
      const commitCell = commit
        ? h('a', {
            class: 'mono', href: `https://github.com/Assessment-Models/${node.repo}/commit/${commit}`,
            target: '_blank', rel: 'noopener', title: commit,
          }, commit.slice(0, 8))
        : h('span', { class: 'faint mono' }, err ? 'unreachable' : '—');
      const compCount = Array.isArray(rec?.components) ? (rec!.components as unknown[]).length : null;
      return h('tr', {},
        h('td', {},
          h('span', { class: 'mono' }, node.id),
          h('div', { class: 'faint', style: 'font-size:.72rem' }, groupLabel(node.group)),
          err ? h('div', { class: 'badge', style: '--badge-color:#e26d6d;margin-top:.2rem' }, 'fetch failed') : null,
        ),
        h('td', {}, badge(String(rec?.type ?? node.group), '#7d8aa5')),
        h('td', { class: 'mono' }, r.version),
        h('td', {}, commitCell),
        h('td', { class: 'mono faint' }, String(rec?.conformsTo ? ((rec.conformsTo as Record<string, unknown>).contract as Record<string, unknown>)?.id ?? '—' : '—')),
        h('td', { class: 'mono' }, compCount != null ? String(compCount) : '—'),
        h('td', { class: 'mono faint' }, String(rec?.status ?? '—')),
        h('td', {}, ['maturity-models', 'assessment-models', 'assessment-tools'].includes(node.group)
          ? h('a', { class: 'btn small', href: `#/model/${node.id}` }, 'Open →')
          : null),
      );
    })),
  );
  root.append(h('div', { class: 'panel' }, recTable));

  // ---------- plane 2: bot-synced ecosystem catalog ----------
  let eco: Awaited<ReturnType<typeof fetchEcosystemRegistry>> | null = null;
  try {
    eco = await fetchEcosystemRegistry();
  } catch {
    /* bot-synced file is optional for this view */
  }

  root.append(h('h2', { style: 'margin:1.6rem 0 .2rem' }, 'Ecosystem artifacts'),
    h('p', { class: 'dim', style: 'font-size:.85rem;margin-bottom:.8rem' },
      eco
        ? `Bot-synced catalog — ${eco.summary.total_artifacts} artifacts across the org, generated ${eco.generated_at.slice(0, 10)}.`
        : 'Bot-synced catalog unavailable (offline fallback).'),
  );

  if (eco) {
    const layerOrder = ['governance', 'maturity-model', 'assessment-model', 'shared-capability', 'integration', 'reference-blueprint'];
    const byLayer = new Map<string, typeof eco.artifacts>();
    for (const a of eco.artifacts) {
      if (!byLayer.has(a.layer)) byLayer.set(a.layer, []);
      byLayer.get(a.layer)!.push(a);
    }
    for (const layer of [...byLayer.keys()].sort((a, b) => {
      const ia = layerOrder.indexOf(a), ib = layerOrder.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    })) {
      const arts = byLayer.get(layer)!;
      root.append(h('h3', { style: 'margin:.9rem 0 .4rem' }, `${layer} (${arts.length})`));
      root.append(h('table', { class: 'report-table' },
        h('thead', {}, h('tr', {},
          h('th', {}, 'Artifact'), h('th', {}, 'Version'), h('th', {}, 'Conformance'),
          h('th', {}, 'Standards'), h('th', {}, 'Updated'), h('th', {}, ''),
        )),
        h('tbody', {}, ...arts.map((a) => h('tr', {},
          h('td', {},
            h('span', {}, a.name),
            h('div', { class: 'faint mono', style: 'font-size:.72rem' }, a.id),
          ),
          h('td', { class: 'mono' }, a.version ?? '—'),
          h('td', {}, a.conformance_status
            ? badge(a.conformance_status,
                a.conformance_status === 'verified' || a.conformance_status === 'full' ? '#55c47f'
                  : a.conformance_status === 'structural' || a.conformance_status === 'registered' ? '#38c1d9'
                    : '#e8b04b')
            : '—'),
          h('td', { class: 'mono faint', style: 'font-size:.75rem' }, a.standards_alignment ?? '—'),
          h('td', { class: 'mono faint' }, a.updated_at?.slice(0, 10) ?? '—'),
          h('td', {}, a.html_url ? h('a', { href: a.html_url, target: '_blank', rel: 'noopener' }, 'GitHub ↗') : null),
        ))),
      ));
    }
    const tp = eco.touchpoints?.length ?? 0;
    const hs = eco.handshakes?.length ?? 0;
    if (tp || hs) {
      root.append(h('p', { class: 'dim', style: 'font-size:.85rem;margin-top:.8rem' },
        `CR-AM-13 network: ${tp} touchpoints and ${hs} handshakes mapped — visualized on the `,
        h('a', { href: '#/interactions' }, 'Interactions & CI'),
        ' view and the metro map.'));
    }
  }

  root.append(h('p', { class: 'footer-note' },
    'Assessment Models — independently governed models, consistently engineered, operationally assessable and interoperable by design.',
  ));
}
