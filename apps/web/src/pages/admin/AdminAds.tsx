import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatDate, formatMoney, formatNumber } from '../../lib/format';
import { DataTable } from '../../components/PanelShell';
import { EmptyState, ErrorState, Field, Modal, SectionTitle, Spinner } from '../../components/ui';
import { FileUpload } from '../../components/FileUpload';
import { AD_PLACEMENTS, CAMPAIGN_STATUSES, type AdPlacement } from '@acoyaradas/shared';

interface Banner {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string | null;
  link_url: string | null;
  placement: string;
  sort_order: number;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  store_id: string | null;
  campaign_status: string | null;
}

interface Campaign {
  id: string;
  store_id: string;
  store_name: string;
  store_slug: string;
  placement: AdPlacement;
  title: string;
  body: string | null;
  image_url: string | null;
  link_url: string | null;
  starts_at: string;
  ends_at: string;
  price: number;
  status: string;
  impressions: number;
  clicks: number;
  review_note: string | null;
  placement_name: string | null;
  price_per_day: number | null;
  banner_id: string | null;
}

interface Placement {
  id: string;
  key: string;
  name: string;
  description: string | null;
  price_per_day: number;
  active: boolean;
}

const PLACEMENT_LABELS: Record<string, string> = {
  home_banner: 'Banner en la home',
  category_featured: 'Destacado en categorías',
  product_sponsored: 'Producto patrocinado',
};

const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  pending: 'En revisión',
  active: 'Activa',
  paused: 'Pausada',
  finished: 'Finalizada',
  rejected: 'Rechazada',
};

const CAMPAIGN_STATUS_STYLES: Record<string, string> = {
  draft: 'bg-ink-200 text-ink-600',
  pending: 'bg-amber-100 text-amber-800',
  active: 'bg-emerald-100 text-emerald-800',
  paused: 'bg-sky-100 text-sky-800',
  finished: 'bg-ink-200 text-ink-700',
  rejected: 'bg-red-100 text-red-800',
};

