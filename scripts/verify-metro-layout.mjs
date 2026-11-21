/**
 * Metro Map layout collision & coverage verification.
 *
 * Self-contained: uses only Node's built-in node:test / node:assert.
 * Run with:  node --test scripts/verify-metro-layout.mjs   (Node 20+)
 *
 * Asserts, across small / medium / large-dense / compact-viewport synthetic
 * registries plus the repository's REAL data/ecosystem-registry.json:
 *   1. Every station in the registry appears in the computed layout.
 *   2. Zero station-to-station overlaps (minimum center-to-center clearance).
 *   3. Zero label-to-station overlaps (label rect vs every station circle).
 *   4. Zero label-to-label overlaps.
 *   5. A finite, positive auto-fit transform.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { buildMetroGraph } from "../gateway/assets/js/metro-graph.js";
import { computeMetroLayout, shortContractLabel } from "../gateway/assets/js/metro-layout.js";

function rectsOverlap(a, b, pad = 0) {
  return !(a.x2 + pad < b.x1 || a.x1 - pad > b.x2 || a.y2 + pad < b.y1 || a.y1 - pad > b.y2);
}

function circleRectOverlap(cx, cy, r, rect) {
  const closestX = Math.max(rect.x1, Math.min(cx, rect.x2));
  const closestY = Math.max(rect.y1, Math.min(cy, rect.y2));
  return (cx - closestX) ** 2 + (cy - closestY) ** 2 < r * r;
}

function makeSampleRegistry(modelCount, capabilityCount) {
  const artifacts = [
    {
      id: "org-governance-standard",
      name: "Ecosystem Governance & Registry",
      full_name: "Assessment-Models/.github",
      layer: "governance",
      architectural_concern: "Organization Governance",
      description: "Canonical standard and registry.",
      html_url: "https://github.com/Assessment-Models/",
      version: "v1.0.0",
      license: "Apache-2.0",
      conformance_status: "verified",
      locales: ["en"],
      dimensions: ["Standard", "Registry"],
    },
  ];

  for (let i = 1; i <= modelCount; i++) {
    artifacts.push({
      id: `maturity-model-${i}`,
      name: `Domain Maturity Model ${i}`,
      full_name: `Assessment-Models/maturity-model-${i}`,
      layer: "maturity-model",
      architectural_concern: "Maturity Model Architecture",
      description: `Maturity model #${i} for enterprise evaluation.`,
      html_url: `https://github.com/Assessment-Models/maturity-model-${i}`,
      version: `v${i}.0.0`,
      license: "CC-BY-4.0",
      conformance_status: i % 4 === 0 ? "draft" : "verified",
      locales: ["en"],
      dimensions: ["Dimension A", "Dimension B"],
    });
  }

  for (let c = 1; c <= capabilityCount; c++) {
    artifacts.push({
      id: `shared-cap-${c}`,
      name: `Shared Capability ${c}`,
      full_name: `Assessment-Models/shared-cap-${c}`,
      layer: "shared-capability",
      architectural_concern: "Assessment Architecture",
      description: `Shared capability #${c}.`,
      html_url: `https://github.com/Assessment-Models/shared-cap-${c}`,
      version: "v1.1.0",
      license: "Apache-2.0",
      conformance_status: "verified",
      locales: ["en"],
      dimensions: ["Capability Core"],
    });
  }

  artifacts.push({
    id: "opendia-dera-l1",
    name: "OpenDEA Reference Architecture",
    full_name: "technehub-labs/dea-catalog-reference-architecture",
    layer: "reference-blueprint",
    architectural_concern: "Model Ecosystem Integration Architecture",
    description: "OpenDEA L1 reference blueprint.",
    html_url: "https://github.com/technehub-labs/dea-catalog-reference-architecture",
    version: "v1-alpha",
    license: "Apache-2.0",
    conformance_status: "external-aligned",
    locales: ["en"],
    dimensions: ["Metamodel", "Blueprints"],
  });

  const touchpoints = [];
  const handshakes = [];

  for (let i = 1; i <= modelCount; i++) {
    if (capabilityCount >= 1) {
      touchpoints.push({
        id: `tp-${i}`,
        label: `Evidence Touchpoint ${i}`,
        from_station_id: `maturity-model-${i}`,
        to_station_id: "shared-cap-1",
        line_id: "shared-capability",
        contract_summary: "Shares validated evidence.",
        compatibility: ">=1.0.0",
      });
    }
    if (i > 1) {
      handshakes.push({
        id: `hs-${i}`,
        label: `Model Handshake ${i - 1}-${i}`,
        from_station_id: `maturity-model-${i - 1}`,
        to_station_id: `maturity-model-${i}`,
        line_id: "integration",
        direction: "bidirectional",
        contract_summary: "Coordinates inter-model touchpoints.",
        compatibility: "^1.0.0",
      });
    }
  }

  return {
    schema_version: "1.0.0",
    organization: {
      login: "Assessment-Models",
      url: "https://github.com/Assessment-Models",
      pages_url: "https://assessment-models.github.io",
    },
    generated_at: "2026-11-20T00:00:00Z",
    content_sha256: "0".repeat(64),
    summary: { total_artifacts: artifacts.length },
    artifacts,
    touchpoints,
    handshakes,
  };
}

function assertNoOverlaps(layout, label, minStationSeparation = 150) {
  const { stations } = layout;

  // 1. Station-to-station separation check
  for (let i = 0; i < stations.length; i++) {
    for (let j = i + 1; j < stations.length; j++) {
      const a = stations[i];
      const b = stations[j];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      assert.ok(
        dist >= minStationSeparation,
        `[${label}] Station overlap between "${a.id}" and "${b.id}": distance ${dist.toFixed(1)} < ${minStationSeparation}`
      );
    }
  }

  // 2. Label-to-station clearance check (radius includes interchange ring + buffer)
  const stationNodeRadius = 22;
  for (const st of stations) {
    const rect = st.labelPlacement?.rect;
    assert.ok(rect, `[${label}] Missing labelPlacement.rect for station "${st.id}"`);

    for (const other of stations) {
      assert.equal(
        circleRectOverlap(other.x, other.y, stationNodeRadius, rect),
        false,
        `[${label}] Label of "${st.id}" overlaps station node "${other.id}"`
      );
    }
  }

  // 3. Label-to-label overlap check
  for (let i = 0; i < stations.length; i++) {
    for (let j = i + 1; j < stations.length; j++) {
      const rectA = stations[i].labelPlacement.rect;
      const rectB = stations[j].labelPlacement.rect;
      assert.equal(
        rectsOverlap(rectA, rectB, 4),
        false,
        `[${label}] Label overlap between "${stations[i].id}" and "${stations[j].id}"`
      );
    }
  }
}

describe("computeMetroLayout collision & coverage verification", () => {
  const scenarios = [
    { name: "small (2 models, 1 capability)", models: 2, caps: 1, w: 1280, h: 720 },
    { name: "medium (5 models, 2 capabilities)", models: 5, caps: 2, w: 1440, h: 820 },
    { name: "large dense (10 models, 4 capabilities)", models: 10, caps: 4, w: 1600, h: 900 },
    { name: "compact viewport (6 models, 2 capabilities)", models: 6, caps: 2, w: 800, h: 600 },
    { name: "extra dense (14 models, 6 capabilities)", models: 14, caps: 6, w: 1600, h: 900 },
  ];

  for (const s of scenarios) {
    it(`has zero overlaps and full coverage for ${s.name}`, () => {
      const registry = makeSampleRegistry(s.models, s.caps);
      const graph = buildMetroGraph(registry);
      const layout = computeMetroLayout(graph, s.w, s.h);

      assert.equal(layout.stations.length, registry.artifacts.length);
      assertNoOverlaps(layout, s.name);
      assert.ok(Number.isFinite(layout.fitTransform.k) && layout.fitTransform.k > 0);

      // Every corridor defined by the graph receives a rendered path.
      for (const line of graph.lines) {
        const corr = layout.corridorPaths.find((c) => c.lineId === line.id);
        assert.ok(corr && corr.d.length > 0, `[${s.name}] Missing corridor path for line ${line.id}`);
      }

      // Every contract between existing stations gets geometry + a marker.
      for (const tp of graph.touchpoints) {
        const edge = layout.touchpointEdges.find((e) => e.id === tp.id);
        assert.ok(edge, `[${s.name}] Missing geometry for touchpoint ${tp.id}`);
      }
      for (const hs of graph.handshakes) {
        const edge = layout.handshakeEdges.find((e) => e.id === hs.id);
        assert.ok(edge, `[${s.name}] Missing geometry for handshake ${hs.id}`);
      }
    });
  }

  it("does not crash on an empty registry and still yields a usable transform", () => {
    const graph = buildMetroGraph({ artifacts: [], touchpoints: [], handshakes: [] });
    const layout = computeMetroLayout(graph, 800, 600);
    assert.equal(layout.stations.length, 0);
    assert.equal(layout.corridorPaths.length, 0);
    assert.ok(Number.isFinite(layout.fitTransform.k) && layout.fitTransform.k > 0);
  });

  it("keeps the repository's real data/ecosystem-registry.json fully mapped without overlaps", () => {
    const realPath = new URL("../data/ecosystem-registry.json", import.meta.url);
    const registry = JSON.parse(readFileSync(realPath, "utf8"));
    const graph = buildMetroGraph(registry);
    const layout = computeMetroLayout(graph, 1440, 820);

    assert.equal(layout.stations.length, registry.artifacts.length);
    assertNoOverlaps(layout, "real registry");
    assert.ok(Number.isFinite(layout.fitTransform.k) && layout.fitTransform.k > 0);
  });
});

describe("computeMetroLayout registry-grounded grid", () => {
  const realPath = new URL("../data/ecosystem-registry.json", import.meta.url);
  const registry = JSON.parse(readFileSync(realPath, "utf8"));
  const graph = buildMetroGraph(registry);
  const layout = computeMetroLayout(graph, 1440, 820);
  const byId = new Map(layout.stations.map((s) => [s.id, s]));
  const ofLayer = (layer) => layout.stations.filter((s) => s.layer === layer);

  it("orders lanes by dependency flow (top to bottom)", () => {
    const order = ["governance", "maturity-model", "integration", "assessment-model", "shared-capability"];
    const ys = order.map((layer) => {
      const st = ofLayer(layer);
      assert.ok(st.length > 0, `no stations on layer ${layer}`);
      assert.equal(new Set(st.map((s) => s.y)).size, 1, `layer ${layer} must sit on a single lane`);
      return st[0].y;
    });
    for (let i = 1; i < ys.length; i++) {
      assert.ok(ys[i - 1] < ys[i], `lane ${order[i - 1]} must be above ${order[i]}`);
    }
  });

  it("aligns each instrument directly under the model it scores against", () => {
    const pairs = graph.handshakes.filter(
      (h) => byId.get(h.from_station_id)?.layer === "assessment-model" && byId.get(h.to_station_id)?.layer === "maturity-model"
    );
    assert.ok(pairs.length > 0, "registry should contain instrument -> model handshakes");
    for (const h of pairs) {
      assert.equal(
        byId.get(h.from_station_id).x,
        byId.get(h.to_station_id).x,
        `${h.from_station_id} must share a column with ${h.to_station_id}`
      );
      assert.ok(byId.get(h.from_station_id).y > byId.get(h.to_station_id).y, "instrument sits below its model");
    }
  });

  it("emits one header column per model-lane station, aligned to that station", () => {
    const models = ofLayer("maturity-model");
    assert.equal(layout.columns.length, models.length);
    for (const col of layout.columns) {
      assert.equal(byId.get(col.stationId).x, col.x, `column header for ${col.stationId} must align`);
    }
    assert.equal(new Set(layout.columns.map((c) => c.label)).size, layout.columns.length, "column labels are unique");
  });

  it("emits a title for every lane", () => {
    assert.equal(layout.lanes.length, 5);
    for (const lane of layout.lanes) assert.ok(lane.label && Number.isFinite(lane.y));
  });

  it("puts at most one station on any (lane, column) cell", () => {
    const seen = new Set();
    for (const s of layout.stations) {
      const key = `${s.laneIdx}:${s.colIdx}`;
      assert.ok(!seen.has(key), `two stations share grid cell ${key}`);
      seen.add(key);
    }
  });

  it("draws the blueprint as a spur on the integration lane, right of its anchor model", () => {
    const blueprint = ofLayer("reference-blueprint");
    assert.ok(blueprint.length > 0);
    const integrationY = ofLayer("integration")[0].y;
    for (const bp of blueprint) {
      assert.equal(bp.y, integrationY, "blueprint shares the integration lane");
      const anchors = graph.handshakes
        .concat(graph.touchpoints)
        .filter((e) => e.to_station_id === bp.id || e.from_station_id === bp.id)
        .map((e) => byId.get(e.to_station_id === bp.id ? e.from_station_id : e.to_station_id))
        .filter((s) => s?.layer === "maturity-model");
      assert.ok(anchors.length > 0, "blueprint has a model anchor");
      for (const a of anchors) assert.ok(bp.x > a.x, `${bp.id} must sit right of anchor ${a.id}`);
    }
    const spur = layout.corridorPaths.find((c) => c.lineId === "reference-blueprint");
    assert.ok(spur && /L/.test(spur.d), "spur corridor must have a segment, not a lone point");
  });

  it("keeps non-model stations unaligned only when no contract ties them to a column", () => {
    const unconnected = layout.stations.filter((s) => s.touchpoints.length + s.handshakes.length === 0);
    const laneMax = (lane) => Math.max(...layout.stations.filter((s) => s.laneIdx === lane).map((s) => s.colIdx));
    for (const s of unconnected) assert.equal(s.colIdx, laneMax(s.laneIdx), `${s.id} should be parked at the right end of its lane`);
  });

  it("is deterministic", () => {
    const again = computeMetroLayout(buildMetroGraph(registry), 1440, 820);
    assert.deepEqual(
      again.stations.map((s) => [s.id, s.x, s.y]),
      layout.stations.map((s) => [s.id, s.x, s.y])
    );
  });
});

describe("computeMetroLayout contract marker labels", () => {
  const overlap = (a, b) => a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;
  const hitsCircle = (cx, cy, r, q) => {
    const x = Math.max(q.x1, Math.min(cx, q.x2));
    const y = Math.max(q.y1, Math.min(cy, q.y2));
    return (cx - x) ** 2 + (cy - y) ** 2 < r * r;
  };

  const realPath = new URL("../data/ecosystem-registry.json", import.meta.url);
  const registry = JSON.parse(readFileSync(realPath, "utf8"));
  const layout = computeMetroLayout(buildMetroGraph(registry), 1440, 820);
  const edges = [...layout.touchpointEdges, ...layout.handshakeEdges];

  it("labels every touchpoint and handshake marker", () => {
    assert.ok(edges.length > 0);
    for (const e of edges) {
      assert.ok(e.shortLabel && e.shortLabel.length > 0, `${e.id} has no short label`);
      assert.ok(e.labelPlacement && e.labelPlacement.rect, `${e.id} has no label placement`);
      assert.ok(e.shortLabel.length <= 34, `${e.id} label too long: ${e.shortLabel}`);
    }
  });

  it("keeps short labels distinguishable (no two markers share a label)", () => {
    const seen = new Map();
    for (const e of edges) {
      assert.ok(!seen.has(e.shortLabel), `${e.id} and ${seen.get(e.shortLabel)} both read "${e.shortLabel}"`);
      seen.set(e.shortLabel, e.id);
    }
  });

  it("places no marker label on a station, station label, marker or another marker label", () => {
    for (const e of edges) {
      const r = e.labelPlacement.rect;
      for (const s of layout.stations) {
        assert.ok(!hitsCircle(s.x, s.y, 22, r), `${e.shortLabel} covers station ${s.id}`);
        assert.ok(!overlap(r, s.labelPlacement.rect), `${e.shortLabel} overlaps the label of ${s.id}`);
      }
      for (const m of edges) {
        if (m === e) continue;
        assert.ok(!hitsCircle(m.mx, m.my, 10, r), `${e.shortLabel} covers marker ${m.id}`);
        assert.ok(!overlap(r, m.labelPlacement.rect), `${e.shortLabel} overlaps label ${m.shortLabel}`);
      }
    }
  });

  it("keeps full names for tooltips and abbreviates only for display", () => {
    const ops = edges.find((e) => /Operations Scale Contract/.test(e.label));
    assert.ok(ops, "expected the Operations scale-contract handshake");
    assert.equal(ops.label, "Operations Scale Contract Handshake");
    assert.equal(ops.shortLabel, "Ops Scale Contract");
    assert.equal(shortContractLabel("Something Unknown Touchpoint"), "Something Unknown");
  });

  it("includes marker labels inside the fitted bounds", () => {
    const { x, y, k } = layout.fitTransform;
    for (const e of edges) {
      const r = e.labelPlacement.rect;
      for (const [px, py] of [[r.x1, r.y1], [r.x2, r.y2]]) {
        const sx = px * k + x;
        const sy = py * k + y;
        assert.ok(sx > -1 && sx < 1440 + 1 && sy > -1 && sy < 820 + 1, `${e.shortLabel} falls outside the viewport`);
      }
    }
  });
});
