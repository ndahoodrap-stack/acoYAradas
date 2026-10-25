import { useMemo, useState } from 'react';
import { PRODUCT_ICONS } from '../lib/productIcons';

const CATEGORIES = ['Todos', 'Comidas', 'Saludable', 'Bebidas', 'Postres', 'Desayuno', 'Almacén', 'Hogar', 'Salud', 'Mascotas', 'Varios', 'Extras'] as const;

export function IconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  const [category, setCategory] = useState<(typeof CATEGORIES)[number]>('Todos');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return PRODUCT_ICONS.filter((icon) => {
      const matchCat = category === 'Todos' || icon.category === category;
      const matchQuery = !q || icon.label.toLowerCase().includes(q) || icon.key.includes(q);
      return matchCat && matchQuery;
    });
  }, [category, query]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-600">
          Icono predeterminado (opcional)
        </p>
        <span className="text-[11px] text-ink-500">{filtered.length} iconos</span>
      </div>

      <input
        className="input"
        placeholder="Buscar variedad/producto..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />

      <div className="no-scrollbar flex flex-wrap gap-2 overflow-x-auto">
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategory(cat)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              category === cat
                ? 'bg-brand-500 text-white shadow-sm'
                : 'bg-ink-100 text-ink-700 hover:bg-ink-200'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      <div className="max-h-[320px] overflow-auto rounded-2xl border border-ink-200/80 bg-ink-50/30 p-3 sm:p-4">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map((icon) => {
            const selected = value === icon.url;
            return (
              <button
                key={icon.key}
                type="button"
                title={icon.label}
                onClick={() => onChange(selected ? '' : icon.url)}
                className={`group flex flex-col items-center gap-2 rounded-2xl border p-3 text-center transition ${
                  selected
                    ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500'
                    : 'border-ink-200 bg-white hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-50/40 hover:shadow-sm'
                }`}
              >
                <img src={icon.url} alt={icon.label} className="h-14 w-14 transition group-hover:scale-105" />
                <span className="text-xs leading-tight text-ink-700">{icon.label}</span>
              </button>
            );
          })}
        </div>
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-500">No hay iconos para esta búsqueda.</p>
        ) : null}
      </div>

      <p className="text-[11px] text-ink-500">
        Elegí un icono o subí una foto personalizada abajo. Hacé click de nuevo para quitar la selección.
      </p>
    </div>
  );
}