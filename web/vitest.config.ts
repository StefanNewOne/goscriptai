import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Component/unit tests run under jsdom with Testing Library. Kept separate from
// vite.config.ts so the dev server config stays clean.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
