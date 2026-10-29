import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { DataTable } from '../../components/PanelShell';
import { EmptyState, ErrorState, Field, Modal, SectionTitle, Spinner } from '../../components/ui';
import { IconPicker } from '../../components/IconPicker';

interface Category {
  id: string;
  name: string;
  slug: string;
  icon_url: string | null;
  sort_order: number;
  active: boolean;
  stores_count: number;
  products_count: number;
}

const EMPTY = { name: '', icon_url: '', sort_order: '0', active: true };

export default function AdminCategories() {
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [form, setForm] = useState({ ...EMPTY });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => api.get<{ items: Category[] }>('/admin/categories'),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
  };

  const save = useMutation({
    mutationFn: () => {
      const body = {
        name: form.name,
        icon_url: form.icon_url || null,
        sort_order: Number(form.sort_order || 0),
        active: form.active,
      };
      if (editing) return api.patch(`/admin/categories/${editing.id}`, body);
      return api.post('/admin/categories', body);
    },
    onSuccess: async () => {
      setOpen(false);
      setEditing(null);
      setForm({ ...EMPTY });
      setMessage('Categoría guardada.');
      await invalidate();
    },
    onError: (err) => setMessage((err as Error).message),
  });

  const toggle = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      api.patch(`/admin/categories/${input.id}`, { active: input.active }),
    onSuccess: invalidate,
    onError: (err) => setMessage((err as Error).message),
  });

  if (isLoading) return <Spinner />;
  if (error) {
    return <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />;
  }

  const categories = data?.items ?? [];

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Categorías"
        subtitle="Las categorías que el cliente puede navegar en la tienda pública"
        action={
          <button
            type="button"
            className="btn-primary"
            onClick={() => {
              setEditing(null);
              setForm({ ...EMPTY });
              setOpen(true);
            }}
          >
            + Nueva categoría
          </button>
        }
      />

      {message ? (
        <div className="rounded-xl bg-ink-100 px-4 py-3 text-sm text-ink-700">{message}</div>
      ) : null}

      {categories.length === 0 ? (
        <EmptyState title="No hay categorías" description="Crea la primera categoría comercial." />
      ) : (
        <DataTable
          headers={['Categoría', 'Slug', 'Orden', 'Comercios', 'Productos', 'Estado', 'Acciones']}
          empty="Sin categorías."
        >
          {categories.map((cat) => (
            <tr key={cat.id}>
              <td className="font-medium text-ink-900">{cat.name}</td>
              <td className="font-mono text-xs text-ink-500">{cat.slug}</td>
              <td className="text-xs">{cat.sort_order}</td>
              <td className="text-xs">{cat.stores_count}</td>
              <td className="text-xs">{cat.products_count}</td>
              <td>
                <span
                  className={`badge ${cat.active ? 'bg-emerald-100 text-emerald-800' : 'bg-ink-200 text-ink-600'}`}
                >
                  {cat.active ? 'Activa' : 'Inactiva'}
                </span>
              </td>
              <td>
                <div className="flex flex-wrap gap-2 text-sm font-medium">
                  <button
                    type="button"
                    className="text-brand-600 hover:underline"
                    onClick={() => {
                      setEditing(cat);
                      setForm({
                        name: cat.name,
                        icon_url: cat.icon_url ?? '',
                        sort_order: String(cat.sort_order ?? 0),
                        active: cat.active,
                      });
                      setOpen(true);
                    }}
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    className="text-ink-700 hover:underline"
                    disabled={toggle.isPending}
                    onClick={() => toggle.mutate({ id: cat.id, active: !cat.active })}
                  >
                    {cat.active ? 'Desactivar' : 'Activar'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      <Modal
        open={open}
        title={editing ? `Editar ${editing.name}` : 'Nueva categoría'}
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
        <Field label="Nombre">
          <input
            className="input"
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
        </Field>
        <Field label="Icono" hint="Opcional - Elegí de la galería o escribí un emoji (Win+.)">
          <div className="space-y-3">
            <IconPicker
              value={form.icon_url}
              onChange={(url) => setForm((f) => ({ ...f, icon_url: url }))}
            />
            <div className="pt-2 border-t border-ink-200">
              <label className="block text-xs font-medium text-ink-700 mb-1">
                O escribí/pastéa un emoji directamente:
              </label>
              <input
                type="text"
                className="input text-2xl text-center"
                maxLength={2}
                placeholder="🍕 🛒 🏪"
                value={form.icon_url}
                onChange={(e) => setForm((f) => ({ ...f, icon_url: e.target.value }))}
                onKeyDown={(e) => {
                  // Prevent non-emoji input from overriding gallery selection
                  if (e.key.length > 2) return;
                }}
              />
              <p className="text-[11px] text-ink-500 text-center">
                Usá Win+. (Windows) o Cmd+Ctrl+Space (Mac) para abrir el selector de emojis
              </p>
            </div>
          </div>
        </Field>
        <Field label="Orden" hint="Menor número, antes en el listado.">
          <input
            type="number"
            className="input"
            value={form.sort_order}
            onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm((f) => ({ ...f, active: e.target.checked }))}
          />
          Categoría activa
        </label>
      </Modal>
    </div>
  );
}
