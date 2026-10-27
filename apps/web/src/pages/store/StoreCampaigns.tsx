import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useSession } from '../../lib/session';
import { formatDate, formatMoney, formatNumber } from '../../lib/format';
import { DataTable } from '../../components/PanelShell';
import { ErrorState, Field, Modal, SectionTitle, Spinner } from '../../components/ui';
import { FileUpload } from '../../components/FileUpload';
import { AD_PLACEMENTS, type AdPlacement } from '@acoyaradas/shared';

interface Campaign {
  id: string;
  store_id: string;
  placement: AdPlacement;
  title: string;
  body: string | null;
  image_url: string | null;
  link_url: string | null;
  product_id: string | null;
  starts_at: string;
  ends_at: string;
  price: number;
  status: string;
  impressions: number;
  clicks: number;
  review_note: string | null;
  placement_name: string | null;
  price_per_day: number | null;
}

const PLACEMENT_LABELS: Record<AdPlacement, string> = {
  home_banner: 'Banner en la home',
  category_featured: 'Destacado en categorías',
  product_sponsored: 'Producto patrocinado',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  pending: 'En revisión',
  active: 'Activa',
  paused: 'Pausada',
  finished: 'Finalizada',
  rejected: 'Rechazada',
};

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-ink-200 text-ink-600',
  pending: 'bg-amber-100 text-amber-800',
  active: 'bg-emerald-100 text-emerald-800',
  paused: 'bg-sky-100 text-sky-800',
  finished: 'bg-ink-200 text-ink-700',
  rejected: 'bg-red-100 text-red-800',
};

function defaultDates() {
  const start = new Date();
  const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  return {
    starts_at: start.toISOString().slice(0, 10),
    ends_at: end.toISOString().slice(0, 10),
  };
}

