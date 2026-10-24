import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div className="container-app flex justify-center py-20">
      <div className="card max-w-md p-8 text-center">
        <div className="text-5xl">🧭</div>
        <h1 className="mt-4 text-2xl font-black text-ink-900">Página no encontrada</h1>
        <p className="mt-2 text-sm text-ink-500">
          El enlace que abriste no existe o cambió de dirección.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link to="/" className="btn-primary">
            Ir al inicio
          </Link>
          <Link to="/comercios" className="btn-secondary">
            Ver comercios
          </Link>
        </div>
      </div>
    </div>
  );
}
