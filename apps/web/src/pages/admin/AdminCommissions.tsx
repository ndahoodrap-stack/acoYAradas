import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatDateTime, formatMoney } from '../../lib/format';
import { DataTable } from '../../components/PanelShell';
import { EmptyState, ErrorState, Field, Modal, SectionTitle, Spinner, StatCard } from '../../components/ui';

interface Commission {
  id: string;
  order_id: string;
  order_code: string;
  order_status: string;
  store_id: string;
  store_name: string;
  gross_amount: number;
  discount_amount: number;
  shipping_amount: number;
  commission_base: number;
  rate_type: 'percent' | 'fixed';
  rate_value: number;
  commission_amount: number;
  net_amount: number;
  status: 'pending' | 'settled' | 'waived';
  created_at: string;
}

interface CommissionRule {
  id: string;
  store_id: string | null;
  store_name: string | null;
  type: 'percent' | 'fixed';
  value: number;
  basis: 'product_total' | 'order_total';
  active: boolean;
}

interface StoreRef {
  id: string;
  name: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente',
  settled: 'Liquidada',
  waived: 'Condonada',
};

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  settled: 'bg-emerald-100 text-emerald-800',
  waived: 'bg-ink-200 text-ink-600',
};

const EMPTY_RULE = {
  store_id: '',
  type: 'percent' as 'percent' | 'fixed',
  value: '8',
  basis: 'product_total' as 'product_total' | 'order_total',
  active: true,
};

