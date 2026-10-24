import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatDateTime, formatMoney } from '../../lib/format';
import { DataTable } from '../../components/PanelShell';
import { EmptyState, ErrorState, SectionTitle, Spinner, StatCard, StatusBadge } from '../../components/ui';
import type { OrderDto } from '@acoyaradas/shared';

interface HistoryOrder extends OrderDto {
  assignment_status: string;
  amount_collected: number;
  amount_due: number;
}

interface HistoryResponse {
  items: HistoryOrder[];
  totals: { orders: number; collected: number; due: number };
}

const ASSIGNMENT_LABELS: Record<string, string> = {
  assigned: 'Asignado',
  picked_up: 'Retirado',
  delivered: 'Entregado',
  failed: 'Fallido',
};

export default function RiderHistory() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['rider-history'],
    queryFn: () => api.get<HistoryResponse>('/rider/history'),
  });

  if (isLoading) return <Spinner />;
  if (error) {
    return <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />;
  }

  const items = data?.items ?? [];
  const totals = data?.totals ?? { orders: 0, collected: 0, due: 0 };

  return (
    <div className="space-y-4">
      <SectionTitle title="Historial de entregas" subtitle="Sólo vos ves esta información" />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Entregas registradas" value={totals.orders} />
        <StatCard label="Importe cobrado" value={formatMoney(totals.collected)} tone="brand" />
        <StatCard label="Importe adeudado" value={formatMoney(totals.due)} tone="warn" />
      </div>

      {items.length === 0 ? (
        <EmptyState title="Sin historial" description="Todavía no completaste ninguna entrega." />
      ) : (
        <DataTable
          headers={['Pedido', 'Comercio', 'Estado', 'Asignación', 'Cobrado', 'Adeudado', 'Fecha']}
          empty="Sin entregas."
        >
          {items.map((order) => (
            <tr key={order.id}>
              <td className="font-mono text-xs font-bold text-ink-900">{order.code}</td>
              <td className="text-xs">{order.store_name}</td>
              <td>
                <StatusBadge status={order.status} />
              </td>
              <td className="text-xs">
                {ASSIGNMENT_LABELS[order.assignment_status] ?? order.assignment_status}
              </td>
              <td className="text-xs">{formatMoney(order.amount_collected)}</td>
              <td className="text-xs">{formatMoney(order.amount_due)}</td>
              <td className="text-xs text-ink-500">{formatDateTime(order.placed_at)}</td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}
