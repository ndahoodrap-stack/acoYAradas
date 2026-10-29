import { useEffect, useMemo, useState, useCallback } from 'react';
import { Link, NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useCart } from '../lib/cart';
import { useSession } from '../lib/session';
import { formatMoney } from '../lib/format';
import { Icon } from './Icon';

interface PlatformSettings {
  platform: {
    name: string;
    tagline: string;
    contactEmail: string;
    contactPhone: string;
    coverageText: string;
    hoursText: string;
  };
  settings: Record<string, any>;
}

const LEGAL_LINKS = [
  { slug: 'terminos', label: 'Términos y condiciones' },
  { slug: 'privacidad', label: 'Política de privacidad' },
  { slug: 'comercios', label: 'Condiciones para comercios' },
  { slug: 'devoluciones', label: 'Cancelaciones y devoluciones' },
  { slug: 'entregas', label: 'Condiciones de entrega' },
  { slug: 'comisiones', label: 'Comisiones y publicidad' },
];

function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2">
      <img src="/acoyaradaslogo.jpg" alt="acoYAradas!" className="h-9 w-9 rounded-lg object-cover" />
      <span className="text-lg font-black tracking-tight text-ink-900">
        aco<span className="text-brand-500">YA</span>radas<span className="text-brand-500">!</span>
      </span>
    </Link>
  );
}

