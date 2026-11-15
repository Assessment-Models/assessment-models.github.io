/**
 * Landing view — the constellation. Orchestrates two renderers over the same
 * manifest data: a Three.js 2.5D scene (progressive enhancement, lazy-loaded)
 * and the original SVG layout as fallback (no WebGL / reduced motion / print).
 */
import type { IndexManifest, IndexNode, NodeGroup } from '../types';
import { fetchManifest } from '../data/loader';
import {
  type Placed,
  CLUSTER_CENTERS,
  clusterSpread,
  layout,
  prefersReducedMotion,
  resolveEdges,
  shortName,
  supportsWebGL,
  tooltipHtml,
} from '../constellation-data';
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
import { getPersonaDef } from '../ui/persona';

const SVG_NS = 'http://www.w3.org/2000/svg';
const W = 1280;
const H = 860;

interface Renderer {
  setVisible: (groups: Set<NodeGroup>) => void;
  dispose?: () => void;
}

export async function renderConstellation(root: HTMLElement): Promise<void> {
  const manifest: IndexManifest = await fetchManifest();
  const groups = [...new Set(manifest.nodes.map((n) => n.group))];
  const active = new Set<NodeGroup>(groups);
  const persona = getPersonaDef();

  const head = h('div', { class: 'page-head' },
    h('h1', {}, 'The ecosystem constellation'),
    h('p', { class: 'lede' },
      'Every registered asset of the Assessment-Models ecosystem, laid out as a navigable space. ',
      'Lines are component imports, shared maturity components and ', h('span', { class: 'mono' }, 'maturity-scale-contract'),
      ' handshakes into the OpenDEA metamodel. Hover to inspect, click to open.',
      supportsWebGL() && !prefersReducedMotion() ? ' Drag to orbit, scroll to zoom.' : ''),
    h('div', { class: 'stats' },
      stat(String(manifest.nodes.length), 'registered assets'),
      stat(String(manifest.edges.length), 'relationships'),
      stat(String(manifest.nodes.filter((n) => n.contract).length), 'contract handshakes'),
      stat(String(manifest.nodes.filter((n) => n.group === 'maturity-models').length), 'maturity models'),
    ),
  );

  // persona entry point (blueprint §2 — same core experience, tailored entry)
  const personaPanel = h('div', { class: 'panel persona-panel no-print', style: 'margin-bottom:1rem;display:flex;gap:.8rem;align-items:center;flex-wrap:wrap' },
    h('span', { class: 'badge', style: '--badge-color:#c76fd1' }, persona.label),
    h('span', { class: 'dim', style: 'font-size:.86rem;flex:1;min-width:24ch' }, persona.step.text),
    h('a', { class: 'btn primary small', href: persona.step.href }, persona.step.cta),
  );

  const filters = h('div', { class: 'filters no-print' });
  for (const g of groups) {
    const chip = groupChip(g, groupLabel(g), true);
    chip.addEventListener('click', () => {
      if (active.has(g)) active.delete(g);
      else active.add(g);
      chip.classList.toggle('active', active.has(g));
      renderer?.setVisible(active);
      applySvgFilter();
    });
    filters.append(chip);
  }

  const wrap = h('div', {
    class: `constellation-wrap${persona.id === 'practitioner' ? ' persona-practitioner' : ''}`,
  });
  const stage = h('div', { class: 'constellation-stage' });
  wrap.append(stage);

  const legend = h('div', { class: 'legend no-print' });
  for (const [labelText, color] of [
    ['contract handshake', 'var(--c-external)'],
    ['component import', 'var(--c-components)'],
    ['shared component', 'var(--c-maturity)'],
  ] as [string, string][]) {
    legend.append(h('span', {}, h('span', { class: 'dot', style: `background:${color};opacity:.7` }), labelText));
  }
  legend.append(h('span', { class: 'faint' }, `generated ${new Date(manifest.generated).toISOString().slice(0, 10)}`));
  wrap.append(legend);

  let renderer: Renderer | null = null;
  let applySvgFilter: () => void = () => {};

  const use3D = supportsWebGL() && !prefersReducedMotion();
  if (use3D) {
    const { create3DConstellation } = await import('../constellation3d');
    renderer = create3DConstellation(stage, manifest, {
      practitioner: persona.id === 'practitioner',
      onHover: (node, x, y) => {
        if (node) showTooltip(tooltipHtml(node, GROUP_COLORS[node.group]), x, y);
        else hideTooltip();
      },
      onOpen: (node) => {
        hideTooltip();
        openDrawer(nodeDetail(node, GROUP_COLORS[node.group]));
      },
    });
    renderer.setVisible(active);
  } else {
    const svg = renderSvg(stage, manifest);
    renderer = { setVisible: (s) => svg.setVisible(s) };
    applySvgFilter = () => svg.setVisible(active);
    svg.setVisible(active);
  }

  root.append(head, personaPanel, filters, wrap);
  root.append(h('p', { class: 'footer-note' },
    'Assessment Models — independently governed models, consistently engineered, operationally assessable and interoperable by design.',
  ));

  // ---------- SVG renderer (fallback path) ----------

  function renderSvg(stage: HTMLElement, m: IndexManifest): Renderer {
    const svg = document.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Assessment-Models ecosystem constellation');
    stage.append(svg);

    const edgeLayer = document.createElementNS(SVG_NS, 'g');
    const nodeLayer = document.createElementNS(SVG_NS, 'g');
    svg.append(edgeLayer, nodeLayer);

    const placed = layout(m.nodes);
    const posById = new Map(placed.map((p) => [p.node.id, p]));

    interface EdgeEl { el: SVGElement; source: string; target: string }
    const edgeEls: EdgeEl[] = [];
    for (const { edge, a, b } of resolveEdges(m.edges, posById)) {
      const line = document.createElementNS(SVG_NS, 'line');
      line.setAttribute('x1', String(a.x));
      line.setAttribute('y1', String(a.y));
      line.setAttribute('x2', String(b.x));
      line.setAttribute('y2', String(b.y));
      line.setAttribute('class', `edge edge-${edge.kind}`);
      edgeLayer.append(line);
      edgeEls.push({ el: line, source: edge.source, target: edge.target });
    }

    // cluster labels — above each ring so they never collide with node labels
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

    const nodeEls: { el: SVGGElement; node: IndexNode }[] = [];
    for (const p of placed) {
      const color = GROUP_COLORS[p.node.group];
      const g = document.createElementNS(SVG_NS, 'g');
      g.setAttribute('class', 'node');
      g.setAttribute('transform', `translate(${p.x}, ${p.y})`);
      g.dataset.group = p.node.group;

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

      g.addEventListener('mousemove', (ev) => showTooltip(tooltipHtml(p.node, color), ev.clientX, ev.clientY));
      g.addEventListener('mouseleave', hideTooltip);
      g.addEventListener('click', () => {
        hideTooltip();
        openDrawer(nodeDetail(p.node, color));
      });

      nodeLayer.append(g);
      nodeEls.push({ el: g, node: p.node });
    }

    return {
      setVisible(groupsVisible: Set<NodeGroup>): void {
        for (const { el, node } of nodeEls) el.classList.toggle('dimmed', !groupsVisible.has(node.group));
        for (const e of edgeEls) {
          const sa = (posById.get(e.source)?.node.group ?? '') as NodeGroup;
          const ta = (posById.get(e.target)?.node.group ?? '') as NodeGroup;
          e.el.classList.toggle('dimmed', !groupsVisible.has(sa) || !groupsVisible.has(ta));
        }
      },
    };
  }

  // ---------- shared ----------

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
      node.phase2?.identity
        ? h('p', {}, h('span', { class: 'dim' }, 'identity: '),
            h('span', { class: 'mono' }, node.phase2.identity))
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

export type { Placed };
