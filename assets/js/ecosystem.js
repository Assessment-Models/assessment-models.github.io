(() => {
  const SPEC_TABS = {
    manifest: {
      filename: "assessment-manifest.json",
      note: "Every model owns its domain semantics and scoring logic while declaring standardized metadata for registry discovery and cross-model touchpoints.",
      code: JSON.stringify(
        {
          org: "Assessment-Models",
          principle: "model-independence-with-interoperability",
          architectural_concern: "Maturity Model Architecture",
          layer: "maturity-model",
          version: "v2.4.0",
          locales: ["en", "fr", "de"],
          crosswalk: ["OpenDEA", "ISO/IEC-33001"],
          scoring: "deterministic-weighted-rubric",
        },
        null,
        2
      ),
    },
    handshake: {
      filename: "handshake-contract.json",
      note: "Explicit inter-model contracts define touchpoints, semantic mappings, and version compatibility rules without coupling internal rubrics.",
      code: JSON.stringify(
        {
          contract_type: "inter-model-handshake",
          source_model: "org.assessment-models.operations-maturity",
          target_model: "org.assessment-models.ai-governance-maturity",
          touchpoints: ["capability-overlap", "evidence-reuse"],
          compatibility: ">=1.2.0 <2.0.0",
        },
        null,
        2
      ),
    },
    evidence: {
      filename: "evidence-binding.json",
      note: "Evidence items are collected, validated, and mapped to criteria indicators with immutable provenance before deterministic scoring runs.",
      code: JSON.stringify(
        {
          evidence_id: "EVD-2026-089",
          criterion_ref: "DIM-03.CRIT-04",
          validation_status: "verified",
          sha256: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08",
          applied_to_determination: true,
        },
        null,
        2
      ),
    },
  };

  const ECOSYSTEM_LAYERS = {
    governance: {
      badge: "LAYER 01 • ORGANIZATION-LEVEL GOVERNANCE",
      heading: "Organization-Level Governance",
      flow: "Governs standards, central registry, conformance & lifecycle rules",
      summary:
        "Sets ecosystem-wide standards, registry policies, conformance gates, and lifecycle rules so models can evolve independently while remaining interoperable.",
      nodes: [
        "Maturity Model Standard",
        "Assessment Registry",
        "Conformance & Integration Governance",
        "Policies & Lifecycle Governance",
      ],
    },
    models: {
      badge: "LAYER 02 • INDEPENDENTLY GOVERNED MODELS",
      heading: "Independently Governed Maturity Models",
      flow: "Own domain semantics, dimensions, levels, instruments & scoring",
      summary:
        "Each maturity model is independently versioned and maintained around its specific domain, criteria, progression levels, assessment methodology, and rubrics.",
      nodes: [
        "Maturity Model A",
        "Maturity Model B",
        "Maturity Model C",
        "Maturity Model N",
      ],
    },
    capabilities: {
      badge: "LAYER 03 • SHARED ASSESSMENT CAPABILITIES",
      heading: "Shared Assessment Capabilities",
      flow: "Reusable operational services across models & locales",
      summary:
        "Reusable capabilities that operationalize assessments—covering execution, evidence handling, deterministic scoring, knowledge resources, localization, and reporting.",
      nodes: [
        "Assessment Execution",
        "Evidence Management",
        "Scoring & Determination",
        "Model Encyclopedia",
        "Localization",
        "Analytics & Reporting",
      ],
    },
    integration: {
      badge: "LAYER 04 • INTER-MODEL INTEGRATION",
      heading: "Inter-Model Integration",
      flow: "Connects registries, touchpoints, handshakes & impact analysis",
      summary:
        "Coordinates relationships, semantic touchpoints, evidence exchange, handshake contracts, and compatibility impact across connected models in the portfolio.",
      nodes: [
        "Relationship Registry",
        "Touchpoint & Mapping Contracts",
        "Handshake Contracts",
        "Compatibility & Impact Analysis",
      ],
    },
  };

  // 1. Accessible Animated Tooltip System
  const tooltipEl = document.getElementById("live-tooltip");
  let activeTrigger = null;

  function positionTooltip(trigger) {
    if (!tooltipEl || !trigger) return;
    const rect = trigger.getBoundingClientRect();
    const tipRect = tooltipEl.getBoundingClientRect();
    const pad = 10;

    let left = rect.left + rect.width / 2 - tipRect.width / 2;
    left = Math.max(pad, Math.min(left, window.innerWidth - tipRect.width - pad));

    let top = rect.top - tipRect.height - 8;
    if (top < pad) {
      top = rect.bottom + 8;
    }

    tooltipEl.style.left = `${Math.round(left)}px`;
    tooltipEl.style.top = `${Math.round(top)}px`;
  }

  function showTooltip(trigger) {
    const text = trigger.getAttribute("data-tooltip");
    if (!text || !tooltipEl) return;
    activeTrigger = trigger;
    tooltipEl.textContent = text;
    tooltipEl.setAttribute("aria-hidden", "false");
    tooltipEl.classList.add("is-visible");
    positionTooltip(trigger);
  }

  function hideTooltip() {
    if (!tooltipEl) return;
    activeTrigger = null;
    tooltipEl.classList.remove("is-visible");
    tooltipEl.setAttribute("aria-hidden", "true");
  }

  document.querySelectorAll("[data-tooltip]").forEach((el) => {
    el.addEventListener("mouseenter", () => showTooltip(el));
    el.addEventListener("mouseleave", hideTooltip);
    el.addEventListener("focus", () => showTooltip(el));
    el.addEventListener("blur", hideTooltip);
  });

  window.addEventListener("scroll", () => {
    if (activeTrigger) positionTooltip(activeTrigger);
  }, { passive: true });

  window.addEventListener("resize", () => {
    if (activeTrigger) positionTooltip(activeTrigger);
  });

  // 2. Hero Specification Tabs & Copy Button
  const tabButtons = document.querySelectorAll("[data-spec-tab]");
  const codeBlock = document.getElementById("spec-code-block");
  const filenameEl = document.getElementById("spec-filename");
  const noteEl = document.getElementById("spec-note");
  const copyBtn = document.getElementById("copy-spec-btn");

  tabButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.getAttribute("data-spec-tab");
      const spec = SPEC_TABS[key];
      if (!spec) return;

      tabButtons.forEach((b) => {
        const selected = b === btn;
        b.classList.toggle("is-active", selected);
        b.setAttribute("aria-selected", String(selected));
      });

      if (filenameEl) filenameEl.textContent = spec.filename;
      if (noteEl) noteEl.textContent = spec.note;
      if (codeBlock) {
        const codeNode = codeBlock.querySelector("code") || codeBlock;
        codeNode.textContent = spec.code;
      }
    });
  });

  if (copyBtn && codeBlock) {
    copyBtn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(codeBlock.textContent || "");
        const prev = copyBtn.textContent;
        copyBtn.textContent = "Copied ✓";
        setTimeout(() => {
          copyBtn.textContent = prev;
        }, 1600);
      } catch {
        copyBtn.textContent = "Select manually";
      }
    });
  }

  // 3. Four-Layer Architecture Explorer
  const layerPills = document.querySelectorAll("[data-layer-key]");
  const layerBadge = document.getElementById("layer-badge");
  const layerHeading = document.getElementById("layer-heading");
  const layerFlow = document.getElementById("layer-flow");
  const layerSummary = document.getElementById("layer-summary");
  const layerNodes = document.getElementById("layer-nodes");

  function renderLayer(key) {
    const data = ECOSYSTEM_LAYERS[key];
    if (!data) return;

    layerPills.forEach((pill) => {
      pill.classList.toggle("is-active", pill.getAttribute("data-layer-key") === key);
    });

    if (layerBadge) layerBadge.textContent = data.badge;
    if (layerHeading) layerHeading.textContent = data.heading;
    if (layerFlow) layerFlow.textContent = data.flow;
    if (layerSummary) layerSummary.textContent = data.summary;
    if (layerNodes) {
      layerNodes.innerHTML = data.nodes
        .map((node) => `<div class="node-chip">${node}</div>`)
        .join("");
    }
  }

  layerPills.forEach((pill) => {
    pill.addEventListener("click", () => {
      const key = pill.getAttribute("data-layer-key");
      if (key) renderLayer(key);
    });
  });

  renderLayer("governance");

  // 5. Header Scroll Cue & Active Section Tracking
  const header = document.querySelector("[data-elevate-on-scroll]");
  const navLinks = Array.from(document.querySelectorAll("[data-nav-link]"));
  const sections = navLinks
    .map((link) => {
      const href = link.getAttribute("href");
      return href && href.startsWith("#") ? document.querySelector(href) : null;
    })
    .filter(Boolean);

  function updateScrollState() {
    if (header) {
      header.classList.toggle("is-elevated", window.scrollY > 12);
    }
    const scrollPos = window.scrollY + 130;
    let currentId = "";
    for (const sec of sections) {
      if (sec.offsetTop <= scrollPos) {
        currentId = `#${sec.id}`;
      }
    }
    navLinks.forEach((link) => {
      link.classList.toggle("is-active", link.getAttribute("href") === currentId);
    });
  }

  window.addEventListener("scroll", updateScrollState, { passive: true });
  updateScrollState();

  // 6. Charter Modal with Escape & Focus Return
  const modal = document.getElementById("charter-modal");
  const openBtn = document.getElementById("open-charter-btn");
  const footerOpenBtn = document.getElementById("footer-charter-btn");
  const closeBtn = document.getElementById("close-charter-btn");
  let lastFocused = null;

  function openModal() {
    if (!modal) return;
    lastFocused = document.activeElement;
    modal.hidden = false;
    closeBtn?.focus();
  }

  function closeModal() {
    if (!modal) return;
    modal.hidden = true;
    if (lastFocused && typeof lastFocused.focus === "function") {
      lastFocused.focus();
    }
  }

  openBtn?.addEventListener("click", openModal);
  footerOpenBtn?.addEventListener("click", openModal);
  closeBtn?.addEventListener("click", closeModal);

  modal?.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hideTooltip();
      if (modal && !modal.hidden) closeModal();
    }
  });

  // 7. Phase 3: Filterable Registry Catalog & Slide-Over Inspector Drawer
  const FALLBACK_REGISTRY = {
    generated_at: "seed-preview",
    content_sha256: "seed000000000000000000000000000000000000000000000000000000000000",
    summary: { total_artifacts: 2, by_layer: { "maturity-model": 1, "reference-blueprint": 1 } },
    artifacts: [
      {
        id: "assessment-models-org",
        name: "Assessment-Models Ecosystem",
        full_name: "Assessment-Models/.github",
        owner_type: "cardinal-org",
        layer: "governance",
        architectural_concern: "Organization Governance",
        description:
          "Cardinal organization governing enterprise & organizational maturity models, shared assessment capabilities, and OpenDEA-compatible blueprints.",
        readme_excerpt:
          "Each maturity model retains ownership of its domain semantics, assessment methodology and scoring logic while conforming to shared organizational standards.",
        html_url: "https://github.com/Assessment-Models/",
        default_branch: "main",
        version: "v1.0.0",
        license: "Apache-2.0",
        primary_language: "Markdown / Mermaid",
        topics: ["governance-standard", "ecosystem", "opendia"],
        standards_alignment: ["MECE", "SemVer", "OpenDEA"],
        locales: ["en"],
        dimensions: ["Maturity Model Architecture", "Assessment Architecture", "Ecosystem Integration"],
        conformance_status: "verified",
        has_manifest: true,
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
          "Provides an end-to-end reference blueprint catalog aligned with enterprise architecture standards.",
        html_url: "https://github.com/technehub-labs/dea-catalog-reference-architecture",
        default_branch: "main",
        version: "v1-alpha",
        license: "Apache-2.0",
        primary_language: "Markdown / YAML",
        topics: ["reference-blueprint", "opendia", "enterprise-architecture"],
        standards_alignment: ["OpenDEA", "DERA-L1", "Apache-2.0"],
        locales: ["en"],
        dimensions: ["Metamodel", "Tenets", "Guardrails", "Patterns", "Blueprints", "Metrics"],
        conformance_status: "external-aligned",
        has_manifest: false,
        updated_at: "2026-11-19T00:00:00Z",
      },
    ],
  };

  const catalogGrid = document.getElementById("catalog-grid");
  const countLabel = document.getElementById("catalog-count-label");
  const searchInput = document.getElementById("repo-search-input");
  const conformanceSelect = document.getElementById("conformance-filter-select");
  const layerFilterButtons = document.querySelectorAll("[data-filter-layer]");

  const drawer = document.getElementById("repo-drawer");
  const drawerTitle = document.getElementById("drawer-title");
  const drawerFullName = document.getElementById("drawer-full-name");
  const drawerBody = document.getElementById("drawer-body");
  const drawerGithubLink = document.getElementById("drawer-github-link");
  const closeDrawerBtn = document.getElementById("close-drawer-btn");
  const drawerDoneBtn = document.getElementById("drawer-done-btn");

  let allArtifacts = [];
  let selectedLayer = "all";
  let lastDrawerTrigger = null;

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function statusBadgeClass(status) {
    if (status === "verified") return "status-tag status-verified";
    if (status === "external-aligned") return "status-tag status-external-aligned";
    return "status-tag status-draft";
  }

  function openDrawer(artifact, triggerEl) {
    if (!drawer || !artifact) return;
    lastDrawerTrigger = triggerEl || document.activeElement;

    if (drawerTitle) drawerTitle.textContent = artifact.name;
    if (drawerFullName) drawerFullName.textContent = artifact.full_name;
    if (drawerGithubLink) drawerGithubLink.href = artifact.html_url;

    const dimsHtml =
      Array.isArray(artifact.dimensions) && artifact.dimensions.length
        ? `<ul class="dimension-list">${artifact.dimensions.map((d) => `<li>${escapeHtml(d)}</li>`).join("")}</ul>`
        : `<p>No explicit dimension list declared yet in <code>assessment-manifest.json</code>.</p>`;

    const standardsHtml =
      Array.isArray(artifact.standards_alignment) && artifact.standards_alignment.length
        ? `<div class="tag-row">${artifact.standards_alignment.map((s) => `<span class="mini-tag">${escapeHtml(s)}</span>`).join("")}</div>`
        : `<p>Standard metadata pending.</p>`;

    if (drawerBody) {
      drawerBody.innerHTML = `
        <div class="drawer-meta-grid">
          <div class="drawer-meta-box">
            <span class="drawer-meta-label">Layer</span>
            <span class="drawer-meta-value">${escapeHtml(artifact.layer)}</span>
          </div>
          <div class="drawer-meta-box">
            <span class="drawer-meta-label">Version / License</span>
            <span class="drawer-meta-value">${escapeHtml(artifact.version)} • ${escapeHtml(artifact.license)}</span>
          </div>
          <div class="drawer-meta-box">
            <span class="drawer-meta-label">Conformance</span>
            <span class="drawer-meta-value">${escapeHtml(artifact.conformance_status)}</span>
          </div>
          <div class="drawer-meta-box">
            <span class="drawer-meta-label">Locales</span>
            <span class="drawer-meta-value">${escapeHtml((artifact.locales || ["en"]).join(", "))}</span>
          </div>
        </div>

        <div class="drawer-section">
          <h3>Architectural Concern</h3>
          <p>${escapeHtml(artifact.architectural_concern)}</p>
        </div>

        <div class="drawer-section">
          <h3>Overview &amp; Scope</h3>
          <p>${escapeHtml(artifact.description)}</p>
          ${artifact.readme_excerpt ? `<p style="margin-top:0.5rem;color:var(--text-muted);">${escapeHtml(artifact.readme_excerpt)}</p>` : ""}
        </div>

        <div class="drawer-section">
          <h3>Dimensions &amp; Structure</h3>
          ${dimsHtml}
        </div>

        <div class="drawer-section">
          <h3>Standards &amp; Crosswalks</h3>
          ${standardsHtml}
        </div>
      `;
    }

    drawer.hidden = false;
    closeDrawerBtn?.focus();
  }

  function closeDrawer() {
    if (!drawer) return;
    drawer.hidden = true;
    if (lastDrawerTrigger && typeof lastDrawerTrigger.focus === "function") {
      lastDrawerTrigger.focus();
    }
  }

  closeDrawerBtn?.addEventListener("click", closeDrawer);
  drawerDoneBtn?.addEventListener("click", closeDrawer);
  drawer?.addEventListener("click", (e) => {
    if (e.target === drawer) closeDrawer();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && drawer && !drawer.hidden) {
      closeDrawer();
    }
  });

  function renderCatalog() {
    if (!catalogGrid) return;
    const q = (searchInput?.value || "").trim().toLowerCase();
    const conf = conformanceSelect?.value || "all";

    const filtered = allArtifacts.filter((item) => {
      if (selectedLayer !== "all" && item.layer !== selectedLayer) return false;
      if (conf !== "all" && item.conformance_status !== conf) return false;
      if (!q) return true;

      const haystack = [
        item.name,
        item.full_name,
        item.description,
        item.layer,
        item.architectural_concern,
        ...(item.standards_alignment || []),
        ...(item.topics || []),
        ...(item.locales || []),
        ...(item.dimensions || []),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });

    if (countLabel) {
      countLabel.textContent = `Showing ${filtered.length} of ${allArtifacts.length} artifacts`;
    }

    if (!filtered.length) {
      catalogGrid.innerHTML = `<div class="empty-catalog-state">No repositories or blueprints match the current filter criteria.</div>`;
      return;
    }

    catalogGrid.innerHTML = filtered
      .map((item, idx) => {
        const tags = (item.standards_alignment || [])
          .slice(0, 3)
          .map((t) => `<span class="mini-tag">${escapeHtml(t)}</span>`)
          .join("");
        return `
          <article class="repo-card">
            <div>
              <div class="repo-card-top">
                <span class="mono-label">${escapeHtml(item.layer)}</span>
                <span class="${statusBadgeClass(item.conformance_status)}">${escapeHtml(item.conformance_status)}</span>
              </div>
              <h3>${escapeHtml(item.name)}</h3>
              <p>${escapeHtml(item.description)}</p>
              <div class="tag-row">${tags}</div>
            </div>
            <div class="repo-card-footer">
              <span class="mono-label">${escapeHtml(item.version)} • ${escapeHtml(item.license)}</span>
              <button type="button" class="inspect-btn" data-artifact-index="${idx}">
                Inspect →
              </button>
            </div>
          </article>
        `;
      })
      .join("");

    catalogGrid.querySelectorAll("[data-artifact-index]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.getAttribute("data-artifact-index"));
        if (!Number.isNaN(idx) && filtered[idx]) {
          openDrawer(filtered[idx], btn);
        }
      });
    });
  }

  layerFilterButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedLayer = btn.getAttribute("data-filter-layer") || "all";
      layerFilterButtons.forEach((b) => b.classList.toggle("is-active", b === btn));
      renderCatalog();
    });
  });

  searchInput?.addEventListener("input", renderCatalog);
  conformanceSelect?.addEventListener("change", renderCatalog);

  // Hydrate catalog from data/ecosystem-registry.json with seed fallback
  fetch("data/ecosystem-registry.json", { cache: "no-cache" })
    .then((res) => (res.ok ? res.json() : null))
    .then((registry) => {
      const activeReg = registry && Array.isArray(registry.artifacts) ? registry : FALLBACK_REGISTRY;
      allArtifacts = activeReg.artifacts;

      const totalEl = document.getElementById("stat-total-artifacts");
      const modelsEl = document.getElementById("stat-models");
      const syncEl = document.getElementById("stat-sync-status");
      const lastSyncedEl = document.getElementById("catalog-last-synced");

      if (totalEl) totalEl.textContent = String(activeReg.summary?.total_artifacts ?? allArtifacts.length);
      if (modelsEl && activeReg.summary?.by_layer) {
        modelsEl.textContent = String(activeReg.summary.by_layer["maturity-model"] ?? 0);
      }
      if (syncEl && activeReg.content_sha256) {
        syncEl.textContent = `sha256:${activeReg.content_sha256.slice(0, 7)}`;
      }
      if (lastSyncedEl && activeReg.generated_at) {
        lastSyncedEl.textContent = `Last synced: ${activeReg.generated_at}`;
      }

      renderCatalog();
    })
    .catch(() => {
      allArtifacts = FALLBACK_REGISTRY.artifacts;
      renderCatalog();
    });

  renderCatalog();

})();