export default function StoreCampaigns() {
  const { user } = useSession();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: placements } = useQuery({
    queryKey: ['public-placements'],
    queryFn: () => api.get<{ placements: { key: string; name: string; price_per_day: number }[] }>('/plans'),
  });
  const { data: storeProfile } = useQuery({
    queryKey: ['store-profile'],
    queryFn: () => api.get<{ store: { name: string } }>('/store/profile'),
    enabled: Boolean(user?.store_id),
  });
  const storeName = storeProfile?.store?.name ?? '';
  const [message, setMessage] = useState<string | null>(null);
  const [form, setForm] = useState({
    placement: 'home_banner' as AdPlacement,
    title: '',
    body: '',
    image_url: '',
    link_url: '',
    starts_at: defaultDates().starts_at,
    ends_at: defaultDates().ends_at,
    price: '0',
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['store-campaigns'],
    queryFn: () => api.get<{ items: Campaign[] }>('/store/campaigns'),
  });

  const create = useMutation({
    mutationFn: () =>
      api.post<Campaign>('/store/campaigns', {
        store_id: user?.store_id,
        placement: form.placement,
        title: form.title,
        body: form.body,
        image_url: form.image_url,
        link_url: form.link_url,
        starts_at: new Date().toISOString(),
        ends_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        price: Number(form.price || 0),
      }),
    onSuccess: async () => {
      setOpen(false);
      setMessage('Campaña enviada a revisión. Un administrador la aprobará.');
      setForm((f) => ({ ...f, title: '', body: '', image_url: '', link_url: '' }));
      await queryClient.invalidateQueries({ queryKey: ['store-campaigns'] });
    },
    onError: (err) => setMessage((err as Error).message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/store/campaigns/${id}`),
    onSuccess: async () => {
      setMessage('Campaña eliminada.');
      await queryClient.invalidateQueries({ queryKey: ['store-campaigns'] });
    },
    onError: (err) => setMessage((err as Error).message),
  });

  if (isLoading) return <Spinner />;
  if (error) {
    return <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />;
  }

  const campaigns = data?.items ?? [];

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Campañas publicitarias"
        subtitle="Pedí una ubicación sponsorizada para tu comercio"
        action={
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              const d = defaultDates();
              setForm((f) => ({
                ...f,
                title: storeName || f.title,
                starts_at: d.starts_at,
                ends_at: d.ends_at,
              }));
              setOpen(true);
            }}
          >
            + Nueva campaña
          </button>
        }
      />

      {message ? (
        <div className="rounded-xl bg-ink-100 px-4 py-3 text-sm text-ink-700">{message}</div>
      ) : null}

      <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
        Todo contenido patrocinado se publica con la etiqueta visible &laquo;Publicidad&raquo;. Las
        campañas se crean en estado &laquo;En revisión&raquo; y recién se publican cuando un
        administrador las aprueba.
      </p>

      <DataTable
        headers={['Campaña', 'Ubicación', 'Vigencia', 'Precio', 'Impresiones', 'Clics', 'Estado', 'Acciones']}
        empty="Todavía no tenés campañas. Creá la primera para promocionar tu comercio."
      >
        {campaigns.map((c) => (
          <tr key={c.id}>
            <td>
              <p className="font-medium text-ink-900">{c.title}</p>
              {c.body ? <p className="text-xs text-ink-500">{c.body}</p> : null}
              {c.review_note ? (
                <p className="text-xs text-red-600">Devolución: {c.review_note}</p>
              ) : null}
            </td>
            <td className="text-xs">
              {PLACEMENT_LABELS[c.placement] ?? c.placement}
              {c.placement_name ? (
                <p className="text-ink-500">{c.placement_name}</p>
              ) : null}
            </td>
            <td className="text-xs">
              {formatDate(c.starts_at)} → {formatDate(c.ends_at)}
            </td>
            <td>{formatMoney(c.price)}</td>
            <td>{formatNumber(c.impressions)}</td>
            <td>{formatNumber(c.clicks)}</td>
            <td>
              <span className={`badge ${STATUS_STYLES[c.status] ?? 'bg-ink-100 text-ink-700'}`}>
                {STATUS_LABELS[c.status] ?? c.status}
              </span>
            </td>
            <td>
              <button
                type="button"
                className="text-sm font-medium text-red-600 hover:underline"
                disabled={remove.isPending}
                onClick={() => {
                  if (window.confirm('¿Eliminar esta campaña?')) {
                    remove.mutate(c.id);
                  }
                }}
              >
                Eliminar
              </button>
            </td>
          </tr>
        ))}
      </DataTable>

      <Modal
        open={open}
        title="Nueva campaña publicitaria"
        onClose={() => setOpen(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setOpen(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={create.isPending || !user?.store_id}
              onClick={() => create.mutate()}
            >
              Enviar a revisión
            </button>
          </>
        }
      >
        <Field label="Ubicación">
          <select
            className="input"
            value={form.placement}
            onChange={(e) => {
              const p = e.target.value as AdPlacement;
              const pl = (placements?.placements ?? []).find((x) => x.key === p);
              setForm((f) => ({
                ...f,
                placement: p,
                price: pl ? String(pl.price_per_day * 7) : f.price,
              }));
            }}
          >
            {AD_PLACEMENTS.map((p) => {
              const pl = (placements?.placements ?? []).find((x) => x.key === p);
              return (
                <option key={p} value={p}>
                  {PLACEMENT_LABELS[p]} — {pl ? formatMoney(pl.price_per_day) + '/día' : ''}
                </option>
              );
            })}
          </select>
        </Field>
        <Field label="Título">
          <input
            className="input"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
        </Field>
        <Field label="Texto" hint="Mensaje breve que verá el cliente.">
          <textarea
            rows={2}
            className="input"
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
          />
        </Field>
        <FileUpload
          label="Imagen de la campaña"
          hint="Opcional. Se usa en el banner y en la home."
          value={form.image_url}
          onChange={(url) => setForm((f) => ({ ...f, image_url: url }))}
        />
        <Field label="Link de destino" hint="Opcional. A dónde lleva el banner.">
          <input
            className="input"
            value={form.link_url}
            onChange={(e) => setForm((f) => ({ ...f, link_url: e.target.value }))}
          />
        </Field>
        {form.image_url ? (
          <div className="overflow-hidden rounded-xl ring-1 ring-ink-200">
            <img src={form.image_url} alt={form.title} className="h-40 w-full object-cover" />
            <div className="bg-ink-50 p-3 text-sm">
              <p className="font-semibold text-ink-900">{form.title || storeName}</p>
              <p className="text-xs text-ink-500">{PLACEMENT_LABELS[form.placement]}</p>
            </div>
          </div>
        ) : null}
        <Field label="Precio (ARS)" hint="Calculado automáticamente según la ubicación (7 días).">
          <input
            type="number"
            min={0}
            step="0.01"
            className="input"
            value={form.price}
            readOnly
          />
        </Field>
      </Modal>
    </div>
  );
}
