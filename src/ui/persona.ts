/**
 * Persona modes (blueprint §2): the same gateway, different entry points.
 * Persona choice is persisted and broadcast via a custom DOM event so views
 * can react without tight coupling.
 */
import { h } from './dom';

export type Persona = 'assessor' | 'assessee' | 'practitioner' | 'certifier';

export interface PersonaDef {
  id: Persona;
  label: string;
  role: string;
  /** landing "suggested next step" */
  step: { text: string; href: string; cta: string };
  /** primary CTA label on model pages */
  modelCta: string;
}

export const PERSONAS: PersonaDef[] = [
  {
    id: 'assessor',
    label: 'Assessor',
    role: 'run trial assessments and generate evidence-backed reports',
    step: {
      text: 'Pick a model, run a trial assessment and generate a shareable report.',
      href: '#/trial/maturity-model-digital-transformation',
      cta: 'Start a trial assessment →',
    },
    modelCta: 'Start trial →',
  },
  {
    id: 'assessee',
    label: 'Assessee',
    role: 'understand what will be assessed and what each level expects',
    step: {
      text: 'Explore a model’s dimensions, criteria and level expectations before your assessment.',
      href: '#/model/maturity-model-digital-transformation',
      cta: 'Explore the flagship model →',
    },
    modelCta: 'Review expectations →',
  },
  {
    id: 'practitioner',
    label: 'Practitioner',
    role: 'compare models, component reuse and contract handshakes',
    step: {
      text: 'Use the constellation to trace component reuse and maturity-scale-contract handshakes across models.',
      href: '#/',
      cta: 'Open the constellation →',
    },
    modelCta: 'Inspect structure →',
  },
  {
    id: 'certifier',
    label: 'Certifying Body',
    role: 'verify conformance levels, contracts and portfolio coverage',
    step: {
      text: 'Review repository-standard conformance across the whole portfolio in one dashboard.',
      href: '#/conformance',
      cta: 'Open the conformance dashboard →',
    },
    modelCta: 'Check conformance →',
  },
];

const KEY = 'am-persona';
const EVENT = 'am:persona';

export function getPersona(): Persona {
  const v = localStorage.getItem(KEY);
  return PERSONAS.some((p) => p.id === v) ? (v as Persona) : 'assessor';
}

export function getPersonaDef(): PersonaDef {
  return PERSONAS.find((p) => p.id === getPersona()) ?? PERSONAS[0];
}

export function setPersona(p: Persona): void {
  localStorage.setItem(KEY, p);
  window.dispatchEvent(new CustomEvent(EVENT, { detail: p }));
}

export function onPersonaChange(cb: (p: Persona) => void): void {
  window.addEventListener(EVENT, (e) => cb((e as CustomEvent<Persona>).detail));
}

/** Mount the topbar persona picker. */
export function mountPersonaPicker(container: HTMLElement): void {
  function draw(): void {
    container.innerHTML = '';
    const select = h('select', {
      class: 'persona-select',
      'aria-label': 'Persona',
      title: 'Persona — adjusts entry points and default actions',
    });
    for (const p of PERSONAS) {
      const opt = h('option', { value: p.id }, p.label) as HTMLOptionElement;
      if (p.id === getPersona()) opt.selected = true;
      select.append(opt);
    }
    select.addEventListener('change', () => setPersona(select.value as Persona));
    container.append(h('span', { class: 'persona-label' }, 'persona'), select);
  }
  draw();
  onPersonaChange(draw);
}
