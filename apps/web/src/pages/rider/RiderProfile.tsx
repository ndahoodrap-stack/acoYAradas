import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { SectionTitle, Spinner, ErrorState, StatCard } from '../../components/ui';

interface RiderProfile {
  id: string;
  full_name: string;
  phone: string;
  vehicle_type: string | null;
  zones: string[];
  active: boolean;
  available: boolean;
}

export default function RiderProfile() {
  const { user } = useSession();
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['rider-profile'],
    queryFn: () => api.get<RiderProfile>('/rider/profile'),
  });

  const toggle = useMutation({
    mutationFn: (available: boolean) =>
      api.patch<RiderProfile>('/rider/profile', { available }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['rider-profile'] });
    },
  });

  if (isLoading) return <Spinner />;
  if (error) {
    return <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />;
  }
  if (!data) return <Spinner />;

  return (
    <div className="space-y-4">
      <SectionTitle title="Mi perfil" subtitle="Datos del repartidor y disponibilidad" />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Nombre" value={data.full_name} />
        <StatCard label="Teléfono" value={data.phone} />
        <StatCard label="Vehículo" value={data.vehicle_type ?? '—'} />
      </div>

      <section className="card p-5">
        <h3 className="text-base font-bold text-ink-900">Disponibilidad</h3>
        <p className="mt-1 text-sm text-ink-500">
          Marcate disponible cuando puedas tomar entregas. El administrador puede ver tu estado al
          asignar pedidos.
        </p>
        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={data.available}
            disabled={toggle.isPending || !data.active}
            onChange={(e) => toggle.mutate(e.target.checked)}
          />
          Estoy disponible para entregar
        </label>
        {!data.active ? (
          <p className="mt-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
            Tu perfil está inactivo. Contactá al administrador de acoYAradas! para reactivarlo.
          </p>
        ) : null}
      </section>

      <section className="card p-5">
        <h3 className="text-base font-bold text-ink-900">Zonas de cobertura</h3>
        {(data.zones ?? []).length ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {data.zones.map((z) => (
              <li key={z} className="badge bg-ink-100 text-ink-700">
                {z}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-ink-500">Sin zonas asignadas.</p>
        )}
        <p className="mt-3 text-xs text-ink-500">
          Las zonas, el vehículo y el teléfono los edita el administrador de acoYAradas!
          {user?.email ? ` (cuenta ${user.email})` : ''}.
        </p>
      </section>
    </div>
  );
}
