#!/usr/bin/env node
/**
 * Homepage artifact-link guardrail.
 *
 * Verifies that every GitHub repository referenced by the static marketing
 * homepage (index.html) actually exists. Fictional, renamed, or removed
 * repositories fail the build, so fabricated catalog entries (e.g. the
 * oda-capability-blueprints placeholder) can never ship again.
 *
 * Checks:
 *   1. Every github.com/{owner}/{repo} URL in index.html resolves to a real
 *      repository (via the GitHub API).
 *   2. Every repository card in the #repoGrid catalog links to a real
 *      repository (cards may not name an artifact without a resolvable link).
 *
 * Usage: node scripts/validate-homepage-links.mjs [file]
 * Env:   GITHUB_TOKEN (optional, raises the API rate limit)
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv[2] ?? join(root, 'index.html');
const html = readFileSync(file, 'utf8');
const token = process.env.GITHUB_TOKEN;

// Path segments that follow a repo in GitHub web URLs; not repo names.
const NON_REPO_SEGMENTS = new Set([
  'tree', 'blob', 'issues', 'pull', 'releases', 'tags', 'wiki', 'settings',
  'actions', 'projects', 'security', 'pulse', 'graphs', 'commits', 'branches',
  'compare', 'raw', 'archive', 'forks', 'stargazers', 'watchers', 'search',
  'new', 'organizations', 'topics', 'notifications', 'marketplace', 'features',
]);

function collectRepoRefs() {
  const refs = new Map(); // "owner/repo" -> [locations]
  const add = (slug, where) => {
    if (!refs.has(slug)) refs.set(slug, []);
    refs.get(slug).push(where);
  };

  // every github.com/{owner}/{repo} URL in the document
  const urlRe = /https:\/\/github\.com\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)/g;
  for (const m of html.matchAll(urlRe)) {
    const [, owner, repo] = m;
    if (!owner || !repo) continue;
    if (NON_REPO_SEGMENTS.has(repo.toLowerCase())) continue;
    add(`${owner}/${repo}`, `URL in document`);
  }

  // every catalog card heading must carry a repository link
  const cardRe = /<h3[^>]*>\s*<a\s+href="([^"]+)"[^>]*>/g;
  for (const m of html.matchAll(cardRe)) {
    const href = m[1];
    if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+/.test(href)) {
      add(`INVALID-CARD-LINK: ${href}`, 'repository catalog card');
    }
  }
  return refs;
}

async function main() {
  const refs = collectRepoRefs();
  if (!refs.size) {
    console.error('validate-homepage-links: no GitHub repository references found (unexpected).');
    process.exit(1);
  }

  const missing = [];
  for (const [slug, locations] of refs) {
    if (slug.startsWith('INVALID-CARD-LINK:')) {
      missing.push(`${slug} (${locations.join(', ')})`);
      continue;
    }
    const res = await fetch(`https://api.github.com/repos/${slug}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': 'validate-homepage-links',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (res.status === 404) missing.push(`${slug} (${locations.join(', ')})`);
    else if (!res.ok) {
      console.error(`validate-homepage-links: GitHub API returned ${res.status} for ${slug} — treating as failure.`);
      process.exit(1);
    }
  }

  if (missing.length) {
    console.error('validate-homepage-links: FAILED');
    console.error('The homepage references repositories that do not exist:');
    for (const m of missing) console.error(`  - ${m}`);
    console.error('Fix index.html so every advertised artifact links to a real repository.');
    process.exit(1);
  }
  console.log(`validate-homepage-links: OK (${refs.size} referenced repos verified).`);
}

main();
