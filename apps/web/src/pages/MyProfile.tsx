import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { formatDateTime } from '../lib/format';
import { EmptyState, ErrorState, Field, Modal, SectionTitle, Spinner } from '../components/ui';
import { FileUpload } from '../components/FileUpload';

export default function MyProfile() {
  const { user, logout } = useSession();
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({ full_name: '', phone: '', avatar_url: '' });
  const [deleteOpen, setDeleteOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<{ user: any; profile: any }>('/me'),
    enabled: Boolean(user),
  });

  useEffect(() => {
    const p = data?.profile;
    if (p) {
      setForm({
        full_name: p.full_name ?? '',
        phone: p.phone ?? '',
        avatar_url: p.avatar_url ?? '',
      });
    }
  }, [data]);

  const save = useMutation({
    mutationFn: () =>
      api.patch('/me', {
        full_name: form.full_name,
        phone: form.phone,
        avatar_url: form.avatar_url || null,
      }),
    onSuccess: async () => {
      setMessage('Perfil guardado.');
      await queryClient.invalidateQueries({ queryKey: ['me'] });
    },
    onError: (err) => setMessage((err as Error).message),
  });

  const remove = useMutation({
    mutationFn: () => api.del('/me'),
    onSuccess: () => {
      logout();
      window.location.href = '/';
    },
    onError: (err) => setMessage((err as Error).message),
  });

  if (!user) {
    return (
      <div className="container-app py-10">
        <EmptyState title="Iniciá sesión" description="Necesitás una cuenta para ver tu perfil." />
      </div>
    );
  }
  if (isLoading) return <Spinner />;
  if (error) {
    return <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />;
  }

  const profile = data?.profile;

  return (
    <div className="container-app max-w-2xl py-8">
      <SectionTitle title="Mi perfil" subtitle="Tus datos y foto de perfil" />
      {message ? (
        <div className="mb-4 rounded-xl bg-ink-100 px-4 py-3 text-sm text-ink-700">{message}</div>
      ) : null}

      <div className="card space-y-4 p-6">
        <div className="flex items-center gap-4">
          {form.avatar_url ? (
            <img src={form.avatar_url} alt="" className="h-16 w-16 rounded-full object-cover" />
          ) : (
            <div className="grid h-16 w-16 place-items-center rounded-full bg-ink-100 text-2xl">👤</div>
          )}
          <div>
            <p className="font-semibold text-ink-900">{profile?.email}</p>
            <p className="text-xs text-ink-500">
              Miembro desde {profile?.created_at ? formatDateTime(profile.created_at) : '—'}
            </p>
          </div>
        </div>

        <FileUpload
          label="Foto de perfil"
          value={form.avatar_url}
          onChange={(url) => setForm((f) => ({ ...f, avatar_url: url }))}
        />
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

        <div className="flex gap-3">
          <button type="button" className="btn-primary" onClick={() => save.mutate()} disabled={save.isPending}>
            Guardar
          </button>
          <button
            type="button"
            className="btn-ghost text-red-600"
            onClick={() => setDeleteOpen(true)}
          >
            Eliminar cuenta
          </button>
        </div>
      </div>

      <Modal
        open={deleteOpen}
        title="Eliminar cuenta?"
        onClose={() => setDeleteOpen(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setDeleteOpen(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary bg-red-600 hover:bg-red-700"
              disabled={remove.isPending}
              onClick={() => remove.mutate()}
            >
              Aceptar
            </button>
          </>
        }
      >
        <p className="text-sm text-ink-600">
          Esta acción es permanente. Se eliminará tu cuenta y tus datos asociados.
        </p>
      </Modal>
    </div>
  );
}