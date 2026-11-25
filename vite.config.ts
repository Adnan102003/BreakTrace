import 'dotenv/config';
import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiProxy = {
  target: `http://127.0.0.1:${process.env.BREAKTRACE_PORT || 4311}`,
  // The workspace guard checks Origin against the dashboard's original Host.
  changeOrigin: false,
};
export default defineConfig({
  root: 'apps/web',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: { manualChunks: { charts: ['recharts'], graph: ['@xyflow/react'] } },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: { allow: ['apps/web', 'packages/shared', 'node_modules'].map((directory) => resolve(directory)) },
    proxy: {
      '/api': apiProxy,
      '/socket.io': { ...apiProxy, ws: true },
    },
  },
});
