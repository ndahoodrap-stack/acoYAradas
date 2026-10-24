import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatDate, formatDateTime, formatMoney } from '../../lib/format';
import { DataTable } from '../../components/PanelShell';
import { EmptyState, ErrorState, Field, Modal, SectionTitle, Spinner } from '../../components/ui';

interface Plan {
  id: string;
  name: string;
  code: string;
  price: number;
  billing_period: 'monthly' | 'yearly';
  product_limit: number;
  promo_limit: number;
  features: string[];
  active: boolean;
}

interface Subscription {
  id: string;
  store_id: string;
  store_name: string;
  plan_name: string;
  plan_code: string;
  plan_price: number;
  status: 'active' | 'past_due' | 'cancelled' | 'expired';
  starts_at: string;
  ends_at: string;
  notes: string | null;
}

interface Payment {
  id: string;
  store_id: string | null;
  store_name: string | null;
  order_id: string | null;
  order_code: string | null;
  subscription_id: string | null;
  kind: 'subscription' | 'advertising' | 'commission' | 'order';
  amount: number;
  method: string | null;
  status: 'pending' | 'confirmed' | 'failed' | 'refunded';
  external_ref: string | null;
  due_at: string | null;
  paid_at: string | null;
  confirmed_at: string | null;
  notes: string | null;
  created_at: string;
}

interface StoreRef {
  id: string;
  name: string;
}

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendiente de verificación',
  confirmed: 'Confirmado',
  failed: 'Fallido',
  refunded: 'Reembolsado',
};

const PAYMENT_STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800',
  confirmed: 'bg-emerald-100 text-emerald-800',
  failed: 'bg-red-100 text-red-800',
  refunded: 'bg-ink-200 text-ink-700',
};

const KIND_LABELS: Record<string, string> = {
  subscription: 'Suscripción',
  advertising: 'Publicidad',
  commission: 'Comisión',
  order: 'Pedido',
};

const EMPTY_PLAN = {
  name: '',
  code: '',
  price: '0',
  billing_period: 'monthly' as 'monthly' | 'yearly',
  product_limit: '20',
  promo_limit: '3',
  features: '',
  active: true,
};

