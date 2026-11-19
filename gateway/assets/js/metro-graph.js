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
  { id: "shared-capability", label: "Shared Capabilities Line", color: "#34d399", order: 2 },
  { id: "integration", label: "Integration & Handshakes Line", color: "#a78bfa", order: 3 },
  { id: "reference-blueprint", label: "OpenDEA Blueprint Line", color: "#f472b6", order: 4 },
];

/** Deterministic fallback graph (mirrors the seeded data/ecosystem-registry.json). */
export const METRO_SEED_REGISTRY = {
  generated_at: "seed-preview",
  content_sha256: "seed000000000000000000000000000000000000000000000000000000000000",
  summary: {
    total_artifacts: 6,
    by_layer: { "governance": 1, "maturity-model": 2, "shared-capability": 2, "reference-blueprint": 1 },
    standards: ["DERA-L1", "ISO/IEC-33001", "MECE-STRICT", "OpenDEA", "SemVer"],
  },
  artifacts: [
    {
      id: "org-governance-standard",
      name: "Ecosystem Governance & Registry",
      full_name: "Assessment-Models/.github",
      owner_type: "cardinal-org",
      layer: "governance",
      architectural_concern: "Organization Governance",
      description:
        "Canonical ecosystem standard, central registry rules, conformance policies, and model onboarding lifecycle.",
      readme_excerpt:
        "Each maturity model retains ownership of its domain semantics, assessment methodology and scoring logic while conforming to shared organizational standards.",
      html_url: "https://github.com/Assessment-Models/",
      version: "v1.0.0",
      license: "Apache-2.0",
      standards_alignment: ["MECE-STRICT", "SemVer", "OpenDEA"],
      locales: ["en"],
      dimensions: [
        "Maturity Model Standard",
        "Assessment Registry",
        "Conformance Governance",
        "Lifecycle Policies",
      ],
      conformance_status: "verified",
      updated_at: "2026-11-19T00:00:00Z",
    },
    {
      id: "enterprise-digital-maturity",
      name: "Enterprise Digital Maturity Model",
      full_name: "Assessment-Models/enterprise-digital-maturity",
      owner_type: "cardinal-org",
      layer: "maturity-model",
      architectural_concern: "Maturity Model Architecture",
      description:
        "Domain-governed enterprise digital maturity model with progression tiers, criteria gates, and OpenDEA crosswalks.",
      readme_excerpt:
        "Defines domains, dimensions, capabilities, criteria, progression levels, and domain-specific assessment terminology.",
      html_url: "https://github.com/Assessment-Models/",
      version: "v2.4.0",
      license: "CC-BY-4.0",
      standards_alignment: ["MECE-STRICT", "ISO/IEC-33001", "OpenDEA"],
      locales: ["en", "fr", "de"],
      dimensions: [
        "Strategy & Governance",
        "Operations & Flows",
        "Architecture & Data",
        "Organization & Talent",
      ],
      conformance_status: "verified",
      updated_at: "2026-11-19T00:00:00Z",
    },
    {
      id: "operational-autonomy-maturity",
      name: "Operational Autonomy Model",
      full_name: "Assessment-Models/operational-autonomy-maturity",
      owner_type: "cardinal-org",
      layer: "maturity-model",
      architectural_concern: "Maturity Model Architecture",
      description:
        "Evaluates closed-loop operational autonomy, human-in-the-loop guardrails, and resilience across business operations.",
      readme_excerpt:
        "Independently versioned autonomy maturity model linked via explicit touchpoints and handshakes to enterprise transformation models.",
      html_url: "https://github.com/Assessment-Models/",
      version: "v1.2.0",
      license: "CC-BY-4.0",
      standards_alignment: ["MECE-STRICT", "SemVer"],
      locales: ["en"],
      dimensions: ["Intent & Guardrails", "Closed-Loop Telemetry", "Human Escalation", "Autonomous Recovery"],
      conformance_status: "verified",
      updated_at: "2026-11-19T00:00:00Z",
    },
    {
      id: "evidence-scoring-engine",
      name: "Evidence & Deterministic Scoring",
      full_name: "Assessment-Models/evidence-scoring-engine",
      owner_type: "cardinal-org",
      layer: "shared-capability",
      architectural_concern: "Assessment Architecture",
      description:
        "Shared assessment capability for evidence validation, indicator mapping, deterministic scoring rubrics, and audit reporting.",
      readme_excerpt:
        "Provides reusable assessment execution, evidence management, deterministic scoring, and reporting across models.",
      html_url: "https://github.com/Assessment-Models/",
      version: "v1.5.0",
      license: "Apache-2.0",
      standards_alignment: ["MECE-STRICT", "SemVer"],
      locales: ["en"],
      dimensions: ["Evidence Validation", "Indicator Mapping", "Deterministic Rubrics", "Audit Reporting"],
      conformance_status: "verified",
      updated_at: "2026-11-19T00:00:00Z",
    },
    {
      id: "encyclopedia-localization-hub",
      name: "Encyclopedia & Localization Hub",
      full_name: "Assessment-Models/encyclopedia-localization-hub",
      owner_type: "cardinal-org",
      layer: "shared-capability",
      architectural_concern: "Assessment Architecture",
      description:
        "Shared authoritative knowledge encyclopedia and multilingual/regional localization capability for model instruments.",
      readme_excerpt:
        "Supports authoritative model knowledge resources and localized terminology without altering underlying scoring rules.",
      html_url: "https://github.com/Assessment-Models/",
      version: "v1.1.0",
      license: "Apache-2.0",
      standards_alignment: ["SemVer", "OpenDEA"],
      locales: ["en", "fr", "de", "es"],
      dimensions: ["Model Encyclopedia", "Term Glossary", "Locale Packs", "Regional Calibration"],
      conformance_status: "draft",
      updated_at: "2026-11-19T00:00:00Z",
    },
    {
      id: "opendia-dera-l1",
      name: "OpenDEA Reference Architecture",
      full_name: "technehub-labs/dea-catalog-reference-architecture",
      owner_type: "partner-ecosystem",
      layer: "reference-blueprint",
      architectural_concern: "Model Ecosystem Integration Architecture",
      description:
        "Digital Enterprise Reference Architecture (DERA): L1 catalog assembling metamodel, tenets, guardrails, patterns, blueprints, and metrics.",
      readme_excerpt:
        "Provides end-to-end enterprise reference blueprints aligned with OpenDEA metamodel and guardrails.",
      html_url: "https://github.com/technehub-labs/dea-catalog-reference-architecture",
      version: "v1-alpha",
      license: "Apache-2.0",
      standards_alignment: ["OpenDEA", "DERA-L1", "Apache-2.0"],
      locales: ["en"],
      dimensions: ["Metamodel", "Tenets", "Guardrails", "Patterns", "Blueprints", "Metrics"],
      conformance_status: "external-aligned",
      updated_at: "2026-11-19T00:00:00Z",
    },
  ],
  touchpoints: [
    {
      id: "tp-evidence-digital-maturity",
      label: "Evidence Binding Touchpoint",
      kind: "touchpoint",
      from_station_id: "enterprise-digital-maturity",
      to_station_id: "evidence-scoring-engine",
      line_id: "shared-capability",
      contract_summary: "Maps verified assessment evidence items to digital maturity criteria gates.",
      compatibility: ">=1.5.0",
    },
    {
      id: "tp-autonomy-evidence",
      label: "Telemetry Evidence Touchpoint",
      kind: "touchpoint",
      from_station_id: "operational-autonomy-maturity",
      to_station_id: "evidence-scoring-engine",
      line_id: "shared-capability",
      contract_summary: "Binds operational telemetry logs to deterministic autonomy scoring rubrics.",
      compatibility: ">=1.5.0",
    },
    {
      id: "tp-locale-encyclopedia",
      label: "Localized Instrument Touchpoint",
      kind: "touchpoint",
      from_station_id: "enterprise-digital-maturity",
      to_station_id: "encyclopedia-localization-hub",
      line_id: "shared-capability",
      contract_summary: "Supplies localized questionnaires and glossary definitions without changing score math.",
      compatibility: ">=1.1.0",
    },
  ],
  handshakes: [
    {
      id: "hs-gov-models",
      label: "Conformance & Registry Handshake",
      kind: "handshake",
      from_station_id: "org-governance-standard",
      to_station_id: "enterprise-digital-maturity",
      line_id: "integration",
      direction: "bidirectional",
      contract_summary: "Validates model conformance, SemVer compatibility, and central registry registration.",
      compatibility: "^1.0.0",
    },
    {
      id: "hs-digital-autonomy",
      label: "Cross-Model Autonomy Handshake",
      kind: "handshake",
      from_station_id: "enterprise-digital-maturity",
      to_station_id: "operational-autonomy-maturity",
      line_id: "integration",
      direction: "bidirectional",
      contract_summary: "Exchanges governed capability findings and change-impact signals between sibling models.",
      compatibility: ">=1.2.0 <2.0.0",
    },
    {
      id: "hs-dmm-opendia",
      label: "OpenDEA DERA-L1 Handshake",
      kind: "handshake",
      from_station_id: "enterprise-digital-maturity",
      to_station_id: "opendia-dera-l1",
      line_id: "reference-blueprint",
      direction: "unidirectional",
      contract_summary: "Crosswalks enterprise maturity profiles to OpenDEA L1 guardrails, patterns, and blueprints.",
      compatibility: "^2.4.0",
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
