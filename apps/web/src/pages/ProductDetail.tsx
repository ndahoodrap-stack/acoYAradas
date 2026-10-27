import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { formatMoney } from '../lib/format';
import { useCart } from '../lib/cart';
import type { ProductDto } from '@acoyaradas/shared';
import { ErrorState, Spinner } from '../components/ui';

interface ProductPage extends ProductDto {
  store_logo_url: string | null;
  store_is_open?: boolean;
  locality?: string | null;
}

export default function ProductDetail() {
  const { id = '' } = useParams();
  const { addItem } = useCart();
  const [qty, setQty] = useState(1);
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['product', id],
    queryFn: () => api.get<ProductPage>(`/products/${id}`),
    enabled: Boolean(id),
  });

  const handleAdd = async () => {
    if (!data) return;
    try {
      await addItem(data.id, qty);
      setMessage({ type: 'ok', text: 'Agregado al carrito.' });
    } catch (err) {
      if (err instanceof ApiError && err.reason === 'mixed_stores') {
        setMessage({
          type: 'err',
          text: `${err.message} Podés vaciar el carrito desde la página del carrito para cambiar de comercio.`,
        });
        return;
      }
      setMessage({ type: 'err', text: (err as Error).message });
    }
  };

  if (isLoading) return <Spinner />;
  if (error) {
    return (
      <div className="container-app py-10">
        <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="container-app py-8">
      <nav className="mb-4 text-sm text-ink-500">
        <Link to="/comercios" className="hover:text-brand-600">
          Comercios
        </Link>
        {data.store_slug ? (
          <>
            {' / '}
            <Link to={`/comercios/${data.store_slug}`} className="hover:text-brand-600">
              {data.store_name}
            </Link>
          </>
        ) : null}
        {' / '}
        <span className="text-ink-700">{data.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-2">
        <div className="card overflow-hidden">
          {data.image_url ? (
            <img src={data.image_url} alt={data.name} className="h-80 w-full object-cover" />
          ) : (
            <div className="flex h-80 items-center justify-center bg-ink-100 text-6xl">🍽️</div>
          )}
        </div>

        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-brand-600">
            {data.store_name ?? 'Productos no afiliados'}
          </p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-ink-900">{data.name}</h1>
          <p className="mt-3 text-3xl font-black text-brand-600">{formatMoney(data.price)}</p>
          {data.description ? (
            <p className="mt-4 text-ink-600">{data.description}</p>
          ) : null}

          <p className="mt-4 text-sm text-ink-500">
            {data.stock > 0 ? `${data.stock} unidades disponibles` : 'Sin stock por el momento'}
          </p>

          {message ? (
            <div
              className={`mt-4 rounded-xl px-4 py-3 text-sm ${
                message.type === 'ok'
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'bg-amber-50 text-amber-900'
              }`}
            >
              {message.text}
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center rounded-xl border border-ink-300">
              <button
                type="button"
                className="px-3 py-2 text-lg text-ink-600 disabled:opacity-40"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={qty <= 1}
                aria-label="Quitar uno"
              >
                −
              </button>
              <span className="w-10 text-center text-sm font-semibold">{qty}</span>
              <button
                type="button"
                className="px-3 py-2 text-lg text-ink-600 disabled:opacity-40"
                onClick={() => setQty((q) => Math.min(data.stock, q + 1))}
                disabled={qty >= data.stock}
                aria-label="Agregar uno"
              >
                +
              </button>
            </div>
            <button
              type="button"
              className="btn-primary"
              disabled={data.stock <= 0 || !data.is_available || data.store_is_open === false}
              onClick={() => void handleAdd()}
            >
              Agregar al carrito
            </button>
            <Link to="/carrito" className="btn-secondary">
              Ver carrito
            </Link>
          </div>

          {data.store_slug ? (
            <Link
              to={`/comercios/${data.store_slug}`}
              className="mt-6 inline-block text-sm font-medium text-brand-600 hover:underline"
            >
              Ver todo el catálogo de {data.store_name} →
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
