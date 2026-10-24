import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSession } from '../lib/session';
import { Field } from '../components/ui';

export default function Register() {
  const { register } = useSession();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    phone: '',
    password: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await register({
        full_name: form.full_name,
        email: form.email,
        password: form.password,
        phone: form.phone || undefined,
      });
      navigate('/mis-pedidos');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container-app flex justify-center py-12">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-black tracking-tight text-ink-900">Creá tu cuenta</h1>
        <p className="mt-1 text-sm text-ink-500">
          La cuenta es opcional para comprar: sirve para ver tus pedidos y para ser comercio.
        </p>

        <form onSubmit={submit} className="card mt-6 space-y-4 p-6">
          <Field label="Nombre y apellido">
            <input
              required
              minLength={2}
              className="input"
              value={form.full_name}
              onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
            />
          </Field>
          <Field label="Email">
            <input
              type="email"
              required
              className="input"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              autoComplete="email"
            />
          </Field>
          <Field label="Teléfono" hint="Opcional">
            <input
              className="input"
              value={form.phone}
              onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
          </Field>
          <Field label="Contraseña" hint="Mínimo 8 caracteres">
            <input
              type="password"
              required
              minLength={8}
              className="input"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              autoComplete="new-password"
            />
          </Field>

          {error ? (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : null}

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Creando cuenta…' : 'Crear cuenta'}
          </button>

          <p className="text-center text-sm text-ink-500">
            ¿Ya tenés cuenta?{' '}
            <Link to="/ingresar" className="font-medium text-brand-600 hover:underline">
              Ingresá
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
