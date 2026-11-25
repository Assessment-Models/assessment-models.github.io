/**
 * Landing view - the Metro Map canvas (previously: free-floating constellation).
 *
 * Independently governed maturity models are Stations, architectural layers
 * and shared capabilities are Metro Lines, touchpoints map to transfer nodes
 * and handshakes to interchange bridges. The transit network is built from
 * data/ecosystem-registry.json (with a deterministic seed fallback when the
 * registry is missing or offline).
 *
 * The router calls this view on initial load and on every hashchange that
 * lands on #/, so the metro canvas mounts (and re-fits) whenever the visitor
 * navigates back to the gateway landing route.
 */
import '../../gateway/assets/css/gateway-metro.css';
import { mountMetro, disposeActiveMetro } from '../../gateway/assets/js/metro-entry.js';

export async function renderMetro(root: HTMLElement): Promise<void> {
  // Full-bleed mode: drop the shell's content max-width/padding while the
  // metro canvas is mounted (removed on the next route render).
  document.body.classList.add('metro-mode');

  // The gateway SPA is served from /gateway/, so the relative registry URL
  // resolves to /data/ecosystem-registry.json at the site root in both the
  // raw-repo and Vite-built deployments.
  await mountMetro(root, '../data/ecosystem-registry.json');
}

export { disposeActiveMetro };
