(() => {
  // ---------- 1. Verified Hero Contract Inspector Tabs ----------
  const SPEC_TABS = {
    manifest: {
      filename: "maturity-model-digital-transformation/assessment-manifest.json",
      note: "Each domain repository owns its semantic rubric while declaring machine-readable identity and conformance contracts.",
      code: JSON.stringify(
        {
          org: "Assessment-Models",
          repo: "maturity-model-digital-transformation",
          model_id: "dea:maturity-digital-transformation",
          version: "1.1.0-alpha",
          conformance: "structural",
          scale_contract: "dea:maturity-bands-v2",
          imported_components: ["digital-culture", "technology-adoption"],
        },
        null,
        2
      ),
    },
    touchpoint: {
      filename: "maturity-model-operations/touchpoints.yaml",
      note: "CR-AM-13 single-owner evidence seams prevent duplicate questioning across overlapping domains such as Operations and Autonomous Operations.",
      code: [
        "seams:",
        "  - id: tp-ops-x-autonomous-operations",
        "    peer: Assessment-Models/maturity-model-autonomous-operations",
        "    ownership: operations owns D5 reliability evidence;",
        "               autonomous-operations owns closed-loop OODA autonomy",
        "    compatibility: '^1.0'",
        "handshake:",
        "  scale_contract: technehub-labs/dea-metamodel@v1.0.0",
      ].join("\n"),
    },
    ci: {
      filename: ".github/workflows/sync-catalog.yml",
      note: "Three-level GitHub Actions CI automatically dispatches model releases and rebuilds ecosystem-registry.json and the Gateway.",
      code: [
        "on:",
        "  repository_dispatch:",
        "    types: [model-released, manifest-updated]",
        "  schedule:",
        "    - cron: '15 */6 * * *'",
        "jobs:",
        "  sync-and-validate:",
        "    - run: python3 scripts/sync_org_catalog.py",
        "    - run: node scripts/verify-metro-layout.mjs",
      ].join("\n"),
    },
  };

  // ---------- 2. Persona Viewports (synced with localStorage['am-persona']) ----------
  const PERSONA_KEY = "am-persona";
  const LEGACY_PERSONA = { practitioner: "agent", certifier: "executive" };

  const VIEWPORTS = {
    executive: {
      kicker: "Viewport · Business Transformation Executive",
      title: "Portfolio Posture & Transformation Horizon",
      summary:
        "Compare capability maturity across Operations, Technology, Services Delivery, Modernization, and Autonomous Operations — linking effort-adjusted investment directly to OpenDEA DERA-L1 guardrails.",
      ctaText: "Open Conformance & Portfolio →",
      ctaHref: "/gateway/#/conformance",
      secondaryText: "Explore Metro Map",
      secondaryHref: "/gateway/#/",
      signals: [
        { k: "Cross-Domain Balance", v: "Track L-0 to L-4 posture across 7 active maturity models." },
        { k: "Effort-Adjusted Value", v: "See OpenDEA DERA-L1 improvement effort multipliers in live roll-ups." },
        { k: "Portfolio Governance", v: "Inspect AM-MODEL-REPOSITORY-STANDARD conformance per repository." },
      ],
    },
    assessor: {
      kicker: "Viewport · Assessor",
      title: "Calibration, Evidence & Deterministic Scoring",
      summary:
        "Execute structured L-0 to L-4 assessments directly in the browser with criterion weights, mandatory dimension gates, anchor rubrics, and auditable JSON/PDF report export.",
      ctaText: "Start Live Trial Assessment →",
      ctaHref: "/gateway/#/trial/maturity-model-digital-transformation",
      secondaryText: "Inspect Operations Model",
      secondaryHref: "/gateway/#/model/maturity-model-operations",
      signals: [
        { k: "Browser-Local Scoring", v: "Run live dimension cascades with zero server-side data lock-in." },
        { k: "Evidence-Anchored Levels", v: "Score against explicit L-0 through L-4 behavioral indicators." },
        { k: "Executive Export", v: "Generate radar charts, gap-to-target tables, and JSON exports." },
      ],
    },
    assessee: {
      kicker: "Viewport · Assessee",
      title: "Target Expectations & Evidence Readiness",
      summary:
        "Translate abstract maturity levels into concrete engineering, reliability, and delivery artifacts so delivery teams know exactly what evidence fulfills L-2 Systematic or L-3 Adaptive.",
      ctaText: "Review Model Expectations →",
      ctaHref: "/gateway/#/model/maturity-model-operations",
      secondaryText: "Browse All Models",
      secondaryHref: "/gateway/#/catalog",
      signals: [
        { k: "Concrete Evidence Lists", v: "Verify required logs, SLO policies, runbooks, and ADRs per criterion." },
        { k: "Single-Owner Seams", v: "Reuse evidence captured once across adjacent maturity assessments." },
        { k: "Self-Check Readiness", v: "Preview dimension gaps privately before formal assessor reviews." },
      ],
    },
    agent: {
      kicker: "Viewport · Agent",
      title: "Machine-Readable Manifests & CI Dispatch",
      summary:
        "Consume canonical assessment-manifest.json endpoints, touchpoints.yaml single-owner boundaries, and GitHub Actions repository_dispatch signals for autonomous orchestration.",
      ctaText: "Inspect Interactions & CI →",
      ctaHref: "/gateway/#/interactions",
      secondaryText: "View Model YAML Contracts",
      secondaryHref: "/gateway/#/model/maturity-model-autonomous-operations",
      signals: [
        { k: "Manifest & Schema Feeds", v: "Read structured JSON registries and pinned YAML scales directly." },
        { k: "Three-Level CI Gates", v: "Track local-model-ci, contract-conformance, and sync-catalog triggers." },
        { k: "Template Onboarding", v: "Instantiate compliant future models from maturity-model-template." },
      ],
    },
  };

  function readSavedPersona() {
    try {
      const raw = localStorage.getItem(PERSONA_KEY) || "";
      if (raw in LEGACY_PERSONA) return LEGACY_PERSONA[raw];
      return VIEWPORTS[raw] ? raw : "executive";
    } catch {
      return "executive";
    }
  }

  function writeSavedPersona(id) {
    try {
      localStorage.setItem(PERSONA_KEY, id);
    } catch {
      /* private mode */
    }
  }

  const vpTabs = document.querySelectorAll("[data-persona-tab]");
  const vpStage = document.getElementById("viewport-stage");
  const vpKicker = document.getElementById("vp-kicker");
  const vpTitle = document.getElementById("vp-title");
  const vpSummary = document.getElementById("vp-summary");
  const vpPrimaryCta = document.getElementById("vp-primary-cta");
  const vpSecondaryCta = document.getElementById("vp-secondary-cta");
  const vpSignals = document.getElementById("vp-signals");

  function renderViewport(id, animate = true) {
    const vp = VIEWPORTS[id] || VIEWPORTS.executive;
    vpTabs.forEach((btn) => {
      const active = btn.getAttribute("data-persona-tab") === id;
      btn.classList.toggle("is-active", active);
      btn.setAttribute("aria-selected", String(active));
    });

    if (animate && vpStage) {
      vpStage.classList.remove("is-animating");
      void vpStage.offsetWidth;
      vpStage.classList.add("is-animating");
    }

    if (vpKicker) vpKicker.textContent = vp.kicker;
    if (vpTitle) vpTitle.textContent = vp.title;
    if (vpSummary) vpSummary.textContent = vp.summary;
    if (vpPrimaryCta) {
      vpPrimaryCta.textContent = vp.ctaText;
      vpPrimaryCta.href = vp.ctaHref;
    }
    if (vpSecondaryCta) {
      vpSecondaryCta.textContent = vp.secondaryText;
      vpSecondaryCta.href = vp.secondaryHref;
    }
    if (vpSignals) {
      vpSignals.innerHTML = vp.signals
        .map((s) => `<li><strong>${escapeHtml(s.k)}</strong><span>${escapeHtml(s.v)}</span></li>`)
        .join("");
    }
  }

  vpTabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-persona-tab");
      if (!id) return;
      writeSavedPersona(id);
      renderViewport(id, true);
    });
  });

  renderViewport(readSavedPersona(), false);

  // ---------- 3. Portfolio Showcase (Verified Repos Only) ----------
  const PORTFOLIO_ITEMS = {
    maturity: [
      {
        id: "maturity-model-digital-transformation",
        name: "Digital Transformation Maturity Model",
        meta: "v1.1.0-alpha · structural · Composite",
        desc: "Composite transformation model spanning operations, technology, services delivery, and OpenDEA adoption.",
        dims: "10 composite dimensions · 4 imported component packages",
        scorable: true,
        repo: "Assessment-Models/maturity-model-digital-transformation",
      },
      {
        id: "maturity-model-digital-transformation-operationalized",
        name: "DT Operationalized Maturity Model",
        meta: "v1.0.1 · structural · Operationalized",
        desc: "Six-dimension digital business operating model anchored to L-0..L-4 behavioral criteria and human-agent teaming.",
        dims: "Customer & Ecosystem · Strategy · Digital Platforms · Autonomous Operations · Culture · Data",
        scorable: true,
        repo: "Assessment-Models/maturity-model-digital-transformation-operationalized",
      },
      {
        id: "maturity-model-operations",
        name: "Operations Maturity Model",
        meta: "v2.0.0 · structural · Stable",
        desc: "Enterprise operations covering daily flow visibility, SRE reliability, workforce readiness, and operating blueprint strategy.",
        dims: "6 dimensions · CR-AM-13 seams with 6 sibling repos",
        scorable: true,
        repo: "Assessment-Models/maturity-model-operations",
      },
      {
        id: "maturity-model-autonomous-operations",
        name: "Autonomous Operations Maturity Model",
        meta: "v2.0.0 · structural · Closed-Loop",
        desc: "Evaluates AI-instrumented value streams, closed-loop OODA control, and intent-driven agent governance.",
        dims: "Party · Strategy · Technology · Operations · Culture · Data",
        scorable: true,
        repo: "Assessment-Models/maturity-model-autonomous-operations",
      },
      {
        id: "maturity-model-technology",
        name: "Technology Maturity Model",
        meta: "v1.1.0 · structural · Domain",
        desc: "Assesses stack fitness, technical debt control, lifecycle management, platform capability, and skill coverage.",
        dims: "Stack Fitness · Tech Debt · Lifecycle · Skill Coverage · Tooling",
        scorable: true,
        repo: "Assessment-Models/maturity-model-technology",
      },
      {
        id: "maturity-model-services-delivery",
        name: "Services Delivery Maturity Model",
        meta: "v1.1.0 · structural · Domain",
        desc: "Measures delivery predictability, time-to-market, defect quality, customer value, and team health.",
        dims: "Time-to-Market · Quality · Customer Outcomes · Flow · Team Health",
        scorable: true,
        repo: "Assessment-Models/maturity-model-services-delivery",
      },
      {
        id: "maturity-model-modernization",
        name: "Architecture Modernization Maturity Model",
        meta: "v1.1.0 · structural · AMAF",
        desc: "Evaluates legacy decomposition strategy, migration sequencing, modernization wave execution, and debt retirement.",
        dims: "Strategy & Direction · Sequencing · Execution · Technical Debt",
        scorable: true,
        repo: "Assessment-Models/maturity-model-modernization",
      },
    ],
    instruments: [
      {
        id: "dea-assessment-operations",
        name: "Operations Assessment Instrument",
        meta: "v1.1.0-alpha · registered · OpenDEA",
        desc: "Questionnaire and evidence rubric scoring against dea:maturity-operations with observability and SLO checks.",
        dims: "Incident Response · Observability · Release · Reliability · Culture",
        scorable: true,
        repo: "Assessment-Models/dea-assessment-operations",
      },
      {
        id: "dea-assessment-technology",
        name: "Technology Assessment Instrument",
        meta: "v1.1.0-alpha · registered · OpenDEA",
        desc: "Captures evidence on platform standardization, legacy obsolescence, and architectural debt.",
        dims: "Stack Fitness · Technical Debt · Lifecycle · Skills · Tooling",
        scorable: true,
        repo: "Assessment-Models/dea-assessment-technology",
      },
      {
        id: "dea-assessment-services-delivery",
        name: "Services Delivery Assessment Instrument",
        meta: "v1.1.0-alpha · registered · OpenDEA",
        desc: "Structured delivery questionnaire mapped to flow efficiency, predictability, and outcome metrics.",
        dims: "Predictability · Flow Metrics · Quality · Value · Team Health",
        scorable: true,
        repo: "Assessment-Models/dea-assessment-services-delivery",
      },
      {
        id: "dea-assessment-modernization",
        name: "Modernization Assessment Instrument",
        meta: "v1.1.0-alpha · registered · OpenDEA",
        desc: "Evaluates strangler-fig adoption, bounded context decomposition, and modernization program readiness.",
        dims: "Strategy · Migration Library · Wave Planning · Metrics · Culture",
        scorable: true,
        repo: "Assessment-Models/dea-assessment-modernization",
      },
    ],
    foundations: [
      {
        id: "maturity-model-standard",
        name: "maturity-model-standard",
        meta: "v0.1.0-draft · Governance Norm",
        desc: "Normative AM-MODEL-REPOSITORY-STANDARD specification, conformance workflows, and portfolio adoption registry.",
        dims: "Defines registered · structural · full tiers",
        scorable: false,
        repo: "Assessment-Models/maturity-model-standard",
      },
      {
        id: "maturity-model-template",
        name: "maturity-model-template",
        meta: "v0.1.0-draft · Repository Scaffold",
        desc: "Executable GitHub template repository pre-wired with CI, manifests, and standard.yaml for new domain models.",
        dims: "Accelerates compliant creation of future maturity-model-* repos",
        scorable: false,
        repo: "Assessment-Models/maturity-model-template",
      },
      {
        id: "maturity-components",
        name: "maturity-components",
        meta: "v1.0.1 · Shared Capability",
        desc: "Single-sourced reusable dimension and criteria bundles consumed under import, extend, or override semantics.",
        dims: "digital-culture · technology-adoption · operations-modernization",
        scorable: false,
        repo: "Assessment-Models/maturity-components",
      },
      {
        id: "assessment-registry",
        name: "assessment-registry",
        meta: "v0.1.0-draft · Identity Spine",
        desc: "Immutable release pointer, dependency graph, and contract handshake registry across the organization.",
        dims: "Zero model content · Metadata & immutable provenance only",
        scorable: false,
        repo: "Assessment-Models/assessment-registry",
      },
      {
        id: "assessment-ci",
        name: "assessment-ci",
        meta: "v0.1.0-draft · Validation Engine",
        desc: "Cross-repository GitHub Actions reusable validator enforcing Level 1–3 CI checks and MECE contracts.",
        dims: "Powers contract-conformance & manifest verification",
        scorable: false,
        repo: "Assessment-Models/assessment-ci",
      },
      {
        id: "dea-metamodel",
        name: "technehub-labs / dea-metamodel",
        meta: "v1.0.0 · OpenDEA Metamodel",
        desc: "Canonical upstream entity schemas and canonical dea:maturity-bands-v2 scale shared across all ecosystems.",
        dims: "Partner foundation · Contract handshake anchor",
        scorable: false,
        repo: "technehub-labs/dea-metamodel",
      },
    ],
  };

  const portfolioTabs = document.querySelectorAll("[data-portfolio-tab]");
  const showcaseGrid = document.getElementById("portfolio-showcase-grid");

  function renderPortfolio(tabKey) {
    if (!showcaseGrid) return;
    const items = PORTFOLIO_ITEMS[tabKey] || PORTFOLIO_ITEMS.maturity;
    portfolioTabs.forEach((b) => {
      const on = b.getAttribute("data-portfolio-tab") === tabKey;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", String(on));
    });

    showcaseGrid.innerHTML = items
      .map(
        (item) => `
        <article class="showcase-card">
          <div>
            <div class="showcase-meta">${escapeHtml(item.meta)}</div>
            <h3>${escapeHtml(item.name)}</h3>
            <p class="showcase-desc">${escapeHtml(item.desc)}</p>
            <div class="showcase-dims">${escapeHtml(item.dims)}</div>
          </div>
          <div class="showcase-actions">
            ${
              item.scorable
                ? `<a href="/gateway/#/model/${encodeURIComponent(item.id)}">Inspect Model</a>
                   <a href="/gateway/#/trial/${encodeURIComponent(item.id)}">Run Trial →</a>`
                : `<a href="/gateway/#/interactions">View CI &amp; Seams</a>`
            }
            <a href="https://github.com/${escapeHtml(item.repo)}" target="_blank" rel="noopener noreferrer" style="margin-left:auto;color:var(--text-faint)">GitHub ↗</a>
          </div>
        </article>`
      )
      .join("");
  }

  portfolioTabs.forEach((b) => {
    b.addEventListener("click", () => {
      const k = b.getAttribute("data-portfolio-tab");
      if (k) renderPortfolio(k);
    });
  });

  renderPortfolio("maturity");

  // ---------- 4. Animated L-0..L-4 Progression & Roll-Up Callout ----------
  const SCALE_LEVELS = [
    {
      band: "dea:maturity-band-emergent",
      effort: "1.0× Baseline",
      gate: "L-0 (0–20): Ad-hoc practices; local heroics; no mandatory cross-dimension floor.",
      width: "20%",
    },
    {
      band: "dea:maturity-band-structured",
      effort: "1.15× Foundation",
      gate: "L-1 (21–45): Documented team practices; initial telemetry; evidence audit begins.",
      width: "40%",
    },
    {
      band: "dea:maturity-band-systematic",
      effort: "1.35× Standardization",
      gate: "L-2 (46–70): Org-wide repeatable patterns; mandatory core criteria must reach L-1+.",
      width: "60%",
    },
    {
      band: "dea:maturity-band-adaptive",
      effort: "1.6× Continuous Tuning",
      gate: "L-3 (71–88): SLO-driven feedback loops; cross-model touchpoints actively reused.",
      width: "80%",
    },
    {
      band: "dea:maturity-band-self-optimizing",
      effort: "1.85× Autonomous Edge",
      gate: "L-4 (89–100): Closed-loop autonomous governance & verifiable ecosystem evidence.",
      width: "100%",
    },
  ];

  const scaleBtns = document.querySelectorAll("[data-scale-idx]");
  const scaleFill = document.getElementById("scale-progress-fill");
  const srBand = document.getElementById("sr-band");
  const srEffort = document.getElementById("sr-effort");
  const srGate = document.getElementById("sr-gate");
  const scaleToggle = document.getElementById("scale-play-toggle");

  let activeScaleIdx = 0;
  let scaleTimer = null;
  const prefersReduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let scalePlaying = !prefersReduced;

  function selectScaleStep(idx) {
    activeScaleIdx = ((idx % SCALE_LEVELS.length) + SCALE_LEVELS.length) % SCALE_LEVELS.length;
    const data = SCALE_LEVELS[activeScaleIdx];
    scaleBtns.forEach((btn, i) => {
      const on = i === activeScaleIdx;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", String(on));
    });
    if (scaleFill) scaleFill.style.width = data.width;
    if (srBand) srBand.textContent = data.band;
    if (srEffort) srEffort.textContent = data.effort;
    if (srGate) srGate.textContent = data.gate;
  }

  function startScaleCycle() {
    stopScaleCycle();
    if (!scalePlaying) return;
    scaleTimer = window.setInterval(() => {
      selectScaleStep(activeScaleIdx + 1);
    }, 3400);
  }

  function stopScaleCycle() {
    if (scaleTimer) {
      clearInterval(scaleTimer);
      scaleTimer = null;
    }
  }

  if (scaleToggle) {
    scaleToggle.textContent = scalePlaying ? "Pause Cycle" : "Play Cycle";
    scaleToggle.setAttribute("aria-pressed", String(scalePlaying));
    scaleToggle.addEventListener("click", () => {
      scalePlaying = !scalePlaying;
      scaleToggle.textContent = scalePlaying ? "Pause Cycle" : "Play Cycle";
      scaleToggle.setAttribute("aria-pressed", String(scalePlaying));
      if (scalePlaying) startScaleCycle();
      else stopScaleCycle();
    });
  }

  scaleBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.getAttribute("data-scale-idx"));
      scalePlaying = false;
      if (scaleToggle) {
        scaleToggle.textContent = "Play Cycle";
        scaleToggle.setAttribute("aria-pressed", "false");
      }
      stopScaleCycle();
      selectScaleStep(idx);
    });
  });

  selectScaleStep(0);
  startScaleCycle();

  // ---------- 5. GitHub Actions CI Stage Explorer ----------
  const CI_DETAILS = [
    {
      title: "Level 01 · Local Model Repository CI (.github/workflows/local-model-ci.yml)",
      checks: [
        "Runs inside each maturity-model-* or dea-assessment-* repository on every Pull Request and push.",
        "Validates YAML structure across model.yaml, maturity/scale.yaml, and operationalized dimensions.",
        "Verifies normalized weights sum to 1.00 and validates assessment-manifest.json schema fields.",
      ],
    },
    {
      title: "Level 02 · Cross-Repository Contract Conformance (.github/workflows/contract-conformance.yml)",
      checks: [
        "Invokes reusable conformance workflows from Assessment-Models/assessment-ci and maturity-model-standard.",
        "Checks standard.yaml coherence and resolves maturity-scale-contract against pinned technehub-labs/dea-metamodel.",
        "Verifies bidirectional CR-AM-13 reciprocity across declared touchpoints.yaml peer models.",
      ],
    },
    {
      title: "Level 03 · Organization Registry Sync & Deployment (.github/workflows/sync-catalog.yml + deploy.yml)",
      checks: [
        "Triggered automatically by repository_dispatch ([model-released, manifest-updated]) or every 6 hours.",
        "Executes sync_org_catalog.py to rebuild data/ecosystem-registry.json and verify JSON Schema compliance.",
        "Runs verify-metro-layout.mjs and validate-homepage-links.mjs before publishing Pages + Gateway.",
      ],
    },
  ];

  const ciStageCards = document.querySelectorAll("[data-ci-stage]");
  const ciStageDetail = document.getElementById("ci-stage-detail");

  function renderCiStage(idx) {
    const d = CI_DETAILS[idx] || CI_DETAILS[0];
    ciStageCards.forEach((card, i) => {
      const on = i === idx;
      card.classList.toggle("is-active", on);
      card.setAttribute("aria-selected", String(on));
    });
    if (ciStageDetail) {
      ciStageDetail.innerHTML = `
        <strong>${escapeHtml(d.title)}</strong>
        <ul>${d.checks.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul>
      `;
    }
  }

  ciStageCards.forEach((card) => {
    card.addEventListener("click", () => {
      renderCiStage(Number(card.getAttribute("data-ci-stage")));
    });
  });

  renderCiStage(0);

  // ---------- 6. Existing Seams vs Future Model Onboarding ----------
  const FUTURE_ONBOARDING_CARDS = [
    {
      meta: "Step 01 · Template Scaffold",
      title: "Instantiate maturity-model-template",
      desc: "Fork or generate Assessment-Models/maturity-model-<domain> pre-seeded with model.yaml, maturity/scale.yaml, and assessment-manifest.json.",
    },
    {
      meta: "Step 02 · Declare Peer Seams",
      title: "Author touchpoints.yaml & standard.yaml",
      desc: "Reference shared maturity-components packages and declare single-owner evidence boundaries with Operations, Technology, or Services Delivery.",
    },
    {
      meta: "Step 03 · Automatic CI Propagation",
      title: "Trigger Level 2 → Level 3 Repository Dispatch",
      desc: "Releasing v1.0.0 passes contract-conformance.yml, fires repository_dispatch, and updates data/ecosystem-registry.json and the Gateway Metro Map automatically.",
    },
  ];

  const seamModeBtns = document.querySelectorAll("[data-seam-mode]");
  const seamsContent = document.getElementById("seams-content");
  let activeSeamMode = "existing";
  let loadedLinks = [];

  function renderSeamsBox() {
    if (!seamsContent) return;
    if (activeSeamMode === "future") {
      seamsContent.innerHTML = `<div class="seams-grid">${FUTURE_ONBOARDING_CARDS.map(
        (c) => `
        <article class="seam-card">
          <div class="showcase-meta">${escapeHtml(c.meta)}</div>
          <h4>${escapeHtml(c.title)}</h4>
          <p>${escapeHtml(c.desc)}</p>
        </article>`
      ).join("")}</div>`;
      return;
    }

    const priorityIds = new Set([
      "tp-ops-x-autonomous-operations",
      "tp-ops-x-dt-operationalized",
      "tp-ops-x-technology",
      "tp-ops-x-services-delivery",
      "hs-scale-contract-operations",
      "tp-component-reuse",
    ]);
    const prioritized = [
      ...loadedLinks.filter((l) => priorityIds.has(l.id)),
      ...loadedLinks.filter((l) => !priorityIds.has(l.id)),
    ];
    const preview = prioritized.slice(0, 6);
    if (!preview.length) {
      seamsContent.innerHTML = `<p style="color:var(--text-muted);font-size:.86rem">Loading live seams from data/ecosystem-registry.json…</p>`;
      return;
    }
    seamsContent.innerHTML = `<div class="seams-grid">${preview
      .map(
        (l) => `
        <article class="seam-card">
          <div class="showcase-meta">${escapeHtml(l.kind)} · ${escapeHtml(l.compatibility)}</div>
          <h4>${escapeHtml(l.label)}</h4>
          <p>${escapeHtml(l.from_station_id)} → ${escapeHtml(l.to_station_id)}</p>
          <p style="margin-top:.35rem">${escapeHtml(l.contract_summary)}</p>
        </article>`
      )
      .join("")}</div>`;
  }

  seamModeBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      activeSeamMode = btn.getAttribute("data-seam-mode") || "existing";
      seamModeBtns.forEach((b) => {
        const on = b === btn;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-selected", String(on));
      });
      renderSeamsBox();
    });
  });

  // ---------- 7. Architecture Toggle & 4-Layer Explorer ----------
  const ECOSYSTEM_LAYERS = {
    governance: {
      badge: "Layer 01 · Organization-Level Governance",
      heading: "Organization-Level Governance",
      flow: "Governs standards, registry & conformance",
      summary:
        "Sets ecosystem-wide standards, registry policies, conformance gates, and lifecycle rules so models evolve independently while remaining interoperable.",
      nodes: [
        "AM-MODEL-REPOSITORY-STANDARD",
        "Assessment Registry Spine",
        "Level 2 Contract Conformance CI",
        "Governance Charter & Lifecycle",
      ],
    },
    models: {
      badge: "Layer 02 · Independently Governed Models",
      heading: "Independently Governed Maturity Models",
      flow: "Own domain semantics, dimensions, levels & rubrics",
      summary:
        "Each maturity model is independently versioned and maintained around its specific domain, criteria, L-0..L-4 progression levels, and assessment methodology.",
      nodes: [
        "Digital Transformation & Operationalized DT",
        "Operations & Autonomous Operations",
        "Technology & Services Delivery",
        "Architecture Modernization (AMAF)",
      ],
    },
    capabilities: {
      badge: "Layer 03 · Shared Assessment Capabilities",
      heading: "Shared Assessment Capabilities",
      flow: "Reusable operational services across models",
      summary:
        "Reusable packages and services that operationalize assessments — execution engines, evidence handling, deterministic scoring, and reporting.",
      nodes: [
        "Browser Trial & Cascade Engine",
        "maturity-components Packages",
        "assessment-ci Validators",
        "JSON & Print Report Export",
      ],
    },
    integration: {
      badge: "Layer 04 · Inter-Model Integration",
      heading: "Inter-Model Integration",
      flow: "Touchpoints, handshakes & compatibility resolution",
      summary:
        "Coordinates single-owner evidence touchpoints (CR-AM-13), pinned dea-metamodel scale handshakes, and SemVer impact checks across the portfolio.",
      nodes: [
        "touchpoints.yaml Peer Seams",
        "maturity-scale-contract Handshakes",
        "sync-catalog.yml Auto-Dispatch",
        "OpenDEA DERA-L1 Reference Alignment",
      ],
    },
  };

  const archTabs = document.querySelectorAll("[data-arch-tab]");
  const panelConcerns = document.getElementById("arch-panel-concerns");
  const panelLayers = document.getElementById("arch-panel-layers");

  archTabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      const target = btn.getAttribute("data-arch-tab");
      archTabs.forEach((b) => {
        const on = b === btn;
        b.classList.toggle("is-active", on);
        b.setAttribute("aria-selected", String(on));
      });
      if (panelConcerns && panelLayers) {
        panelConcerns.hidden = target !== "concerns";
        panelLayers.hidden = target !== "layers";
      }
    });
  });

  const layerPills = document.querySelectorAll("[data-layer-key]");
  const layerBadge = document.getElementById("layer-badge");
  const layerHeading = document.getElementById("layer-heading");
  const layerFlow = document.getElementById("layer-flow");
  const layerSummary = document.getElementById("layer-summary");
  const layerNodes = document.getElementById("layer-nodes");

  function renderLayer(key) {
    const data = ECOSYSTEM_LAYERS[key];
    if (!data) return;
    layerPills.forEach((p) => p.classList.toggle("is-active", p.getAttribute("data-layer-key") === key));
    if (layerBadge) layerBadge.textContent = data.badge;
    if (layerHeading) layerHeading.textContent = data.heading;
    if (layerFlow) layerFlow.textContent = data.flow;
    if (layerSummary) layerSummary.textContent = data.summary;
    if (layerNodes) {
      layerNodes.innerHTML = data.nodes.map((n) => `<div class="node-chip">${escapeHtml(n)}</div>`).join("");
    }
  }

  layerPills.forEach((p) => {
    p.addEventListener("click", () => {
      const k = p.getAttribute("data-layer-key");
      if (k) renderLayer(k);
    });
  });
  renderLayer("governance");

  // ---------- 8. Tooltip, Spec Tabs, Scroll & Modals ----------
  const tooltipEl = document.getElementById("live-tooltip");
  let activeTrigger = null;

  function positionTooltip(trigger) {
    if (!tooltipEl || !trigger) return;
    const rect = trigger.getBoundingClientRect();
    const tipRect = tooltipEl.getBoundingClientRect();
    const pad = 10;
    const left = Math.max(pad, Math.min(rect.left + rect.width / 2 - tipRect.width / 2, window.innerWidth - tipRect.width - pad));
    let top = rect.top - tipRect.height - 8;
    if (top < pad) top = rect.bottom + 8;
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

  window.addEventListener("scroll", () => { if (activeTrigger) positionTooltip(activeTrigger); }, { passive: true });
  window.addEventListener("resize", () => { if (activeTrigger) positionTooltip(activeTrigger); });

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
        copyBtn.textContent = "Copied";
        setTimeout(() => { copyBtn.textContent = prev; }, 1400);
      } catch {
        copyBtn.textContent = "Copy failed";
      }
    });
  }

  const header = document.querySelector("[data-elevate-on-scroll]");
  const navLinks = Array.from(document.querySelectorAll("[data-nav-link]"));
  const sections = navLinks
    .map((l) => {
      const h = l.getAttribute("href");
      return h && h.startsWith("#") ? document.querySelector(h) : null;
    })
    .filter(Boolean);

  function updateScrollState() {
    if (header) header.classList.toggle("is-elevated", window.scrollY > 12);
    const pos = window.scrollY + 130;
    let current = "";
    for (const s of sections) {
      if (s.offsetTop <= pos) current = `#${s.id}`;
    }
    navLinks.forEach((l) => l.classList.toggle("is-active", l.getAttribute("href") === current));
  }
  window.addEventListener("scroll", updateScrollState, { passive: true });
  updateScrollState();

  // Charter Modal
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
    if (lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
  }
  openBtn?.addEventListener("click", openModal);
  footerOpenBtn?.addEventListener("click", openModal);
  closeBtn?.addEventListener("click", closeModal);
  modal?.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });

  // ---------- 9. Registry Catalog & Inspector Drawer ----------
  const FALLBACK_REGISTRY = {
    generated_at: "snapshot",
    content_sha256: "fb3483306083f99fc5b2ea2b29ae7e01439aa77ef6734653e9c1e6d4a405e429",
    summary: { total_artifacts: 2, by_layer: { "maturity-model": 1, "reference-blueprint": 1 } },
    artifacts: [
      {
        id: "maturity-model-standard",
        name: "maturity-model-standard",
        full_name: "Assessment-Models/maturity-model-standard",
        owner_type: "cardinal-org",
        layer: "governance",
        architectural_concern: "Organization Governance",
        description: "Normative source of truth for AM-MODEL-REPOSITORY-STANDARD specifications, schemas, and portfolio conformance.",
        html_url: "https://github.com/Assessment-Models/maturity-model-standard",
        version: "v0.1.0-draft",
        license: "MIT",
        standards_alignment: ["AM-MODEL-REPOSITORY-STANDARD", "MECE-STRICT"],
        locales: ["en"],
        dimensions: [],
        conformance_status: "draft",
      },
      {
        id: "dea-catalog-reference-architecture",
        name: "dea-catalog-reference-architecture",
        full_name: "technehub-labs/dea-catalog-reference-architecture",
        owner_type: "partner-ecosystem",
        layer: "reference-blueprint",
        architectural_concern: "Model Ecosystem Integration Architecture",
        description: "Digital Enterprise Reference Architecture (DERA): L1 catalog assembling metamodel, tenets, guardrails, patterns, blueprints, and metrics.",
        html_url: "https://github.com/technehub-labs/dea-catalog-reference-architecture",
        version: "v0.1.0-draft",
        license: "Apache-2.0",
        standards_alignment: ["OpenDEA", "DERA-L1", "Apache-2.0"],
        locales: ["en"],
        dimensions: [],
        conformance_status: "external-aligned",
      },
    ],
    touchpoints: [],
    handshakes: [],
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
  let showAllRepos = false;
  let lastDrawerTrigger = null;

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function openDrawer(artifact, triggerEl) {
    if (!drawer || !artifact) return;
    lastDrawerTrigger = triggerEl || document.activeElement;
    if (drawerTitle) drawerTitle.textContent = artifact.name;
    if (drawerFullName) drawerFullName.textContent = artifact.full_name;
    if (drawerGithubLink) drawerGithubLink.href = artifact.html_url;

    const dimsHtml =
      Array.isArray(artifact.dimensions) && artifact.dimensions.length
        ? `<ul style="margin:0;padding-left:1.1rem">${artifact.dimensions.map((d) => `<li>${escapeHtml(d)}</li>`).join("")}</ul>`
        : `<p>Infrastructure, governance, or umbrella repository without direct scored dimensions.</p>`;

    const standardsHtml =
      Array.isArray(artifact.standards_alignment) && artifact.standards_alignment.length
        ? `<p class="mono-label">${escapeHtml(artifact.standards_alignment.join(" · "))}</p>`
        : `<p>Standard metadata pending.</p>`;

    if (drawerBody) {
      drawerBody.innerHTML = `
        <div class="drawer-meta-grid">
          <div class="drawer-meta-box">
            <span class="drawer-meta-label">Layer</span>
            <span class="drawer-meta-value">${escapeHtml(artifact.layer)}</span>
          </div>
          <div class="drawer-meta-box">
            <span class="drawer-meta-label">Version · License</span>
            <span class="drawer-meta-value">${escapeHtml(artifact.version)} · ${escapeHtml(artifact.license)}</span>
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
          <h3>Overview</h3>
          <p>${escapeHtml(artifact.description)}</p>
        </div>
        <div class="drawer-section">
          <h3>Dimensions &amp; Structure</h3>
          ${dimsHtml}
        </div>
        <div class="drawer-section">
          <h3>Standards Alignment</h3>
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
    if (lastDrawerTrigger && typeof lastDrawerTrigger.focus === "function") lastDrawerTrigger.focus();
  }

  closeDrawerBtn?.addEventListener("click", closeDrawer);
  drawerDoneBtn?.addEventListener("click", closeDrawer);
  drawer?.addEventListener("click", (e) => { if (e.target === drawer) closeDrawer(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      hideTooltip();
      if (modal && !modal.hidden) closeModal();
      if (drawer && !drawer.hidden) closeDrawer();
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
        ...(item.dimensions || []),
      ]
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });

    const isFiltered = selectedLayer !== "all" || conf !== "all" || q.length > 0;
    const limit = isFiltered || showAllRepos ? filtered.length : 9;
    const visible = filtered.slice(0, limit);

    if (countLabel) {
      countLabel.textContent = `Showing ${visible.length} of ${filtered.length} matching artifacts (${allArtifacts.length} total)`;
    }

    if (!visible.length) {
      catalogGrid.innerHTML = `<div class="empty-catalog-state">No repositories or blueprints match the current filter criteria.</div>`;
      return;
    }

    catalogGrid.innerHTML = visible
      .map((item, idx) => {
        const standardsLine = (item.standards_alignment || []).slice(0, 3).join(" · ");
        return `
          <article class="repo-card">
            <div>
              <div class="repo-card-top">
                <span>${escapeHtml(item.layer)}</span>
                <span>${escapeHtml(item.conformance_status)}</span>
              </div>
              <h3>${escapeHtml(item.name)}</h3>
              <p>${escapeHtml(item.description)}</p>
              ${standardsLine ? `<div class="mono-label" style="font-size:.73rem;color:var(--good);margin-bottom:.7rem">${escapeHtml(standardsLine)}</div>` : ""}
            </div>
            <div class="repo-card-footer">
              <span class="mono-label">${escapeHtml(item.version)} · ${escapeHtml(item.license)}</span>
              <button type="button" class="inspect-btn" data-artifact-index="${idx}">Inspect →</button>
            </div>
          </article>
        `;
      })
      .join("");

    if (!isFiltered && filtered.length > 9) {
      const moreWrap = document.createElement("div");
      moreWrap.className = "catalog-more-row";
      moreWrap.style.gridColumn = "1 / -1";
      const toggleBtn = document.createElement("button");
      toggleBtn.type = "button";
      toggleBtn.className = "btn btn-secondary";
      toggleBtn.textContent = showAllRepos ? "Show compact view (9)" : `Show all ${filtered.length} repositories`;
      toggleBtn.addEventListener("click", () => {
        showAllRepos = !showAllRepos;
        renderCatalog();
      });
      moreWrap.appendChild(toggleBtn);
      catalogGrid.appendChild(moreWrap);
    }

    catalogGrid.querySelectorAll("[data-artifact-index]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = Number(btn.getAttribute("data-artifact-index"));
        if (!Number.isNaN(idx) && visible[idx]) openDrawer(visible[idx], btn);
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

  fetch("data/ecosystem-registry.json", { cache: "no-cache" })
    .then((res) => (res.ok ? res.json() : null))
    .then((registry) => {
      const activeReg = registry && Array.isArray(registry.artifacts) ? registry : FALLBACK_REGISTRY;
      allArtifacts = activeReg.artifacts;
      loadedLinks = [...(activeReg.touchpoints || []), ...(activeReg.handshakes || [])];

      const totalEl = document.getElementById("stat-total-artifacts");
      const modelsEl = document.getElementById("stat-models");
      const seamsEl = document.getElementById("stat-seams");
      const syncEl = document.getElementById("stat-sync-status");
      const lastSyncedEl = document.getElementById("catalog-last-synced");

      if (totalEl) totalEl.textContent = String(activeReg.summary?.total_artifacts ?? allArtifacts.length);
      if (modelsEl && activeReg.summary?.by_layer) {
        modelsEl.textContent = String(activeReg.summary.by_layer["maturity-model"] ?? 0);
      }
      if (seamsEl) seamsEl.textContent = String(loadedLinks.length || 26);
      if (syncEl && activeReg.content_sha256) {
        syncEl.textContent = activeReg.content_sha256.slice(0, 7);
      }
      if (lastSyncedEl && activeReg.generated_at) {
        lastSyncedEl.textContent = `Last synced: ${activeReg.generated_at}`;
      }

      renderSeamsBox();
      renderCatalog();
    })
    .catch(() => {
      allArtifacts = FALLBACK_REGISTRY.artifacts;
      renderSeamsBox();
      renderCatalog();
    });

  renderSeamsBox();
  renderCatalog();
})();