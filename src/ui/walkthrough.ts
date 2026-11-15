/**
 * Guided walkthrough (blueprint §6.7) — a first-visit spotlight tour:
 * constellation → persona → model drill-down → trial → report.
 * Each step anchors to a selector; steps whose target is missing are skipped.
 * Replays via the topbar "?" button; suppressed after completion.
 */
import { h } from './dom';

const DONE_KEY = 'am-walkthrough-done';

interface Step {
  title: string;
  text: string;
  /** selector to spotlight; the tour navigates to the step's hash first when given */
  selector: string;
  hash?: string;
  waitMs?: number;
}

const STEPS: Step[] = [
  {
    title: 'The constellation',
    text: 'Every registered asset of the ecosystem, clustered by domain. Lines are component imports, shared components and contract handshakes. Hover to inspect a node, click it for details, drag to orbit, scroll to zoom.',
    selector: '.constellation-wrap',
    hash: '#/',
    waitMs: 900,
  },
  {
    title: 'Choose your persona',
    text: 'Your persona tailors entry points and default actions: Assessors run trials, Assessses review expectations, Practitioners trace reuse, Certifying Bodies check conformance.',
    selector: '.persona-select',
  },
  {
    title: 'Drill into a model',
    text: 'Every model page exposes its full structure: dimensions → sub-dimensions → criteria → level anchors and evidence, plus its scale and component imports.',
    selector: '.model-head',
    hash: '#/model/maturity-model-digital-transformation',
    waitMs: 1400,
  },
  {
    title: 'Run a trial assessment',
    text: 'Score each criterion against its evidence-anchored levels. The cascade sidebar computes live — dimension roll-ups, weighted overall, band and resolved level — entirely in your browser.',
    selector: '.trial-side',
    hash: '#/trial/maturity-model-digital-transformation',
    waitMs: 1600,
  },
  {
    title: 'Generate a report',
    text: 'Reports combine an executive summary, radar and cascade charts, gap-to-target analysis and your evidence notes — printable and exportable as JSON.',
    selector: '.report-hero',
    hash: '#/report/maturity-model-digital-transformation',
    waitMs: 2000,
  },
  {
    title: 'Verify the portfolio',
    text: 'The conformance dashboard shows repository-standard adoption across every repo — the Certifying Body view.',
    selector: '.conf-table',
    hash: '#/conformance',
    waitMs: 900,
  },
];

export function walkthroughSeen(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === '1';
  } catch {
    return false;
  }
}

let running = false;

export async function runWalkthrough(): Promise<void> {
  if (running) return;
  running = true;
  try {
    await play();
  } finally {
    running = false;
  }
  try {
    localStorage.setItem(DONE_KEY, '1');
  } catch {
    /* private mode */
  }
}

export function maybeRunWalkthrough(): void {
  if (!walkthroughSeen()) void runWalkthrough();
}

async function play(): Promise<void> {
  const overlay = h('div', { class: 'walkthrough-overlay' });
  document.body.append(overlay);
  let aborted = false;

  const finish = (): void => {
    aborted = true;
    overlay.remove();
    window.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Escape' || e.key === 'Enter') finish();
  };
  window.addEventListener('keydown', onKey);
  overlay.addEventListener('click', finish);

  for (const step of STEPS) {
    if (aborted) break;
    if (step.hash && location.hash !== step.hash) {
      location.hash = step.hash;
      await new Promise((r) => setTimeout(r, 300));
    }
    if (step.waitMs) await new Promise((r) => setTimeout(r, step.waitMs));
    if (aborted) break;
    const target = document.querySelector(step.selector);
    if (!target) continue; // step's screen isn't reachable — skip gracefully

    const rect = target.getBoundingClientRect();
    overlay.innerHTML = '';

    // spotlight cutout (box-shadow trick)
    const spot = h('div', { class: 'walkthrough-spot' });
    spot.style.top = `${Math.max(0, rect.top - 8)}px`;
    spot.style.left = `${Math.max(0, rect.left - 8)}px`;
    spot.style.width = `${rect.width + 16}px`;
    spot.style.height = `${rect.height + 16}px`;
    overlay.append(spot);

    // popover near the spotlight; "Got it" advances, "Skip tour" ends the tour
    await new Promise<void>((resolveStep) => {
      const pop = h('div', { class: 'walkthrough-pop' },
        h('h3', {}, step.title),
        h('p', { class: 'dim' }, step.text),
        (() => {
          const bar = h('div', { style: 'display:flex;gap:.5rem;justify-content:flex-end;margin-top:.6rem' });
          const skip = h('button', { class: 'btn small' }, 'Skip tour');
          skip.addEventListener('click', () => finish());
          const gotIt = h('button', { class: 'btn primary small' }, 'Got it');
          gotIt.addEventListener('click', () => resolveStep());
          bar.append(skip, gotIt);
          return bar;
        })(),
      );
      const popWidth = 340;
      const left = Math.min(Math.max(12, rect.left), window.innerWidth - popWidth - 12);
      const below = rect.bottom + 14 < window.innerHeight - 190;
      pop.style.left = `${left}px`;
      pop.style.top = below ? `${rect.bottom + 14}px` : `${Math.max(12, rect.top - 190)}px`;
      pop.style.width = `${popWidth}px`;
      overlay.append(pop);
    });
  }
  finish();
}