function SearchBox({ onDone }: { onDone?: () => void }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [term, setTerm] = useState(params.get('q') ?? '');

  useEffect(() => {
    setTerm(params.get('q') ?? '');
  }, [params]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = term.trim();
    navigate(value ? `/buscar?q=${encodeURIComponent(value)}` : '/buscar');
    onDone?.();
  };

  return (
    <form onSubmit={submit} className="relative w-full">
      <Icon name="search" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-400" />
      <input
        type="search"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Buscar productos y comercios…"
        aria-label="Buscar productos y comercios"
        className="input pl-9 pr-9"
      />
      {term ? (
        <button
          type="button"
          onClick={() => setTerm('')}
          className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-ink-400 hover:bg-ink-100 hover:text-ink-700"
          aria-label="Limpiar búsqueda"
        >
          <Icon name="close" className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </form>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useSession();
  const { count, subtotal } = useCart();
  const queryClient = useQueryClient();
  const handleLogout = () => {
    void logout();
    queryClient.removeQueries({ queryKey: ['me'] });
  };
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [showTop, setShowTop] = useState(false);
  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 8);
      setShowTop(window.scrollY > 400);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Smooth scroll to top with custom easing (better than native 'smooth')
  const scrollToTop = useCallback(() => {
    const start = window.scrollY;
    const duration = 600; // ms
    const startTime = performance.now();

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);
      window.scrollTo(0, start * (1 - eased));

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, []);

  const { data: settings } = useQuery({
    queryKey: ['platform-settings'],
    queryFn: () => api.get<PlatformSettings>('/settings'),
    staleTime: 5 * 60 * 1000,
  });

  // Fetch user profile to get avatar_url for header avatar
  // queryKey incluye user.id para evitar caché compartido entre usuarios
  const { data: me } = useQuery({
    queryKey: ['me', user?.id],
    queryFn: () => api.get<{ user: any; profile: any }>('/auth/me'),
    enabled: Boolean(user),
    staleTime: 30 * 1000, // 30s: refetch rápido al cambiar usuario
  });

  const panelLink = useMemo(() => {
    if (!user) return null;
    const avatarUrl = me?.profile?.avatar_url ?? null;
    if (user.role === 'admin') return { to: '/admin', label: 'Panel de administración', avatarUrl };
    if (user.role === 'store_owner' || user.role === 'store_staff') {
      return { to: '/comercio', label: 'Mi comercio', avatarUrl };
    }
    if (user.role === 'courier') return { to: '/repartidor', label: 'Mis entregas', avatarUrl };
    return { to: '/mis-pedidos', label: 'Mis pedidos', avatarUrl };
  }, [user, me?.profile?.avatar_url]);

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[1200] focus:rounded-lg focus:bg-brand-500 focus:px-4 focus:py-2 focus:text-white"
      >
        Saltar al contenido
      </a>
      <header
        className={`sticky top-0 z-40 border-b border-ink-200/80 bg-white/90 backdrop-blur transition-shadow duration-200 ${
          scrolled ? 'shadow-md' : 'shadow-sm'
        }`}
      >
        <div className="container-app flex items-center gap-3 py-3">
          <Logo />

          <nav className="hidden items-center gap-1 lg:flex">
            <NavLink
              to="/comercios"
              className={({ isActive }) =>
                `btn-ghost relative px-3 ${isActive ? 'text-brand-600 after:absolute after:bottom-0 after:left-3 after:right-3 after:h-0.5 after:rounded-full after:bg-brand-500' : ''}`
              }
            >
              Comercios
            </NavLink>
            <NavLink
              to="/categorias"
              className={({ isActive }) =>
                `btn-ghost relative px-3 ${isActive ? 'text-brand-600 after:absolute after:bottom-0 after:left-3 after:right-3 after:h-0.5 after:rounded-full after:bg-brand-500' : ''}`
              }
            >
              Categorías
            </NavLink>
            <NavLink
              to="/publicidad"
              className={({ isActive }) =>
                `btn-ghost relative px-3 ${isActive ? 'text-brand-600 after:absolute after:bottom-0 after:left-3 after:right-3 after:h-0.5 after:rounded-full after:bg-brand-500' : ''}`
              }
            >
              Publicidad
            </NavLink>
            <NavLink
              to="/sumate"
              className={({ isActive }) =>
                `btn-ghost relative px-3 ${isActive ? 'text-brand-600 after:absolute after:bottom-0 after:left-3 after:right-3 after:h-0.5 after:rounded-full after:bg-brand-500' : ''}`
              }
            >
              Sumate
            </NavLink>
          </nav>

          <div className="hidden flex-1 md:block">
            <SearchBox />
          </div>

          <div className="ml-auto flex items-center gap-1">
            <Link
              to="/carrito"
              className="btn-secondary relative gap-1.5 px-3 tabular-nums"
              aria-label={`Carrito con ${count} productos`}
            >
              <Icon name="cart" className="h-4 w-4" />
              <span className="hidden sm:inline">Carrito</span>
              {count > 0 ? (
                <>
                  <span className="hidden text-xs font-bold text-brand-600 sm:inline">
                    {formatMoney(subtotal)}
                  </span>
                  <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1 text-xs font-bold text-white animate-scale-in">
                    {count}
                  </span>
                </>
              ) : null}
            </Link>

            {user ? (
              <div className="hidden items-center gap-1 md:flex">
                {panelLink ? (
                  <Link
                    to={panelLink.to}
                    className="btn-ghost p-1"
                    aria-label={panelLink.label}
                  >
                    {panelLink.avatarUrl ? (
                      <img
                        src={panelLink.avatarUrl}
                        alt=""
                        className="h-8 w-8 rounded-full object-cover"
                      />
                    ) : (
                      <div className="grid h-8 w-8 place-items-center rounded-full bg-ink-100 text-sm font-medium text-ink-600">
                        {user.full_name?.[0]?.toUpperCase() ?? user.email?.[0]?.toUpperCase()}
                      </div>
                    )}
                  </Link>
                ) : null}

                <button
                  type="button"
                  className="btn-ghost px-3"
                  onClick={handleLogout}
                  title={user.email}
                >
                  Salir
                </button>
              </div>
            ) : (
              <Link to="/ingresar" className="btn-primary hidden px-4 md:inline-flex">
                Ingresar
              </Link>
            )}

            <button
              type="button"
              className="btn-ghost px-2 lg:hidden"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Abrir menú"
              aria-expanded={mobileOpen}
            >
              ☰
            </button>
          </div>
        </div>

        <div className="container-app pb-3 md:hidden">
          <SearchBox />
        </div>

        {mobileOpen ? (
          <div className="border-t border-ink-200 bg-white lg:hidden">
            <div className="container-app flex flex-col gap-1 py-3">
              {[
                { to: '/comercios', label: 'Comercios', icon: '🏪' },
                { to: '/categorias', label: 'Categorías', icon: '🗂️' },
                { to: '/publicidad', label: 'Publicidad', icon: '📣' },
                { to: '/sumate', label: 'Sumate como comercio', icon: '➕' },
                { to: '/mi-perfil', label: 'Mi perfil', icon: '👤' },
                { to: '/mis-pedidos', label: 'Mis pedidos', icon: '📦' },
                { to: '/seguimiento', label: 'Seguir un pedido', icon: '📍' },
              ].map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100 flex items-center gap-2"
                >
                  <span aria-hidden>{link.icon}</span>
                  {link.label}
                </NavLink>
              ))}
              {user ? (
                <>
                  {panelLink ? (
                    <NavLink
                      to={panelLink.to}
                      onClick={() => setMobileOpen(false)}
                      className="rounded-lg px-3 py-2 text-sm font-medium text-brand-600 hover:bg-ink-100 flex items-center gap-2"
                    >
                      {panelLink.avatarUrl ? (
                        <img
                          src={panelLink.avatarUrl}
                          alt=""
                          className="h-7 w-7 rounded-full object-cover"
                        />
                      ) : (
                        <div className="grid h-7 w-7 place-items-center rounded-full bg-ink-100 text-sm font-medium text-ink-600">
                          {user.full_name?.[0]?.toUpperCase() ?? user.email?.[0]?.toUpperCase()}
                        </div>
                      )}
                      {panelLink.label}
                    </NavLink>
                  ) : null}
                  <button
                    type="button"
                    className="rounded-lg px-3 py-2 text-left text-sm font-medium text-ink-700 hover:bg-ink-100"
                    onClick={() => {
                      handleLogout();
                      setMobileOpen(false);
                    }}
                  >
                    Cerrar sesión
                  </button>
                </>
              ) : (
                <Link
                  to="/ingresar"
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-brand-600 hover:bg-ink-100"
                >
                  Ingresar / crear cuenta
                </Link>
              )}
              {count > 0 ? (
                <p className="px-3 pt-1 text-xs text-ink-500">
                  Carrito: {count} producto(s) · {formatMoney(subtotal)}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}
      </header>

      {/* Scroll to Top Button - Modern polished design */}
      <button
        type="button"
        aria-label="Volver arriba"
        onClick={scrollToTop}
        className={`
          fixed bottom-6 right-6 z-50 grid h-11 w-11 place-items-center rounded-full
          bg-white/90 backdrop-blur-sm text-ink-900
          border border-ink-200
          shadow-[0_4px_14px_rgba(0,0,0,0.08),0_0_0_1px_rgba(0,0,0,0.02)]
          transition-[transform,opacity,box-shadow,border-color]
          duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)]
          hover:shadow-[0_8px_25px_rgba(0,0,0,0.12),0_0_0_1px_rgba(0,0,0,0.04)] hover:border-brand-300 hover:bg-white
          active:scale-[0.92] active:shadow-[0_2px_8px_rgba(0,0,0,0.1)]
          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2
          pointer-events-auto
          ${showTop ? 'translate-y-0 scale-100 opacity-100' : 'pointer-events-none translate-y-8 scale-95 opacity-0'}
        `}
      >
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M18 15l-6-6-6 6" />
        </svg>
        {/* Subtle pulse ring for visual polish */}
        <span className="absolute inset-0 rounded-full border-2 border-brand-500/30 opacity-0 transition-opacity duration-500 hover:opacity-100" aria-hidden="true" />
      </button>
      <main id="main-content" className="flex-1">{children}</main>

      <footer className="mt-12 border-t border-ink-200 bg-white">
        <div className="container-app grid gap-8 py-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <Logo />
            <p className="mt-3 text-sm text-ink-500">
              {settings?.platform.tagline ??
                'Comercios de tu zona, a un click. Comprá online, seguí tu pedido y ganá lugar en tu barrio.'}
            </p>
            <p className="mt-3 text-sm text-ink-500">
              <a className="hover:text-brand-600" href={`mailto:${settings?.platform.contactEmail ?? 'hola@acoyaradas.app'}`}>
                {settings?.platform.contactEmail ?? 'hola@acoyaradas.app'}
              </a>
              <br />
              <a className="hover:text-brand-600" href={`tel:${settings?.platform.contactPhone ?? ''}`}>
                {settings?.platform.contactPhone ?? '+54 9 11 0000-0000'}
              </a>
            </p>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-900">Cobertura</h4>
            <p className="text-sm text-ink-500">
              {settings?.platform.coverageText ??
                'Cobertura en San Carlos de Bolívar, Provincia de Buenos Aires. Llegamos a todo el casco urbano.'}
            </p>
            <h4 className="mb-2 mt-4 text-sm font-bold uppercase tracking-wide text-ink-900">Horarios</h4>
            <p className="text-sm text-ink-500">
              {settings?.platform.hoursText ?? 'Lunes a sábado de 9:00 a 21:00 h'}
            </p>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-900">Información</h4>
            <ul className="space-y-1.5 text-sm">
              {LEGAL_LINKS.map((link) => (
                <li key={link.slug}>
                  <Link to={`/legal/${link.slug}`} className="text-ink-500 hover:text-brand-600">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="mb-3 text-sm font-bold uppercase tracking-wide text-ink-900">Accesos</h4>
            <ul className="space-y-1.5 text-sm">
              <li>
                <Link to="/comercios" className="text-ink-500 hover:text-brand-600">
                  Ver comercios
                </Link>
              </li>
              <li>
                <Link to="/publicidad" className="text-ink-500 hover:text-brand-600">
                  Publicidad
                </Link>
              </li>
              <li>
                <Link to="/sumate" className="text-ink-500 hover:text-brand-600">
                  Sumate como comercio
                </Link>
              </li>
              <li>
                <Link to="/seguimiento" className="text-ink-500 hover:text-brand-600">
                  Seguir un pedido
                </Link>
              </li>
              <li>
                <Link to="/repartidor" className="text-ink-500 hover:text-brand-600">
                  Acceso repartidores
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-ink-100 py-5">
          <div className="container-app flex flex-col gap-2 text-xs text-ink-500 sm:flex-row sm:items-center sm:justify-between">
            <p>© {new Date().getFullYear()} acoYAradas!. Proyecto de demostración.</p>
            <p>
              Los importes de los medios de pago se registran como pendientes hasta su verificación
              por un administrador.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
