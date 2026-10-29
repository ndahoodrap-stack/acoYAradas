import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatDate, formatDateTime, formatMoney, formatNumber } from '../../lib/format';
import { DataTable } from '../../components/PanelShell';
import { EmptyState, ErrorState, SectionTitle, Spinner, StatCard } from '../../components/ui';
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@acoyaradas/shared';

interface PaymentRow {
  id: string;
  kind: 'subscription' | 'advertising' | 'commission' | 'order';
  amount: number;
  method: PaymentMethod | null;
  status: 'pending' | 'confirmed' | 'failed' | 'refunded';
  due_at: string | null;
  paid_at: string | null;
  confirmed_at: string | null;
  notes: string | null;
  created_at: string;
}

interface CommissionRow {
  id: string;
  order_id: string;
  order_code: string;
  gross_amount: number;
  discount_amount: number;
  shipping_amount: number;
  commission_base: number;
  rate_type: 'percent' | 'fixed';
  rate_value: number;
  commission_amount: number;
  net_amount: number;
  status: string;
  created_at: string;
}

interface CampaignRow {
  id: string;
  title: string;
  placement: string;
  starts_at: string;
  ends_at: string;
  price: number;
  status: string;
  impressions: number;
  clicks: number;
}

interface FinanceResponse {
  payments: PaymentRow[];
  subscriptions: any[];
  commissions: CommissionRow[];
  campaigns: CampaignRow[];
  limits: any;
}

interface StatsResponse {
  sales: {
    orders: number;
    gross: number;
    discounts: number;
    shipping: number;
    total: number;
  };
  commission: { pending: number; settled: number; net: number };
  orders_by_status: Record<string, number>;
  top_products: { name: string; units: number; amount: number }[];
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  confirmed: 'Confirmado',
  failed: 'Fallido',
  refunded: 'Reembolsado',
};

const KIND_LABELS: Record<string, string> = {
  subscription: 'Suscripción',
  advertising: 'Publicidad',
  commission: 'Comisión',
  order: 'Pedido',
};

const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  draft: 'Borrador',
  pending: 'En revisión',
  active: 'Activa',
  paused: 'Pausada',
  finished: 'Finalizada',
  rejected: 'Rechazada',
};

