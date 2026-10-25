import { createContext, useCallback, useContext, useState } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';

type ToastTone = 'info' | 'success' | 'warn' | 'danger';
interface ToastItem { id: number; message: string; tone: ToastTone; }

const ToastContext = createContext<{ push: (message: string, tone?: ToastTone) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, message, tone }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="pointer-events-none fixed right-4 top-4 z-[1100] flex w-full max-w-sm flex-col gap-2" aria-live="polite">
        {items.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-2 rounded-xl border px-4 py-3 text-sm shadow-lg animate-fade-up ${
              t.tone === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : t.tone === 'warn' ? 'border-amber-200 bg-amber-50 text-amber-900'
                : t.tone === 'danger' ? 'border-red-200 bg-red-50 text-red-900'
                : 'border-sky-200 bg-sky-50 text-sky-900'
            }`}
            role={t.tone === 'danger' ? 'alert' : 'status'}
          >
            <Icon name={t.tone === 'success' ? 'success' : t.tone === 'info' ? 'info' : 'warning'} className="mt-0.5 h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">{t.message}</span>
            <button
              type="button"
              onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
              className="grid h-6 w-6 place-items-center rounded-full text-current/60 hover:bg-black/5"
              aria-label="Cerrar"
            >
              <Icon name="close" className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}