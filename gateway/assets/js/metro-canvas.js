/**
 * Full-viewport Metro Map renderer:
 * - layered SVG (corridor tracks → touchpoint/handshake spurs → stations)
 * - pan / zoom / fit buttons, wheel zoom, ResizeObserver auto-fit
 * - line filters, contract mode filter, station quick-jump
 * - route tracing (click a station to highlight its lines & contracts)
 * - animated contextual tooltips + slide-over inspector sheet
 * - keyboard accessible (Tab / Enter / Space / Escape) and reduced-motion safe
 */
import { buildMetroGraph } from "./metro-graph.js";
import { computeMetroLayout } from "./metro-layout.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  return el;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export class MetroCanvasController {
  constructor(container, registry) {
    this.container = container;
    this.graph = buildMetroGraph(registry);
    this.selectedLine = "all";
    this.contractMode = "all"; // "all" | "handshakes" | "touchpoints"
    this.focusedStationId = null;
    this.selectedEntity = null;
    this.transform = { x: 0, y: 0, k: 1 };
    this.isPanning = false;
    this.panStart = { x: 0, y: 0 };
    this.ro = null;
    this._keyHandler = null;

    this._buildDom();
    this._bindEvents();
    this.refit();
  }

  _buildDom() {
    this.container.innerHTML = "";
    this.container.className = "metro-shell";

    // Toolbar
    const toolbar = document.createElement("div");
    toolbar.className = "metro-toolbar";

    const lineGroup = document.createElement("div");
    lineGroup.className = "metro-toolbar-group";
    lineGroup.setAttribute("role", "group");
    lineGroup.setAttribute("aria-label", "Filter metro lines");

    const allBtn = this._makeFilterBtn("All Lines", "all", true);
    lineGroup.appendChild(allBtn);

    for (const line of this.graph.lines) {
      lineGroup.appendChild(this._makeFilterBtn(line.label, line.id, false));
    }

    const modeGroup = document.createElement("div");
    modeGroup.className = "metro-toolbar-group";

    // Station quick-jump / search selector
    const jumpSelect = document.createElement("select");
    jumpSelect.className = "metro-select";
    jumpSelect.setAttribute("aria-label", "Jump to a model station");
    jumpSelect.innerHTML =
      '<option value="">Jump to station…</option>' +
      this.graph.stations
        .map(
          (st) =>
            `<option value="${escapeHtml(st.id)}">${escapeHtml(st.name)} (${escapeHtml(st.layer)} • ${escapeHtml(st.conformanceStatus)})</option>`
        )
        .join("");
    jumpSelect.addEventListener("change", () => {
      if (!jumpSelect.value) return;
      this._jumpToStation(jumpSelect.value);
    });

    const modeSelect = document.createElement("select");
    modeSelect.className = "metro-select";
    modeSelect.setAttribute("aria-label", "Contract link filter");
    modeSelect.innerHTML = `
      <option value="all">All Links (Touchpoints &amp; Handshakes)</option>
      <option value="handshakes">Handshakes Only</option>
      <option value="touchpoints">Touchpoints Only</option>
    `;
    modeSelect.addEventListener("change", () => {
      this.contractMode = modeSelect.value;
      this.render();
    });

    const clearTraceBtn = document.createElement("button");
    clearTraceBtn.type = "button";
    clearTraceBtn.className = "metro-chip-btn";
    clearTraceBtn.textContent = "Reset Trace";
    clearTraceBtn.addEventListener("click", () => {
      this.focusedStationId = null;
      this.selectedEntity = null;
      this._hideInspector();
      this.render();
    });

    const zoomOutBtn = this._makeZoomBtn("−", "Zoom out", () => this._zoomBy(0.85));
    const zoomInBtn = this._makeZoomBtn("+", "Zoom in", () => this._zoomBy(1.18));
    const fitBtn = document.createElement("button");
    fitBtn.type = "button";
    fitBtn.className = "metro-chip-btn";
    fitBtn.textContent = "Fit View";
    fitBtn.setAttribute("aria-label", "Fit metro map to canvas");
    fitBtn.addEventListener("click", () => this.refit());

    modeGroup.append(jumpSelect, modeSelect, clearTraceBtn, zoomOutBtn, zoomInBtn, fitBtn);
    toolbar.append(lineGroup, modeGroup);

    // SVG Canvas
    this.svg = svgEl("svg", {
      class: "metro-svg",
      role: "img",
      "aria-label":
        "Assessment-Models Metro Map showing models, shared capabilities, touchpoints, and handshakes",
    });

    this.viewportGroup = svgEl("g");
    this.corridorsGroup = svgEl("g");
    this.linksGroup = svgEl("g");
    this.stationsGroup = svgEl("g");
    this.viewportGroup.append(this.corridorsGroup, this.linksGroup, this.stationsGroup);
    this.svg.appendChild(this.viewportGroup);

    // Directional arrowheads for handshake contract spurs (unidirectional
    // gets one arrowhead; bidirectional gets a double-headed indicator).
    const defs = svgEl("defs");
    defs.innerHTML = `
      <marker id="metro-hs-arrow" viewBox="0 0 10 10" refX="8.5" refY="5"
              markerWidth="7" markerHeight="7" orient="auto-start-reverse">
        <path d="M 0 1 L 9 5 L 0 9 z" fill="#a78bfa" />
      </marker>`;
    this.svg.insertBefore(defs, this.viewportGroup);

    // Tooltip & Inspector
    this.tooltip = document.createElement("div");
    this.tooltip.className = "metro-tooltip";
    this.tooltip.setAttribute("role", "tooltip");

    this.inspector = document.createElement("aside");
    this.inspector.className = "metro-inspector";
    this.inspector.setAttribute("aria-label", "Selected artifact inspector");
    this.inspector.hidden = true;

    // Bottom-left structured Transit Legend + coverage assurance readout
    const unlinkedCount = this.graph.stations.filter(
      (st) => st.touchpoints.length + st.handshakes.length === 0
    ).length;
    const legend = document.createElement("div");
    legend.className = "metro-legend";
    legend.setAttribute("role", "contentinfo");
    legend.setAttribute("aria-label", "Metro map legend and coverage summary");
    legend.innerHTML = `
      <div class="metro-legend-items">
        <span class="metro-legend-item"><span class="legend-swatch-line"></span>Corridor Track</span>
        <span class="metro-legend-item"><span class="legend-swatch-hub"></span>Interchange Hub</span>
        <span class="metro-legend-item"><span class="legend-swatch-tp"></span>Touchpoint (dashed + circle)</span>
        <span class="metro-legend-item"><span class="legend-swatch-hs"></span>Handshake (solid + diamond, arrows mark direction)</span>
      </div>
      <div class="metro-legend-coverage">${this.graph.stations.length} Models &amp; Artifacts Mapped${unlinkedCount > 0 ? ` • ${unlinkedCount} awaiting contracts` : ""}</div>
    `;

    this.container.append(toolbar, this.svg, legend, this.tooltip, this.inspector);
  }

  _makeFilterBtn(label, lineId, active) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `metro-chip-btn${active ? " is-active" : ""}`;
    btn.dataset.lineId = lineId;
    btn.textContent = label;
    btn.addEventListener("click", () => {
      this.selectedLine = lineId;
      this.container.querySelectorAll("[data-line-id]").forEach((b) => {
        b.classList.toggle("is-active", b.dataset.lineId === lineId);
      });
      this.render();
    });
    return btn;
  }

  _makeZoomBtn(label, ariaLabel, onClick) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "metro-zoom-btn";
    btn.textContent = label;
    btn.setAttribute("aria-label", ariaLabel);
    btn.addEventListener("click", onClick);
    return btn;
  }

  _zoomBy(factor) {
    this.transform.k = Math.max(0.35, Math.min(2.2, this.transform.k * factor));
    this._applyTransform();
  }

  _applyTransform() {
    const { x, y, k } = this.transform;
    this.viewportGroup.setAttribute(
      "transform",
      `translate(${x.toFixed(1)}, ${y.toFixed(1)}) scale(${k.toFixed(3)})`
    );
  }

  refit() {
    const rect = this.container.getBoundingClientRect();
    const layout = computeMetroLayout(this.graph, rect.width || 1200, rect.height || 720);
    this.layout = layout;
    this.transform = { ...layout.fitTransform };
    this._applyTransform();
    this.render();
  }

  /** Center the viewport on a station and trace its routes. */
  _jumpToStation(stationId) {
    if (!this.layout) return;
    const st = this.layout.stations.find((s) => s.id === stationId);
    if (!st) return;

    const rect = this.container.getBoundingClientRect();
    const k = Math.max(this.transform.k, 0.9);
    this.transform = {
      x: (rect.width || 1200) / 2 - st.x * k,
      y: (rect.height || 720) / 2 - st.y * k,
      k,
    };
    this.focusedStationId = stationId;
    this._applyTransform();
    this.render();
    const station = this.graph.stationMap.get(stationId);
    if (station) {
      this._openInspector(
        station.name,
        `${station.fullName} • ${station.version}`,
        `
          <p>${escapeHtml(station.description)}</p>
          <p><strong>Layer:</strong> ${escapeHtml(station.layer)}<br/>
          <strong>Conformance:</strong> ${escapeHtml(station.conformanceStatus)}<br/>
          <strong>Locales:</strong> ${escapeHtml(station.locales.join(", "))}<br/>
          <strong>Touchpoints:</strong> ${station.touchpoints.length} • <strong>Handshakes:</strong> ${station.handshakes.length}</p>
        `,
        station.htmlUrl
      );
    }
  }

  _showTooltip(html, clientX, clientY) {
    this.tooltip.innerHTML = html;
    this.tooltip.classList.add("is-visible");
    const pad = 14;
    const left = Math.min(window.innerWidth - 320, Math.max(pad, clientX + 12));
    const top = Math.min(window.innerHeight - 140, Math.max(pad, clientY - 12));
    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;
  }

  _hideTooltip() {
    this.tooltip.classList.remove("is-visible");
  }

  _openInspector(title, subtitle, bodyHtml, linkUrl) {
    this.inspector.innerHTML = `
      <div class="metro-inspector-head">
        <div>
          <div class="metro-inspector-kicker">${subtitle}</div>
          <h3 class="metro-inspector-title">${escapeHtml(title)}</h3>
        </div>
        <button type="button" id="metro-close-insp" class="metro-inspector-close" aria-label="Close inspector">✕</button>
      </div>
      <div class="metro-inspector-body">${bodyHtml}</div>
      ${
        linkUrl
          ? `<div class="metro-inspector-links"><a href="${escapeHtml(linkUrl)}" target="_blank" rel="noopener noreferrer">Open Repository on GitHub ↗</a></div>`
          : ""
      }
    `;
    this.inspector.hidden = false;
    this.inspector
      .querySelector("#metro-close-insp")
      ?.addEventListener("click", () => this._hideInspector());
  }

  _hideInspector() {
    this.inspector.hidden = true;
  }

  /** Trace sets for sub-network highlighting: when a station is focused,
   *  compute its directly connected stations and every corridor that passes
   *  through them, so corridors (not just stations/links) dim out. */
  _computeTraceSets() {
    const connectedStations = new Set();
    const activeLines = new Set();

    if (!this.focusedStationId) {
      return { hasFocus: false, connectedStations, activeLines };
    }

    connectedStations.add(this.focusedStationId);
    for (const edge of [...this.graph.touchpoints, ...this.graph.handshakes]) {
      if (edge.from_station_id === this.focusedStationId) {
        connectedStations.add(edge.to_station_id);
      }
      if (edge.to_station_id === this.focusedStationId) {
        connectedStations.add(edge.from_station_id);
      }
    }

    for (const st of this.layout.stations) {
      if (connectedStations.has(st.id)) {
        for (const lid of st.lineIds || [st.layer]) {
          activeLines.add(lid);
        }
      }
    }

    return { hasFocus: true, connectedStations, activeLines };
  }

  /** Render touchpoint / handshake spur + clickable transfer node. */
  _renderLinkNode(link, isHandshake, traced, lineMatch) {
    const active = traced && lineMatch;
    const color = isHandshake ? "#a78bfa" : "#34d399";
    const isBidirectional = !isHandshake || (link.direction || "bidirectional") === "bidirectional";
    const label = isHandshake
      ? `${link.label} — ${isBidirectional ? "bidirectional" : "unidirectional"} handshake from ${link.from_station_id} to ${link.to_station_id}`
      : `${link.label} — touchpoint from ${link.from_station_id} to ${link.to_station_id}`;

    const pathEl = svgEl("path", {
      d: link.d,
      fill: "none",
      stroke: color,
      "stroke-width": active ? (isHandshake ? 3 : 2.5) : isHandshake ? 1.75 : 1.5,
      ...(isHandshake ? { "stroke-linecap": "round" } : { "stroke-dasharray": "5 4" }),
      // Directional grammar: arrowhead at the target end, plus a start arrow
      // (auto-start-reverse) when the handshake is bidirectional.
      ...(isHandshake
        ? isBidirectional
          ? { "marker-end": "url(#metro-hs-arrow)", "marker-start": "url(#metro-hs-arrow)" }
          : { "marker-end": "url(#metro-hs-arrow)" }
        : {}),
      class: active ? "metro-flow-active" : "metro-dimmed",
    });

    let nodeEl;
    if (isHandshake) {
      nodeEl = svgEl("path", {
        d: `M ${link.mx} ${link.my - 8} L ${link.mx + 8} ${link.my} L ${link.mx} ${link.my + 8} L ${link.mx - 8} ${link.my} Z`,
        fill: "#1e1b4b",
        stroke: color,
        "stroke-width": 2.5,
        style: "cursor:pointer;",
        class: active ? "metro-highlighted" : "metro-dimmed",
      });
    } else {
      nodeEl = svgEl("circle", {
        cx: link.mx,
        cy: link.my,
        r: 6,
        fill: "#0f172a",
        stroke: color,
        "stroke-width": 2.5,
        style: "cursor:pointer;",
        class: active ? "metro-highlighted" : "metro-dimmed",
      });
    }
    nodeEl.setAttribute("tabindex", "0");
    nodeEl.setAttribute("role", "button");
    nodeEl.setAttribute("aria-label", label);

    const tooltipHtml = isHandshake
      ? `<strong>HANDSHAKE (${escapeHtml(link.direction)}):</strong> ${escapeHtml(link.label)}<br/><span style="color:#94a3b8;">${escapeHtml(link.contract_summary || "")}</span>`
      : `<strong>TOUCHPOINT:</strong> ${escapeHtml(link.label)}<br/><span style="color:#94a3b8;">${escapeHtml(link.contract_summary || "")}</span>`;

    const openInspector = () => {
      this.selectedEntity = link;
      this._openInspector(
        link.label,
        isHandshake
          ? `HANDSHAKE • ${(link.direction || "bidirectional").toUpperCase()} • ${link.compatibility || "*"}`
          : `TOUCHPOINT • COMPAT ${link.compatibility || "*"}`,
        `<p>${escapeHtml(link.contract_summary || "")}</p>
         <p><strong>From:</strong> ${escapeHtml(link.from_station_id)}<br/>
         <strong>To:</strong> ${escapeHtml(link.to_station_id)}<br/>
         <strong>Line:</strong> ${escapeHtml(link.line_id)}</p>`,
        null
      );
    };

    nodeEl.addEventListener("mousemove", (ev) => this._showTooltip(tooltipHtml, ev.clientX, ev.clientY));
    nodeEl.addEventListener("mouseleave", () => this._hideTooltip());
    nodeEl.addEventListener("focus", () => {
      const r = nodeEl.getBoundingClientRect();
      this._showTooltip(tooltipHtml, r.right, r.top);
    });
    nodeEl.addEventListener("blur", () => this._hideTooltip());
    nodeEl.addEventListener("click", (ev) => {
      ev.stopPropagation();
      this._hideTooltip();
      openInspector();
    });
    nodeEl.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        openInspector();
      }
    });

    this.linksGroup.append(pathEl, nodeEl);
  }

  render() {
    if (!this.layout) return;
    this.corridorsGroup.innerHTML = "";
    this.linksGroup.innerHTML = "";
    this.stationsGroup.innerHTML = "";

    const { hasFocus, connectedStations, activeLines } = this._computeTraceSets();

    // 1. Corridor tracks: dim corridors outside the focused sub-network
    for (const corr of this.layout.corridorPaths) {
      const filterActive = this.selectedLine === "all" || this.selectedLine === corr.lineId;
      const focusActive = !hasFocus || activeLines.has(corr.lineId);
      const isLit = filterActive && focusActive;
      this.corridorsGroup.appendChild(
        svgEl("path", {
          d: corr.d,
          fill: "none",
          stroke: corr.color,
          "stroke-width": isLit ? 5 : 3,
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          class: isLit ? "metro-highlighted" : "metro-dimmed",
        })
      );
    }

    // Micro-label visibility (semantic zoom): hide station sub-labels at low zoom
    const showMicroLabels = this.transform.k >= 0.55;

    // 2. Touchpoints & Handshakes
    const showTouchpoints = this.contractMode === "all" || this.contractMode === "touchpoints";
    const showHandshakes = this.contractMode === "all" || this.contractMode === "handshakes";

    if (showTouchpoints) {
      for (const tp of this.layout.touchpointEdges) {
        const traced =
          !this.focusedStationId ||
          tp.from_station_id === this.focusedStationId ||
          tp.to_station_id === this.focusedStationId;
        const lineMatch = this.selectedLine === "all" || tp.line_id === this.selectedLine;
        this._renderLinkNode(tp, false, traced, lineMatch);
      }
    }

    if (showHandshakes) {
      for (const hs of this.layout.handshakeEdges) {
        const traced =
          !this.focusedStationId ||
          hs.from_station_id === this.focusedStationId ||
          hs.to_station_id === this.focusedStationId;
        const lineMatch = this.selectedLine === "all" || hs.line_id === this.selectedLine;
        this._renderLinkNode(hs, true, traced, lineMatch);
      }
    }

    // 3. Stations with collision-aware label slots from the layout engine
    for (const st of this.layout.stations) {
      const lineMatch = this.selectedLine === "all" || st.lineIds.includes(this.selectedLine);
      const focusMatch = !hasFocus || connectedStations.has(st.id);
      const visible = lineMatch && focusMatch;

      const g = svgEl("g", {
        transform: `translate(${st.x}, ${st.y})`,
        style: "cursor:pointer;",
        class: visible ? "metro-highlighted" : "metro-dimmed",
        tabindex: "0",
        role: "button",
        "aria-label": `${st.name} (${st.version}), ${st.concern}`,
      });

      if (st.isInterchange) {
        g.appendChild(
          svgEl("circle", {
            r: 14,
            fill: "#0f172a",
            stroke: "#f8fafc",
            "stroke-width": 2.5,
          })
        );
      }

      g.appendChild(
        svgEl("circle", {
          r: 8.5,
          fill: this.focusedStationId === st.id ? "#f59e0b" : "#38bdf8",
          stroke: "#090d16",
          "stroke-width": 2,
        })
      );

      const lp = st.labelPlacement || { dx: 18, dy: -3, anchor: "start" };
      const titleText = svgEl("text", {
        x: lp.dx,
        y: lp.dy,
        "text-anchor": lp.anchor,
        class: "metro-station-label",
      });
      titleText.textContent = st.name;

      const metaText = svgEl("text", {
        x: lp.dx,
        y: lp.dy + 15,
        "text-anchor": lp.anchor,
        class: "metro-station-sub",
        ...(showMicroLabels ? {} : { opacity: 0 }),
      });
      metaText.textContent = `${st.version} • ${st.touchpoints.length}TP / ${st.handshakes.length}HS`;

      g.append(titleText, metaText);

      const tooltipHtml = `<strong>${escapeHtml(st.name)}</strong> (${escapeHtml(st.version)})<br/><span style="color:#94a3b8;">${escapeHtml(st.concern)}</span><br/><span style="color:#64748b;font-size:0.72rem;">${st.touchpoints.length} touchpoint(s) • ${st.handshakes.length} handshake(s) • ${escapeHtml(st.conformanceStatus)}</span>`;

      const activate = (ev) => {
        if (ev) ev.stopPropagation();
        this._hideTooltip();
        const wasFocused = this.focusedStationId === st.id;
        this.focusedStationId = wasFocused ? null : st.id;
        this.render();
        this._openInspector(
          st.name,
          `${st.fullName} • ${st.version}`,
          `
            <p>${escapeHtml(st.description)}</p>
            <p><strong>Layer:</strong> ${escapeHtml(st.layer)}<br/>
            <strong>Conformance:</strong> ${escapeHtml(st.conformanceStatus)}<br/>
            <strong>License:</strong> ${escapeHtml(st.license)}<br/>
            <strong>Locales:</strong> ${escapeHtml(st.locales.join(", "))}<br/>
            <strong>Touchpoints:</strong> ${st.touchpoints.length} • <strong>Handshakes:</strong> ${st.handshakes.length}</p>
            ${
              st.standards.length
                ? `<p><strong>Standards:</strong> ${st.standards.map((s) => escapeHtml(s)).join(", ")}</p>`
                : ""
            }
          `,
          st.htmlUrl
        );
      };

      g.addEventListener("mousemove", (ev) => this._showTooltip(tooltipHtml, ev.clientX, ev.clientY));
      g.addEventListener("mouseleave", () => this._hideTooltip());
      g.addEventListener("focus", () => {
        const r = g.getBoundingClientRect();
        this._showTooltip(tooltipHtml, r.right, r.top);
      });
      g.addEventListener("blur", () => this._hideTooltip());
      g.addEventListener("click", activate);
      g.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          activate(null);
        }
      });

      this.stationsGroup.appendChild(g);
    }
  }

  _bindEvents() {
    this.svg.addEventListener("pointerdown", (e) => {
      if (
        e.target.closest(
          "g[role='button'], path[role='button'], circle[role='button'], [style*='cursor:pointer']"
        )
      ) {
        return;
      }
      this.isPanning = true;
      this.panStart = { x: e.clientX - this.transform.x, y: e.clientY - this.transform.y };
      this.svg.setPointerCapture(e.pointerId);
    });

    this.svg.addEventListener("pointermove", (e) => {
      if (!this.isPanning) return;
      this.transform.x = e.clientX - this.panStart.x;
      this.transform.y = e.clientY - this.panStart.y;
      this._applyTransform();
    });

    this.svg.addEventListener("pointerup", () => {
      this.isPanning = false;
    });

    this.svg.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        this._zoomBy(e.deltaY < 0 ? 1.1 : 0.9);
      },
      { passive: false }
    );

    this.ro = new ResizeObserver(() => this.refit());
    this.ro.observe(this.container);

    this._keyHandler = (e) => {
      if (e.key === "Escape") {
        this._hideTooltip();
        this._hideInspector();
        if (this.focusedStationId) {
          this.focusedStationId = null;
          this.render();
        }
      }
    };
    document.addEventListener("keydown", this._keyHandler);
  }

  /** Detach listeners; called when the view is unmounted or re-mounted. */
  dispose() {
    if (this.ro) this.ro.disconnect();
    if (this._keyHandler) document.removeEventListener("keydown", this._keyHandler);
    this._hideTooltip();
    this.container.innerHTML = "";
  }
}
