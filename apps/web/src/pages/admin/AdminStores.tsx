import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { DataTable } from '../../components/PanelShell';
import { EmptyState, ErrorState, Field, Modal, SectionTitle, Spinner } from '../../components/ui';
import { FileUpload } from '../../components/FileUpload';
import { STORE_STATUSES, type StoreStatus } from '@acoyaradas/shared';

interface AdminStore {
  id: string;
  name: string;
  slug: string;
  status: StoreStatus;
  locality: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  description: string | null;
  logo_url: string | null;
  cover_url: string | null;
  category_id: string | null;
  category_name: string | null;
  owner_id: string | null;
  owner_email: string | null;
  owner_name: string | null;
  is_open: boolean;
  allows_platform_delivery: boolean;
  accepts_cash: boolean;
  accepts_transfer: boolean;
  accepts_terms: boolean;
  verified: boolean;
  created_at: string;
  products_count: number;
  orders_count: number;
}

const STATUS_LABELS: Record<StoreStatus, string> = {
  pending: 'Pendiente de aprobación',
  active: 'Activo',
  suspended: 'Suspendido',
  rejected: 'Rechazado',
};

const STATUS_STYLES: Record<StoreStatus, string> = {
  pending: 'bg-amber-100 text-amber-800',
  active: 'bg-emerald-100 text-emerald-800',
  suspended: 'bg-ink-200 text-ink-700',
  rejected: 'bg-red-100 text-red-800',
};

const EDITABLE_FIELDS = [
  'name',
  'description',
  'logo_url',
  'cover_url',
  'phone',
  'whatsapp',
  'email',
  'address',
  'locality',
  'is_open',
  'preparation_time_minutes',
  'allows_platform_delivery',
  'accepts_cash',
  'accepts_transfer',
  'accepts_terms',
] as const;

