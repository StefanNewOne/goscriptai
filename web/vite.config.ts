import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Dev server + API proxy. The API port is read from the repo-root .env
// (API_PORT / WEB_PORT) so a per-machine port override needs no code change.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, `${process.cwd()}/..`, '');
  const apiPort = env.API_PORT || '3001';
  const webPort = Number(env.WEB_PORT) || 5182;
  return {
    plugins: [react()],
    server: {
      port: webPort,
      strictPort: true,
      proxy: {
        '/api': `http://localhost:${apiPort}`,
      },
    },
  };
});
