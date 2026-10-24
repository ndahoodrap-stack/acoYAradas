import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatDate, formatMoney } from '../../lib/format';
import { DataTable } from '../../components/PanelShell';
import { ConfirmDialog, EmptyState, ErrorState, Field, Modal, SectionTitle, Spinner } from '../../components/ui';

interface Rider {
  id: string;
  full_name: string;
  phone: string;
  vehicle_type: string | null;
  zones: string[];
  active: boolean;
  available: boolean;
  email: string | null;
  assignments: number;
  delivered: number;
  amount_due: number;
  created_at: string;
}

const EMPTY = {
  full_name: '',
  phone: '',
  vehicle_type: '',
  zones: '',
  active: true,
  available: true,
};

export default function AdminRiders() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Rider | null>(null);
  const [deleting, setDeleting] = useState<Rider | null>(null);
  const [form, setForm] = useState({ ...EMPTY });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-riders'],
    queryFn: () => api.get<{ items: Rider[] }>('/admin/riders'),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-riders'] });
  };

  const save = useMutation({
    mutationFn: () => {
      const body = {
        full_name: form.full_name,
        phone: form.phone,
        vehicle_type: form.vehicle_type,
        zones: form.zones
          .split(',')
          .map((z) => z.trim())
          .filter(Boolean),
        active: form.active,
        available: form.available,
      };
      if (editing) return api.patch(`/admin/riders/${editing.id}`, body);
      return api.post('/admin/riders', body);
    },
    onSuccess: async () => {
      setOpen(false);
      setEditing(null);
      setForm({ ...EMPTY });
      setMessage('Repartidor guardado.');
      await invalidate();
    },
    onError: (err) => setMessage((err as Error).message),
  });

  const toggle = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      api.patch(`/admin/riders/${input.id}`, { active: input.active }),
    onSuccess: async () => {
      setMessage('Disponibilidad actualizada.');
      await invalidate();
    },
    onError: (err) => setMessage((err as Error).message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/admin/riders/${id}`),
    onSuccess: async () => {
      setDeleting(null);
      setMessage('Repartidor eliminado. Su historial de entregas se conserva.');
      await invalidate();
    },
    onError: (err) => setMessage((err as Error).message),
  });

  if (isLoading) return <Spinner />;
  if (error) {
    return <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />;
  }

  const riders = data?.items ?? [];

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Repartidores"
        subtitle="Red de motomandados de acoYAradas!"
        action={
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setEditing(null);
              setForm({ ...EMPTY });
              setOpen(true);
            }}
          >
            + Nuevo repartidor
          </button>
        }
      />

      {message ? (
        <div className="rounded-xl bg-ink-100 px-4 py-3 text-sm text-ink-700">{message}</div>
      ) : null}

      {riders.length === 0 ? (
        <EmptyState
          title="Todavía no hay repartidores"
          description="Creá el primer perfil de repartidor para poder asignar pedidos."
        />
      ) : (
        <DataTable
          headers={['Repartidor', 'Contacto', 'Vehículo', 'Zonas', 'Estado', 'Entregas', 'Adeudado', 'Alta']}
          empty="Sin repartidores."
        >
          {riders.map((rider) => (
            <tr key={rider.id}>
              <td>
                <p className="font-medium text-ink-900">{rider.full_name}</p>
                {rider.email ? <p className="text-xs text-ink-500">{rider.email}</p> : null}
              </td>
              <td className="text-xs">{rider.phone}</td>
              <td className="text-xs">{rider.vehicle_type ?? '—'}</td>
              <td className="text-xs">{(rider.zones ?? []).join(', ') || '—'}</td>
              <td>
                <span
                  className={`badge ${
                    !rider.active
                      ? 'bg-ink-200 text-ink-600'
                      : rider.available
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {!rider.active ? 'Inactivo' : rider.available ? 'Disponible' : 'No disponible'}
                </span>
              </td>
              <td className="text-xs">
                {rider.delivered} entregadas
                <p className="text-ink-500">{rider.assignments} asignaciones</p>
              </td>
              <td className="text-xs font-semibold text-ink-900">{formatMoney(rider.amount_due)}</td>
              <td className="text-xs text-ink-500">{formatDate(rider.created_at)}</td>
              <td>
                <div className="flex flex-wrap gap-2 text-sm font-medium">
                  <button
                    type="button"
                    className="text-brand-600 hover:underline"
                    onClick={() => {
                      setEditing(rider);
                      setForm({
                        full_name: rider.full_name,
                        phone: rider.phone,
                        vehicle_type: rider.vehicle_type ?? '',
                        zones: (rider.zones ?? []).join(', '),
                        active: rider.active,
                        available: rider.available,
                      });
                      setOpen(true);
                    }}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className={rider.active ? 'text-amber-700 hover:underline' : 'text-emerald-700 hover:underline'}
                    disabled={toggle.isPending}
                    onClick={() => toggle.mutate({ id: rider.id, active: !rider.active })}
                  >
                    {rider.active ? 'Desactivar' : 'Activar'}
                  </button>
                  <button
                    type="button"
                    className="text-red-600 hover:underline"
                    onClick={() => setDeleting(rider)}
                  >
                    Eliminar
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      <Modal
        open={open}
        title={editing ? 'Editar repartidor' : 'Nuevo repartidor'}
        onClose={() => {
          setOpen(false);
          setEditing(null);
        }}
        footer={
          <>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setOpen(false);
                setEditing(null);
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={save.isPending}
              onClick={() => save.mutate()}
            >
              Guardar
            </button>
          </>
        }
      >
        <Field label="Nombre y apellido">
          <input
            className="input"
            value={form.full_name}
            onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
          />
        </Field>
        <Field label="Teléfono">
          <input
            className="input"
            value={form.phone}
            onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
          />
        </Field>
        <Field label="Vehículo" hint="Opcional: moto, auto, bicicleta…">
          <input
            className="input"
            value={form.vehicle_type}
            onChange={(e) => setForm((f) => ({ ...f, vehicle_type: e.target.value }))}
          />
        </Field>
        <Field label="Zonas" hint="Separadas por coma.">
          <input
            className="input"
            value={form.zones}
            onChange={(e) => setForm((f) => ({ ...f, zones: e.target.value }))}
          />
        </Field>
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
            />
            Activo
          </label>
          <label className="flex items-center gap-2 text-sm text-ink-700">
            <input
              type="checkbox"
              checked={form.available}
              onChange={(e) => setForm((f) => ({ ...f, available: e.target.checked }))}
            />
            Disponible
          </label>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleting !== null}
        title="Eliminar repartidor"
        description={
          <>
            ¿Querés eliminar a <strong>{deleting?.full_name}</strong>? Dejará de aparecer en los
            paneles y no se le podrán asignar pedidos nuevos. El historial de entregas se conserva.
          </>
        }
        busy={remove.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && remove.mutate(deleting.id)}
      />
    </div>
  );
}
