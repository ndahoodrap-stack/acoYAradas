import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatMoney } from '../lib/format';
import { PAYMENT_METHOD_LABELS, type OrderDto } from '@acoyaradas/shared';
import { ErrorState, Spinner, StatusBadge } from '../components/ui';

export default function OrderConfirmation() {
  const { code = '' } = useParams();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['track', code, token],
    queryFn: () => api.get<OrderDto>(`/orders/track/${code}?token=${encodeURIComponent(token)}`),
    enabled: Boolean(code && token),
  });

  if (!token) {
    return (
      <div className="container-app py-12">
        <div className="card mx-auto max-w-lg p-8 text-center">
          <h1 className="text-xl font-bold">Falta el enlace de seguimiento</h1>
          <p className="mt-2 text-sm text-ink-500">
            Para consultar el pedido necesitás el enlace completo que te dimos al confirmar la
            compra.
          </p>
          <Link to="/seguimiento" className="btn-primary mt-5">
            Seguir un pedido
          </Link>
        </div>
      </div>
    );
  }

  if (isLoading) return <Spinner />;
  if (error) {
    return (
      <div className="container-app py-12">
        <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />
      </div>
    );
  }
  if (!data) return null;

  const trackUrl = `/seguimiento/${data.code}?token=${encodeURIComponent(data.public_token ?? token)}`;

  return (
    <div className="container-app py-8">
      <div className="mx-auto max-w-3xl">
        <div className="card p-6 text-center">
          <div className="text-4xl">🎉</div>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-ink-900">
            ¡Gracias {data.customer_name}!
          </h1>
          <p className="mt-1 text-sm text-ink-500">
            Tu pedido fue registrado y está esperando la confirmación del comercio.
          </p>
          <p className="mt-4 inline-block rounded-xl bg-ink-100 px-4 py-2 font-mono text-lg font-bold tracking-wide text-ink-900">
            {data.code}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-3">
            <Link to={trackUrl} className="btn-primary">
              📦 Seguir mi pedido
            </Link>
            <Link to="/mis-pedidos" className="btn-secondary">
              Mis pedidos
            </Link>
          </div>
          <p className="mt-4 text-xs text-ink-500">
            Guardá este enlace: es la forma segura de consultar el estado del pedido.
          </p>
        </div>

        <div className="card mt-6 p-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-ink-900">{data.store_name}</h2>
            <StatusBadge status={data.status} />
          </div>

          <ul className="mt-4 divide-y divide-ink-100">
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
              <dt className="text-ink-600">Descuentos</dt>
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

          <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-900">
            <strong>Estado del pago:</strong> {data.payment_status === 'pending' ? 'pendiente' : data.payment_status}
            {' · '}
            {PAYMENT_METHOD_LABELS[data.payment_method]}
            <br />
            El pago queda registrado como pendiente hasta que exista una confirmación verificable.
          </div>

          <div className="mt-4 grid gap-2 text-sm text-ink-600 sm:grid-cols-2">
            {data.fulfillment_type === 'delivery' ? (
              <>
                <p>📍 {data.address ?? 'Sin dirección'}</p>
                <p>🏙️ {data.locality ?? '-'}</p>
                <p>📌 {data.references ?? 'Sin referencias'}</p>
              </>
            ) : (
              <p className="sm:col-span-2">🏠 Retiro en el local: {data.store_address ?? '-'}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
