import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatDate, formatMoney } from '../../lib/format';
import { DataTable } from '../../components/PanelShell';
import { ErrorState, Field, Modal, Spinner } from '../../components/ui';

interface Promotion {
  id: string;
  title: string;
  description: string | null;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  code: string | null;
  starts_at: string | null;
  ends_at: string | null;
  min_subtotal: number;
  active: boolean;
}

const EMPTY = {
  title: '',
  description: '',
  discount_type: 'percent' as 'percent' | 'fixed',
  discount_value: '10',
  code: '',
  starts_at: '',
  ends_at: '',
  min_subtotal: '0',
  active: true,
};

export default function StorePromotions() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [message, setMessage] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['store-promotions'],
    queryFn: () => api.get<{ items: Promotion[] }>('/store/promotions'),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['store-promotions'] });
  };

  const save = useMutation({
    mutationFn: () => {
      const body = {
        title: form.title,
        description: form.description,
        discount_type: form.discount_type,
        discount_value: Number(form.discount_value),
        code: form.code || undefined,
        starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : undefined,
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : undefined,
        min_subtotal: Number(form.min_subtotal || 0),
        active: form.active,
      };
      if (editing) return api.patch(`/store/promotions/${editing.id}`, body);
      return api.post('/store/promotions', body);
    },
    onSuccess: async () => {
      setOpen(false);
      setEditing(null);
      setForm({ ...EMPTY });
      setMessage('Promoción guardada.');
      await invalidate();
    },
    onError: (err) => setMessage((err as Error).message),
  });

  const deactivate = useMutation({
    mutationFn: (id: string) => api.del(`/store/promotions/${id}`),
    onSuccess: async () => {
      setMessage('Promoción desactivada.');
      await invalidate();
    },
    onError: (err) => setMessage((err as Error).message),
  });

  if (isLoading) return <Spinner />;
  if (error) {
    return <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />;
  }

  const promotions = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-500">
          {promotions.filter((p) => p.active).length} promoción(es) activas.
        </p>
        <button
          type="button"
          className="btn-primary"
          onClick={() => {
            setEditing(null);
            setForm({ ...EMPTY });
            setOpen(true);
          }}
        >
          + Nueva promoción
        </button>
      </div>

      {message ? (
        <div className="rounded-xl bg-ink-100 px-4 py-3 text-sm text-ink-700">{message}</div>
      ) : null}

      <DataTable
        headers={['Promoción', 'Descuento', 'Vigencia', 'Mínimo', 'Estado', 'Acciones']}
        empty="Todavía no creaste promociones."
      >
        {promotions.map((promo) => (
          <tr key={promo.id}>
            <td>
              <p className="font-medium text-ink-900">{promo.title}</p>
              {promo.code ? (
                <span className="badge bg-ink-100 text-ink-600">Código: {promo.code}</span>
              ) : null}
            </td>
            <td>
              {promo.discount_type === 'percent'
                ? `${promo.discount_value}%`
                : formatMoney(promo.discount_value)}
            </td>
            <td className="text-xs">
              {promo.starts_at ? formatDate(promo.starts_at) : ' siempre'}
              <br />
              {promo.ends_at ? `hasta ${formatDate(promo.ends_at)}` : ' sin fin'}
            </td>
            <td>{formatMoney(promo.min_subtotal)}</td>
            <td>
              <span
                className={`badge ${promo.active ? 'bg-emerald-100 text-emerald-800' : 'bg-ink-200 text-ink-600'}`}
              >
                {promo.active ? 'Activa' : 'Inactiva'}
              </span>
            </td>
            <td>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="text-sm font-medium text-brand-600 hover:underline"
                  onClick={() => {
                    setEditing(promo);
                    setForm({
                      title: promo.title,
                      description: promo.description ?? '',
                      discount_type: promo.discount_type,
                      discount_value: String(promo.discount_value),
                      code: promo.code ?? '',
                      starts_at: promo.starts_at ? promo.starts_at.slice(0, 10) : '',
                      ends_at: promo.ends_at ? promo.ends_at.slice(0, 10) : '',
                      min_subtotal: String(promo.min_subtotal ?? 0),
                      active: promo.active,
                    });
                    setOpen(true);
                  }}
                >
                  Editar
                </button>
                {promo.active ? (
                  <button
                    type="button"
                    className="text-sm font-medium text-red-600 hover:underline"
                    disabled={deactivate.isPending}
                    onClick={() => deactivate.mutate(promo.id)}
                  >
                    Desactivar
                  </button>
                ) : null}
              </div>
            </td>
          </tr>
        ))}
      </DataTable>

      <Modal
        open={open}
        title={editing ? 'Editar promoción' : 'Nueva promoción'}
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
        <Field label="Título">
          <input
            className="input"
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          />
        </Field>
        <Field label="Descripción">
          <textarea
            rows={2}
            className="input"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tipo de descuento">
            <select
              className="input"
              value={form.discount_type}
              onChange={(e) =>
                setForm((f) => ({ ...f, discount_type: e.target.value as 'percent' | 'fixed' }))
              }
            >
              <option value="percent">Porcentaje</option>
              <option value="fixed">Importe fijo</option>
            </select>
          </Field>
          <Field label="Valor">
            <input
              type="number"
              min={0}
              step="0.01"
              className="input"
              value={form.discount_value}
              onChange={(e) => setForm((f) => ({ ...f, discount_value: e.target.value }))}
            />
          </Field>
          <Field label="Código" hint="Opcional">
            <input
              className="input"
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
            />
          </Field>
          <Field label="Subtotal mínimo (ARS)">
            <input
              type="number"
              min={0}
              className="input"
              value={form.min_subtotal}
              onChange={(e) => setForm((f) => ({ ...f, min_subtotal: e.target.value }))}
            />
          </Field>
          <Field label="Comienza (fecha)">
            <input
              type="date"
              className="input"
              value={form.starts_at}
              onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))}
            />
          </Field>
          <Field label="Termina (fecha)">
            <input
              type="date"
              className="input"
              value={form.ends_at}
              onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))}
            />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
          />
          Promoción activa
        </label>
      </Modal>
    </div>
  );
}
