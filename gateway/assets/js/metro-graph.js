/**
 * Normalizes Assessment-Models registry data into a Metro Map graph:
 * - lines (corridors derived from architectural layers)
 * - stations (repositories/models/capabilities/blueprints, with interchange flags)
 * - touchpoints (shared semantic/capability mappings)
 * - handshakes (inter-model / cross-corridor governed exchanges)
 *
 * Also exports a deterministic fallback registry (METRO_SEED_REGISTRY) used by
 * the gateway entry loader when data/ecosystem-registry.json is missing or has
 * no extended touchpoint/handshake fields (local preview / offline).
 */

export const METRO_LINES = [
  { id: "governance", label: "Governance Line", color: "#f59e0b", order: 0 },
  { id: "maturity-model", label: "Maturity Models Line", color: "#38bdf8", order: 1 },
  { id: "assessment-model", label: "Assessment Instruments Line", color: "#22d3ee", order: 2 },
  { id: "shared-capability", label: "Shared Capabilities Line", color: "#34d399", order: 3 },
  { id: "integration", label: "Integration & Handshakes Line", color: "#a78bfa", order: 4 },
  { id: "reference-blueprint", label: "OpenDEA Blueprint Line", color: "#f472b6", order: 5 },
];

/** Deterministic fallback graph (mirrors the seeded data/ecosystem-registry.json). */
export const METRO_SEED_REGISTRY = {
  generated_at: "seed-preview",
  content_sha256: "seed000000000000000000000000000000000000000000000000000000000000",
  summary: {
    total_artifacts: 6,
    by_layer: { "governance": 1, "maturity-model": 2, "shared-capability": 1, "integration": 1, "reference-blueprint": 1 },
    standards: ["AM-MODEL-REPOSITORY-STANDARD", "DERA-L1", "ISO/IEC-33002", "MECE-STRICT", "OpenDEA"],
  },
  artifacts: [
    {
      id: "maturity-model-standard",
      name: "maturity-model-standard",
      full_name: "Assessment-Models/maturity-model-standard",
      owner_type: "cardinal-org",
      layer: "governance",
      architectural_concern: "Organization Governance",
      description:
        "Normative source of truth for the maturity-model repository standard across Assessment-Models: specifications, schemas, reusable conformance workflow and the portfolio conformance registry.",
      readme_excerpt:
        "Normative source of truth for the maturity-model repository standard across the Assessment-Models organization.",
      html_url: "https://github.com/Assessment-Models/maturity-model-standard",
      version: "v1.0.1",
      license: "MIT",
      standards_alignment: ["MECE-STRICT", "AM-MODEL-REPOSITORY-STANDARD"],
      locales: ["en"],
      dimensions: ["Specifications", "Schemas", "Conformance Workflow", "Portfolio Registry"],
      conformance_status: "draft",
      updated_at: "2026-11-19T00:00:00Z",
    },
    {
      id: "maturity-model-digital-transformation",
      name: "Digital Transformation Maturity Model",
      full_name: "Assessment-Models/maturity-model-digital-transformation",
      owner_type: "cardinal-org",
      layer: "maturity-model",
      architectural_concern: "Digital Transformation",
      description:
        "Composite maturity model spanning operations, technology, and services-delivery child models, plus the org's own adoption of OpenDEA itself.",
      readme_excerpt:
        "The first independent model in the Assessment-Models ecosystem demonstrating all three CI levels on the same repository.",
      html_url: "https://github.com/Assessment-Models/maturity-model-digital-transformation",
      version: "v1.1.0-alpha",
      license: "MIT",
      standards_alignment: ["AM-MODEL-REPOSITORY-STANDARD", "OpenDEA"],
      locales: ["en"],
      dimensions: [
        "Leadership sponsorship",
        "Shared DT vocabulary",
        "Safe-to-fail experimentation",
        "Reference architecture",
        "Automation coverage",
      ],
      conformance_status: "structural",
      updated_at: "2026-11-20T00:00:00Z",
    },
    {
      id: "maturity-model-autonomous-operations",
      name: "Autonomous Operations Maturity Model",
      full_name: "Assessment-Models/maturity-model-autonomous-operations",
      owner_type: "cardinal-org",
      layer: "maturity-model",
      architectural_concern: "Autonomous Operations",
      description:
        "Autonomous Operations (AO) maturity and assessment model for AI-instrumented value streams and closed-loop control.",
      readme_excerpt:
        "Measures how mature an organization is at running Autonomous Operations with intent driving closed loops.",
      html_url: "https://github.com/Assessment-Models/maturity-model-autonomous-operations",
      version: "v2.0.0",
      license: "MIT",
      standards_alignment: ["AM-MODEL-REPOSITORY-STANDARD", "OpenDEA"],
      locales: ["en"],
      dimensions: ["Party", "Strategy", "Technology", "Operations", "Culture", "Data"],
      conformance_status: "structural",
      updated_at: "2026-11-20T00:00:00Z",
    },
    {
      id: "maturity-components",
      name: "maturity-components",
      full_name: "Assessment-Models/maturity-components",
      owner_type: "cardinal-org",
      layer: "shared-capability",
      architectural_concern: "Assessment Architecture",
      description:
        "Reusable, versioned maturity component packages - dimension, criteria, level-expectation and evidence-requirement bundles consumed by maturity models.",
      readme_excerpt:
        "Reusable maturity component packages consumed under explicit import, extend, and override kinds.",
      html_url: "https://github.com/Assessment-Models/maturity-components",
      version: "v1.0.1",
      license: "MIT",
      standards_alignment: ["MECE-STRICT"],
      locales: ["en"],
      dimensions: ["Digital Culture", "Technology Adoption", "Operations Modernization", "Services Delivery"],
      conformance_status: "draft",
      updated_at: "2026-11-13T00:00:00Z",
    },
    {
      id: "dea-metamodel",
      name: "dea-metamodel",
      full_name: "technehub-labs/dea-metamodel",
      owner_type: "partner-ecosystem",
      layer: "integration",
      architectural_concern: "Model Ecosystem Integration Architecture",
      description:
        "Digital Enterprise Architecture Metamodel: canonical entity definitions, relationships, and scale contract handshakes.",
      readme_excerpt:
        "Canonical entity definitions, relationships, and schemas for all DEA catalog repositories.",
      html_url: "https://github.com/technehub-labs/dea-metamodel",
      version: "v1.0.0",
      license: "Apache-2.0",
      standards_alignment: ["OpenDEA"],
      locales: ["en"],
      dimensions: ["Metamodel", "Scale Contract", "Touchpoint Contract"],
      conformance_status: "external-aligned",
      updated_at: "2026-11-19T00:00:00Z",
    },
    {
      id: "dea-catalog-reference-architecture",
      name: "dea-catalog-reference-architecture",
      full_name: "technehub-labs/dea-catalog-reference-architecture",
      owner_type: "partner-ecosystem",
      layer: "reference-blueprint",
      architectural_concern: "Model Ecosystem Integration Architecture",
      description:
        "Digital Enterprise Reference Architecture (DERA): L1 catalog assembling all DEA framework layers into a practical delivery blueprint.",
      readme_excerpt:
        "Provides end-to-end enterprise reference blueprints aligned with OpenDEA metamodel and guardrails.",
      html_url: "https://github.com/technehub-labs/dea-catalog-reference-architecture",
      version: "v0.1.0-draft",
      license: "Apache-2.0",
      standards_alignment: ["OpenDEA", "DERA-L1", "Apache-2.0"],
      locales: ["en"],
      dimensions: ["Metamodel", "Tenets", "Guardrails", "Patterns", "Blueprints", "Metrics"],
      conformance_status: "external-aligned",
      updated_at: "2026-08-16T00:00:00Z",
    },
  ],
  touchpoints: [
    {
      id: "tp-component-reuse",
      label: "Shared Capability Touchpoint",
      kind: "touchpoint",
      from_station_id: "maturity-model-digital-transformation",
      to_station_id: "maturity-components",
      line_id: "shared-capability",
      contract_summary: "Reuses governed maturity component packages for composite capability scoring.",
      compatibility: ">=1.0.0",
    },
    {
      id: "tp-standard-alignment",
      label: "Standard Alignment Touchpoint",
      kind: "touchpoint",
      from_station_id: "maturity-model-digital-transformation",
      to_station_id: "maturity-model-standard",
      line_id: "governance",
      contract_summary: "Binds model criteria, scoring, and repository structure to the normative maturity-model standard.",
      compatibility: ">=1.0.0 <2.0.0",
    },
  ],
  handshakes: [
    {
      id: "hs-scale-contract-digital-transformation",
      label: "Digital Transformation Scale Contract Handshake",
      kind: "handshake",
      from_station_id: "maturity-model-digital-transformation",
      to_station_id: "dea-metamodel",
      line_id: "integration",
      direction: "unidirectional",
      contract_summary: "Pins the maturity-scale-contract against the published dea-metamodel suite.",
      compatibility: "^1.0",
    },
    {
      id: "hs-scale-contract-autonomous-operations",
      label: "Autonomous Operations Scale Contract Handshake",
      kind: "handshake",
      from_station_id: "maturity-model-autonomous-operations",
      to_station_id: "dea-metamodel",
      line_id: "integration",
      direction: "unidirectional",
      contract_summary: "Pins the maturity-scale-contract against the canonical dea:maturity-bands-v2 scale.",
      compatibility: "^1.0",
    },
    {
      id: "hs-opendea-crosswalk",
      label: "OpenDEA DERA-L1 Handshake",
      kind: "handshake",
      from_station_id: "maturity-model-digital-transformation",
      to_station_id: "dea-catalog-reference-architecture",
      line_id: "reference-blueprint",
      direction: "unidirectional",
      contract_summary: "Crosswalks enterprise maturity profiles to OpenDEA DERA-L1 guardrails, patterns, and blueprints.",
      compatibility: "^1.0.0",
    },
  ],
};