export default function StoreFinance() {
  const [tab, setTab] = useState<'resumen' | 'pagos' | 'comisiones' | 'publicidad'>('resumen');

  const finance = useQuery({
    queryKey: ['store-finance'],
    queryFn: () => api.get<FinanceResponse>('/store/finance'),
  });

  const stats = useQuery({
    queryKey: ['store-stats'],
    queryFn: () => api.get<StatsResponse>('/store/stats'),
  });

  if (finance.isLoading || stats.isLoading) return <Spinner />;
  if (finance.error) {
    return (
      <ErrorState
        message={(finance.error as Error).message}
        onRetry={() => void finance.refetch()}
      />
    );
  }
  if (stats.error) {
    return (
      <ErrorState message={(stats.error as Error).message} onRetry={() => void stats.refetch()} />
    );
  }

  const data = finance.data;
  const s = stats.data;
  if (!data || !s) return <Spinner />;

  const pendingPayments = data.payments.filter((p) => p.status === 'pending');
  const pendingTotal = pendingPayments.reduce((acc, p) => acc + Number(p.amount ?? 0), 0);

  const tabs: { key: typeof tab; label: string }[] = [
    { key: 'resumen', label: 'Resumen' },
    { key: 'pagos', label: 'Pagos' },
    { key: 'comisiones', label: 'Comisiones' },
    { key: 'publicidad', label: 'Publicidad' },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`btn ${tab === t.key ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'resumen' ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Ventas totales"
              value={formatMoney(s.sales.total)}
              hint={`${formatNumber(s.sales.orders)} pedidos (sin cancelados)`}
              tone="brand"
            />
            <StatCard
              label="Tu neto (sin comisión)"
              value={formatMoney(s.commission.net)}
              hint="Bruto del pedido menos comisión de acoYAradas!"
            />
            <StatCard
              label="Comisión acumulada"
              value={formatMoney(s.commission.pending)}
              hint={formatMoney(s.commission.settled) + ' liquidada'}
              tone="warn"
            />
            <StatCard
              label="Pagos pendientes"
              value={formatMoney(pendingTotal)}
              hint={`${pendingPayments.length} registro(s) sin confirmar`}
              tone={pendingPayments.length ? 'danger' : 'default'}
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="card p-5">
              <SectionTitle title="Productos más vendidos" subtitle="Top 10 por importe" />
              {s.top_products.length === 0 ? (
                <p className="text-sm text-ink-500">Todavía no hay ventas registradas.</p>
              ) : (
                <ul className="space-y-2 text-sm">
                  {s.top_products.map((p) => (
                    <li key={p.name} className="flex items-center justify-between gap-3">
                      <span className="truncate text-ink-700">{p.name}</span>
                      <span className="shrink-0 text-ink-500">
                        {formatNumber(p.units)} u. · {formatMoney(p.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>

          <section className="card p-5">
            <SectionTitle title="Pedidos por estado" />
            {Object.keys(s.orders_by_status).length === 0 ? (
              <p className="text-sm text-ink-500">Sin pedidos por ahora.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {Object.entries(s.orders_by_status).map(([status, total]) => (
                  <span key={status} className="badge bg-ink-100 text-ink-700">
                    {status}: {formatNumber(total)}
                  </span>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}

      {tab === 'pagos' ? (
        <section className="space-y-3">
          <p className="text-sm text-ink-500">
            Registros de pago del comercio. &laquo;Pendiente&raquo; significa que todavía no hay
            comprobante verificado.
          </p>
          {data.payments.length === 0 ? (
            <EmptyState
              title="Sin registros de pago"
              description="Cuando contrate un plan o una campaña publicitaria aparecerán acá."
            />
          ) : (
            <DataTable
              headers={['Concepto', 'Monto', 'Método', 'Estado', 'Vence', 'Registrado']}
              empty="Sin registros de pago."
            >
              {data.payments.map((p) => (
                <tr key={p.id}>
                  <td>
                    <p className="font-medium text-ink-900">{KIND_LABELS[p.kind] ?? p.kind}</p>
                    {p.notes ? <p className="text-xs text-ink-500">{p.notes}</p> : null}
                  </td>
                  <td className="font-semibold text-ink-900">{formatMoney(p.amount)}</td>
                  <td className="text-xs">
                    {p.method ? (PAYMENT_METHOD_LABELS[p.method] ?? p.method) : '—'}
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        p.status === 'confirmed'
                          ? 'bg-emerald-100 text-emerald-800'
                          : p.status === 'failed'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {PAYMENT_STATUS_LABELS[p.status] ?? p.status}
                    </span>
                  </td>
                  <td className="text-xs">{p.due_at ? formatDate(p.due_at) : '—'}</td>
                  <td className="text-xs text-ink-500">{formatDateTime(p.created_at)}</td>
                </tr>
              ))}
            </DataTable>
          )}
        </section>
      ) : null}

      {tab === 'comisiones' ? (
        <section className="space-y-3">
          <p className="text-sm text-ink-500">
            Comisión que acoYAradas! retiene sobre cada pedido. Tu neto es lo que queda para vos.
          </p>
          {data.commissions.length === 0 ? (
            <EmptyState
              title="Sin comisiones registradas"
              description="La comisión se calcula cuando el pedido se confirma."
            />
          ) : (
            <DataTable
              headers={['Pedido', 'Base', 'Tipo', 'Comisión', 'Tu neto', 'Estado']}
              empty="Sin comisiones."
            >
              {data.commissions.map((c) => (
                <tr key={c.id}>
                  <td className="font-mono text-xs">{c.order_code}</td>
                  <td>{formatMoney(c.commission_base)}</td>
                  <td className="text-xs">
                    {c.rate_type === 'percent' ? `${c.rate_value}%` : formatMoney(c.rate_value)}
                  </td>
                  <td className="text-red-700">−{formatMoney(c.commission_amount)}</td>
                  <td className="font-semibold text-emerald-700">{formatMoney(c.net_amount)}</td>
                  <td>
                    <span className="badge bg-ink-100 text-ink-700">{c.status}</span>
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </section>
      ) : null}

      {tab === 'publicidad' ? (
        <section className="space-y-3">
          {data.campaigns.length === 0 ? (
            <EmptyState
              title="Sin campañas"
              description="Podés crear una campaña desde la sección Publicidad del panel."
            />
          ) : (
            <DataTable
              headers={['Campaña', 'Ubicación', 'Vigencia', 'Precio', 'Impresiones', 'Clics', 'Estado']}
              empty="Sin campañas."
            >
              {data.campaigns.map((c) => (
                <tr key={c.id}>
                  <td className="font-medium text-ink-900">{c.title}</td>
                  <td className="text-xs">{c.placement}</td>
                  <td className="text-xs">
                    {formatDate(c.starts_at)} → {formatDate(c.ends_at)}
                  </td>
                  <td>{formatMoney(c.price)}</td>
                  <td>{formatNumber(c.impressions)}</td>
                  <td>{formatNumber(c.clicks)}</td>
                  <td>
                    <span className="badge bg-ink-100 text-ink-700">
                      {CAMPAIGN_STATUS_LABELS[c.status] ?? c.status}
                    </span>
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </section>
      ) : null}
    </div>
  );
}
