/**
 * Cascade scoring engine — implements the evaluation contracts declared in the
 * model repositories' evaluation.yaml / scale.yaml files. Pure functions, no
 * dependencies, so the same logic runs in the browser and in tests.
 *
 * Operationalized line (e.g. maturity-model-digital-transformation
 * maturity/operationalized/evaluation.yaml):
 *   overall = Σ(dim_score × weight); dim = mean(subdims); subdim = mean(criteria 0–100)
 *   criterion anchor 1–5 → 0–100 ((anchor−1) × 25)
 *   overall → the model's scored native level ladder by highest-conformant-level,
 *   excluding any explicit Not Assessed sentinel, with the declared gate.
 *
 * Composite line (maturity/evaluation.yaml): weighted mean over the criteria's
 * native 0–100 scores, then band → level.
 */
import type { Scale, ScaleLevel } from '../types';

// ---------- level/band model ----------

export interface EngineLevel {
  /** native level id, displayed verbatim (L-0, L0, level-1-unrealized …) */
  id: string;
  ordinal: number;
  /** false for sentinel levels like "L-0 Not Assessed" (dea-metamodel #214) — excluded from scoring */
  scored: boolean;
  min?: number;
  max?: number;
  band?: string;
  name?: string;
  v2Name?: string;
  valueName?: string;
  effort?: number;
  /** true when the score range/effort came from the canonical v2 fallback, not the scale file */
  canonical?: boolean;
}

/**
 * Canonical v2 band instance `dea:maturity-bands-v2` v1.0.0 (technehub-labs/dea-metamodel).
 * Every ecosystem scale references these bands (via band_reference or prose), but most
 * scale.yaml files carry them as prose only — not machine fields. Scored levels without an
 * explicit v2_score_range fall back to these by their position among the scale's scored
 * levels — never by raw ordinal, so both conventions work:
 *   - legacy zero-based 5-level scales (L-0..L-4 / L0..L4): scored levels 0..4 → bands 0..4
 *   - CR (dea-metamodel #214) convention: L-0 "Not Assessed" (unscored) + L-1..L-5 → bands 0..4
 */
export const CANONICAL_V2_BANDS: { min: number; max: number; band: string; effort: number }[] = [
  { min: 0, max: 20, band: 'dea:maturity-band-emergent', effort: 1.0 },
  { min: 21, max: 45, band: 'dea:maturity-band-structured', effort: 1.5 },
  { min: 46, max: 70, band: 'dea:maturity-band-systematic', effort: 2.5 },
  { min: 71, max: 88, band: 'dea:maturity-band-adaptive', effort: 4.0 },
  { min: 89, max: 100, band: 'dea:maturity-band-self-optimising', effort: 6.0 },
];

/** Sentinel detection for "Not Assessed" anchor levels (unscored under dea-metamodel #214). */
export function isNotAssessedLevel(l: { id?: string; name?: string }): boolean {
  return /not[\s_-]*assessed/i.test(l.name ?? '') || /^L-?0$/i.test(l.id ?? '') && /not/i.test(l.name ?? '');
}

/** Normalize a scale.yaml into ascending EngineLevels, preserving native ids. */
export function levelsFromScale(scale: Scale | null): EngineLevel[] {
  const levels = (scale?.levels ?? []) as ScaleLevel[];
  const effort = (scale?.progression?.effort_multiplier ?? {}) as Record<string, number>;
  let scoredIndex = 0;
  const out: EngineLevel[] = levels.map((l, i) => {
    const hasRange = Array.isArray(l.v2_score_range) && l.v2_score_range.length === 2;
    const ordinal = typeof l.ordinal === 'number' ? l.ordinal : i;
    if (!hasRange && isNotAssessedLevel(l)) {
      return {
        id: l.id, ordinal, scored: false, name: l.name, v2Name: l.v2_name, valueName: l.value_name,
      };
    }
    const bandIdx = scoredIndex++;
    const fallback = CANONICAL_V2_BANDS[bandIdx];
    if (!fallback) {
      console.warn(
        `[engine] scale level "${l.id}" (scored index ${bandIdx}) exceeds the ${CANONICAL_V2_BANDS.length} canonical v2 bands — no band/effort fallback available`,
      );
      return {
        id: l.id, ordinal, scored: true, name: l.name, v2Name: l.v2_name,
        valueName: l.value_name, canonical: true,
      };
    }
    return {
      id: l.id,
      ordinal,
      scored: true,
      min: hasRange ? l.v2_score_range![0] : fallback.min,
      max: hasRange ? l.v2_score_range![1] : fallback.max,
      band: l.v2_band ?? fallback.band,
      name: l.name,
      v2Name: l.v2_name,
      valueName: l.value_name,
      effort: effort[l.id] ?? fallback.effort,
      canonical: !hasRange,
    };
  });
  return out;
}

