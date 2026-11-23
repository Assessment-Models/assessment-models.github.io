/**
 * Data loading. The manifest (models.json) is generated at build time from the
 * assessment-registry and maturity-model-standard YAML sources (with fallback to
 * data/ecosystem-registry.json). Model structure YAMLs are fetched live from
 * raw.githubusercontent.com with a build-time snapshot (public/snapshot/) fallback.
 */
import yaml from 'js-yaml';
import type {
  CriteriaRegister,
  IndexManifest,
  IndexNode,
  ModelMeta,
  ModelStructure,
  OpDimension,
  OpSubDimension,
  RepoManifestInfo,
  Scale,
} from '../types';

const ORG = 'Assessment-Models';
const BASE = import.meta.env.BASE_URL ?? '/';

const cache = new Map<string, Promise<unknown>>();

function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  let p = cache.get(key) as Promise<T> | undefined;
  if (!p) {
    p = load();
    cache.set(key, p);
    p.catch(() => cache.delete(key));
  }
  return p;
}

export function fetchManifest(): Promise<IndexManifest> {
  return cached('manifest', async () => {
    const res = await fetch(`${BASE}models.json`);
    if (!res.ok) throw new Error(`models.json: HTTP ${res.status}`);
    return (await res.json()) as IndexManifest;
  });
}

export function findNode(manifest: IndexManifest, id: string): IndexNode | undefined {
  return manifest.nodes.find((n) => n.id === id);
}

async function fetchText(url: string, timeoutMs = 8000): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  const text = await res.text();
  if (text.trimStart().startsWith('<')) throw new Error(`not YAML/JSON (HTML page) at ${url}`);
  return text;
}

/** Fetch a YAML file from the repo (raw.githubusercontent), falling back to the local snapshot. */
export async function loadYaml<T = unknown>(repo: string, path: string): Promise<T> {
  return cached(`yaml:${repo}:${path}`, async () => {
    const parse = (text: string) => yaml.load(text) as T;
    const rawP = fetchText(`https://raw.githubusercontent.com/${ORG}/${repo}/main/${path}`)
      .then(parse)
      .catch(() => null);
    const snapP = fetchText(`${BASE}snapshot/${repo}/${path}`)
      .then(parse)
      .catch(() => null);
    const raw = await rawP;
    if (raw !== null) return raw;
    const snap = await snapP;
    if (snap !== null) return snap;
    throw new Error(`could not load ${repo}/${path} from raw or snapshot`);
  });
}

export async function loadJson<T = unknown>(repo: string, path: string): Promise<T | null> {
  return cached(`json:${repo}:${path}`, async () => {
    try {
      const text = await fetchText(`https://raw.githubusercontent.com/${ORG}/${repo}/main/${path}`);
      return JSON.parse(text) as T;
    } catch {
      return null;
    }
  });
}

export async function loadRepoManifestInfo(repo: string): Promise<RepoManifestInfo> {
  const [manifest, touchpoints, standard] = await Promise.all([
    loadJson<Record<string, unknown>>(repo, 'assessment-manifest.json'),
    loadYaml<Record<string, unknown>>(repo, 'touchpoints.yaml').catch(() => null),
    loadYaml<Record<string, unknown>>(repo, 'standard.yaml').catch(() => null),
  ]);
  return { manifest, touchpoints, standard };
}

export function loadModelMeta(repo: string): Promise<ModelMeta> {
  return loadYaml<ModelMeta>(repo, 'model.yaml');
}

// ---------- ecosystem registry (bot-synced catalog) + registration records ----------

export interface EcosystemRegistry {
  schema_version: string;
  organization: { login: string; url?: string; pages_url?: string };
  generated_at: string;
  content_sha256: string;
  summary: { total_artifacts: number; by_layer?: Record<string, number>; standards?: string[] };
  artifacts: {
    id: string;
    name: string;
    full_name: string;
    owner_type: string;
    layer: string;
    architectural_concern?: string;
    description?: string;
    html_url?: string;
    version?: string;
    license?: string;
    conformance_status?: string;
    updated_at?: string;
    standards_alignment?: string;
  }[];
  touchpoints?: {
    id: string;
    label: string;
    from_station_id: string;
    to_station_id: string;
    kind?: string;
    contract_summary?: string;
    compatibility?: string;
  }[];
  handshakes?: {
    id: string;
    label: string;
    from_station_id: string;
    to_station_id: string;
    kind?: string;
    direction?: string;
    contract_summary?: string;
    compatibility?: string;
  }[];
}

export function fetchEcosystemRegistry(): Promise<EcosystemRegistry> {
  return cached('ecosystem-registry', async () => {
    const res = await fetch(`${BASE}data/ecosystem-registry.json`);
    if (!res.ok) throw new Error(`ecosystem-registry.json: HTTP ${res.status}`);
    return (await res.json()) as EcosystemRegistry;
  });
}

