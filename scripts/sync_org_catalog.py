#!/usr/bin/env python3
"""
Deterministic synchronization script for https://assessment-models.github.io/
Fetches public repositories from https://github.com/Assessment-Models/ and registered
ecosystem partners, enriches them with `assessment-manifest.json` if present,
validates against `schema/ecosystem-registry.schema.json`, and writes
`data/ecosystem-registry.json` (plus a deploy copy under `public/data/` for the
Vite-built bundle).

Touchpoint and handshake contracts are preserved across syncs: entries whose
endpoints still exist in the regenerated artifact catalog are carried over
from the previous registry (or seeded on first run), so the gateway metro map
retains its relationship edges while repository metadata stays live.
"""

import base64
import hashlib
import json
import os
import re
import sys
import time
import traceback
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional


def note(message: str) -> None:
    """Print a diagnostic line and mirror it into $GITHUB_STEP_SUMMARY when
    available, so CI failures are visible on the public run page without
    needing log access."""
    print(message)
    summary_path = os.environ.get("GITHUB_STEP_SUMMARY")
    if summary_path:
        try:
            with open(summary_path, "a", encoding="utf-8") as fh:
                fh.write(message + "\n")
        except OSError:
            pass

ORG_LOGIN = "Assessment-Models"
PAGES_URL = "https://assessment-models.github.io"
GITHUB_API = "https://api.github.com"

# Transient failures worth retrying with backoff (secondary rate limits,
# throttles, server hiccups). 404 stays a clean None; everything else
# eventually surfaces as a clear RuntimeError.
RETRYABLE_STATUS = {403, 408, 429, 500, 502, 503, 504}
MAX_RETRIES = 4

# Anonymized-access latch: set once the authenticated API starts rejecting the
# CI token, so we degrade every subsequent request to anonymous public access
# instead of failing the whole pipeline on identity problems.
_AUTH_DEGRADED = False

# Meta-repositories excluded from the domain artifact catalog
EXCLUDED_REPOS = {".github", "assessment-models.github.io"}

# Explicitly registered external partner repositories
PARTNER_REPOS = [
    {
        "full_name": "technehub-labs/dea-catalog-reference-architecture",
        "default_layer": "reference-blueprint",
        "default_concern": "Model Ecosystem Integration Architecture",
        "default_standards": ["OpenDEA", "DERA-L1", "Apache-2.0"],
    }
]

TOPIC_TO_LAYER = {
    "governance-standard": ("governance", "Organization Governance"),
    "maturity-model": ("maturity-model", "Maturity Model Architecture"),
    "assessment-capability": ("shared-capability", "Assessment Architecture"),
    "integration-contract": ("integration", "Model Ecosystem Integration Architecture"),
    "reference-blueprint": ("reference-blueprint", "Model Ecosystem Integration Architecture"),
}

# Repository-name fallback patterns (checked after topics, before the
# maturity-model default) so repositories without topics or manifests still
# land on the right corridor deterministically.
NAME_PATTERN_TO_LAYER = [
    (re.compile(r"blueprint|reference-architecture"), ("reference-blueprint", "Model Ecosystem Integration Architecture")),
    (re.compile(r"governance|policy|-standard"), ("governance", "Organization Governance")),
    (re.compile(r"integration|handshake|contract"), ("integration", "Model Ecosystem Integration Architecture")),
    (re.compile(r"assessment-|capability|component|evidence|registry|encyclopedia|scoring"), ("shared-capability", "Assessment Architecture")),
]

# Ecosystem relationship contracts (touchpoints & handshakes) used to seed the
# registry's architecture backbone. Endpoints use the artifact ids the sync
# derives from the real org repositories (id = lowercase repo name when a
# repository carries no root assessment-manifest.json). Curated contracts are
# merged (by id) with those already recorded in data/ecosystem-registry.json,
# then filtered so only contracts with live endpoints survive.
SEED_TOUCHPOINTS: List[Dict[str, Any]] = [
    {
        "id": "tp-standard-alignment",
        "label": "Standard Alignment Touchpoint",
        "kind": "touchpoint",
        "from_station_id": "maturity-model-digital-transformation",
        "to_station_id": "maturity-model-standard",
        "line_id": "governance",
        "contract_summary": "Binds model criteria, scoring, and repository structure to the normative maturity-model repository standard.",
        "compatibility": ">=1.0.0",
    },
    {
        "id": "tp-registry-integration",
        "label": "Registry Integration Touchpoint",
        "kind": "touchpoint",
        "from_station_id": "maturity-model-digital-transformation",
        "to_station_id": "assessment-registry",
        "line_id": "integration",
        "contract_summary": "Registers model metadata and assessment indexes in the ecosystem registry spine for cross-model discovery.",
        "compatibility": ">=1.0.0",
    },
    {
        "id": "tp-component-reuse",
        "label": "Shared Capability Touchpoint",
        "kind": "touchpoint",
        "from_station_id": "maturity-model-digital-transformation",
        "to_station_id": "maturity-components",
        "line_id": "shared-capability",
        "contract_summary": "Reuses governed maturity component packages for composite capability scoring across assessment dimensions.",
        "compatibility": ">=1.0.0",
    },
]

