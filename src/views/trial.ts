/**
 * Trial assessment runner — scope selection, interactive scoring (anchors
 * 1–5 on the operationalized line, 0–100 sliders on the composite line),
 * evidence notes, target levels, live cascade sidebar, localStorage resume.
 */
import type { OpDimension } from '../types';
import { loadModelStructure } from '../data/loader';
import {
  aggregate,
  cascadeOperationalized,
  effortAdjusted,
  levelsFromScale,
  resolveLevel,
} from '../scoring/engine';
import { errorPanel, fetchNodeSafe, h, toast } from './shared';

type Line = 'operationalized' | 'composite';

interface TrialState {
  scope: string[]; // dimension ids in scope
  anchors: Record<string, number>; // leaf-criterion anchor 1..5 (operationalized)
  scores: Record<string, number>; // composite criterion 0..100
  notes: Record<string, string>;
  targets: Record<string, string>; // dimension id → target level id
  ts?: number;
}

const LEVELS = ['L-0', 'L-1', 'L-2', 'L-3', 'L-4'];
const LEVEL_OF_ANCHOR: Record<number, string> = { 1: 'L-0', 2: 'L-1', 3: 'L-2', 4: 'L-3', 5: 'L-4' };

function storageKey(repo: string, line: Line): string {
  return `am-trial-${repo}-${line}`;
}

function loadState(repo: string, line: Line): TrialState | null {
  try {
    const raw = localStorage.getItem(storageKey(repo, line));
    return raw ? (JSON.parse(raw) as TrialState) : null;
  } catch {
    return null;
  }
}

function saveState(repo: string, line: Line, st: TrialState): void {
  try {
    localStorage.setItem(storageKey(repo, line), JSON.stringify({ ...st, ts: Date.now() }));
  } catch {
    /* private mode etc. */
  }
}

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
  let st: TrialState = loadState(repo, line) ?? blankState(line);

  function blankState(l: Line): TrialState {
    if (l === 'operationalized' && structure.operationalized) {
      const anchors: Record<string, number> = {};
      const targets: Record<string, string> = {};
      for (const dim of structure.operationalized.dimensions) {
        targets[dim.id] = 'L-3';
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
    for (const c of structure.composite.evaluation?.criteria ?? []) {
      scores[c.id] = 0;
      targets[c.id] = 'L-3';
    }
    return {
      scope: (structure.composite.evaluation?.criteria ?? []).map((c) => c.id),
      anchors: {}, scores, notes: {}, targets,
    };
  }

  function persist(): void {
    saveState(repo, line, st);
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
        st = loadState(repo, line) ?? blankState(line);
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

  function renderSide(): void {
    side.innerHTML = '';
    const scale = line === 'operationalized' ? structure.operationalized?.scale ?? null : structure.composite.scale;
    const levels = levelsFromScale(scale);
    const dimScores = currentDimScores();
    const overall = aggregate(dimScores);
    const res = resolveLevel(overall, dimScores, levels);
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
              `${resolved.id} — ${resolved.valueName ?? resolved.name ?? ''}`))
        : null,
      h('div', { class: 'sub' },
        `band: ${resolved?.band?.replace('dea:maturity-band-', '') ?? '—'} · ${res.status}`),
      effort != null ? h('div', { class: 'sub' }, `effort-adjusted: ${effort} (×${resolved?.effort})`) : null,
    );

    const reportBtn = h('a', { class: 'btn primary', href: `#/report/${node.id}`, style: 'justify-content:center' }, 'Generate report →');
    const resetBtn = h('button', { class: 'btn small', style: 'justify-content:center' }, 'Reset trial');
    resetBtn.addEventListener('click', () => {
      st = blankState(line);
      persist();
      rebuild();
      toast('Trial reset');
    });

    side.append(box, cascade, reportBtn, resetBtn);
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
    const target = h('select', { class: 'target-select' },
      ...LEVELS.map((l) => {
        const opt = h('option', { value: l }, l) as HTMLOptionElement;
        if (st.targets[dim.id] === l) opt.selected = true;
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
            const b = h('button', {
              class: `anchor-btn${cur === lv ? ' on' : ''}`,
              title: LEVEL_OF_ANCHOR[lv],
              'data-lv': String(lv),
            }, LEVEL_OF_ANCHOR[lv]);
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
          h('div', { class: 'crit-name' }, c.name),
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

export type { TrialState };
