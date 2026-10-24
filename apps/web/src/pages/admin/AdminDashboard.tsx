import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../../lib/api';
import { formatDate, formatMoney, formatNumber } from '../../lib/format';
import { DataTable } from '../../components/PanelShell';
import { ErrorState, SectionTitle, Spinner, StatCard } from '../../components/ui';
import { ORDER_STATUS_LABELS, type OrderStatus } from '@acoyaradas/shared';

interface Dashboard {
  period: { from: string; to: string };
  sales_period: {
    gross: number;
    orders: number;
    discounts: number;
    shipping: number;
    total: number;
    commission: number;
    net_platform: number;
  };
  orders_by_status: Record<string, number>;
  pending_acceptance: number;
  preparing: number;
  deliveries_pending: number;
  stores_active: number;
  stores_pending: number;
  stores_suspended: number;
  ads_active: number;
  ads_expiring: number;
  subscriptions_active: number;
  subscriptions_expired: number;
  commissions: { pending: number; settled: number };
  revenue: {
    subscriptions: number;
    advertising: number;
    commissions: number;
    pending_amount: number;
  };
  logistics_expenses: number;
  logistics: { deliveries: number; due_to_riders: number; shipping_collected: number };
  incidents: number;
  cancelled: number;
}

export default function AdminDashboard() {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const query = buildQuery({ from, to });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-dashboard', from, to],
    queryFn: () => api.get<Dashboard>(`/admin/dashboard${query}`),
  });

  if (isLoading) return <Spinner />;
  if (error) {
    return <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />;
  }
  if (!data) return <Spinner />;

  const d = data;

  return (
    <div className="space-y-6">
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
          <input
            type="date"
            className="input mt-1"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
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
          Período: {formatDate(d.period.from)} — {formatDate(d.period.to)}
        </p>
      </div>

      <section>
        <SectionTitle
          title="Acciones rápidas"
          subtitle="Atajos a las tareas del día"
          icon="⚡"
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              to: '/admin/pedidos',
              icon: '🛎️',
              title: 'Pedidos pendientes',
              detail: `${formatNumber(d.pending_acceptance)} esperando aceptación`,
            },
            {
              to: '/admin/pedidos',
              icon: '🛵',
              title: 'Asignar entregas',
              detail: `${formatNumber(d.deliveries_pending)} en la cola de logística`,
            },
            {
              to: '/admin/comercios',
              icon: '🏪',
              title: 'Comercios',
              detail: `${formatNumber(d.stores_pending)} pendientes de aprobación`,
            },
            {
              to: '/admin/whatsapp',
              icon: '💬',
              title: 'WhatsApp del encargado',
              detail: 'Mensajes automáticos y bandeja de salida',
            },
            {
              to: '/admin/publicidad',
              icon: '📣',
              title: 'Publicidad',
              detail: `${formatNumber(d.ads_active)} campañas activas`,
            },
            {
              to: '/admin/reportes',
              icon: '📥',
              title: 'Reportes',
              detail: 'Exportá ventas, pedidos y liquidaciones',
            },
          ].map((item) => (
            <Link
              key={`${item.to}-${item.title}`}
              to={item.to}
              className="card card-hover flex items-start gap-3 p-4"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-xl" aria-hidden>
                {item.icon}
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink-900">{item.title}</span>
                <span className="block text-xs text-ink-500">{item.detail}</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section>
        <SectionTitle
          title="Ingresos propios de acoYAradas!"
          subtitle="El valor bruto de las ventas de los comercios NO es ingreso de la plataforma"
        />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Abonos (confirmados)"
            value={formatMoney(d.revenue.subscriptions)}
            hint="Suscripciones cobradas"
            tone="brand"
            icon="💳"
          />
          <StatCard
            label="Publicidad (confirmada)"
            value={formatMoney(d.revenue.advertising)}
            hint="Campañas facturadas"
            tone="brand"
            icon="📣"
          />
          <StatCard
            label="Comisiones"
            value={formatMoney(d.revenue.commissions)}
            hint="Registradas, pendientes de liquidar"
            tone="brand"
            icon="📊"
          />
          <StatCard
            label="Total ingreso propio"
            value={formatMoney(d.sales_period.net_platform)}
            hint={`${formatMoney(d.revenue.pending_amount)} en pagos sin confirmar`}
            icon="💰"
          />
        </div>
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
          Los importes marcados como &laquo;confirmados&raquo; corresponden a pagos verificados. El
          resto figura como pendiente y no representa un cobro realizado.
        </p>
      </section>

      <section>
        <SectionTitle title="Ventas de los comercios (período)" subtitle="Volumen operado en el marketplace" icon="🛒" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Pedidos" value={formatNumber(d.sales_period.orders)} />
          <StatCard label="Bruto" value={formatMoney(d.sales_period.gross)} />
          <StatCard label="Descuentos" value={formatMoney(d.sales_period.discounts)} />
          <StatCard label="Envíos" value={formatMoney(d.sales_period.shipping)} />
          <StatCard label="Total vendido" value={formatMoney(d.sales_period.total)} />
        </div>
      </section>

      <section>
        <SectionTitle title="Operación" subtitle="Colas de trabajo pendientes" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="Pedidos pendientes de aceptación"
            value={formatNumber(d.pending_acceptance)}
            tone={d.pending_acceptance ? 'warn' : 'default'}
          />
          <StatCard label="En preparación" value={formatNumber(d.preparing)} />
          <StatCard
            label="Entregas pendientes"
            value={formatNumber(d.deliveries_pending)}
            hint="Asignados / en camino / listos"
          />
          <StatCard
            label="Incidencias"
            value={formatNumber(d.incidents)}
            tone={d.incidents ? 'danger' : 'default'}
          />
        </div>
      </section>

      <section>
        <SectionTitle title="Comercios, publicidad y suscripciones" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <StatCard
            label="Comercios activos"
            value={formatNumber(d.stores_active)}
            hint={`${formatNumber(d.stores_pending)} pendientes de aprobación`}
          />
          <StatCard
            label="Comercios suspendidos"
            value={formatNumber(d.stores_suspended)}
            tone={d.stores_suspended ? 'warn' : 'default'}
          />
          <StatCard
            label="Publicidades activas"
            value={formatNumber(d.ads_active)}
            hint={`${formatNumber(d.ads_expiring)} vencen en 7 días`}
          />
          <StatCard
            label="Suscripciones vigentes"
            value={formatNumber(d.subscriptions_active)}
            hint={`${formatNumber(d.subscriptions_expired)} vencidas o impagas`}
          />
          <StatCard
            label="Comisiones pendientes"
            value={formatMoney(d.commissions.pending)}
            hint={`${formatMoney(d.commissions.settled)} liquidadas`}
          />
          <StatCard
            label="Pedidos cancelados"
            value={formatNumber(d.cancelled)}
            hint="Excluidos de la comisión"
          />
        </div>
      </section>

      <section>
        <SectionTitle title="Logística registrada" subtitle="Importes adeudados a repartidores y cobrados por envío" />
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Entregas registradas" value={formatNumber(d.logistics.deliveries)} />
          <StatCard label="Envíos cobrados" value={formatMoney(d.logistics.shipping_collected)} />
          <StatCard
            label="Adeudado a repartidores"
            value={formatMoney(d.logistics.due_to_riders)}
            tone="warn"
            icon="🛵"
          />
        </div>
      </section>

      <section>
        <SectionTitle title="Pedidos por estado" />
        {Object.keys(d.orders_by_status).length === 0 ? (
          <p className="text-sm text-ink-500">Todavía no hay pedidos.</p>
        ) : (
          <DataTable headers={['Estado', 'Pedidos']} empty="Sin pedidos.">
            {Object.entries(d.orders_by_status).map(([status, total]) => (
              <tr key={status}>
                <td>{ORDER_STATUS_LABELS[status as OrderStatus] ?? status}</td>
                <td className="font-semibold text-ink-900">{formatNumber(total)}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </section>
    </div>
  );
}

/** Query string con fechas opcionales. */
function buildQuery(params: { from: string; to: string }): string {
  const search = new URLSearchParams();
  if (params.from) search.set('from', new Date(params.from).toISOString());
  if (params.to) search.set('to', new Date(`${params.to}T23:59:59`).toISOString());
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}
