import { Link } from 'react-router-dom';
import type { ProductDto, StoreDto } from '@acoyaradas/shared';
import { formatMoney } from '../lib/format';
import { AvailabilityBadge, SponsoredTag } from './ui';

interface StoreCardProps {
  store: StoreDto;
  variant?: 'default' | 'glass';
}

export function StoreCard({ store, variant = 'default' }: StoreCardProps) {
  const isGlass = variant === 'glass';
  const baseClass = isGlass ? 'card-glass' : 'card';
  const hoverClass = isGlass ? 'group flex flex-col overflow-hidden' :
    'group flex flex-col overflow-hidden transition-all duration-200 hover:-translate-y-1 hover:border-brand-200 hover:shadow-card';

  return (
    <Link
      to={`/comercios/${store.slug}`}
      className={`${baseClass} ${hoverClass}`}
    >
      <div className="relative aspect-[16/9] w-full overflow-hidden bg-ink-100">
        {store.cover_url ? (
          <img
            src={store.cover_url}
            alt=""
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-3xl text-ink-400">🏪</div>
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

interface ProductCardProps {
  product: ProductDto;
  variant?: 'default' | 'glass';
}

export function ProductCard({ product, variant = 'default' }: ProductCardProps) {
  const open = product.store_is_open !== false;
  const isGlass = variant === 'glass';
  const baseClass = isGlass ? 'card-glass' : 'card';
  const hoverClass = isGlass ? '' : 'group flex flex-col overflow-hidden transition hover:-translate-y-0.5 hover:shadow-md';
  const glassHoverClass = isGlass ? 'group flex flex-col overflow-hidden' : '';

  return (
    <Link
      to={`/productos/${product.id}`}
      className={`${baseClass} ${hoverClass} ${glassHoverClass}`}
    >
      <div className="aspect-[4/3] w-full overflow-hidden bg-ink-100">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-2xl text-ink-400">🍽️</div>
        )}
      </div>
      <div className="flex flex-1 flex-col p-2.5">
        {product.store_name ? (
          <p
            className={`text-[11px] font-semibold uppercase tracking-wide ${
              open ? 'text-emerald-600' : 'text-red-600'
            }`}
          >
            {product.store_name} · {open ? 'Abierto' : 'Cerrado'}
          </p>
        ) : null}
        <h3 className="line-clamp-2 text-xs font-semibold text-ink-900">{product.name}</h3>
        <p className="mt-auto pt-1.5 text-sm font-bold text-brand-600 price">
          {formatMoney(product.price)}
        </p>
      </div>
    </Link>
  );
}
