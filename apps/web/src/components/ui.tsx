import * as React from 'react';
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from './Icon';
import { ORDER_STATUS_LABELS, SPONSORED_LABEL, type OrderStatus } from '@acoyaradas/shared';

export function Spinner({ label = 'Cargando…', size = 'md' }: { label?: string; size?: 'sm' | 'md' | 'lg' }) {
  const sizeClasses = {
    sm: 'h-4 w-4 border-[2px]',
    md: 'h-5 w-5 border-2',
    lg: 'h-8 w-8 border-2',
  };
  return (
    <div className="flex items-center justify-center gap-2 py-2 text-sm text-ink-500">
      <span className={`${sizeClasses[size]} animate-spin rounded-full border-ink-300 border-t-brand-500`} />
      {label}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon = '🧭',
}: {
  title: string;
  description?: string;
  action?: { label: string; to: string } | ReactNode;
  icon?: string;
}) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-3xl" aria-hidden>
        {icon}
      </div>
      <h3 className="text-lg font-semibold text-ink-900">{title}</h3>
      {description ? <p className="max-w-md text-sm text-ink-500">{description}</p> : null}
      {action && typeof action === 'object' && 'to' in action ? (
        <Link to={action.to} className="btn-primary mt-2">
          {action.label}
        </Link>
      ) : (
        action
      )}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-12 text-center">
      <div className="grid h-14 w-14 place-items-center rounded-2xl bg-red-50 text-3xl" aria-hidden>
        ⚠️
      </div>
      <p className="max-w-md text-sm text-ink-700">{message}</p>
      {onRetry ? (
        <button type="button" className="btn-secondary" onClick={onRetry}>
          Reintentar
        </button>
      ) : null}
    </div>
  );
}

const ALERT_TONES = {
  info: 'border-sky-200 bg-sky-50 text-sky-900',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  warn: 'border-amber-200 bg-amber-50 text-amber-900',
  danger: 'border-red-200 bg-red-50 text-red-900',
} as const;



