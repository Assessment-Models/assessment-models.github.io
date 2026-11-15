/**
 * Engine tests. Primary fixture: the worked example shipped in
 * maturity-model-digital-transformation/examples/operationalized-2026.yaml —
 * dimension scores d1..d6 with weights 0.20/0.20/0.20/0.15/0.10/0.15 must
 * aggregate to 67.20, band to dea:maturity-band-systematic and resolve to L-2
 * (conformant, effort multiplier 2.5, effort-adjusted 168.0).
 */
import {
  aggregate,
  anchorToScore,
  bandFor,
  cascadeOperationalized,
  effortAdjusted,
  levelsFromScale,
  resolveLevel,
  type EngineLevel,
} from './engine';
import type { Scale } from '../types';

// tiny assertion helpers (keeps the test runnable with zero extra deps)
function eq(actual: unknown, expected: unknown, msg?: string): void {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) throw new Error(`assertion failed: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}${msg ? ` — ${msg}` : ''}`);
}

// v2 bands from maturity/operationalized/scale.yaml (verified 2026-11-14)
const SCALE: Scale = {
  levels: [
    { id: 'L-0', ordinal: 0, name: 'Absent', v2_name: 'Emergent', value_name: 'Unrealized', v2_band: 'dea:maturity-band-emergent', v2_score_range: [0, 20] },
    { id: 'L-1', ordinal: 1, name: 'Piloting', v2_name: 'Structured', value_name: 'Proven', v2_band: 'dea:maturity-band-structured', v2_score_range: [21, 45] },
    { id: 'L-2', ordinal: 2, name: 'Systematic', v2_name: 'Systematic', value_name: 'Standardized', v2_band: 'dea:maturity-band-systematic', v2_score_range: [46, 70] },
    { id: 'L-3', ordinal: 3, name: 'Managed', v2_name: 'Adaptive', value_name: 'Compounding', v2_band: 'dea:maturity-band-adaptive', v2_score_range: [71, 88] },
    { id: 'L-4', ordinal: 4, name: 'Optimising', v2_name: 'Self-Optimising', value_name: 'Leading', v2_band: 'dea:maturity-band-self-optimising', v2_score_range: [89, 100] },
  ] as Scale['levels'],
  progression: { effort_multiplier: { 'L-0': 1.0, 'L-1': 1.5, 'L-2': 2.5, 'L-3': 4.0, 'L-4': 6.0 } },
} as unknown as Scale;

const DT_WEIGHTS: Record<string, number> = { d1: 0.2, d2: 0.2, d3: 0.2, d4: 0.15, d5: 0.1, d6: 0.15 };

// ---------- worked example (examples/operationalized-2026.yaml) ----------

function workedExample() {
  const levels = levelsFromScale(SCALE);
  eq(levels.length, 5);
  eq(levels[2].id, 'L-2');
  eq([levels[2].min, levels[2].max], [46, 70]);
  eq(levels[2].effort, 2.5);

  const dimScores = [
    { id: 'd1', score: 72, weight: DT_WEIGHTS['d1'], mandatory: true },
    { id: 'd2', score: 64, weight: DT_WEIGHTS['d2'], mandatory: true },
    { id: 'd3', score: 58, weight: DT_WEIGHTS['d3'], mandatory: true },
    { id: 'd4', score: 70, weight: DT_WEIGHTS['d4'], mandatory: true },
    { id: 'd5', score: 80, weight: DT_WEIGHTS['d5'] },
    { id: 'd6', score: 66, weight: DT_WEIGHTS['d6'] },
  ];
  const overall = aggregate(dimScores);
  eq(overall, 67.2);

  const res = resolveLevel(overall, dimScores, levels);
  eq(res.banded?.id, 'L-2');
  eq(res.banded?.band, 'dea:maturity-band-systematic');
  eq(res.resolved?.id, 'L-2');
  eq(res.status, 'conformant');
  eq(effortAdjusted(overall, res.resolved), 168.0);
}

// ---------- mandatory-dimension gate ----------

function mandatoryGate() {
  const levels = levelsFromScale(SCALE);
  // d4 drops below the L-2 band minimum (46) → resolution must step down to L-1
  const dimScores = [
    { id: 'd1', score: 72, weight: 0.2, mandatory: true },
    { id: 'd2', score: 64, weight: 0.2, mandatory: true },
    { id: 'd3', score: 58, weight: 0.2, mandatory: true },
    { id: 'd4', score: 40, weight: 0.15, mandatory: true },
    { id: 'd5', score: 80, weight: 0.1 },
    { id: 'd6', score: 66, weight: 0.15 },
  ];
  const overall = aggregate(dimScores); // 62.7 → still bands to L-2
  eq(overall, 62.7);
  const res = resolveLevel(overall, dimScores, levels);
  eq(res.banded?.id, 'L-2');
  eq(res.resolved?.id, 'L-1');
  eq(res.status, 'partially-conformant');
}

// ---------- anchors and full cascade ----------

function anchorsAndCascade() {
  eq(anchorToScore(1), 0);
  eq(anchorToScore(3), 50);
  eq(anchorToScore(5), 100);

  // one dimension, two sub-dimensions, two criteria each, all anchor 3 → 50 overall
  const dims = [
    {
      id: 'd1',
      weight: 1,
      mandatory: true,
      sub_dimensions: [
        { id: 'd1s1', criteria: [{ id: 'd1c1' }, { id: 'd1c2' }] },
        { id: 'd1s2', criteria: [{ id: 'd1c3' }, { id: 'd1c4' }] },
      ],
    },
  ];
  const result = cascadeOperationalized(dims, { d1c1: 3, d1c2: 3, d1c3: 3, d1c4: 3 });
  eq(result.criterionScores['d1c1'], 50);
  eq(result.subdimScores['d1s1'], 50);
  eq(result.dimScores[0].score, 50);
  eq(result.overall, 50);

  // mixed anchors: mean over criteria inside each subdim, mean over subdims
  const mixed = cascadeOperationalized(dims, { d1c1: 1, d1c2: 5, d1c3: 2, d1c4: 4 });
  eq(mixed.subdimScores['d1s1'], 50);
  eq(mixed.subdimScores['d1s2'], 50);
  eq(mixed.overall, 50);

  // resolve a cascaded overall against bands
  const levels: EngineLevel[] = levelsFromScale(SCALE);
  const r = resolveLevel(mixed.overall, mixed.dimScores, levels);
  eq(r.resolved?.id, 'L-2'); // 50 → systematic band
}

// ---------- band edges ----------

function bandEdges() {
  const levels = levelsFromScale(SCALE);
  eq(bandFor(0, levels)?.id, 'L-0');
  eq(bandFor(20, levels)?.id, 'L-0');
  eq(bandFor(21, levels)?.id, 'L-1');
  eq(bandFor(70, levels)?.id, 'L-2');
  eq(bandFor(71, levels)?.id, 'L-3');
  eq(bandFor(100, levels)?.id, 'L-4');
}

workedExample();
mandatoryGate();
anchorsAndCascade();
bandEdges();
console.log('engine tests passed: worked example 67.20 → L-2, gate, cascade, bands');
