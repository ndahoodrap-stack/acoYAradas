import { Link } from 'react-router-dom';
import type { ProductDto, StoreDto } from '@acoyaradas/shared';
import { formatMoney } from '../lib/format';
import { AvailabilityBadge, SponsoredTag } from './ui';

export function StoreCard({ store }: { store: StoreDto }) {
  return (
    <Link
      to={`/comercios/${store.slug}`}
      className="card group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="relative h-28 w-full overflow-hidden bg-ink-100">
        {store.cover_url ? (
          <img
            src={store.cover_url}
            alt=""
            loading="lazy"
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-3xl">🏪</div>
        )}
        {store.is_sponsored ? (
          <span className="absolute left-2 top-2">
            <SponsoredTag />
          </span>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="line-clamp-1 font-semibold text-ink-900">{store.name}</h3>
          <AvailabilityBadge isOpen={store.is_open} />
        </div>
        {store.category_name ? (
          <p className="text-xs font-medium uppercase tracking-wide text-brand-600">
            {store.category_name}
          </p>
        ) : null}
        <p className="line-clamp-2 text-sm text-ink-500">{store.description}</p>
        <p className="mt-auto pt-2 text-xs text-ink-500">
          {store.locality ? `${store.locality} · ` : ''}
          {store.products_count ?? 0} producto(s)
        </p>
      </div>
    </Link>
  );
}

export function ProductCard({ product }: { product: ProductDto }) {
  return (
    <Link
      to={`/productos/${product.id}`}
      className="card group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-lg"
    >
      <div className="h-32 w-full overflow-hidden bg-ink-100">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            loading="lazy"
            className="h-full w-full object-cover transition group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-3xl">🍽️</div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-3">
        {product.store_name ? (
          <p className="text-xs font-medium uppercase tracking-wide text-ink-400">
            {product.store_name}
          </p>
        ) : null}
        <h3 className="line-clamp-2 text-sm font-semibold text-ink-900">{product.name}</h3>
        <p className="mt-auto pt-2 text-base font-bold text-brand-600">
          {formatMoney(product.price)}
        </p>
      </div>
    </Link>
  );
}
