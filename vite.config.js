import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Relative base so the same dist/ works at a domain root (Netlify) and under a
  // subpath (GitHub Pages /nba-schedule/).
  base: './',
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.js'],
    // The committed 2025-26 season is ~1,320 games, so a few App integration tests
    // render well over a thousand cards; under coverage instrumentation on CI's slower
    // runners that overruns the 5s default. 30s gives ample headroom (they run in <7s).
    testTimeout: 30000,
    hookTimeout: 30000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'json'],
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/main.jsx', 'src/data/**'],
    },
  },
})