export default function AdminPlans() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'planes' | 'suscripciones' | 'pagos'>('planes');
  const [message, setMessage] = useState<string | null>(null);
  const [paymentStatus, setPaymentStatus] = useState('');
  const [planOpen, setPlanOpen] = useState(false);
  const [planForm, setPlanForm] = useState({ ...EMPTY_PLAN });
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [subOpen, setSubOpen] = useState(false);
  const [subForm, setSubForm] = useState({ store_id: '', plan_id: '', months: '1', notes: '' });

  const plans = useQuery({
    queryKey: ['admin-plans'],
    queryFn: () => api.get<{ items: Plan[] }>('/admin/plans'),
  });

  const subscriptions = useQuery({
    queryKey: ['admin-subscriptions'],
    queryFn: () => api.get<{ items: Subscription[] }>('/admin/subscriptions'),
  });

  const payments = useQuery({
    queryKey: ['admin-payments', paymentStatus],
    queryFn: () =>
      api.get<{ items: Payment[] }>(`/admin/payments?status=${paymentStatus || 'all'}`),
  });

  const stores = useQuery({
    queryKey: ['admin-stores', 'filter'],
    queryFn: () => api.get<{ items: StoreRef[] }>('/admin/stores?status=all'),
  });

  const invalidateAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-plans'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-subscriptions'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-payments'] }),
    ]);
  };

  const planMutation = useMutation({
    mutationFn: (input: { id?: string; body: Record<string, unknown> }) =>
      input.id ? api.patch(`/admin/plans/${input.id}`, input.body) : api.post('/admin/plans', input.body),
    onSuccess: async () => {
      setPlanOpen(false);
      setEditingPlan(null);
      setMessage('Plan guardado.');
      await invalidateAll();
    },
    onError: (err) => setMessage((err as Error).message),
  });

  const subMutation = useMutation({
    mutationFn: () =>
      api.post('/admin/subscriptions', {
        store_id: subForm.store_id,
        plan_id: subForm.plan_id,
        months: Number(subForm.months || 1),
        notes: subForm.notes,
      }),
    onSuccess: async () => {
      setSubOpen(false);
      setSubForm({ store_id: '', plan_id: '', months: '1', notes: '' });
      setMessage('Suscripción creada con su pago pendiente.');
      await invalidateAll();
    },
    onError: (err) => setMessage((err as Error).message),
  });

  const paymentMutation = useMutation({
    mutationFn: (input: { id: string; body: Record<string, unknown> }) =>
      api.patch(`/admin/payments/${input.id}`, input.body),
    onSuccess: async () => {
      setMessage('Pago actualizado.');
      await invalidateAll();
    },
    onError: (err) => setMessage((err as Error).message),
  });

  const deletePlan = useMutation({
    mutationFn: (id: string) => api.del(`/admin/plans/${id}`),
    onSuccess: async () => {
      setMessage('Plan eliminado. Las suscripciones históricas se conservan.');
      await invalidateAll();
    },
    onError: (err) => setMessage((err as Error).message),
  });

  if (plans.isLoading || subscriptions.isLoading || payments.isLoading) return <Spinner />;
  if (plans.error) {
    return <ErrorState message={(plans.error as Error).message} onRetry={() => void plans.refetch()} />;
  }

  const planItems = plans.data?.items ?? [];
  const subItems = subscriptions.data?.items ?? [];
  const paymentItems = payments.data?.items ?? [];
  const pendingPayments = paymentItems.filter((p) => p.status === 'pending');
  const pendingTotal = pendingPayments.reduce((acc, p) => acc + Number(p.amount ?? 0), 0);

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Planes, suscripciones y pagos"
        subtitle="Abonos mensuales y registros de cobro"
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`btn ${tab === 'planes' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('planes')}
        >
          Planes
        </button>
        <button
          type="button"
          className={`btn ${tab === 'suscripciones' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('suscripciones')}
        >
          Suscripciones
        </button>
        <button
          type="button"
          className={`btn ${tab === 'pagos' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('pagos')}
        >
          Pagos
        </button>
      </div>

      {message ? (
        <div className="rounded-xl bg-ink-100 px-4 py-3 text-sm text-ink-700">{message}</div>
      ) : null}

      {tab === 'planes' ? (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                setEditingPlan(null);
                setPlanForm({ ...EMPTY_PLAN });
                setPlanOpen(true);
              }}
            >
              + Nuevo plan
            </button>
          </div>
          {planItems.length === 0 ? (
            <EmptyState title="No hay planes" description="Crea el plan gratuito y los planes pagos." />
          ) : (
            <DataTable
              headers={['Plan', 'Código', 'Precio', 'Período', 'Límites', 'Estado', 'Acciones']}
              empty="Sin planes."
            >
              {planItems.map((plan) => (
                <tr key={plan.id}>
                  <td>
                    <p className="font-medium text-ink-900">{plan.name}</p>
                    {(plan.features ?? []).length ? (
                      <p className="text-xs text-ink-500">{(plan.features ?? []).join(' · ')}</p>
                    ) : null}
                  </td>
                  <td className="font-mono text-xs">{plan.code}</td>
                  <td>{formatMoney(plan.price)}</td>
                  <td className="text-xs">{plan.billing_period === 'yearly' ? 'Anual' : 'Mensual'}</td>
                  <td className="text-xs">
                    {plan.product_limit} productos
                    <p className="text-ink-500">{plan.promo_limit} promociones</p>
                  </td>
                  <td>
                    <span
                      className={`badge ${plan.active ? 'bg-emerald-100 text-emerald-800' : 'bg-ink-200 text-ink-600'}`}
                    >
                      {plan.active ? 'Activo' : 'Inactivo'}
                    </span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="text-sm font-medium text-brand-600 hover:underline"
                      onClick={() => {
                        setEditingPlan(plan);
                        setPlanForm({
                          name: plan.name,
                          code: plan.code,
                          price: String(plan.price),
                          billing_period: plan.billing_period,
                          product_limit: String(plan.product_limit),
                          promo_limit: String(plan.promo_limit),
                          features: (plan.features ?? []).join(', '),
                          active: plan.active,
                        });
                        setPlanOpen(true);
                      }}
                    >
                      Editar
                    </button>
                    <button
                      type="button"
                      className="ml-3 text-sm font-medium text-red-600 hover:underline"
                      disabled={deletePlan.isPending}
                      onClick={() => {
                        if (
                          window.confirm(
                            `¿Eliminar el plan "${plan.name}"? No se puede deshacer. El plan gratuito no se puede eliminar.`,
                          )
                        ) {
                          deletePlan.mutate(plan.id);
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

      {tab === 'suscripciones' ? (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button
              type="button"
              className="btn-primary"
              onClick={() => setSubOpen(true)}
            >
              + Nueva suscripción
            </button>
          </div>
          {subItems.length === 0 ? (
            <EmptyState title="No hay suscripciones" description="Asigná un plan a un comercio." />
          ) : (
            <DataTable
              headers={['Comercio', 'Plan', 'Estado', 'Desde', 'Hasta', 'Precio']}
              empty="Sin suscripciones."
            >
              {subItems.map((sub) => (
                <tr key={sub.id}>
                  <td className="font-medium text-ink-900">{sub.store_name}</td>
                  <td className="text-xs">
                    {sub.plan_name}
                    <p className="text-ink-500">{sub.plan_code}</p>
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        sub.status === 'active'
                          ? 'bg-emerald-100 text-emerald-800'
                          : sub.status === 'past_due'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-ink-200 text-ink-600'
                      }`}
                    >
                      {sub.status}
                    </span>
                  </td>
                  <td className="text-xs">{formatDate(sub.starts_at)}</td>
                  <td className="text-xs">{formatDate(sub.ends_at)}</td>
                  <td>{formatMoney(sub.plan_price)}</td>
                </tr>
              ))}
            </DataTable>
          )}
        </div>
      ) : null}

      {tab === 'pagos' ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="input w-auto"
              value={paymentStatus}
              onChange={(e) => setPaymentStatus(e.target.value)}
              aria-label="Filtrar pagos por estado"
            >
              <option value="">Todos</option>
              <option value="pending">Pendientes</option>
              <option value="confirmed">Confirmados</option>
              <option value="failed">Fallidos</option>
              <option value="refunded">Reembolsados</option>
            </select>
            <p className="text-sm text-ink-500">
              Pendientes: <strong>{pendingPayments.length}</strong> por{' '}
              <strong>{formatMoney(pendingTotal)}</strong>
            </p>
          </div>
          <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
            Un pago sólo se marca como <strong>confirmado</strong> cuando el administrador verifica
            su acreditación (por ejemplo, el comprobante de una transferencia). Hasta entonces queda
            como pendiente y no debe presentarse como cobrado.
          </p>
          {paymentItems.length === 0 ? (
            <EmptyState title="No hay registros de pago" description="No hay pagos con ese filtro." />
          ) : (
            <DataTable
              headers={['Concepto', 'Comercio', 'Monto', 'Método', 'Estado', 'Vence', 'Acciones']}
              empty="Sin pagos."
            >
              {paymentItems.map((p) => (
                <tr key={p.id}>
                  <td>
                    <p className="font-medium text-ink-900">{KIND_LABELS[p.kind] ?? p.kind}</p>
                    {p.order_code ? (
                      <p className="font-mono text-xs text-ink-500">{p.order_code}</p>
                    ) : null}
                    {p.notes ? <p className="text-xs text-ink-500">{p.notes}</p> : null}
                  </td>
                  <td className="text-xs">{p.store_name ?? '—'}</td>
                  <td className="font-semibold text-ink-900">{formatMoney(p.amount)}</td>
                  <td className="text-xs">{p.method ?? '—'}</td>
                  <td>
                    <span className={`badge ${PAYMENT_STATUS_STYLES[p.status]}`}>
                      {PAYMENT_STATUS_LABELS[p.status] ?? p.status}
                    </span>
                    {p.confirmed_at ? (
                      <p className="mt-1 text-[11px] text-ink-500">
                        {formatDateTime(p.confirmed_at)}
                      </p>
                    ) : null}
                  </td>
                  <td className="text-xs">{p.due_at ? formatDate(p.due_at) : '—'}</td>
                  <td>
                    {p.status === 'pending' ? (
                      <button
                        type="button"
                        className="text-sm font-medium text-emerald-700 hover:underline"
                        disabled={paymentMutation.isPending}
                        onClick={() =>
                          paymentMutation.mutate({
                            id: p.id,
                            body: { status: 'confirmed', external_ref: `manual-${Date.now()}` },
                          })
                        }
                      >
                        Verificar y confirmar
                      </button>
                    ) : p.status === 'confirmed' ? (
                      <button
                        type="button"
                        className="text-sm font-medium text-ink-600 hover:underline"
                        disabled={paymentMutation.isPending}
                        onClick={() => paymentMutation.mutate({ id: p.id, body: { status: 'refunded' } })}
                      >
                        Marcar reembolsado
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

      <Modal
        open={planOpen}
        title={editingPlan ? `Editar ${editingPlan.name}` : 'Nuevo plan'}
        onClose={() => {
          setPlanOpen(false);
          setEditingPlan(null);
        }}
        footer={
          <>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setPlanOpen(false);
                setEditingPlan(null);
              }}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={planMutation.isPending}
              onClick={() =>
                planMutation.mutate({
                  id: editingPlan?.id,
                  body: {
                    name: planForm.name,
                    code: planForm.code,
                    price: Number(planForm.price || 0),
                    billing_period: planForm.billing_period,
                    product_limit: Number(planForm.product_limit || 0),
                    promo_limit: Number(planForm.promo_limit || 0),
                    features: planForm.features
                      .split(',')
                      .map((f) => f.trim())
                      .filter(Boolean),
                    active: planForm.active,
                  },
                })
              }
            >
              Guardar
            </button>
          </>
        }
      >
        <Field label="Nombre">
          <input
            className="input"
            value={planForm.name}
            onChange={(e) => setPlanForm((f) => ({ ...f, name: e.target.value }))}
          />
        </Field>
        <Field label="Código" hint="Identificador interno, por ejemplo free o pro.">
          <input
            className="input"
            value={planForm.code}
            onChange={(e) => setPlanForm((f) => ({ ...f, code: e.target.value }))}
          />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Precio (ARS)">
            <input
              type="number"
              min={0}
              step="0.01"
              className="input"
              value={planForm.price}
              onChange={(e) => setPlanForm((f) => ({ ...f, price: e.target.value }))}
            />
          </Field>
          <Field label="Período">
            <select
              className="input"
              value={planForm.billing_period}
              onChange={(e) =>
                setPlanForm((f) => ({ ...f, billing_period: e.target.value as 'monthly' | 'yearly' }))
              }
            >
              <option value="monthly">Mensual</option>
              <option value="yearly">Anual</option>
            </select>
          </Field>
          <Field label="Límite de productos">
            <input
              type="number"
              min={0}
              className="input"
              value={planForm.product_limit}
              onChange={(e) => setPlanForm((f) => ({ ...f, product_limit: e.target.value }))}
            />
          </Field>
          <Field label="Límite de promociones">
            <input
              type="number"
              min={0}
              className="input"
              value={planForm.promo_limit}
              onChange={(e) => setPlanForm((f) => ({ ...f, promo_limit: e.target.value }))}
            />
          </Field>
        </div>
        <Field label="Prestaciones" hint="Separadas por coma.">
          <input
            className="input"
            value={planForm.features}
            onChange={(e) => setPlanForm((f) => ({ ...f, features: e.target.value }))}
          />
        </Field>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={planForm.active}
            onChange={(e) => setPlanForm((f) => ({ ...f, active: e.target.checked }))}
          />
          Plan activo
        </label>
      </Modal>

      <Modal
        open={subOpen}
        title="Nueva suscripción"
        onClose={() => setSubOpen(false)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setSubOpen(false)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={subMutation.isPending || !subForm.store_id || !subForm.plan_id}
              onClick={() => subMutation.mutate()}
            >
              Crear
            </button>
          </>
        }
      >
        <Field label="Comercio">
          <select
            className="input"
            value={subForm.store_id}
            onChange={(e) => setSubForm((f) => ({ ...f, store_id: e.target.value }))}
          >
            <option value="">Seleccionar…</option>
            {(stores.data?.items ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Plan">
          <select
            className="input"
            value={subForm.plan_id}
            onChange={(e) => setSubForm((f) => ({ ...f, plan_id: e.target.value }))}
          >
            <option value="">Seleccionar…</option>
            {planItems.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({formatMoney(p.price)})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Meses" hint="Se ignora si el plan es anual.">
          <input
            type="number"
            min={1}
            className="input"
            value={subForm.months}
            onChange={(e) => setSubForm((f) => ({ ...f, months: e.target.value }))}
          />
        </Field>
        <Field label="Notas">
          <input
            className="input"
            value={subForm.notes}
            onChange={(e) => setSubForm((f) => ({ ...f, notes: e.target.value }))}
          />
        </Field>
        <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
          Al crear la suscripción se genera un pago <strong>pendiente</strong>. No se marca como
          confirmado hasta que verifiques el abono.
        </p>
      </Modal>
    </div>
  );
}
