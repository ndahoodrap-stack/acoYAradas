import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { Icon } from './Icon';

export function Drawer({
  open,
  title,
  onClose,
  children,
  side = 'right',
}: {
  open: boolean;
  title?: string;
  onClose: () => void;
  children: ReactNode;
  side?: 'left' | 'right';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1000]">
      <div
        className="absolute inset-0 bg-ink-900/60 backdrop-blur-sm animate-fade-in"
        onClick={onClose}
      />
      <div
        className={`absolute top-0 h-full w-[85%] max-w-sm bg-white shadow-2xl animate-fade-up ${
          side === 'left' ? 'left-0' : 'right-0'
        }`}
      >
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
          {title ? <h3 className="text-base font-bold text-ink-900">{title}</h3> : <span />}
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full text-ink-500 hover:bg-ink-100"
            aria-label="Cerrar"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>
        <div className="h-[calc(100%-3.5rem)] overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}