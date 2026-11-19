/**
 * Computes a dynamic Metro Map layout fitting the viewport:
 * - Parallel corridor Y lanes per line
 * - Evenly distributed X station positions per corridor
 * - Chamfered (45-degree cornered) SVG path segments for tracks, touchpoints & handshakes
 * - Auto-fit transform for any viewport width/height
 */
export function chamferPath(points, chamfer = 18) {
  if (!Array.isArray(points) || points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  if (points.length === 2) {
    return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;
  }

  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    const v1x = curr.x - prev.x;
    const v1y = curr.y - prev.y;
    const len1 = Math.hypot(v1x, v1y) || 1;

    const v2x = next.x - curr.x;
    const v2y = next.y - curr.y;
    const len2 = Math.hypot(v2x, v2y) || 1;

    const cut = Math.min(chamfer, len1 * 0.35, len2 * 0.35);
    const pStartX = curr.x - (v1x / len1) * cut;
    const pStartY = curr.y - (v1y / len1) * cut;
    const pEndX = curr.x + (v2x / len2) * cut;
    const pEndY = curr.y + (v2y / len2) * cut;

    d += ` L ${pStartX.toFixed(1)} ${pStartY.toFixed(1)} L ${pEndX.toFixed(1)} ${pEndY.toFixed(1)}`;
  }

  const last = points[points.length - 1];
  d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
  return d;
}

export function computeMetroLayout(graph, viewportWidth = 1200, viewportHeight = 720) {
  const laneSpacing = 128;
  const stationSpacing = 250;
  const leftMargin = 150;
  const topMargin = 110;

  const lineY = new Map();
  graph.lines.forEach((line, idx) => {
    lineY.set(line.id, topMargin + idx * laneSpacing);
  });

  // Track how many stations are placed per line to space along X
  const lineCursor = new Map(graph.lines.map((l) => [l.id, 0]));
  const positionedStations = graph.stations.map((station, globalIdx) => {
    const y = lineY.get(station.layer) ?? topMargin;
    const slot = lineCursor.get(station.layer) ?? 0;
    lineCursor.set(station.layer, slot + 1);

    const staggerOffset = (globalIdx % 2) * 32;
    const x = leftMargin + slot * stationSpacing + staggerOffset;

    return { ...station, x, y };
  });

  const posMap = new Map(positionedStations.map((s) => [s.id, s]));

  // Build corridor trunk paths connecting stations in order along each line
  const corridorPaths = graph.lines.map((line) => {
    const pts = line.stationIds
      .map((id) => posMap.get(id))
      .filter(Boolean)
      .map((s) => ({ x: s.x, y: s.y }));
    return {
      lineId: line.id,
      label: line.label,
      color: line.color,
      d: chamferPath(pts, 20),
    };
  });

  // Build chamfered spur paths for Touchpoints and Handshakes
  const buildLinkGeometry = (link, kindIndex) => {
    const a = posMap.get(link.from_station_id);
    const b = posMap.get(link.to_station_id);
    if (!a || !b) return null;

    const laneBias = ((kindIndex % 3) - 1) * 16;
    const midX = (a.x + b.x) / 2 + laneBias;
    const midY = (a.y + b.y) / 2;

    const pts =
      a.y === b.y
        ? [
            { x: a.x, y: a.y },
            { x: midX, y: a.y + laneBias },
            { x: b.x, y: b.y },
          ]
        : [
            { x: a.x, y: a.y },
            { x: midX, y: a.y },
            { x: midX, y: b.y },
            { x: b.x, y: b.y },
          ];

    return {
      ...link,
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      mx: midX,
      my: midY,
      d: chamferPath(pts, 16),
    };
  };

  const touchpointEdges = graph.touchpoints
    .map((tp, idx) => buildLinkGeometry(tp, idx))
    .filter(Boolean);

  const handshakeEdges = graph.handshakes
    .map((hs, idx) => buildLinkGeometry(hs, idx + 1))
    .filter(Boolean);

  // Compute bounding box to auto-fit viewport
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const s of positionedStations) {
    minX = Math.min(minX, s.x - 90);
    maxX = Math.max(maxX, s.x + 150);
    minY = Math.min(minY, s.y - 60);
    maxY = Math.max(maxY, s.y + 60);
  }

  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 800;
    maxY = 500;
  }

  const contentW = Math.max(320, maxX - minX);
  const contentH = Math.max(240, maxY - minY);
  const pad = 64;

  const availW = Math.max(280, viewportWidth - pad * 2);
  const availH = Math.max(240, viewportHeight - pad * 2);
  const scale = Math.max(0.45, Math.min(1.25, Math.min(availW / contentW, availH / contentH)));

  const translateX = (viewportWidth - contentW * scale) / 2 - minX * scale;
  const translateY = (viewportHeight - contentH * scale) / 2 - minY * scale;

  return {
    corridorPaths,
    stations: positionedStations,
    touchpointEdges,
    handshakeEdges,
    fitTransform: { x: translateX, y: translateY, k: scale },
  };
}