export default function AdminAds() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'campanas' | 'banners' | 'espacios'>('campanas');
  const [message, setMessage] = useState<string | null>(null);
  const [review, setReview] = useState<Campaign | null>(null);
  const [reviewStatus, setReviewStatus] = useState('');
  const [reviewNote, setReviewNote] = useState('');
  const [bannerOpen, setBannerOpen] = useState(false);
  const [bannerForm, setBannerForm] = useState({
    id: '',
    title: '',
    subtitle: '',
    image_url: '',
    link_url: '',
    placement: 'home_banner',
    sort_order: '0',
    active: true,
    starts_at: '',
    ends_at: '',
  });
  const [placementOpen, setPlacementOpen] = useState(false);
  const [placementForm, setPlacementForm] = useState({
    key: '',
    name: '',
    description: '',
    price_per_day: '0',
    active: true,
  });

  const handleEditBanner = (b: Banner) => {
    setBannerForm({
      id: b.id,
      title: b.title,
      subtitle: b.subtitle ?? '',
      image_url: b.image_url ?? '',
      link_url: b.link_url ?? '',
      placement: b.placement,
      sort_order: String(b.sort_order ?? 0),
      active: b.active,
      starts_at: b.starts_at ? b.starts_at.split('T')[0] : '',
      ends_at: b.ends_at ? b.ends_at.split('T')[0] : '',
    });
    setBannerOpen(true);
  };

  const handleNewBanner = () => {
    setBannerForm({
      id: '',
      title: '',
      subtitle: '',
      image_url: '',
      link_url: '',
      placement: 'home_banner',
      sort_order: '0',
      active: true,
      starts_at: '',
      ends_at: '',
    });
    setBannerOpen(true);
  };

  const campaigns = useQuery({
    queryKey: ['admin-campaigns'],
    queryFn: () => api.get<{ items: Campaign[] }>('/admin/campaigns'),
  });

  const banners = useQuery({
    queryKey: ['admin-banners'],
    queryFn: () => api.get<{ items: Banner[] }>('/admin/banners'),
  });

  const placements = useQuery({
    queryKey: ['admin-ad-placements'],
    queryFn: () => api.get<{ items: Placement[] }>('/admin/ad-placements'),
  });

  const invalidateAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-campaigns'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-banners'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-ad-placements'] }),
    ]);
  };

  const reviewMutation = useMutation({
    mutationFn: (input: { id: string; status: string; review_note: string }) =>
      api.patch(`/admin/campaigns/${input.id}`, {
        status: input.status,
        review_note: input.review_note,
      }),
    onSuccess: async () => {
      setReview(null);
      setMessage('Campaña actualizada.');
      await invalidateAll();
    },
    onError: (err) => setMessage((err as Error).message),
  });

  const bannerMutation = useMutation({
    mutationFn: (input: { id?: string; body: Record<string, unknown> }) =>
      input.id
        ? api.patch(`/admin/banners/${input.id}`, input.body)
        : api.post('/admin/banners', input.body),
    onSuccess: async () => {
      setBannerOpen(false);
      setMessage('Banner guardado.');
      await invalidateAll();
    },
    onError: (err) => setMessage((err as Error).message),
  });

  const toggleBanner = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      api.patch(`/admin/banners/${input.id}`, { active: input.active }),
    onSuccess: invalidateAll,
    onError: (err) => setMessage((err as Error).message),
  });

  const placementMutation = useMutation({
    mutationFn: (input: { id?: string; body: Record<string, unknown> }) =>
      input.id
        ? api.patch(`/admin/ad-placements/${input.id}`, input.body)
        : api.post('/admin/ad-placements', input.body),
    onSuccess: async () => {
      setPlacementOpen(false);
      setMessage('Espacio publicitario guardado.');
      await invalidateAll();
    },
    onError: (err) => setMessage((err as Error).message),
  });

  const deleteCampaign = useMutation({
    mutationFn: (id: string) => api.del(`/admin/campaigns/${id}`),
    onSuccess: async () => {
      setMessage('Campaña eliminada.');
      await invalidateAll();
    },
    onError: (err) => setMessage((err as Error).message),
  });

  const deleteBanner = useMutation({
    mutationFn: (id: string) => api.del(`/admin/banners/${id}`),
    onSuccess: async () => {
      setMessage('Banner eliminado.');
      await invalidateAll();
    },
    onError: (err) => setMessage((err as Error).message),
  });

  const deletePlacement = useMutation({
    mutationFn: (id: string) => api.del(`/admin/ad-placements/${id}`),
    onSuccess: async () => {
      setMessage('Espacio publicitario eliminado.');
      await invalidateAll();
    },
    onError: (err) => setMessage((err as Error).message),
  });

  if (campaigns.isLoading || banners.isLoading || placements.isLoading) return <Spinner />;
  if (campaigns.error) {
    return (
      <ErrorState message={(campaigns.error as Error).message} onRetry={() => void campaigns.refetch()} />
    );
  }

  const campaignItems = campaigns.data?.items ?? [];
  const bannerItems = banners.data?.items ?? [];
  const placementItems = placements.data?.items ?? [];

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Publicidad"
        subtitle="Campañas, banners y espacios disponibles"
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`btn ${tab === 'campanas' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('campanas')}
        >
          Campañas
        </button>
        <button
          type="button"
          className={`btn ${tab === 'banners' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('banners')}
        >
          Banners
        </button>
        <button
          type="button"
          className={`btn ${tab === 'espacios' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('espacios')}
        >
          Espacios
        </button>
      </div>

      {message ? (
        <div className="rounded-xl bg-ink-100 px-4 py-3 text-sm text-ink-700">{message}</div>
      ) : null}

      {tab === 'campanas' ? (
        campaignItems.length === 0 ? (
          <EmptyState
            title="No hay campañas"
            description="Las campañas que soliciten los comercios aparecen acá para su aprobación."
          />
        ) : (
          <DataTable
            headers={['Campaña', 'Comercio', 'Ubicación', 'Vigencia', 'Precio', 'Resultados', 'Estado', 'Acciones']}
            empty="Sin campañas."
          >
            {campaignItems.map((c) => (
              <tr key={c.id}>
                <td>
                  <p className="font-medium text-ink-900">{c.title}</p>
                  {c.body ? <p className="text-xs text-ink-500">{c.body}</p> : null}
                  {c.review_note ? (
                    <p className="text-xs text-red-600">Nota: {c.review_note}</p>
                  ) : null}
                </td>
                <td className="text-xs">{c.store_name}</td>
                <td className="text-xs">{PLACEMENT_LABELS[c.placement] ?? c.placement}</td>
                <td className="text-xs">
                  {formatDate(c.starts_at)} → {formatDate(c.ends_at)}
                </td>
                <td>{formatMoney(c.price)}</td>
                <td className="text-xs">
                  <p>{formatNumber(c.impressions)} impresiones</p>
                  <p className="text-ink-500">{formatNumber(c.clicks)} clics</p>
                </td>
                <td>
                  <span className={`badge ${CAMPAIGN_STATUS_STYLES[c.status] ?? 'bg-ink-100 text-ink-700'}`}>
                    {CAMPAIGN_STATUS_LABELS[c.status] ?? c.status}
                  </span>
                </td>
                <td>
                  <button
                    type="button"
                    className="text-sm font-medium text-brand-600 hover:underline"
                    onClick={() => {
                      setReview(c);
                      setReviewStatus(c.status);
                      setReviewNote(c.review_note ?? '');
                    }}
                  >
                    Revisar
                  </button>
                  <button
                    type="button"
                    className="ml-3 text-sm font-medium text-red-600 hover:underline"
                    disabled={deleteCampaign.isPending}
                    onClick={() => {
                      if (window.confirm(`¿Eliminar la campaña "${c.title}"?`)) {
                        deleteCampaign.mutate(c.id);
                      }
                    }}
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </DataTable>
        )
      ) : null}

      {tab === 'banners' ? (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button type="button" className="btn-primary" onClick={handleNewBanner}>
              + Nuevo banner
            </button>
          </div>
          {bannerItems.length === 0 ? (
            <EmptyState title="No hay banners" description="Crea el primer banner de la home." />
          ) : (
            <DataTable
              headers={['Banner', 'Ubicación', 'Orden', 'Vigencia', 'Campaña', 'Estado', 'Acciones']}
              empty="Sin banners."
            >
              {bannerItems.map((b) => (
                <tr key={b.id}>
                  <td>
                    <p className="font-medium text-ink-900">{b.title}</p>
                    {b.subtitle ? <p className="text-xs text-ink-500">{b.subtitle}</p> : null}
                  </td>
                  <td className="text-xs">{PLACEMENT_LABELS[b.placement] ?? b.placement}</td>
                  <td className="text-xs">{b.sort_order}</td>
                  <td className="text-xs">
                    {b.starts_at ? formatDate(b.starts_at) : 'siempre'}
                    {b.ends_at ? ` → ${formatDate(b.ends_at)}` : ''}
                  </td>
                  <td className="text-xs text-ink-500">{b.campaign_status ?? '—'}</td>
                  <td>
                    <span
                      className={`badge ${b.active ? 'bg-emerald-100 text-emerald-800' : 'bg-ink-200 text-ink-600'}`}
                    >
                      {b.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="text-sm font-medium text-brand-600 hover:underline"
                      disabled={bannerMutation.isPending}
                      onClick={() => handleEditBanner(b)}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="ml-3 text-sm font-medium text-brand-600 hover:underline"
                      disabled={toggleBanner.isPending}
                      onClick={() => toggleBanner.mutate({ id: b.id, active: !b.active })}
                    >
                      {b.active ? 'Desactivar' : 'Activar'}
                    </button>
                    <button
                      type="button"
                      className="ml-3 text-sm font-medium text-red-600 hover:underline"
                      disabled={deleteBanner.isPending}
                      onClick={() => {
                        if (window.confirm(`¿Eliminar el banner "${b.title}"?`)) {
                          deleteBanner.mutate(b.id);
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
        </div>
      ) : null}

      {tab === 'espacios' ? (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setPlacementForm({ key: '', name: '', description: '', price_per_day: '0', active: true });
                setPlacementOpen(true);
              }}
            >
              + Nuevo espacio
            </button>
          </div>
          {placementItems.length === 0 ? (
            <EmptyState
              title="No hay espacios publicitarios"
              description="Definí los espacios disponibles y su precio por día."
            />
          ) : (
            <DataTable headers={['Espacio', 'Clave', 'Precio por día', 'Estado', 'Acciones']} empty="Sin espacios.">
              {placementItems.map((p) => (
                <tr key={p.id}>
                  <td>
                    <p className="font-medium text-ink-900">{p.name}</p>
                    {p.description ? <p className="text-xs text-ink-500">{p.description}</p> : null}
                  </td>
                  <td className="font-mono text-xs">{p.key}</td>
                  <td>{formatMoney(p.price_per_day)}</td>
                  <td>
                    <span
                      className={`badge ${p.active ? 'bg-emerald-100 text-emerald-800' : 'bg-ink-200 text-ink-600'}`}
                    >
                      {p.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="text-sm font-medium text-red-600 hover:underline"
                      disabled={deletePlacement.isPending}
                      onClick={() => {
                        if (window.confirm(`¿Eliminar el espacio "${p.name}"?`)) {
                          deletePlacement.mutate(p.id);
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
          <p className="text-xs text-ink-500">
            Claves reservadas para las ubicaciones predefinidas:{' '}
            {AD_PLACEMENTS.map((p) => PLACEMENT_LABELS[p]).join(' · ')}
          </p>
        </div>
      ) : null}

      <Modal
        open={review !== null}
        title={`Revisar campaña ${review?.title ?? ''}`}
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
                review && reviewMutation.mutate({ id: review.id, status: reviewStatus, review_note: reviewNote })
              }
            >
              Aplicar
            </button>
          </>
        }
      >
        <p className="text-sm text-ink-600">
          Comercio: <strong>{review?.store_name}</strong>. Al activar una campaña de tipo banner en
          la home se crea automáticamente el banner correspondiente.
        </p>
        <Field label="Estado">
          <select
            className="input"
            value={reviewStatus}
            onChange={(e) => setReviewStatus(e.target.value)}
          >
            {CAMPAIGN_STATUSES.map((s) => (
              <option key={s} value={s}>
                {CAMPAIGN_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nota para el comercio" hint="Queda registrada en el historial de la campaña.">
          <textarea
            rows={3}
            className="input"
            value={reviewNote}
            onChange={(e) => setReviewNote(e.target.value)}
          />
        </Field>
      </Modal>

      <Modal
        open={bannerOpen}
        title={bannerForm.id ? 'Editar banner' : 'Nuevo banner'}
        onClose={() => { setBannerOpen(false); }}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setBannerOpen(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={bannerMutation.isPending}
              onClick={() =>
                bannerMutation.mutate({
                  id: bannerForm.id || undefined,
                  body: {
                    title: bannerForm.title,
                    subtitle: bannerForm.subtitle || null,
                    image_url: bannerForm.image_url || null,
                    link_url: bannerForm.link_url || null,
                    placement: bannerForm.placement,
                    sort_order: Number(bannerForm.sort_order || 0),
                    active: bannerForm.active,
                    starts_at: bannerForm.starts_at ? new Date(bannerForm.starts_at).toISOString() : null,
                    ends_at: bannerForm.ends_at ? new Date(bannerForm.ends_at).toISOString() : null,
                  },
                })
              }
            >
              Guardar
            </button>
          </>
        }
      >
        <Field label="Título">
          <input
            className="input"
            value={bannerForm.title}
            onChange={(e) => setBannerForm((f) => ({ ...f, title: e.target.value }))}
          />
        </Field>
        <Field label="Subtítulo">
          <input
            className="input"
            value={bannerForm.subtitle}
            onChange={(e) => setBannerForm((f) => ({ ...f, subtitle: e.target.value }))}
          />
        </Field>
        <FileUpload
          label="Imagen del banner"
          aspectRatioPreset="banner"
          recommendedWidth={1200}
          recommendedHeight={400}
          value={bannerForm.image_url}
          onChange={(url) => setBannerForm((f) => ({ ...f, image_url: url }))}
        />
        <Field label="Link">
          <input
            className="input"
            value={bannerForm.link_url}
            onChange={(e) => setBannerForm((f) => ({ ...f, link_url: e.target.value }))}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Ubicación">
            <select
              className="input"
              value={bannerForm.placement}
              onChange={(e) => setBannerForm((f) => ({ ...f, placement: e.target.value }))}
            >
              {AD_PLACEMENTS.map((p) => (
                <option key={p} value={p}>
                  {PLACEMENT_LABELS[p]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Orden">
            <input
              type="number"
              className="input"
              value={bannerForm.sort_order}
              onChange={(e) => setBannerForm((f) => ({ ...f, sort_order: e.target.value }))}
            />
          </Field>
          <Field label="Comienza">
            <input
              type="date"
              className="input"
              value={bannerForm.starts_at}
              onChange={(e) => setBannerForm((f) => ({ ...f, starts_at: e.target.value }))}
            />
          </Field>
          <Field label="Termina">
            <input
              type="date"
              className="input"
              value={bannerForm.ends_at}
              onChange={(e) => setBannerForm((f) => ({ ...f, ends_at: e.target.value }))}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={bannerForm.active}
            onChange={(e) => setBannerForm((f) => ({ ...f, active: e.target.checked }))}
          />
          Banner activo
        </label>
      </Modal>

      <Modal
        open={placementOpen}
        title="Nuevo espacio publicitario"
        onClose={() => setPlacementOpen(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setPlacementOpen(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={placementMutation.isPending}
              onClick={() =>
                placementMutation.mutate({
                  body: {
                    key: placementForm.key,
                    name: placementForm.name,
                    description: placementForm.description || null,
                    price_per_day: Number(placementForm.price_per_day || 0),
                    active: placementForm.active,
                  },
                })
              }
            >
              Guardar
            </button>
          </>
        }
      >
        <Field label="Clave" hint="Identificador técnico, por ejemplo home_banner.">
          <input
            className="input"
            value={placementForm.key}
            onChange={(e) => setPlacementForm((f) => ({ ...f, key: e.target.value }))}
          />
        </Field>
        <Field label="Nombre visible">
          <input
            className="input"
            value={placementForm.name}
            onChange={(e) => setPlacementForm((f) => ({ ...f, name: e.target.value }))}
          />
        </Field>
        <Field label="Descripción">
          <textarea
            rows={2}
            className="input"
            value={placementForm.description}
            onChange={(e) => setPlacementForm((f) => ({ ...f, description: e.target.value }))}
          />
        </Field>
        <Field label="Precio por día (ARS)">
          <input
            type="number"
            min={0}
            step="0.01"
            className="input"
            value={placementForm.price_per_day}
            onChange={(e) => setPlacementForm((f) => ({ ...f, price_per_day: e.target.value }))}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={placementForm.active}
            onChange={(e) => setPlacementForm((f) => ({ ...f, active: e.target.checked }))}
          />
          Espacio activo
        </label>
      </Modal>
    </div>
  );
}