export default function AdminStores() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [review, setReview] = useState<AdminStore | null>(null);
  const [reviewStatus, setReviewStatus] = useState<StoreStatus>('active');
  const [reviewNote, setReviewNote] = useState('');
  const [editing, setEditing] = useState<AdminStore | null>(null);
  const [form, setForm] = useState<Record<string, unknown>>({});

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-stores', status, search],
    queryFn: () =>
      api.get<{ items: AdminStore[] }>(
        `/admin/stores?status=${status || 'all'}${search ? `&search=${encodeURIComponent(search)}` : ''}`,
      ),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-stores'] });
  };

  const reviewMutation = useMutation({
    mutationFn: (input: { id: string; status: StoreStatus; note: string }) =>
      api.patch(`/admin/stores/${input.id}`, { review: { status: input.status, note: input.note } }),
    onSuccess: async () => {
      setReview(null);
      setReviewNote('');
      setMessage('Comercio actualizado.');
      await invalidate();
    },
    onError: (err) => setMessage((err as Error).message),
  });

  const saveMutation = useMutation({
    mutationFn: (input: { id: string; body: Record<string, unknown> }) =>
      api.patch(`/admin/stores/${input.id}`, input.body),
    onSuccess: async () => {
      setEditing(null);
      setMessage('Datos del comercio guardados.');
      await invalidate();
    },
    onError: (err) => setMessage((err as Error).message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.del(`/admin/stores/${id}`),
    onSuccess: async () => {
      setMessage('Comercio dado de baja (baja lógica).');
      await invalidate();
    },
    onError: (err) => setMessage((err as Error).message),
  });

  if (isLoading) return <Spinner />;
  if (error) {
    return <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />;
  }

  const stores = data?.items ?? [];

  const openEdit = (store: AdminStore) => {
    setEditing(store);
    const next: Record<string, unknown> = {};
    for (const key of EDITABLE_FIELDS) {
      const value = (store as unknown as Record<string, unknown>)[key];
      next[key] = value ?? (typeof value === 'boolean' ? false : '');
    }
    setForm(next);
  };

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Comercios"
        subtitle="Aprobación, suspensión, edición y baja lógica"
      />

      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input max-w-xs"
          placeholder="Buscar por nombre…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Buscar comercio"
        />
        <select
          className="input w-auto"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Filtrar por estado"
        >
          <option value="">Todos los estados</option>
          {STORE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {message ? (
        <div className="rounded-xl bg-ink-100 px-4 py-3 text-sm text-ink-700">{message}</div>
      ) : null}

      {stores.length === 0 ? (
        <EmptyState
          title="No hay comercios con ese filtro"
          description="Las solicitudes de registro comercial aparecen acá para su aprobación."
        />
      ) : (
        <DataTable
          headers={['Comercio', 'Estado', 'Responsable', 'Contacto', 'Actividad', 'Alta', 'Acciones']}
          empty="Sin comercios."
        >
          {stores.map((store) => (
            <tr key={store.id}>
              <td>
                <p className="font-medium text-ink-900">{store.name}</p>
                <p className="text-xs text-ink-500">
                  {store.category_name ?? 'Sin categoría'} · {store.locality ?? '—'}
                </p>
              </td>
              <td>
                <span className={`badge ${STATUS_STYLES[store.status]}`}>
                  {STATUS_LABELS[store.status]}
                </span>
                {store.verified ? (
                  <span className="badge ml-1 bg-sky-100 text-sky-800">Verificado</span>
                ) : null}
              </td>
              <td className="text-xs">
                <p>{store.owner_name ?? '—'}</p>
                <p className="text-ink-500">{store.owner_email ?? '—'}</p>
              </td>
              <td className="text-xs">
                <p>{store.phone ?? '—'}</p>
                <p className="text-ink-500">{store.email ?? '—'}</p>
              </td>
              <td className="text-xs">
                <p>{store.products_count} producto(s)</p>
                <p className="text-ink-500">{store.orders_count} pedido(s)</p>
              </td>
              <td className="text-xs text-ink-500">{formatDate(store.created_at)}</td>
              <td>
                <div className="flex flex-wrap gap-2 text-sm font-medium">
                  <button
                    type="button"
                    className="text-brand-600 hover:underline"
                    onClick={() => {
                      setReview(store);
                      setReviewStatus(store.status === 'pending' ? 'active' : store.status);
                      setReviewNote('');
                    }}
                  >
                    Revisar
                  </button>
                  <button
                    type="button"
                    className="text-ink-700 hover:underline"
                    onClick={() => openEdit(store)}
                  >
                    Editar
                  </button>
                  {store.status !== 'suspended' && store.status !== 'rejected' ? (
                    <button
                      type="button"
                      className="text-amber-700 hover:underline"
                      disabled={reviewMutation.isPending}
                      onClick={() =>
                        reviewMutation.mutate({ id: store.id, status: 'suspended', note: 'Suspendido por el administrador' })
                      }
                    >
                      Suspender
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="text-emerald-700 hover:underline"
                      disabled={reviewMutation.isPending}
                      onClick={() =>
                        reviewMutation.mutate({ id: store.id, status: 'active', note: 'Reactivado' })
                      }
                    >
                      Reactivar
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-red-600 hover:underline"
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      if (window.confirm(`¿Dar de baja "${store.name}"? Se oculta del público.`)) {
                        deleteMutation.mutate(store.id);
                      }
                    }}
                  >
                    Dar de baja
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      <Modal
        open={review !== null}
        title={`Revisar ${review?.name ?? ''}`}
        onClose={() => setReview(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setReview(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={reviewMutation.isPending}
              onClick={() =>
                review &&
                reviewMutation.mutate({ id: review.id, status: reviewStatus, note: reviewNote })
              }
            >
              Aplicar
            </button>
          </>
        }
      >
        <p className="text-sm text-ink-600">
          Estado actual: <strong>{review ? STATUS_LABELS[review.status] : ''}</strong>. Al aprobar un
          comercio se le asigna el plan gratuito de bienvenida.
        </p>
        <p className="mt-2 text-xs text-ink-500">
          Cobro a este comercio: comision del 8% por pedido + espacios publicitarios opcionales (banner en
          inicio, comercio destacado, producto patrocinado).
        </p>
        <Field label="Nuevo estado">
          <select
            className="input"
            value={reviewStatus}
            onChange={(e) => setReviewStatus(e.target.value as StoreStatus)}
          >
            {STORE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nota para el comercio" hint="Se envía como notificación interna.">
          <textarea
            rows={3}
            className="input"
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
          />
        </Field>
        {review ? (
          <dl className="grid grid-cols-2 gap-2 rounded-xl bg-ink-50 p-3 text-xs text-ink-600">
            <div>
              <dt className="font-semibold text-ink-800">Condiciones aceptadas</dt>
              <dd>{review.accepts_terms ? 'Sí' : 'No'}</dd>
            </div>
            <div>
              <dt className="font-semibold text-ink-800">Entrega</dt>
              <dd>acoYAradas!</dd>
            </div>
          </dl>
        ) : null}
      </Modal>

      <Modal
        open={editing !== null}
        title={`Editar ${editing?.name ?? ''}`}
        onClose={() => setEditing(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={saveMutation.isPending}
              onClick={() => {
                if (!editing) return;
                const body: Record<string, unknown> = {};
                body.name = form.name;
                body.description = form.description;
                body.logo_url = form.logo_url;
                body.cover_url = form.cover_url;
                body.phone = form.phone;
                body.whatsapp = form.whatsapp;
                body.email = form.email;
                body.address = form.address;
                body.locality = form.locality;
                body.is_open = Boolean(form.is_open);
                body.preparation_time_minutes = Number(form.preparation_time_minutes || 0);
                body.allows_platform_delivery = true;
                body.accepts_cash = Boolean(form.accepts_cash);
                body.accepts_transfer = Boolean(form.accepts_transfer);
                body.accepts_terms = Boolean(form.accepts_terms);
                saveMutation.mutate({ id: editing.id, body });
              }}
            >
              Guardar
            </button>
          </>
        }
      >
        <Field label="Nombre">
          <input
            className="input"
            value={String(form.name ?? '')}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </Field>
        <Field label="Descripción">
          <textarea
            rows={3}
            className="input"
            value={String(form.description ?? '')}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <FileUpload
            label="Logo"
            aspectRatioPreset="square"
            recommendedWidth={256}
            recommendedHeight={256}
            value={String(form.logo_url ?? '')}
            onChange={(url) => setForm((f) => ({ ...f, logo_url: url }))}
          />
          <FileUpload
            label="Portada"
            aspectRatioPreset="banner"
            recommendedWidth={1200}
            recommendedHeight={400}
            value={String(form.cover_url ?? '')}
            onChange={(url) => setForm((f) => ({ ...f, cover_url: url }))}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Teléfono">
            <input
              className="input"
              value={String(form.phone ?? '')}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </Field>
          <Field label="WhatsApp">
            <input
              className="input"
              value={String(form.whatsapp ?? '')}
              onChange={(e) => setForm((f) => ({ ...f, whatsapp: e.target.value }))}
            />
          </Field>
          <Field label="Email">
            <input
              className="input"
              value={String(form.email ?? '')}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </Field>
          <Field label="Localidad">
            <input
              className="input"
              value={String(form.locality ?? '')}
              onChange={(e) => setForm((f) => ({ ...f, locality: e.target.value }))}
            />
          </Field>
          <Field label="Dirección">
            <input
              className="input"
              value={String(form.address ?? '')}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
            />
          </Field>
          <Field label="Tiempo de preparación (min)">
            <input
              type="number"
              min={0}
              className="input"
              value={String(form.preparation_time_minutes ?? 0)}
              onChange={(e) =>
                setForm((f) => ({ ...f, preparation_time_minutes: e.target.value }))
              }
            />
          </Field>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {(
            [
              ['is_open', 'Comercio abierto'],
              ['accepts_cash', 'Acepta efectivo'],
              ['accepts_transfer', 'Acepta transferencia'],
              ['accepts_terms', 'Aceptó condiciones comerciales'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm text-ink-700">
              <input
                type="checkbox"
                checked={Boolean(form[key])}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.checked }))}
              />
              {label}
            </label>
          ))}
        </div>
      </Modal>
    </div>
  );
}
