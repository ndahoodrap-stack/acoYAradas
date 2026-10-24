import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useCart } from '../lib/cart';
import { useSession } from '../lib/session';
import { formatMoney } from '../lib/format';

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
      <input
        type="search"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
        placeholder="Buscar productos y comercios…"
        aria-label="Buscar productos y comercios"
        className="input pl-9"
      />
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400">
        🔎
      </span>
    </form>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { user, logout } = useSession();
  const { count, subtotal } = useCart();
  const [mobileOpen, setMobileOpen] = useState(false);

  const { data: settings } = useQuery({
    queryKey: ['platform-settings'],
    queryFn: () => api.get<PlatformSettings>('/settings'),
    staleTime: 5 * 60 * 1000,
  });

  const panelLink = useMemo(() => {
    if (!user) return null;
    if (user.role === 'admin') return { to: '/admin', label: 'Panel de administración' };
    if (user.role === 'store_owner' || user.role === 'store_staff') {
      return { to: '/comercio', label: 'Mi comercio' };
    }
    if (user.role === 'courier') return { to: '/repartidor', label: 'Mis entregas' };
    return { to: '/mis-pedidos', label: 'Mis pedidos' };
  }, [user]);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-ink-200/80 bg-white/95 backdrop-blur">
        <div className="container-app flex items-center gap-3 py-3">
          <Logo />

          <nav className="hidden items-center gap-1 lg:flex">
            <NavLink
              to="/comercios"
              className={({ isActive }) =>
                `btn-ghost px-3 ${isActive ? 'text-brand-600' : ''}`
              }
            >
              Comercios
            </NavLink>
            <NavLink
              to="/categorias"
              className={({ isActive }) =>
                `btn-ghost px-3 ${isActive ? 'text-brand-600' : ''}`
              }
            >
              Categorías
            </NavLink>
            <NavLink
              to="/publicidad"
              className={({ isActive }) =>
                `btn-ghost px-3 ${isActive ? 'text-brand-600' : ''}`
              }
            >
              Publicidad
            </NavLink>
            <NavLink
              to="/sumate"
              className={({ isActive }) =>
                `btn-ghost px-3 ${isActive ? 'text-brand-600' : ''}`
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
              className="btn-secondary relative px-3"
              aria-label={`Carrito con ${count} productos`}
            >
              <span aria-hidden>🛒</span>
              <span className="hidden sm:inline">Carrito</span>
              {count > 0 ? (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-500 px-1 text-xs font-bold text-white">
                  {count}
                </span>
              ) : null}
            </Link>

            {user ? (
              <div className="hidden items-center gap-1 md:flex">
                {panelLink ? (
                  <Link to={panelLink.to} className="btn-ghost px-3">
                    {panelLink.label}
                  </Link>
                ) : null}
                <button
                  type="button"
                  className="btn-ghost px-3"
                  onClick={() => void logout()}
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
                { to: '/comercios', label: 'Comercios' },
                { to: '/categorias', label: 'Categorías' },
                { to: '/publicidad', label: 'Publicidad' },
                { to: '/sumate', label: 'Sumate como comercio' },
                { to: '/mis-pedidos', label: 'Mis pedidos' },
                { to: '/seguimiento', label: 'Seguir un pedido' },
              ].map((link) => (
                <NavLink
                  key={link.to}
                  to={link.to}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-lg px-3 py-2 text-sm font-medium text-ink-700 hover:bg-ink-100"
                >
                  {link.label}
                </NavLink>
              ))}
              {user ? (
                <>
                  {panelLink ? (
                    <NavLink
                      to={panelLink.to}
                      onClick={() => setMobileOpen(false)}
                      className="rounded-lg px-3 py-2 text-sm font-medium text-brand-600 hover:bg-ink-100"
                    >
                      {panelLink.label}
                    </NavLink>
                  ) : null}
                  <button
                    type="button"
                    className="rounded-lg px-3 py-2 text-left text-sm font-medium text-ink-700 hover:bg-ink-100"
                    onClick={() => {
                      void logout();
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

      <main className="flex-1">{children}</main>

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
                  Publicidad y planes
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
