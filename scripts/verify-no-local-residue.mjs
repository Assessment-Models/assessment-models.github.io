#!/usr/bin/env node
/**
 * Verify that no local-tooling scratch residue is tracked in this repository,
 * and that .gitignore still carries the rules that keep it untracked.
 *
 * Why a gate and not just .gitignore:
 *   An archive dropped into this repo root can carry its own .gitignore and
 *   OVERWRITE the repository's, silently dropping every ignore rule. When
 *   that happens the residue becomes committable again with no visible
 *   signal. This gate is checked against the tracked tree itself, so it
 *   holds regardless of what .gitignore currently says.
 *
 * Git's own matcher is the authority here — not a hand-rolled glob-to-regex
 * conversion, which would silently disagree with gitignore semantics on
 * escapes, directory-only patterns and character classes.
 *
 * The repo is PUBLIC. Unreferenced binaries and credential-bearing files
 * must never enter its history.
 *
 * Usage: node scripts/verify-no-local-residue.mjs
 * Exit 0 = clean. Exit 1 = violation(s) found; details are printed.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Canonical residue rules. This list is the contract: .gitignore must carry
 * every rule, and no tracked file may match any of them.
 *
 * Each entry pairs the literal ignore pattern with a representative probe
 * path used to test git's matcher. The probe must be a path the pattern is
 * expected to match.
 */
const RULES = [
  // Build and tooling output
  ['node_modules/', 'node_modules/pkg/index.js'],
  ['dist/', 'dist/index.html'],
  ['.tmp/', '.tmp/out.js'],
  ['public/models.json', 'public/models.json'],
  ['public/snapshot/', 'public/snapshot/model.yaml'],
  // OS scratch
  ['.DS_Store', '.DS_Store'],
  ['Thumbs.db', 'Thumbs.db'],
  ['ehthumbs.db', 'ehthumbs.db'],
  ['Desktop.ini', 'Desktop.ini'],
  ['.Spotlight-V100/', '.Spotlight-V100/x'],
  ['.Trashes/', '.Trashes/x'],
  // External authoring-tool scratch (e.g. .aistudio artifacts, screenshot caches)
  ['.aistudio/', '.aistudio/artifacts/brain/x/.tempmediaStorage/a.png'],
  ['.tempmediaStorage/', '.tempmediaStorage/a.png'],
  ['.cursor/', '.cursor/rules/x'],
  ['.claude/', '.claude/settings.json'],
  ['.gemini/', '.gemini/x'],
  ['.codex/', '.codex/x'],
  ['.aider*', '.aider.conf'],
  ['.continue/', '.continue/x'],
  // Alternate lockfiles — this project builds with npm (package-lock.json)
  ['bun.lock', 'bun.lock'],
  ['bun.lockb', 'bun.lockb'],
  ['yarn.lock', 'yarn.lock'],
  ['pnpm-lock.yaml', 'pnpm-lock.yaml'],
  // Editor scratch
  ['.idea/', '.idea/workspace.xml'],
  ['.vscode/', '.vscode/settings.json'],
  ['*.swp', 'file.swp'],
  ['*.swo', 'file.swo'],
  ['*~', 'file~'],
  ['.\\#*', '.#lockfile'],
  ['\\#*\\#', '#file#'],
  // Language runtime scratch
  ['__pycache__/', '__pycache__/mod.pyc'],
  ['*.pyc', 'mod.pyc'],
  // Patch and merge residue
  ['*.orig', 'file.orig'],
  ['*.rej', 'file.rej'],
  // Credential-bearing files
  ['.env', '.env'],
  ['.env.*', '.env.local'],
  // Scratch written into the workspace by CI
  ['*.log', 'sync-output.log'],
  ['diag-lines.txt', 'diag-lines.txt'],
];

/** Negated patterns: intentionally committable (templates). */
const EXEMPT = ['!.env*.example'];

