import { useState, useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { DataTable } from '../../components/PanelShell';
import { ErrorState, Field, Modal, SectionTitle, Spinner } from '../../components/ui';
import { FileUpload } from '../../components/FileUpload';
import { IconPicker } from '../../components/IconPicker';
import { TimeRangeSelect } from '../../components/TimeRangeSelect';

interface PlatformProduct {
  id: string;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  category_id: string | null;
  category_name: string | null;
  image_url: string | null;
  is_available: boolean;
  featured: boolean;
  status: string;
}

interface PlatformStore {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  locality: string | null;
  zone_id: string | null;
  category_id: string | null;
  preparation_time_minutes: number | null;
  allows_platform_delivery: boolean;
  allows_merchant_delivery: boolean;
  allows_pickup: boolean;
  merchant_delivery_fee: number;
  merchant_delivery_notes: string | null;
  accepts_cash: boolean;
  accepts_transfer: boolean;
  accepts_cash_on_delivery: boolean;
  open_hours: Record<string, any>;
  status: string;
  is_open: boolean;
  featured: boolean;
  verified: boolean;
  logo_url: string | null;
  cover_url: string | null;
  whatsapp: string | null;
}

const EMPTY_FORM = {
  name: '',
  description: '',
  price: '',
  stock: '0',
  category_id: '',
  image_url: '',
  is_available: true,
  featured: false,
};

const DAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

function createEmptyStoreForm(): Partial<PlatformStore> {
  return {
    name: '',
    description: '',
    phone: '',
    email: '',
    address: '',
    locality: '',
    whatsapp: '',
    category_id: '',
    preparation_time_minutes: 0,
    allows_platform_delivery: true,
    allows_merchant_delivery: false,
    allows_pickup: false,
    merchant_delivery_fee: 0,
    merchant_delivery_notes: '',
    accepts_cash: true,
    accepts_transfer: true,
    accepts_cash_on_delivery: false,
    zone_id: '',
    open_hours: {},
  };
}

export default function AdminPlatformProducts() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<PlatformProduct | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [message, setMessage] = useState<string | null>(null);

  // Local state for store configuration (to avoid focus loss on mutate)
  const [storeForm, setStoreForm] = useState<Partial<PlatformStore>>(createEmptyStoreForm());
  const [storeFormDirty, setStoreFormDirty] = useState(false);
  const saveStoreTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-platform-products'],
    queryFn: () => api.get<{ items: PlatformProduct[] }>('/admin/platform-products'),
  });

  const { data: platformStore, refetch: refetchStore } = useQuery({
    queryKey: ['admin-platform-store'],
    queryFn: () => api.get<PlatformStore | null>('/admin/platform-store'),
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<{ items: { id: string; name: string }[] }>('/categories'),
  });

  const { data: zones } = useQuery({
    queryKey: ['admin-zones'],
    queryFn: () => api.get<{ items: { id: string; name: string; code: string }[] }>('/admin/zones'),
  });

  // Initialize storeForm from platformStore data
  useEffect(() => {
    if (platformStore) {
      setStoreForm({
        name: platformStore.name ?? '',
        description: platformStore.description ?? '',
        phone: platformStore.phone ?? '',
        email: platformStore.email ?? '',
        address: platformStore.address ?? '',
        locality: platformStore.locality ?? '',
        whatsapp: platformStore.whatsapp ?? '',
        category_id: platformStore.category_id ?? '',
        preparation_time_minutes: platformStore.preparation_time_minutes ?? 0,
        allows_platform_delivery: platformStore.allows_platform_delivery,
        allows_merchant_delivery: platformStore.allows_merchant_delivery,
        allows_pickup: platformStore.allows_pickup,
        merchant_delivery_fee: platformStore.merchant_delivery_fee ?? 0,
        merchant_delivery_notes: platformStore.merchant_delivery_notes ?? '',
        accepts_cash: platformStore.accepts_cash,
        accepts_transfer: platformStore.accepts_transfer,
        accepts_cash_on_delivery: platformStore.accepts_cash_on_delivery,
        zone_id: platformStore.zone_id ?? '',
        open_hours: platformStore.open_hours ?? {},
      });
      setStoreFormDirty(false);
    }
  }, [platformStore]);

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-platform-products'] });
    await queryClient.invalidateQueries({ queryKey: ['home'] });
  };

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        name: form.name,
        description: form.description,
        price: Number(form.price),
        stock: Number(form.stock),
        category_id: form.category_id || null,
        image_url: form.image_url,
        is_available: form.is_available,
        featured: form.featured,
      };
      if (editing) return api.patch(`/admin/platform-products/${editing.id}`, body);
      return api.post('/admin/platform-products', body);
    },
    onSuccess: async () => {
      setCreating(false);
      setEditing(null);
      setForm({ ...EMPTY_FORM });
      setMessage('Producto guardado.');
      await invalidate();
    },
    onError: (err) => setMessage((err as Error).message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/admin/platform-products/${id}`),
    onSuccess: async () => {
      setMessage('Producto dado de baja.');
      await invalidate();
    },
    onError: (err) => setMessage((err as Error).message),
  });

  const updateStore = useMutation({
    mutationFn: (body: Partial<PlatformStore>) => api.patch('/admin/platform-store', body),
    onSuccess: async () => {
      setMessage('Tienda de plataforma actualizada.');
      await refetchStore();
    },
    onError: (err) => setMessage((err as Error).message),
  });

  // Debounced auto-save for store form
  const saveStoreForm = () => {
    if (!storeFormDirty) return;
    if (saveStoreTimeoutRef.current) clearTimeout(saveStoreTimeoutRef.current);
    saveStoreTimeoutRef.current = setTimeout(() => {
      updateStore.mutate(storeForm);
      setStoreFormDirty(false);
    }, 500);
  };

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveStoreTimeoutRef.current) clearTimeout(saveStoreTimeoutRef.current);
    };
  }, []);

  const handleStoreChange = (key: keyof PlatformStore, value: any) => {
    setStoreForm(prev => ({ ...prev, [key]: value }));
    setStoreFormDirty(true);
    saveStoreForm();
  };

  const handleStoreBlur = () => {
    if (saveStoreTimeoutRef.current) clearTimeout(saveStoreTimeoutRef.current);
    if (storeFormDirty) {
      updateStore.mutate(storeForm);
      setStoreFormDirty(false);
    }
  };

  if (isLoading) return <Spinner />;
  if (error) {
    return <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />;
  }

  const products = data?.items ?? [];

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Productos no afiliados"
        subtitle="Gestionados solo por administración. Aparecen en la tienda principal."
        action={
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setEditing(null);
              setForm({ ...EMPTY_FORM });
              setCreating(true);
            }}
          >
            + Nuevo producto
          </button>
        }
      />

      {message ? (
        <div className="rounded-xl bg-ink-100 px-4 py-3 text-sm text-ink-700">{message}</div>
      ) : null}

      {/* Configuración de la tienda acoYAradas (plataforma) - Diseño igual al panel de comercio */}
      <SectionTitle title="Configuración de acoYAradas!" subtitle="Tienda oficial para productos no afiliados y envíos de plataforma" />
      <form
        className="card space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          setMessage(null);
          handleStoreBlur();
        }}
      >
        {platformStore ? (
          <>
            <h2 className="text-lg font-bold text-ink-900">Datos públicos</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Nombre">
                <input
                  className="input"
                  value={storeForm.name ?? ''}
                  onChange={(e) => handleStoreChange('name', e.target.value)}
                  onBlur={handleStoreBlur}
                  disabled={updateStore.isPending}
                />
              </Field>
              <Field label="Categoría">
                <select
                  className="input"
                  value={storeForm.category_id ?? ''}
                  onChange={(e) => handleStoreChange('category_id', e.target.value || null)}
                  onBlur={handleStoreBlur}
                  disabled={updateStore.isPending}
                >
                  <option value="">Sin categoría</option>
                  {(categories?.items ?? []).map((cat: any) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Descripción">
              <textarea
                rows={3}
                className="input"
                value={storeForm.description ?? ''}
                onChange={(e) => handleStoreChange('description', e.target.value)}
                onBlur={handleStoreBlur}
                disabled={updateStore.isPending}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <FileUpload
                label="Logo del comercio"
                aspectRatioPreset="square"
                recommendedWidth={256}
                recommendedHeight={256}
                value={storeForm.logo_url ?? ''}
                onChange={(url) => handleStoreChange('logo_url', url)}
              />
              <FileUpload
                label="Foto de portada"
                aspectRatioPreset="banner"
                recommendedWidth={1200}
                recommendedHeight={400}
                value={storeForm.cover_url ?? ''}
                onChange={(url) => handleStoreChange('cover_url', url)}
              />
              <Field label="Teléfono">
                <input
                  className="input"
                  value={storeForm.phone ?? ''}
                  onChange={(e) => handleStoreChange('phone', e.target.value)}
                  onBlur={handleStoreBlur}
                  disabled={updateStore.isPending}
                />
              </Field>
              <Field label="WhatsApp">
                <input
                  className="input"
                  value={storeForm.whatsapp ?? ''}
                  onChange={(e) => handleStoreChange('whatsapp', e.target.value)}
                  onBlur={handleStoreBlur}
                  disabled={updateStore.isPending}
                />
              </Field>
              <Field label="Email">
                <input
                  type="email"
                  className="input"
                  value={storeForm.email ?? ''}
                  onChange={(e) => handleStoreChange('email', e.target.value)}
                  onBlur={handleStoreBlur}
                  disabled={updateStore.isPending}
                />
              </Field>
              <Field label="Dirección">
                <input
                  className="input"
                  value={storeForm.address ?? ''}
                  onChange={(e) => handleStoreChange('address', e.target.value)}
                  onBlur={handleStoreBlur}
                  disabled={updateStore.isPending}
                />
              </Field>
              <Field label="Localidad">
                <input
                  className="input"
                  value={storeForm.locality ?? ''}
                  onChange={(e) => handleStoreChange('locality', e.target.value)}
                  onBlur={handleStoreBlur}
                  disabled={updateStore.isPending}
                />
              </Field>
              <Field label="Tiempo de preparación (min)">
                <input
                  type="number"
                  min={0}
                  className="input"
                  value={storeForm.preparation_time_minutes ?? ''}
                  onChange={(e) => handleStoreChange('preparation_time_minutes', Number(e.target.value) || 0)}
                  onBlur={handleStoreBlur}
                  disabled={updateStore.isPending}
                />
              </Field>
            </div>

            <h2 className="pt-2 text-lg font-bold text-ink-900">Entrega y pagos</h2>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                ['allows_platform_delivery', 'Entrega organizada por acoYAradas!', true] as const,
                ['allows_merchant_delivery', 'Entrega propia del comercio', false] as const,
                ['allows_pickup', 'Retiro en local', false] as const,
                ['accepts_cash', 'Acepta efectivo', false] as const,
                ['accepts_transfer', 'Acepta transferencia', false] as const,
                ['accepts_cash_on_delivery', 'Acepta contraentrega', false] as const,
              ].map(([key, label, isFixed]) => (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className={isFixed
                      ? 'h-4 w-4 rounded border-emerald-500 bg-emerald-500 text-white focus:ring-emerald-500 cursor-not-allowed'
                      : 'h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500'}
                    checked={Boolean(storeForm[key])}
                    onChange={isFixed ? undefined : (e) => handleStoreChange(key, e.target.checked)}
                    onBlur={handleStoreBlur}
                    disabled={isFixed || updateStore.isPending}
                  />
                  {label}
                </label>
              ))}
            </div>

            <p className="text-xs text-ink-500">
              <span className="font-medium">Estado abierto/cerrado:</span> Se calcula automáticamente según los horarios configurados abajo.
            </p>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Costo de envío base (ARS)">
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="input"
                  value={storeForm.merchant_delivery_fee ?? ''}
                  onChange={(e) => handleStoreChange('merchant_delivery_fee', Number(e.target.value) || 0)}
                  onBlur={handleStoreBlur}
                  disabled={updateStore.isPending}
                />
              </Field>
              <Field label="Notas de envío">
                <input
                  className="input"
                  value={storeForm.merchant_delivery_notes ?? ''}
                  onChange={(e) => handleStoreChange('merchant_delivery_notes', e.target.value)}
                  onBlur={handleStoreBlur}
                  disabled={updateStore.isPending}
                />
              </Field>
              <Field label="Zona de cobertura">
                <select
                  className="input"
                  value={storeForm.zone_id ?? ''}
                  onChange={(e) => handleStoreChange('zone_id', e.target.value || null)}
                  onBlur={handleStoreBlur}
                  disabled={updateStore.isPending}
                >
                  <option value="">Sin zona asignada</option>
                  {(zones?.items ?? []).map((zone: any) => (
                    <option key={zone.id} value={zone.id}>
                      {zone.name} ({zone.code})
                    </option>
                  ))}
                </select>
              </Field>
            </div>

            <h2 className="pt-2 text-lg font-bold text-ink-900">Horarios</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {DAYS.map((day) => (
                <TimeRangeSelect
                  key={day}
                  dayLabel={day}
                  value={storeForm.open_hours?.[day] ?? ''}
                  onChange={(v) => handleStoreChange('open_hours', { ...(storeForm.open_hours ?? {}), [day]: v })}
                />
              ))}
            </div>

            <div className="flex items-center gap-4 pt-4 border-t border-ink-100">
              <span className={`badge ${platformStore.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-ink-200 text-ink-600'}`}>
                Estado: {platformStore.status}
              </span>
              <span className={`badge ${platformStore.is_open ? 'bg-blue-100 text-blue-800' : 'bg-ink-200 text-ink-600'}`}>
                {platformStore.is_open ? 'Abierto' : 'Cerrado'}
              </span>
            </div>
          </>
        ) : (
          <div className="text-center py-8 text-ink-500">
            <p>Tienda de plataforma no encontrada. Se creará automáticamente al recibir el primer pedido de producto no afiliado.</p>
            <p className="text-xs mt-1">O créala manualmente desde la base de datos con slug 'acoyaradas'.</p>
          </div>
        )}
      </form>

      <DataTable
        headers={['Producto', 'Precio', 'Stock', 'Categoría', 'Estado', 'Acciones']}
        empty="Todavía no publicaste productos no afiliados."
      >
        {products.map((product) => (
          <tr key={product.id}>
            <td>
              <div className="flex items-center gap-2">
                {product.image_url ? (
                  <img src={product.image_url} alt="" className="h-9 w-9 rounded-lg object-cover" />
                ) : null}
                <div>
                  <p className="font-medium text-ink-900">{product.name}</p>
                  {product.featured ? (
                    <span className="badge bg-brand-100 text-brand-700">Destacado</span>
                  ) : null}
                </div>
              </div>
            </td>
            <td>{formatMoney(product.price)}</td>
            <td>{product.stock}</td>
            <td>{product.category_name ?? '-'}</td>
            <td>
              <span className={`badge ${product.is_available ? 'bg-emerald-100 text-emerald-800' : 'bg-ink-200 text-ink-600'}`}>
                {product.is_available ? 'Disponible' : 'No disponible'}
              </span>
            </td>
            <td>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="text-sm font-medium text-brand-600 hover:underline"
                  onClick={() => {
                    setEditing(product);
                    setCreating(true);
                    setForm({
                      name: product.name,
                      description: product.description ?? '',
                      price: String(product.price),
                      stock: String(product.stock),
                      category_id: product.category_id ?? '',
                      image_url: product.image_url ?? '',
                      is_available: product.is_available,
                      featured: product.featured,
                    });
                  }}
                >
                  Editar
                </button>
                <button
                  type="button"
                  className="text-sm font-medium text-red-600 hover:underline"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(product.id)}
                >
                  Dar de baja
                </button>
              </div>
            </td>
          </tr>
        ))}
      </DataTable>

      <Modal
        open={creating}
        title={editing ? 'Editar producto no afiliado' : 'Nuevo producto no afiliado'}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        footer={
          <>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setCreating(false);
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
              {save.isPending ? 'Guardando...' : 'Guardar producto'}
            </button>
          </>
        }
      >
        <div className="rounded-2xl border border-ink-100 bg-ink-50/40 p-4 sm:p-5">
          <p className="mb-3 text-sm font-semibold text-ink-900">Información básica</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Field label="Nombre">
                <input
                  className="input"
                  placeholder="Ej. Combo promocional"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <Field label="Descripción">
                <textarea
                  rows={4}
                  className="input min-h-[96px]"
                  placeholder="Descripción del producto..."
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </Field>
            </div>
            <Field label="Precio (ARS)">
              <input
                type="number"
                min={0}
                step="0.01"
                className="input"
                placeholder="0.00"
                value={form.price}
                onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
              />
            </Field>
            <Field label="Stock">
              <input
                type="number"
                min={0}
                className="input"
                placeholder="0"
                value={form.stock}
                onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="Categoría">
                <select
                  className="input"
                  value={form.category_id}
                  onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
                >
                  <option value="">Sin categoría</option>
                  {(categories?.items ?? []).map((cat: any) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-ink-100 bg-white p-4 sm:p-5">
          <p className="mb-3 text-sm font-semibold text-ink-900">Imagen o ícono</p>
          <div className="space-y-4">
            <div className="rounded-2xl border border-ink-200/80 bg-ink-50/30 p-4">
              <IconPicker
                value={form.image_url}
                onChange={(url) => setForm((f) => ({ ...f, image_url: url }))}
              />
            </div>
            <FileUpload
              label="Foto personalizada (opcional)"
              aspectRatioPreset="square"
              recommendedWidth={512}
              recommendedHeight={512}
              value={form.image_url}
              onChange={(url) => setForm((f) => ({ ...f, image_url: url }))}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-ink-100 bg-ink-50/40 px-4 py-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
              checked={form.is_available}
              onChange={(e) => setForm((f) => ({ ...f, is_available: e.target.checked }))}
            />
            Disponible para la venta
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
              checked={form.featured}
              onChange={(e) => setForm((f) => ({ ...f, featured: e.target.checked }))}
            />
            Destacado
          </label>
        </div>
      </Modal>
    </div>
  );
}