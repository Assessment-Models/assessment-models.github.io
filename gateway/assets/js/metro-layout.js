/**
 * Collision-aware Metro Layout Engine for Assessment-Models (grid layout):
 *
 * - ROWS are corridor lanes in dependency order:
 *     governance -> maturity models -> integration -> assessment instruments
 *     -> shared capabilities. The reference blueprint is a spur on the
 *     integration lane (it branches off the model that crosswalks to it).
 * - COLUMNS are domains. Each domain model owns a column; its assessment
 *   instrument is aligned directly beneath it through its "scores-against"
 *   handshake, so a domain reads top-to-bottom as one stack of contracts.
 * - Hub stations (standard, metamodel, catalogs, components, registry, CI)
 *   sit at the centroid column of the stations they connect to.
 * - Placement is data-driven (layers + edges), never keyed on station ids, so
 *   new repositories land deterministically without code changes.
 * - Spatial occupancy per lane guarantees station-to-station separation.
 * - Scored, non-overlapping label slots for every station; lane titles and
 *   column headers are reserved first so labels avoid them.
 * - Nudged touchpoint/handshake transfer markers clear of stations & labels
 * - Auto-fit transform computed across stations, labels, headers and markers
 *
 * Output adds `lanes` and `columns` (grid furniture for the canvas to draw)
 * to the original fields. `chamferPath` remains an alias of `chamferPolyline`.
 */

/** Lane (row) order following the ecosystem's dependency flow. Unknown lines
 *  are appended after these in their registry order. */
const LANE_ORDER = [
  "governance",
  "maturity-model",
  "integration",
  "assessment-model",
  "shared-capability",
  "reference-blueprint",
];

/** Layers drawn as a spur on another layer's lane (when that lane exists). */
const SPUR_ON = { "reference-blueprint": "integration" };

