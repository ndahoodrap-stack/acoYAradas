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

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/[^0-9+\-\s()]/g, '');
    setForm((f) => ({ ...f, phone: value }));
  };

  return (
    <div className="container-app min-h-[calc(100vh-64px)] flex items-center justify-center py-12 px-4">
      {/* Decorative background elements */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-brand-100/50 blur-3xl" />
        <div className="absolute -bottom-20 -left-20 w-72 h-72 rounded-full bg-brand-100/50 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2" aria-label="acoYAradas! - Inicio">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 flex items-center justify-center shadow-lg shadow-brand-500/30">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
              </svg>
            </div>
            <span className="text-xl font-black text-ink-900">acoYAradas!</span>
          </Link>
        </div>

        {/* Main Card */}
        <div className="card relative overflow-hidden" style={{ boxShadow: '0 20px 40px -15px rgba(0,0,0,0.1)' }}>
          {/* Top accent bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-brand-500 to-brand-600" />

          <div className="p-8">
            <header className="text-center mb-8">
              <h1 className="text-2xl font-black tracking-tight text-ink-900">Creá tu cuenta</h1>
              <p className="mt-2 text-sm text-ink-500">
                La cuenta es opcional para comprar: sirve para ver tus pedidos y para ser comercio
              </p>
            </header>

            <form onSubmit={submit} className="space-y-5" noValidate>
              <Field label="Nombre y apellido" htmlFor="full_name">
                <input
                  id="full_name"
                  required
                  minLength={2}
                  className="input w-full"
                  value={form.full_name}
                  onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                  autoComplete="name"
                  placeholder="Juan Pérez"
                  disabled={loading}
                  aria-describedby={error ? 'register-error' : undefined}
                />
              </Field>

              <Field label="Email" htmlFor="email">
                <input
                  id="email"
                  type="email"
                  required
                  className="input w-full"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  autoComplete="email"
                  placeholder="tu@email.com"
                  disabled={loading}
                  aria-describedby={error ? 'register-error' : undefined}
                />
              </Field>

              <Field label="Teléfono" hint="Opcional" htmlFor="phone">
                <input
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  className="input w-full"
                  value={form.phone}
                  onChange={handlePhoneChange}
                  placeholder="+54 9 11 0000-0000"
                  disabled={loading}
                />
              </Field>

              <Field label="Contraseña" hint="Mínimo 8 caracteres" htmlFor="password">
                <input
                  id="password"
                  type="password"
                  required
                  minLength={8}
                  className="input w-full"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  disabled={loading}
                  aria-describedby={error ? 'register-error' : undefined}
                />
              </Field>

              {error ? (
                <div id="register-error" className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700 animate-shake" role="alert">
                  <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20" aria-hidden="true">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <span>{error}</span>
                  </div>
                </div>
              ) : null}

              <button
                type="submit"
                className="btn-primary w-full py-3.5 text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-lg hover:shadow-brand-500/30 active:scale-[0.98]"
                disabled={loading}
              >
                {loading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" aria-hidden="true">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Creando cuenta…
                  </span>
                ) : (
                  'Crear cuenta'
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-ink-500">
              ¿Ya tenés cuenta?{' '}
              <Link to="/ingresar" className="font-medium text-brand-600 hover:text-brand-700 underline underline-offset-2 transition-colors">
                Ingresá
              </Link>
            </p>
          </div>
        </div>

        {/* Footer note */}
        <p className="mt-6 text-center text-xs text-ink-400">
          Al continuar, aceptás nuestros{' '}
          <Link to="/terminos" className="text-brand-600 hover:underline">Términos</Link>{' '}
          y{' '}
          <Link to="/privacidad" className="text-brand-600 hover:underline">Privacidad</Link>
        </p>
      </div>
    </div>
  );
}