export default function AdminCommissions() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'registros' | 'reglas'>('registros');
  const [status, setStatus] = useState('');
  const [storeId, setStoreId] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [ruleOpen, setRuleOpen] = useState(false);
  const [ruleForm, setRuleForm] = useState({ ...EMPTY_RULE });
  const [editingRule, setEditingRule] = useState<CommissionRule | null>(null);

  const commissions = useQuery({
    queryKey: ['admin-commissions', status, storeId],
    queryFn: () => {
      const params = new URLSearchParams();
      if (status) params.set('status', status);
      if (storeId) params.set('store_id', storeId);
      const qs = params.toString();
      return api.get<{ items: Commission[] }>(`/admin/commissions${qs ? `?${qs}` : ''}`);
    },
  });

  const rules = useQuery({
    queryKey: ['admin-commission-rules'],
    queryFn: () => api.get<{ items: CommissionRule[] }>('/admin/commission-rules'),
  });

  const stores = useQuery({
    queryKey: ['admin-stores', 'filter'],
    queryFn: () => api.get<{ items: StoreRef[] }>('/admin/stores?status=all'),
  });

  const invalidateAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-commissions'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-commission-rules'] }),
    ]);
  };

  const statusMutation = useMutation({
    mutationFn: (input: { id: string; status: string }) =>
      api.patch(`/admin/commissions/${input.id}`, { status: input.status }),
    onSuccess: async () => {
      setMessage('Comisión actualizada.');
      await invalidateAll();
    },
    onError: (err) => setMessage((err as Error).message),
  });

  const ruleMutation = useMutation({
    mutationFn: (input: { id?: string; body: Record<string, unknown> }) =>
      input.id
        ? api.patch(`/admin/commission-rules/${input.id}`, input.body)
        : api.post('/admin/commission-rules', input.body),
    onSuccess: async () => {
      setRuleOpen(false);
      setEditingRule(null);
      setMessage('Regla de comisión guardada.');
      await invalidateAll();
    },
    onError: (err) => setMessage((err as Error).message),
  });

  const deleteRule = useMutation({
    mutationFn: (id: string) => api.del(`/admin/commission-rules/${id}`),
    onSuccess: async () => {
      setMessage('Regla eliminada.');
      await invalidateAll();
    },
    onError: (err) => setMessage((err as Error).message),
  });

  if (commissions.isLoading || rules.isLoading) return <Spinner />;
  if (commissions.error) {
    return (
      <ErrorState
        message={(commissions.error as Error).message}
        onRetry={() => void commissions.refetch()}
      />
    );
  }

  const items = commissions.data?.items ?? [];
  const ruleItems = rules.data?.items ?? [];
  const pendingTotal = items
    .filter((c) => c.status === 'pending')
    .reduce((acc, c) => acc + Number(c.commission_amount ?? 0), 0);
  const settledTotal = items
    .filter((c) => c.status === 'settled')
    .reduce((acc, c) => acc + Number(c.commission_amount ?? 0), 0);
  const netTotal = items.reduce((acc, c) => acc + Number(c.net_amount ?? 0), 0);

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Comisiones"
        subtitle="Ingreso propio de acoYAradas! por cada pedido confirmado"
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`btn ${tab === 'registros' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('registros')}
        >
          Registros
        </button>
        <button
          type="button"
          className={`btn ${tab === 'reglas' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('reglas')}
        >
          Reglas
        </button>
      </div>

      {message ? (
        <div className="rounded-xl bg-ink-100 px-4 py-3 text-sm text-ink-700">{message}</div>
      ) : null}

      {tab === 'registros' ? (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <StatCard label="Comisión pendiente" value={formatMoney(pendingTotal)} tone="warn" />
            <StatCard label="Comisión liquidada" value={formatMoney(settledTotal)} tone="brand" />
            <StatCard label="Neto de los comercios" value={formatMoney(netTotal)} />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              className="input w-auto"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              aria-label="Filtrar por estado"
            >
              <option value="">Todos los estados</option>
              <option value="pending">Pendientes</option>
              <option value="settled">Liquidadas</option>
              <option value="waived">Condonadas</option>
            </select>
            <select
              className="input w-auto"
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              aria-label="Filtrar por comercio"
            >
              <option value="">Todos los comercios</option>
              {(stores.data?.items ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {items.length === 0 ? (
            <EmptyState
              title="No hay comisiones registradas"
              description="La comisión se calcula en el servidor al confirmar cada pedido."
            />
          ) : (
            <DataTable
              headers={['Pedido', 'Comercio', 'Bruto', 'Base', 'Comisión', 'Neto', 'Estado', 'Acciones']}
              empty="Sin comisiones."
            >
              {items.map((c) => (
                <tr key={c.id}>
                  <td>
                    <p className="font-mono text-xs font-bold text-ink-900">{c.order_code}</p>
                    <p className="text-xs text-ink-500">{formatDateTime(c.created_at)}</p>
                  </td>
                  <td className="text-xs">{c.store_name}</td>
                  <td className="text-xs">{formatMoney(c.gross_amount)}</td>
                  <td className="text-xs">
                    {formatMoney(c.commission_base)}
                    <p className="text-ink-500">
                      {c.rate_type === 'percent' ? `${c.rate_value}%` : formatMoney(c.rate_value)}
                    </p>
                  </td>
                  <td className="font-semibold text-emerald-700">{formatMoney(c.commission_amount)}</td>
                  <td className="text-xs text-ink-700">{formatMoney(c.net_amount)}</td>
                  <td>
                    <span className={`badge ${STATUS_STYLES[c.status] ?? 'bg-ink-100 text-ink-700'}`}>
                      {STATUS_LABELS[c.status] ?? c.status}
                    </span>
                  </td>
                  <td>
                    {c.status === 'pending' ? (
                      <div className="flex flex-wrap gap-2 text-sm font-medium">
                        <button
                          type="button"
                          className="text-emerald-700 hover:underline"
                          disabled={statusMutation.isPending}
                          onClick={() => statusMutation.mutate({ id: c.id, status: 'settled' })}
                        >
                          Liquidar
                        </button>
                        <button
                          type="button"
                          className="text-ink-600 hover:underline"
                          disabled={statusMutation.isPending}
                          onClick={() => statusMutation.mutate({ id: c.id, status: 'waived' })}
                        >
                          Condonar
                        </button>
                      </div>
                    ) : c.status === 'settled' ? (
                      <button
                        type="button"
                        className="text-sm font-medium text-ink-600 hover:underline"
                        disabled={statusMutation.isPending}
                        onClick={() => statusMutation.mutate({ id: c.id, status: 'pending' })}
                      >
                        Volver a pendiente
                      </button>
                    ) : (
                      <span className="text-xs text-ink-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </div>
      ) : null}

      {tab === 'reglas' ? (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setEditingRule(null);
                setRuleForm({ ...EMPTY_RULE });
                setRuleOpen(true);
              }}
            >
              + Nueva regla
            </button>
          </div>
          <p className="rounded-xl bg-ink-50 p-3 text-xs text-ink-600">
            Una regla sin comercio asignado aplica a todos los comercios. La base puede ser el total
            de productos del pedido o el total del pedido (incluye envío y descuentos).
          </p>
          {ruleItems.length === 0 ? (
            <EmptyState title="No hay reglas de comisión" description="Crea la regla general por defecto." />
          ) : (
            <DataTable
              headers={['Comercio', 'Tipo', 'Valor', 'Base', 'Estado', 'Acciones']}
              empty="Sin reglas."
            >
              {ruleItems.map((rule) => (
                <tr key={rule.id}>
                  <td className="text-xs font-medium text-ink-900">
                    {rule.store_name ?? 'Todos los comercios'}
                  </td>
                  <td className="text-xs">{rule.type === 'percent' ? 'Porcentaje' : 'Importe fijo'}</td>
                  <td className="text-xs">
                    {rule.type === 'percent' ? `${rule.value}%` : formatMoney(rule.value)}
                  </td>
                  <td className="text-xs">
                    {rule.basis === 'product_total' ? 'Total de productos' : 'Total del pedido'}
                  </td>
                  <td>
                    <span
                      className={`badge ${rule.active ? 'bg-emerald-100 text-emerald-800' : 'bg-ink-200 text-ink-600'}`}
                    >
                      {rule.active ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="text-sm font-medium text-brand-600 hover:underline"
                      onClick={() => {
                        setEditingRule(rule);
                        setRuleForm({
                          store_id: rule.store_id ?? '',
                          type: rule.type,
                          value: String(rule.value),
                          basis: rule.basis,
                          active: rule.active,
                        });
                        setRuleOpen(true);
                      }}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="ml-3 text-sm font-medium text-red-600 hover:underline"
                      disabled={deleteRule.isPending}
                      onClick={() => {
                        if (window.confirm('¿Eliminar esta regla de comisión?')) {
                          deleteRule.mutate(rule.id);
                        }
                      }}
                    >
                      Eliminar
                    </button>
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </div>
      ) : null}

      <Modal
        open={ruleOpen}
        title={editingRule ? 'Editar regla de comisión' : 'Nueva regla de comisión'}
        onClose={() => {
          setRuleOpen(false);
          setEditingRule(null);
        }}
        footer={
          <>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setRuleOpen(false);
                setEditingRule(null);
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={ruleMutation.isPending}
              onClick={() =>
                ruleMutation.mutate({
                  id: editingRule?.id,
                  body: {
                    store_id: ruleForm.store_id || null,
                    type: ruleForm.type,
                    value: Number(ruleForm.value || 0),
                    basis: ruleForm.basis,
                    active: ruleForm.active,
                  },
                })
              }
            >
              Guardar
            </button>
          </>
        }
      >
        <Field label="Comercio" hint="Dejalo vacío para aplicar la regla a todos.">
          <select
            className="input"
            value={ruleForm.store_id}
            onChange={(e) => setRuleForm((f) => ({ ...f, store_id: e.target.value }))}
          >
            <option value="">Todos los comercios</option>
            {(stores.data?.items ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tipo">
            <select
              className="input"
              value={ruleForm.type}
              onChange={(e) => setRuleForm((f) => ({ ...f, type: e.target.value as 'percent' | 'fixed' }))}
            >
              <option value="percent">Porcentaje</option>
              <option value="fixed">Importe fijo</option>
            </select>
          </Field>
          <Field label="Valor">
            <input
              type="number"
              min={0}
              step="0.01"
              className="input"
              value={ruleForm.value}
              onChange={(e) => setRuleForm((f) => ({ ...f, value: e.target.value }))}
            />
          </Field>
        </div>
        <Field label="Base de cálculo">
          <select
            className="input"
            value={ruleForm.basis}
            onChange={(e) =>
              setRuleForm((f) => ({ ...f, basis: e.target.value as 'product_total' | 'order_total' }))
            }
          >
            <option value="product_total">Total de productos (sin envío)</option>
            <option value="order_total">Total del pedido (con envío)</option>
          </select>
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={ruleForm.active}
            onChange={(e) => setRuleForm((f) => ({ ...f, active: e.target.checked }))}
          />
          Regla activa
        </label>
      </Modal>
    </div>
  );
}
