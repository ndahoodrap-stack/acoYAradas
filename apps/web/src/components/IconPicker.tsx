import { PRODUCT_ICONS } from '../lib/productIcons';

export function IconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (url: string) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-medium text-ink-600">
        Icono predeterminado (opcional)
      </p>
      <div className="grid grid-cols-4 gap-3 sm:grid-cols-5 md:grid-cols-6">
        {PRODUCT_ICONS.map((icon) => {
          const selected = value === icon.url;
          return (
            <button
              key={icon.key}
              type="button"
              title={icon.label}
              onClick={() => onChange(selected ? '' : icon.url)}
              className={`flex flex-col items-center gap-2 rounded-2xl border p-3 text-xs transition ${
                selected
                  ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-500'
                  : 'border-ink-200 bg-white hover:border-brand-300 hover:bg-brand-50/40'
              }`}
            >
              <img src={icon.url} alt={icon.label} className="h-12 w-12" />
              <span className="text-center text-ink-700">{icon.label}</span>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] text-ink-500">
        Elegí un icono o subí una foto personalizada abajo. Hacé click de nuevo para quitar.
      </p>
    </div>
  );
}