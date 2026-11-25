/**
 * Persona viewports: unified across the homepage and /gateway/.
 * Supports Agents, Assessors, Assessees, and Business Transformation Executives.
 * Persisted in localStorage (`am-persona`) so viewport choice travels across views.
 */
import { h } from './dom';

export type Persona = 'executive' | 'assessor' | 'assessee' | 'agent';

export interface PersonaDef {
  id: Persona;
  label: string;
  shortLabel: string;
  role: string;
  calloutTitle: string;
  calloutSummary: string;
  focusMetrics: string[];
  /** landing "suggested next step" */
  step: { text: string; href: string; cta: string };
  /** primary CTA label on model pages */
  modelCta: string;
}

export const PERSONAS: PersonaDef[] = [
  {
    id: 'executive',
    label: 'Business Transformation Executive',
    shortLabel: 'Executives',
    role: 'align maturity baselines with OpenDEA reference blueprints and target outcomes',
    calloutTitle: 'Portfolio Posture & Transformation Horizon',
    calloutSummary:
      'Focuses on weighted capability balance across Operations, Technology, Services Delivery, Modernization, and Autonomous Operations - linking maturity gaps to OpenDEA DERA-L1 guardrails and effort-adjusted progression.',
    focusMetrics: ['Portfolio Coverage', 'Effort-Adjusted Value', 'OpenDEA DERA-L1 Alignment'],
    step: {
      text: 'Review portfolio conformance, inter-model dependencies, and executive assessment reports.',
      href: '#/conformance',
      cta: 'Open Conformance & Portfolio →',
    },
    modelCta: 'View Executive Trial →',
  },
  {
    id: 'assessor',
    label: 'Assessor',
    shortLabel: 'Assessors',
    role: 'run trial assessments, calibrate L-1..L-5 anchors, and generate evidence-backed reports',
    calloutTitle: 'Calibration, Evidence & Deterministic Scoring',
    calloutSummary:
      'Exposes criterion weights, mandatory gates, anchor statements, and evidence confidence rules so assessors produce auditable, repeatable L-1 to L-5 determinations.',
    focusMetrics: ['Criterion Weights', 'Mandatory Gates', 'Evidence Requirements'],
    step: {
      text: 'Pick a domain model or EA instrument, run a trial assessment, and export a JSON/PDF report.',
      href: '#/trial/maturity-model-digital-transformation',
      cta: 'Start Trial Assessment →',
    },
    modelCta: 'Start Trial →',
  },
  {
    id: 'assessee',
    label: 'Assessee',
    shortLabel: 'Assessees',
    role: 'review level expectations, exit criteria, and required evidence before evaluation',
    calloutTitle: 'Target Expectations & Evidence Readiness',
    calloutSummary:
      'Translates abstract maturity bands into concrete engineering, operations, and governance evidence checklists so teams know exactly what L-1 through L-5 expects.',
    focusMetrics: ['Level Anchors (L-1..L-5)', 'Evidence Checklists', 'Gap-to-Target'],
    step: {
      text: 'Inspect dimension expectations, anchor behaviors, and evidence artifacts for your domain.',
      href: '#/model/maturity-model-digital-transformation',
      cta: 'Explore Model Expectations →',
    },
    modelCta: 'Review Expectations →',
  },
  {
    id: 'agent',
    label: 'Agent',
    shortLabel: 'Agents',
    role: 'consume machine-readable manifests, touchpoint contracts, and CI conformance signals',
    calloutTitle: 'Machine-Readable Contracts & CI Dispatch',
    calloutSummary:
      'Surfaces immutable model identifiers, assessment-manifest.json endpoints, touchpoints.yaml seams, and GitHub Actions repository_dispatch signals for autonomous orchestration.',
    focusMetrics: ['assessment-manifest.json', 'touchpoints.yaml Seams', '3-Level CI Dispatch'],
    step: {
      text: 'Inspect inter-model touchpoint seams, handshake compatibility ranges, and CI propagation pipelines.',
      href: '#/interactions',
      cta: 'Inspect Interactions & CI →',
    },
    modelCta: 'Inspect Contract & YAML →',
  },
];

const KEY = 'am-persona';
const EVENT = 'am:persona';

const LEGACY_MAP: Record<string, Persona> = {
  practitioner: 'agent',
  certifier: 'executive',
};

export function getPersona(): Persona {
  try {
    const v = localStorage.getItem(KEY) ?? '';
    if (v in LEGACY_MAP) return LEGACY_MAP[v];
    return PERSONAS.some((p) => p.id === v) ? (v as Persona) : 'executive';
  } catch {
    return 'executive';
  }
}

export function getPersonaDef(): PersonaDef {
  return PERSONAS.find((p) => p.id === getPersona()) ?? PERSONAS[0];
}

export function setPersona(p: Persona): void {
  try {
    localStorage.setItem(KEY, p);
  } catch {
    /* ignore storage errors */
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: p }));
}

export function onPersonaChange(cb: (p: Persona) => void): void {
  window.addEventListener(EVENT, (e) => cb((e as CustomEvent<Persona>).detail));
}

/** Mount the topbar persona viewport picker. */
export function mountPersonaPicker(container: HTMLElement): void {
  function draw(): void {
    container.innerHTML = '';
    const select = h('select', {
      class: 'persona-select',
      'aria-label': 'Persona viewport',
      title: 'Switch persona viewport (Executives, Assessors, Assessees, Agents)',
    });
    for (const p of PERSONAS) {
      const opt = h('option', { value: p.id }, p.label) as HTMLOptionElement;
      if (p.id === getPersona()) opt.selected = true;
      select.append(opt);
    }
    select.addEventListener('change', () => setPersona(select.value as Persona));
    container.append(h('span', { class: 'persona-label' }, 'Viewport'), select);
  }
  draw();
  onPersonaChange(draw);
}
