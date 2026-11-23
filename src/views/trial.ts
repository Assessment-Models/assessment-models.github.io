/**
 * Trial assessment runner — scope selection, interactive scoring (anchors
 * 1–5 on the operationalized line, 0–100 sliders on the composite line),
 * evidence notes, target levels, live cascade sidebar, localStorage resume.
 */
import type { OpDimension } from '../types';
import { loadTrial, saveTrial } from '../state/trials';
import { loadModelStructure } from '../data/loader';
import {
  aggregate,
  cascadeOperationalized,
  effortAdjusted,
  levelLabel,
  levelsFromScale,
  resolveLevel,
  scoredLevels,
} from '../scoring/engine';
import { errorPanel, fetchNodeSafe, h, toast } from './shared';
import { Chart, RadarController, RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend } from 'chart.js';

Chart.register(RadarController, RadialLinearScale, PointElement, LineElement, Filler, Tooltip, Legend);

type Line = 'operationalized' | 'composite';

type TrialState = import('../state/trials').TrialState;

export async function renderTrial(root: HTMLElement, id: string): Promise<void> {
  const node = await fetchNodeSafe(id);
  const repo = node.repo ?? ''; // manifest stores the bare repository name
  if (!repo) {
    root.append(errorPanel('Not a model repository', `“${id}” has no backing repository.`));
    return;
  }
  const structure = await loadModelStructure(repo);
  const hasOp = !!structure.operationalized;

  root.append(h('div', { class: 'page-head' },
    h('h1', {}, 'Trial assessment — ', h('span', { class: 'mono' }, node.name)),
    h('p', { class: 'lede' },
      'Score in the browser; nothing leaves your machine. The cascade follows the model’s own ',
      h('span', { class: 'mono' }, 'evaluation.yaml'),
      ' contract. Progress is kept in localStorage and travels with the report export.'),
  ));

  // ----- mutable session state -----
  let line: Line = hasOp ? 'operationalized' : 'composite';
  let st: TrialState = loadTrial(repo, line) ?? blankState(line);

  /** This line's scored levels in ascending order (native ids, excludes "Not Assessed"). */
  function lineScoredLevels(l: Line = line) {
    const scale = l === 'operationalized' ? structure.operationalized?.scale ?? null : structure.composite.scale;
    return scoredLevels(levelsFromScale(scale));
  }
  /** Anchor N ↔ the Nth scored level (anchor scale is 1..5 regardless of level count). */
  function anchorLevelId(anchor: number): string {
    const scored = lineScoredLevels();
    return scored[anchor - 1]?.id ?? `anchor-${anchor}`;
  }
  /** Default target = the middle scored level (index 2 of 5, or closest available). */
  function defaultTargetId(): string {
    const scored = lineScoredLevels();
    return scored[Math.min(2, scored.length - 1)]?.id ?? '';
  }

  function blankState(l: Line): TrialState {
    if (l === 'operationalized' && structure.operationalized) {
      const anchors: Record<string, number> = {};
      const targets: Record<string, string> = {};
      const defTarget = defaultTargetId();
      for (const dim of structure.operationalized.dimensions) {
        targets[dim.id] = defTarget;
        for (const sub of dim.sub_dimensions ?? []) {
          for (const c of sub.criteria ?? []) anchors[c.id] = 1;
        }
      }
      return {
        scope: structure.operationalized.dimensions.map((d) => d.id),
        anchors, scores: {}, notes: {}, targets,
      };
    }
    const scores: Record<string, number> = {};
    const targets: Record<string, string> = {};
    const defTarget = defaultTargetId();
    for (const c of structure.composite.evaluation?.criteria ?? []) {
      scores[c.id] = 0;
      targets[c.id] = defTarget;
    }
    return {
      scope: (structure.composite.evaluation?.criteria ?? []).map((c) => c.id),
      anchors: {}, scores, notes: {}, targets,
    };
  }

  function persist(): void {
    saveTrial(repo, line, st);
  }

  // ----- shell -----
  const tabs = h('div', { class: 'tabs no-print' });
  const grid = h('div', { class: 'trial-grid' });
  const left = h('div', {});
  const side = h('div', { class: 'trial-side' });
  grid.append(left, side);
  root.append(tabs, grid);

  function drawTabs(): void {
    tabs.innerHTML = '';
    const lines: Line[] = hasOp ? ['operationalized', 'composite'] : ['composite'];
    for (const l of lines) {
      const t = h('button', { class: `tab${l === line ? ' active' : ''}` },
        l === 'operationalized' ? 'Operationalized line' : 'Composite line');
      t.addEventListener('click', () => {
        line = l;
        st = loadTrial(repo, line) ?? blankState(line);
        drawTabs();
        rebuild();
      });
      tabs.append(t);
    }
  }

  // ---------- sidebar ----------
  function currentDimScores(): { id: string; score: number; weight: number; mandatory?: boolean }[] {
    if (line === 'operationalized' && structure.operationalized) {
      const dims = structure.operationalized.dimensions.filter((d) => st.scope.includes(d.id));
      return cascadeOperationalized(dims, st.anchors).dimScores;
    }
    const crits = (structure.composite.evaluation?.criteria ?? []).filter((c) => st.scope.includes(c.id));
    return crits.map((c) => ({
      id: c.id,
      score: st.scores[c.id] ?? 0,
      weight: c.weight ?? 1 / Math.max(1, crits.length),
      mandatory: c.mandatory,
    }));
  }

  let radarChart: Chart | null = null;

  /**
   * AO closed-loop spine (evaluation.yaml gating rule): the resolved level
   * cannot exceed the level of the lowest in-scope `gating: true` criterion
   * (anchor N ↔ scored index N-1). Returns undefined when no gating criterion
   * is in scope.
   */
  function gatingConstraint() {
    if (line !== 'operationalized' || !structure.operationalized) return { opts: {}, binding: null as { id: string; anchor: number } | null };
    let binding: { id: string; anchor: number } | null = null;
    for (const dim of structure.operationalized.dimensions) {
      if (!st.scope.includes(dim.id)) continue;
      for (const sub of dim.sub_dimensions ?? []) {
        for (const c of sub.criteria ?? []) {
          if (!c.gating) continue;
          const anchor = st.anchors[c.id] ?? 1;
          if (!binding || anchor < binding.anchor) binding = { id: c.id, anchor };
        }
      }
    }
    if (!binding) return { opts: {}, binding: null };
    return { opts: { maxScoredIndex: binding.anchor - 1 }, binding };
  }

  function renderSide(): void {
    side.innerHTML = '';
    const scale = line === 'operationalized' ? structure.operationalized?.scale ?? null : structure.composite.scale;
    const levels = levelsFromScale(scale);
    const dimScores = currentDimScores();
    const overall = aggregate(dimScores);
    const gating = gatingConstraint();
    const res = resolveLevel(overall, dimScores, levels, gating.opts);
    const resolved = res.resolved;
    const effort = effortAdjusted(overall, resolved);
    const maxW = Math.max(...dimScores.map((d) => d.weight), 0.001);

    const cascade = h('div', { class: 'panel cascade' },
      h('h3', { style: 'margin-bottom:.4rem' }, 'Live cascade'),
      ...dimScores.map((d) =>
        h('div', { class: 'cascade-row' },
          h('span', { class: 'id' }, d.id),
          h('span', { class: 'bar' }, h('i', { style: `width:${d.score}%;opacity:${0.45 + 0.55 * (d.weight / maxW)}` })),
          h('span', { class: 'val' }, String(d.score)),
        ),
      ),
      h('div', { class: 'cascade-row', style: 'margin-top:.3rem;border-top:1px solid var(--border-soft);padding-top:.5rem' },
        h('span', { class: 'id' }, 'overall'),
        h('span', { class: 'bar' }, h('i', { style: `width:${overall}%` })),
        h('span', { class: 'val' }, overall.toFixed(2)),
      ),
    );

    const box = h('div', { class: 'panel overall-box' },
      h('div', { class: 'score' }, overall.toFixed(2)),
      resolved
        ? h('div', { class: 'lvl-badge' },
            h('span', { class: 'badge', style: '--badge-color:#55c47f;font-size:.9rem;padding:.25rem .9rem' },
              levelLabel(resolved)))
        : null,
      h('div', { class: 'sub' },
        `band: ${resolved?.band?.replace('dea:maturity-band-', '') ?? '—'} · ${res.status}`),
      gating.binding && res.banded && res.resolved && res.banded.id !== res.resolved.id
        ? h('div', { class: 'sub', style: 'color:var(--warn)' },
            `weakest-link gate: ${gating.binding.id} binds the resolved level`)
        : null,
      effort != null ? h('div', { class: 'sub' }, `effort-adjusted: ${effort} (×${resolved?.effort})`) : null,
    );

    const radarCanvas = h('canvas', { id: 'live-radar', style: 'max-height:220px;width:100%' }) as HTMLCanvasElement;
    const radarPanel = h('div', { class: 'panel' },
      h('h3', { style: 'margin-bottom:.4rem' }, 'Live radar'),
      radarCanvas,
    );

    const reportBtn = h('a', { class: 'btn primary', href: `#/report/${node.id}`, style: 'justify-content:center' }, 'Generate report →');
    const resetBtn = h('button', { class: 'btn small', style: 'justify-content:center' }, 'Reset trial');
    resetBtn.addEventListener('click', () => {
      st = blankState(line);
      persist();
      rebuild();
      toast('Trial reset');
    });

    side.append(box, radarPanel, cascade, reportBtn, resetBtn);

    // Render / update radar
    if (radarChart) radarChart.destroy();
    if (dimScores.length > 0) {
      radarChart = new Chart(radarCanvas, {
        type: 'radar',
        data: {
          labels: dimScores.map((d) => d.id),
          datasets: [{
            label: 'Current',
            data: dimScores.map((d) => d.score),
            borderColor: 'rgb(30, 58, 138)',
            backgroundColor: 'rgba(30, 58, 138, 0.15)',
            pointBackgroundColor: 'rgb(30, 58, 138)',
            pointBorderColor: '#fff',
            pointHoverBackgroundColor: '#fff',
            pointHoverBorderColor: 'rgb(30, 58, 138)',
          }],
        },
        options: {
          scales: {
            r: {
              min: 0,
              max: 100,
              ticks: { stepSize: 25, backdropColor: 'transparent', color: '#64748B' },
              grid: { color: 'rgba(15, 23, 42, 0.08)' },
              angleLines: { color: 'rgba(15, 23, 42, 0.08)' },
              pointLabels: { color: '#0F172A', font: { size: 11 } },
            },
          },
          plugins: { legend: { display: false } },
          maintainAspectRatio: false,
        },
      });
    }
  }

  // ---------- scoring column ----------
  function renderLeft(): void {
    left.innerHTML = '';
    if (line === 'operationalized' && structure.operationalized) {
      left.append(scopePanel(structure.operationalized.dimensions));
      for (const dim of structure.operationalized.dimensions) {
        if (!st.scope.includes(dim.id)) continue;
        left.append(dimensionEditor(dim));
      }
    } else {
      const ev = structure.composite.evaluation;
      if (!ev) {
        left.append(errorPanel('No evaluation model', 'This repository does not ship maturity/evaluation.yaml.'));
        return;
      }
      left.append(h('div', { class: 'panel', style: 'margin-bottom:1rem' },
        h('h3', {}, 'Scoring — composite line'),
        h('p', { class: 'dim', style: 'font-size:.82rem' },
          ev.scoring?.aggregation_rule ?? `mechanism: ${ev.scoring?.mechanism ?? 'weighted'}`),
      ));
      for (const c of ev.criteria ?? []) {
        if (!st.scope.includes(c.id)) continue;
        left.append(criterionSlider(c.id, c.name ?? c.id, c.weight, c));
      }
    }
  }

  function scopePanel(dims: OpDimension[]): HTMLElement {
    const panel = h('div', { class: 'panel', style: 'margin-bottom:1rem' },
      h('h3', {}, 'Scope'),
      h('p', { class: 'dim', style: 'font-size:.82rem;margin-bottom:.5rem' },
        'Dimensions in this trial. Mandatory dimensions gate the resolved level.'),
    );
    for (const dim of dims) {
      const cb = h('input', { type: 'checkbox' }) as HTMLInputElement;
      cb.checked = st.scope.includes(dim.id);
      cb.addEventListener('change', () => {
        st.scope = cb.checked
          ? [...st.scope, dim.id]
          : st.scope.filter((x) => x !== dim.id);
        persist();
        rebuild();
      });
      panel.append(h('label', { class: 'scope-row' }, cb,
        h('span', { class: 'mono' }, dim.id),
        h('span', {}, dim.name),
        dim.weight != null ? h('span', { class: 'faint mono' }, `×${dim.weight}`) : null,
      ));
    }
    return panel;
  }

  function dimensionEditor(dim: OpDimension): HTMLElement {
    const card = h('div', { class: 'panel', style: 'margin-bottom:1rem' });
    const scored = lineScoredLevels();
    const target = h('select', { class: 'target-select' },
      ...scored.map((l) => {
        const opt = h('option', { value: l.id }, l.id) as HTMLOptionElement;
        if (st.targets[dim.id] === l.id) opt.selected = true;
        return opt;
      }),
    );
    target.addEventListener('change', () => {
      st.targets[dim.id] = target.value;
      persist();
    });

    card.append(h('div', { style: 'display:flex;gap:.7rem;align-items:center;flex-wrap:wrap;margin-bottom:.2rem' },
      h('h3', { style: 'margin:0' }, `${(dim.dimension ?? dim.id).toUpperCase()} — ${dim.name}`),
      h('span', { class: 'mono dim' }, `weight ${dim.weight}`),
      h('span', { style: 'flex:1' }),
      h('span', { class: 'faint', style: 'font-size:.78rem' }, 'target'),
      target,
    ));
    if (dim.description) card.append(h('p', { class: 'dim', style: 'font-size:.82rem' }, dim.description));

    for (const sub of dim.sub_dimensions ?? []) {
      const box = h('div', { class: 'subdim' },
        h('div', { class: 'subdim-name' }, sub.name),
        sub.lite_question ? h('div', { class: 'lite-q' }, `“${sub.lite_question}”`) : null,
      );
      for (const c of sub.criteria ?? []) {
        const critId = c.id;
        const cur = st.anchors[critId] ?? 1;
        const set = h('div', { class: 'anchor-set', 'data-crit': critId },
          ...[1, 2, 3, 4, 5].map((lv) => {
            const label = anchorLevelId(lv);
            const b = h('button', {
              class: `anchor-btn${cur === lv ? ' on' : ''}`,
              title: label,
              'data-lv': String(lv),
            }, label);
            b.addEventListener('click', () => {
              st.anchors[critId] = lv;
              persist();
              for (const btn of set.querySelectorAll<HTMLButtonElement>('.anchor-btn')) {
                btn.classList.toggle('on', Number(btn.dataset.lv) === lv);
              }
              renderSide();
            });
            return b;
          }),
        );
        box.append(h('div', { class: 'crit', style: 'border-left-color:var(--border)' },
          h('div', { class: 'crit-name' }, c.name,
            c.gating ? h('span', { class: 'badge', style: '--badge-color:#e8b04b;margin-left:.5rem;font-size:.68rem', title: c.gating_note ?? 'weakest-link spine criterion' }, 'gating') : null),
          c.statement ? h('div', { class: 'crit-statement' }, c.statement) : null,
          set,
          noteInput(critId),
        ));
      }
      card.append(box);
    }
    return card;
  }

  function criterionSlider(
    cid: string,
    name: string,
    weight: number | undefined,
    c: { description?: string; level_expectations?: { level: string; expectation: string }[]; mandatory?: boolean },
  ): HTMLElement {
    const val = st.scores[cid] ?? 0;
    const range = h('input', {
      type: 'range', min: '0', max: '100', step: '1', value: String(val), style: 'width:100%',
    }) as HTMLInputElement;
    const num = h('span', { class: 'mono', style: 'min-width:3em;display:inline-block' }, String(val));
    range.addEventListener('input', () => {
      st.scores[cid] = Number(range.value);
      num.textContent = range.value;
      persist();
      renderSide();
    });

    return h('div', { class: 'panel', style: 'margin-bottom:.8rem' },
      h('div', { style: 'display:flex;gap:.6rem;align-items:baseline;flex-wrap:wrap' },
        h('h3', { style: 'margin:0' }, name),
        h('span', { class: 'mono dim' }, cid),
        weight != null ? h('span', { class: 'mono faint' }, `weight ${weight}`) : null,
        c.mandatory ? h('span', { class: 'badge', style: '--badge-color:#e26d6d' }, 'mandatory') : null,
        h('span', { style: 'flex:1' }),
        num,
      ),
      c.description ? h('p', { class: 'dim', style: 'font-size:.82rem' }, c.description) : null,
      c.level_expectations?.length
        ? h('details', { style: 'margin:.3rem 0' },
            h('summary', { class: 'dim', style: 'font-size:.8rem;cursor:pointer' }, 'level expectations'),
            ...c.level_expectations.map((le) => h('div', { class: 'lv-expect' },
              h('span', { class: 'lvl' }, le.level),
              h('span', { class: 'dim' }, le.expectation),
            )))
        : null,
      range,
      noteInput(cid),
    );
  }

  function noteInput(cid: string): HTMLTextAreaElement {
    const note = h('textarea', {
      class: 'note-input', placeholder: 'Evidence notes (kept locally)…', rows: '1',
    }) as HTMLTextAreaElement;
    note.value = st.notes[cid] ?? '';
    note.addEventListener('change', () => {
      st.notes[cid] = note.value;
      persist();
    });
    return note;
  }

  function rebuild(): void {
    renderLeft();
    renderSide();
  }

  drawTabs();
  rebuild();
}

