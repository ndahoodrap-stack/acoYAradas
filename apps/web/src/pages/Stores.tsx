import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, buildQuery } from '../lib/api';
import type { CategoryDto, StoreDto } from '@acoyaradas/shared';
import { StoreCard } from '../components/Cards';
import { EmptyState, ErrorState, Spinner } from '../components/ui';

interface ListResponse {
  items: StoreDto[];
  total: number;
  page: number;
  page_size: number;
}

export default function Stores() {
  const [params, setParams] = useSearchParams();
  const [term, setTerm] = useState(params.get('buscar') ?? '');
  const page = Math.max(1, Number(params.get('pagina') ?? 1));
  const category = params.get('categoria') ?? '';

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<{ items: CategoryDto[] }>('/categories'),
  });

  const query = useMemo(
    () =>
      buildQuery({
        search: params.get('buscar') ?? '',
        category,
        page,
        pageSize: 12,
      }),
    [params, category, page],
  );

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['stores', query],
    queryFn: () => api.get<ListResponse>(`/stores${query}`),
  });

  const setParam = (key: string, value: string | null) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'pagina') next.delete('pagina');
    setParams(next);
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <div className="container-app py-8">
      <h1 className="text-2xl font-black tracking-tight text-ink-900 sm:text-3xl">Comercios</h1>
      <p className="mt-1 text-sm text-ink-500">
        Cada comercio tiene su propio catálogo. Un pedido corresponde a un solo negocio.
      </p>

      <form
        className="mt-6 flex flex-col gap-3 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          setParam('buscar', term.trim() || null);
        }}
      >
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="Buscar comercio por nombre…"
          className="input flex-1"
          aria-label="Buscar comercio"
        />
        <select
          className="input sm:w-56"
          value={category}
          onChange={(e) => setParam('categoria', e.target.value || null)}
          aria-label="Filtrar por categoría"
        >
          <option value="">Todas las categorías</option>
          {(categories?.items ?? []).map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-primary">
          Filtrar
        </button>
      </form>

      <div className="mt-6">
        {isLoading ? (
          <Spinner />
        ) : error ? (
          <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />
        ) : !data?.items?.length ? (
          <EmptyState
            title="No encontramos comercios"
            description="Probá con otro nombre o quitá los filtros."
          />
        ) : (
          <>
            <p className="mb-3 text-sm text-ink-500">{data.total} comercio(s) encontrados</p>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {data.items.map((store) => (
                <StoreCard key={store.id} store={store} />
              ))}
            </div>

            {totalPages > 1 ? (
              <div className="mt-8 flex items-center justify-center gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={page <= 1}
                  onClick={() => setParam('pagina', String(page - 1))}
                >
                  Anterior
                </button>
                <span className="px-3 text-sm text-ink-600">
                  Página {page} de {totalPages}
                </span>
                <button
                  type="button"
                  className="btn-secondary"
                  disabled={page >= totalPages}
                  onClick={() => setParam('pagina', String(page + 1))}
                >
                  Siguiente
                </button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
