import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { DataTable } from '../../components/PanelShell';
import { EmptyState, ErrorState, Field, Modal, SectionTitle, Spinner } from '../../components/ui';

interface Zone {
  id: string;
  name: string;
  code: string;
  description: string | null;
  active: boolean;
  stores_count: number;
}

interface Tariff {
  id: string;
  name: string;
  zone_id: string | null;
  zone_name: string | null;
  store_id: string | null;
  store_name: string | null;
  mode: 'fixed' | 'distance' | 'zone';
  base_price: number;
  price_per_km: number;
  min_price: number | null;
  max_price: number | null;
  active: boolean;
}

const MODE_LABELS: Record<string, string> = {
  fixed: 'Tarifa fija',
  distance: 'Por distancia',
  zone: 'Por zona',
};

const EMPTY_TARIFF = {
  name: '',
  zone_id: '',
  store_id: '',
  mode: 'fixed' as 'fixed' | 'distance' | 'zone',
  base_price: '0',
  price_per_km: '0',
  min_price: '',
  max_price: '',
  active: true,
};

export default function AdminLogistics() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'tarifas' | 'zonas'>('tarifas');
  const [message, setMessage] = useState<string | null>(null);
  const [tariffOpen, setTariffOpen] = useState(false);
  const [editing, setEditing] = useState<Tariff | null>(null);
  const [tariffForm, setTariffForm] = useState({ ...EMPTY_TARIFF });
  const [zoneOpen, setZoneOpen] = useState(false);
  const [editingZone, setEditingZone] = useState<Zone | null>(null);
  const [zoneForm, setZoneForm] = useState({ name: '', code: '', description: '', active: true });

  const zones = useQuery({
    queryKey: ['admin-zones'],
    queryFn: () => api.get<{ items: Zone[] }>('/admin/zones'),
  });

  const tariffs = useQuery({
    queryKey: ['admin-tariffs'],
    queryFn: () => api.get<{ items: Tariff[] }>('/admin/tariffs'),
  });

  const stores = useQuery({
    queryKey: ['admin-stores', 'filter'],
    queryFn: () => api.get<{ items: { id: string; name: string }[] }>('/admin/stores?status=all'),
  });

  const invalidateAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-tariffs'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-zones'] }),
    ]);
  };

  const tariffMutation = useMutation({
    mutationFn: (input: { id?: string; body: Record<string, unknown> }) =>
      input.id
        ? api.patch(`/admin/tariffs/${input.id}`, input.body)
        : api.post('/admin/tariffs', input.body),
    onSuccess: async () => {
      setTariffOpen(false);
      setEditing(null);
      setMessage('Tarifa guardada.');
      await invalidateAll();
    },
    onError: (err) => setMessage((err as Error).message),
  });

  const zoneMutation = useMutation({
    mutationFn: (input: { id?: string; body: Record<string, unknown> }) =>
      input.id ? api.patch(`/admin/zones/${input.id}`, input.body) : api.post('/admin/zones', input.body),
    onSuccess: async () => {
      setZoneOpen(false);
      setEditingZone(null);
      setMessage('Zona guardada.');
      await invalidateAll();
    },
    onError: (err) => setMessage((err as Error).message),
  });

  const deleteTariff = useMutation({
    mutationFn: (id: string) => api.del(`/admin/tariffs/${id}`),
    onSuccess: async () => {
      setMessage('Tarifa eliminada.');
      await invalidateAll();
    },
    onError: (err) => setMessage((err as Error).message),
  });

  const deleteZone = useMutation({
    mutationFn: (id: string) => api.del(`/admin/zones/${id}`),
    onSuccess: async () => {
      setMessage('Zona eliminada.');
      await invalidateAll();
    },
    onError: (err) => setMessage((err as Error).message),
  });

  if (zones.isLoading || tariffs.isLoading) return <Spinner />;
  if (zones.error) {
    return <ErrorState message={(zones.error as Error).message} onRetry={() => void zones.refetch()} />;
  }

  const zoneItems = zones.data?.items ?? [];
  const tariffItems = tariffs.data?.items ?? [];

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Logística y cobertura"
        subtitle="Zonas de cobertura y tarifas de envío"
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`btn ${tab === 'tarifas' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('tarifas')}
        >
          Tarifas
        </button>
        <button
          type="button"
          className={`btn ${tab === 'zonas' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('zonas')}
        >
          Zonas de cobertura
        </button>
      </div>

      {message ? (
        <div className="rounded-xl bg-ink-100 px-4 py-3 text-sm text-ink-700">{message}</div>
      ) : null}

      {tab === 'tarifas' ? (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setEditing(null);
                setTariffForm({ ...EMPTY_TARIFF });
                setTariffOpen(true);
              }}
            >
              + Nueva tarifa
            </button>
          </div>
          {tariffItems.length === 0 ? (
            <EmptyState
              title="No hay tarifas configuradas"
              description="Sin tarifas el costo de envío se calcula como 0."
            />
          ) : (
            <DataTable
              headers={['Tarifa', 'Modo', 'Zona', 'Comercio', 'Base', 'Por km', 'Mín / Máx', 'Estado']}
              empty="Sin tarifas."
            >
              {tariffItems.map((t) => (
                <tr key={t.id}>
                  <td className="font-medium text-ink-900">{t.name}</td>
                  <td className="text-xs">{MODE_LABELS[t.mode] ?? t.mode}</td>
                  <td className="text-xs">{t.zone_name ?? 'Todas'}</td>
                  <td className="text-xs">{t.store_name ?? 'Todos'}</td>
                  <td className="text-xs">{formatMoney(t.base_price)}</td>
                  <td className="text-xs">{formatMoney(t.price_per_km)}</td>
                  <td className="text-xs">
                    {t.min_price != null ? formatMoney(t.min_price) : '—'}
                    {' / '}
                    {t.max_price != null ? formatMoney(t.max_price) : '—'}
                  </td>
                  <td>
                    <span
                      className={`badge ${t.active ? 'bg-emerald-100 text-emerald-800' : 'bg-ink-200 text-ink-600'}`}
                    >
                      {t.active ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="text-sm font-medium text-brand-600 hover:underline"
                      onClick={() => {
                        setEditing(t);
                        setTariffForm({
                          name: t.name,
                          zone_id: t.zone_id ?? '',
                          store_id: t.store_id ?? '',
                          mode: t.mode,
                          base_price: String(t.base_price ?? 0),
                          price_per_km: String(t.price_per_km ?? 0),
                          min_price: t.min_price != null ? String(t.min_price) : '',
                          max_price: t.max_price != null ? String(t.max_price) : '',
                          active: t.active,
                        });
                        setTariffOpen(true);
                      }}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="ml-3 text-sm font-medium text-red-600 hover:underline"
                      disabled={deleteTariff.isPending}
                      onClick={() => {
                        if (window.confirm(`¿Eliminar la tarifa "${t.name}"?`)) {
                          deleteTariff.mutate(t.id);
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

      {tab === 'zonas' ? (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setEditingZone(null);
                setZoneForm({ name: '', code: '', description: '', active: true });
                setZoneOpen(true);
              }}
            >
              + Nueva zona
            </button>
          </div>
          {zoneItems.length === 0 ? (
            <EmptyState title="No hay zonas" description="Definí las zonas de cobertura." />
          ) : (
            <DataTable headers={['Zona', 'Código', 'Descripción', 'Comercios', 'Estado', 'Acciones']} empty="Sin zonas.">
              {zoneItems.map((z) => (
                <tr key={z.id}>
                  <td className="font-medium text-ink-900">{z.name}</td>
                  <td className="font-mono text-xs">{z.code}</td>
                  <td className="text-xs">{z.description ?? '—'}</td>
                  <td className="text-xs">{z.stores_count}</td>
                  <td>
                    <span
                      className={`badge ${z.active ? 'bg-emerald-100 text-emerald-800' : 'bg-ink-200 text-ink-600'}`}
                    >
                      {z.active ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="text-sm font-medium text-brand-600 hover:underline"
                      onClick={() => {
                        setEditingZone(z);
                        setZoneForm({
                          name: z.name,
                          code: z.code,
                          description: z.description ?? '',
                          active: z.active,
                        });
                        setZoneOpen(true);
                      }}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="ml-3 text-sm font-medium text-red-600 hover:underline"
                      disabled={deleteZone.isPending}
                      onClick={() => {
                        if (window.confirm(`¿Eliminar la zona "${z.name}"?`)) {
                          deleteZone.mutate(z.id);
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

      <Modal
        open={tariffOpen}
        title={editing ? `Editar ${editing.name}` : 'Nueva tarifa de envío'}
        onClose={() => {
          setTariffOpen(false);
          setEditing(null);
        }}
        footer={
          <>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setTariffOpen(false);
                setEditing(null);
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={tariffMutation.isPending}
              onClick={() =>
                tariffMutation.mutate({
                  id: editing?.id,
                  body: {
                    name: tariffForm.name,
                    zone_id: tariffForm.zone_id || null,
                    store_id: tariffForm.store_id || null,
                    mode: tariffForm.mode,
                    base_price: Number(tariffForm.base_price || 0),
                    price_per_km: Number(tariffForm.price_per_km || 0),
                    min_price: tariffForm.min_price === '' ? null : Number(tariffForm.min_price),
                    max_price: tariffForm.max_price === '' ? null : Number(tariffForm.max_price),
                    active: tariffForm.active,
                  },
                })
              }
            >
              Guardar
            </button>
          </>
        }
      >
        <Field label="Nombre">
          <input
            className="input"
            value={tariffForm.name}
            onChange={(e) => setTariffForm((f) => ({ ...f, name: e.target.value }))}
          />
        </Field>
        <Field label="Modo de cálculo">
          <select
            className="input"
            value={tariffForm.mode}
            onChange={(e) => setTariffForm((f) => ({ ...f, mode: e.target.value as 'fixed' | 'distance' | 'zone' }))}
          >
            <option value="fixed">Tarifa fija</option>
            <option value="distance">Por distancia</option>
            <option value="zone">Por zona</option>
          </select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Zona" hint="Opcional">
            <select
              className="input"
              value={tariffForm.zone_id}
              onChange={(e) => setTariffForm((f) => ({ ...f, zone_id: e.target.value }))}
            >
              <option value="">Todas las zonas</option>
              {zoneItems.map((z) => (
                <option key={z.id} value={z.id}>
                  {z.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Comercio" hint="Opcional: tarifa específica">
            <select
              className="input"
              value={tariffForm.store_id}
              onChange={(e) => setTariffForm((f) => ({ ...f, store_id: e.target.value }))}
            >
              <option value="">Todos los comercios</option>
              {(stores.data?.items ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Precio base (ARS)">
            <input
              type="number"
              min={0}
              step="0.01"
              className="input"
              value={tariffForm.base_price}
              onChange={(e) => setTariffForm((f) => ({ ...f, base_price: e.target.value }))}
            />
          </Field>
          <Field label="Precio por km (ARS)">
            <input
              type="number"
              min={0}
              step="0.01"
              className="input"
              value={tariffForm.price_per_km}
              onChange={(e) => setTariffForm((f) => ({ ...f, price_per_km: e.target.value }))}
            />
          </Field>
          <Field label="Precio mínimo (ARS)" hint="Opcional">
            <input
              type="number"
              min={0}
              step="0.01"
              className="input"
              value={tariffForm.min_price}
              onChange={(e) => setTariffForm((f) => ({ ...f, min_price: e.target.value }))}
            />
          </Field>
          <Field label="Precio máximo (ARS)" hint="Opcional">
            <input
              type="number"
              min={0}
              step="0.01"
              className="input"
              value={tariffForm.max_price}
              onChange={(e) => setTariffForm((f) => ({ ...f, max_price: e.target.value }))}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={tariffForm.active}
            onChange={(e) => setTariffForm((f) => ({ ...f, active: e.target.checked }))}
          />
          Tarifa activa
        </label>
      </Modal>

      <Modal
        open={zoneOpen}
        title={editingZone ? `Editar ${editingZone.name}` : 'Nueva zona de cobertura'}
        onClose={() => {
          setZoneOpen(false);
          setEditingZone(null);
        }}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setZoneOpen(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={zoneMutation.isPending}
              onClick={() =>
                zoneMutation.mutate({
                  id: editingZone?.id,
                  body: {
                    name: zoneForm.name,
                    code: zoneForm.code || zoneForm.name.toLowerCase().replace(/\s+/g, '-'),
                    description: zoneForm.description || null,
                    active: zoneForm.active,
                  },
                })
              }
            >
              Guardar
            </button>
          </>
        }
      >
        <Field label="Nombre">
          <input
            className="input"
            value={zoneForm.name}
            onChange={(e) => setZoneForm((f) => ({ ...f, name: e.target.value }))}
          />
        </Field>
        <Field label="Código" hint="Se genera automáticamente si lo dejás vacío.">
          <input
            className="input"
            value={zoneForm.code}
            onChange={(e) => setZoneForm((f) => ({ ...f, code: e.target.value }))}
          />
        </Field>
        <Field label="Descripción">
          <textarea
            rows={2}
            className="input"
            value={zoneForm.description}
            onChange={(e) => setZoneForm((f) => ({ ...f, description: e.target.value }))}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={zoneForm.active}
            onChange={(e) => setZoneForm((f) => ({ ...f, active: e.target.checked }))}
          />
          Zona activa
        </label>
      </Modal>
    </div>
  );
}
