import { Link } from 'react-router-dom';
import { useCart } from '../lib/cart';
import { formatMoney } from '../lib/format';
import { EmptyState, Spinner } from '../components/ui';

export default function CartPage() {
  const { cart, loading, updateItem, removeItem, clear, subtotal } = useCart();

  if (loading) return <Spinner />;

  if (!cart.items.length) {
    return (
      <div className="container-app py-10">
        <EmptyState
          title="Tu carrito está vacío"
          description="Agregá productos desde el catálogo de cualquier comercio."
          action={{ label: 'Ver comercios', to: '/comercios' }}
        />
      </div>
    );
  }

  return (
    <div className="container-app py-8">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-black tracking-tight text-ink-900 sm:text-3xl">Tu carrito</h1>
        <button type="button" className="btn-ghost text-red-600" onClick={() => void clear()}>
          Vaciar carrito
        </button>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="card divide-y divide-ink-100">
            {cart.store_name ? (
              <div className="flex items-center justify-between bg-ink-50 px-4 py-3 text-sm">
                <span className="text-ink-600">
                  Pedido para <strong className="text-ink-900">{cart.store_name}</strong>
                </span>
                <span className="text-xs text-ink-500">Un pedido = un comercio</span>
              </div>
            ) : null}

            {cart.items.map((item) => (
              <div key={item.id} className="flex gap-4 p-4">
                <Link
                  to={`/productos/${item.product_id}`}
                  className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-ink-100"
                >
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt={item.product_name}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-2xl">🍽️</div>
                  )}
                </Link>

                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink-900">{item.product_name}</p>
                  <p className="text-sm text-ink-500">{formatMoney(item.price)} c/u</p>
                  {item.notes ? <p className="mt-1 text-xs text-ink-500">Nota: {item.notes}</p> : null}
                  {!item.available ? (
                    <p className="mt-1 text-xs font-medium text-red-600">
                      Este producto ya no está disponible.
                    </p>
                  ) : null}

                  <div className="mt-3 inline-flex items-center rounded-lg border border-ink-300">
                    <button
                      type="button"
                      className="px-2.5 py-1 text-ink-600"
                      onClick={() => void updateItem(item.id, item.quantity - 1)}
                      aria-label="Restar uno"
                    >
                      −
                    </button>
                    <span className="w-9 text-center text-sm font-semibold">{item.quantity}</span>
                    <button
                      type="button"
                      className="px-2.5 py-1 text-ink-600 disabled:opacity-40"
                      onClick={() => void updateItem(item.id, item.quantity + 1)}
                      disabled={item.quantity >= item.stock}
                      aria-label="Agregar uno"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="flex flex-col items-end justify-between">
                  <p className="font-bold text-ink-900">{formatMoney(item.line_total)}</p>
                  <button
                    type="button"
                    className="text-xs text-ink-400 hover:text-red-600"
                    onClick={() => void removeItem(item.id)}
                  >
                    Quitar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <aside>
          <div className="card sticky top-24 p-5">
            <h2 className="text-lg font-bold text-ink-900">Resumen</h2>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-ink-600">Subtotal</dt>
                <dd className="font-medium text-ink-900">{formatMoney(subtotal)}</dd>
              </div>
              <div className="flex justify-between text-ink-500">
                <dt>Envío y descuentos</dt>
                <dd>Se calculan al confirmar</dd>
              </div>
            </dl>
            <div className="mt-4 flex justify-between border-t border-ink-100 pt-4">
              <span className="font-semibold text-ink-900">Total estimado</span>
              <span className="text-xl font-black text-brand-600">{formatMoney(subtotal)}</span>
            </div>
            <Link to="/finalizar-compra" className="btn-primary mt-5 w-full">
              Finalizar compra
            </Link>
            <p className="mt-3 text-xs text-ink-500">
              Podés comprar sin cuenta. El pedido queda asociado a un enlace seguro de seguimiento.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
