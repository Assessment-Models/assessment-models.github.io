#!/usr/bin/env node
/**
 * Build-time index generator for the Assessment-Models gateway.
 *
 * Reads the machine-readable sources from the org's sibling repos and emits:
 *   public/models.json            — constellation manifest (nodes + edges)
 *   public/snapshot/<repo>/...    — snapshot of model YAMLs (offline fallback
 *                                   for raw.githubusercontent.com fetches)
 *
 * Sources (defaults point at the sibling clones; override for CI):
 *   --registry  assessment-registry        (registry/... — 14 records)
 *   --standard  maturity-model-standard    (registry/conformance.yaml — portfolio adoption)
 *   --models    maturity-model-digital-transformation (snapshot source)
 */
import { readFileSync, writeFileSync, existsSync, cpSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

const registryPath = arg('registry', join(ROOT, '..', 'assessment-registry'));
const standardPath = arg('standard', join(ROOT, '..', 'maturity-model-standard'));
const modelsPath = arg('models', join(ROOT, '..', 'maturity-model-digital-transformation'));
const publicPath = arg('out', join(ROOT, 'public'));
const snapshotRootForEdges = arg('snapshot-root', dirname(modelsPath));

const GROUPS = {
  'maturity-models': 'maturity-models',
  'assessment-models': 'assessment-models',
  'assessment-tools': 'assessment-tools',
  components: 'components',
};

const INFRA_NODES = [
  {
    id: 'assessment-registry',
    name: 'Assessment Registry',
    group: 'infrastructure',
    description: 'Ecosystem identity spine — registration records, immutable references, compatibility and dependency resolution (CR-AM-11 Phase 1).',
  },
  {
    id: 'assessment-ci',
    name: 'Assessment CI',
    group: 'infrastructure',
    description: 'Three-level cross-repository CI — local, contract-conformance and ecosystem validation. Owns no model content.',
  },
  {
    id: 'maturity-model-standard',
    name: 'Model Repository Standard',
    group: 'infrastructure',
    description: 'Normative AM-MODEL-REPOSITORY-STANDARD — specifications, schemas, conformance workflow and portfolio registry (CR-AM-ORG-RES-000).',
  },
  {
    id: 'maturity-model-template',
    name: 'Model Repository Template',
    group: 'infrastructure',
    description: 'Reusable GitHub template scaffold implementing the AM-MODEL-REPOSITORY-STANDARD for new maturity-model-* repos.',
  },
  {
    id: 'org-governance',
    name: 'Organization Governance',
    group: 'infrastructure',
    description: 'Org defaults (.github) — profile, governance, repository taxonomy, contribution and CI baseline policies.',
  },
];

const EXTERNAL_NODES = [
  {
    id: 'dea-metamodel',
    name: 'OpenDEA Metamodel',
    group: 'external',
    external: true,
    repo: 'technehub-labs/dea-metamodel',
    description: 'External contract anchor — the maturity-scale-contract handshake lives in the upstream dea-metamodel (CR-AM-11).',
  },
];

function readYaml(path) {
  return yaml.load(readFileSync(path, 'utf8'));
}

/**
 * Lenient fallback parser for conformance.yaml. The upstream file contains a
 * YAML-invalid line (unquoted continuation after a quoted scalar), so we parse
 * only the per-repository block fields we need, line-based.
 */
function parseConformanceLenient(text) {
  const records = [];
  let current = null;
  for (const line of text.split('\n')) {
    const m = line.match(/^\s{0,4}- repository:\s*(.+)$/);
    if (m) {
      if (current) records.push(current);
      current = { repository: m[1].trim() };
      continue;
    }
    if (!current) continue;
    const f = line.match(/^\s{4}(classification|standard_version|conformance):\s*"?([^"#]+)"?/);
    if (f && !current[f[1]] && f[2].trim() !== 'null') current[f[1]] = f[2].trim();
    // phase2 block fields live at a 6-space indent inside the record
    const p2 = line.match(/^\s{6}(identity|assessed|result):\s*"?([^"#]+)"?/);
    if (p2 && !current['phase2_' + p2[1]] && p2[2].trim() !== 'null') {
      const v = p2[2].trim().replace(/\s+/g, ' ');
      current['phase2_' + p2[1]] = p2[1] === 'result' ? v.slice(0, 160) : v;
    }
  }
  if (current) records.push(current);
  return { repositories: records };
}

function firstSentence(text, max = 220) {
  if (!text) return '';
  const t = String(text).replace(/\s+/g, ' ').trim();
  const cut = t.slice(0, max);
  const dot = cut.search(/[.!?](\s|$)/);
  return (dot > 40 ? cut.slice(0, dot + 1) : cut) + (cut.length >= max && dot < 0 ? '…' : '');
}

function walkYamlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkYamlFiles(p));
    else if (entry.name.endsWith('.yaml') || entry.name.endsWith('.yml')) out.push(p);
  }
  return out;
}

