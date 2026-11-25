/**
 * Guided walkthrough - spotlight tour synchronized to the four corporate viewports:
 * Metro Map -> Viewport Switcher -> Interactions & CI -> Model Drill-Down -> Trial -> Report -> Conformance.
 */
import { h } from './dom';

const DONE_KEY = 'am-walkthrough-done';

interface Step {
  title: string;
  text: string;
  selector: string;
  hash?: string;
  waitMs?: number;
}

const STEPS: Step[] = [
  {
    title: 'Ecosystem Metro Map',
    text: 'Every governed maturity model, assessment instrument, and OpenDEA blueprint appears as a station across architectural corridors. Transfer nodes mark touchpoints; interchange diamonds mark contract handshakes.',
    selector: '.metro-shell',
    hash: '#/',
    waitMs: 900,
  },
  {
    title: 'Persona Viewports',
    text: 'Switch between Business Transformation Executives, Assessors, Assessees, and Agents. Each viewport adapts default guidance, key metrics, and callout links across both the overview and the gateway.',
    selector: '.persona-select',
  },
  {
    title: 'Inter-Model Interactions & CI',
    text: 'Inspect how existing models coordinate via CR-AM-13 touchpoints and how future repositories from maturity-model-template propagate automatically via 3-level GitHub Actions CI.',
    selector: '.ci-stage',
    hash: '#/interactions',
    waitMs: 700,
  },
  {
    title: 'Model Structure & Contracts',
    text: 'Drill into every model’s dimensions, criteria, L-1 to L-5 anchors, required evidence, touchpoints.yaml seams, and assessment-manifest.json declarations.',
    selector: '.model-head',
    hash: '#/model/maturity-model-digital-transformation',
    waitMs: 1200,
  },
  {
    title: 'Browser-Local Trial Assessment',
    text: 'Score each criterion directly in your browser. Dimension roll-ups, effort-adjusted calculations, and mandatory level gates compute live without sending data off-device.',
    selector: '.trial-side',
    hash: '#/trial/maturity-model-digital-transformation',
    waitMs: 1300,
  },
  {
    title: 'Executive Report & Portfolio Conformance',
    text: 'Export JSON/PDF assessment reports or review AM-MODEL-REPOSITORY-STANDARD adoption across every repository on the Conformance Dashboard.',
    selector: '.conf-table',
    hash: '#/conformance',
    waitMs: 800,
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
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) finish();
  });

  for (const step of STEPS) {
    if (aborted) break;
    if (step.hash && location.hash !== step.hash) {
      location.hash = step.hash;
      await new Promise((r) => setTimeout(r, 300));
    }
    if (step.waitMs) await new Promise((r) => setTimeout(r, step.waitMs));
    if (aborted) break;
    const target = document.querySelector(step.selector);
    if (!target) continue;

    const rect = target.getBoundingClientRect();
    overlay.innerHTML = '';

    const spot = h('div', { class: 'walkthrough-spot' });
    spot.style.top = `${Math.max(0, rect.top - 8)}px`;
    spot.style.left = `${Math.max(0, rect.left - 8)}px`;
    spot.style.width = `${rect.width + 16}px`;
    spot.style.height = `${rect.height + 16}px`;
    overlay.append(spot);

    await new Promise<void>((resolveStep) => {
      const pop = h('div', { class: 'walkthrough-pop' },
        h('h3', {}, step.title),
        h('p', { class: 'dim' }, step.text),
        (() => {
          const bar = h('div', { style: 'display:flex;gap:.5rem;justify-content:flex-end;margin-top:.65rem' });
          const skip = h('button', { class: 'btn small' }, 'Skip tour');
          skip.addEventListener('click', () => finish());
          const gotIt = h('button', { class: 'btn primary small' }, 'Next');
          gotIt.addEventListener('click', () => resolveStep());
          bar.append(skip, gotIt);
          return bar;
        })(),
      );
      const popWidth = 350;
      const left = Math.min(Math.max(12, rect.left), window.innerWidth - popWidth - 12);
      const below = rect.bottom + 14 < window.innerHeight - 200;
      pop.style.left = `${left}px`;
      pop.style.top = below ? `${rect.bottom + 14}px` : `${Math.max(12, rect.top - 200)}px`;
      pop.style.width = `${popWidth}px`;
      overlay.append(pop);
    });
  }
  finish();
}