/**
 * Live-fetch an assessment-registry registration record. Paths are
 * deterministic from the manifest: registry/<group>/<id>.yaml where group is
 * one of the four registry subdirectories.
 */
export function loadRegistryRecord(repo: string, group: string, id: string): Promise<Record<string, unknown>> {
  return loadYaml<Record<string, unknown>>(repo, `registry/${group}/${id}.yaml`);
}

export function loadScale(repo: string, line: 'composite' | 'operationalized'): Promise<Scale> {
  const path =
    line === 'operationalized'
      ? 'maturity/operationalized/scale.yaml'
      : 'maturity/scale.yaml';
  return loadYaml<Scale>(repo, path);
}

export function loadEvaluation(repo: string, line: 'composite' | 'operationalized'): Promise<ModelMeta> {
  const path =
    line === 'operationalized'
      ? 'maturity/operationalized/evaluation.yaml'
      : 'maturity/evaluation.yaml';
  return loadYaml<ModelMeta>(repo, path);
}

/** Normalize heterogeneous dimension/register shapes from domain repos into OpDimension[]. */
function normalizeDimensions(rawDims: unknown[]): OpDimension[] {
  const count = Math.max(1, rawDims.length);
  return rawDims.map((raw, idx) => {
    const d = raw as Record<string, unknown>;
    const id = String(d.id ?? `d${idx + 1}`);
    const weight = typeof d.weight === 'number' ? d.weight : Math.round((1 / count) * 1000) / 1000;
    const subDimsRaw = Array.isArray(d.sub_dimensions) ? d.sub_dimensions : null;
    const questionsRaw = Array.isArray(d.questions) ? d.questions : null;
    const criteriaRaw = Array.isArray(d.criteria) ? d.criteria : null;

    let sub_dimensions: OpSubDimension[] = [];
    if (subDimsRaw) {
      sub_dimensions = subDimsRaw.map((sr, sIdx) => {
        const s = sr as Record<string, unknown>;
        const crits = Array.isArray(s.criteria) ? s.criteria : [];
        return {
          id: String(s.id ?? `${id}-s${sIdx + 1}`),
          name: String(s.name ?? `Sub-dimension ${sIdx + 1}`),
          lite_question: typeof s.lite_question === 'string'
            ? s.lite_question
            : typeof s.definition === 'string'
              ? s.definition
              : undefined,
          criteria: crits.map((cr, cIdx) => {
            const c = cr as Record<string, unknown>;
            return {
              id: String(c.id ?? `${id}-c${cIdx + 1}`),
              name: String(c.name ?? c.id ?? `Criterion ${cIdx + 1}`),
              statement: typeof c.statement === 'string'
                ? c.statement
                : typeof c.definition === 'string'
                  ? c.definition
                  : undefined,
              levers: Array.isArray(c.levers) ? c.levers.map(String) : undefined,
              anchors: Array.isArray(c.anchors) ? (c.anchors as { level: number; text: string }[]) : undefined,
              evidence: Array.isArray(c.evidence) ? c.evidence.map(String) : undefined,
              gating: c.gating === true,
              gating_note: typeof c.gating_note === 'string' ? c.gating_note : undefined,
            };
          }),
        };
      });
    } else if (questionsRaw) {
      sub_dimensions = [
        {
          id: `${id}-questions`,
          name: 'Assessment Instrument Questions',
          criteria: questionsRaw.map((qr, qIdx) => {
            const q = qr as Record<string, unknown>;
            return {
              id: String(q.id ?? `${id}-q${qIdx + 1}`),
              name: String(q.id ?? `Question ${qIdx + 1}`).toUpperCase(),
              statement: typeof q.text === 'string' ? q.text : String(q.question ?? ''),
              evidence: Array.isArray(q.evidence)
                ? q.evidence.map(String)
                : typeof q.evidence === 'string'
                  ? [q.evidence]
                  : undefined,
              gating: q.gating === true,
              gating_note: typeof q.gating_note === 'string' ? q.gating_note : undefined,
            };
          }),
        },
      ];
    } else if (criteriaRaw) {
      sub_dimensions = [
        {
          id: `${id}-criteria`,
          name: 'Criteria',
          criteria: criteriaRaw.map((cr, cIdx) => {
            const c = cr as Record<string, unknown>;
            return {
              id: String(c.id ?? `${id}-c${cIdx + 1}`),
              name: String(c.name ?? c.id ?? `Criterion ${cIdx + 1}`),
              statement: typeof c.statement === 'string'
                ? c.statement
                : typeof c.description === 'string'
                  ? c.description
                  : typeof c.definition === 'string'
                    ? c.definition
                    : undefined,
              evidence: Array.isArray(c.evidence) ? c.evidence.map(String) : undefined,
              gating: c.gating === true,
              gating_note: typeof c.gating_note === 'string' ? c.gating_note : undefined,
            };
          }),
        },
      ];
    }

    return {
      id,
      dimension: typeof d.dimension === 'string' ? d.dimension : id,
      name: String(d.name ?? id),
      weight,
      mandatory: Boolean(d.mandatory),
      description: typeof d.description === 'string'
        ? d.description
        : typeof d.definition === 'string'
          ? d.definition
          : undefined,
      sub_dimensions,
    };
  });
}

