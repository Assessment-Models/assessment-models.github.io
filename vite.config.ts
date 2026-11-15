import { defineConfig } from 'vite';

// Org-root GitHub Pages site: served at https://assessment-models.github.io/
export default defineConfig({
  base: '/',
  build: {
    target: 'es2022',
    outDir: 'dist',
  },
});
