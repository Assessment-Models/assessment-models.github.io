/**
 * Trial-state storage — the single source of truth for saved trial runs
 * (localStorage keys `am-trial-<repo>-<line>`, shared by the trial runner,
 * the report view and the compare view).
 */
export type TrialLine = 'operationalized' | 'composite';

export interface TrialState {
  scope: string[];
  anchors: Record<string, number>; // leaf-criterion anchor 1..5 (operationalized)
  scores: Record<string, number>; // composite criterion 0..100
  notes: Record<string, string>;
  targets: Record<string, string>; // dimension/criterion id → target level id
  ts?: number;
}

const PREFIX = 'am-trial-';

export function storageKey(repo: string, line: TrialLine): string {
  return `${PREFIX}${repo}-${line}`;
}

function coerce(raw: unknown): TrialState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.scope) || typeof r.anchors !== 'object' || typeof r.scores !== 'object') return null;
  return {
    scope: (r.scope as string[]).filter((x) => typeof x === 'string'),
    anchors: (r.anchors ?? {}) as Record<string, number>,
    scores: (r.scores ?? {}) as Record<string, number>,
    notes: (r.notes ?? {}) as Record<string, string>,
    targets: (r.targets ?? {}) as Record<string, string>,
    ts: typeof r.ts === 'number' ? r.ts : undefined,
  };
}

export function loadTrial(repo: string, line: TrialLine): TrialState | null {
  try {
    return coerce(JSON.parse(localStorage.getItem(storageKey(repo, line)) ?? 'null'));
  } catch {
    return null; // corrupt/stale state degrades to "no trial", never throws
  }
}

export function saveTrial(repo: string, line: TrialLine, st: TrialState): void {
  try {
    localStorage.setItem(storageKey(repo, line), JSON.stringify({ ...st, ts: Date.now() }));
  } catch {
    /* private mode etc. */
  }
}

export interface SavedTrial {
  repo: string;
  line: TrialLine;
  state: TrialState;
}

/** All saved trials, newest first (by the state's own ts). */
export function listTrials(): SavedTrial[] {
  const out: SavedTrial[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(PREFIX)) continue;
      const rest = key.slice(PREFIX.length);
      const sep = rest.lastIndexOf('-');
      if (sep < 0) continue;
      const repo = rest.slice(0, sep);
      const line = rest.slice(sep + 1) as TrialLine;
      if (line !== 'operationalized' && line !== 'composite') continue;
      const state = coerce(JSON.parse(localStorage.getItem(key) ?? 'null'));
      if (state) out.push({ repo, line, state });
    }
  } catch {
    /* storage unavailable */
  }
  return out.sort((a, b) => (b.state.ts ?? 0) - (a.state.ts ?? 0));
}
