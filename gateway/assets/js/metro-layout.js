/**
 * Collision-aware Metro Layout Engine for Assessment-Models:
 * - Uniform corridor lanes (one clean Y per line, no artificial station jitter)
 * - Topological column placement along the ecosystem flow
 *   (Governance -> Maturity Models -> Shared Capabilities / Integration -> Reference Blueprints)
 * - Universal layer-based column assignment (no hardcoded station ids)
 * - Spatial occupancy loop guaranteeing station-to-station separation
 * - Scored, non-overlapping label slots for every station
 * - Nudged touchpoint/handshake transfer markers clear of stations & labels
 * - Auto-fit transform computed across stations, labels and markers
 *
 * Exports `chamferPath` as an alias of `chamferPolyline` for compatibility.
 */

/**
 * Base column for each architectural layer, following the ecosystem's
 * topological flow. Unknown layers fall back to the shared-capability/
 * integration band (column 2) so any NEW repository layer still receives a
 * deterministic column without hardcoding station ids.
 */
const LAYER_BASE_COLUMN = {
  governance: 0,
  "maturity-model": 1,
  "assessment-model": 2,
  "shared-capability": 3,
  integration: 3,
  "reference-blueprint": 4,
};

/** Label slot candidates, generated with clearances that keep every slot
 *  band strictly outside the station-node radius (r 22 in tests) while
 *  staying clear of adjacent corridor lanes. */
function makeLabelCandidates() {
  const slots = [];
  for (const kick of [40, 56, 64, 72, 88, 104]) {
    // Side slots: >= 30px horizontal and >= 28px vertical clearance.
    slots.push({ dx: 30, dy: -kick, anchor: "start" });
    slots.push({ dx: 30, dy: kick, anchor: "start" });
    slots.push({ dx: -30, dy: -kick, anchor: "end" });
    slots.push({ dx: -30, dy: kick, anchor: "end" });
    // Center slots: >= 40px vertical clearance from the node center.
    slots.push({ dx: 0, dy: -(kick + 16), anchor: "middle" });
    slots.push({ dx: 0, dy: kick + 16, anchor: "middle" });
  }
  return slots;
}

const LABEL_CANDIDATES = makeLabelCandidates();

export function chamferPolyline(points, chamfer = 16) {
  if (!Array.isArray(points) || points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;

  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const len1 = Math.hypot(dx1, dy1) || 1;

    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;
    const len2 = Math.hypot(dx2, dy2) || 1;

    const cut = Math.min(chamfer, len1 * 0.35, len2 * 0.35);
    const p1x = curr.x - (dx1 / len1) * cut;
    const p1y = curr.y - (dy1 / len1) * cut;
    const p2x = curr.x + (dx2 / len2) * cut;
    const p2y = curr.y + (dy2 / len2) * cut;

    d += ` L ${p1x.toFixed(1)} ${p1y.toFixed(1)} L ${p2x.toFixed(1)} ${p2y.toFixed(1)}`;
  }

  const end = points[points.length - 1];
  d += ` L ${end.x.toFixed(1)} ${end.y.toFixed(1)}`;
  return d;
}

/** Backwards-compatible alias (previous canvas code imported this name). */
export const chamferPath = chamferPolyline;

function rectsOverlap(a, b, pad = 8) {
  return !(a.x2 + pad < b.x1 || a.x1 - pad > b.x2 || a.y2 + pad < b.y1 || a.y1 - pad > b.y2);
}

function circleRectOverlap(cx, cy, r, rect) {
  const closestX = Math.max(rect.x1, Math.min(cx, rect.x2));
  const closestY = Math.max(rect.y1, Math.min(cy, rect.y2));
  const distSq = (cx - closestX) ** 2 + (cy - closestY) ** 2;
  return distSq < r * r;
}

function makeLabelRect(sx, sy, slot, labelText, subText) {
  const longestChars = Math.max((labelText || "").length, (subText || "").length);
  const w = Math.max(76, Math.min(260, longestChars * 6.8 + 12));
  const h = 28;

  let left;
  if (slot.anchor === "end") {
    left = sx + slot.dx - w;
  } else if (slot.anchor === "middle") {
    left = sx + slot.dx - w / 2;
  } else {
    left = sx + slot.dx;
  }

  const top = sy + slot.dy - 12;
  return { x1: left, y1: top, x2: left + w, y2: top + h };
}

/** Score each candidate slot against station nodes and already-placed labels;
 *  deterministically pick the lowest-penalty (zero when possible) slot. */
