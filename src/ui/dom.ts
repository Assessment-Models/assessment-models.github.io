/** Small DOM helpers: element builder, tooltip, drawer, badges. */
import type { IndexNode, NodeGroup } from '../types';

export const GROUP_COLORS: Record<NodeGroup, string> = {
  'maturity-models': '#8b7cf8',
  'assessment-models': '#38c1d9',
  'assessment-tools': '#e8b04b',
  components: '#55c47f',
  infrastructure: '#7d8aa5',
  external: '#c76fd1',
};

export const GROUP_LABELS: Record<NodeGroup, string> = {
  'maturity-models': 'Maturity models',
  'assessment-models': 'Assessment models',
  'assessment-tools': 'Catalogs & tools',
  components: 'Components',
  infrastructure: 'Infrastructure',
  external: 'External contracts',
};

export function groupLabel(g: NodeGroup): string {
  return GROUP_LABELS[g] ?? g;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') el.className = v;
    else if (k === 'html') el.innerHTML = v;
    else el.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null) continue;
    el.append(c instanceof Node ? c : document.createTextNode(c));
  }
  return el;
}

// ---------- tooltip ----------

const tooltipEl = () => document.getElementById('tooltip')!;

export function showTooltip(html: string, x: number, y: number): void {
  const t = tooltipEl();
  t.innerHTML = html;
  t.hidden = false;
  const pad = 16;
  const { innerWidth, innerHeight } = window;
  const rect = t.getBoundingClientRect();
  const left = Math.min(Math.max(pad, x + pad), innerWidth - rect.width - pad);
  const top = Math.min(Math.max(pad, y + pad), innerHeight - rect.height - pad);
  t.style.left = `${left}px`;
  t.style.top = `${top}px`;
}

export function hideTooltip(): void {
  tooltipEl().hidden = true;
}

// ---------- drawer (side panel) ----------

const drawerEl = () => document.getElementById('drawer')!;

export function openDrawer(content: HTMLElement): void {
  const d = drawerEl();
  d.innerHTML = '';
  const close = h('button', { class: 'drawer-close', 'aria-label': 'Close' }, '×');
  close.addEventListener('click', closeDrawer);
  d.append(close, content);
  d.hidden = false;
}

export function closeDrawer(): void {
  drawerEl().hidden = true;
}

// ---------- toast ----------

export function toast(msg: string): void {
  const t = document.getElementById('toast')!;
  t.textContent = msg;
  t.hidden = false;
  clearTimeout((t as unknown as { _t?: number })._t);
  (t as unknown as { _t?: number })._t = window.setTimeout(() => (t.hidden = true), 2600);
}

// ---------- badges & chips ----------

export function badge(text: string, color: string, title?: string): HTMLElement {
  return h('span', {
    class: 'badge',
    style: `--badge-color:${color}`,
    ...(title ? { title } : {}),
  }, text);
}

export function conformanceBadge(node: IndexNode): HTMLElement | null {
  if (!node.conformance) return null;
  const color =
    node.conformance === 'full' ? '#55c47f' : node.conformance === 'structural' ? '#38c1d9' : '#e8b04b';
  return badge(`${node.conformance} @ std ${node.standardVersion ?? '?'}`, color, 'Repository-standard conformance level');
}

export function groupChip(g: NodeGroup, label: string, active: boolean): HTMLElement {
  const chip = h('button', {
    class: `chip${active ? ' active' : ''}`,
    'data-group': g,
    style: `--chip-color:${GROUP_COLORS[g]}`,
  }, label);
  return chip;
}

// ---------- misc ----------

export function repoUrl(repo: string): string {
  // partner repos carry their org ('org/name'); ecosystem repos are bare
  return repo.includes('/')
    ? `https://github.com/${repo}`
    : `https://github.com/Assessment-Models/${repo}`;
}

export function spinner(text = 'Loading…'): HTMLElement {
  return h('div', { class: 'spinner-box' }, h('span', { class: 'spinner' }), h('span', {}, text));
}

export function errorPanel(title: string, detail?: string): HTMLElement {
  return h('div', { class: 'error-panel' },
    h('h2', {}, title),
    detail ? h('p', { class: 'dim' }, detail) : null,
    h('a', { class: 'btn', href: '#/' }, '← Back to the metro map'),
  );
}