/** Mensaje informativo con tono, para reemplazar divs sueltos. */
export function Alert({
  children,
  tone = 'info',
  className = '',
}: {
  children: ReactNode;
  tone?: keyof typeof ALERT_TONES;
  className?: string;
}) {
  return (
    <div
      role={tone === 'danger' ? 'alert' : 'status'}
      className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${ALERT_TONES[tone]} ${className}`}
    >
      <Icon
        name={tone === 'success' ? 'success' : tone === 'info' ? 'info' : 'warning'}
        className="mt-0.5 h-4 w-4 shrink-0"
      />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function SectionTitle({
  title,
  subtitle,
  action,
  icon,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  icon?: string;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-2">
        {icon ? (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-50 text-lg" aria-hidden>
            {icon}
          </span>
        ) : null}
        <div>
          <h2 className="text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">{title}</h2>
          {subtitle ? <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}

/** Barra de filtros/acciones reutilizable. */
export function Toolbar({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`card flex flex-wrap items-end gap-3 p-4 ${className}`}>{children}</div>
  );
}

/** Etiqueta obligatoria de contenido patrocinado. */
export function SponsoredTag({ className = '' }: { className?: string }) {
  return (
    <span
      className={`badge bg-amber-100 text-amber-800 ring-1 ring-amber-300 ${className}`}
      title={`${SPONSORED_LABEL}: contenido pago por un comercio`}
    >
      {SPONSORED_LABEL}
    </span>
  );
}

const STATUS_STYLES: Record<OrderStatus, string> = {
  pending_confirmation: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-sky-100 text-sky-800',
  preparing: 'bg-violet-100 text-violet-800',
  ready: 'bg-teal-100 text-teal-800',
  rider_assigned: 'bg-indigo-100 text-indigo-800',
  on_the_way: 'bg-blue-100 text-blue-800',
  delivered: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-ink-200 text-ink-700',
  incident: 'bg-red-100 text-red-800',
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`badge ${STATUS_STYLES[status] ?? 'bg-ink-100 text-ink-700'}`}>
      {ORDER_STATUS_LABELS[status] ?? status}
    </span>
  );
}

export function AvailabilityBadge({ isOpen }: { isOpen: boolean }) {
  return (
    <span
      className={`badge ${isOpen ? 'bg-emerald-100 text-emerald-800' : 'bg-ink-200 text-ink-600'}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${isOpen ? 'bg-emerald-500' : 'bg-ink-400'}`}
        aria-hidden
      />
      {isOpen ? 'Abierto' : 'Cerrado'}
    </span>
  );
}

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    // focus first focusable
    const t = window.setTimeout(() => {
      const el = ref.current?.querySelector<HTMLElement>('button, input, select, textarea, a, [tabindex]:not([tabindex="-1"])');
      el?.focus();
    }, 50);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      window.clearTimeout(t);
    };
  }, [open]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-ink-900/70 p-3 pt-16 backdrop-blur-sm transition-all sm:items-center sm:p-6 sm:pt-6"
      onClick={() => {}}
    >
      <div ref={ref} className="animate-fade-up my-4 max-h-[calc(100vh-8rem)] w-full max-w-3xl overflow-auto rounded-3xl bg-white p-6 shadow-2xl ring-1 ring-ink-900/5 sm:max-h-[calc(100vh-3rem)] sm:p-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-xl font-bold tracking-tight text-ink-900 sm:text-2xl">{title}</h3>
            <div className="mt-1 h-1 w-12 rounded-full bg-gradient-to-r from-brand-500 to-amber-500" />
          </div>
          <button
            type="button"
            className="btn-ghost -mr-2 -mt-1 grid h-9 w-9 place-items-center rounded-full p-0"
            onClick={onClose}
            aria-label="Cerrar"
          >
            <Icon name="close" className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-5">{children}</div>
        {footer ? <div className="mt-7 flex flex-wrap justify-end gap-2 border-t border-ink-100 pt-5">{footer}</div> : null}
      </div>
    </div>
  );
}

/** Diálogo de confirmación para acciones destructivas. */
export function ConfirmDialog({
  open,
  title = '¿Confirmás la acción?',
  description,
  confirmLabel = 'Eliminar',
  cancelLabel = 'Cancelar',
  tone = 'danger',
  busy = false,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  title?: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={tone === 'danger' ? 'btn-danger' : 'btn-primary'}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Procesando…' : confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-sm text-ink-600">{description}</div>
    </Modal>
  );
}

export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
  icon,
  to,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'default' | 'brand' | 'warn' | 'danger';
  icon?: string;
  /** Si se indica, la tarjeta navega a esa ruta. */
  to?: string;
}) {
  const tones = {
    default: 'text-ink-900',
    brand: 'text-brand-600',
    warn: 'text-amber-600',
    danger: 'text-red-600',
  } as const;

  const body = (
    <div className="card card-hover h-full px-4 py-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-500">{label}</p>
        {icon ? (
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-ink-50 text-base" aria-hidden>
            {icon}
          </span>
        ) : null}
      </div>
      <p className={`mt-1 text-2xl font-bold ${tones[tone]}`}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-ink-500">{hint}</p> : null}
    </div>
  );

  return to ? (
    <Link to={to} className="block rounded-2xl focus-visible:ring-2">
      {body}
    </Link>
  ) : (
    body
  );
}

export function Field({
  label,
  error,
  children,
  hint,
  htmlFor,
}: {
  label: string;
  error?: string;
  children: ReactNode;
  hint?: string;
  htmlFor?: string;
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {React.isValidElement(children) ? React.cloneElement(children as React.ReactElement<any>, { id: htmlFor }) : children}
      {hint && !error ? <span className="mt-1 block text-xs text-ink-500">{hint}</span> : null}
      {error ? <span className="mt-1 block text-xs text-red-600">{error}</span> : null}
    </label>
  );
}