function pickNonOverlappingLabelSlot(station, allStations, placedLabelRects, laneIdx, totalLanes) {
  const subText = `${station.version} • ${station.touchpoints.length}TP / ${station.handshakes.length}HS`;
  // Prefer labels above the station on upper corridors, below on lower ones.
  const preferAbove = laneIdx < totalLanes / 2;

  let bestSlot = LABEL_CANDIDATES[0];
  let bestRect = makeLabelRect(station.x, station.y, bestSlot, station.name, subText);
  let bestScore = Infinity;

  for (const slot of LABEL_CANDIDATES) {
    const rect = makeLabelRect(station.x, station.y, slot, station.name, subText);
    let penalty = 0;

    // Overlap with any station node (radius buffered beyond the 22px test radius)
    for (const other of allStations) {
      if (circleRectOverlap(other.x, other.y, 24.5, rect)) {
        penalty += 1000;
      }
    }

    // Overlap with previously placed label boxes
    for (const prevRect of placedLabelRects) {
      if (rectsOverlap(rect, prevRect, 8)) {
        penalty += 400;
      }
    }

    // Gentle deterministic tie-breakers
    if (slot.anchor === "end") penalty += 4;
    if (slot.anchor === "middle") penalty += 8;
    penalty += (slot.dy < 0) === preferAbove ? 0 : 2;
    penalty += Math.abs(slot.dy) * 0.02; // prefer tighter slots

    if (penalty < bestScore) {
      bestScore = penalty;
      bestSlot = slot;
      bestRect = rect;
      if (penalty === 0) break;
    }
  }

  placedLabelRects.push(bestRect);
  return { dx: bestSlot.dx, dy: bestSlot.dy, anchor: bestSlot.anchor, rect: bestRect };
}

/** Nudge a link marker (touchpoint circle / handshake diamond) away from
 *  station circles, previously placed markers and label boxes. */
function resolveMarkerPosition(rawX, rawY, stations, placedMarkers, placedLabelRects) {
  let mx = rawX;
  let my = rawY;
  const minStationClearance = 30;
  const minMarkerClearance = 24;

  for (let attempt = 0; attempt < 16; attempt++) {
    let collided = false;

    for (const st of stations) {
      if (Math.hypot(mx - st.x, my - st.y) < minStationClearance) {
        collided = true;
        break;
      }
    }

    if (!collided) {
      for (const pm of placedMarkers) {
        if (Math.hypot(mx - pm.x, my - pm.y) < minMarkerClearance) {
          collided = true;
          break;
        }
      }
    }

    if (!collided) {
      for (const lbl of placedLabelRects) {
        if (circleRectOverlap(mx, my, 12, lbl)) {
          collided = true;
          break;
        }
      }
    }

    if (!collided) break;

    const dir = attempt % 2 === 0 ? 1 : -1;
    const step = (Math.floor(attempt / 2) + 1) * 18;
    mx = rawX + dir * step;
    my = rawY + (attempt % 4 < 2 ? -step * 0.5 : step * 0.5);
  }

  placedMarkers.push({ x: mx, y: my });
  return { mx, my };
}

