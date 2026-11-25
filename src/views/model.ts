/**
 * Model drill-down - full navigation of a model repository's structure:
 * dimensions -> sub-dimensions -> criteria -> level anchors / evidence, plus
 * component imports, contract handshakes, touchpoints.yaml & CI status.
 */
import type { ModelStructure, OpDimension, OpSubDimension, RepoManifestInfo, Scale, IndexNode } from '../types';
import { levelsFromScale, scoredLevels } from '../scoring/engine';
import { fetchManifest, loadModelStructure, loadRepoManifestInfo } from '../data/loader';
import { getPersonaDef } from '../ui/persona';
import { errorPanel, fetchNodeSafe, h, personaViewportBanner, repoUrl } from './shared';

type TabKey = 'operationalized' | 'composite' | 'contracts';

export async function renderModel(root: HTMLElement, id: string): Promise<void> {
  const node = await fetchNodeSafe(id);
  const repo = node.repo;
  if (!repo) {
    root.append(errorPanel('Not a model repository', `“${id}” has no backing repository.`));
    return;
  }
  const repoName: string = repo;

  const [structureResult, repoInfo] = await Promise.all([
    loadModelStructure(repoName).catch((err: unknown) => err),
    loadRepoManifestInfo(repoName),
  ]);

  if (structureResult instanceof Error) {
    root.append(errorPanel('Could not load model structure', structureResult.message));
    return;
  }
  const structure = structureResult as ModelStructure;

  const hasOp = !!structure.operationalized;
  let activeTab: TabKey = hasOp ? 'operationalized' : 'composite';

  // ---------- header (clean unboxed metadata) ----------
  const metaName = structure.meta.name ?? node.name;
  const version = structure.meta.version ?? node.version ?? '';
  const metaItems = [
    version ? `model v${String(version).replace(/^v/, '')}` : null,
    node.conformance ? `${node.conformance} conformance` : null,
    node.contract ?? null,
    structure.meta.status ? String(structure.meta.status) : null,
  ].filter(Boolean) as string[];

  const metaLine = h('div', { class: 'catalog-meta-line mono', style: 'margin-top:.35rem' });
  metaItems.forEach((m, i) => {
    if (i > 0) metaLine.append(h('span', { class: 'faint', 'aria-hidden': 'true' }, ' · '));
    metaLine.append(h('span', {}, m));
  });

  const head = h('div', { class: 'model-head' },
    h('div', {},
      h('h1', {}, metaName),
      metaLine,
      h('p', { class: 'dim', style: 'max-width:72ch;margin-top:.55rem' },
        structure.meta.description ?? node.description),
    ),
    h('div', { class: 'actions' },
      h('a', { class: 'btn primary', href: `#/trial/${id}` }, getPersonaDef().modelCta),
      h('a', { class: 'btn', href: repoUrl(repoName), target: '_blank', rel: 'noopener' }, 'GitHub Repo ↗'),
    ),
  );
  root.append(head);
  root.append(personaViewportBanner());

  // ---------- relationships ----------
  const relPanel = await relationshipsPanel(node);
  if (relPanel) root.append(relPanel);

  // ---------- tabs + search ----------
  const content = h('div', {});
  const search = h('input', {
    class: 'search-input no-print',
    placeholder: 'Filter dimensions, sub-dimensions, criteria, or evidence…',
    type: 'search',
  }) as HTMLInputElement;
  const tabs = h('div', { class: 'tabs no-print', role: 'tablist' });

  function drawTabs(): void {
    tabs.innerHTML = '';
    const defs: { key: TabKey; label: string }[] = [
      ...(hasOp ? [{ key: 'operationalized' as const, label: 'Operationalized Model' }] : []),
      { key: 'composite', label: 'Composite & Components' },
      { key: 'contracts', label: 'Contracts, Touchpoints & CI' },
    ];
    for (const d of defs) {
      const t = h('button', {
        type: 'button',
        role: 'tab',
        'aria-selected': String(d.key === activeTab),
        class: `tab${d.key === activeTab ? ' active' : ''}`,
      }, d.label);
      t.addEventListener('click', () => {
        activeTab = d.key;
        drawTabs();
        drawContent();
      });
      tabs.append(t);
    }
  }

  function drawContent(): void {
    content.innerHTML = '';
    search.style.display = activeTab === 'operationalized' ? 'block' : 'none';
    if (activeTab === 'operationalized' && structure.operationalized) {
      content.append(opLineView(structure));
      content.append(scaleView(structure.operationalized.scale));
      wireSearch();
    } else if (activeTab === 'composite') {
      content.append(compositeView(structure));
      if (structure.composite.scale) content.append(scaleView(structure.composite.scale));
    } else {
      content.append(contractsView(repoName, repoInfo));
    }
  }

  function wireSearch(): void {
    const q = (search.value ?? '').toLowerCase().trim();
    if (!q) return;
    content.querySelectorAll<HTMLElement>('.crit, .subdim').forEach((el) => {
      if (!el.textContent?.toLowerCase().includes(q)) el.style.display = 'none';
      else el.style.display = '';
    });
    content.querySelectorAll<HTMLElement>('.dim-card').forEach((card) => {
      const hit = card.textContent?.toLowerCase().includes(q);
      card.style.display = hit ? '' : 'none';
      if (hit) card.classList.add('open');
    });
  }

  search.addEventListener('input', () => drawContent());
  root.append(tabs, search, content);
  drawTabs();
  drawContent();

  // ---------- renderers ----------

  function opLineView(s: ModelStructure): HTMLElement {
    const scoredIds = scoredLevels(levelsFromScale(s.operationalized!.scale ?? null)).map((l) => l.id);
    const wrap = h('div', {});
    for (const dim of s.operationalized!.dimensions) wrap.append(dimensionCard(dim, scoredIds));
    return wrap;
  }

  function dimensionCard(dim: OpDimension, scoredIds: string[]): HTMLElement {
    const card = h('div', { class: 'panel dim-card open' });
    const body = h('div', { class: 'dim-body' });
    const headEl = h('div', { class: 'dim-head' },
      h('span', { class: 'caret', 'aria-hidden': 'true' }, '▸'),
      h('h3', { style: 'margin:0' }, `${(dim.dimension ?? dim.id).toUpperCase()} - ${dim.name}`),
      h('span', { class: 'dim-weight' }, `weight ${dim.weight}`),
      h('span', { style: 'flex:1' }),
    );
    headEl.addEventListener('click', () => card.classList.toggle('open'));
    card.append(headEl);

    if (dim.description) body.append(h('p', { class: 'dim', style: 'font-size:.87rem;margin-bottom:.6rem' }, dim.description));
    for (const sub of dim.sub_dimensions ?? []) body.append(subdimView(sub, scoredIds));
    card.append(body);
    return card;
  }

  function subdimView(sub: OpSubDimension, scoredIds: string[]): HTMLElement {
    const box = h('div', { class: 'subdim' },
      h('div', { class: 'subdim-name' }, sub.name),
      sub.lite_question ? h('div', { class: 'lite-q' }, `“${sub.lite_question}”`) : null,
    );
    for (const c of sub.criteria ?? []) {
      box.append(h('div', { class: 'crit' },
        h('div', { class: 'crit-name' }, c.name,
          c.gating ? h('span', { class: 'badge', style: '--badge-color:#e8b04b;margin-left:.5rem;font-size:.68rem', title: c.gating_note ?? 'weakest-link spine criterion' }, 'gating') : null),
        c.statement ? h('div', { class: 'crit-statement' }, c.statement) : null,
        c.levers?.length
          ? h('div', { class: 'levers' },
              h('span', { class: 'mono faint', style: 'font-size:.74rem' }, `Levers: ${c.levers.join(' · ')}`))
          : null,
        anchorsView(c.anchors ?? [], scoredIds),
        c.evidence?.length
          ? h('ul', { class: 'evidence' }, ...c.evidence.map((e) => h('li', {}, e)))
          : null,
      ));
    }
    return box;
  }

  function anchorsView(anchors: { level: number; text: string }[], scoredIds: string[]): HTMLElement {
    if (!anchors.length) return h('div', {});
    return h('div', { class: 'anchors' },
      ...anchors.map((a) => h('div', { class: 'anchor-row' },
        h('span', { class: 'lvl' }, scoredIds[a.level - 1] ?? `anchor-${a.level}`),
        h('span', { class: 'txt' }, a.text),
      )),
    );
  }

  function compositeView(s: ModelStructure): HTMLElement {
    const ev = s.composite.evaluation;
    const wrap = h('div', {});
    if (!ev) {
      wrap.append(h('p', { class: 'dim' }, 'No composite evaluation model found in this repository.'));
      return wrap;
    }
    wrap.append(h('p', { class: 'dim', style: 'font-size:.87rem;margin-bottom:.8rem' }, ev.description ?? ''));
    for (const c of ev.criteria ?? []) {
      const meta = [
        c.id,
        c.weight != null ? `weight ${c.weight}` : null,
        c.mandatory ? 'mandatory gate' : null,
      ].filter(Boolean).join(' · ');

      wrap.append(h('div', { class: 'panel', style: 'margin-bottom:.8rem' },
        h('div', { style: 'display:flex;gap:.7rem;align-items:baseline;justify-content:space-between;flex-wrap:wrap' },
          h('h3', { style: 'margin:0' }, c.name ?? c.id),
          h('span', { class: 'mono faint', style: 'font-size:.76rem' }, meta),
        ),
        c.description ? h('p', { class: 'dim', style: 'font-size:.85rem' }, c.description) : null,
        c.evidence_requirements?.length
          ? h('ul', { class: 'evidence' }, ...c.evidence_requirements.map((e) => h('li', {}, e)))
          : null,
        c.level_expectations?.length
          ? h('div', { style: 'margin-top:.55rem' },
              ...c.level_expectations.map((le) => h('div', { class: 'lv-expect' },
                h('span', { class: 'lvl' }, le.level),
                h('span', { class: 'dim' }, le.expectation),
              )))
          : null,
      ));
    }

    const comps = s.composite.componentFiles.filter((f) => f.data);
    if (comps.length) {
      wrap.append(
        h('h2', { style: 'margin-top:1.4rem' }, 'Component Packages'),
        h('p', { class: 'dim', style: 'font-size:.85rem' },
          'Reusable maturity components imported by this model from maturity-components.'),
      );
      for (const f of comps) {
        wrap.append(h('div', { class: 'panel', style: 'margin-bottom:.6rem' },
          h('div', { style: 'display:flex;gap:.6rem;align-items:baseline;justify-content:space-between;flex-wrap:wrap' },
            h('h3', { style: 'margin:0' }, String(f.data!.name ?? f.id)),
            h('span', { class: 'mono faint', style: 'font-size:.76rem' },
              `${f.id}${f.data!.version ? ` · v${f.data!.version}` : ''}`),
          ),
          f.data!.description ? h('p', { class: 'dim', style: 'font-size:.85rem' }, String(f.data!.description)) : null,
        ));
      }
    }
    return wrap;
  }

  function contractsView(repoName: string, info: RepoManifestInfo): HTMLElement {
    const wrap = h('div', { style: 'display:flex;flex-direction:column;gap:1rem' });

    wrap.append(h('div', { class: 'panel' },
      h('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:.5rem' },
        h('h2', { style: 'margin:0' }, 'Repository Manifest & Standard Adoption'),
        h('div', { style: 'display:flex;gap:.75rem' },
          h('a', { class: 'mono', style: 'font-size:.8rem', href: `${repoUrl(repoName)}/tree/main/.github/workflows`, target: '_blank', rel: 'noopener' },
            'GitHub Workflows ↗'),
          h('a', { class: 'mono', style: 'font-size:.8rem', href: '#/interactions' }, 'Open CI Explorer →'),
        ),
      ),
      info.standard
        ? h('pre', { class: 'code-inspect' }, JSON.stringify(info.standard, null, 2))
        : h('p', { class: 'dim', style: 'font-size:.86rem;margin-top:.5rem' },
            'No standalone standard.yaml file returned; structural conformance metadata is synchronized via assessment-registry.'),
    ));

    const modelManifest = info.model;
    const touchpointDeclaration = (modelManifest?.touchpoints as Record<string, unknown> | undefined)?.declaration;
    wrap.append(h('div', { class: 'panel' },
      h('h3', {}, 'model.yaml - Contract handshake & declarations'),
      touchpointDeclaration
        ? h('p', { class: 'dim', style: 'font-size:.84rem' }, `Typed touchpoint declaration: ${String(touchpointDeclaration)}`)
        : h('p', { class: 'dim', style: 'font-size:.84rem' }, 'No typed touchpoint declaration is present in the model manifest.'),
      modelManifest
        ? h('pre', { class: 'code-inspect' }, JSON.stringify(modelManifest, null, 2))
        : h('p', { class: 'dim', style: 'font-size:.86rem' }, 'model.yaml could not be loaded.'),
    ));

    wrap.append(h('div', { class: 'panel' },
      h('h3', {}, 'assessment-manifest.json'),
      info.manifest
        ? h('pre', { class: 'code-inspect' }, JSON.stringify(info.manifest, null, 2))
        : h('p', { class: 'dim', style: 'font-size:.86rem' },
            'Manifest generated cleanly on release via assessment-ci workflow checks.'),
    ));

    wrap.append(h('div', { class: 'panel' },
      h('h3', {}, 'touchpoints.yaml (Inter-Model Seams)'),
      info.touchpoints
        ? h('pre', { class: 'code-inspect' }, JSON.stringify(info.touchpoints, null, 2))
        : h('p', { class: 'dim', style: 'font-size:.86rem' },
            'Touchpoints for this asset are tracked in the ecosystem registry and visible in Interactions & CI.'),
    ));

    return wrap;
  }

  function scaleView(scale: Scale): HTMLElement {
    const levels = levelsFromScale(scale);
    if (!levels.length) return h('div', {});
    const table = h('table', { class: 'scale-table' },
      h('thead', {}, h('tr', {},
        h('th', {}, 'Level'), h('th', {}, 'Name'), h('th', {}, 'Band'),
        h('th', {}, 'Score range'), h('th', {}, 'Effort'), h('th', {}, 'Definition'),
      )),
      h('tbody', {}, ...levels.map((l) => h('tr', {},
        h('td', {}, `${l.id} ${l.name ?? ''}`,
          !l.scored ? h('span', { class: 'badge', style: '--badge-color:#7d8aa5;margin-left:.4rem' }, 'not scored') : null),
        h('td', {}, l.valueName ?? l.v2Name ?? ''),
        h('td', { class: 'mono faint' }, (l.band ?? '').replace('dea:maturity-band-', '')),
        h('td', { class: 'mono' }, l.min != null && l.max != null ? `${l.min}-${l.max}` : '-',
          l.canonical ? h('span', { class: 'faint', title: 'from canonical dea:maturity-bands-v2' }, ' *') : null),
        h('td', { class: 'mono' }, String(l.effort ?? '')),
        h('td', { class: 'dim' }, l.v2Name ? `v2 state: ${l.v2Name}` : ''),
      ))),
    );
    return h('div', { class: 'panel', style: 'margin-top:1.2rem' },
      h('h2', {}, 'Scale - ', h('span', { class: 'mono faint', style: 'font-size:.85rem' }, scale.id ?? '')),
      table,
      levels.some((l) => l.canonical)
        ? h('p', { class: 'faint', style: 'font-size:.75rem;margin-top:.4rem' },
            '* score range / effort from the canonical dea:maturity-bands-v2 instance (this scale’s band_reference)')
        : null,
    );
  }
}