SEED_HANDSHAKES: List[Dict[str, Any]] = [
    {
        "id": "hs-operationalized-line",
        "label": "Operationalized Line Handshake",
        "kind": "handshake",
        "from_station_id": "maturity-model-digital-transformation",
        "to_station_id": "maturity-model-digital-transformation-operationalized",
        "line_id": "integration",
        "direction": "bidirectional",
        "contract_summary": "Exchanges composite model findings and operationalized assessment results between the digital transformation lines.",
        "compatibility": ">=1.0.0 <2.0.0",
    },
    {
        "id": "hs-opendea-crosswalk",
        "label": "OpenDEA DERA-L1 Handshake",
        "kind": "handshake",
        "from_station_id": "maturity-model-digital-transformation",
        "to_station_id": "dea-catalog-reference-architecture",
        "line_id": "reference-blueprint",
        "direction": "unidirectional",
        "contract_summary": "Crosswalks enterprise maturity profiles to OpenDEA DERA-L1 guardrails, patterns, and blueprints.",
        "compatibility": "^1.0.0",
    },
]


def github_get(path: str, token: Optional[str] = None) -> Any:
    """GET a GitHub API path with 404-as-None semantics and bounded retry
    with exponential backoff for transient failures (secondary rate limits,
    5xx, network timeouts). Rejects-with-prejudice auth failures (401/403 on
    a token-authenticated request) fall back to anonymous public access once,
    since every endpoint this script touches is public. Raises RuntimeError
    with full context when the request is ultimately unsatisfiable."""
    global _AUTH_DEGRADED
    url = path if path.startswith("http") else f"{GITHUB_API}{path}"
    base_headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "assessment-models-catalog-sync/1.0",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    last_error: Optional[BaseException] = None
    for attempt in range(MAX_RETRIES + 1):
        headers = dict(base_headers)
        if token and not _AUTH_DEGRADED:
            headers["Authorization"] = f"Bearer {token}"
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=25) as resp:
                payload = resp.read().decode("utf-8")
                if not payload.strip():
                    return None
                try:
                    return json.loads(payload)
                except json.JSONDecodeError as exc:
                    last_error = exc
                    note(f"[WARN] GitHub API returned malformed JSON for {path} ({exc}); retrying")
                    if attempt < MAX_RETRIES:
                        time.sleep(2 ** attempt * 2)
                        continue
                    break
        except urllib.error.HTTPError as exc:
            if exc.code == 404:
                return None
            if (
                token
                and exc.code in (401, 403)
                and not _AUTH_DEGRADED
            ):
                note(
                    f"[DIAG] Authenticated GitHub API request rejected with HTTP {exc.code} "
                    f"on {path}; degrading to anonymous public access for the rest of this run."
                )
                _AUTH_DEGRADED = True
                continue
            last_error = exc
            if exc.code in RETRYABLE_STATUS and attempt < MAX_RETRIES:
                wait = 2 ** attempt * 2
                note(
                    f"[WARN] GitHub API HTTP {exc.code} on {path}; "
                    f"retrying in {wait}s (attempt {attempt + 1}/{MAX_RETRIES})"
                )
                time.sleep(wait)
                continue
            break
        except (urllib.error.URLError, TimeoutError, OSError) as exc:
            last_error = exc
            if attempt < MAX_RETRIES:
                wait = 2 ** attempt * 2
                note(
                    f"[WARN] Network error on {path} ({exc}); "
                    f"retrying in {wait}s (attempt {attempt + 1}/{MAX_RETRIES})"
                )
                time.sleep(wait)
                continue
            break

    raise RuntimeError(f"GitHub API request failed after retries: {path} ({last_error!r})")


