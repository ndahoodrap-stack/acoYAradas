import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatMoney } from '../lib/format';
import { ErrorState, SectionTitle, Spinner } from '../components/ui';

interface Plan {
  id: string;
  name: string;
  code: string;
  price: number;
  billing_period: 'monthly' | 'yearly';
  product_limit: number;
  promo_limit: number;
  features: string[] | null;
}

interface Placement {
  key: string;
  name: string;
  description: string | null;
  price_per_day: number;
}

export default function Advertising() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['public-plans'],
    queryFn: () => api.get<{ plans: Plan[]; placements: Placement[] }>('/plans'),
  });

  return (
    <div className="container-app py-10">
      <h1 className="text-2xl font-black tracking-tight text-ink-900 sm:text-3xl">
        Publicidad para comercios
      </h1>
      <p className="mt-2 max-w-3xl text-sm text-ink-600">
        acoYAradas! cobra a los comercios afiliados una comisión del 8% por pedido y ofrece espacios
        publicitarios pagos: banner en la home, comercio destacado y producto patrocinado.
      </p>

      {isLoading ? (
        <Spinner />
      ) : error ? (
        <div className="mt-6">
          <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />
        </div>
      ) : (
        <>
          <section className="mt-10">
            <SectionTitle
              title="Espacios publicitarios"
              subtitle="Tarifas por ubicación y período"
            />
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {(data?.placements ?? []).map((placement) => (
                <div key={placement.key} className="card p-5">
                  <h3 className="font-bold text-ink-900">{placement.name}</h3>
                  {placement.description ? (
                    <p className="mt-1 text-sm text-ink-500">{placement.description}</p>
                  ) : null}
                  <p className="mt-3 text-lg font-black text-brand-600">
                    {formatMoney(placement.price_per_day)}
                    <span className="text-sm font-medium text-ink-500"> / día</span>
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-10 grid gap-4 sm:grid-cols-3">
            {[
              {
                title: 'Comisiones por pedido',
                text: 'Porcentaje o importe fijo por comercio, con base de cálculo configurable y registro de bruto, comisión y neto.',
              },
              {
                title: 'Publicidad paga',
                text: 'Campañas con fechas de inicio y fin, aprobación del administrador y registro de impresiones y clics.',
              },
            ].map((item) => (
              <div key={item.title} className="card p-5">
                <h3 className="font-bold text-ink-900">{item.title}</h3>
                <p className="mt-1.5 text-sm text-ink-500">{item.text}</p>
              </div>
            ))}
          </section>

          <div className="card mt-10 bg-amber-50 p-5 text-sm text-amber-900">
            <strong>Importante:</strong> los registros internos de pagos (publicidad y
            comisiones) se guardan como <em>pendientes</em> hasta que exista una confirmación
            verificable. La plataforma no procesa cobros en línea.
          </div>
        </>
      )}
    </div>
  );
}