async function relationshipsPanel(node: IndexNode): Promise<HTMLElement | null> {
  try {
    const manifest = await fetchManifest();
    const related = manifest.edges.filter((e) => e.source === node.id || e.target === node.id);
    if (!related.length) return null;

    const panel = h('div', { class: 'panel', style: 'margin-bottom:1.2rem' },
      h('div', { style: 'display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:.5rem' },
        h('h2', { style: 'margin:0' }, 'Ecosystem Relationships'),
        h('a', { class: 'mono', style: 'font-size:.78rem', href: '#/interactions' }, 'Trace CI propagation →'),
      ),
      h('p', { class: 'dim', style: 'font-size:.85rem;margin-bottom:.6rem' },
        'Handshakes, imports and shared components connecting this asset to peer models.'),
    );

    for (const edge of related) {
      const otherId = edge.source === node.id ? edge.target : edge.source;
      const other = manifest.nodes.find((n) => n.id === otherId);
      if (!other) continue;
      const direction = edge.source === node.id ? '→' : '←';
      const kindLabel = edge.kind === 'contract' ? 'Handshake' : edge.kind === 'touchpoint' ? 'Touchpoint' : edge.kind === 'imports' ? 'Imports' : 'Shared';

      panel.append(h('div', { class: 'rel-row' },
        h('span', { class: 'mono faint', style: 'min-width:6.2rem;font-size:.76rem' }, kindLabel),
        h('span', { class: 'mono' }, direction),
        h('a', { href: `#/model/${other.id}`, class: 'mono' }, other.name),
        h('span', { class: 'dim mono', style: 'font-size:.76rem;margin-left:auto' }, other.group),
      ));
    }
    return panel;
  } catch {
    return null;
  }
}
