import React from 'react';
import ReactDOM from 'react-dom/client';

// Desactivar worker ANTES de importar maplibre-gl (ambos nombres por compatibilidad)
(window as any).MAPLIBRE_GL_NO_WORKER = true;
(window as any).MAPBOX_GL_NO_WORKER = true;

// Override global de Worker para bloquear el worker de maplibre-gl si todo falla
const OriginalWorker = window.Worker;
window.Worker = function(url: string | URL, options?: WorkerOptions) {
  const urlStr = url.toString();
  if (urlStr.includes('maplibre-gl-worker') || urlStr.includes('mapbox-gl-worker')) {
    console.log('[WorkerBlock] Bloqueado worker de maplibre:', urlStr);
    return { terminate: () => {}, postMessage: () => {}, onmessage: null, onerror: null, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true } as unknown as Worker;
  }
  return new OriginalWorker(url, options);
};

import 'maplibre-gl';
console.log('[Build] ' + Date.now() + ' - maplibre-gl loaded');
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { SessionProvider } from './lib/session';
import { CartProvider } from './lib/cart';
import { ToastProvider } from './components/Toast';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <SessionProvider>
          <CartProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </CartProvider>
        </SessionProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>,
);
