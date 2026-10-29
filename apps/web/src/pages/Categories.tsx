import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { CategoryDto } from '@acoyaradas/shared';
import { ErrorState, Spinner } from '../components/ui';

const CATEGORY_ICONS: Record<string, string> = {
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

export default function Categories() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<{ items: CategoryDto[] }>('/categories'),
  });

  if (isLoading) return <Spinner />;
  if (error) {
    return (
      <div className="container-app py-10">
        <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <div className="container-app py-8">
      <h1 className="text-2xl font-black tracking-tight text-ink-900 sm:text-3xl">Categorías</h1>
      <p className="mt-1 text-sm text-ink-500">
        Las categorías las configura el administrador de acoYAradas! y pueden cambiar en cualquier
        momento.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {(data?.items ?? []).map((cat) => (
          <Link
            key={cat.id}
            to={`/comercios?categoria=${cat.id}`}
            className="card flex items-center justify-between gap-4 p-5 transition hover:border-brand-300 hover:shadow-md"
          >
            <div>
              <p className="text-lg font-bold text-ink-900">{cat.name}</p>
              <p className="text-sm text-ink-500">
                {cat.stores_count ?? 0} comercio(s) · {cat.products_count ?? 0} producto(s)
              </p>
            </div>
            <span className="text-2xl" aria-hidden>
              {CATEGORY_ICONS[cat.slug] ?? '🛍️'}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
