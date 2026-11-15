/**
 * Landing view — the constellation. Models as glowing nodes, grouped by
 * domain cluster; edges show component imports, shared components and
 * contract handshakes. Pure SVG, deterministic layout, tooltips + drawer.
 */
import type { IndexManifest, IndexNode, NodeGroup } from '../types';
import { fetchManifest } from '../data/loader';
import {
  GROUP_COLORS,
  closeDrawer,
  conformanceBadge,
  groupChip,
  groupLabel,
  h,
  hideTooltip,
  openDrawer,
  repoUrl,
  showTooltip,
} from '../ui/dom';

const SVG_NS = 'http://www.w3.org/2000/svg';

const W = 1280;
const H = 860;

const CLUSTER_CENTERS: Record<NodeGroup, { x: number; y: number }> = {
  'maturity-models': { x: 400, y: 310 },
  'assessment-models': { x: 920, y: 250 },
  'assessment-tools': { x: 1060, y: 540 },
  components: { x: 640, y: 650 },
  infrastructure: { x: 190, y: 640 },
  external: { x: 680, y: 400 },
};

const NODE_RADIUS: Record<NodeGroup, number> = {
  'maturity-models': 30,
  'assessment-models': 23,
  'assessment-tools': 21,
  components: 22,
  infrastructure: 15,
  external: 26,
};

interface Placed {
  node: IndexNode;
  x: number;
  y: number;
  r: number;
}

/** Ring spread for a cluster of n members (mirrored by the label placement). */
function clusterSpread(count: number): number {
  return Math.max(70, 46 + count * 17);
}

/** Deterministic cluster layout: groups at fixed centers, members on a ring. */
function layout(nodes: IndexNode[]): Placed[] {
  const byGroup = new Map<NodeGroup, IndexNode[]>();
  for (const n of nodes) {
    if (!byGroup.has(n.group)) byGroup.set(n.group, []);
    byGroup.get(n.group)!.push(n);
  }
  const placed: Placed[] = [];
  for (const [group, members] of byGroup) {
    const c = CLUSTER_CENTERS[group];
    const r0 = NODE_RADIUS[group];
    const spread = clusterSpread(members.length);
    members.forEach((node, i) => {
      const angle = (i / members.length) * Math.PI * 2 - Math.PI / 2;
      const rr = members.length === 1 ? 0 : spread;
      const jitter = ((i * 37) % 11) - 5; // deterministic wiggle to avoid perfect symmetry
      placed.push({
        node,
        x: c.x + Math.cos(angle) * rr + jitter,
        y: c.y + Math.sin(angle) * rr * 0.72 + jitter,
        r: r0,
      });
    });
  }
  return placed;
}

function shortName(n: IndexNode): string {
  return n.name.length > 26 ? n.name.slice(0, 24) + '…' : n.name;
}