const DEFAULT_SCALE: Scale = {
  id: 'dea:maturity-bands-v2',
  version: '1.0.0',
  levels: [
    { id: 'L-0', ordinal: 0, name: 'Initial / Ad-Hoc', v2_band: 'dea:maturity-band-emergent', v2_score_range: [0, 20] },
    { id: 'L-1', ordinal: 1, name: 'Emerging / Repeatable', v2_band: 'dea:maturity-band-structured', v2_score_range: [21, 45] },
    { id: 'L-2', ordinal: 2, name: 'Defined / Systematic', v2_band: 'dea:maturity-band-systematic', v2_score_range: [46, 70] },
    { id: 'L-3', ordinal: 3, name: 'Managed / Adaptive', v2_band: 'dea:maturity-band-adaptive', v2_score_range: [71, 88] },
    { id: 'L-4', ordinal: 4, name: 'Self-Optimizing', v2_band: 'dea:maturity-band-self-optimizing', v2_score_range: [89, 100] },
  ],
};

/**
 * Load the full structure of a model or assessment instrument repository.
 */
export async function loadModelStructure(repo: string): Promise<ModelStructure> {
  const meta = await loadModelMeta(repo);

  const composite = await cached(`composite:${repo}`, async () => {
    let evaluation: ModelMeta | null = null;
    let scale: Scale | null = null;
    try {
      evaluation = await loadEvaluation(repo, 'composite');
    } catch {
      /* optional */
    }
    try {
      scale = await loadScale(repo, 'composite');
    } catch {
      /* optional */
    }
    const componentFiles: { id: string; data: ModelMeta | null }[] = [];
    if (evaluation?.criteria) {
      await Promise.all(
        evaluation.criteria.map(async (c) => {
          try {
            const data = await loadYaml<ModelMeta>(repo, `maturity/components/${c.id}.yaml`);
            componentFiles.push({ id: c.id, data });
          } catch {
            componentFiles.push({ id: c.id, data: null });
          }
        }),
      );
    }
    return { evaluation, scale, componentFiles };
  });

  const operationalized = await cached(`opline:${repo}`, async () => {
    // 1) DT-style operationalized line
    try {
      const [evaluation, scale] = await Promise.all([
        loadEvaluation(repo, 'operationalized'),
        loadScale(repo, 'operationalized'),
      ]);
      const dimIds = (evaluation.criteria ?? []).map((c) => c.id);
      if (!dimIds.length) throw new Error('operationalized evaluation has no criteria');
      const loaded = await Promise.all(
        dimIds.map((id) =>
          loadYaml<OpDimension>(repo, `maturity/operationalized/model/${id}.yaml`),
        ),
      );
      const dimensions = loaded.map((d, i) => ({ ...d, id: dimIds[i] }));
      return { evaluation, scale, dimensions };
    } catch {
      /* fall through */
    }

    // 2) Single-file criteria register or domain draft register
    const shortId = repo.replace(/^maturity-model-/, '');
    const registerCandidates = [
      `maturity/model/${shortId}.yaml`,
      `maturity/model/${repo}.yaml`,
      `maturity/model/${shortId}-register-draft.yaml`,
      `maturity/model/${shortId}-v2-draft.yaml`,
      `maturity/model/criteria.yaml`,
      `assessments/v1-alpha/instrument.yaml`,
    ];

    for (const path of registerCandidates) {
      try {
        const raw = await loadYaml<CriteriaRegister & { practice_areas?: unknown[] }>(repo, path);
        const dimArray = Array.isArray(raw?.dimensions)
          ? raw.dimensions
          : Array.isArray(raw?.practice_areas)
            ? raw.practice_areas
            : null;
        if (!dimArray || dimArray.length === 0) continue;

        const dimensions = normalizeDimensions(dimArray);
        const evaluation: ModelMeta = {
          id: raw.id ?? repo,
          name: raw.name ?? meta.name ?? repo,
          version: raw.version ?? meta.version,
          description: raw.description ?? meta.description,
          status: raw.status ?? meta.status,
          scoring: (raw.scoring as ModelMeta['scoring']) ?? composite.evaluation?.scoring ?? { mechanism: 'weighted-mean-0-100' },
          criteria: dimensions.map((d) => ({
            id: d.id,
            name: d.name,
            weight: d.weight,
            mandatory: d.mandatory,
          })),
        };
        const scale = composite.scale ?? DEFAULT_SCALE;
        return { evaluation, scale, dimensions };
      } catch {
        /* try next candidate */
      }
    }

    return null;
  });

  return { repo, meta, composite, operationalized };
}
