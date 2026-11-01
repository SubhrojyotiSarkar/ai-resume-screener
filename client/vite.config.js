import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Read VITE_* variables from the repo-root .env (shared with the other services).
  envDir: '..',
  server: { port: 5173 },
  // The bundle is ~200 kB gzipped, almost all React/Router/Query; fine for an internal tool.
  build: { chunkSizeWarningLimit: 700 },
});
