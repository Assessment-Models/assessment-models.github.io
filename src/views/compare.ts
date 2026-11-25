/**
 * Compare view - two modes:
 *  1. Trial results: side-by-side of two saved trial runs (overlay radar +
 *     delta table). Trials live in localStorage (src/state/trials.ts).
 *  2. Model structures: any two model assets side by side (dimensions,
 *     criteria, weights, scale levels, contract) via loadModelStructure.
 */
import type { ModelStructure } from '../types';
import type { EngineLevel } from '../scoring/engine';
import { loadModelStructure } from '../data/loader';
import {
  aggregate,
  cascadeOperationalized,
  levelsFromScale,
  resolveLevel,
} from '../scoring/engine';
import { listTrials, type SavedTrial } from '../state/trials';
import { errorPanel, h } from './shared';

type Mode = 'trials' | 'structures';

interface SideDims {
  dims: { id: string; score: number; weight: number; mandatory?: boolean }[];
  overall: number;
  levelId: string;
  band: string;
  status: string;
}

function computeSide(
  line: 'operationalized' | 'composite',
  st: SavedTrial['state'],
  structure: ModelStructure,
  scaleLevels: ReturnType<typeof levelsFromScale>,
): SideDims {
  let dimScores: { id: string; score: number; weight: number; mandatory?: boolean }[];
  if (line === 'operationalized' && structure.operationalized) {
    const dims = structure.operationalized.dimensions.filter((d) => st.scope.includes(d.id));
    dimScores = cascadeOperationalized(dims, st.anchors).dimScores;
  } else {
    const crits = (structure.composite.evaluation?.criteria ?? []).filter((c) => st.scope.includes(c.id));
    dimScores = crits.map((c) => ({
      id: c.id,
      score: st.scores[c.id] ?? 0,
      weight: c.weight ?? 1 / Math.max(1, crits.length),
      mandatory: c.mandatory,
    }));
  }
  const overall = aggregate(dimScores);
  const res = resolveLevel(overall, dimScores, scaleLevels);
  return {
    dims: dimScores,
    overall,
    levelId: res.resolved?.id ?? '-',
    band: res.resolved?.band?.replace('dea:maturity-band-', '') ?? '-',
    status: res.status,
  };
}

