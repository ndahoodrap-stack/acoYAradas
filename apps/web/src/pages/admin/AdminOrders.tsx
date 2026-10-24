import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatDateTime, formatMoney } from '../../lib/format';
import { DataTable } from '../../components/PanelShell';
import { EmptyState, ErrorState, Field, Modal, SectionTitle, Spinner, StatusBadge } from '../../components/ui';
import { WhatsAppButton, WhatsAppSheet } from '../../components/WhatsApp';
import {
  DELIVERY_MODE_LABELS,
  ORDER_STATUS_FLOW,
  ORDER_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  type OrderDto,
  type OrderStatus,
  type WhatsAppRecipient,
} from '@acoyaradas/shared';

interface Rider {
  id: string;
  full_name: string;
  active: boolean;
  available: boolean;
}

interface StoreRef {
  id: string;
  name: string;
}

export default function AdminOrders() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');
  const [storeId, setStoreId] = useState('');
  const [riderId, setRiderId] = useState('');
  const [mode, setMode] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [detail, setDetail] = useState<OrderDto | null>(null);
  const [assigning, setAssigning] = useState<OrderDto | null>(null);
  const [assignRider, setAssignRider] = useState('');
  const [nextStatus, setNextStatus] = useState<OrderStatus | ''>('');
  const [note, setNote] = useState('');
  const [wa, setWa] = useState<{
    orderId: string;
    preferred?: WhatsAppRecipient;
    autoOpen?: boolean;
  } | null>(null);

  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (storeId) params.set('store_id', storeId);
  if (riderId) params.set('rider_id', riderId);
  if (mode) params.set('mode', mode);
  if (from) params.set('from', new Date(from).toISOString());
  if (to) params.set('to', new Date(`${to}T23:59:59`).toISOString());
  const qs = params.toString();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-orders', qs],
    queryFn: () => api.get<{ items: OrderDto[] }>(`/admin/orders${qs ? `?${qs}` : ''}`),
  });

  const stores = useQuery({
    queryKey: ['admin-stores', 'filter'],
    queryFn: () => api.get<{ items: StoreRef[] }>('/admin/stores?status=all'),
  });

  const riders = useQuery({
    queryKey: ['admin-riders'],
    queryFn: () => api.get<{ items: Rider[] }>('/admin/riders'),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
  };

  const statusMutation = useMutation({
    mutationFn: (input: { id: string; status: string; note: string }) =>
      api.patch<{ ok: boolean; status: string }>(`/admin/orders/${input.id}/status`, {
        status: input.status,
        note: input.note,
      }),
    onSuccess: async () => {
      setMessage('Estado del pedido actualizado.');
      setNextStatus('');
      setNote('');
      await invalidate();
    },
    onError: (err) => setMessage((err as Error).message),
  });

  const assignMutation = useMutation({
    mutationFn: (input: { id: string; rider_id: string }) =>
      api.post<{ ok: boolean; rider_id: string }>(`/admin/orders/${input.id}/assign`, {
        rider_id: input.rider_id,
      }),
    onSuccess: async (_result, variables) => {
      setAssigning(null);
      setAssignRider('');
      setMessage('Repartidor asignado. Abrimos el chat con todos los datos del pedido.');
      // El pedido se asigna y se abre el WhatsApp del repartidor automáticamente.
      setWa({ orderId: variables.id, preferred: 'rider', autoOpen: true });
      await invalidate();
    },
    onError: (err) => setMessage((err as Error).message),
  });

  if (isLoading) return <Spinner />;
  if (error) {
    return <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />;
  }

  const orders = data?.items ?? [];
  const activeRiders = (riders.data?.items ?? []).filter((r) => r.active);

  return (
    <div className="space-y-4">
      <SectionTitle title="Pedidos" subtitle="Control de todos los pedidos del marketplace" />

      <div className="card grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <label className="text-xs text-ink-600">
          Estado
          <select className="input mt-1" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">Todos</option>
            {Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-ink-600">
          Comercio
          <select className="input mt-1" value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            <option value="">Todos</option>
            {(stores.data?.items ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-ink-600">
          Repartidor
          <select className="input mt-1" value={riderId} onChange={(e) => setRiderId(e.target.value)}>
            <option value="">Todos</option>
            {(riders.data?.items ?? []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.full_name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs text-ink-600">
          Entrega
          <select className="input mt-1" value={mode} onChange={(e) => setMode(e.target.value)}>
            <option value="">Ambas</option>
            <option value="platform">acoYAradas!</option>
            <option value="merchant">Propia del comercio</option>
          </select>
        </label>
        <label className="text-xs text-ink-600">
          Desde
          <input
            type="date"
            className="input mt-1"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="text-xs text-ink-600">
          Hasta
          <input type="date" className="input mt-1" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      {message ? (
        <div className="rounded-xl bg-ink-100 px-4 py-3 text-sm text-ink-700">{message}</div>
      ) : null}

      {orders.length === 0 ? (
        <EmptyState title="No hay pedidos con esos filtros" description="Probá cambiando el estado o el rango de fechas." />
      ) : (
        <DataTable
          headers={['Pedido', 'Comercio', 'Cliente', 'Estado', 'Entrega', 'Total', 'Fecha', 'Acciones']}
          empty="Sin pedidos."
        >
          {orders.map((order) => (
            <tr key={order.id}>
              <td className="font-mono text-xs font-bold text-ink-900">{order.code}</td>
              <td className="text-xs">{order.store_name}</td>
              <td className="text-xs">
                <p>{order.customer_name}</p>
                <p className="text-ink-500">{order.phone}</p>
              </td>
              <td>
                <StatusBadge status={order.status} />
                {order.rider_name ? (
                  <p className="mt-1 text-xs text-ink-500">🛵 {order.rider_name}</p>
                ) : null}
              </td>
              <td className="text-xs">
                {DELIVERY_MODE_LABELS[order.delivery_mode]}
                <p className="text-ink-500">
                  {order.fulfillment_type === 'pickup' ? 'Retiro' : 'Envío'}
                </p>
              </td>
              <td className="font-semibold text-ink-900">{formatMoney(order.total)}</td>
              <td className="text-xs text-ink-500">{formatDateTime(order.placed_at)}</td>
              <td>
                <div className="flex flex-wrap gap-2 text-sm font-medium">
                  <button
                    type="button"
                    className="text-brand-600 hover:underline"
                    onClick={() => {
                      setDetail(order);
                      setNextStatus('');
                      setNote('');
                    }}
                  >
                    Ver
                  </button>
                  {order.delivery_mode === 'platform' ? (
                    <button
                      type="button"
                      className="text-indigo-700 hover:underline"
                      onClick={() => {
                        setAssigning(order);
                        setAssignRider(order.rider_id ?? '');
                      }}
                    >
                      Asignar repartidor
                    </button>
                  ) : null}
                  <WhatsAppButton
                    label="WhatsApp"
                    className="px-2 py-1 text-xs"
                    onClick={() => setWa({ orderId: order.id })}
                  />
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      <Modal
        open={detail !== null}
        title={`Pedido ${detail?.code ?? ''}`}
        onClose={() => setDetail(null)}
        footer={
          <>
            {detail ? (
              <WhatsAppButton
                label="Enviar por WhatsApp"
                onClick={() => {
                  setWa({ orderId: detail.id, preferred: detail.rider_id ? 'rider' : 'store' });
                  setDetail(null);
                }}
              />
            ) : null}
            <button type="button" className="btn-secondary" onClick={() => setDetail(null)}>
              Cerrar
            </button>
          </>
        }
      >
        {detail ? (
          <div className="space-y-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={detail.status} />
              <span className="badge bg-ink-100 text-ink-700">
                {DELIVERY_MODE_LABELS[detail.delivery_mode]}
              </span>
              <span className="badge bg-ink-100 text-ink-700">
                {detail.fulfillment_type === 'pickup' ? 'Retiro en local' : 'Envío a domicilio'}
              </span>
            </div>
            <p className="text-ink-600">
              <strong>Comercio:</strong> {detail.store_name}
              {detail.store_phone ? ` · ${detail.store_phone}` : ''}
            </p>
            <p className="text-ink-600">
              <strong>Cliente:</strong> {detail.customer_name} · {detail.phone}
            </p>
            <p className="text-ink-600">
              <strong>Dirección:</strong> {detail.address ?? 'Retiro en local'}
              {detail.locality ? `, ${detail.locality}` : ''}
            </p>
            {detail.references ? (
              <p className="text-ink-600">
                <strong>Referencias:</strong> {detail.references}
              </p>
            ) : null}
            {detail.notes ? (
              <p className="text-ink-600">
                <strong>Observaciones:</strong> {detail.notes}
              </p>
            ) : null}
            {detail.merchant_responsible ? (
              <p className="text-ink-600">
                <strong>Responsable del envío:</strong> {detail.merchant_responsible}
              </p>
            ) : null}
            <p className="text-ink-600">
              <strong>Pago:</strong> {PAYMENT_METHOD_LABELS[detail.payment_method]} ·{' '}
              {detail.payment_status === 'pending' ? 'pendiente' : detail.payment_status}
            </p>

            <ul className="space-y-1 rounded-xl bg-ink-50 p-3">
              {detail.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-3">
                  <span>
                    {item.quantity} × {item.name_snapshot}
                  </span>
                  <span>{formatMoney(item.line_total)}</span>
                </li>
              ))}
            </ul>
            <dl className="grid grid-cols-2 gap-1 text-xs text-ink-600">
              <div className="flex justify-between">
                <dt>Subtotal</dt>
                <dd>{formatMoney(detail.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Descuento</dt>
                <dd>−{formatMoney(detail.discount)}</dd>
              </div>
              <div className="flex justify-between">
                <dt>Envío</dt>
                <dd>{formatMoney(detail.shipping_cost)}</dd>
              </div>
              <div className="flex justify-between font-bold text-ink-900">
                <dt>Total</dt>
                <dd>{formatMoney(detail.total)}</dd>
              </div>
            </dl>

            <Field label="Cambiar estado" hint="Sólo se permiten las transiciones del flujo de estados.">
              <select
                className="input"
                value={nextStatus}
                onChange={(e) => setNextStatus(e.target.value as OrderStatus)}
              >
                <option value="">Seleccionar…</option>
                {(ORDER_STATUS_FLOW[detail.status] ?? []).map((s) => (
                  <option key={s} value={s}>
                    {ORDER_STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Nota">
              <input
                className="input"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </Field>
            <button
              type="button"
              className="btn-primary w-full"
              disabled={!nextStatus || statusMutation.isPending}
              onClick={() =>
                detail &&
                nextStatus &&
                statusMutation.mutate({ id: detail.id, status: nextStatus, note })
              }
            >
              Aplicar cambio de estado
            </button>

            {detail.history?.length ? (
              <details className="text-xs text-ink-500">
                <summary className="cursor-pointer">Historial del pedido</summary>
                <ul className="mt-2 space-y-1">
                  {detail.history.map((h, i) => (
                    <li key={i}>
                      {formatDateTime(h.created_at)} — {ORDER_STATUS_LABELS[h.status] ?? h.status}
                      {h.note ? ` · ${h.note}` : ''}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}
      </Modal>

      <Modal
        open={assigning !== null}
        title="Asignar repartidor"
        onClose={() => setAssigning(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setAssigning(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={!assignRider || assignMutation.isPending}
              onClick={() =>
                assigning && assignRider && assignMutation.mutate({ id: assigning.id, rider_id: assignRider })
              }
            >
              Asignar
            </button>
          </>
        }
      >
        <p className="text-sm text-ink-600">
          Pedido <strong>{assigning?.code}</strong> — {assigning?.store_name}. Sólo se puede asignar a
          un pedido con entrega organizada por acoYAradas!.
        </p>
        <Field label="Repartidor">
          <select
            className="input"
            value={assignRider}
            onChange={(e) => setAssignRider(e.target.value)}
          >
            <option value="">Seleccionar…</option>
            {activeRiders.map((r) => (
              <option key={r.id} value={r.id}>
                {r.full_name} {r.available ? '(disponible)' : '(no disponible)'}
              </option>
            ))}
          </select>
        </Field>
      </Modal>

      <WhatsAppSheet
        orderId={wa?.orderId ?? null}
        preferred={wa?.preferred}
        autoOpen={wa?.autoOpen}
        onClose={() => setWa(null)}
      />
    </div>
  );
}
