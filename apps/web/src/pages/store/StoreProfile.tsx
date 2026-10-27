import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { Field, Spinner } from '../../components/ui';
import { FileUpload } from '../../components/FileUpload';
import { TimeRangeSelect } from '../../components/TimeRangeSelect';
import type { CategoryDto } from '@acoyaradas/shared';

interface StoreProfileResponse {
  store: {
    id: string;
    name: string;
    description: string | null;
    logo_url: string | null;
    cover_url: string | null;
    phone: string | null;
    whatsapp: string | null;
    email: string | null;
    address: string | null;
    locality: string | null;
    category_id: string | null;
    is_open: boolean;
    preparation_time_minutes: number | null;
    allows_platform_delivery: boolean;
    allows_merchant_delivery: boolean;
    allows_pickup: boolean;
    merchant_delivery_fee: number;
    merchant_delivery_notes: string | null;
    accepts_cash: boolean;
    accepts_transfer: boolean;
    accepts_cash_on_delivery: boolean;
    open_hours: Record<string, string> | null;
    accepts_terms: boolean;
  };
  limits: { name: string; product_limit: number; promo_limit: number; ends_at: string | null };
  subscription: { plan_name: string; status: string; ends_at: string } | null;
}

const DAYS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

export default function StoreProfile() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['store-profile'],
    queryFn: () => api.get<StoreProfileResponse>('/store/profile'),
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<{ items: CategoryDto[] }>('/categories'),
  });

  const [form, setForm] = useState<Record<string, any>>({});
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!data?.store) return;
    const s = data.store;
    setForm({
      name: s.name ?? '',
      description: s.description ?? '',
      logo_url: s.logo_url ?? '',
      cover_url: s.cover_url ?? '',
      phone: s.phone ?? '',
      whatsapp: s.whatsapp ?? '',
      email: s.email ?? '',
      address: s.address ?? '',
      locality: s.locality ?? '',
      category_id: s.category_id ?? '',
      is_open: s.is_open,
      preparation_time_minutes: s.preparation_time_minutes ?? '',
      allows_platform_delivery: s.allows_platform_delivery,
      allows_pickup: false,
      merchant_delivery_fee: s.merchant_delivery_fee ?? 0,
      merchant_delivery_notes: s.merchant_delivery_notes ?? '',
      accepts_cash: s.accepts_cash,
      accepts_transfer: s.accepts_transfer,
      accepts_terms: s.accepts_terms,
      open_hours: { ...(s.open_hours ?? {}) },
    });
  }, [data]);

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, any> = { ...form };
      body.preparation_time_minutes =
        form.preparation_time_minutes === '' ? null : Number(form.preparation_time_minutes);
      body.merchant_delivery_fee = Number(form.merchant_delivery_fee ?? 0);
      if (body.category_id === '') body.category_id = null;
      return api.patch('/store/profile', body);
    },
    onSuccess: async () => {
      setMessage('Perfil guardado.');
      await refetch();
    },
    onError: (err) => setMessage((err as Error).message),
  });

  if (isLoading) return <Spinner />;
  if (error) {
    return (
      <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
        {(error as Error).message}
      </div>
    );
  }

  const set = (key: string, value: any) => setForm((f) => ({ ...f, [key]: value }));

  return (
    <div className="space-y-4">
      {message ? (
        <div className="rounded-xl bg-ink-100 px-4 py-3 text-sm text-ink-700">{message}</div>
      ) : null}

      <form
        className="card space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          setMessage(null);
          save.mutate();
        }}
      >
        <h2 className="text-lg font-bold text-ink-900">Datos públicos</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nombre">
            <input
              className="input"
              value={form.name ?? ''}
              onChange={(e) => set('name', e.target.value)}
            />
          </Field>
          <Field label="Categoría">
            <select
              className="input"
              value={form.category_id ?? ''}
              onChange={(e) => set('category_id', e.target.value)}
            >
              <option value="">Sin categoría</option>
              {(categories?.items ?? []).map((cat) => (
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
            value={form.description ?? ''}
            onChange={(e) => set('description', e.target.value)}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <FileUpload
            label="Logo del comercio"
            hint="Cuadrado, mínimo 256×256 px."
            value={form.logo_url ?? ''}
            onChange={(url) => set('logo_url', url)}
          />
          <FileUpload
            label="Foto de portada"
            hint="Horizontal, ideal 1200×400 px."
            value={form.cover_url ?? ''}
            onChange={(url) => set('cover_url', url)}
          />
          <Field label="Teléfono">
            <input
              className="input"
              value={form.phone ?? ''}
              onChange={(e) => set('phone', e.target.value)}
            />
          </Field>
          <Field label="WhatsApp">
            <input
              className="input"
              value={form.whatsapp ?? ''}
              onChange={(e) => set('whatsapp', e.target.value)}
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              className="input"
              value={form.email ?? ''}
              onChange={(e) => set('email', e.target.value)}
            />
          </Field>
          <Field label="Dirección">
            <input
              className="input"
              value={form.address ?? ''}
              onChange={(e) => set('address', e.target.value)}
            />
          </Field>
          <Field label="Localidad">
            <input
              className="input"
              value={form.locality ?? ''}
              onChange={(e) => set('locality', e.target.value)}
            />
          </Field>
          <Field label="Tiempo de preparación (min)">
            <input
              type="number"
              min={0}
              className="input"
              value={form.preparation_time_minutes ?? ''}
              onChange={(e) => set('preparation_time_minutes', e.target.value)}
            />
          </Field>
        </div>

        <h2 className="pt-2 text-lg font-bold text-ink-900">Entrega y pagos</h2>
        <div className="grid gap-2 sm:grid-cols-2">
          {[
            ['allows_platform_delivery', 'Entrega organizada por acoYAradas!'],
            ['accepts_cash', 'Acepta efectivo'],
            ['accepts_transfer', 'Acepta transferencia'],
            ['is_open', 'Comercio abierto'],
            ['accepts_terms', 'Aceptó las condiciones comerciales'],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={Boolean(form[key])}
                onChange={(e) => set(key, e.target.checked)}
              />
              {label}
            </label>
          ))}
        </div>

        <div className="hidden">
          <input type="hidden" value={form.merchant_delivery_fee ?? 0} />
          <input type="hidden" value={form.merchant_delivery_notes ?? ''} />
        </div>

        <h2 className="pt-2 text-lg font-bold text-ink-900">Horarios</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DAYS.map((day) => (
            <TimeRangeSelect
              key={day}
              dayLabel={day}
              value={form.open_hours?.[day] ?? ''}
              onChange={(v) =>
                set('open_hours', { ...(form.open_hours ?? {}), [day]: v })
              }
            />
          ))}
        </div>

        <button type="submit" className="btn-primary" disabled={save.isPending}>
          {save.isPending ? 'Guardando…' : 'Guardar perfil'}
        </button>
      </form>
    </div>
  );
}
