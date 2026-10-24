import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { DataTable } from '../../components/PanelShell';
import { EmptyState, ErrorState, Field, Modal, SectionTitle, Spinner } from '../../components/ui';
import { USER_ROLES, type UserRole } from '@acoyaradas/shared';

interface AdminUser {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: UserRole;
  created_at: string;
  stores_count: number;
}

const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Administrador',
  store_owner: 'Comercio (titular)',
  store_staff: 'Comercio (empleado)',
  courier: 'Repartidor',
  customer: 'Cliente',
};

export default function AdminUsers() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [role, setRole] = useState<UserRole>('customer');

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => api.get<{ items: AdminUser[] }>('/admin/users'),
  });

  const changeRole = useMutation({
    mutationFn: (input: { id: string; role: UserRole }) =>
      api.patch(`/admin/users/${input.id}`, { role: input.role }),
    onSuccess: async () => {
      setEditing(null);
      setMessage('Rol actualizado.');
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err) => setMessage((err as Error).message),
  });

  const deleteUser = useMutation({
    mutationFn: (id: string) => api.del(`/admin/users/${id}`),
    onSuccess: async () => {
      setMessage('Usuario dado de baja.');
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    },
    onError: (err) => setMessage((err as Error).message),
  });

  if (isLoading) return <Spinner />;
  if (error) {
    return <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />;
  }

  const users = data?.items ?? [];

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Usuarios y roles"
        subtitle="Permisos asignados a cada cuenta de la plataforma"
      />

      {message ? (
        <div className="rounded-xl bg-ink-100 px-4 py-3 text-sm text-ink-700">{message}</div>
      ) : null}

      {users.length === 0 ? (
        <EmptyState title="No hay usuarios" description="Todavía no se registraron cuentas." />
      ) : (
        <DataTable headers={['Usuario', 'Email', 'Rol', 'Comercios', 'Alta', 'Acciones']} empty="Sin usuarios.">
          {users.map((u) => (
            <tr key={u.id}>
              <td className="font-medium text-ink-900">{u.full_name ?? '—'}</td>
              <td className="text-xs text-ink-600">{u.email}</td>
              <td>
                <span className="badge bg-ink-100 text-ink-700">{ROLE_LABELS[u.role] ?? u.role}</span>
              </td>
              <td className="text-xs">{u.stores_count}</td>
              <td className="text-xs text-ink-500">{formatDate(u.created_at)}</td>
              <td>
                <button
                  type="button"
                  className="text-sm font-medium text-brand-600 hover:underline"
                  onClick={() => {
                    setEditing(u);
                    setRole(u.role);
                  }}
                >
                  Cambiar rol
                </button>
                <button
                  type="button"
                  className="ml-3 text-sm font-medium text-red-600 hover:underline"
                  disabled={deleteUser.isPending}
                  onClick={() => {
                    if (window.confirm(`¿Dar de baja al usuario ${u.email}?`)) {
                      deleteUser.mutate(u.id);
                    }
                  }}
                >
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      <Modal
        open={editing !== null}
        title={`Rol de ${editing?.email ?? ''}`}
        onClose={() => setEditing(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={changeRole.isPending}
              onClick={() => editing && changeRole.mutate({ id: editing.id, role })}
            >
              Guardar
            </button>
          </>
        }
      >
        <p className="text-sm text-ink-600">
          Los permisos se aplican en el servidor y en las políticas RLS de la base de datos. No podés
          cambiar tu propio rol.
        </p>
        <Field label="Rol">
          <select
            className="input"
            value={role}
            onChange={(e) => setRole(e.target.value as UserRole)}
          >
            {USER_ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </Field>
      </Modal>
    </div>
  );
}
