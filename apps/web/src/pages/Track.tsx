import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { API_BASE, api } from '../lib/api';
import { formatMoney, formatDateTime } from '../lib/format';
import { ORDER_STATUS_LABELS, type OrderDto } from '@acoyaradas/shared';
import { ErrorState, Spinner, StatusBadge } from '../components/ui';

const STEPS: Array<{ key: string; label: string }> = [
  { key: 'pending_confirmation', label: 'Pendiente de confirmación' },
  { key: 'confirmed', label: 'Confirmado' },
  { key: 'preparing', label: 'En preparación' },
  { key: 'ready', label: 'Listo para retirar' },
  { key: 'rider_assigned', label: 'Repartidor asignado' },
  { key: 'on_the_way', label: 'En camino' },
  { key: 'delivered', label: 'Entregado' },
];

function TrackForm({ code, token }: { code: string; token: string }) {
  const [params, setParams] = useSearchParams();
  const [codeValue, setCodeValue] = useState(code);
  const [tokenValue, setTokenValue] = useState(token);

  useEffect(() => {
    setCodeValue(code);
    setTokenValue(token);
  }, [code, token]);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const c = codeValue.trim().toUpperCase();
    const t = tokenValue.trim();
    if (!c || !t) return;
    const next = new URLSearchParams(params);
    next.set('token', t);
    setParams(next);
  };

  return (
    <form onSubmit={submit} className="card p-5">
      <h2 className="text-lg font-bold text-ink-900">Consultar un pedido</h2>
      <p className="mt-1 text-sm text-ink-500">
        Ingresá el código del pedido y el token del enlace de seguimiento.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="code">
            Código del pedido
          </label>
          <input
            id="code"
            className="input uppercase"
            placeholder="AC-XXXXXX"
            value={codeValue}
            onChange={(e) => setCodeValue(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="token">
            Token del enlace
          </label>
          <input
            id="token"
            className="input"
            placeholder="token de seguimiento"
            value={tokenValue}
            onChange={(e) => setTokenValue(e.target.value)}
          />
        </div>
      </div>
      <button type="submit" className="btn-primary mt-4">
        Ver estado
      </button>
    </form>
  );
}

export default function Track() {
  const { code = '' } = useParams();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const queryClient = useQueryClient();
  const [live, setLive] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['track', code, token],
    queryFn: () => api.get<OrderDto>(`/orders/track/${code}?token=${encodeURIComponent(token)}`),
    enabled: Boolean(code && token),
    refetchInterval: 30_000,
  });

  // Seguimiento en vivo (SSE). El backend publica los cambios de estado.
  useEffect(() => {
    if (!code || !token) return;
    const source = new EventSource(
      `${API_BASE}/track/${code}/events?token=${encodeURIComponent(token)}`,
    );
    source.addEventListener('order', (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent).data);
        setLive(payload.status ?? null);
        void queryClient.invalidateQueries({ queryKey: ['track', code, token] });
      } catch {
        /* payload inválido: se ignora */
      }
    });
    source.onerror = () => {
      /* el servidor puede cerrar la conexión; el polling sigue funcionando */
    };
    return () => source.close();
  }, [code, token, queryClient]);

  if (!code || !token) {
    return (
      <div className="container-app max-w-3xl py-10">
        <h1 className="text-2xl font-black tracking-tight text-ink-900 sm:text-3xl">
          Seguimiento de pedidos
        </h1>
        <div className="mt-6">
          <TrackForm code="" token="" />
        </div>
        <p className="mt-4 text-sm text-ink-500">
          ¿Perdiste el enlace? Si tenés cuenta,{' '}
          <Link to="/mis-pedidos" className="text-brand-600 hover:underline">
            mirá tus pedidos
          </Link>
          .
        </p>
      </div>
    );
  }

  if (isLoading) return <Spinner />;
  if (error) {
    return (
      <div className="container-app max-w-3xl py-10">
        <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />
        <div className="mt-6">
          <TrackForm code={code} token={token} />
        </div>
      </div>
    );
  }
  if (!data) return null;

  const currentIndex = STEPS.findIndex((s) => s.key === data.status);
  const cancelled = data.status === 'cancelled' || data.status === 'incident';

  return (
    <div className="container-app max-w-3xl py-10">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-ink-900">
            Pedido <span className="font-mono">{data.code}</span>
          </h1>
          <p className="text-sm text-ink-500">{data.store_name}</p>
        </div>
        <StatusBadge status={data.status} />
      </div>

      {live ? (
        <div className="mb-4 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Actualización en vivo: {ORDER_STATUS_LABELS[live as keyof typeof ORDER_STATUS_LABELS] ?? live}
        </div>
      ) : null}

      {/* Barra de progreso */}
      {cancelled ? (
        <div className="card mb-6 border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {data.status === 'cancelled'
            ? 'Este pedido fue cancelado.'
            : 'Este pedido tiene una incidencia registrada. Contactá al comercio para más información.'}
        </div>
      ) : (
        <ol className="card mb-6 divide-y divide-ink-100">
          {STEPS.map((step, index) => {
            const done = currentIndex >= index && currentIndex !== -1;
            const active = currentIndex === index;
            return (
              <li key={step.key} className="flex items-center gap-3 px-4 py-3">
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    done ? 'bg-emerald-500 text-white' : 'bg-ink-200 text-ink-500'
                  }`}
                >
                  {done ? '✓' : index + 1}
                </span>
                <span
                  className={`text-sm ${active ? 'font-bold text-ink-900' : 'text-ink-600'}`}
                >
                  {step.label}
                </span>
                {active ? (
                  <span className="badge ml-auto bg-brand-100 text-brand-700">Estado actual</span>
                ) : null}
              </li>
            );
          })}
        </ol>
      )}

      <div className="card p-5">
        <h2 className="text-lg font-bold text-ink-900">Detalle del pedido</h2>
        <ul className="mt-3 divide-y divide-ink-100">
          {data.items.map((item) => (
            <li key={item.id} className="flex justify-between gap-3 py-2 text-sm">
              <span className="text-ink-600">
                {item.quantity} × {item.name_snapshot}
              </span>
              <span className="font-medium text-ink-900">{formatMoney(item.line_total)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-1.5 border-t border-ink-100 pt-4 text-sm">
          <div className="flex justify-between">
            <dt className="text-ink-600">Subtotal</dt>
            <dd>{formatMoney(data.subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-600">Descuento</dt>
            <dd>- {formatMoney(data.discount)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-ink-600">Envío</dt>
            <dd>{formatMoney(data.shipping_cost)}</dd>
          </div>
          <div className="flex justify-between text-base font-bold">
            <dt>Total</dt>
            <dd className="text-brand-600">{formatMoney(data.total)}</dd>
          </div>
        </dl>

        <div className="mt-4 grid gap-3 text-sm text-ink-600 sm:grid-cols-2">
          <div>
            <p className="font-semibold text-ink-800">Entrega</p>
            <p>
              {data.fulfillment_type === 'delivery' ? 'Envío a domicilio' : 'Retiro en el local'}
            </p>
            <p>{data.address ?? data.store_address ?? '-'}</p>
            {data.references ? <p>Referencias: {data.references}</p> : null}
          </div>
          <div>
            <p className="font-semibold text-ink-800">Contacto</p>
            <p>{data.customer_name}</p>
            <p>{data.phone}</p>
            {data.rider_name ? (
              <p>
                Repartidor: {data.rider_name}
                {data.rider_phone ? ` · ${data.rider_phone}` : ''}
              </p>
            ) : null}
            {data.merchant_responsible ? (
              <p>Responsable del envío: {data.merchant_responsible}</p>
            ) : null}
          </div>
        </div>

        {data.history?.length ? (
          <div className="mt-5">
            <h3 className="text-sm font-bold text-ink-900">Historial</h3>
            <ul className="mt-2 space-y-1 text-xs text-ink-500">
              {data.history.map((h, i) => (
                <li key={i}>
                  {formatDateTime(h.created_at)} — {ORDER_STATUS_LABELS[h.status] ?? h.status}
                  {h.note ? ` · ${h.note}` : ''}
                  {h.actor ? ` (${h.actor})` : ''}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="mt-6">
        <TrackForm code={code} token={token} />
      </div>
    </div>
  );
}