def fetch_repo_file_text(full_name: str, filepath: str, token: Optional[str]) -> Optional[str]:
    payload = github_get(f"/repos/{full_name}/contents/{filepath}", token)
    if not payload or "content" not in payload:
        return None
    try:
        raw = base64.b64decode(payload["content"]).decode("utf-8", errors="replace")
    except (ValueError, TypeError) as exc:
        note(f"[WARN] Could not decode {full_name}/{filepath} ({exc}); ignoring file.")
        return None
    return raw


def safe_fetch_repo_file_text(full_name: str, filepath: str, token: Optional[str]) -> Optional[str]:
    """Fetch an optional enrichment file; degrade to None on persistent API failure."""
    try:
        return fetch_repo_file_text(full_name, filepath, token)
    except RuntimeError as exc:
        note(f"[WARN] Could not fetch {full_name}/{filepath} ({exc}); falling back to repo metadata.")
        return None


def fetch_latest_version(full_name: str, token: Optional[str]) -> str:
    try:
        release = github_get(f"/repos/{full_name}/releases/latest", token)
        if release and release.get("tag_name"):
            return release["tag_name"]
        tags = github_get(f"/repos/{full_name}/tags?per_page=1", token)
        if isinstance(tags, list) and tags:
            return tags[0].get("name", "v0.1.0-draft")
    except RuntimeError as exc:
        note(f"[WARN] Could not fetch version for {full_name} ({exc}); using draft default.")
    return "v0.1.0-draft"


def extract_readme_excerpt(readme_md: Optional[str], max_len: int = 280) -> str:
    if not readme_md:
        return ""
    lines = []
    for line in readme_md.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith(("#", "!", "[", "|", "```", "---", "<")):
            continue
        cleaned = re.sub(r"[`*_]", "", stripped)
        lines.append(cleaned)
        if len(" ".join(lines)) >= max_len:
            break
    excerpt = " ".join(lines).strip()
    if len(excerpt) > max_len:
        excerpt = excerpt[: max_len - 1].rsplit(" ", 1)[0] + "…"
    return excerpt


def infer_layer_and_concern(topics: List[str], fallback_layer: str, fallback_concern: str, repo_name: str = ""):
    for topic in topics:
        if topic in TOPIC_TO_LAYER:
            return TOPIC_TO_LAYER[topic]
    lowered = (repo_name or "").lower()
    if lowered:
        for pattern, mapping in NAME_PATTERN_TO_LAYER:
            if pattern.search(lowered):
                return mapping
    return fallback_layer, fallback_concern


def extract_readme_dimensions(readme_md: Optional[str], max_items: int = 12) -> List[str]:
    """Fallback dimension discovery for repositories without a manifest:
    parse bullet/numbered items listed under H2/H3 headings such as
    'Dimensions', 'Maturity Levels', 'Capabilities' or 'Domains'."""
    if not readme_md:
        return []
    dims: List[str] = []
    in_section = False
    section_pat = re.compile(r"^#{2,3}\s*(dimensions|maturity levels|levels|capabilities|domains)\s*$", re.I)
    any_heading_pat = re.compile(r"^#{1,3}\s")
    bullet_pat = re.compile(r"^\s*(?:[-*+]|\d+[.)])\s+(.{2,60})$")
    for line in readme_md.splitlines():
        if section_pat.match(line):
            in_section = True
            continue
        if in_section:
            if any_heading_pat.match(line):
                in_section = False
                continue
            match = bullet_pat.match(line)
            if match:
                item = re.sub(r"[*_`]", "", match.group(1)).strip()
                if item and item.lower() not in {d.lower() for d in dims}:
                    dims.append(item)
            if len(dims) >= max_items:
                break
    return dims