export async function renderCompare(root: HTMLElement): Promise<void> {
  root.append(h('div', { class: 'page-head' },
    h('h1', {}, 'Compare'),
    h('p', { class: 'lede' },
      'Side-by-side comparisons across the ecosystem: saved trial runs from your browser, or the declared structure of any two model assets.'),
  ));

  const tabs = h('div', { class: 'tabs no-print' });
  const content = h('div', {});
  let mode: Mode = 'trials';

  function drawTabs(): void {
    tabs.innerHTML = '';
    for (const [key, label] of [['trials', 'Trial results'], ['structures', 'Model structures']] as [Mode, string][]) {
      const t = h('button', { class: `tab${mode === key ? ' active' : ''}` }, label);
      t.addEventListener('click', () => {
        mode = key;
        drawTabs();
        draw();
      });
      tabs.append(t);
    }
  }

  function picker(options: { value: string; label: string }[], id: string, selectedIndex = 0): HTMLSelectElement {
    const sel = h('select', { class: 'target-select', id, style: 'min-width:22em' }) as HTMLSelectElement;
    for (const o of options) {
      const opt = h('option', { value: o.value }, o.label) as HTMLOptionElement;
      if (options.indexOf(o) === selectedIndex) opt.selected = true;
      sel.append(opt);
    }
    if (sel.selectedIndex < 0 && sel.options.length) sel.selectedIndex = 0;
    return sel;
  }

  // ---------------- mode: trial results ----------------
  async function drawTrials(): Promise<void> {
    const saved = listTrials();
    if (saved.length < 2) {
      content.append(errorPanel(
        'Need two saved trials',
        `Found ${saved.length}. Run trials in at least two models (or two lines) - progress is kept in your browser. The digital-transformation model supports both a composite and an operationalized line.`,
      ));
      return;
    }

    const options = saved.map((t, i) => ({
      value: `${t.repo}||${t.line}`,
      label: `${t.repo} · ${t.line} (${new Date(t.state.ts ?? Date.now()).toISOString().slice(0, 16).replace('T', ' ')})${i === 0 ? ' - latest' : ''}`,
    }));
    const selA = picker(options, 'cmp-a');
    const selB = picker(options, 'cmp-b', Math.min(1, options.length - 1));

    const go = h('button', { class: 'btn primary small' }, 'Compare');
    const bar = h('div', { class: 'panel', style: 'display:flex;gap:.8rem;align-items:center;flex-wrap:wrap;margin-bottom:1rem' },
      h('span', { class: 'dim', style: 'font-size:.85rem' }, 'A'), selA,
      h('span', { class: 'dim' }, 'vs'),
      h('span', { class: 'dim', style: 'font-size:.85rem' }, 'B'), selB,
      go,
    );
    content.append(bar);

    const body = h('div', {});
    content.append(body);

    async function run(): Promise<void> {
      body.innerHTML = '';
      const [repoA, lineA] = selA.value.split('||') as [string, 'operationalized' | 'composite'];
      const [repoB, lineB] = selB.value.split('||') as [string, 'operationalized' | 'composite'];
      const ta = saved.find((t) => t.repo === repoA && t.line === lineA)!;
      const tb = saved.find((t) => t.repo === repoB && t.line === lineB)!;

      const [structA, structB] = await Promise.all([loadModelStructure(repoA), loadModelStructure(repoB)]);
      const levelsA = levelsFromScale(lineA === 'operationalized' ? structA.operationalized?.scale ?? null : structA.composite.scale);
      const levelsB = levelsFromScale(lineB === 'operationalized' ? structB.operationalized?.scale ?? null : structB.composite.scale);
      const sideA = computeSide(lineA, ta.state, structA, levelsA);
      const sideB = computeSide(lineB, tb.state, structB, levelsB);

      // summary cards
      body.append(h('div', { class: 'report-grid' },
        sideCard('A', repoA, lineA, sideA),
        sideCard('B', repoB, lineB, sideB),
      ));

      // delta table over the union of dimension ids
      const ids = [...new Set([...sideA.dims.map((d) => d.id), ...sideB.dims.map((d) => d.id)])];
      const mapA = new Map(sideA.dims.map((d) => [d.id, d]));
      const mapB = new Map(sideB.dims.map((d) => [d.id, d]));
      body.append(h('div', { class: 'panel', style: 'margin-top:1.2rem' },
        h('h2', {}, 'Dimension deltas'),
        h('table', { class: 'report-table' },
          h('thead', {}, h('tr', {},
            h('th', {}, 'Dimension'), h('th', {}, 'A'), h('th', {}, 'B'), h('th', {}, 'Δ (B−A)'),
          )),
          h('tbody', {}, ...ids.map((id) => {
            const a = mapA.get(id)?.score ?? 0;
            const b = mapB.get(id)?.score ?? 0;
            const d = Math.round((b - a) * 100) / 100;
            return h('tr', {},
              h('td', { class: 'mono' }, id),
              h('td', { class: 'mono' }, String(a)),
              h('td', { class: 'mono' }, String(b)),
              h('td', { class: `mono ${d > 0 ? '' : d < 0 ? 'faint' : 'faint'}`,
                style: `color:${d > 0 ? 'var(--good)' : d < 0 ? 'var(--bad)' : 'var(--text-faint)'}` },
                d > 0 ? `+${d}` : String(d)),
            );
          })),
        ),
      ));

      // radar overlay (lazy Chart.js)
      const canvas = h('canvas', {}) as HTMLCanvasElement;
      body.append(h('div', { class: 'panel', style: 'margin-top:1.2rem' },
        h('h2', {}, 'Overlay'),
        h('div', { class: 'chart-box' }, canvas)));
      const ChartCtor = (await import('chart.js/auto')).default;
      new ChartCtor(canvas, {
        type: 'radar',
        data: {
          labels: ids,
          datasets: [
            { label: `A · ${repoA} (${lineA})`, data: ids.map((id) => mapA.get(id)?.score ?? 0), borderColor: '#7c8cf8', backgroundColor: 'rgba(124,140,248,0.15)', borderWidth: 2, pointBackgroundColor: '#b9a8ff' },
            { label: `B · ${repoB} (${lineB})`, data: ids.map((id) => mapB.get(id)?.score ?? 0), borderColor: '#55c47f', backgroundColor: 'rgba(85,196,127,0.12)', borderWidth: 2, pointBackgroundColor: '#8fe0ab' },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { labels: { color: '#8b98b8' } } },
          scales: { r: { min: 0, max: 100, ticks: { color: '#5b6a8c', backdropColor: 'transparent', stepSize: 25 }, grid: { color: 'rgba(139,152,184,0.15)' }, angleLines: { color: 'rgba(139,152,184,0.15)' }, pointLabels: { color: '#d7deeb', font: { family: 'monospace', size: 11 } } } },
        },
      });
    }
    go.addEventListener('click', () => void run());
    try {
      await run();
    } catch (err) {
      body.innerHTML = '';
      body.append(errorPanel('Compare failed', err instanceof Error ? err.message : String(err)));
    }
  }

  function sideCard(tag: string, repo: string, line: string, s: SideDims): HTMLElement {
    return h('div', { class: 'panel' },
      h('span', { class: 'badge', style: '--badge-color:#c76fd1' }, tag),
      h('div', { class: 'mono', style: 'margin:.4rem 0' }, repo, h('span', { class: 'faint' }, ` · ${line}`)),
      h('div', { style: 'font-size:2rem;font-weight:640;font-family:var(--mono)' }, s.overall.toFixed(2)),
      h('div', { style: 'margin:.3rem 0' },
        h('span', { class: 'badge', style: '--badge-color:#55c47f' }, s.levelId)),
      h('div', { class: 'dim', style: 'font-size:.82rem' }, `band: ${s.band} · ${s.status}`),
    );
  }

  // ---------------- mode: model structures ----------------
  async function drawStructures(): Promise<void> {
    const manifest = await (await import('../data/loader')).fetchManifest();
    const models = manifest.nodes.filter((n) =>
      ['maturity-models', 'assessment-models', 'assessment-tools'].includes(n.group));
    const options = models.map((n) => ({ value: n.id, label: `${n.name}${n.version ? ` (v${n.version})` : ''}` }));
    if (models.length < 2) {
      content.append(errorPanel('Not enough registered assets', 'At least two model-like assets are required.'));
      return;
    }
    const selA = picker(options, 'cmp-sa');
    const selB = picker(options, 'cmp-sb', Math.min(1, options.length - 1));
    const go = h('button', { class: 'btn primary small' }, 'Compare');
    content.append(h('div', { class: 'panel', style: 'display:flex;gap:.8rem;align-items:center;flex-wrap:wrap;margin-bottom:1rem' },
      h('span', { class: 'dim', style: 'font-size:.85rem' }, 'A'), selA,
      h('span', { class: 'dim' }, 'vs'),
      h('span', { class: 'dim', style: 'font-size:.85rem' }, 'B'), selB,
      go,
    ));
    const body = h('div', {});
    content.append(body);

    async function run(): Promise<void> {
      body.innerHTML = '';
      body.append(h('div', { class: 'spinner-box' }, h('span', { class: 'spinner' }), h('span', {}, 'Loading structures…')));
      const [nodeA, nodeB] = [
        models.find((n) => n.id === selA.value)!,
        models.find((n) => n.id === selB.value)!,
      ];
      let sa: ModelStructure | null = null;
      let sb: ModelStructure | null = null;
      let loadErr: string | null = null;
      try {
        [sa, sb] = await Promise.all([loadModelStructure(nodeA.repo!), loadModelStructure(nodeB.repo!)]);
      } catch (err) {
        loadErr = err instanceof Error ? err.message : String(err);
      }
      body.innerHTML = '';
      if (!sa || !sb) {
        body.append(errorPanel('Could not load structures', loadErr ?? 'One of the two assets does not ship a readable model.yaml.'));
        return;
      }
      body.append(structTable(nodeA.id, nodeA.name, sa, nodeB.id, nodeB.name, sb));
    }
    go.addEventListener('click', () => void run());
    try {
      await run();
    } catch (err) {
      body.innerHTML = '';
      body.append(errorPanel('Compare failed', err instanceof Error ? err.message : String(err)));
    }
  }

  function structTable(idA: string, nameA: string, a: ModelStructure, idB: string, nameB: string, b: ModelStructure): HTMLElement {
    const stats = (s: ModelStructure) => {
      const dims = s.operationalized?.dimensions.length ?? s.composite.evaluation?.criteria?.length ?? 0;
      const subdims = s.operationalized?.dimensions.reduce((n, d) => n + (d.sub_dimensions?.length ?? 0), 0) ?? 0;
      const crits = s.operationalized
        ? s.operationalized.dimensions.reduce((n, d) => n + (d.sub_dimensions ?? []).reduce((m, sub) => m + (sub.criteria?.length ?? 0), 0), 0)
        : (s.composite.evaluation?.criteria?.length ?? 0);
      const levels = levelsFromScale(s.operationalized?.scale ?? s.composite.scale);
      return { dims, subdims, crits, levels };
    };
    const ra = stats(a);
    const rb = stats(b);
    const row = (label: string, va: string, vb: string) => h('tr', {},
      h('td', { class: 'dim', style: 'font-size:.82rem' }, label),
      h('td', { class: 'mono' }, va),
      h('td', { class: 'mono' }, vb));
    const levelsRows = (la: EngineLevel[], lb: EngineLevel[]) => {
      const n = Math.max(la.length, lb.length);
      const rows: HTMLElement[] = [];
      for (let i = 0; i < n; i++) {
        const fa = la[i], fb = lb[i];
        rows.push(h('tr', {},
          h('td', { class: 'mono' },
            fa ? `${fa.id} ${fa.name ?? ''}` : '-',
            fa && !fa.scored ? h('span', { class: 'badge', style: '--badge-color:#7d8aa5;margin-left:.4rem' }, 'not scored') : null),
          h('td', { class: 'mono' },
            fb ? `${fb.id} ${fb.name ?? ''}` : '-',
            fb && !fb.scored ? h('span', { class: 'badge', style: '--badge-color:#7d8aa5;margin-left:.4rem' }, 'not scored') : null),
        ));
      }
      return rows;
    };
    return h('div', {},
      h('div', { class: 'report-grid' },
        h('div', { class: 'panel' }, h('h3', {}, nameA), h('p', { class: 'mono faint' }, idA)),
        h('div', { class: 'panel' }, h('h3', {}, nameB), h('p', { class: 'mono faint' }, idB)),
      ),
      h('table', { class: 'report-table', style: 'margin-top:1rem' },
        h('thead', {}, h('tr', {}, h('th', {}, ''), h('th', {}, 'A'), h('th', {}, 'B'))),
        h('tbody', {},
          row('Dimensions', String(ra.dims), String(rb.dims)),
          row('Sub-dimensions', String(ra.subdims), String(rb.subdims)),
          row('Criteria', String(ra.crits), String(rb.crits)),
          row('Contract', String(a.meta.id ?? '-'), String(b.meta.id ?? '-')),
          row('Model version', String(a.meta.version ?? '-'), String(b.meta.version ?? '-')),
        ),
      ),
      h('table', { class: 'report-table', style: 'margin-top:1rem' },
        h('thead', {}, h('tr', {}, h('th', {}, `Scale levels - ${idA}`), h('th', {}, `Scale levels - ${idB}`))),
        h('tbody', {}, ...levelsRows(ra.levels, rb.levels)),
      ),
    );
  }

  function draw(): void {
    content.innerHTML = '';
    if (mode === 'trials') void drawTrials();
    else void drawStructures();
  }

  root.append(tabs, content);
  drawTabs();
  draw();
}
