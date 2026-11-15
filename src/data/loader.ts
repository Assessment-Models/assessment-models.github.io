/**
 * Data loading. The manifest (models.json) is generated at build time from the
 * assessment-registry and maturity-model-standard YAML sources. Model structure
 * YAMLs are fetched live from raw.githubusercontent.com with a build-time
 * snapshot (public/snapshot/) as offline fallback.
 */
import yaml from 'js-yaml';
import type {
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

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

/** Fetch a YAML file from the repo (raw.githubusercontent), falling back to the local snapshot. */
export async function loadYaml<T = unknown>(repo: string, path: string): Promise<T> {
  return cached(`yaml:${repo}:${path}`, async () => {
    const parse = (text: string) => yaml.load(text) as T;
    try {
      return parse(await fetchText(`https://raw.githubusercontent.com/${ORG}/${repo}/main/${path}`));
    } catch (err) {
      // fallback: snapshot copied at build time
      try {
        return parse(await fetchText(`${BASE}snapshot/${repo}/${path}`));
      } catch {
        throw err;
      }
    }
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
 * Composite line: model.yaml + maturity/evaluation.yaml + maturity/scale.yaml +
 * one component file per evaluation criterion (maturity/components/<id>.yaml).
 *
 * Operationalized line (probed; the DT repo ships one): maturity/operationalized/
 * evaluation.yaml + scale.yaml + model/<dim>.yaml per criteria id in the
 * operationalized evaluation.
 */
export async function loadModelStructure(repo: string): Promise<ModelStructure> {
  const meta = await loadModelMeta(repo);

  const composite = await cached(`composite:${repo}`, async () => {
    let evaluation: ModelMeta | null = null;
    let scale: Scale | null = null;
    try {
      evaluation = await loadEvaluation(repo, 'composite');
      scale = await loadScale(repo, 'composite');
    } catch {
      /* some repos may differ; drill-down degrades gracefully */
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
    try {
      const [evaluation, scale] = await Promise.all([
        loadEvaluation(repo, 'operationalized'),
        loadScale(repo, 'operationalized'),
      ]);
      const dimIds = (evaluation.criteria ?? []).map((c) => c.id);
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
      return null;
    }
  });

  return { repo, meta, composite, operationalized };
}
