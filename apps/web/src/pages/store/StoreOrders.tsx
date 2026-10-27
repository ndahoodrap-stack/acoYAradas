import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatDateTime, formatMoney } from '../../lib/format';
import { ORDER_STATUS_LABELS, type OrderDto } from '@acoyaradas/shared';
import { EmptyState, ErrorState, Spinner, StatusBadge } from '../../components/ui';
const FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'pending_confirmation', label: 'Pendientes de aceptación' },
  { value: 'confirmed', label: 'Confirmados' },
  { value: 'preparing', label: 'En preparación' },
  { value: 'ready', label: 'Listos' },
  { value: 'rider_assigned', label: 'Con repartidor' },
  { value: 'delivered', label: 'Entregados' },
  { value: 'cancelled', label: 'Cancelados' },
];

const NEXT_ACTIONS: Record<string, { status: string; label: string }[]> = {
  pending_confirmation: [
    { status: 'confirmed', label: 'Aceptar pedido' },
    { status: 'cancelled', label: 'Rechazar' },
  ],
  confirmed: [{ status: 'preparing', label: 'Marcar en preparación' }],
  preparing: [{ status: 'ready', label: 'Marcar listo' }],
  ready: [
    { status: 'delivered', label: 'Entregado/retirado' },
    { status: 'incident', label: 'Reportar incidencia' },
  ],
};

export default function StoreOrders() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [prepMinutes, setPrepMinutes] = useState<Record<string, string>>({});

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['store-orders', status],
    queryFn: () =>
      api.get<{ items: OrderDto[] }>(`/store/orders${status ? `?status=${status}` : ''}`),
  });

  const update = useMutation({
    mutationFn: (input: {
      id: string;
      status: string;
      note?: string;
      prepMinutes?: string;
      responsible?: string;
    }) =>
      api.patch<{ ok: boolean; status: string }>(`/store/orders/${input.id}/status`, {
        status: input.status,
        note: input.note,
        preparation_minutes: input.prepMinutes ? Number(input.prepMinutes) : undefined,
        merchant_responsible: input.responsible || undefined,
      }),
    onSuccess: async () => {
      setMessage('Estado actualizado.');
      setStatus('');
      await queryClient.invalidateQueries({ queryKey: ['store-orders'] });
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
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="input w-auto"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filtrar pedidos por estado"
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
          title="No hay pedidos con ese estado"
          description="Cuando un cliente confirme una compra, el pedido aparece acá."
        />
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div key={order.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-sm font-bold text-ink-900">{order.code}</p>
                  <p className="text-xs text-ink-500">
                    {formatDateTime(order.placed_at)} · {order.customer_name} · {order.phone}
                  </p>
                </div>
                <div className="text-right">
                  <StatusBadge status={order.status} />
                  <p className="mt-1 text-sm font-bold text-ink-900">
                    {formatMoney((order.total - (order.shipping_cost ?? 0)) * 0.92)}
                  </p>
                  <p className="text-xs text-ink-500">
                    Total a recibir (menos el costo de la comisión{' '}
                    <span className="font-semibold text-brand-600">8%</span>)
                  </p>
                </div>
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

              <div className="mt-3 grid gap-2 text-sm text-ink-600 sm:grid-cols-2">
                <p>
                  <strong>Entrega:</strong>{' '}
                  {order.fulfillment_type === 'pickup' ? 'Retiro en el local' : 'Envío a domicilio'}
                  {order.delivery_mode === 'platform' ? ' (acoYAradas!)' : ' (propia del comercio)'}
                </p>
                <p>
                  <strong>Dirección:</strong> {order.address ?? 'Retiro en local'}
                  {order.locality ? `, ${order.locality}` : ''}
                </p>
                {order.references ? <p><strong>Referencias:</strong> {order.references}</p> : null}
                {order.notes ? <p><strong>Observaciones:</strong> {order.notes}</p> : null}
                <p>
                  <strong>Pago:</strong> {order.payment_method} ·{' '}
                  {order.payment_status === 'pending' ? 'pendiente' : order.payment_status}
                </p>
                <p>
                  <strong>Comisión estimada:</strong> se calcula sobre el pedido confirmado
                </p>
              </div>

              {NEXT_ACTIONS[order.status]?.length ? (
                <div className="mt-4 rounded-xl bg-ink-50 p-3">
                  <div className="grid gap-2 sm:grid-cols-3">
                    <label className="text-xs text-ink-600">
                      Tiempo de preparación (min)
                      <select
                        className="input mt-1"
                        value={prepMinutes[order.id] ?? '15'}
                        onChange={(e) =>
                          setPrepMinutes((m) => ({ ...m, [order.id]: e.target.value }))
                        }
                      >
                        {[5, 10, 15, 20, 30, 45, 60].map((m) => (
                          <option key={m} value={m}>
                            {m} min
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="flex items-end gap-2">
                      {NEXT_ACTIONS[order.status].map((action) => (
                        <button
                          key={action.status}
                          type="button"
                          className={`btn ${action.status === 'cancelled' ? 'btn-ghost text-red-600' : 'btn-primary'}`}
                          disabled={update.isPending}
                          onClick={() =>
                            update.mutate({
                              id: order.id,
                              status: action.status,
                              note:
                                action.status === 'confirmed'
                                  ? 'Pedido aceptado por el comercio'
                                  : undefined,
                              prepMinutes: prepMinutes[order.id],
                              responsible: responsible[order.id],
                            })
                          }
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}

              {order.history?.length ? (
                <details className="mt-3 text-xs text-ink-500">
                  <summary className="cursor-pointer">Historial del pedido</summary>
                  <ul className="mt-2 space-y-1">
                    {order.history.map((h, i) => (
                      <li key={i}>
                        {formatDateTime(h.created_at)} — {ORDER_STATUS_LABELS[h.status] ?? h.status}
                        {h.note ? ` · ${h.note}` : ''}
                        {h.actor ? ` (${h.actor})` : ''}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          ))}
        </div>
      )}

    </div>
  );
}
