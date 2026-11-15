/**
 * Three.js constellation renderer — 2.5D progressive enhancement of the SVG
 * landing (blueprint §4: WebGL when available, SVG core flows otherwise).
 * Same manifest data and layout; hover/click parity with the SVG path.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { IndexManifest, IndexNode, NodeGroup } from './types';
import {
  layout,
  resolveEdges,
  shortName,
} from './constellation-data';

const GROUP_COLORS: Record<NodeGroup, string> = {
  'maturity-models': '#8b7cf8',
  'assessment-models': '#38c1d9',
  'assessment-tools': '#e8b04b',
  components: '#55c47f',
  infrastructure: '#7d8aa5',
  external: '#c76fd1',
};

const WORLD_SCALE = 1 / 26; // 2D viewBox (1280×860) → world units
const LABEL_ALTITUDE = 2.2;

export interface Constellation3DOptions {
  practitioner: boolean;
  onHover: (node: IndexNode | null, x: number, y: number) => void;
  onOpen: (node: IndexNode) => void;
}

export interface Constellation3DHandle {
  setVisible: (groups: Set<NodeGroup>) => void;
  dispose: () => void;
}

function glowTexture(color: string): THREE.Texture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 2, size / 2, size / 2, size / 2);
  grad.addColorStop(0, color);
  grad.addColorStop(0.35, color + '66');
  grad.addColorStop(1, color + '00');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function labelSprite(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  ctx.font = '600 30px -apple-system, Segoe UI, Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.fillText(text, 256, 42);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(mat);
  sprite.scale.set(6.4, 0.8, 1);
  return sprite;
}

export function create3DConstellation(
  container: HTMLElement,
  manifest: IndexManifest,
  opts: Constellation3DOptions,
): Constellation3DHandle {
  const width = container.clientWidth || 1200;
  const height = Math.round((width * 860) / 1280);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = 'auto';
  renderer.domElement.style.cursor = 'grab';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 400);
  camera.position.set(0, 16, 30);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.minDistance = 10;
  controls.maxDistance = 80;
  controls.autoRotate = true; // until first interaction
  controls.autoRotateSpeed = 0.6;
  renderer.domElement.addEventListener('pointerdown', () => (controls.autoRotate = false), { once: true });

  // ---- nodes ----
  const placed = layout(manifest.nodes);
  const disposables: { dispose(): void }[] = [];
  const nodeMeshes: THREE.Mesh[] = [];
  const nodeGroup = new THREE.Group();
  scene.add(nodeGroup);

  for (const p of placed) {
    const color = GROUP_COLORS[p.node.group];
    const z = (((p.x * 13) % 7) + ((p.y * 7) % 5)) - 4; // deterministic mild depth jitter
    const wx = (p.x - 640) * WORLD_SCALE;
    const wy = (430 - p.y) * WORLD_SCALE;

    const glowMat = new THREE.SpriteMaterial({
      map: glowTexture(color),
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    });
    const glow = new THREE.Sprite(glowMat);
    glow.position.set(wx, wy, z);
    const glowSize = p.r * WORLD_SCALE * 4.6;
    glow.scale.set(glowSize, glowSize, 1);
    nodeGroup.add(glow);

    const discMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(color),
      transparent: true,
      opacity: p.node.group === 'infrastructure' ? 0.6 : 0.85,
      side: THREE.DoubleSide,
    });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(p.r * WORLD_SCALE, 40), discMat);
    disc.position.set(wx, wy, z);
    disc.userData = { node: p.node };
    nodeGroup.add(disc);
    nodeMeshes.push(disc);
    disposables.push(glowMat, discMat, disc.geometry);

    const label = labelSprite(shortName(p.node), '#c9d3ea');
    label.position.set(wx, wy + p.r * WORLD_SCALE * 2 + LABEL_ALTITUDE * 0.4, z);
    nodeGroup.add(label);
  }

  // ---- edges ----
  const posById = new Map(placed.map((p) => [p.node.id, p]));
  const resolved = resolveEdges(manifest.edges, posById);
  const edgeStyle = {
    contract: { color: 0x3a4a6b, opacity: opts.practitioner ? 0.18 : 0.5 },
    imports: { color: 0x55c47f, opacity: opts.practitioner ? 0.85 : 0.55 },
    'shared-components': { color: 0x8b7cf8, opacity: opts.practitioner ? 0.95 : 0.45 },
  } as const;
  const edgeObjects: { obj: THREE.LineSegments; kinds: Set<string> }[] = [];
  for (const [kind, style] of Object.entries(edgeStyle)) {
    const pts: THREE.Vector3[] = [];
    for (const { edge, a, b } of resolved) {
      if (edge.kind !== kind) continue;
      pts.push(
        new THREE.Vector3((a.x - 640) * WORLD_SCALE, (430 - a.y) * WORLD_SCALE, (((a.x * 13) % 7) + ((a.y * 7) % 5)) - 4),
        new THREE.Vector3((b.x - 640) * WORLD_SCALE, (430 - b.y) * WORLD_SCALE, (((b.x * 13) % 7) + ((b.y * 7) % 5)) - 4),
      );
    }
    if (!pts.length) continue;
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({ color: style.color, transparent: true, opacity: style.opacity });
    const lines = new THREE.LineSegments(geo, mat);
    scene.add(lines);
    edgeObjects.push({ obj: lines, kinds: new Set([kind]) });
    disposables.push(geo, mat);
  }

  // ---- interaction ----
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let hovered: IndexNode | null = null;
  let downAt: { x: number; y: number } | null = null;

  function pick(ev: PointerEvent): IndexNode | null {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(nodeMeshes, false)[0];
    return (hit?.object.userData?.node as IndexNode | undefined) ?? null;
  }

  function onPointerMove(ev: PointerEvent): void {
    const node = pick(ev);
    if (node !== hovered) {
      hovered = node;
      renderer.domElement.style.cursor = node ? 'pointer' : 'grab';
    }
    opts.onHover(node, ev.clientX, ev.clientY);
  }

  function onPointerDown(ev: PointerEvent): void {
    downAt = { x: ev.clientX, y: ev.clientY };
  }

  function onPointerUp(ev: PointerEvent): void {
    if (!downAt) return;
    const moved = Math.hypot(ev.clientX - downAt.x, ev.clientY - downAt.y);
    downAt = null;
    if (moved > 6) return; // it was a drag, not a click
    const node = pick(ev);
    if (node) opts.onOpen(node);
  }

  renderer.domElement.addEventListener('pointermove', onPointerMove);
  renderer.domElement.addEventListener('pointerdown', onPointerDown);
  renderer.domElement.addEventListener('pointerup', onPointerUp);
  renderer.domElement.addEventListener('pointerleave', () => opts.onHover(null, 0, 0));

  // ---- render loop ----
  let raf = 0;
  function animate(): void {
    raf = requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  const ro = new ResizeObserver(() => {
    const w = container.clientWidth || width;
    const h = Math.round((w * 860) / 1280);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
  ro.observe(container);

  return {
    setVisible(groups: Set<NodeGroup>): void {
      for (const mesh of nodeMeshes) {
        const visible = groups.has((mesh.userData.node as IndexNode).group);
        const mat = mesh.material as THREE.MeshBasicMaterial;
        mat.opacity = visible ? (mesh.userData.node as IndexNode).group === 'infrastructure' ? 0.6 : 0.85 : 0.06;
      }
      for (const { obj, kinds } of edgeObjects) {
        const kind = [...kinds][0] ?? '';
        const style = edgeStyle[kind as keyof typeof edgeStyle];
        const anyVisible = placed.some((p) => groups.has(p.node.group));
        (obj.material as THREE.LineBasicMaterial).opacity = anyVisible ? style.opacity : 0.04;
      }
    },
    dispose(): void {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      disposables.forEach((d) => d.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
