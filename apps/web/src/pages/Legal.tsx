import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { formatDate } from '../lib/format';
import { ErrorState, Spinner } from '../components/ui';

interface LegalPage {
  slug: string;
  title: string;
  body: string;
  updated_at: string;
}

export default function Legal() {
  const { slug = '' } = useParams();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['legal', slug],
    queryFn: () => api.get<LegalPage>(`/legal/${slug}`),
    enabled: Boolean(slug),
  });

  if (isLoading) return <Spinner />;
  if (error) {
    return (
      <div className="container-app py-10">
        <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="container-app max-w-3xl py-10">
      <p className="text-xs uppercase tracking-wide text-ink-400">
        <Link to="/" className="hover:text-brand-600">
          Inicio
        </Link>{' '}
        / Documento legal
      </p>
      <h1 className="mt-2 text-3xl font-black tracking-tight text-ink-900">{data.title}</h1>
      <p className="mt-1 text-sm text-ink-500">Última actualización: {formatDate(data.updated_at)}</p>

      <div className="card mt-6 p-6">
        <div className="prose max-w-none whitespace-pre-line text-sm leading-relaxed text-ink-700">
          {data.body}
        </div>
      </div>

      <p className="mt-4 text-xs text-ink-500">
        Este documento es editable por el administrador de acoYAradas!. Los textos son una base de
        trabajo y no constituyen asesoramiento legal: revisalos con un profesional antes de operar
        comercialmente.
      </p>
    </div>
  );
}
