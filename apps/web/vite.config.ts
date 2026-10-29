import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Configuración de Vite para acoYAradas!.
 * - El frontend consume la API por `/api` (mismo origen en producción).
 * - En desarrollo se hace proxy a http://localhost:3001 para evitar CORS.
 */
export default defineConfig({
  plugins: [react()],
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
        }
      }
    },
    worker: {
      format: 'es',
      plugins: () => []
    }
  },
});
