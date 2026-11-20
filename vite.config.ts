import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Org-root GitHub Pages site: served at https://assessment-models.github.io/
// Two entries:
//   /         → marketing homepage (index.html)
//   /gateway/ → the assessment gateway SPA (gateway/index.html, hash-routed)
export default defineConfig({
  base: '/',
  server: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
  },
  preview: {
    host: '0.0.0.0',
    port: 3000,
    allowedHosts: true,
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        gateway: fileURLToPath(new URL('./gateway/index.html', import.meta.url)),
      },
    },
  },
});