const MODEL_LINE = "maturity-model";
const INSTRUMENT_LINE = "assessment-model";

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
  const lanePitch = 180; // adjacent-lane same-column distance stays >= 150px test floor
  const colPitch = 220;
  const leftOrigin = 340; // room on the left for lane titles
  const topOrigin = 190; // room above for column headers
  const laneTitleWidth = 170;

  // ---- 1. Lanes (rows) ----------------------------------------------------
  const lineIds = new Set(graph.lines.map((l) => l.id));
  const orderIdx = (id) => {
    const i = LANE_ORDER.indexOf(id);
    return i < 0 ? LANE_ORDER.length : i;
  };
  const sortedLines = [...graph.lines].sort(
    (a, b) => orderIdx(a.id) - orderIdx(b.id) || a.order - b.order
  );
  const laneKeyOf = (lineId) => {
    const host = SPUR_ON[lineId];
    return host && lineIds.has(host) ? host : lineId;
  };
  const laneKeys = [];
  for (const line of sortedLines) {
    const key = laneKeyOf(line.id);
    if (!laneKeys.includes(key)) laneKeys.push(key);
  }
  const laneIndex = new Map(laneKeys.map((k, i) => [k, i]));
  const laneY = (key) => topOrigin + (laneIndex.get(key) ?? 0) * lanePitch;

  // ---- 2. Adjacency from contracts ---------------------------------------
  const neighbors = new Map();
  const link = (a, b, kind) => {
    if (!neighbors.has(a)) neighbors.set(a, []);
    neighbors.get(a).push({ id: b, kind });
  };
  for (const [edges, kind] of [
    [graph.touchpoints, "touchpoint"],
    [graph.handshakes, "handshake"],
  ]) {
    for (const e of edges) {
      link(e.from_station_id, e.to_station_id, kind);
      link(e.to_station_id, e.from_station_id, kind);
    }
  }
  const layerOf = (id) => graph.stationMap.get(id)?.layer;
  const regIdx = new Map(graph.stations.map((s, i) => [s.id, i]));
  const degree = (s) => s.touchpoints.length + s.handshakes.length;

  // Instrument -> domain model, through a handshake into the model lane
  // (the registry's "scores-against" contract). Touchpoints are ignored here:
  // they also point at catalog stations that live on the model lane.
  const partnerOf = new Map();
  for (const st of graph.stations) {
    if (st.layer !== INSTRUMENT_LINE) continue;
    const hit = (neighbors.get(st.id) || []).find(
      (n) => n.kind === "handshake" && layerOf(n.id) === MODEL_LINE
    );
    if (hit) partnerOf.set(st.id, hit.id);
  }
  const partneredModels = new Set(partnerOf.values());

  // Models that a spur layer (blueprint) branches from sit last in their
  // group so the spur can extend right without crossing other stations.
  const spurAnchors = new Set();
  for (const st of graph.stations) {
    if (!SPUR_ON[st.layer]) continue;
    for (const n of neighbors.get(st.id) || []) {
      if (layerOf(n.id) === MODEL_LINE) spurAnchors.add(n.id);
    }
  }

  // ---- 3. Columns: one per domain model ----------------------------------
  // Group 0: models with an instrument (full stacks, left)
  // Group 1: models with contracts but no instrument yet
  // Group 2: scaffolding/catalog stations on the model lane
  const group = (s) => (partneredModels.has(s.id) ? 0 : s.handshakes.length > 0 ? 1 : 2);
  const models = graph.stations
    .filter((s) => s.layer === MODEL_LINE)
    .sort(
      (a, b) =>
        group(a) - group(b) ||
        (spurAnchors.has(a.id) ? 1 : 0) - (spurAnchors.has(b.id) ? 1 : 0) ||
        degree(b) - degree(a) ||
        regIdx.get(a.id) - regIdx.get(b.id)
    );

  // Keep a spur anchor's model-to-model handshake peers directly beside it
  // (e.g. a composite model and its operationalized line stay adjacent).
  for (const anchorId of spurAnchors) {
    const anchor = graph.stationMap.get(anchorId);
    if (!anchor || !models.some((m) => m.id === anchorId)) continue;
    const peers = (neighbors.get(anchorId) || [])
      .filter(
        (n) =>
          n.kind === "handshake" &&
          layerOf(n.id) === MODEL_LINE &&
          group(graph.stationMap.get(n.id)) === group(anchor)
      )
      .map((n) => n.id);
    for (const peerId of peers) {
      const from = models.findIndex((m) => m.id === peerId);
      if (from < 0) continue;
      const [moved] = models.splice(from, 1);
      models.splice(
        models.findIndex((m) => m.id === anchorId),
        0,
        moved
      );
    }
  }

  const positionedStations = [];
  const posById = new Map();
  const occupied = new Map(laneKeys.map((k) => [k, new Set()]));

  const place = (station, laneKey, col) => {
    occupied.get(laneKey)?.add(col);
    const p = {
      ...station,
      x: leftOrigin + col * colPitch,
      y: laneY(laneKey),
      laneIdx: laneIndex.get(laneKey) ?? 0,
      colIdx: col,
      labelPlacement: null,
    };
    positionedStations.push(p);
    posById.set(p.id, p);
    return p;
  };

  const freeCol = (laneKey, want, rightOnly = false) => {
    const occ = occupied.get(laneKey) ?? new Set();
    for (let d = 0; d < 256; d++) {
      const cands = rightOnly || d === 0 ? [want + d] : [want + d, want - d];
      for (const c of cands) if (c >= 0 && !occ.has(c)) return c;
    }
    return want;
  };

  models.forEach((m, i) => place(m, laneKeyOf(MODEL_LINE), i));

  // ---- 4. Everything else: aligned under partner, else centroid ----------
  const centroidCol = (id) => {
    const cols = (neighbors.get(id) || [])
      .map((n) => posById.get(n.id))
      .filter(Boolean)
      .map((p) => p.colIdx);
    return cols.length ? Math.round(cols.reduce((a, b) => a + b, 0) / cols.length) : null;
  };

  const rest = sortedLines.filter((l) => l.id !== MODEL_LINE);
  // Spur layers last, so their anchors are already positioned.
  rest.sort((a, b) => (SPUR_ON[a.id] ? 1 : 0) - (SPUR_ON[b.id] ? 1 : 0));

  for (const line of rest) {
    const laneKey = laneKeyOf(line.id);
    const isSpur = Boolean(SPUR_ON[line.id]) && laneKey !== line.id;
    const connected = (id) => isSpur || partnerOf.has(id) || centroidCol(id) !== null;
    const ordered = [
      ...line.stationIds.filter((id) => connected(id)),
      ...line.stationIds.filter((id) => !connected(id)),
    ];
    for (const stationId of ordered) {
      const station = graph.stationMap.get(stationId);
      if (!station || posById.has(stationId)) continue;

      let col;
      const partner = partnerOf.get(stationId);
      if (!connected(stationId)) {
        // No contract ties it to a column: park it right of the lane's stations
        // rather than implying a relationship by alignment.
        col = freeCol(laneKey, Math.max(-1, ...occupied.get(laneKey)) + 1, true);
      } else if (partner && posById.has(partner)) {
        col = freeCol(laneKey, posById.get(partner).colIdx);
      } else if (isSpur) {
        const anchorCol = Math.max(
          -1,
          ...(neighbors.get(stationId) || [])
            .map((n) => posById.get(n.id))
            .filter((p) => p && p.laneIdx === laneIndex.get(laneKeyOf(MODEL_LINE)))
            .map((p) => p.colIdx)
        );
        const laneMax = Math.max(-1, ...occupied.get(laneKey));
        col = freeCol(laneKey, Math.max(anchorCol, anchorCol < 0 ? laneMax : -1) + 1, true);
      } else {
        col = freeCol(laneKey, centroidCol(stationId) ?? 0);
      }
      place(station, laneKey, col);
    }
  }

  // Defensive: any station whose layer was not among graph.lines.
  for (const station of graph.stations) {
    if (posById.has(station.id)) continue;
    const key = laneKeys.includes(station.layer) ? station.layer : laneKeys[0];
    if (key === undefined) break;
    place(station, key, freeCol(key, 0));
  }

  positionedStations.sort((a, b) => a.laneIdx - b.laneIdx || a.colIdx - b.colIdx);

  const totalLanes = Math.max(1, laneKeys.length);

  // ---- 5. Grid furniture: lane titles + column headers -------------------
  const lanes = laneKeys.map((key) => {
    const line = graph.lines.find((l) => l.id === key);
    return {
      lineId: key,
      label: line?.label ?? key,
      color: line?.color ?? "#94a3b8",
      x: leftOrigin - 300,
      y: laneY(key),
    };
  });

  const headerY = topOrigin - 96;
  const concernCount = new Map();
  for (const m of models) concernCount.set(m.concern, (concernCount.get(m.concern) ?? 0) + 1);
  const columns = models.map((m, i) => ({
    index: i,
    x: leftOrigin + i * colPitch,
    // Shared concerns (e.g. catalog/template scaffolding) fall back to the name.
    label: m.concern && concernCount.get(m.concern) === 1 ? m.concern : m.name,
    stationId: m.id,
    y: headerY,
  }));
  const gridBottom = laneY(laneKeys[laneKeys.length - 1] ?? laneKeys[0]) + 74;

  // Reserve furniture first so station labels route around it.
  const placedLabelRects = [];
  for (const lane of lanes) {
    placedLabelRects.push({
      x1: lane.x,
      y1: lane.y - 14,
      x2: lane.x + laneTitleWidth,
      y2: lane.y + 14,
    });
  }
  for (const col of columns) {
    placedLabelRects.push({ x1: col.x - 100, y1: col.y - 18, x2: col.x + 100, y2: col.y + 12 });
  }

  // Assign collision-checked label slots in deterministic placement order.
  for (const st of positionedStations) {
    st.labelPlacement = pickNonOverlappingLabelSlot(
      st,
      positionedStations,
      placedLabelRects,
      st.laneIdx,
      totalLanes
    );
  }

  // ---- 6. Corridors ------------------------------------------------------
  const corridorPaths = sortedLines
    .map((line) => {
      let pts = positionedStations
        .filter((s) => s.layer === line.id)
        .sort((a, b) => a.x - b.x)
        .map((s) => ({ x: s.x, y: s.y }));

      // Spur: start the branch at the nearest model station it connects to.
      if (SPUR_ON[line.id] && laneKeyOf(line.id) !== line.id) {
        const anchors = [];
        for (const st of positionedStations.filter((s) => s.layer === line.id)) {
          for (const n of neighbors.get(st.id) || []) {
            const p = posById.get(n.id);
            if (p && p.layer === MODEL_LINE) anchors.push({ x: p.x, y: laneY(laneKeyOf(line.id)) });
          }
        }
        if (anchors.length) {
          anchors.sort((a, b) => b.x - a.x);
          pts = [anchors[0], ...pts];
        }
      }

      return {
        lineId: line.id,
        label: line.label,
        color: line.color,
        d: chamferPolyline(pts, 18),
      };
    })
    .filter((corr) => corr.d !== "");

  // ---- 7. Contract links with nudged markers -----------------------------
  const placedMarkers = [];

  const routeContractEdge = (edge, index, kind) => {
    const a = posById.get(edge.from_station_id);
    const b = posById.get(edge.to_station_id);
    if (!a || !b) return null;

    const sameCol = Math.abs(a.x - b.x) < 1 && a.y !== b.y;
    const sign = index % 2 === 0 ? 1 : -1;
    const baseOffset = sign * (54 + (index % 3) * 16);
    const rawMidX = sameCol ? a.x : (a.x + b.x) / 2 + baseOffset;
    const rawMidY = a.y === b.y ? a.y + baseOffset * 0.65 : (a.y + b.y) / 2;

    const { mx, my } = resolveMarkerPosition(
      rawMidX,
      rawMidY,
      positionedStations,
      placedMarkers,
      placedLabelRects
    );

    const pts = sameCol
      ? [
          { x: a.x, y: a.y },
          { x: mx, y: my },
          { x: b.x, y: b.y },
        ]
      : a.y === b.y
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

  // ---- 8. Bounds + auto-fit ----------------------------------------------
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

  if (Number.isFinite(minX)) {
    for (const lane of lanes) minX = Math.min(minX, lane.x);
    if (columns.length) minY = Math.min(minY, headerY - 24);
    maxY = Math.max(maxY, gridBottom);
  } else {
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
    lanes,
    columns,
    gridBottom,
    fitTransform: { x, y, k },
  };
}
