import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useSession } from '../lib/session';
import { Field } from '../components/ui';

export default function Login() {
  const { login } = useSession();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const user = await login(email, password);
      if (user.role === 'admin') navigate('/admin');
      else if (user.role === 'store_owner' || user.role === 'store_staff') navigate('/comercio');
      else if (user.role === 'courier') navigate('/repartidor');
      else navigate('/mis-pedidos');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container-app flex justify-center py-12">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-black tracking-tight text-ink-900">Ingresá a tu cuenta</h1>
        <p className="mt-1 text-sm text-ink-500">
          Podés comprar sin cuenta. Creala si querés consultar tus compras anteriores.
        </p>

        <form onSubmit={submit} className="card mt-6 space-y-4 p-6">
          <Field label="Email">
            <input
              type="email"
              required
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </Field>
          <Field label="Contraseña">
            <input
              type="password"
              required
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </Field>

          {error ? (
            <div className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : null}

          <button type="submit" className="btn-primary w-full" disabled={loading}>
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>

          <p className="text-center text-sm text-ink-500">
            ¿No tenés cuenta?{' '}
            <Link to="/registrarse" className="font-medium text-brand-600 hover:underline">
              Creá una
            </Link>
          </p>
        </form>

        <div className="card mt-4 p-4 text-xs text-ink-500">
          <p className="font-semibold text-ink-700">Cuentas de demostración</p>
          <ul className="mt-1 space-y-0.5">
            <li>admin@acoyaradas.app (administración)</li>
            <li>comercio@acoyaradas.app (comercio)</li>
            <li>repartidor@acoyaradas.app (repartidor)</li>
            <li>cliente@acoyaradas.app (cliente)</li>
          </ul>
          <p className="mt-1">Contraseña para todas: Demo1234!</p>
        </div>
      </div>
    </div>
  );
}
