/** Shared constellation layout + helpers, consumed by both the SVG and the 3D renderer. */
import type { IndexEdge, IndexNode, NodeGroup } from './types';

export const CLUSTER_CENTERS: Record<NodeGroup, { x: number; y: number }> = {
  'maturity-models': { x: 400, y: 310 },
  'assessment-models': { x: 920, y: 250 },
  'assessment-tools': { x: 1060, y: 540 },
  components: { x: 640, y: 650 },
  infrastructure: { x: 190, y: 640 },
  external: { x: 680, y: 400 },
};

export const NODE_RADIUS: Record<NodeGroup, number> = {
  'maturity-models': 30,
  'assessment-models': 23,
  'assessment-tools': 21,
  components: 22,
  infrastructure: 15,
  external: 26,
};

/** Ring spread for a cluster of n members (mirrored by the label placement). */
export function clusterSpread(count: number): number {
  return Math.max(70, 46 + count * 17);
}

export interface Placed {
  node: IndexNode;
  x: number;
  y: number;
  r: number;
}

/** Deterministic cluster layout: groups at fixed centers, members on a ring. */
export function layout(nodes: IndexNode[]): Placed[] {
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

export function shortName(n: IndexNode): string {
  return n.name.length > 26 ? n.name.slice(0, 24) + '…' : n.name;
}

export function tooltipHtml(n: IndexNode, color: string): string {
  return `
    <div class="tt-title">${n.name}</div>
    <div class="tt-meta">
      <span class="badge" style="--badge-color:${color}">${n.group}</span>
      ${n.version ? `<span class="badge" style="--badge-color:#7d8aa5">v${n.version}</span>` : ''}
      ${n.conformance ? `<span class="badge" style="--badge-color:#38c1d9">${n.conformance}</span>` : ''}
    </div>
    ${n.contract ? `<div class="mono faint" style="font-size:.75rem">${n.contract}</div>` : ''}
    <div class="tt-desc">${n.description ?? ''}</div>
    <div class="faint" style="font-size:.75rem;margin-top:.3rem">click for details →</div>`;
}

export interface ResolvedEdge {
  edge: IndexEdge;
  a: Placed;
  b: Placed;
}

/** Resolve manifest edges to layout positions; drops edges with unknown endpoints. */
export function resolveEdges(edges: IndexEdge[], posById: Map<string, Placed>): ResolvedEdge[] {
  const out: ResolvedEdge[] = [];
  for (const edge of edges) {
    const a = posById.get(edge.source);
    const b = posById.get(edge.target);
    if (a && b) out.push({ edge, a, b });
  }
  return out;
}

/** Feature detection for the 3D path. */
export function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export function prefersReducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}
