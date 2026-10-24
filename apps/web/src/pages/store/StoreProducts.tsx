import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatMoney } from '../../lib/format';
import { DataTable } from '../../components/PanelShell';
import { ErrorState, Field, Modal, Spinner } from '../../components/ui';
import { FileUpload } from '../../components/FileUpload';
import { IconPicker } from '../../components/IconPicker';
import type { CategoryDto } from '@acoyaradas/shared';

interface StoreProduct {
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

export default function StoreProducts() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<StoreProduct | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [message, setMessage] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['store-products'],
    queryFn: () => api.get<{ items: StoreProduct[] }>('/store/products'),
  });

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<{ items: CategoryDto[] }>('/categories'),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ['store-products'] });
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
      if (editing) return api.patch(`/store/products/${editing.id}`, body);
      return api.post('/store/products', body);
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
    mutationFn: (id: string) => api.del(`/store/products/${id}`),
    onSuccess: async () => {
      setMessage('Producto dado de baja.');
      await invalidate();
    },
    onError: (err) => setMessage((err as Error).message),
  });

  if (isLoading) return <Spinner />;
  if (error) {
    return <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />;
  }

  const products = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-500">
          {products.length} producto(s) en tu catálogo. Cada producto pertenece a un solo comercio.
        </p>
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
      </div>

      {message ? (
        <div className="rounded-xl bg-ink-100 px-4 py-3 text-sm text-ink-700">{message}</div>
      ) : null}

      <DataTable
        headers={['Producto', 'Precio', 'Stock', 'Categoría', 'Estado', 'Acciones']}
        empty="Todavía no publicaste productos."
      >
        {products.map((product) => (
          <tr key={product.id}>
            <td>
              <div className="flex items-center gap-2">
                {product.image_url ? (
                  <img
                    src={product.image_url}
                    alt=""
                    className="h-9 w-9 rounded-lg object-cover"
                  />
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
              <span
                className={`badge ${product.is_available ? 'bg-emerald-100 text-emerald-800' : 'bg-ink-200 text-ink-600'}`}
              >
                {product.is_available ? 'Disponible' : 'No disponible'}
              </span>
              {product.status !== 'active' ? (
                <span className="badge ml-1 bg-amber-100 text-amber-800">{product.status}</span>
              ) : null}
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
        title={editing ? 'Editar producto' : 'Nuevo producto'}
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
        <Field label="Descripción">
          <textarea
            rows={3}
            className="input"
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Precio (ARS)">
            <input
              type="number"
              min={0}
              step="0.01"
              className="input"
              value={form.price}
              onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
            />
          </Field>
          <Field label="Stock">
            <input
              type="number"
              min={0}
              className="input"
              value={form.stock}
              onChange={(e) => setForm((f) => ({ ...f, stock: e.target.value }))}
            />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Categoría">
            <select
              className="input"
              value={form.category_id}
              onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
            >
              <option value="">Sin categoría</option>
              {(categories?.items ?? []).map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </Field>
          <IconPicker
            value={form.image_url}
            onChange={(url) => setForm((f) => ({ ...f, image_url: url }))}
          />
          <FileUpload
            label="Foto personalizada (opcional)"
            hint="Si subís una foto, reemplaza al icono elegido."
            value={form.image_url}
            onChange={(url) => setForm((f) => ({ ...f, image_url: url }))}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.is_available}
            onChange={(e) => setForm((f) => ({ ...f, is_available: e.target.checked }))}
          />
          Disponible para la venta
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.featured}
            onChange={(e) => setForm((f) => ({ ...f, featured: e.target.checked }))}
          />
          Destacado en el catálogo
        </label>
      </Modal>
    </div>
  );
}
