/**
 * Data loading. The manifest (models.json) is generated at build time from the
 * assessment-registry and maturity-model-standard YAML sources. Model structure
 * YAMLs are fetched live from raw.githubusercontent.com with a build-time
 * snapshot (public/snapshot/) as offline fallback.
 */
import yaml from 'js-yaml';
import type {
  CriteriaRegister,
  IndexManifest,
  IndexNode,
  ModelMeta,
  ModelStructure,
  OpDimension,
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
    p.catch(() => cache.delete(key)); // allow retry after a failed fetch
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
  // some static hosts answer missing paths with a 200 HTML shell — reject it
  if (text.trimStart().startsWith('<')) throw new Error(`not YAML (HTML page) at ${url}`);
  return text;
}

/** Fetch a YAML file from the repo (raw.githubusercontent), falling back to the local snapshot. */
export async function loadYaml<T = unknown>(repo: string, path: string): Promise<T> {
  return cached(`yaml:${repo}:${path}`, async () => {
    const parse = (text: string) => yaml.load(text) as T;
    // race raw vs snapshot in parallel: live data wins when it arrives, the
    // snapshot (resolved meanwhile) takes over immediately on raw failure
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

export function loadModelMeta(repo: string): Promise<ModelMeta> {
  return loadYaml<ModelMeta>(repo, 'model.yaml');
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

/**
 * Load the full structure of a model repository.
 *
 * Lines are probed in order and the first hit wins:
 *  1. DT-style operationalized line: maturity/operationalized/evaluation.yaml +
 *     scale.yaml + model/<dim>.yaml per evaluation criterion.
 *  2. Single-file criteria register: maturity/model/<repo>.yaml with
 *     scoring.mechanism 'weighted-mean-0-100' and a root `dimensions` array
 *     (maturity-model-digital-transformation-operationalized layout) — mapped
 *     into the same OpDimension[] shape so trial/report run unchanged.
 *  3. Composite line: maturity/evaluation.yaml + maturity/scale.yaml +
 *     one component file per evaluation criterion (maturity/components/<id>.yaml).
 */
export async function loadModelStructure(repo: string): Promise<ModelStructure> {
  const meta = await loadModelMeta(repo);

  const composite = await cached(`composite:${repo}`, async () => {
    // independent loads: several repos ship scale.yaml without an evaluation.yaml
    let evaluation: ModelMeta | null = null;
    let scale: Scale | null = null;
    try {
      evaluation = await loadEvaluation(repo, 'composite');
    } catch {
      /* no evaluation.yaml — views degrade gracefully */
    }
    try {
      scale = await loadScale(repo, 'composite');
    } catch {
      /* no scale.yaml */
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
      // dimension files carry full ids (e.g. "dea:model-dto-d1"); normalize to
      // the evaluation.yaml criteria ids ("d1") so scope/targets join correctly
      const dimensions = loaded.map((d, i) => ({ ...d, id: dimIds[i] }));
      return { evaluation, scale, dimensions };
    } catch {
      /* fall through to the criteria-register probe */
    }

    // 2) single-file criteria register (weighted-mean-0-100); file may be named
    //    after the repo or the short model id (maturity-model-<x> → <x>.yaml)
    const shortId = repo.replace(/^maturity-model-/, '');
    const registerCandidates = [`maturity/model/${shortId}.yaml`, `maturity/model/${repo}.yaml`];
    try {
      let reg: CriteriaRegister | null = null;
      for (const path of registerCandidates) {
        try {
          reg = await loadYaml<CriteriaRegister>(repo, path);
          break;
        } catch {
          /* try next candidate */
        }
      }
      if (reg?.scoring?.mechanism === 'weighted-mean-0-100' && Array.isArray(reg.dimensions) && reg.dimensions.length > 0) {
        const dimensions = reg.dimensions.map((d, i) => ({
          ...d,
          id: d.id ?? `d${i + 1}`,
        }));
        const evaluation: ModelMeta = {
          id: reg.id,
          name: reg.name,
          version: reg.version,
          description: reg.description,
          status: reg.status,
          scoring: reg.scoring as ModelMeta['scoring'],
          criteria: dimensions.map((d) => ({
            id: d.id,
            name: d.name,
            weight: d.weight,
            mandatory: d.mandatory,
          })),
        };
        const scale = await loadScale(repo, 'composite'); // maturity/scale.yaml
        return { evaluation, scale, dimensions };
      }
    } catch {
      /* no register either */
    }

    return null;
  });

  return { repo, meta, composite, operationalized };
}
