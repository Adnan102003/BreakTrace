import 'dotenv/config';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const apiProxy = {
  target: `http://127.0.0.1:${process.env.BREAKTRACE_PORT || 4311}`,
  // The workspace guard checks Origin against the dashboard's original Host.
  changeOrigin: false,
};
export default defineConfig({
  root: 'apps/web',
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: { manualChunks: { charts: ['recharts'], graph: ['@xyflow/react'] } },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    fs: { allow: [process.cwd()] },
    proxy: {
      '/api': apiProxy,
      '/socket.io': { ...apiProxy, ws: true },
    },
  },
});
