#!/usr/bin/env python3
"""
Deterministic synchronization script for https://assessment-models.github.io/
Fetches public repositories from https://github.com/Assessment-Models/ and registered
ecosystem partners, enriches them with `assessment-manifest.json` if present,
validates against `schema/ecosystem-registry.schema.json`, and writes
`data/ecosystem-registry.json`.
"""

import base64
import hashlib
import json
import os
import re
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional

ORG_LOGIN = "Assessment-Models"
PAGES_URL = "https://assessment-models.github.io"
GITHUB_API = "https://api.github.com"

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


def github_get(path: str, token: Optional[str] = None) -> Any:
    url = path if path.startswith("http") else f"{GITHUB_API}{path}"
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "assessment-models-catalog-sync/1.0",
        "X-GitHub-Api-Version": "2022-11-28",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    req = urllib.request.Request(url, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return None
        raise


def fetch_repo_file_text(full_name: str, filepath: str, token: Optional[str]) -> Optional[str]:
    payload = github_get(f"/repos/{full_name}/contents/{filepath}", token)
    if not payload or "content" not in payload:
        return None
    raw = base64.b64decode(payload["content"]).decode("utf-8", errors="replace")
    return raw


def fetch_latest_version(full_name: str, token: Optional[str]) -> str:
    release = github_get(f"/repos/{full_name}/releases/latest", token)
    if release and release.get("tag_name"):
        return release["tag_name"]
    tags = github_get(f"/repos/{full_name}/tags?per_page=1", token)
    if isinstance(tags, list) and tags:
        return tags[0].get("name", "v0.1.0-draft")
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


def infer_layer_and_concern(topics: List[str], fallback_layer: str, fallback_concern: str):
    for topic in topics:
        if topic in TOPIC_TO_LAYER:
            return TOPIC_TO_LAYER[topic]
    return fallback_layer, fallback_concern


def build_artifact_entry(
    repo: Dict[str, Any],
    owner_type: str,
    token: Optional[str],
    defaults: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    defaults = defaults or {}
    full_name = repo["full_name"]
    topics = sorted(repo.get("topics") or [])

    manifest_raw = fetch_repo_file_text(full_name, "assessment-manifest.json", token)
    manifest: Dict[str, Any] = {}
    has_manifest = False
    if manifest_raw:
        try:
            manifest = json.loads(manifest_raw)
            has_manifest = True
        except json.JSONDecodeError:
            print(f"[WARN] Invalid JSON in {full_name}/assessment-manifest.json; falling back to repo metadata.")

    readme_raw = fetch_repo_file_text(full_name, "README.md", token)
    version = manifest.get("version") or fetch_latest_version(full_name, token)

    inferred_layer, inferred_concern = infer_layer_and_concern(
        topics,
        defaults.get("default_layer", "maturity-model"),
        defaults.get("default_concern", "Maturity Model Architecture"),
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
        "dimensions": manifest.get("dimensions") or [],
        "conformance_status": conformance,
        "has_manifest": has_manifest,
        "updated_at": repo.get("pushed_at") or repo.get("updated_at") or datetime.now(timezone.utc).isoformat(),
    }


def main() -> int:
    token = os.environ.get("GITHUB_TOKEN")
    root_dir = Path(__file__).resolve().parents[1]
    output_path = root_dir / "data" / "ecosystem-registry.json"
    schema_path = root_dir / "schema" / "ecosystem-registry.schema.json"

    artifacts: List[Dict[str, Any]] = []

    # 1. Fetch cardinal organization repositories
    org_repos = github_get(f"/orgs/{ORG_LOGIN}/repos?type=public&per_page=100&sort=updated", token) or []
    for repo in sorted(org_repos, key=lambda r: r["name"].lower()):
        if repo.get("archived") or repo["name"] in EXCLUDED_REPOS:
            continue
        artifacts.append(build_artifact_entry(repo, "cardinal-org", token))

    # 2. Fetch registered partner repositories
    for partner in PARTNER_REPOS:
        repo = github_get(f"/repos/{partner['full_name']}", token)
        if repo:
            artifacts.append(build_artifact_entry(repo, "partner-ecosystem", token, partner))

    # 3. Compute deterministic summary & SHA-256 hash
    by_layer = {
        "governance": 0,
        "maturity-model": 0,
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
            "url": f"[https://github.com/](https://github.com/){ORG_LOGIN}",
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
    }

    # Optional JSON Schema validation if jsonschema is installed
    try:
        import jsonschema  # type: ignore

        schema = json.loads(schema_path.read_text(encoding="utf-8"))
        jsonschema.validate(instance=registry, schema=schema)
        print("[OK] Registry validated against ecosystem-registry.schema.json")
    except ImportError:
        print("[INFO] jsonschema not installed; skipped schema validation.")

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(registry, indent=2) + "\n", encoding="utf-8")
    print(f"[OK] Wrote {len(artifacts)} artifacts to {output_path} (sha256={content_sha256[:12]}...)")
    return 0


if __name__ == "__main__":
    sys.exit(main())