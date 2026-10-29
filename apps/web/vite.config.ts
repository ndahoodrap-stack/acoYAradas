import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Configuración de Vite para acoYAradas!.
 * - El frontend consume la API por `/api` (mismo origen en producción).
 * - En desarrollo se hace proxy a http://localhost:3001 para evitar CORS.
 */

// Plugin to ensure .mjs files are served with correct MIME type (Fix 1 for MapLibre worker)
const mjsMimePlugin = {
  name: 'mjs-mime-type',
  configureServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url?.endsWith('.mjs')) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      }
      next();
    });
  },
  configurePreviewServer(server) {
    server.middlewares.use((req, res, next) => {
      if (req.url?.endsWith('.mjs')) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
      }
      next();
    });
  },
};

export default defineConfig({
  plugins: [react(), mjsMimePlugin],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY ?? 'http://localhost:3001',
        changeOrigin: true,
      },
      '/uploads': {
        target: process.env.VITE_API_PROXY ?? 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY ?? 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  optimizeDeps: {
    // El paquete compartido se entrega como código TypeScript.
    exclude: ['@acoyaradas/shared'],
    // Forzar pre-bundling de maplibre-gl para evitar imports dinámicos sueltos
    include: ['maplibre-gl'],
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('maplibre-gl')) return 'maplibre-gl';
        },
        chunkFileNames: (chunkInfo) => {
          if (chunkInfo.name === 'maplibre-gl') {
            return 'assets/maplibre-gl.js';
          }
          return 'assets/[name]-[hash].js';
        }
      }
    },
    worker: {
      format: 'es',
      plugins: () => []
    }
  },
});
