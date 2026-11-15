/**
 * Report view — generated from the trial state in localStorage:
 * executive summary (overall score, level, band, conformance status),
 * radar + cascade-contribution charts, gap-to-target, criterion detail,
 * print and JSON export. Everything is client-side.
 */
import type { OpCriterion } from '../types';
import { loadModelStructure } from '../data/loader';
import {
  aggregate,
  cascadeOperationalized,
  effortAdjusted,
  levelsFromScale,
  resolveLevel,
} from '../scoring/engine';
import type { TrialState } from './trial';
import { errorPanel, fetchNodeSafe, h, toast } from './shared';

interface ReportData {
  generatedAt: string;
  model: string;
  repo: string;
  line: 'operationalized' | 'composite';
  overall: number;
  level: string;
  levelName: string;
  band: string;
  status: string;
  effortMultiplier?: number;
  effortAdjusted?: number;
  dimensions: { id: string; name: string; score: number; weight: number; mandatory?: boolean; target: string; gap: number | null }[];
  criteria: { id: string; name: string; dimension: string; anchor?: number; score?: number; note?: string; evidence?: string[] }[];
}

export async function renderReport(root: HTMLElement, id: string): Promise<void> {
  const node = await fetchNodeSafe(id);
  const repo = node.repo; // manifest stores the bare repository name
  if (!repo) {
    root.append(errorPanel('Not a model repository', `“${id}” has no backing repository.`));
    return;
  }

  // load the last trial state for either line (operationalized preferred)
  const structure = await loadModelStructure(repo);
  const line: 'operationalized' | 'composite' = structure.operationalized ? 'operationalized' : 'composite';
  const raw = localStorage.getItem(`am-trial-${repo}-${line}`);
  if (!raw) {
    root.append(errorPanel('No trial data yet', 'Run a trial assessment first — the report is generated from your local trial state.'));
    return;
  }
  const st = JSON.parse(raw) as TrialState;

  const scale = line === 'operationalized' ? structure.operationalized?.scale ?? null : structure.composite.scale;
  const levels = levelsFromScale(scale);

  let dimScores: { id: string; score: number; weight: number; mandatory?: boolean; name: string }[];
  let criteriaRows: ReportData['criteria'];

  if (line === 'operationalized' && structure.operationalized) {
    const dims = structure.operationalized.dimensions.filter((d) => st.scope.includes(d.id));
    const res = cascadeOperationalized(dims, st.anchors);
    dimScores = res.dimScores.map((d) => ({
      ...d,
      name: structure.operationalized!.dimensions.find((x) => x.id === d.id)?.name ?? d.id,
    }));
    criteriaRows = collectOpCriteria(dims, st);
  } else {
    const crits = (structure.composite.evaluation?.criteria ?? []).filter((c) => st.scope.includes(c.id));
    dimScores = crits.map((c) => ({
      id: c.id,
      score: st.scores[c.id] ?? 0,
      weight: c.weight ?? 1 / Math.max(1, crits.length),
      mandatory: c.mandatory,
      name: c.name ?? c.id,
    }));
    criteriaRows = crits.map((c) => ({
      id: c.id,
      name: c.name ?? c.id,
      dimension: 'composite',
      score: st.scores[c.id] ?? 0,
      note: st.notes[c.id] || undefined,
      evidence: c.evidence_requirements,
    }));
  }

  const overall = aggregate(dimScores);
  const res = resolveLevel(overall, dimScores, levels);
  const resolved = res.resolved;
  const effort = effortAdjusted(overall, resolved);

  const gapRows = dimScores.map((d) => {
    const targetLevel = st.targets[d.id];
    const tl = levels.find((l) => l.id === targetLevel);
    return { ...d, target: targetLevel ?? '—', gap: tl ? Math.round((tl.min - d.score) * 100) / 100 : null };
  });

  const report: ReportData = {
    generatedAt: new Date().toISOString(),
    model: node.id,
    repo,
    line,
    overall,
    level: resolved?.id ?? '—',
    levelName: resolved?.valueName ?? resolved?.name ?? '—',
    band: resolved?.band?.replace('dea:maturity-band-', '') ?? '—',
    status: res.status,
    effortMultiplier: resolved?.effort,
    effortAdjusted: effort ?? undefined,
    dimensions: gapRows.map((g) => ({ id: g.id, name: g.name, score: g.score, weight: g.weight, mandatory: g.mandatory, target: g.target, gap: g.gap })),
    criteria: criteriaRows,
  };

  // ---------- header ----------
  root.append(h('div', { class: 'page-head no-print', style: 'display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap' },
    h('div', {},
      h('h1', {}, 'Assessment report — ', h('span', { class: 'mono' }, node.name)),
      h('p', { class: 'lede' }, `${report.line} line · generated ${report.generatedAt.slice(0, 16).replace('T', ' ')} · all computation client-side`),
    ),
    h('div', { style: 'display:flex;gap:.6rem;align-items:center' },
      h('button', { class: 'btn', id: 'export-json' }, 'Export JSON'),
      h('button', { class: 'btn', id: 'print-btn' }, 'Print / PDF'),
      h('a', { class: 'btn primary', href: `#/trial/${id}` }, '← Back to trial'),
    ),
  ));

  // ---------- hero ----------
  root.append(h('div', { class: 'panel report-hero' },
    h('div', { class: 'big-score' }, overall.toFixed(2)),
    h('div', { class: 'hero-meta' },
      h('span', { class: 'badge', style: '--badge-color:#55c47f;font-size:1rem;padding:.3rem 1rem' },
        `${report.level} — ${report.levelName}`),
      h('span', { class: 'dim' }, `band: ${report.band} · conformance: ${report.status}`),
      effort != null ? h('span', { class: 'dim' }, `effort-adjusted value: ${effort} (×${resolved?.effort})`) : null,
    ),
  ));

  // ---------- charts ----------
  const chartsGrid = h('div', { class: 'report-grid' });
  const radarCanvas = h('canvas', { id: 'radar-chart' });
  const contribCanvas = h('canvas', { id: 'contrib-chart' });
  const radarBox = h('div', { class: 'panel' }, h('h2', {}, 'Dimension profile'),
    h('div', { class: 'chart-box' }, radarCanvas));
  const contribBox = h('div', { class: 'panel' }, h('h2', {}, 'Cascade contributions'),
    h('p', { class: 'dim', style: 'font-size:.8rem' }, 'each dimension’s score × weight — the bars sum to the overall score'),
    h('div', { class: 'chart-box' }, contribCanvas));
  chartsGrid.append(radarBox, contribBox);
  root.append(chartsGrid);

  // ---------- gap analysis ----------
  const gapPanel = h('div', { class: 'panel', style: 'margin-top:1.2rem' },
    h('h2', {}, 'Gap to target'),
    h('p', { class: 'dim', style: 'font-size:.8rem' }, 'distance from each dimension’s current score to its selected target level’s band minimum'),
  );
  for (const g of gapRows) {
    const gap = g.gap;
    gapPanel.append(h('div', { class: 'gap-row' },
      h('span', { class: 'mono' }, g.id),
      h('span', { class: 'bar' }, h('i', {
        style: `width:${Math.max(0, Math.min(100, g.score))}%;background:${gap != null && gap <= 0 ? 'var(--good)' : 'linear-gradient(90deg, var(--accent), #b9a8ff)'}`,
      })),
      h('span', { class: 'mono dim' },
        gap == null ? '—' : gap <= 0 ? `target ${g.target} ✓` : `${g.score} → ${g.target} (+${gap})`),
    ));
  }
  root.append(gapPanel);

  // ---------- criterion detail ----------
  const critPanel = h('div', { class: 'panel', style: 'margin-top:1.2rem' },
    h('h2', {}, 'Criterion detail'),
    h('table', { class: 'report-table' },
      h('thead', {}, h('tr', {},
        h('th', {}, 'ID'), h('th', {}, 'Criterion'), h('th', {}, 'Dimension'),
        line === 'operationalized' ? h('th', {}, 'Anchor') : h('th', {}, 'Score'),
        h('th', {}, 'Evidence note'),
      )),
      h('tbody', {}, ...criteriaRows.map((c) => h('tr', {},
        h('td', { class: 'mono' }, c.id),
        h('td', {}, c.name),
        h('td', { class: 'mono faint' }, c.dimension),
        h('td', { class: 'mono' }, c.anchor != null ? `L-${c.anchor - 1} (${(c.anchor - 1) * 25})` : String(c.score ?? '')),
        h('td', { class: 'dim' }, c.note ?? ''),
      ))),
    ),
  );
  root.append(critPanel);

  root.append(h('p', { class: 'footer-note' },
    'Assessment Models — independently governed models, consistently engineered, operationally assessable and interoperable by design.',
  ));

  // ---------- export / print ----------
  document.getElementById('export-json')?.addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const a = h('a', {
      href: URL.createObjectURL(blob),
      download: `assessment-${report.model}-${report.level}.json`,
    }) as HTMLAnchorElement;
    a.click();
    URL.revokeObjectURL(a.href);
    toast('Report JSON exported');
  });
  document.getElementById('print-btn')?.addEventListener('click', () => window.print());

  // ---------- charts (lazy-loaded Chart.js) ----------
  const ChartCtor = (await import('chart.js/auto')).default;

  new ChartCtor(radarCanvas, {
    type: 'radar',
    data: {
      labels: report.dimensions.map((d) => d.id),
      datasets: [{
        label: 'score (0–100)',
        data: report.dimensions.map((d) => d.score),
        backgroundColor: 'rgba(124, 140, 248, 0.18)',
        borderColor: '#7c8cf8',
        pointBackgroundColor: '#b9a8ff',
        borderWidth: 2,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { labels: { color: '#8b98b8' } } },
      scales: {
        r: {
          min: 0,
          max: 100,
          ticks: { color: '#5b6a8c', backdropColor: 'transparent', stepSize: 25 },
          grid: { color: 'rgba(139, 152, 184, 0.15)' },
          angleLines: { color: 'rgba(139, 152, 184, 0.15)' },
          pointLabels: { color: '#d7deeb', font: { family: 'monospace', size: 11 } },
        },
      },
    },
  });

  new ChartCtor(contribCanvas, {
    type: 'bar',
    data: {
      labels: report.dimensions.map((d) => d.id),
      datasets: [{
        label: 'score × weight',
        data: report.dimensions.map((d) => Math.round(d.score * d.weight * 100) / 100),
        backgroundColor: 'rgba(85, 196, 127, 0.55)',
        borderColor: '#55c47f',
        borderWidth: 1,
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: '#8b98b8', font: { family: 'monospace', size: 11 } }, grid: { display: false } },
        y: { beginAtZero: true, ticks: { color: '#5b6a8c' }, grid: { color: 'rgba(139, 152, 184, 0.12)' } },
      },
    },
  });
}

function collectOpCriteria(
  dims: { id: string; sub_dimensions?: { criteria?: OpCriterion[] }[] }[],
  st: TrialState,
): ReportData['criteria'] {
  const rows: ReportData['criteria'] = [];
  for (const dim of dims) {
    for (const sub of dim.sub_dimensions ?? []) {
      for (const c of sub.criteria ?? []) {
        rows.push({
          id: c.id,
          name: c.name,
          dimension: dim.id,
          anchor: st.anchors[c.id] ?? 1,
          note: st.notes[c.id] || undefined,
          evidence: c.evidence,
        });
      }
    }
  }
  return rows;
}
