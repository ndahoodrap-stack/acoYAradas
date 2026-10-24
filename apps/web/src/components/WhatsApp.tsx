import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { WhatsAppOrderMessagesDto, WhatsAppRecipient, WhatsAppTargetDto } from '@acoyaradas/shared';
import { api } from '../lib/api';
import { Modal } from './ui';

/** Abre WhatsApp Desktop/Web con el chat y el mensaje precargados. */
export function openWhatsApp(target: WhatsAppTargetDto): boolean {
  try {
    const win = window.open(target.app_link, '_blank', 'noopener,noreferrer');
    if (win) return true;
  } catch {
    // El navegador puede bloquear whatsapp://; se intenta con wa.me.
  }
  try {
    const web = window.open(target.link, '_blank', 'noopener,noreferrer');
    return Boolean(web);
  } catch {
    return false;
  }
}

/** Botón compacto que abre la hoja de mensajes de un pedido. */
export function WhatsAppButton({
  onClick,
  label = 'WhatsApp',
  className = '',
}: {
  onClick: () => void;
  label?: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`btn-whatsapp ${className}`}
      onClick={onClick}
      title="Enviar el pedido por WhatsApp"
    >
      <span aria-hidden>💬</span>
      {label}
    </button>
  );
}

const RECIPIENT_LABELS: Record<WhatsAppRecipient, string> = {
  owner: 'Encargado',
  store: 'Comercio',
  rider: 'Repartidor',
  customer: 'Cliente',
};

const RECIPIENT_ICONS: Record<WhatsAppRecipient, string> = {
  owner: '👑',
  store: '🏪',
  rider: '🛵',
  customer: '👤',
};

/**
 * Hoja de destinos de WhatsApp para un pedido.
 * Muestra el texto que se enviará y permite abrir cada chat o copiarlo.
 * En modo `links` no hay envío silencioso: se abre WhatsApp Desktop.
 */
export function WhatsAppSheet({
  orderId,
  preferred,
  autoOpen = false,
  onClose,
}: {
  orderId: string | null;
  preferred?: WhatsAppRecipient;
  autoOpen?: boolean;
  onClose: () => void;
}) {
  const autoOpened = useRef(false);
  const [message, setMessage] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['whatsapp-order', orderId],
    queryFn: () => api.get<WhatsAppOrderMessagesDto>(`/whatsapp/orders/${orderId}/messages`),
    enabled: Boolean(orderId),
    staleTime: 15_000,
  });

  useEffect(() => {
    if (!orderId) autoOpened.current = false;
    setMessage(null);
  }, [orderId]);

  useEffect(() => {
    if (!autoOpen || autoOpened.current || !data?.targets.length) return;
    const target = data.targets.find((t) => t.recipient === preferred) ?? data.targets[0];
    if (!target) return;
    autoOpened.current = true;
    const ok = openWhatsApp(target);
    if (!ok) {
      setMessage('El navegador bloqueó la apertura automática. Usá “Abrir chat”.');
    }
  }, [autoOpen, data, preferred]);

  const copy = async (target: WhatsAppTargetDto) => {
    try {
      await navigator.clipboard.writeText(target.text);
      setMessage(`Mensaje para ${RECIPIENT_LABELS[target.recipient]} copiado.`);
    } catch {
      setMessage('No se pudo copiar automáticamente. Seleccioná el texto y copialo.');
    }
  };

  return (
    <Modal
      open={orderId !== null}
      title={`WhatsApp · pedido ${data?.order_code ?? ''}`}
      onClose={onClose}
      footer={
        <button type="button" className="btn-secondary" onClick={onClose}>
          Cerrar
        </button>
      }
    >
      <p className="text-sm text-ink-600">
        Los mensajes salen desde <strong>tu WhatsApp</strong> (Desktop, Web o teléfono). Elegí un
        destinatario y abrí el chat con el pedido completo ya escrito.
      </p>

      {message ? (
        <div className="rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">{message}</div>
      ) : null}

      {isLoading ? (
        <p className="py-6 text-center text-sm text-ink-500">Armando los mensajes…</p>
      ) : error ? (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
          {(error as Error).message}
        </p>
      ) : !data?.targets.length ? (
        <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
          El pedido no tiene teléfonos cargados para WhatsApp. Revisá el número del comercio, del
          repartidor y del cliente.
        </p>
      ) : (
        <div className="space-y-3">
          {data.targets.map((target) => (
            <div key={target.recipient} className="rounded-xl border border-ink-200 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-ink-900">
                    <span aria-hidden>{RECIPIENT_ICONS[target.recipient]}</span>{' '}
                    {RECIPIENT_LABELS[target.recipient]} · {target.name}
                  </p>
                  <p className="text-xs text-ink-500">{target.phone}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-whatsapp" onClick={() => openWhatsApp(target)}>
                    Abrir chat
                  </button>
                  <button
                    type="button"
                    className="btn-secondary px-3 py-1.5 text-xs"
                    onClick={() => void copy(target)}
                  >
                    Copiar
                  </button>
                </div>
              </div>
              <pre className="mt-2 max-h-36 overflow-auto whitespace-pre-wrap rounded-lg bg-ink-50 p-2 text-[11px] leading-relaxed text-ink-700">
                {target.text}
              </pre>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-ink-500">
        💡 Si usás WhatsApp Desktop, el chat se abre en la aplicación. También podés configurar el
        puente automático desde Administración → WhatsApp.
      </p>
    </Modal>
  );
}