// ---------- nodes from the registry ----------

const registryDir = join(registryPath, 'registry');
const nodes = [];
const byRepo = new Map();
let usedFallbackRegistry = false;

if (existsSync(registryDir)) {
  for (const [subdir, group] of Object.entries(GROUPS)) {
    const dir = join(registryDir, subdir);
    let files = [];
    try {
      files = walkYamlFiles(dir);
    } catch (err) {
      console.warn(`registry walk failed for ${dir}: ${err.message}`);
      continue;
    }
    for (const file of files) {
      let rec;
      try {
        rec = readYaml(file);
      } catch (err) {
        // A malformed sibling-repo record must not take down the whole Pages
        // deploy: skip it loudly and build the manifest from the healthy ones.
        console.warn(`registry record skipped (YAML parse failed): ${file}: ${err.message}`);
        continue;
      }
      if (!rec?.id || !rec?.source?.repository) continue;
      const repo = rec.source.repository;
      const node = {
        id: rec.id,
        name: rec.name || rec.id,
        group,
        repo,
        description: firstSentence(rec.description),
        version: rec.release?.version,
        status: rec.status,
        contract: rec.conformsTo?.contract
          ? `${rec.conformsTo.contract.id}@${rec.conformsTo.contract.version}`
          : undefined,
        components: (rec.components ?? []).map((c) => c.id).filter(Boolean),
        assetClass: rec.asset_class,
      };
      nodes.push(node);
      byRepo.set(repo, node);
    }
  }
} else {
  const fallbackPath = join(ROOT, 'data', 'ecosystem-registry.json');
  if (existsSync(fallbackPath)) {
    usedFallbackRegistry = true;
    const eco = JSON.parse(readFileSync(fallbackPath, 'utf8'));
    const handshakeContracts = new Map();
    for (const hs of eco.handshakes ?? []) {
      if (hs.to_station_id === 'dea-metamodel' && !handshakeContracts.has(hs.from_station_id)) {
        const contractName = hs.id.includes('opendea-assessment-metamodel')
          ? 'opendea-assessment-metamodel@1.0'
          : 'maturity-scale-contract@1.0';
        handshakeContracts.set(hs.from_station_id, contractName);
      }
    }
    const mapLayerToGroup = (artifact) => {
      if (['assessment-ci', 'assessment-registry', 'maturity-model-standard', 'maturity-model-template'].includes(artifact.id)) {
        return 'infrastructure';
      }
      if (artifact.id === 'dea-catalog-assessment-tools') return 'assessment-tools';
      switch (artifact.layer) {
        case 'maturity-model': return 'maturity-models';
        case 'assessment-model': return 'assessment-models';
        case 'shared-capability': return 'components';
        case 'governance': return 'infrastructure';
        case 'integration':
        case 'reference-blueprint':
        default: return 'external';
      }
    };
    for (const a of eco.artifacts ?? []) {
      const group = mapLayerToGroup(a);
      const repo = a.full_name?.startsWith('Assessment-Models/')
        ? a.full_name.slice('Assessment-Models/'.length)
        : a.full_name;
      const node = {
        id: a.id,
        name: a.name || a.id,
        group,
        repo,
        description: firstSentence(a.description),
        version: a.version ? String(a.version).replace(/^v/, '') : undefined,
        status: a.conformance_status,
        contract: handshakeContracts.get(a.id),
        classification: a.layer,
        conformance: ['structural', 'full', 'registered'].includes(a.conformance_status) ? a.conformance_status : undefined,
        standardVersion: a.standards_alignment?.includes('AM-MODEL-REPOSITORY-STANDARD') ? '1.0.1' : undefined,
        external: a.owner_type === 'partner-ecosystem' ? true : undefined,
      };
      nodes.push(node);
      if (repo) byRepo.set(repo, node);
    }
    console.warn(`assessment-registry not found at ${registryDir}; hydrated ${nodes.length} nodes from data/ecosystem-registry.json`);
  }
}

// ---------- join conformance data (portfolio adoption) ----------

let conformance = null;
try {
  conformance = readYaml(join(standardPath, 'registry', 'conformance.yaml'));
} catch {
  try {
    conformance = parseConformanceLenient(
      readFileSync(join(standardPath, 'registry', 'conformance.yaml'), 'utf8'),
    );
    console.warn('conformance.yaml: strict YAML parse failed, used lenient line parser');
  } catch {
    console.warn('conformance.yaml not found — portfolio adoption will be omitted');
  }
}
for (const rec of conformance?.repositories ?? []) {
  const node = byRepo.get(rec.repository);
  if (node) {
    node.classification = rec.classification;
    node.conformance = rec.conformance;
    node.standardVersion = rec.standard_version;
    if (rec.phase2_identity || rec.phase2_assessed || rec.phase2_result) {
      node.phase2 = {
        identity: rec.phase2_identity,
        assessed: rec.phase2_assessed,
        result: rec.phase2_result,
      };
    }
  }
}

