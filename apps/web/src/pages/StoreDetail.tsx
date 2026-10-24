import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '../lib/api';
import { formatMoney } from '../lib/format';
import { useCart } from '../lib/cart';
import type { ProductDto, StoreDto } from '@acoyaradas/shared';
import { AvailabilityBadge, EmptyState, ErrorState, Modal, SectionTitle, Spinner } from '../components/ui';

interface StorePage {
  store: StoreDto;
  products: ProductDto[];
  promotions: { id: string; title: string; description: string | null; discount_type: string; discount_value: number }[];
  categories: { id: string; name: string; slug: string; products_count: number }[];
}

const WEEKDAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

export default function StoreDetail() {
  const { slug = '' } = useParams();
  const { addItem, count } = useCart();
  const [notice, setNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [pending, setPending] = useState<{ productId: string; name: string } | null>(null);
  const [categoryId, setCategoryId] = useState<string>('');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['store', slug],
    queryFn: () => api.get<StorePage>(`/stores/${slug}`),
    enabled: Boolean(slug),
  });

  const handleAdd = async (productId: string, name: string, replace = false) => {
    try {
      await addItem(productId, 1, replace);
      setNotice({ type: 'ok', text: `${name} se agregó al carrito.` });
      setPending(null);
    } catch (err) {
      if (err instanceof ApiError && err.reason === 'mixed_stores') {
        const details = err.details as {
          current_store?: { name: string };
          new_store?: { name: string };
        };
        setNotice({
          type: 'err',
          text:
            err.message ??
            `Tu carrito tiene productos de ${details?.current_store?.name ?? 'otro comercio'}.`,
        });
        setPending({ productId, name });
        return;
      }
      setNotice({ type: 'err', text: (err as Error).message });
    }
  };

  if (isLoading) return <Spinner label="Cargando el comercio…" />;
  if (error) {
    return (
      <div className="container-app py-10">
        <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />
      </div>
    );
  }
  if (!data) return null;

  const { store, products, promotions, categories } = data;
  const visibleProducts = categoryId ? products.filter((p) => p.category_id === categoryId) : products;
  const hours = store.open_hours ?? {};

  return (
    <div>
      {/* Portada */}
      <div className="relative h-48 w-full overflow-hidden bg-ink-200 sm:h-64">
        {store.cover_url ? (
          <img src={store.cover_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-brand-400 to-ink-800" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-ink-900/70 to-transparent" />
      </div>

      <div className="container-app">
        <div className="-mt-12 relative rounded-2xl bg-white p-5 shadow-card sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            {store.logo_url ? (
              <img
                src={store.logo_url}
                alt={store.name}
                className="h-20 w-20 rounded-2xl border border-ink-200 bg-white object-cover"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-brand-100 text-3xl">
                🏪
              </div>
            )}
            <div className="flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight text-ink-900">{store.name}</h1>
                <AvailabilityBadge isOpen={store.is_open} />
              </div>
              {store.category_name ? (
                <p className="mt-0.5 text-sm font-medium uppercase tracking-wide text-brand-600">
                  {store.category_name}
                </p>
              ) : null}
              <p className="mt-2 max-w-3xl text-sm text-ink-600">{store.description}</p>

              <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
                {store.address ? (
                  <div className="flex gap-2">
                    <dt className="text-ink-400">📍</dt>
                    <dd className="text-ink-700">
                      {store.address}
                      {store.locality ? `, ${store.locality}` : ''}
                    </dd>
                  </div>
                ) : null}
                {store.phone ? (
                  <div className="flex gap-2">
                    <dt className="text-ink-400">📞</dt>
                    <dd className="text-ink-700">{store.phone}</dd>
                  </div>
                ) : null}
                {store.whatsapp ? (
                  <div className="flex gap-2">
                    <dt className="text-ink-400">💬</dt>
                    <dd className="text-ink-700">{store.whatsapp}</dd>
                  </div>
                ) : null}
                {store.preparation_time_minutes ? (
                  <div className="flex gap-2">
                    <dt className="text-ink-400">⏱️</dt>
                    <dd className="text-ink-700">
                      Preparación aproximada: {store.preparation_time_minutes} min
                    </dd>
                  </div>
                ) : null}
              </dl>
            </div>
          </div>

          {/* Condiciones de entrega */}
          <div className="mt-5 grid gap-3 border-t border-ink-100 pt-5 sm:grid-cols-3">
            <div className="rounded-xl bg-ink-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Entrega</p>
              <ul className="mt-1 space-y-0.5 text-sm text-ink-700">
                {store.allows_platform_delivery ? (
                  <li>✅ Organizada por acoYAradas!</li>
                ) : null}
                {store.allows_merchant_delivery ? (
                  <li>✅ Entrega propia del comercio</li>
                ) : null}
                {store.allows_pickup ? <li>✅ Retiro en el local</li> : null}
                {!store.allows_platform_delivery &&
                !store.allows_merchant_delivery &&
                !store.allows_pickup ? (
                  <li className="text-ink-500">Este comercio no tiene entregas habilitadas.</li>
                ) : null}
              </ul>
            </div>
            <div className="rounded-xl bg-ink-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Envío</p>
              {store.allows_merchant_delivery && store.merchant_delivery_fee > 0 ? (
                <p className="mt-1 text-sm text-ink-700">
                  Entrega propia: {formatMoney(store.merchant_delivery_fee)}
                </p>
              ) : null}
              <p className="mt-1 text-sm text-ink-700">
                {store.allows_platform_delivery
                  ? 'El costo de envío por zona se calcula al confirmar el pedido.'
                  : 'No aplica envío de la plataforma.'}
              </p>
              {store.merchant_delivery_notes ? (
                <p className="mt-1 text-xs text-ink-500">{store.merchant_delivery_notes}</p>
              ) : null}
            </div>
            <div className="rounded-xl bg-ink-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Pagos</p>
              <ul className="mt-1 space-y-0.5 text-sm text-ink-700">
                {store.accepts_cash ? <li>✅ Efectivo en el local</li> : null}
                {store.accepts_transfer ? <li>✅ Transferencia bancaria</li> : null}
                {store.accepts_cash_on_delivery ? <li>✅ Pago al recibir</li> : null}
              </ul>
            </div>
          </div>

          {Object.keys(hours).length ? (
            <div className="mt-4 rounded-xl bg-ink-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Horarios</p>
              <div className="mt-1 grid gap-1 text-sm text-ink-700 sm:grid-cols-2">
                {WEEKDAYS.map((day) =>
                  hours[day] ? (
                    <p key={day}>
                      <span className="capitalize">{day}:</span> {hours[day]}
                    </p>
                  ) : null,
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* Promociones del comercio */}
        {promotions.length ? (
          <section className="mt-8">
            <SectionTitle title="Promociones" subtitle="Descuentos de este comercio" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {promotions.map((promo) => (
                <div key={promo.id} className="card flex items-start gap-3 p-4">
                  <span className="text-2xl" aria-hidden>
                    🏷️
                  </span>
                  <div>
                    <p className="font-semibold text-ink-900">{promo.title}</p>
                    {promo.description ? (
                      <p className="text-sm text-ink-500">{promo.description}</p>
                    ) : null}
                    <p className="mt-1 text-sm font-bold text-brand-600">
                      {promo.discount_type === 'percent'
                        ? `${promo.discount_value}% off`
                        : `${formatMoney(promo.discount_value)} off`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {/* Catálogo */}
        <section className="mt-8">
          <SectionTitle
            title="Catálogo"
            subtitle={`${visibleProducts.length} producto(s) en este comercio`}
            action={
              categories.length > 1 ? (
                <select
                  className="input w-auto"
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  aria-label="Filtrar por categoría del comercio"
                >
                  <option value="">Todas</option>
                  {categories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name} ({cat.products_count})
                    </option>
                  ))}
                </select>
              ) : undefined
            }
          />

          {notice ? (
            <div
              className={`mb-4 rounded-xl px-4 py-3 text-sm ${
                notice.type === 'ok'
                  ? 'bg-emerald-50 text-emerald-800'
                  : 'bg-amber-50 text-amber-900'
              }`}
            >
              {notice.text}
            </div>
          ) : null}

          {visibleProducts.length === 0 ? (
            <EmptyState
              title="Este comercio todavía no tiene productos publicados"
              description="Volvé a revisar más tarde."
            />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleProducts.map((product) => (
                <div key={product.id} className="card flex flex-col overflow-hidden">
                  <Link to={`/productos/${product.id}`}>
                    <div className="h-36 bg-ink-100">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-3xl">🍽️</div>
                      )}
                    </div>
                  </Link>
                  <div className="flex flex-1 flex-col p-4">
                    <Link
                      to={`/productos/${product.id}`}
                      className="font-semibold text-ink-900 hover:text-brand-600"
                    >
                      {product.name}
                    </Link>
                    {product.description ? (
                      <p className="mt-1 line-clamp-2 text-sm text-ink-500">{product.description}</p>
                    ) : null}
                    <p className="mt-2 text-lg font-bold text-brand-600">
                      {formatMoney(product.price)}
                    </p>
                    <p className="text-xs text-ink-400">
                      {product.stock > 0 ? `${product.stock} en stock` : 'Sin stock'}
                    </p>
                    <button
                      type="button"
                      className="btn-primary mt-3 w-full"
                      disabled={product.stock <= 0}
                      onClick={() => void handleAdd(product.id, product.name)}
                    >
                      {product.stock > 0 ? 'Agregar al carrito' : 'Sin stock'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <Modal
        open={Boolean(pending)}
        title="Tu carrito tiene productos de otro comercio"
        onClose={() => setPending(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setPending(null)}>
              Mantener mi carrito
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => pending && void handleAdd(pending.productId, pending.name, true)}
            >
              Vaciar y usar {store.name}
            </button>
          </>
        }
      >
        <p className="text-sm text-ink-600">
          Un pedido corresponde a un solo comercio. Si continuás con {store.name}, se vacía el
          carrito actual ({count} producto(s)) y se agrega el nuevo producto.
        </p>
      </Modal>
    </div>
  );
}
