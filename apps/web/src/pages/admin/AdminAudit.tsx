import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { DataTable } from '../../components/PanelShell';
import { EmptyState, ErrorState, SectionTitle, Spinner } from '../../components/ui';

interface AuditEntry {
  id: string;
  actor_id: string | null;
  actor_role: string | null;
  actor_name: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
}

export default function AdminAudit() {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['admin-audit'],
    queryFn: () => api.get<{ items: AuditEntry[] }>('/admin/audit'),
  });

  if (isLoading) return <Spinner />;
  if (error) {
    return <ErrorState message={(error as Error).message} onRetry={() => void refetch()} />;
  }

  const entries = data?.items ?? [];

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Registro de auditoría"
        subtitle="Acciones administrativas registradas por el servidor"
      />

      {entries.length === 0 ? (
        <EmptyState title="Sin acciones registradas" description="El registro se completa al operar." />
      ) : (
        <DataTable
          headers={['Fecha', 'Actor', 'Rol', 'Acción', 'Entidad', 'Detalle', 'IP']}
          empty="Sin acciones."
        >
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td className="text-xs text-ink-600">{formatDateTime(entry.created_at)}</td>
              <td className="text-xs">
                <p className="font-medium text-ink-900">{entry.actor_name ?? '—'}</p>
                {entry.actor_id ? (
                  <p className="font-mono text-[11px] text-ink-400">{entry.actor_id.slice(0, 8)}</p>
                ) : null}
              </td>
              <td className="text-xs">{entry.actor_role ?? '—'}</td>
              <td>
                <span className="badge bg-ink-100 font-mono text-[11px] text-ink-700">
                  {entry.action}
                </span>
              </td>
              <td className="text-xs">
                {entry.entity_type ?? '—'}
                {entry.entity_id ? (
                  <p className="font-mono text-[11px] text-ink-400">{entry.entity_id.slice(0, 8)}</p>
                ) : null}
              </td>
              <td className="max-w-xs truncate text-xs text-ink-500">
                {entry.metadata ? JSON.stringify(entry.metadata) : '—'}
              </td>
              <td className="text-xs text-ink-500">{entry.ip ?? '—'}</td>
            </tr>
          ))}
        </DataTable>
      )}
    </div>
  );
}
