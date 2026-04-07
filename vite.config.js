import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Sylefi Wellness — Vite config
// `base` MUST match the GitHub repo name because GitHub Pages serves
// the site from https://<username>.github.io/<repo-name>/.
// If you ever rename the repo, update this value.
export default defineConfig({
  base: '/Sylefi-Workout-WebApp/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
