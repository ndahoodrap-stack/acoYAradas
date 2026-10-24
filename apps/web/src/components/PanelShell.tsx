import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { PLATFORM_COVERAGE_TEXT } from '@acoyaradas/shared';

export interface PanelLink {
  to: string;
  label: string;
  icon: string;
  end?: boolean;
}

/** Estructura común de los paneles (comercio, administración y repartidor). */
export function PanelShell({
  title,
  subtitle,
  links,
  children,
  aside,
}: {
  title: string;
  subtitle?: string;
  links: PanelLink[];
  children: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <div className="container-app py-6">
      <header className="panel-hero mb-5">
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <p className="panel-hero-eyebrow">
              <span aria-hidden>📍</span> {PLATFORM_COVERAGE_TEXT}
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-white sm:text-3xl">
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-1 max-w-2xl text-sm text-brand-50/90">{subtitle}</p>
            ) : null}
          </div>
          {aside ? <div className="flex flex-wrap gap-2">{aside}</div> : null}
        </div>
      </header>

      <div className="grid gap-6 lg:grid-cols-[230px_1fr]">
        <nav
          aria-label="Secciones del panel"
          className="card h-max p-2 lg:sticky lg:top-4"
        >
          <ul className="flex gap-1 overflow-x-auto lg:flex-col">
            {links.map((link) => (
              <li key={link.to} className="shrink-0 lg:w-full">
                <NavLink
                  to={link.to}
                  end={link.end}
                  className={({ isActive }) =>
                    `panel-nav-link ${isActive ? 'panel-nav-link-active' : ''}`
                  }
                >
                  <span className="panel-nav-icon" aria-hidden>
                    {link.icon}
                  </span>
                  <span className="truncate">{link.label}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="min-w-0 animate-fade-up">{children}</div>
      </div>
    </div>
  );
}

/** Tabla simple con estado vacío. */
export function DataTable({
  headers,
  children,
  empty,
}: {
  headers: string[];
  children: ReactNode;
  empty?: string;
}) {
  const isEmpty = Array.isArray(children) ? children.length === 0 : !children;
  if (isEmpty && empty) {
    return <div className="card px-6 py-10 text-center text-sm text-ink-500">{empty}</div>;
  }
  return (
    <div className="card overflow-x-auto">
      <table className="table">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}
