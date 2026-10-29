import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatMoney } from '../lib/format';
import { ProductCard, StoreCard } from '../components/Cards';
import { Icon } from '../components/Icon';
import { EmptyState, ErrorState, SectionTitle, Spinner, SponsoredTag } from '../components/ui';
import type { CategoryDto, ProductDto, StoreDto } from '@acoyaradas/shared';

interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  placement: string;
  is_sponsored: boolean;
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
  const [showAd, setShowAd] = useState(true);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['home'],
    queryFn: () => api.get<HomeData>('/home'),
  });

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    const cycle = () => {
      setShowAd(true);
      timeout = setTimeout(() => {
        setShowAd(false);
        timeout = setTimeout(cycle, 5000);
      }, 15000);
    };
    cycle();
    return () => clearTimeout(timeout);
  }, []);

  if (isLoading) return <Spinner label="Cargando la tienda…" />;
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
  const paidBanner = banners.find((b: any) => b.is_sponsored) ?? banners[0] ?? null;

  return (
    <div>
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-500 via-brand-600 to-ink-900 text-white">
        <img
          src="/acoyaradasBANNER.png"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover object-center mix-blend-overlay"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-brand-500/80 via-brand-600/70 to-ink-900/90" />
        <div className="container-app relative grid gap-8 py-12 lg:grid-cols-2 lg:items-center lg:py-16">
          <div className="animate-fade-up">
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
              className="mt-6 flex max-w-lg gap-2"
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
                  className="input h-12 pl-10 text-base"
                />
              </div>
              <button type="submit" className="btn h-12 bg-ink-900 px-6 text-white hover:bg-ink-800 active:scale-[0.98]">
                Buscar
              </button>
            </form>

            <div className="mt-5 flex flex-wrap gap-3 text-sm">
              <Link to="/carrito" className="btn bg-white text-ink-900 hover:bg-ink-100">
                🛒 Ver mi carrito
              </Link>
              <Link
                to="/seguimiento"
                className="btn border border-white/40 text-white hover:bg-white/10"
              >
                📦 Seguir un pedido
              </Link>
            </div>
          </div>

          <div className="relative h-72 overflow-hidden rounded-2xl bg-ink-800/40 ring-1 ring-white/20">
            <div
              className={`absolute inset-0 transition-all duration-700 ease-in-out ${
                showAd ? 'opacity-0 -translate-x-4 pointer-events-none' : 'opacity-100 translate-x-0'
              }`}
            >
              <button
                type="button"
                className="block h-full w-full text-left"
                onClick={() => {
                  const el = document.getElementById('no-afiliados');
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
              >
                <img
                  src="/AcoyaradasCarrousel.jpg"
                  alt="acoYAradas!"
                  className="h-full w-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-900/90 to-transparent p-4">
                  <p className="text-lg font-bold text-white">Productos no afiliados</p>
                  <p className="text-xs text-white/80">Envío por acoYAradas!</p>
                </div>
              </button>
            </div>
            {paidBanner ? (
              <div
                className={`absolute inset-0 transition-all duration-700 ease-in-out ${
                  showAd ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4 pointer-events-none'
                }`}
              >
                <Link
                  to={paidBanner.link_url || (paidBanner.store_slug ? `/comercios/${paidBanner.store_slug}` : '/comercios')}
                  className="block h-full"
                >
                  {paidBanner.image_url ? (
                    <img
                      src={paidBanner.image_url}
                      alt={paidBanner.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center bg-gradient-to-br from-brand-500 to-ink-800 text-3xl">
                      🎉
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-ink-900/90 to-transparent p-4">
                    {paidBanner.is_sponsored ? <SponsoredTag className="mb-1" /> : null}
                    <p className="text-lg font-bold text-white">{paidBanner.title}</p>
                    {paidBanner.subtitle ? (
                      <p className="text-xs text-white/80">{paidBanner.subtitle}</p>
                    ) : null}
                  </div>
                </Link>
              </div>
            ) : null}
          </div>
        </div>
      </section>

      <div className="container-app space-y-12 py-10">
        {/* Categorías */}
        <section>
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
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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
                className="card flex items-center gap-3 px-4 py-3 transition hover:border-brand-300 hover:shadow-md"
              >
                {icon}
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
        <section>
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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {featured.map((store) => (
                <StoreCard key={store.id} store={store} />
              ))}
            </div>
          )}
        </section>

        {/* Promociones */}
        {data?.promotions?.length ? (
          <section>
            <SectionTitle title="Ofertas y promociones" subtitle="Descuentos vigentes ahora" />
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {data.promotions.map((promo) => (
                <div key={promo.id} className="card flex items-start gap-3 p-4">
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
        ) : null}

        {/* Populares */}
        <section>
          <SectionTitle title="Productos populares" subtitle="Los más pedidos por la comunidad" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(data?.popular ?? []).map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>

        {/* Novedades */}
        <section>
          <SectionTitle title="Novedades" subtitle="Lo último que agregaron los comercios" icon="🆕" />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(data?.newest ?? []).map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>

        {/* Productos no afiliados */}
        {(data?.unaffiliated ?? []).length ? (
          <section id="no-afiliados">
            <SectionTitle title="Productos no afiliados" subtitle="Disponibles para envío por motomandado" />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {(data?.unaffiliated ?? []).map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
