/**
 * Entry loader for the /gateway/ metro map.
 *
 * Loads data/ecosystem-registry.json (with a deterministic seed fallback from
 * metro-graph.js), mounts MetroCanvasController into the gateway <main>, and
 * re-mounts / disposes the controller on hash navigation:
 *
 *   import { installMetroRouting } from "./metro-entry.js";
 *   installMetroRouting(document.getElementById("app"));
 *
 * The SPA router (src/main.ts) uses the lower-level mountMetro() /
 * disposeActiveMetro() primitives from its '#/' view instead.
 */
import { MetroCanvasController } from "./metro-canvas.js";
import { METRO_SEED_REGISTRY } from "./metro-graph.js";

const DEFAULT_REGISTRY_URL = "../data/ecosystem-registry.json";

let activeController = null;

/** Dispose the currently mounted controller, if any. */
export function disposeActiveMetro() {
  if (activeController && typeof activeController.dispose === "function") {
    activeController.dispose();
  }
  activeController = null;
}

/**
 * Fetch the ecosystem registry. Falls back to the deterministic seed registry
 * when the file is missing, empty, or the page runs offline.
 */
export async function loadEcosystemRegistry(registryUrl = DEFAULT_REGISTRY_URL) {
  try {
    const res = await fetch(registryUrl, { cache: "no-cache" });
    if (!res.ok) return METRO_SEED_REGISTRY;
    const registry = await res.json();
    if (registry && Array.isArray(registry.artifacts) && registry.artifacts.length > 0) {
      return registry;
    }
    return METRO_SEED_REGISTRY;
  } catch {
    return METRO_SEED_REGISTRY;
  }
}

/**
 * Load the registry and mount the MetroCanvasController into `mainEl`.
 * Any previously mounted controller is disposed first, so calling this on
 * initial load and again on hashchange is safe.
 */
export async function mountMetro(mainEl, registryUrl = DEFAULT_REGISTRY_URL) {
  if (!mainEl) return null;
  disposeActiveMetro();
  const registry = await loadEcosystemRegistry(registryUrl);
  activeController = new MetroCanvasController(mainEl, registry);
  return activeController;
}

function isMetroRoute(hash) {
  return /^#?\/?$/.test(hash || "");
}

/** Route hash '#/ default' / '#/' → metro map; anything else → dispose. */
export function isMetroHash() {
  return isMetroRoute(location.hash);
}

/**
 * Standalone wiring for /gateway/index.html: mounts the metro map on initial
 * load, re-mounts when navigating back to #/, and disposes it when navigating
 * away. Returns an uninstall function.
 */
export function installMetroRouting(mainEl, registryUrl = DEFAULT_REGISTRY_URL) {
  const update = () => {
    if (isMetroHash()) {
      void mountMetro(mainEl, registryUrl);
    } else {
      disposeActiveMetro();
    }
  };
  window.addEventListener("hashchange", update);
  update(); // initial load
  return () => window.removeEventListener("hashchange", update);
}