def build_artifact_entry(
    repo: Dict[str, Any],
    owner_type: str,
    token: Optional[str],
    defaults: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    defaults = defaults or {}
    full_name = repo["full_name"]
    topics = sorted(repo.get("topics") or [])

    manifest_raw = safe_fetch_repo_file_text(full_name, "assessment-manifest.json", token)
    manifest: Dict[str, Any] = {}
    has_manifest = False
    if manifest_raw:
        try:
            parsed = json.loads(manifest_raw)
            if isinstance(parsed, dict):
                manifest = parsed
                has_manifest = True
            else:
                note(f"[WARN] assessment-manifest.json in {full_name} is not a JSON object; falling back to repo metadata.")
        except json.JSONDecodeError:
            note(f"[WARN] Invalid JSON in {full_name}/assessment-manifest.json; falling back to repo metadata.")

    readme_raw = safe_fetch_repo_file_text(full_name, "README.md", token)
    version = manifest.get("version") or fetch_latest_version(full_name, token)

    inferred_layer, inferred_concern = infer_layer_and_concern(
        topics,
        defaults.get("default_layer", "maturity-model"),
        defaults.get("default_concern", "Maturity Model Architecture"),
        repo["name"],
    )

    license_obj = repo.get("license") or {}
    license_spdx = manifest.get("license") or license_obj.get("spdx_id") or "Apache-2.0"

    conformance = manifest.get("conformance_status")
    if not conformance:
        if owner_type == "partner-ecosystem":
            conformance = "external-aligned"
        elif has_manifest:
            conformance = "verified"
        else:
            conformance = "draft"

    return {
        "id": manifest.get("id") or repo["name"].lower(),
        "name": manifest.get("title") or repo["name"],
        "full_name": full_name,
        "owner_type": owner_type,
        "layer": manifest.get("layer") or inferred_layer,
        "architectural_concern": manifest.get("architectural_concern") or inferred_concern,
        "description": manifest.get("description")
        or repo.get("description")
        or "Governed enterprise assessment artifact.",
        "readme_excerpt": extract_readme_excerpt(readme_raw),
        "html_url": repo["html_url"],
        "default_branch": repo.get("default_branch", "main"),
        "version": version,
        "license": license_spdx,
        "primary_language": repo.get("language") or "Markdown / YAML",
        "topics": topics,
        "standards_alignment": sorted(
            set(manifest.get("standards_alignment") or defaults.get("default_standards") or ["MECE-STRICT"])
        ),
        "locales": manifest.get("locales") or ["en"],
        "dimensions": manifest.get("dimensions") or (extract_readme_dimensions(readme_raw) if not has_manifest else []),
        "conformance_status": conformance,
        "has_manifest": has_manifest,
        "updated_at": repo.get("pushed_at") or repo.get("updated_at") or datetime.now(timezone.utc).isoformat(),
    }


def load_previous_contracts(existing_path: Path) -> (List[Dict[str, Any]], List[Dict[str, Any]]):
    """Read touchpoints & handshakes from the previous registry, if present."""
    try:
        existing = json.loads(existing_path.read_text(encoding="utf-8"))
    except FileNotFoundError:
        return [], []
    except (json.JSONDecodeError, OSError) as exc:
        note(f"[WARN] Could not read previous registry for contracts: {exc}")
        return [], []
    touchpoints = existing.get("touchpoints") if isinstance(existing, dict) else None
    handshakes = existing.get("handshakes") if isinstance(existing, dict) else None
    return (
        touchpoints if isinstance(touchpoints, list) else [],
        handshakes if isinstance(handshakes, list) else [],
    )


def merge_contracts(
    seed: List[Dict[str, Any]], previous: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """Merge curated seed contracts with previously recorded ones, by id.

    Curated seed contracts always participate in the merge (they describe the
    ecosystem's architecture backbone), while contracts recorded in a previous
    sync are preserved and win on id conflicts (so curated edits stick).
    """
    merged: Dict[str, Dict[str, Any]] = {}
    for c in seed + previous:
        if isinstance(c, dict) and c.get("id"):
            merged[c["id"]] = c
    return list(merged.values())


def filter_contracts(
    contracts: List[Dict[str, Any]], known_ids: set
) -> List[Dict[str, Any]]:
    """Keep only contracts whose endpoints exist in the current artifact catalog."""
    kept = []
    for c in contracts:
        if not isinstance(c, dict):
            continue
        if c.get("from_station_id") in known_ids and c.get("to_station_id") in known_ids:
            kept.append(c)
    return kept


def discover_org_repositories(token: Optional[str]) -> List[Dict[str, Any]]:
    """Discover the cardinal organization's public repositories.

    Tries, in order, the org listing endpoint, the user-account listing
    endpoint (works for both account types), and finally the repository
    search API. Routes that fail hard are recorded and reported; the first
    route that yields repositories wins. Results are deduplicated by
    full_name so switching routes mid-page never double-counts.
    """
    routes = [
        (
            "org repos listing",
            f"/orgs/{ORG_LOGIN}/repos?type=public&per_page=100&page={{page}}&sort=full_name",
        ),
        (
            "user repos listing",
            f"/users/{ORG_LOGIN}/repos?per_page=100&page={{page}}&sort=full_name",
        ),
    ]
    errors: List[str] = []
    for label, template in routes:
        repos: List[Dict[str, Any]] = []
        page = 1
        while page <= 20:  # hard cap: 20 x 100 = 2000 repos
            try:
                batch = github_get(template.format(page=page), token)
            except RuntimeError as exc:
                errors.append(f"{label}: {exc}")
                break
            if not isinstance(batch, list) or not batch:
                break
            repos.extend(batch)
            if len(batch) < 100:
                break
            page += 1
        if repos:
            if errors:
                note("[DIAG] Earlier discovery routes failed:")
                for err in errors:
                    note(f"[DIAG]   - {err}")
            note(f"[DIAG] Discovery route '{label}' returned {len(repos)} repositories.")
            return repos
        if page > 1:
            errors.append(f"{label}: paginated out at page {page} with zero rows")

    # Last resort: the search API (its route + rate pool differ from the
    # listings above, so it survives endpoint-level outages).
    try:
        result = github_get(
            f"/search/repositories?q=org%3A{ORG_LOGIN}+archived%3Afalse&per_page=100&page=1",
            token,
        )
        items = result.get("items") if isinstance(result, dict) else None
        if isinstance(items, list) and items:
            note(f"[DIAG] Discovery route 'search API' returned {len(items)} repositories.")
            return items
        if result is not None:
            total = result.get("total_count") if isinstance(result, dict) else "?"
            errors.append(f"search API: total_count={total}, no items returned")
    except RuntimeError as exc:
        errors.append(f"search API: {exc}")

    note("[ERROR] All repository discovery routes failed:")
    for err in errors:
        note(f"[ERROR]   - {err}")
    return []


def main() -> int:
    token = os.environ.get("GITHUB_TOKEN")
    note(f"[DIAG] sync_org_catalog starting: python={sys.version.split()[0]} "
         f"org={ORG_LOGIN} token_present={bool(token)} auth_degraded={_AUTH_DEGRADED}")
    root_dir = Path(__file__).resolve().parents[1]
    output_path = root_dir / "data" / "ecosystem-registry.json"
    public_output_path = root_dir / "public" / "data" / "ecosystem-registry.json"
    schema_path = root_dir / "schema" / "ecosystem-registry.schema.json"

    artifacts: List[Dict[str, Any]] = []

    # 1. Fetch cardinal organization repositories (multi-route, paginated)
    org_repos = discover_org_repositories(token)
    if not org_repos:
        note("[ERROR] Organization repository discovery returned nothing.")
        note("Not writing any registry output; keeping the previous catalog intact.")
        return 1
    # Dedupe across routes/pages and drop meta repos and forks
    deduped: Dict[str, Dict[str, Any]] = {}
    for repo in org_repos:
        if isinstance(repo, dict) and repo.get("full_name"):
            deduped[repo["full_name"]] = repo
    for repo in sorted(deduped.values(), key=lambda r: r["name"].lower()):
        if repo.get("archived") or repo.get("fork") or repo["name"] in EXCLUDED_REPOS:
            continue
        artifacts.append(build_artifact_entry(repo, "cardinal-org", token))

    # 2. Fetch registered partner repositories (a missing/inaccessible
    #    partner degrades to a warning instead of failing the whole sync).
    #    Partner fetches run WITHOUT the CI token: the Actions GITHUB_TOKEN is
    #    repository-scoped and is rejected (HTTP 401) by the contents API of
    #    repositories owned by other accounts; every partner datum we need is
    #    public, so anonymous access is both sufficient and reliable.
    for partner in PARTNER_REPOS:
        try:
            repo = github_get(f"/repos/{partner['full_name']}", None)
        except RuntimeError as exc:
            note(f"[WARN] Skipping partner {partner['full_name']}: {exc}")
            continue
        if repo:
            artifacts.append(build_artifact_entry(repo, "partner-ecosystem", partner, None))

    # 3. Preserve touchpoint & handshake contracts (previous registry → seed)
    known_ids = {item["id"] for item in artifacts}
    prev_touchpoints, prev_handshakes = load_previous_contracts(output_path)
    touchpoints = filter_contracts(merge_contracts(SEED_TOUCHPOINTS, prev_touchpoints), known_ids)
    handshakes = filter_contracts(merge_contracts(SEED_HANDSHAKES, prev_handshakes), known_ids)

    # 4. Compute deterministic summary & SHA-256 hash
    by_layer = {
        "governance": 0,
        "maturity-model": 0,
        "assessment-model": 0,
        "shared-capability": 0,
        "integration": 0,
        "reference-blueprint": 0,
    }
    standards_set = set()
    for item in artifacts:
        by_layer[item["layer"]] = by_layer.get(item["layer"], 0) + 1
        standards_set.update(item["standards_alignment"])

    canonical_bytes = json.dumps(artifacts, sort_keys=True, separators=(",", ":")).encode("utf-8")
    content_sha256 = hashlib.sha256(canonical_bytes).hexdigest()

    registry = {
        "schema_version": "1.0.0",
        "organization": {
            "login": ORG_LOGIN,
            "url": f"https://github.com/{ORG_LOGIN}",
            "pages_url": PAGES_URL,
        },
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "content_sha256": content_sha256,
        "summary": {
            "total_artifacts": len(artifacts),
            "by_layer": by_layer,
            "standards": sorted(standards_set),
        },
        "artifacts": artifacts,
        "touchpoints": touchpoints,
        "handshakes": handshakes,
    }

    # ---- Safety guards: never publish a suspicious catalog ----
    if not artifacts:
        note(
            "[ERROR] Zero artifacts discovered (org lookup empty or failed). "
            "Refusing to overwrite the published registry; check GITHUB_TOKEN "
            "permissions and org API access."
        )
        return 1
    try:
        previous_registry = json.loads(output_path.read_text(encoding="utf-8"))
        previous_total = int(previous_registry.get("summary", {}).get("total_artifacts") or 0)
    except (FileNotFoundError, json.JSONDecodeError, OSError, ValueError):
        previous_total = 0
    if previous_total and len(artifacts) * 2 < previous_total:
        note(
            f"[ERROR] Coverage collapse guard: discovered {len(artifacts)} artifacts "
            f"but the published registry holds {previous_total}. Refusing to publish "
            "a drastically smaller catalog — investigate org visibility/filters first."
        )
        return 1

    # Optional JSON Schema validation if jsonschema is installed
    try:
        import jsonschema  # type: ignore
    except ImportError:
        note("[INFO] jsonschema not installed; skipped schema validation.")
    else:
        try:
            schema = json.loads(schema_path.read_text(encoding="utf-8"))
            jsonschema.validate(instance=registry, schema=schema)
            note("[OK] Registry validated against ecosystem-registry.schema.json")
        except jsonschema.ValidationError as exc:
            note(f"[ERROR] Registry schema validation failed: {exc.message}")
            note(f"[ERROR] Offending item at: {'/'.join(str(p) for p in exc.absolute_path)}")
            return 1

    rendered = json.dumps(registry, indent=2) + "\n"
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(rendered, encoding="utf-8")
    # Deploy copy for the Vite-built bundle (public/ is served at the site root)
    public_output_path.parent.mkdir(parents=True, exist_ok=True)
    public_output_path.write_text(rendered, encoding="utf-8")
    note(
        f"[OK] Wrote {len(artifacts)} artifacts, {len(touchpoints)} touchpoints, "
        f"{len(handshakes)} handshakes to {output_path} (sha256={content_sha256[:12]}...)"
    )

    # 5. Coverage summary: make every discovered repository + its provenance
    #    visible in the workflow output so unmanifested drafts are easy to spot
    contract_endpoint_ids = {
        ep
        for contracts in (touchpoints, handshakes)
        for c in contracts
        for ep in (c.get("from_station_id"), c.get("to_station_id"))
    }
    unmanifested = [a for a in artifacts if not a.get("has_manifest")]
    unlinked = [a for a in artifacts if a["id"] not in contract_endpoint_ids]
    print("\n[COVERAGE] Discovered repositories:")
    for item in artifacts:
        manifest_flag = "manifest" if item.get("has_manifest") else "NO-MANIFEST"
        print(
            f"  - {item['full_name']:<58} layer={item['layer']:<20} "
            f"version={item['version']:<14} {manifest_flag} ({item['conformance_status']})"
        )
    print(
        f"[COVERAGE] {len(artifacts)} artifacts total • {len(unmanifested)} without "
        f"assessment-manifest.json • {len(unlinked)} without touchpoint/handshake contracts"
    )
    for item in unmanifested:
        print(f"[COVERAGE]   needs manifest: {item['full_name']}")
    for item in unlinked:
        print(f"[COVERAGE]   needs contracts: {item['full_name']}")
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except SystemExit:
        raise
    except BaseException:
        # Unexpected crash: mirror the traceback into the job step summary so
        # the failure is diagnosable from the public run page (logs need
        # sign-in), then re-raise so the step still fails loudly.
        note("## sync_org_catalog.py crashed — traceback")
        note("```")
        for line in traceback.format_exc().splitlines():
            note(line)
        note("```")
        raise