export function buildMetroGraph(registry) {
  const artifacts = Array.isArray(registry?.artifacts) ? registry.artifacts : [];
  const rawTouchpoints = Array.isArray(registry?.touchpoints) ? registry.touchpoints : [];
  const rawHandshakes = Array.isArray(registry?.handshakes) ? registry.handshakes : [];

  const lineMap = new Map(METRO_LINES.map((l) => [l.id, { ...l, stationIds: [] }]));
  const stationMap = new Map();

  for (const art of artifacts) {
    const primaryLine = lineMap.has(art.layer) ? art.layer : "maturity-model";
    const station = {
      id: art.id,
      name: art.name,
      fullName: art.full_name,
      layer: primaryLine,
      concern: art.architectural_concern || "Ecosystem Artifact",
      description: art.description || "",
      readmeExcerpt: art.readme_excerpt || "",
      htmlUrl: art.html_url || "https://github.com/Assessment-Models/",
      version: art.version || "v0.1.0",
      license: art.license || "Apache-2.0",
      conformanceStatus: art.conformance_status || "draft",
      standards: art.standards_alignment || [],
      locales: art.locales || ["en"],
      dimensions: art.dimensions || [],
      lineIds: new Set([primaryLine]),
      touchpoints: [],
      handshakes: [],
      isInterchange: false,
    };
    stationMap.set(station.id, station);
    lineMap.get(primaryLine).stationIds.push(station.id);
  }

  const touchpoints = rawTouchpoints
    .filter((tp) => stationMap.has(tp.from_station_id) && stationMap.has(tp.to_station_id))
    .map((tp) => {
      const lineId = lineMap.has(tp.line_id) ? tp.line_id : "shared-capability";
      const fromSt = stationMap.get(tp.from_station_id);
      const toSt = stationMap.get(tp.to_station_id);
      fromSt.lineIds.add(lineId);
      toSt.lineIds.add(lineId);
      const edge = {
        ...tp,
        kind: "touchpoint",
        line_id: lineId,
        color: lineMap.get(lineId)?.color || "#34d399",
      };
      fromSt.touchpoints.push(edge);
      toSt.touchpoints.push(edge);
      return edge;
    });

  const handshakes = rawHandshakes
    .filter((hs) => stationMap.has(hs.from_station_id) && stationMap.has(hs.to_station_id))
    .map((hs) => {
      const lineId = lineMap.has(hs.line_id) ? hs.line_id : "integration";
      const fromSt = stationMap.get(hs.from_station_id);
      const toSt = stationMap.get(hs.to_station_id);
      fromSt.lineIds.add(lineId);
      toSt.lineIds.add(lineId);
      const edge = {
        ...hs,
        kind: "handshake",
        direction: hs.direction || "bidirectional",
        line_id: lineId,
        color: lineMap.get(lineId)?.color || "#a78bfa",
      };
      fromSt.handshakes.push(edge);
      toSt.handshakes.push(edge);
      return edge;
    });

  const stations = Array.from(stationMap.values()).map((st) => ({
    ...st,
    lineIds: Array.from(st.lineIds),
    isInterchange:
      st.lineIds.size > 1 || st.touchpoints.length + st.handshakes.length >= 2,
  }));

  const lines = Array.from(lineMap.values())
    .filter((l) => l.stationIds.length > 0)
    .sort((a, b) => a.order - b.order);

  return {
    lines,
    stations,
    stationMap: new Map(stations.map((s) => [s.id, s])),
    touchpoints,
    handshakes,
  };
}