export function computeMetroLayout(graph, viewportWidth = 1280, viewportHeight = 760) {
  const lanePitch = 190; // adjacent-lane same-column distance stays >= 150px test floor
  const colPitch = 285;
  const minStationDist = 185;
  const leftOrigin = 150;
  const topOrigin = 130;

  const lineYMap = new Map();
  graph.lines.forEach((line, idx) => {
    lineYMap.set(line.id, topOrigin + idx * lanePitch);
  });

  // Place every station on its corridor lane at a clean topological column.
  // Iterate lines in corridor order, then that line's stations, so the column
  // index per layer is deterministic and registry-order stable.
  const positionedStations = [];
  const layerSlotCount = new Map();

  const laneIndexOf = new Map(graph.lines.map((l, idx) => [l.id, idx]));
  const layerOfStation = new Map();
  for (const line of graph.lines) {
    for (const id of line.stationIds) layerOfStation.set(id, line.id);
  }

  for (const line of graph.lines) {
    for (const stationId of line.stationIds) {
      const station = graph.stationMap.get(stationId);
      if (!station) continue;

      const laneIdx = laneIndexOf.get(line.id) ?? 0;
      const y = lineYMap.get(line.id) ?? topOrigin;
      const countInLayer = layerSlotCount.get(line.id) ?? 0;
      layerSlotCount.set(line.id, countInLayer + 1);

      const baseCol = LAYER_BASE_COLUMN[line.id] ?? 2;
      let colIdx = baseCol + countInLayer;
      let x = leftOrigin + colIdx * colPitch;

      // Occupancy loop: guarantee station-to-station clearance globally.
      while (positionedStations.some((p) => Math.hypot(p.x - x, p.y - y) < minStationDist)) {
        colIdx += 1;
        x = leftOrigin + colIdx * colPitch;
      }

      positionedStations.push({
        ...station,
        x,
        y,
        laneIdx,
        colIdx,
        labelPlacement: null,
      });
    }
  }

  // Fallback: include any station whose layer was not among graph.lines
  // (defensive; buildMetroGraph always maps primary layers onto lines).
  for (const station of graph.stations) {
    if (positionedStations.some((p) => p.id === station.id)) continue;
    const y = lineYMap.get(station.layer) ?? topOrigin;
    let colIdx = (LAYER_BASE_COLUMN[station.layer] ?? 2) + (layerSlotCount.get(station.layer) ?? 0);
    let x = leftOrigin + colIdx * colPitch;
    while (positionedStations.some((p) => Math.hypot(p.x - x, p.y - y) < minStationDist)) {
      colIdx += 1;
      x = leftOrigin + colIdx * colPitch;
    }
    layerSlotCount.set(station.layer, (layerSlotCount.get(station.layer) ?? 0) + 1);
    positionedStations.push({ ...station, x, y, laneIdx: 0, colIdx, labelPlacement: null });
  }

  const totalLanes = Math.max(1, graph.lines.length);

  // Assign collision-checked label slots in deterministic placement order.
  const placedLabelRects = [];
  for (const st of positionedStations) {
    st.labelPlacement = pickNonOverlappingLabelSlot(
      st,
      positionedStations,
      placedLabelRects,
      st.laneIdx,
      totalLanes
    );
  }

  const posById = new Map(positionedStations.map((s) => [s.id, s]));

  // Continuous corridor trunks connecting each line's stations in X order.
  const corridorPaths = graph.lines
    .map((line) => {
      const pts = positionedStations
        .filter((s) => s.layer === line.id)
        .sort((a, b) => a.x - b.x)
        .map((s) => ({ x: s.x, y: s.y }));

      return {
        lineId: line.id,
        label: line.label,
        color: line.color,
        d: chamferPolyline(pts, 18),
      };
    })
    .filter((corr) => corr.d !== "");

  // Route contract links along dedicated offset channels with nudged markers.
  const placedMarkers = [];

  const routeContractEdge = (edge, index, kind) => {
    const a = posById.get(edge.from_station_id);
    const b = posById.get(edge.to_station_id);
    if (!a || !b) return null;

    const sign = index % 2 === 0 ? 1 : -1;
    const baseOffset = sign * (54 + (index % 3) * 16);
    const rawMidX = (a.x + b.x) / 2 + baseOffset;
    const rawMidY = a.y === b.y ? a.y + baseOffset * 0.65 : (a.y + b.y) / 2;

    const { mx, my } = resolveMarkerPosition(
      rawMidX,
      rawMidY,
      positionedStations,
      placedMarkers,
      placedLabelRects
    );

    const pts =
      a.y === b.y
        ? [
            { x: a.x, y: a.y },
            { x: mx, y: my },
            { x: b.x, y: b.y },
          ]
        : [
            { x: a.x, y: a.y },
            { x: mx, y: a.y },
            { x: mx, y: my },
            { x: mx, y: b.y },
            { x: b.x, y: b.y },
          ];

    return {
      ...edge,
      kind,
      x1: a.x,
      y1: a.y,
      x2: b.x,
      y2: b.y,
      mx,
      my,
      d: chamferPolyline(pts, 14),
    };
  };

  const touchpointEdges = graph.touchpoints
    .map((tp, idx) => routeContractEdge(tp, idx, "touchpoint"))
    .filter(Boolean);

  const handshakeEdges = graph.handshakes
    .map((hs, idx) => routeContractEdge(hs, idx + 1, "handshake"))
    .filter(Boolean);

  // Bounding box encompassing stations, label boxes and link markers.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const s of positionedStations) {
    const rect = s.labelPlacement.rect;
    minX = Math.min(minX, s.x - 28, rect.x1);
    maxX = Math.max(maxX, s.x + 28, rect.x2);
    minY = Math.min(minY, s.y - 28, rect.y1);
    maxY = Math.max(maxY, s.y + 28, rect.y2);
  }

  for (const m of placedMarkers) {
    minX = Math.min(minX, m.x - 16);
    maxX = Math.max(maxX, m.x + 16);
    minY = Math.min(minY, m.y - 16);
    maxY = Math.max(maxY, m.y + 16);
  }

  if (!Number.isFinite(minX)) {
    minX = 0;
    minY = 0;
    maxX = 960;
    maxY = 600;
  }

  const width = Math.max(360, maxX - minX);
  const height = Math.max(260, maxY - minY);
  const margin = 72;

  const scaleX = Math.max(280, viewportWidth - margin * 2) / width;
  const scaleY = Math.max(240, viewportHeight - margin * 2) / height;
  const k = Math.max(0.45, Math.min(1.2, Math.min(scaleX, scaleY)));

  const x = (viewportWidth - width * k) / 2 - minX * k;
  const y = (viewportHeight - height * k) / 2 - minY * k;

  return {
    corridorPaths,
    stations: positionedStations,
    touchpointEdges,
    handshakeEdges,
    fitTransform: { x, y, k },
  };
}