export async function renderConstellation(root: HTMLElement): Promise<void> {
  const manifest: IndexManifest = await fetchManifest();
  const groups = [...new Set(manifest.nodes.map((n) => n.group))];
  const active = new Set<NodeGroup>(groups);

  const head = h('div', { class: 'page-head' },
    h('h1', {}, 'The ecosystem constellation'),
    h('p', { class: 'lede' },
      'Every registered asset of the Assessment-Models ecosystem, laid out as a navigable space. ',
      'Lines are component imports, shared maturity components and ', h('span', { class: 'mono' }, 'maturity-scale-contract'),
      ' handshakes into the OpenDEA metamodel. Hover to inspect, click to open.'),
    h('div', { class: 'stats' },
      stat(String(manifest.nodes.length), 'registered assets'),
      stat(String(manifest.edges.length), 'relationships'),
      stat(String(manifest.nodes.filter((n) => n.contract).length), 'contract handshakes'),
      stat(String(manifest.nodes.filter((n) => n.group === 'maturity-models').length), 'maturity models'),
    ),
  );

  const filters = h('div', { class: 'filters no-print' });
  for (const g of groups) {
    const chip = groupChip(g, groupLabel(g), true);
    chip.addEventListener('click', () => {
      if (active.has(g)) active.delete(g);
      else active.add(g);
      chip.classList.toggle('active', active.has(g));
      applyFilter();
    });
    filters.append(chip);
  }

  // ----- SVG -----
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Assessment-Models ecosystem constellation');

  const edgeLayer = document.createElementNS(SVG_NS, 'g');
  const nodeLayer = document.createElementNS(SVG_NS, 'g');
  svg.append(edgeLayer, nodeLayer);

  const placed = layout(manifest.nodes);
  const posById = new Map(placed.map((p) => [p.node.id, p]));

  interface EdgeEl { el: SVGElement; source: string; target: string }
  const edgeEls: EdgeEl[] = [];
  for (const e of manifest.edges) {
    const a = posById.get(e.source);
    const b = posById.get(e.target);
    if (!a || !b) continue;
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', String(a.x));
    line.setAttribute('y1', String(a.y));
    line.setAttribute('x2', String(b.x));
    line.setAttribute('y2', String(b.y));
    line.setAttribute('class', `edge edge-${e.kind}`);
    edgeLayer.append(line);
    edgeEls.push({ el: line, source: e.source, target: e.target });
  }

  // cluster labels — above each ring so they never collide with node labels
  {
    const counts = new Map<NodeGroup, number>();
    for (const p of placed) counts.set(p.node.group, (counts.get(p.node.group) ?? 0) + 1);
    for (const g of groups) {
      const c = CLUSTER_CENTERS[g];
      const count = counts.get(g) ?? 1;
      const ring = count === 1 ? 0 : clusterSpread(count) * 0.72;
      const t = document.createElementNS(SVG_NS, 'text');
      t.setAttribute('x', String(c.x));
      t.setAttribute('y', String(c.y - ring - 34));
      t.setAttribute('class', 'cluster-label');
      t.setAttribute('text-anchor', 'middle');
      t.textContent = groupLabel(g);
      nodeLayer.append(t);
    }
  }

  const nodeEls: { el: SVGGElement; node: IndexNode }[] = [];
  for (const p of placed) {
    const color = GROUP_COLORS[p.node.group];
    const g = document.createElementNS(SVG_NS, 'g');
    g.setAttribute('class', 'node');
    g.setAttribute('transform', `translate(${p.x}, ${p.y})`);
    g.dataset.group = p.node.group;
    g.dataset.id = p.node.id;

    const glow = document.createElementNS(SVG_NS, 'circle');
    glow.setAttribute('r', String(p.r + 9));
    glow.setAttribute('fill', color);
    glow.setAttribute('opacity', '0.13');
    g.append(glow);

    const core = document.createElementNS(SVG_NS, 'circle');
    core.setAttribute('class', 'core');
    core.setAttribute('r', String(p.r));
    core.setAttribute('fill', color);
    core.setAttribute('fill-opacity', p.node.group === 'infrastructure' ? '0.55' : '0.8');
    g.append(core);

    // initials inside the node for larger circles
    if (p.r >= 21) {
      const initials = document.createElementNS(SVG_NS, 'text');
      initials.setAttribute('y', '5');
      initials.setAttribute('text-anchor', 'middle');
      initials.setAttribute('fill', 'rgba(10,14,22,0.85)');
      initials.setAttribute('font-size', String(p.r * 0.42));
      initials.setAttribute('font-weight', '650');
      initials.setAttribute('pointer-events', 'none');
      initials.textContent = p.node.name
        .split(/[\s-]+/)
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() ?? '')
        .join('');
      g.append(initials);
    }

    const label = document.createElementNS(SVG_NS, 'text');
    label.setAttribute('y', String(p.r + 16));
    label.textContent = shortName(p.node);
    g.append(label);

    const tooltipHtml = () => `
      <div class="tt-title">${p.node.name}</div>
      <div class="tt-meta">
        <span class="badge" style="--badge-color:${color}">${groupLabel(p.node.group)}</span>
        ${p.node.version ? `<span class="badge" style="--badge-color:#7d8aa5">v${p.node.version}</span>` : ''}
        ${p.node.conformance ? `<span class="badge" style="--badge-color:#38c1d9">${p.node.conformance}</span>` : ''}
      </div>
      ${p.node.contract ? `<div class="mono faint" style="font-size:.75rem">${p.node.contract}</div>` : ''}
      <div class="tt-desc">${p.node.description ?? ''}</div>
      <div class="faint" style="font-size:.75rem;margin-top:.3rem">click for details →</div>`;

    g.addEventListener('mousemove', (ev) => showTooltip(tooltipHtml(), ev.clientX, ev.clientY));
    g.addEventListener('mouseleave', hideTooltip);
    g.addEventListener('click', () => {
      hideTooltip();
      openDrawer(nodeDetail(p.node, color));
    });

    nodeLayer.append(g);
    nodeEls.push({ el: g, node: p.node });
  }

  function applyFilter(): void {
    for (const { el, node } of nodeEls) el.classList.toggle('dimmed', !active.has(node.group));
    for (const e of edgeEls) {
      const sa = (posById.get(e.source)?.node.group ?? '') as NodeGroup;
      const ta = (posById.get(e.target)?.node.group ?? '') as NodeGroup;
      e.el.classList.toggle('dimmed', !active.has(sa) || !active.has(ta));
    }
  }

  const wrap = h('div', { class: 'constellation-wrap' });
  wrap.append(svg);
  const legend = h('div', { class: 'legend no-print' });
  const legendItems: [string, string][] = [
    ['contract handshake', 'var(--c-external)'],
    ['component import', 'var(--c-components)'],
    ['shared component', 'var(--c-maturity)'],
  ];
  for (const [labelText, color] of legendItems) {
    legend.append(h('span', {}, h('span', { class: 'dot', style: `background:${color};opacity:.7` }), labelText));
  }
  legend.append(h('span', { class: 'faint' }, `generated ${new Date(manifest.generated).toISOString().slice(0, 10)}`));
  wrap.append(legend);

  root.append(head, filters, wrap);
  root.append(h('p', { class: 'footer-note' },
    'Assessment Models — independently governed models, consistently engineered, operationally assessable and interoperable by design.',
  ));

  function stat(value: string, label: string): HTMLElement {
    return h('span', { class: 'stat' }, h('b', {}, value), h('span', {}, label));
  }

  function nodeDetail(node: IndexNode, color: string): HTMLElement {
    const detail = h('div', { class: 'node-detail' },
      h('h2', {}, node.name),
      h('div', { class: 'meta-row', style: 'display:flex;gap:.45rem;flex-wrap:wrap;margin:.5rem 0' },
        h('span', { class: 'badge', style: `--badge-color:${color}` }, groupLabel(node.group)),
        node.version ? h('span', { class: 'badge', style: '--badge-color:#7d8aa5' }, `v${node.version}`) : null,
        conformanceBadge(node),
        node.status ? h('span', { class: 'badge', style: '--badge-color:#7d8aa5' }, node.status) : null,
      ),
      node.contract ? h('p', { class: 'mono faint' }, `contract: ${node.contract}`) : null,
      node.components?.length
        ? h('p', {}, h('span', { class: 'dim' }, 'imports: '),
            h('span', { class: 'mono' }, node.components.join(', ')))
        : null,
      h('p', { class: 'dim' }, node.description ?? ''),
    );

    if (['maturity-models', 'assessment-models', 'assessment-tools'].includes(node.group) && node.repo) {
      const open = h('a', { class: 'btn primary', href: `#/model/${node.id}`, style: 'margin-top:.8rem' }, 'Open model →');
      open.addEventListener('click', () => closeDrawer());
      detail.append(open);
    }
    if (node.repo) {
      detail.append(h('p', { style: 'margin-top:.8rem' },
        h('a', { href: repoUrl(node.repo), target: '_blank', rel: 'noopener' }, 'View on GitHub ↗'),
      ));
    }
    return detail;
  }
}