/** Runs git in the given cwd. */
function git(args, opts = {}) {
  return execFileSync('git', args, {
    cwd: opts.cwd ?? ROOT,
    encoding: 'utf8',
    input: opts.input,
    stdio: opts.input ? ['pipe', 'pipe', 'pipe'] : undefined,
  });
}

/**
 * Ask git's own matcher which of the given paths are ignored by the
 * ignore rules in `rules`, in an isolated scratch repository so the
 * repository's own .gitignore does not interfere.
 */
function ignoredByRules(rules, paths) {
  if (paths.length === 0) return new Set();
  const scratch = mkdtempSync(join(tmpdir(), 'residue-rules-'));
  try {
    git(['init', '-q', '.'], { cwd: scratch });
    writeFileSync(join(scratch, '.gitignore'), rules.join('\n') + '\n');
    let out = '';
    try {
      out = git(['check-ignore', '--no-index', '--stdin'], {
        cwd: scratch,
        input: paths.join('\n') + '\n',
      });
    } catch (err) {
      // check-ignore exits 1 when NO path is ignored; stdout still holds matches.
      out = err.stdout ?? '';
    }
    return new Set(out.split('\n').filter(Boolean));
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- check 1
// The tracked tree must contain no residue.
let tracked = [];
try {
  tracked = git(['ls-files', '-z']).split('\0').filter(Boolean);
} catch (err) {
  console.error('ERROR: could not read the tracked file list from git.');
  console.error(err.message);
  process.exit(1);
}

const residueMatchers = ignoredByRules(RULES.map(([pattern]) => pattern), tracked);
const offenders = tracked.filter((f) => residueMatchers.has(f));

if (offenders.length > 0) {
  console.error('FAIL: local-tooling scratch residue is tracked in this repository.');
  console.error('');
  for (const f of offenders) console.error(`  ${f}`);
  console.error('');
  console.error('This repository is public. Remove these paths from the index');
  console.error('(git rm --cached -r <path>) and make sure .gitignore covers them.');
  process.exit(1);
}

// ---------------------------------------------------------------- check 2
// The repository's .gitignore must still ignore every canonical rule.
// Tested with git's matcher, so semantics — not text equality — decide.
const gitignorePath = join(ROOT, '.gitignore');
if (!existsSync(gitignorePath)) {
  console.error('FAIL: .gitignore is missing — residue would be committable.');
  process.exit(1);
}

const repoRules = readFileSync(gitignorePath, 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'));

const probes = RULES.map(([, probe]) => probe);
const stillIgnored = ignoredByRules(repoRules, probes);

const missing = RULES.filter(([, probe]) => !stillIgnored.has(probe)).map(([pattern]) => pattern);

if (missing.length > 0) {
  console.error('FAIL: .gitignore no longer ignores required residue paths.');
  console.error('');
  for (const m of missing) console.error(`  ${m}`);
  console.error('');
  console.error('The tracked tree is clean, but these rules let residue back in.');
  console.error('This usually means an archive carrying its own .gitignore was');
  console.error('extracted over the repository root.');
  process.exit(1);
}

// The template exemption must still be honoured: a *.example template has to
// stay committable, otherwise the rule set is over-blocking.
const exemptProbes = ['.env.example', '.env.production.example'];
const exemptStillIgnored = ignoredByRules(repoRules, exemptProbes);
const overBlocked = exemptProbes.filter((p) => exemptStillIgnored.has(p));

if (overBlocked.length > 0) {
  console.error('FAIL: .gitignore blocks template files that must stay committable.');
  console.error('');
  for (const p of overBlocked) console.error(`  ${p}`);
  console.error('');
  console.error('Expected a negation rule (!.env*.example) to exempt them.');
  process.exit(1);
}

// ---------------------------------------------------------------- report
console.log(
  `OK: no tracked residue (${tracked.length} tracked files checked); ` +
  `.gitignore still ignores all ${RULES.length} required paths and exempts templates.`,
);
