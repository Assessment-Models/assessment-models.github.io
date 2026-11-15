/**
 * Model drill-down — full navigation of a model repository's structure:
 * dimensions → sub-dimensions → criteria → level anchors / evidence, plus
 * component imports, the contract handshake and the scale definition.
 */
import type { ModelStructure, OpDimension, OpSubDimension, Scale } from '../types';
import { loadModelStructure } from '../data/loader';
import { conformanceBadge, errorPanel, fetchNodeSafe, h, repoUrl } from './shared';

type Line = 'operationalized' | 'composite';

export async function renderModel(root: HTMLElement, id: string): Promise<void> {
  const node = await fetchNodeSafe(id);
  const repo = node.repo; // manifest stores the bare repository name
  if (!repo) {
    root.append(errorPanel('Not a model repository', `“${id}” has no backing repository.`));
    return;
  }

  let structure: ModelStructure;
  try {
    structure = await loadModelStructure(repo);
  } catch (err) {
    root.append(errorPanel('Could not load model structure', err instanceof Error ? err.message : String(err)));
    return;
  }

  const hasOp = !!structure.operationalized;
  let line: Line = hasOp ? 'operationalized' : 'composite';
  let openLine = line;

  // ---------- header ----------
  const metaName = structure.meta.name ?? node.name;
  const version = structure.meta.version ?? node.version ?? '';
  const head = h('div', { class: 'model-head' },
    h('div', {},
      h('h1', {}, metaName),
      h('div', { class: 'meta-row' },
        h('span', { class: 'badge', style: '--badge-color:#8b7cf8' }, `model.yaml v${version}`),
        node.version && node.version !== version
          ? h('span', { class: 'badge', style: '--badge-color:#7d8aa5' }, `registry v${node.version}`)
          : null,
        conformanceBadge(node),
        node.contract ? h('span', { class: 'badge', style: '--badge-color:#c76fd1' }, node.contract) : null,
        structure.meta.status ? h('span', { class: 'badge', style: '--badge-color:#7d8aa5' }, structure.meta.status) : null,
      ),
      h('p', { class: 'dim', style: 'max-width:70ch;margin-top:.5rem' },
        structure.meta.description ?? node.description),
    ),
    h('div', { class: 'actions' },
      h('a', { class: 'btn primary', href: `#/trial/${id}` }, 'Start trial →'),
      h('a', { class: 'btn', href: repoUrl(repo), target: '_blank', rel: 'noopener' }, 'GitHub ↗'),
    ),
  );
  root.append(head);

  // ---------- line tabs + search ----------
  let content = h('div', {});
  const search = h('input', { class: 'search-input no-print', placeholder: 'Filter criteria by text…', type: 'search' });
  const tabs = h('div', { class: 'tabs no-print' });

  function drawTabs(): void {
    tabs.innerHTML = '';
    const lines: Line[] = hasOp ? ['operationalized', 'composite'] : ['composite'];
    for (const l of lines) {
      const t = h('button', { class: `tab${l === openLine ? ' active' : ''}` },
        l === 'operationalized' ? 'Operationalized line' : 'Composite line');
      t.addEventListener('click', () => {
        openLine = l;
        drawTabs();
        drawContent();
      });
      tabs.append(t);
    }
  }

  function drawContent(): void {
    content.innerHTML = '';
    search.style.display = openLine === 'operationalized' ? 'block' : 'none';
    if (openLine === 'operationalized' && structure.operationalized) {
      content.append(opLineView(structure));
    } else {
      content.append(compositeView(structure));
      if (structure.composite.scale) content.append(scaleView(structure.composite.scale));
    }
    if (openLine === 'operationalized' && structure.operationalized) {
      content.append(scaleView(structure.operationalized.scale));
    }
    wireSearch();
  }

  function wireSearch(): void {
    const q = (search.value ?? '').toLowerCase().trim();
    if (!q) return;
    content.querySelectorAll<HTMLElement>('.crit, .subdim, .dim-card').forEach((el) => {
      if (!el.matches('.dim-card')) {
        const card = el.closest('.dim-card');
        if (card && !card.querySelector('.crit, .subdim')?.textContent?.toLowerCase().includes(q)) {
          (el.closest('.dim-card') as HTMLElement).style.display = 'none';
        }
        if (!el.textContent?.toLowerCase().includes(q)) el.style.display = 'none';
        else el.style.display = '';
      }
    });
    // auto-open cards containing matches
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

  // ---------- line renderers ----------

  function opLineView(s: ModelStructure): HTMLElement {
    const dims = s.operationalized!.dimensions;
    const wrap = h('div', {});
    for (const dim of dims) wrap.append(dimensionCard(dim));
    return wrap;
  }

  function dimensionCard(dim: OpDimension): HTMLElement {
    const card = h('div', { class: 'panel dim-card open' });
    const body = h('div', { class: 'dim-body' });
    const headEl = h('div', { class: 'dim-head' },
      h('span', { class: 'caret' }, '▸'),
      h('h3', { style: 'margin:0' }, `${(dim.dimension ?? dim.id).toUpperCase()} — ${dim.name}`),
      h('span', { class: 'dim-weight' }, `weight ${dim.weight}`),
      h('span', { style: 'flex:1' }),
    );
    headEl.addEventListener('click', () => card.classList.toggle('open'));
    card.append(headEl);

    if (dim.description) body.append(h('p', { class: 'dim', style: 'font-size:.86rem' }, dim.description));

    for (const sub of dim.sub_dimensions ?? []) body.append(subdimView(sub));
    card.append(body);
    return card;
  }

  function subdimView(sub: OpSubDimension): HTMLElement {
    const box = h('div', { class: 'subdim' },
      h('div', { class: 'subdim-name' }, sub.name),
      sub.lite_question ? h('div', { class: 'lite-q' }, `“${sub.lite_question}”`) : null,
    );
    for (const c of sub.criteria ?? []) {
      box.append(h('div', { class: 'crit' },
        h('div', { class: 'crit-name' }, c.name),
        c.statement ? h('div', { class: 'crit-statement' }, c.statement) : null,
        c.levers?.length
          ? h('div', { class: 'levers' }, ...c.levers.map((l) => h('span', { class: 'lever' }, l)))
          : null,
        anchorsView(c.anchors ?? []),
        c.evidence?.length
          ? h('ul', { class: 'evidence' }, ...c.evidence.map((e) => h('li', {}, e)))
          : null,
      ));
    }
    return box;
  }

  function anchorsView(anchors: { level: number; text: string }[]): HTMLElement {
    if (!anchors.length) return h('div', {});
    const names: Record<number, string> = { 1: 'L-0', 2: 'L-1', 3: 'L-2', 4: 'L-3', 5: 'L-4' };
    return h('div', { class: 'anchors' },
      ...anchors.map((a) => h('div', { class: 'anchor-row' },
        h('span', { class: 'lvl' }, names[a.level] ?? `L-${a.level - 1}`),
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
    wrap.append(h('p', { class: 'dim', style: 'font-size:.86rem;margin-bottom:.8rem' }, ev.description ?? ''));
    for (const c of ev.criteria ?? []) {
      wrap.append(h('div', { class: 'panel', style: 'margin-bottom:.8rem' },
        h('div', { style: 'display:flex;gap:.6rem;align-items:baseline;flex-wrap:wrap' },
          h('h3', { style: 'margin:0' }, c.name ?? c.id),
          h('span', { class: 'mono dim' }, c.id),
          c.weight != null ? h('span', { class: 'dim-weight dim-weight mono' }, `weight ${c.weight}`) : null,
          c.mandatory ? h('span', { class: 'badge', style: '--badge-color:#e26d6d' }, 'mandatory') : null,
        ),
        c.description ? h('p', { class: 'dim', style: 'font-size:.85rem' }, c.description) : null,
        c.evidence_requirements?.length
          ? h('ul', { class: 'evidence' }, ...c.evidence_requirements.map((e) => h('li', {}, e)))
          : null,
        c.level_expectations?.length
          ? h('div', { style: 'margin-top:.5rem' },
              ...c.level_expectations.map((le) => h('div', { class: 'lv-expect' },
                h('span', { class: 'lvl' }, le.level),
                h('span', { class: 'dim' }, le.expectation),
              )))
          : null,
      ));
    }
    // component files (imported/extended packages)
    const comps = s.composite.componentFiles.filter((f) => f.data);
    if (comps.length) {
      wrap.append(h('h2', { style: 'margin-top:1.4rem' }, 'Component packages'),
        h('p', { class: 'dim', style: 'font-size:.85rem' },
          'Reusable maturity components imported by this model (see maturity-components).'));
      for (const f of comps) {
        wrap.append(h('div', { class: 'panel', style: 'margin-bottom:.6rem' },
          h('div', { style: 'display:flex;gap:.6rem;align-items:baseline' },
            h('h3', { style: 'margin:0' }, (f.data!.name as string) ?? f.id),
            h('span', { class: 'mono dim' }, f.id),
            f.data!.version ? h('span', { class: 'badge', style: '--badge-color:#55c47f' }, `v${f.data!.version}`) : null,
          ),
          f.data!.description ? h('p', { class: 'dim', style: 'font-size:.85rem' }, String(f.data!.description)) : null,
        ));
      }
    }
    return wrap;
  }

  function scaleView(scale: Scale): HTMLElement {
    const levels = (scale.levels ?? []).filter((l) => Array.isArray(l.v2_score_range));
    if (!levels.length) return h('div', {});
    const table = h('table', { class: 'scale-table' },
      h('thead', {}, h('tr', {},
        h('th', {}, 'Level'), h('th', {}, 'Value name'), h('th', {}, 'Band'),
        h('th', {}, 'Score range'), h('th', {}, 'Effort'), h('th', {}, 'Definition'),
      )),
      h('tbody', {}, ...levels.map((l) => h('tr', {},
        h('td', {}, `${l.id} ${l.name ?? ''}`),
        h('td', {}, l.value_name ?? ''),
        h('td', { class: 'mono faint' }, (l.v2_band ?? '').replace('dea:maturity-band-', '')),
        h('td', { class: 'mono' }, `${l.v2_score_range![0]}–${l.v2_score_range![1]}`),
        h('td', { class: 'mono' },
          String((scale.progression?.effort_multiplier as Record<string, number>)?.[l.id] ?? '')),
        h('td', { class: 'dim' }, l.short_description ?? l.definition ?? ''),
      ))),
    );
    return h('div', { class: 'panel', style: 'margin-top:1.2rem' },
      h('h2', {}, 'Scale — ', h('span', { class: 'mono faint', style: 'font-size:.85rem' }, scale.id ?? '')),
      table,
    );
  }
}
