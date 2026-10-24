import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { ProductDto, StoreDto } from '@acoyaradas/shared';
import { ProductCard, StoreCard } from '../components/Cards';
import { EmptyState, ErrorState, SectionTitle, Spinner } from '../components/ui';

interface SearchData {
  stores: StoreDto[];
  products: ProductDto[];
}

export default function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['search', q],
    queryFn: () => api.get<SearchData>(`/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
  });

  return (
    <div className="container-app py-8">
      <h1 className="text-2xl font-black tracking-tight text-ink-900 sm:text-3xl">
        Resultados de búsqueda
      </h1>
      <p className="mt-1 text-sm text-ink-500">
        {q ? `Buscando “${q}”` : 'Escribí al menos 2 caracteres para buscar.'}
      </p>

      <div className="mt-6 space-y-10">
        {isLoading ? <Spinner /> : null}
        {error ? <ErrorState message={(error as Error).message} onRetry={() => void refetch()} /> : null}

        {data?.stores?.length ? (
          <section>
            <SectionTitle title="Comercios" subtitle={`${data.stores.length} resultado(s)`} />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {data.stores.map((store) => (
                <StoreCard key={store.id} store={store} />
              ))}
            </div>
          </section>
        ) : null}

        {data?.products?.length ? (
          <section>
            <SectionTitle title="Productos" subtitle={`${data.products.length} resultado(s)`} />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {data.products.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </section>
        ) : null}

        {!isLoading && data && !data.stores.length && !data.products.length ? (
          <EmptyState
            title="No encontramos nada"
            description="Probá con otros términos o revisá los comercios disponibles."
          />
        ) : null}
      </div>
    </div>
  );
}
