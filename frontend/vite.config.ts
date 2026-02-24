import path from 'path';
import { existsSync } from 'fs';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In Docker: shared-components is copied to ./shared-components (same dir as vite.config)
// In local dev: it lives two levels up (MintStudio/shared-components)
const sharedLocal = path.resolve(__dirname, 'shared-components');
const sharedUp    = path.resolve(__dirname, '../../shared-components');
const sharedComponentsDir = existsSync(sharedLocal) ? sharedLocal : sharedUp;
const frontendNodeModules = path.resolve(__dirname, 'node_modules');

export default defineConfig({
  plugins: [react()],
  base: '/mintstock/',
  resolve: {
    alias: {
      '@shared': sharedComponentsDir,
      'shared-components': sharedComponentsDir,
      'lucide-react': path.join(frontendNodeModules, 'lucide-react'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3003',
        changeOrigin: true,
      },
    },
  },
  preview: {
    allowedHosts: ['wtm.az', 'localhost', '127.0.0.1'],
  },
});
