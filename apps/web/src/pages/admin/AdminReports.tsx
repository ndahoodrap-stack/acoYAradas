import { useState } from 'react';
import { downloadCsv } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { ErrorState, SectionTitle, Spinner } from '../../components/ui';

const REPORTS = [
  {
    kind: 'orders',
    title: 'Pedidos',
    description: 'Detalle de cada pedido del período: código, comercio, cliente, estado, entrega e importes.',
    filename: 'acoYAradas-pedidos.csv',
  },
  {
    kind: 'sales',
    title: 'Ventas',
    description: 'Mismo detalle de pedidos, orientado al análisis de ventas del marketplace.',
    filename: 'acoYAradas-ventas.csv',
  },
  {
    kind: 'commissions',
    title: 'Comisiones',
    description: 'Bruto, descuentos, envío, base de cálculo, comisión y neto de cada pedido.',
    filename: 'acoYAradas-comisiones.csv',
  },
  {
    kind: 'ads',
    title: 'Publicidad',
    description: 'Campañas con ubicación, vigencia, precio, impresiones y clics.',
    filename: 'acoYAradas-publicidad.csv',
  },
];

export default function AdminReports() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const query = () => {
    const params = new URLSearchParams();
    if (from) params.set('from', new Date(from).toISOString());
    if (to) params.set('to', new Date(`${to}T23:59:59`).toISOString());
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  };

  const download = async (kind: string, filename: string) => {
    setBusy(kind);
    setError(null);
    try {
      await downloadCsv(`/admin/reports/${kind}.csv${query()}`, filename);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (busy && !error) {
    return <Spinner label="Generando reporte…" />;
  }

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Reportes"
        subtitle="Exportación a CSV con separador ';' y codificación UTF-8 (compatible con Excel en español)"
      />

      <div className="card flex flex-wrap items-end gap-3 p-4">
        <label className="text-xs text-ink-600">
          Desde
          <input
            type="date"
            className="input mt-1"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label className="text-xs text-ink-600">
          Hasta
          <input type="date" className="input mt-1" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        {(from || to) ? (
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setFrom('');
              setTo('');
            }}
          >
            Últimos 30 días
          </button>
        ) : null}
        <p className="ml-auto text-xs text-ink-500">
          {from || to
            ? `Período: ${formatDate(from || new Date().toISOString())} — ${formatDate(to || new Date().toISOString())}`
            : 'Sin filtro: últimos 30 días'}
        </p>
      </div>

      {error ? (
        <ErrorState message={error} onRetry={() => setError(null)} />
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        {REPORTS.map((report) => (
          <div key={report.kind} className="card flex flex-col gap-3 p-5">
            <div>
              <h3 className="text-base font-bold text-ink-900">{report.title}</h3>
              <p className="mt-1 text-sm text-ink-500">{report.description}</p>
            </div>
            <button
              type="button"
              className="btn-primary self-start"
              disabled={busy !== null}
              onClick={() => void download(report.kind, report.filename)}
            >
              {busy === report.kind ? 'Generando…' : `Descargar ${report.filename}`}
            </button>
          </div>
        ))}
      </div>

      <p className="text-xs text-ink-500">
        Los reportes se generan en el servidor con el permiso de administrador. No incluyen datos de
        tarjetas ni información sensible de pagos.
      </p>
    </div>
  );
}
