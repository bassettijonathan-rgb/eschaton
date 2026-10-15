import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the built site works from any path, including GitHub Pages.
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
    rollupOptions: {
      output: {
        // Three.js changes rarely; keep it in its own cacheable chunk.
        manualChunks: { three: ['three'] },
      },
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
