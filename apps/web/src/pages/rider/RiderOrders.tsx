import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatDateTime, formatMoney } from '../../lib/format';
import { EmptyState, ErrorState, Field, Modal, SectionTitle, Spinner, StatusBadge } from '../../components/ui';
import { WhatsAppButton, WhatsAppSheet } from '../../components/WhatsApp';
import { DELIVERY_MODE_LABELS, type OrderDto } from '@acoyaradas/shared';

interface RiderOrder extends OrderDto {
  assignment_status: 'assigned' | 'picked_up' | 'delivered' | 'failed' | null;
  amount_collected: number;
  amount_due: number;
}

const FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'rider_assigned', label: 'Para entregar' },
  { value: 'on_the_way', label: 'En camino' },
  { value: 'ready', label: 'Listos para retirar' },
  { value: 'delivered', label: 'Entregados' },
  { value: 'incident', label: 'Con incidencia' },
];

export default function RiderOrders() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [detail, setDetail] = useState<RiderOrder | null>(null);
  const [nextStatus, setNextStatus] = useState('');
  const [note, setNote] = useState('');
  const [collected, setCollected] = useState('');
  const [waOrderId, setWaOrderId] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['rider-orders', status],
    queryFn: () =>
      api.get<{ items: RiderOrder[] }>(`/rider/orders${status ? `?status=${status}` : ''}`),
  });

  const update = useMutation({
    mutationFn: (input: { id: string; status: string; note: string; collected?: string }) =>
      api.patch<{ ok: boolean; status: string }>(`/rider/orders/${input.id}/status`, {
        status: input.status,
        note: input.note,
        amount_collected:
          input.collected === undefined || input.collected === ''
            ? undefined
            : Number(input.collected),
      }),
    onSuccess: async () => {
      setMessage('Estado de la entrega actualizado.');
      setDetail(null);
      setNextStatus('');
      setNote('');
      setCollected('');
      await queryClient.invalidateQueries({ queryKey: ['rider-orders'] });
    },
    onError: (err) => setMessage((err as Error).message),
  });

  if (isLoading) return <Spinner />;
  if (error) {
    return <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />;
  }

  const orders = data?.items ?? [];

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Mis entregas"
        subtitle="Pedidos asignados por acoYAradas!"
      />

      <div className="flex flex-wrap items-center gap-2">
        <select
          className="input w-auto"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filtrar entregas"
        >
          {FILTERS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
      </div>

      {message ? (
        <div className="rounded-xl bg-ink-100 px-4 py-3 text-sm text-ink-700">{message}</div>
      ) : null}

      {orders.length === 0 ? (
        <EmptyState
          title="No tenés entregas asignadas"
          description="Cuando el administrador te asigne un pedido vas a verlo acá."
        />
      ) : (
        <div className="space-y-3">
          {orders.map((order) => (
            <article key={order.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-sm font-bold text-ink-900">{order.code}</p>
                  <p className="text-xs text-ink-500">
                    {formatDateTime(order.placed_at)} · {order.store_name}
                  </p>
                </div>
                <div className="text-right">
                  <StatusBadge status={order.status} />
                  <p className="mt-1 text-sm font-bold text-ink-900">{formatMoney(order.total)}</p>
                  {order.amount_due ? (
                    <p className="text-xs text-ink-500">Envío: {formatMoney(order.amount_due)}</p>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 grid gap-2 text-sm text-ink-600 sm:grid-cols-2">
                <p>
                  <strong>Cliente:</strong> {order.customer_name} · {order.phone}
                </p>
                <p>
                  <strong>Entrega:</strong>{' '}
                  {order.fulfillment_type === 'pickup' ? 'Retiro en el local' : 'Envío a domicilio'}
                </p>
                <p className="sm:col-span-2">
                  <strong>Dirección:</strong> {order.address ?? 'Retiro en el local'}
                  {order.locality ? `, ${order.locality}` : ''}
                </p>
                {order.references ? (
                  <p className="sm:col-span-2">
                    <strong>Referencias:</strong> {order.references}
                  </p>
                ) : null}
                {order.notes ? (
                  <p className="sm:col-span-2">
                    <strong>Observaciones:</strong> {order.notes}
                  </p>
                ) : null}
                <p className="sm:col-span-2">
                  <strong>Modalidad:</strong> {DELIVERY_MODE_LABELS[order.delivery_mode]}
                </p>
              </div>

              <ul className="mt-3 space-y-1 border-t border-ink-100 pt-3 text-sm text-ink-600">
                {order.items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-3">
                    <span>
                      {item.quantity} × {item.name_snapshot}
                    </span>
                    <span>{formatMoney(item.line_total)}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => {
                    setDetail(order);
                    setNextStatus(order.status === 'rider_assigned' ? 'on_the_way' : 'delivered');
                    setCollected('');
                  }}
                >
                  Actualizar entrega
                </button>
                {order.store_phone ? (
                  <a className="btn-secondary" href={`tel:${order.store_phone}`}>
                    Llamar al comercio
                  </a>
                ) : null}
                <WhatsAppButton
                  label="WhatsApp del pedido"
                  onClick={() => setWaOrderId(order.id)}
                />
              </div>
            </article>
          ))}
        </div>
      )}

      <Modal
        open={detail !== null}
        title={`Entrega ${detail?.code ?? ''}`}
        onClose={() => setDetail(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setDetail(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!nextStatus || update.isPending}
              onClick={() =>
                detail &&
                nextStatus &&
                update.mutate({ id: detail.id, status: nextStatus, note, collected })
              }
            >
              Guardar
            </button>
          </>
        }
      >
        <Field label="Estado de la entrega">
          <select
            className="input"
            value={nextStatus}
            onChange={(e) => setNextStatus(e.target.value)}
          >
            <option value="on_the_way">Salí en reparto</option>
            <option value="delivered">Entregado</option>
            <option value="incident">Incidencia / no se pudo entregar</option>
          </select>
        </Field>
        {nextStatus === 'delivered' && detail?.payment_method === 'cash_on_delivery' ? (
          <Field label="Importe cobrado (ARS)" hint="Dejalo vacío si no cobraste en el momento.">
            <input
              type="number"
              min={0}
              step="0.01"
              className="input"
              value={collected}
              onChange={(e) => setCollected(e.target.value)}
            />
          </Field>
        ) : null}
        <Field label="Nota" hint="Queda registrada en el historial del pedido.">
          <textarea
            rows={3}
            className="input"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </Modal>

      <WhatsAppSheet orderId={waOrderId} onClose={() => setWaOrderId(null)} />
    </div>
  );
}
