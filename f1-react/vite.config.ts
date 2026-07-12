import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', // caminhos relativos — funciona em subpasta (GitHub Pages)
  test: {
    environment: 'node',        // motor é puro; e2e usa Playwright separado
    include: ['tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      // types.ts = só interfaces (sem código); buildTrackPathFromSVG precisa de DOM
      // (coberto pelo e2e Playwright, não pelo unit em ambiente node).
      exclude: ['src/lib/engine/types.ts'],
      thresholds: { lines: 95, functions: 95, statements: 95, branches: 85 },
    },
  },
});
