import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import type { CategoryDto } from '@acoyaradas/shared';
import { Field } from '../components/ui';

export default function BecomeStore() {
  const { user } = useSession();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    store_name: '',
    owner_name: '',
    phone: '',
    address: '',
    locality: '',
    category_id: '',
    email: '',
    notes: '',
  });
  const [accepted, setAccepted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: () => api.get<{ items: CategoryDto[] }>('/categories'),
  });

  const submit = useMutation({
    mutationFn: () =>
      api.post('/store/applications', {
        ...form,
        category_id: form.category_id,
        email: form.email || undefined,
        notes: form.notes || undefined,
        accepted_terms: accepted,
      }),
    onSuccess: () => {
      setMessage('¡Solicitud enviada! El administrador de acoYAradas! la va a revisar.');
    },
    onError: (err) => setMessage((err as Error).message),
  });

  if (!user) {
    return (
      <div className="container-app max-w-2xl py-12">
        <h1 className="text-2xl font-black tracking-tight text-ink-900">Sumate como comercio</h1>
        <p className="mt-2 text-sm text-ink-500">
          Para enviar una solicitud comercial necesitás una cuenta (podés crearla en un minuto).
        </p>
        <div className="mt-6 flex gap-3">
          <button type="button" className="btn-primary" onClick={() => navigate('/registrarse')}>
            Crear cuenta
          </button>
          <button type="button" className="btn-secondary" onClick={() => navigate('/ingresar')}>
            Ingresar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container-app max-w-2xl py-10">
      <h1 className="text-2xl font-black tracking-tight text-ink-900">Sumate como comercio</h1>
      <p className="mt-2 text-sm text-ink-600">
        Completá el formulario y el administrador va a revisar tus datos antes de publicar el
        negocio. Vas a recibir una notificación cuando se apruebe.
      </p>

      {message ? (
        <div className="mt-4 rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-800">{message}</div>
      ) : null}

      <form
        className="card mt-6 space-y-4 p-6"
        onSubmit={(e) => {
          e.preventDefault();
          setMessage(null);
          submit.mutate();
        }}
      >
        <Field label="Nombre del negocio">
          <input
            required
            minLength={2}
            className="input"
            value={form.store_name}
            onChange={(e) => setForm((f) => ({ ...f, store_name: e.target.value }))}
          />
        </Field>
        <Field label="Nombre del responsable">
          <input
            required
            minLength={2}
            className="input"
            value={form.owner_name}
            onChange={(e) => setForm((f) => ({ ...f, owner_name: e.target.value }))}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Teléfono">
            <input
              required
              className="input"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </Field>
          <Field label="Email de contacto" hint="Opcional">
            <input
              type="email"
              className="input"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
            />
          </Field>
        </div>
        <Field label="Dirección">
          <input
            required
            minLength={5}
            className="input"
            value={form.address}
            onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Localidad">
            <input
              required
              className="input"
              value={form.locality}
              onChange={(e) => setForm((f) => ({ ...f, locality: e.target.value }))}
            />
          </Field>
          <Field label="Categoría">
            <select
              required
              className="input"
              value={form.category_id}
              onChange={(e) => setForm((f) => ({ ...f, category_id: e.target.value }))}
            >
              <option value="">Seleccioná…</option>
              {(categories?.items ?? []).map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Notas" hint="Opcional: horarios, productos, deliveries…">
          <textarea
            rows={3}
            className="input"
            value={form.notes}
            onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </Field>

        <label className="flex items-start gap-2 text-sm text-ink-700">
          <input
            type="checkbox"
            required
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
            className="mt-1"
          />
          <span>
            Acepto las{' '}
            <a href="/legal/comercios" className="text-brand-600 hover:underline">
              condiciones para comercios
            </a>{' '}
            y la{' '}
            <a href="/legal/privacidad" className="text-brand-600 hover:underline">
              política de privacidad
            </a>
            .
          </span>
        </label>

        <button type="submit" className="btn-primary w-full" disabled={submit.isPending}>
          {submit.isPending ? 'Enviando…' : 'Enviar solicitud'}
        </button>
      </form>
    </div>
  );
}
