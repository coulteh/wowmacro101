import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works from a GitHub Pages subpath.
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    // The spell dataset is a deliberately separate ~1 MB chunk (~310 kB gzipped) that
    // is fetched after first paint, so the app shell stays around 21 kB and is usable
    // before the data lands. Vite's default 500 kB warning is a false positive here;
    // raised so that a real regression in the app bundle is still visible.
    chunkSizeWarningLimit: 1200,
  },
});