// ---------- infrastructure + external anchor nodes ----------

const existingIds = new Set(nodes.map((n) => n.id));
for (const n of [...INFRA_NODES, ...EXTERNAL_NODES]) {
  if (!existingIds.has(n.id)) {
    nodes.push({ ...n });
    existingIds.add(n.id);
  }
}

// ---------- edges ----------

const edges = [];
const seen = new Set();
function addEdge(source, target, kind) {
  const pairKey = [source, target].sort().join('|');
  const key = `${kind}|${pairKey}`;
  if (source === target || seen.has(key) || seen.has(`imports|${pairKey}`)) return;
  seen.add(key);
  edges.push({ source, target, kind });
}

// Semantic touchpoint edges are sourced from each model repository's
// declared touchpoints.yaml artifact, not inferred from prose or dependencies.
for (const node of nodes) {
  if (!node.repo) continue;
  const touchpointFile = join(snapshotRootForEdges, node.repo, 'touchpoints.yaml');
  if (!existsSync(touchpointFile)) continue;
  try {
    const declaration = readYaml(touchpointFile);
    for (const tp of declaration?.touchpoints ?? []) {
      const peer = tp.peer_repo ? byRepo.get(tp.peer_repo) : nodes.find((n) => n.id === tp.peer_asset);
      if (peer) addEdge(node.id, peer.id, 'touchpoint');
    }
  } catch (err) {
    console.warn(`touchpoint declaration skipped for ${node.repo}: ${err.message}`);
  }
}

for (const node of nodes) {
  if (node.components?.length) {
    // component package imports → the maturity-components registry record
    addEdge(node.id, 'maturity-components', 'imports');
  }
  if (node.contract) {
    addEdge(node.id, 'dea-metamodel', 'contract');
  }
}

if (usedFallbackRegistry) {
  const fallbackPath = join(ROOT, 'data', 'ecosystem-registry.json');
  const eco = JSON.parse(readFileSync(fallbackPath, 'utf8'));
  for (const tp of eco.touchpoints ?? []) {
    if (existingIds.has(tp.from_station_id) && existingIds.has(tp.to_station_id)) {
      const kind = tp.to_station_id === 'maturity-components' ? 'imports' : 'shared-components';
      addEdge(tp.from_station_id, tp.to_station_id, kind);
    }
  }
  for (const hs of eco.handshakes ?? []) {
    if (existingIds.has(hs.from_station_id) && existingIds.has(hs.to_station_id)) {
      addEdge(hs.from_station_id, hs.to_station_id, 'contract');
    }
  }
}

// shared-component edges between any two assets importing the same package
const byComponent = new Map();
for (const node of nodes) {
  for (const c of node.components ?? []) {
    if (!byComponent.has(c)) byComponent.set(c, []);
    byComponent.get(c).push(node.id);
  }
}
for (const users of byComponent.values()) {
  for (let i = 0; i < users.length; i++) {
    for (let j = i + 1; j < users.length; j++) {
      addEdge(users[i], users[j], 'shared-components');
    }
  }
}

// ---------- write manifest ----------

const manifest = {
  generated: new Date().toISOString(),
  org: 'Assessment-Models',
  site: 'https://assessment-models.github.io',
  nodes,
  edges,
};
writeFileSync(join(publicPath, 'models.json'), JSON.stringify(manifest, null, 2) + '\n');

// ---------- snapshot maturity-model YAMLs (offline fallback for raw fetches) ----------

// snapshot source root: locally the sibling clones sit next to the models clone;
// in CI all repos are checked out under --snapshot-root (e.g. sources/)
const snapshotRootArg = snapshotRootForEdges;
let snapshotted = 0;
for (const node of nodes.filter((n) => n.group === 'maturity-models')) {
  const src = join(snapshotRootArg, node.repo ?? node.id);
  const dst = join(publicPath, 'snapshot', node.repo ?? node.id);
  try {
    rmSync(dst, { recursive: true, force: true });
    cpSync(join(src, 'model.yaml'), join(dst, 'model.yaml'));
    cpSync(join(src, 'maturity'), join(dst, 'maturity'), { recursive: true });
    if (node.repo === 'maturity-model-digital-transformation') {
      cpSync(join(src, 'examples', 'operationalized-2026.yaml'),
        join(dst, 'examples', 'operationalized-2026.yaml'), { force: true });
    }
    snapshotted++;
  } catch {
    console.warn(`snapshot skipped for ${node.repo} (no local clone at ${src})`);
  }
}

const modelCount = nodes.filter((n) => n.group === 'maturity-models').length;
console.log(
  `models.json: ${nodes.length} nodes (${modelCount} maturity models), ${edges.length} edges; snapshots: ${snapshotted}`,
);
