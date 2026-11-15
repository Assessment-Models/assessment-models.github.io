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
import { readFileSync, writeFileSync, mkdirSync, cpSync, rmSync, readdirSync } from 'node:fs';
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
    const f = line.match(/^\s+(classification|standard_version|conformance):\s*"?([^"#]+)"?/);
    if (f && !current[f[1]]) current[f[1]] = f[2].trim();
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
    const rec = readYaml(file);
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
  }
}

// ---------- infrastructure + external anchor nodes ----------

for (const n of [...INFRA_NODES, ...EXTERNAL_NODES]) nodes.push({ ...n });

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

for (const node of nodes) {
  if (node.components?.length) {
    // component package imports → the maturity-components registry record
    addEdge(node.id, 'maturity-components', 'imports');
  }
  if (node.contract) {
    addEdge(node.id, 'dea-metamodel', 'contract');
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

// ---------- snapshot DT model YAMLs (offline fallback) ----------

const snapshotRepo = 'maturity-model-digital-transformation';
const snapshotRoot = join(publicPath, 'snapshot', snapshotRepo);
rmSync(snapshotRoot, { recursive: true, force: true });
try {
  cpSync(join(modelsPath, 'model.yaml'), join(snapshotRoot, 'model.yaml'));
  cpSync(join(modelsPath, 'maturity'), join(snapshotRoot, 'maturity'), { recursive: true });
  cpSync(join(modelsPath, 'examples', 'operationalized-2026.yaml'),
    join(snapshotRoot, 'examples', 'operationalized-2026.yaml'), { force: true });
} catch (err) {
  console.warn(`snapshot copy failed (${err.message}) — continuing without snapshot`);
}

const modelCount = nodes.filter((n) => n.group === 'maturity-models').length;
console.log(
  `models.json: ${nodes.length} nodes (${modelCount} maturity models), ${edges.length} edges; snapshot: ${snapshotRepo}`,
);
