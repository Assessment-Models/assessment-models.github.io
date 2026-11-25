#!/usr/bin/env node
/**
 * Site text lint.
 *
 * Guards two properties of the published site:
 *
 *  1. No em/en dashes (U+2014/U+2013) anywhere in tracked site sources.
 *     The whole site renders plain hyphens instead; generated registry data
 *     is sanitized at sync time by scripts/sync_org_catalog.py, this lint
 *     keeps hand-written sources clean.
 *  2. The hand-written homepage portfolio cards in assets/js/ecosystem.js
 *     must not drift from the synced registry: every PORTFOLIO_ITEMS version
 *     must match data/ecosystem-registry.json for the same artifact id, and
 *     the no-JS telemetry fallbacks in index.html must match the registry
 *     summary (artifacts, maturity-model layer count, touchpoints+handshakes).
 *
 * Usage: node scripts/lint-site-text.mjs
 * Exits non-zero with one FAIL line per violation.
 */
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);

let failures = 0;
const fail = (msg) => {
  console.error(`FAIL: ${msg}`);
  failures += 1;
};

// --- 1. dash scan over every tracked text file ---
const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
  .split('\n')
  .filter(Boolean);
for (const rel of tracked) {
  let raw;
  try {
    raw = readFileSync(join(root, rel));
  } catch {
    continue;
  }
  if (raw.includes(0)) continue; // binary file
  const lines = raw.toString('utf8').split('\n');
  lines.forEach((line, idx) => {
    if (line.includes(EM_DASH) || line.includes(EN_DASH)) {
      fail(`${rel}:${idx + 1} contains an em/en dash (U+2014/U+2013); use a plain hyphen "-"`);
    }
  });
}

// --- 2. portfolio cards vs registry ---
const registry = JSON.parse(readFileSync(join(root, 'data', 'ecosystem-registry.json'), 'utf8'));
const byId = new Map((registry.artifacts || []).map((a) => [a.id, a]));
const ecosystemJs = readFileSync(join(root, 'assets', 'js', 'ecosystem.js'), 'utf8');
const portfolioBlock = ecosystemJs.slice(
  ecosystemJs.indexOf('PORTFOLIO_ITEMS'),
  ecosystemJs.indexOf('const portfolioTabs')
);
const itemRe = /id:\s*"([^"]+)"[\s\S]*?meta:\s*"([^"]+)"/g;
let match;
while ((match = itemRe.exec(portfolioBlock)) !== null) {
  const [, id, meta] = match;
  const artifact = byId.get(id);
  if (!artifact) continue;
  const cardVersion = meta.split('·')[0].trim();
  if (artifact.version && cardVersion !== artifact.version) {
    fail(`portfolio card "${id}" shows ${cardVersion} but data/ecosystem-registry.json says ${artifact.version}`);
  }
}

// --- 3. no-JS telemetry fallbacks in index.html vs registry summary ---
const html = readFileSync(join(root, 'index.html'), 'utf8');
const seamCount = (registry.touchpoints || []).length + (registry.handshakes || []).length;
const expectedFallbacks = {
  'stat-total-artifacts': String(registry.summary?.total_artifacts ?? ''),
  'stat-models': String(registry.summary?.by_layer?.['maturity-model'] ?? ''),
  'stat-seams': String(seamCount || ''),
};
for (const [elId, want] of Object.entries(expectedFallbacks)) {
  const re = new RegExp(`<dd id="${elId}">([^<]*)</dd>`);
  const found = html.match(re);
  if (found && want && found[1].trim() !== want) {
    fail(`index.html fallback #${elId} shows "${found[1].trim()}" but the registry says ${want}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} site-text lint failure(s).`);
  process.exit(1);
}
console.log('OK: no em/en dashes in tracked files; portfolio cards and telemetry fallbacks match the registry.');
