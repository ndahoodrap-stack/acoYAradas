import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { formatDateTime, formatMoney } from '../lib/format';
import { useSession } from '../lib/session';
import type { OrderDto } from '@acoyaradas/shared';
import { EmptyState, ErrorState, Field, Modal, Spinner, StatusBadge } from '../components/ui';
import { FileUpload } from '../components/FileUpload';

export default function MyOrders() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileForm, setProfileForm] = useState({ full_name: '', phone: '', avatar_url: '' });

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<{ profile: any }>('/me'),
    enabled: Boolean(user),
  });

  useEffect(() => {
    const p = me?.profile;
    if (p) {
      setProfileForm({
        full_name: p.full_name ?? '',
        phone: p.phone ?? '',
        avatar_url: p.avatar_url ?? '',
      });
    }
  }, [me]);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['my-orders'],
    queryFn: () => api.get<{ items: OrderDto[] }>('/orders/mine'),
    enabled: Boolean(user),
  });

  const saveProfile = useMutation({
    mutationFn: () =>
      api.patch('/me', {
        full_name: profileForm.full_name,
        phone: profileForm.phone,
        avatar_url: profileForm.avatar_url || null,
      }),
    onSuccess: async () => {
      setMessage('Perfil guardado.');
      setProfileOpen(false);
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err) => setMessage((err as Error).message),
  });

  const deleteAccount = useMutation({
    mutationFn: () => api.del('/me'),
    onSuccess: () => {
      window.location.href = '/';
    },
    onError: (err) => setMessage((err as Error).message),
  });

  const cancel = useMutation({
    mutationFn: (orderId: string) => api.post<OrderDto>(`/orders/${orderId}/cancel`, { reason: 'Cancelado por el cliente' }),
    onSuccess: async () => {
      setMessage('El pedido fue cancelado y el stock se devolvió al comercio.');
      await queryClient.invalidateQueries({ queryKey: ['my-orders'] });
    },
    onError: (err) => setMessage((err as Error).message),
  });

  if (!user) return null;
  if (isLoading) return <Spinner />;
  if (error) {
    return (
      <div className="container-app py-10">
        <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />
      </div>
    );
  }

  const orders = data?.items ?? [];

  return (
    <div className="container-app py-8">
      <h1 className="text-2xl font-black tracking-tight text-ink-900 sm:text-3xl">Mis pedidos</h1>
      <p className="mt-1 text-sm text-ink-500">
        Historial de compras de {user.email}.
      </p>

      {message ? (
        <div className="mt-4 rounded-xl bg-ink-100 px-4 py-3 text-sm text-ink-700">{message}</div>
      ) : null}

      <div className="card mb-6 flex items-center gap-4 p-4">
        {me?.profile?.avatar_url ? (
          <img src={me.profile.avatar_url} alt="" className="h-12 w-12 rounded-full object-cover" />
        ) : (
          <div className="grid h-12 w-12 place-items-center rounded-full bg-ink-100 text-xl">👤</div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-ink-900">{me?.profile?.full_name ?? user.full_name ?? user.email}</p>
          <p className="text-xs text-ink-500">{me?.profile?.phone ?? user.phone ?? 'Sin teléfono'}</p>
        </div>
        <button type="button" className="btn-secondary" onClick={() => setProfileOpen(true)}>
          Configurar perfil
        </button>
      </div>

      <div className="mt-6 space-y-4">
        {orders.length === 0 ? (
          <EmptyState
            title="Todavía no tenés pedidos"
            description="Cuando hagas una compra, vas a ver el estado y el seguimiento acá."
            action={{ label: 'Ver comercios', to: '/comercios' }}
          />
        ) : (
          orders.map((order) => (
            <div key={order.id} className="card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-mono text-sm font-bold text-ink-900">{order.code}</p>
                  <p className="text-xs text-ink-500">
                    {order.store_name} · {formatDateTime(order.placed_at)}
                  </p>
                </div>
                <StatusBadge status={order.status} />
              </div>

              <ul className="mt-3 space-y-1 text-sm text-ink-600">
                {order.items.map((item) => (
                  <li key={item.id} className="flex justify-between gap-3">
                    <span>
                      {item.quantity} × {item.name_snapshot}
                    </span>
                    <span>{formatMoney(item.line_total)}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-ink-100 pt-3">
                <p className="text-sm font-semibold text-ink-900">
                  Total {formatMoney(order.total)}{' '}
                  <span className="font-normal text-ink-500">
                    (pago {order.payment_status === 'pending' ? 'pendiente' : order.payment_status})
                  </span>
                </p>
                <div className="flex gap-2">
                  {order.public_token ? (
                    <Link
                      to={`/seguimiento/${order.code}?token=${order.public_token}`}
                      className="btn-secondary"
                    >
                      Seguir
                    </Link>
                  ) : null}
                  {['pending_confirmation', 'confirmed', 'preparing'].includes(order.status) ? (
                    <button
                      type="button"
                      className="btn-ghost text-red-600"
                      disabled={cancel.isPending}
                      onClick={() => cancel.mutate(order.id)}
                    >
                      Cancelar
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      <Modal
        open={profileOpen}
        title="Configurar perfil"
        onClose={() => setProfileOpen(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setProfileOpen(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={saveProfile.isPending}
              onClick={() => saveProfile.mutate()}
            >
              Guardar
            </button>
          </>
        }
      >
        <FileUpload
          label="Foto de perfil"
          value={profileForm.avatar_url}
          onChange={(url) => setProfileForm((f) => ({ ...f, avatar_url: url }))}
        />
        <Field label="Nombre y apellido">
          <input
            className="input"
            value={profileForm.full_name}
            onChange={(e) => setProfileForm((f) => ({ ...f, full_name: e.target.value }))}
          />
        </Field>
        <Field label="Teléfono">
          <input
            className="input"
            value={profileForm.phone}
            onChange={(e) => setProfileForm((f) => ({ ...f, phone: e.target.value }))}
          />
        </Field>
        <button
          type="button"
          className="btn-ghost text-red-600"
          onClick={() => {
            if (window.confirm('Eliminar cuenta?')) deleteAccount.mutate();
          }}
        >
          Eliminar cuenta
        </button>
      </Modal>
    </div>
  );
}
