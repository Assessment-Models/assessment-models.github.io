/** Shared types — build-time index (models.json) and runtime model structures. */

// ---------- build-time index ----------

export type NodeGroup =
  | 'maturity-models'
  | 'assessment-models'
  | 'assessment-tools'
  | 'components'
  | 'infrastructure'
  | 'external';

export interface IndexNode {
  id: string;
  name: string;
  description: string;
  group: NodeGroup;
  /** GitHub repository (org/name) backing this node, if any */
  repo?: string;
  version?: string;
  status?: string;
  /** registered contract handshake, e.g. "maturity-scale-contract@1.0" */
  contract?: string;
  /** ids of maturity-components packages imported by this asset */
  components?: string[];
  /** repository-standard adoption (joined from conformance.yaml) */
  classification?: string;
  conformance?: string;
  standardVersion?: string;
  /** portfolio conformance phase2 assessment (identity / result summary) */
  phase2?: {
    identity?: string;
    assessed?: string;
    result?: string;
  };
  external?: boolean;
}

export type EdgeKind = 'imports' | 'shared-components' | 'contract' | 'touchpoint';

export interface IndexEdge {
  source: string; // node id
  target: string; // node id
  kind: EdgeKind;
}

export interface IndexManifest {
  generated: string;
  org: string;
  site: string;
  nodes: IndexNode[];
  edges: IndexEdge[];
}

// ---------- runtime model structures (parsed YAML) ----------

export interface ModelMeta {
  id?: string;
  name?: string;
  version?: string;
  description?: string;
  status?: string;
  scale?: { id?: string; version?: string };
  scoring?: {
    mechanism?: string;
    domain?: { kind?: string; minimum?: number; maximum?: number };
    aggregation_rule?: string;
    effort_adjusted_value?: {
      formula?: string;
      intervals?: { upper_boundary: number; effort_multiplier: number }[];
      [k: string]: unknown;
    };
  };
  criteria?: MetaCriterion[];
  [k: string]: unknown;
}

export interface MetaCriterion {
  id: string;
  name?: string;
  description?: string;
  weight?: number;
  mandatory?: boolean;
  evidence_requirements?: string[];
  level_expectations?: { level: string; expectation: string }[];
}

export interface ScaleLevel {
  id: string; // "L-0".."L-4"
  ordinal: number;
  name?: string;
  v2_name?: string;
  value_name?: string;
  v2_band?: string;
  v2_score_range?: [number, number];
  definition?: string;
  short_description?: string;
  characteristics?: string[];
  exit_criteria?: string[];
  evidence?: string[];
  unlocks?: string[];
}

export interface Scale {
  id?: string;
  version?: string;
  name?: string;
  levels?: ScaleLevel[];
  progression?: { effort_multiplier?: Record<string, number> } & Record<string, unknown>;
  conformance?: { statuses?: string[] } & Record<string, unknown>;
  [k: string]: unknown;
}

/** One scored criterion inside a sub-dimension (operationalized line). */
export interface OpCriterion {
  id: string;
  name: string;
  statement?: string;
  levers?: string[];
  anchors?: { level: number; text: string }[];
  evidence?: string[];
  /** weakest-link spine criterion (AO 4.1.1–4.1.4): org level cannot exceed its level */
  gating?: boolean;
  gating_note?: string;
}

export interface OpSubDimension {
  id: string;
  name: string;
  lite_question?: string;
  criteria: OpCriterion[];
}

export interface OpDimension {
  id: string;
  dimension?: string;
  name: string;
  weight: number;
  mandatory?: boolean;
  description?: string;
  sub_dimensions: OpSubDimension[];
}

/** Single-file criteria register (e.g. maturity-model-digital-transformation-operationalized). */
export interface CriteriaRegister {
  id?: string;
  name?: string;
  version?: string;
  description?: string;
  status?: string;
  scoring?: { mechanism?: string } & Record<string, unknown>;
  /** dimensions → sub-dimensions → criteria */
  dimensions?: OpDimension[];
  [k: string]: unknown;
}

export interface RepoManifestInfo {
  model: Record<string, unknown> | null;
  manifest: Record<string, unknown> | null;
  touchpoints: Record<string, unknown> | null;
  standard: Record<string, unknown> | null;
}

// ---------- resolved structure for the drill-down / trial ----------

export interface ModelStructure {
  repo: string;
  meta: ModelMeta;
  /** composite line: evaluation over top-level criteria (0-100) */
  composite: {
    evaluation: ModelMeta | null;
    scale: Scale | null;
    componentFiles: { id: string; data: ModelMeta | null }[];
  };
  /** operationalized line, when the repo ships one */
  operationalized: {
    evaluation: ModelMeta;
    scale: Scale;
    dimensions: OpDimension[];
  } | null;
}