/** The scored levels of a scale, in ascending band order (excludes "Not Assessed" sentinels). */
export function scoredLevels(levels: EngineLevel[]): EngineLevel[] {
  return levels.filter((l) => l.scored && typeof l.min === 'number');
}

/** Display label for a resolved level: native id + its best available name. */
export function levelLabel(level: EngineLevel): string {
  return `${level.id} — ${level.valueName ?? level.v2Name ?? level.name ?? ''}`.replace(/ — $/, '');
}

export function bandFor(overall: number, levels: EngineLevel[]): EngineLevel | null {
  const scored = scoredLevels(levels);
  for (let i = scored.length - 1; i >= 0; i--) {
    if (overall >= scored[i].min! && overall <= scored[i].max!) return scored[i];
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

export interface ResolveOptions {
  /**
   * Weakest-link ceiling (AO closed-loop spine, evaluation.yaml gating rule):
   * the resolved level cannot exceed the scored level at this index — derived
   * from the lowest in-scope gating criterion's anchor (anchor N ↔ index N-1).
   */
  maxScoredIndex?: number;
}

/**
 * Highest-conformant-level resolution: start at the banded level and step down
 * until every mandatory dimension score reaches that level's band minimum and
 * the optional weakest-link ceiling holds. Only scored levels participate —
 * "Not Assessed" sentinels are skipped.
 */
export function resolveLevel(
  overall: number,
  dimScores: { id: string; score: number; mandatory?: boolean }[],
  levels: EngineLevel[],
  opts?: ResolveOptions,
): Resolution {
  const allScored = scoredLevels(levels);
  // the raw score bands against the full ladder; the ceiling only caps the resolution
  const banded = bandFor(overall, allScored);
  const scored = typeof opts?.maxScoredIndex === 'number'
    ? allScored.slice(0, Math.max(1, opts.maxScoredIndex + 1))
    : allScored;
  if (!banded) return { banded: null, resolved: null, status: 'indeterminate' };
  let resolved = banded;
  // when the ceiling sits below the banded level, step down from the ceiling top
  let i = scored.indexOf(banded);
  if (i < 0) i = scored.length - 1;
  for (; i >= 0; i--) {
    const candidate = scored[i];
    const mandatory = dimScores.filter((d) => d.mandatory);
    const holds =
      mandatory.length === 0 || mandatory.every((d) => d.score >= candidate.min!);
    if (holds) {
      resolved = candidate;
      break;
    }
    resolved = scored[Math.max(0, i - 1)] ?? scored[0];
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
export function aggregateUnrounded(scores: WeightedScore[]): number {
  const totalWeight = scores.reduce((s, x) => s + x.weight, 0) || 1;
  const sum = scores.reduce((s, x) => s + x.score * x.weight, 0);
  return sum / totalWeight;
}

/** Weighted mean over 0–100 dimension scores, rounded for presentation. */
export function aggregate(scores: WeightedScore[]): number {
  return Math.round(aggregateUnrounded(scores) * 100) / 100;
}

/** Criterion anchor level 1–5 → native 0–100 score. */
export function anchorToScore(anchor: number): number {
  return (Math.min(5, Math.max(1, anchor)) - 1) * 25;
}

export interface EffortAdjustedValueConfig {
  intervals?: { upper_boundary: number; effort_multiplier: number }[];
}

/**
 * Calculate effort-adjusted value. Models may declare a marginal-band formula
 * in evaluation.yaml; when present, each score point is allocated once to its
 * band interval and divided by that band's multiplier. Models without this
 * declaration retain the legacy resolved-band multiplier calculation.
 */
export function effortAdjusted(
  overall: number,
  level: EngineLevel | null,
  config?: EffortAdjustedValueConfig,
): number | null {
  if (config?.intervals?.length) {
    let lower = 0;
    let value = 0;
    for (const interval of config.intervals) {
      const upper = interval.upper_boundary;
      const multiplier = interval.effort_multiplier;
      if (!Number.isFinite(upper) || !Number.isFinite(multiplier) || multiplier <= 0) return null;
      const marginalPoints = Math.max(0, Math.min(overall, upper) - lower);
      value += marginalPoints / multiplier;
      lower = upper;
    }
    return Math.round(value * 100) / 100;
  }
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
      score: dimScore,
      weight: dim.weight,
      mandatory: dim.mandatory,
    });
  }

  return { criterionScores, subdimScores, dimScores, overall: aggregate(dimScores) };
}
