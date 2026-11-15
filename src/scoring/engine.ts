/**
 * Cascade scoring engine — implements the evaluation contracts declared in the
 * model repositories' evaluation.yaml / scale.yaml files. Pure functions, no
 * dependencies, so the same logic runs in the browser and in tests.
 *
 * Operationalized line (e.g. maturity-model-digital-transformation
 * maturity/operationalized/evaluation.yaml):
 *   overall = Σ(dim_score × weight); dim = mean(subdims); subdim = mean(criteria 0–100)
 *   criterion anchor 1–5 → 0–100 ((anchor−1) × 25)
 *   overall → v2 band → L-0..L-4 by highest-conformant-level with the
 *   mandatory-dimension gate (each mandatory dim score ≥ resolved level's band minimum).
 *
 * Composite line (maturity/evaluation.yaml): weighted mean over the criteria's
 * native 0–100 scores, then band → level.
 */
import type { Scale, ScaleLevel } from '../types';

// ---------- level/band model ----------

export interface EngineLevel {
  id: string; // "L-0".."L-4"
  ordinal: number;
  min: number;
  max: number;
  band?: string;
  name?: string;
  v2Name?: string;
  valueName?: string;
  effort?: number;
}

/** Normalize a scale.yaml into ascending, contiguous EngineLevels. */
export function levelsFromScale(scale: Scale | null): EngineLevel[] {
  const levels = (scale?.levels ?? []) as ScaleLevel[];
  const effort = (scale?.progression?.effort_multiplier ?? {}) as Record<string, number>;
  return levels
    .filter((l) => Array.isArray(l.v2_score_range) && l.v2_score_range.length === 2)
    .map((l) => ({
      id: l.id,
      ordinal: l.ordinal,
      min: l.v2_score_range![0],
      max: l.v2_score_range![1],
      band: l.v2_band,
      name: l.name,
      v2Name: l.v2_name,
      valueName: l.value_name,
      effort: effort[l.id],
    }))
    .sort((a, b) => a.min - b.min);
}

export function bandFor(overall: number, levels: EngineLevel[]): EngineLevel | null {
  for (let i = levels.length - 1; i >= 0; i--) {
    if (overall >= levels[i].min && overall <= levels[i].max) return levels[i];
  }
  return null;
}

// ---------- conformance resolution ----------

export type ConformanceStatus = 'conformant' | 'partially-conformant' | 'non-conformant' | 'indeterminate' | 'not-assessable';

export interface Resolution {
  /** level the raw overall score bands into */
  banded: EngineLevel | null;
  /** level after the mandatory-dimension gate (highest-conformant-level) */
  resolved: EngineLevel | null;
  status: ConformanceStatus;
}

/**
 * Highest-conformant-level resolution: start at the banded level and step down
 * until every mandatory dimension score reaches that level's band minimum.
 */
export function resolveLevel(
  overall: number,
  dimScores: { id: string; score: number; mandatory?: boolean }[],
  levels: EngineLevel[],
): Resolution {
  const banded = bandFor(overall, levels);
  if (!banded) return { banded: null, resolved: null, status: 'indeterminate' };
  let resolved = banded;
  for (let i = levels.indexOf(banded); i >= 0; i--) {
    const candidate = levels[i];
    const mandatory = dimScores.filter((d) => d.mandatory);
    const holds =
      mandatory.length === 0 || mandatory.every((d) => d.score >= candidate.min);
    if (holds) {
      resolved = candidate;
      break;
    }
    resolved = levels[Math.max(0, i - 1)] ?? levels[0];
  }
  const status: ConformanceStatus = resolved.id === banded.id ? 'conformant' : 'partially-conformant';
  return { banded, resolved, status };
}

// ---------- aggregation ----------

export interface WeightedScore {
  id: string;
  score: number; // 0–100
  weight: number;
  mandatory?: boolean;
}

/** Weighted mean over 0–100 dimension scores, rounded to 2 decimals. */
export function aggregate(scores: WeightedScore[]): number {
  const totalWeight = scores.reduce((s, x) => s + x.weight, 0) || 1;
  const sum = scores.reduce((s, x) => s + x.score * x.weight, 0);
  return Math.round((sum / totalWeight) * 100) / 100;
}

/** Criterion anchor level 1–5 → native 0–100 score. */
export function anchorToScore(anchor: number): number {
  return (Math.min(5, Math.max(1, anchor)) - 1) * 25;
}

export function effortAdjusted(overall: number, level: EngineLevel | null): number | null {
  if (!level?.effort) return null;
  return Math.round(overall * level.effort * 100) / 100;
}

// ---------- operationalized cascade ----------

export interface CascadeNode {
  [subdimId: string]: { criteria: { id: string; anchor: number }[] };
}

export interface CascadeResult {
  criterionScores: Record<string, number>; // 0–100 per leaf criterion
  subdimScores: Record<string, number>;
  dimScores: { id: string; score: number; weight: number; mandatory?: boolean }[];
  overall: number;
}

export interface DimLike {
  id: string;
  weight: number;
  mandatory?: boolean;
  sub_dimensions: { id: string; criteria: { id: string }[] }[];
}

/** Full operationalized cascade from leaf-criterion anchors (1–5). */
export function cascadeOperationalized(
  dimensions: DimLike[],
  anchors: Record<string, number>,
): CascadeResult {
  const criterionScores: Record<string, number> = {};
  const subdimScores: Record<string, number> = {};
  const dimScores: CascadeResult['dimScores'] = [];

  for (const dim of dimensions) {
    const subScores: number[] = [];
    for (const sub of dim.sub_dimensions ?? []) {
      const critScores = (sub.criteria ?? []).map((c) => {
        const s = anchorToScore(anchors[c.id] ?? 1);
        criterionScores[c.id] = s;
        return s;
      });
      const mean = critScores.length ? critScores.reduce((a, b) => a + b, 0) / critScores.length : 0;
      subdimScores[sub.id] = Math.round(mean * 100) / 100;
      subScores.push(mean);
    }
    const dimScore = subScores.length ? subScores.reduce((a, b) => a + b, 0) / subScores.length : 0;
    dimScores.push({
      id: dim.id,
      score: Math.round(dimScore * 100) / 100,
      weight: dim.weight,
      mandatory: dim.mandatory,
    });
  }

  return { criterionScores, subdimScores, dimScores, overall: aggregate(dimScores) };
}
