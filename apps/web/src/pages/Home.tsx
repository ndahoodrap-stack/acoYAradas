import { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatMoney } from '../lib/format';
import { ProductCard, StoreCard } from '../components/Cards';
import { Icon } from '../components/Icon';
import { EmptyState, ErrorState, SectionTitle, SponsoredTag } from '../components/ui';
import type { CategoryDto, ProductDto, StoreDto } from '@acoyaradas/shared';

interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  placement: string;
  sort_order: number;
  is_sponsored: boolean;
  store_slug?: string | null;
}

function Carousel({ banners, className = '' }: { banners: Banner[]; className?: string }) {
  const homeBanners = banners.filter((b) => b.placement === 'home_banner' && b.active);
  if (homeBanners.length === 0) return null;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const nextSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev + 1) % homeBanners.length);
  }, [homeBanners.length]);

  const prevSlide = useCallback(() => {
    setCurrentIndex((prev) => (prev - 1 + homeBanners.length) % homeBanners.length);
  }, [homeBanners.length]);

  // Auto-advance
  useEffect(() => {
    if (isPaused || homeBanners.length <= 1) return;
    timeoutRef.current = setTimeout(nextSlide, 5000);
    return () => clearTimeout(timeoutRef.current);
  }, [currentIndex, isPaused, homeBanners.length, nextSlide]);

  // Pause on hover/focus
  const handleMouseEnter = () => setIsPaused(true);
  const handleMouseLeave = () => setIsPaused(false);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') nextSlide();
      if (e.key === 'ArrowLeft') prevSlide();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [nextSlide, prevSlide]);

  return (
    <div
      className={`relative h-72 overflow-hidden rounded-2xl bg-ink-800/40 ring-1 ring-white/20 ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
      tabIndex={0}
      role="region"
      aria-label="Carrusel de banners"
    >
      <div className="absolute inset-0" aria-hidden="true">
        {homeBanners.map((banner, index) => (
          <div
            key={banner.id}
            className={`absolute inset-0 transition-opacity duration-500 ease-out ${
              index === currentIndex ? 'opacity-100 pointer-events-auto z-10' : 'opacity-0 pointer-events-none'
            }`}
            aria-hidden={index !== currentIndex}
          >
            <Link
              to={banner.link_url || (banner.store_slug ? `/comercios/${banner.store_slug}` : '/comercios')}
              className="block h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
            >
              {banner.image_url ? (
                <img
                  src={banner.image_url}
                  alt={banner.title}
                  className="h-full w-full object-cover"
                  loading={index === currentIndex ? 'eager' : 'lazy'}
                />
              ) : (
                <div className="flex h-full items-center justify-center bg-gradient-to-br from-brand-500 to-ink-800 text-3xl">
                  🎉
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-900/90 to-transparent p-4">
                {banner.is_sponsored && <SponsoredTag className="mb-1" />}
                <p className="text-lg font-bold text-white">{banner.title}</p>
                {banner.subtitle ? <p className="text-xs text-white/80">{banner.subtitle}</p> : null}
              </div>
            </Link>
          </div>
        ))}
      </div>

      {/* Navigation dots */}
      {homeBanners.length > 1 && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2" aria-label="Navegación del carrusel">
          {homeBanners.map((_, index) => (
            <button
              key={index}
              type="button"
              className={`w-2 h-2 rounded-full transition-all duration-300 ${
                index === currentIndex
                  ? 'bg-white w-6'
                  : 'bg-white/50 hover:bg-white/75'
              }`}
              onClick={() => setCurrentIndex(index)}
              aria-label={`Ir a slide ${index + 1}`}
              aria-current={index === currentIndex ? 'true' : 'false'}
            />
          ))}
        </div>
      )}

      {/* Prev/Next arrows (show on hover) */}
      {homeBanners.length > 1 && (
        <>
          <button
            type="button"
            className="absolute left-4 top-1/2 -translate-y-1/2 opacity-0 hover:opacity-100 transition-opacity duration-300 p-2 rounded-full bg-ink-900/50 text-white hover:bg-ink-900/75"
            onClick={prevSlide}
            aria-label="Banner anterior"
          >
            <Icon name="arrow-right" className="h-5 w-5 rotate-180" />
          </button>
          <button
            type="button"
            className="absolute right-4 top-1/2 -translate-y-1/2 opacity-0 hover:opacity-100 transition-opacity duration-300 p-2 rounded-full bg-ink-900/50 text-white hover:bg-ink-900/75"
            onClick={nextSlide}
            aria-label="Siguiente banner"
          >
            <Icon name="arrow-right" className="h-5 w-5" />
          </button>
        </>
      )}
    </div>
  );
}

interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  placement: string;
  is_sponsored: boolean;
  active: boolean;
  store_id?: string | null;
  store_slug?: string | null;
}

interface Promotion {
  id: string;
  title: string;
  description: string | null;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  store_id: string | null;
  store_name: string | null;
  is_global: boolean;
}

interface HomeData {
  categories: CategoryDto[];
  stores: StoreDto[];
  banners: Banner[];
  promotions: Promotion[];
  popular: ProductDto[];
  newest: ProductDto[];
  unaffiliated: ProductDto[];
}

export default function Home() {
  const [term, setTerm] = useState('');
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['home'],
    queryFn: () => api.get<HomeData>('/home'),
  });

  // Ripple effect handler for buttons and links
  const handleRipple = (e: React.MouseEvent<HTMLButtonElement | HTMLAnchorElement>) => {
    const target = e.currentTarget as HTMLElement;
    const rect = target.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    target.style.setProperty('--x', `${x}px`);
    target.style.setProperty('--y', `${y}px`);
  };

  if (isLoading) return (
    <div className="container-app space-y-12 py-10">
      {/* Hero skeleton */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-500 via-brand-600 to-ink-900 text-white">
        <div className="container-app relative grid gap-8 py-12 lg:grid-cols-2 lg:items-center lg:py-16">
          <div className="animate-fade-up">
            <div className="mb-4 skeleton-card h-8 w-32 rounded-full" />
            <div className="skeleton-card h-10 w-3/4" />
            <div className="skeleton-card h-10 w-3/4" />
            <div className="mt-6 skeleton-card h-12 w-1/2" />
            <div className="mt-5 skeleton-card h-10 w-2/3" />
          </div>
          <div className="relative h-72 overflow-hidden rounded-2xl bg-ink-800/40 ring-1 ring-white/20 skeleton-card" />
        </div>
      </section>

      {/* Categorías skeleton */}
      <section className="section-scroll-timeline">
        <div className="skeleton-card h-10 w-1/3 mb-4" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 reveal-stagger">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="skeleton-card h-20" />
          ))}
        </div>
      </section>

      {/* Comercios destacados skeleton */}
      <section className="section-scroll-timeline">
        <div className="skeleton-card h-10 w-1/3 mb-4" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 reveal-stagger">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton-card h-56" />
          ))}
        </div>
      </section>

      {/* Promociones skeleton */}
      <section className="section-scroll-timeline">
        <div className="skeleton-card h-10 w-1/3 mb-4" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 reveal-stagger">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton-card h-28" />
          ))}
        </div>
      </section>

      {/* Populares skeleton */}
      <section className="section-scroll-timeline">
        <div className="skeleton-card h-10 w-1/3 mb-4" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 reveal-stagger">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="skeleton-card h-56" />
          ))}
        </div>
      </section>

      {/* Novedades skeleton */}
      <section className="section-scroll-timeline">
        <div className="skeleton-card h-10 w-1/3 mb-4" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 reveal-stagger">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="skeleton-card h-56" />
          ))}
        </div>
      </section>

      {/* No afiliados skeleton */}
      <section id="no-afiliados" className="section-scroll-timeline">
        <div className="skeleton-card h-10 w-1/3 mb-4" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 reveal-stagger">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton-card h-56" />
          ))}
        </div>
      </section>
    </div>
  );
  if (error) {
    return (
      <div className="container-app py-10">
        <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />
      </div>
    );
  }

  const featured = data?.stores ?? [];
  const banners = data?.banners ?? [];
  const categories = data?.categories ?? [];

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-500 via-brand-600 to-ink-900 text-white section-scroll-timeline">
        {/* Background image with mix-blend-overlay (original design) */}
        <img
          src="/acoyaradasBANNER.png"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover object-center mix-blend-overlay"
        />
        {/* Gradient overlay for text readability */}
        <div className="absolute inset-0 bg-gradient-to-br from-brand-500/80 via-brand-600/70 to-ink-900/90" />
        <div className="container-app relative grid gap-8 py-12 lg:grid-cols-2 lg:items-center lg:py-16">
          <div className="reveal-on-scroll">
            <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold uppercase tracking-wide">
              <img src="/acoyaradaslogo.jpg" alt="acoYAradas!" className="h-6 w-6 rounded object-cover" />
              acoYAradas!
            </div>
            <h1 className="text-3xl font-black leading-tight tracking-tight sm:text-4xl lg:text-5xl">
              Comercios de tu zona, a un click
            </h1>
            <p className="mt-3 max-w-lg text-brand-50/90">
              Comprá en comercios de tu barrio, seguí tu pedido en vivo y ganá lugar en la cartelera
              de tu zona. Un pedido corresponde a un solo comercio.
            </p>

            <form
              className="mt-6 flex max-w-lg gap-2 search-glass p-2"
              onSubmit={(e) => {
                e.preventDefault();
                window.location.href = term.trim()
                  ? `/buscar?q=${encodeURIComponent(term.trim())}`
                  : '/buscar';
              }}
            >
              <div className="relative flex-1">
                <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
                <input
                  value={term}
                  onChange={(e) => setTerm(e.target.value)}
                  placeholder="¿Qué estás buscando?"
                  aria-label="Buscar"
                  className="input h-12 pl-10 text-base bg-transparent border-0 focus:ring-0 focus:outline-none"
                />
              </div>
              <button type="submit" className="btn btn-ripple btn-smile h-12 bg-ink-900 px-6 text-white hover:bg-ink-800 active:scale-[0.98]" onClick={handleRipple}>
                Buscar
              </button>
            </form>

            <div className="mt-5 flex flex-wrap gap-3 text-sm">
              <Link to="/carrito" className="btn btn-ripple btn-smile bg-white text-ink-900 hover:bg-ink-100" onClick={handleRipple}>
                🛒 Ver mi carrito
              </Link>
              <Link
                to="/seguimiento"
                className="btn btn-ripple border border-white/40 text-white hover:bg-white/10"
                onClick={handleRipple}
              >
                📦 Seguir un pedido
              </Link>
            </div>
          </div>

          <Carousel banners={banners} className="reveal-on-scroll" />
        </div>
      </section>

      <div className="container-app space-y-12 lg:space-y-8 py-10">
        {/* Categorías */}
        <section className="section-scroll-timeline">
          <SectionTitle
            title="Categorías"
            subtitle="Explorá por tipo de comercio"
            icon="🗂️"
            action={
              <Link to="/categorias" className="btn-ghost">
                Ver todas →
              </Link>
            }
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 reveal-stagger">
            {categories.map((cat) => {
              const FALLBACK_EMOJI: Record<string, string> = {
                gastronomia: '🍽️',
                restaurantes: '🍽️',
                rotiserias: '🍗',
                kioscos: '🏪',
                almacenes: '🛒',
                bebidas: '🥤',
                indumentaria: '👕',
                ferreterias: '🔧',
                tecnologia: '💻',
                farmacias: '💊',
              };
              const isUrl = (cat.icon_url?.startsWith('http') ?? false) || (cat.icon_url?.startsWith('/') ?? false);
              const icon = cat.icon_url ? (
                isUrl ? (
                  <img src={cat.icon_url} alt="" className="h-8 w-8 object-contain" />
                ) : (
                  <span className="text-2xl" aria-hidden>{cat.icon_url}</span>
                )
              ) : (
                <span className="text-2xl" aria-hidden>{FALLBACK_EMOJI[cat.slug] ?? '🛍️'}</span>
              );
              return (
              <Link
                key={cat.id}
                to={`/comercios?categoria=${cat.id}`}
                className="category-card flex items-center gap-3 px-4 py-3"
              >
                <span className="icon">{icon}</span>
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-ink-900">{cat.name}</span>
                  <span className="block text-xs text-ink-500">
                    {cat.stores_count ?? 0} comercio(s)
                  </span>
                </span>
              </Link>
              );
            })}
          </div>
        </section>

        {/* Comercios destacados */}
        <div className="border-t border-white/10 pt-6">
          <section className="section-scroll-timeline">
          <SectionTitle
            title="Comercios destacados"
            subtitle="Los negocios más elegidos de la plataforma"
            icon="🏪"
            action={
              <Link to="/comercios" className="btn-ghost">
                Ver todos →
              </Link>
            }
          />
          {featured.length === 0 ? (
            <EmptyState
              title="Todavía no hay comercios publicados"
              description="Cuando el administrador apruebe solicitudes, van a aparecer acá."
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 reveal-stagger">
              {featured.map((store) => (
                <StoreCard key={store.id} store={store} variant="glass" />
              ))}
            </div>
          )}
        </section>
        </div>

        {/* Promociones */}
        {data?.promotions?.length ? (
          <div className="border-t border-white/10 pt-6 bg-gradient-to-b from-brand-50/20 to-transparent rounded-2xl -mx-4 px-4">
            <section className="section-scroll-timeline">
            <SectionTitle title="Ofertas y promociones" subtitle="Descuentos vigentes ahora" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 reveal-stagger">
              {data.promotions.map((promo) => (
                <div key={promo.id} className="card-glass flex items-start gap-3 p-4">
                  <span className="text-2xl" aria-hidden>
                    🏷️
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold text-ink-900">{promo.title}</p>
                    {promo.description ? (
                      <p className="text-sm text-ink-500">{promo.description}</p>
                    ) : null}
                    <p className="mt-1 text-sm font-bold text-brand-600">
                      {promo.discount_type === 'percent'
                        ? `${promo.discount_value}% de descuento`
                        : `${formatMoney(promo.discount_value)} de descuento`}
                      {promo.store_name ? ` · ${promo.store_name}` : ' · Global'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
        ) : null}

        {/* Populares */}
        <div className="border-t border-white/10 pt-6">
          <section className="section-scroll-timeline">
          <SectionTitle title="Productos populares" subtitle="Los más pedidos por la comunidad" icon="🔥" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 reveal-stagger">
            {(data?.popular ?? []).map((product) => (
              <ProductCard key={product.id} product={product} variant="glass" />
            ))}
          </div>
        </section>
        </div>

        {/* Novedades */}
        <div className="border-t border-white/10 pt-6 bg-gradient-to-b from-brand-50/20 to-transparent rounded-2xl -mx-4 px-4">
          <section className="section-scroll-timeline">
          <SectionTitle title="Novedades" subtitle="Lo último que agregaron los comercios" icon="🆕" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 reveal-stagger">
            {(data?.newest ?? []).map((product) => (
              <ProductCard key={product.id} product={product} variant="glass" />
            ))}
          </div>
        </section>
        </div>

        {/* Productos no afiliados */}
        {(data?.unaffiliated ?? []).length ? (
          <div className="border-t border-white/10 pt-6">
            <section id="no-afiliados" className="section-scroll-timeline">
            <SectionTitle title="Productos no afiliados" subtitle="Disponibles para envío por motomandado" icon={<img src="/icono-productos-no-afiliados.svg" alt="" className="h-6 w-6" />} />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 reveal-stagger">
              {(data?.unaffiliated ?? []).map((product) => (
                <ProductCard key={product.id} product={product} variant="glass" />
              ))}
            </div>
          </section>
          </div>
        ) : null}
      </div>
    </div>
  );
}
