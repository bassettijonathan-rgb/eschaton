import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative base so the built site works from any path, including GitHub Pages.
  base: './',
  build: {
    target: 'es2022',
    sourcemap: true,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
