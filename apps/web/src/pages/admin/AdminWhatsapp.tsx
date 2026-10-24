import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  PLATFORM_COVERAGE_TEXT,
  type WhatsAppOutboxItem,
  type WhatsAppSettings,
} from '@acoyaradas/shared';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { DataTable } from '../../components/PanelShell';
import {
  EmptyState,
  ErrorState,
  Field,
  SectionTitle,
  Spinner,
  StatCard,
} from '../../components/ui';

const EVENT_LABELS: Record<string, string> = {
  new_order: 'Pedido nuevo (encargado, comercio y cliente)',
  confirmed: 'Pedido confirmado',
  preparing: 'En preparación',
  ready: 'Listo para retirar / despachar',
  rider_assigned: 'Repartidor asignado',
  on_the_way: 'En camino',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
  incident: 'Con incidencia',
};

const STATUS_LABELS: Record<string, string> = {
  queued: 'En cola',
  sent: 'Enviado',
  failed: 'Fallido',
  skipped: 'Omitido',
};

interface FormState {
  enabled: boolean;
  owner_phone: string;
  mode: 'links' | 'bridge';
  bridge_url: string;
  bridge_token: string;
  auto_send: boolean;
  auto_open: boolean;
  events: Record<string, boolean>;
}

const EMPTY_FORM: FormState = {
  enabled: true,
  owner_phone: '',
  mode: 'links',
  bridge_url: '',
  bridge_token: '',
  auto_send: false,
  auto_open: true,
  events: {},
};

export default function AdminWhatsapp() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [message, setMessage] = useState<string | null>(null);
  const [testPhone, setTestPhone] = useState('');
  const [testText, setTestText] = useState('');

  const status = useQuery({
    queryKey: ['whatsapp-status'],
    queryFn: () => api.get<WhatsAppSettings>('/whatsapp/status'),
  });

  const outbox = useQuery({
    queryKey: ['whatsapp-outbox'],
    queryFn: () => api.get<{ items: WhatsAppOutboxItem[] }>('/whatsapp/outbox'),
  });

  useEffect(() => {
    if (!status.data) return;
    setForm({
      enabled: status.data.enabled,
      owner_phone: status.data.owner_phone ?? '',
      mode: status.data.mode,
      bridge_url: '',
      bridge_token: '',
      auto_send: status.data.auto_send,
      auto_open: status.data.auto_open,
      events: status.data.events ?? {},
    });
    if (status.data.owner_phone) setTestPhone(status.data.owner_phone);
  }, [status.data]);

  const save = useMutation({
    mutationFn: (input: Record<string, unknown>) => api.patch('/whatsapp/settings', input),
    onSuccess: async () => {
      setMessage('Configuración de WhatsApp guardada.');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['whatsapp-status'] }),
        queryClient.invalidateQueries({ queryKey: ['whatsapp-outbox'] }),
      ]);
    },
    onError: (err) => setMessage((err as Error).message),
  });

  const test = useMutation({
    mutationFn: (input: { phone: string; message?: string }) =>
      api.post<{ ok: boolean; error: string | null }>('/whatsapp/test', input),
    onSuccess: (result) => {
      setMessage(
        result.ok
          ? 'Mensaje de prueba enviado a través del puente.'
          : `No se pudo enviar: ${result.error ?? 'revisá la configuración'}.`,
      );
    },
    onError: (err) => setMessage((err as Error).message),
  });

  const markSent = useMutation({
    mutationFn: (id: string) => api.post(`/whatsapp/outbox/${id}/sent`, {}),
    onSuccess: async () => {
      setMessage('Mensaje marcado como enviado.');
      await queryClient.invalidateQueries({ queryKey: ['whatsapp-outbox'] });
    },
    onError: (err) => setMessage((err as Error).message),
  });

  const resend = useMutation({
    mutationFn: (id: string) => api.post<{ ok: boolean; error: string | null }>(`/whatsapp/outbox/${id}/send`, {}),
    onSuccess: async (result) => {
      setMessage(result.ok ? 'Mensaje reenviado por el puente.' : `Falló el envío: ${result.error ?? 'sin detalle'}`);
      await queryClient.invalidateQueries({ queryKey: ['whatsapp-outbox'] });
    },
    onError: (err) => setMessage((err as Error).message),
  });

  if (status.isLoading) return <Spinner />;
  if (status.error) {
    return (
      <ErrorState message={(status.error as Error).message} onRetry={() => void status.refetch()} />
    );
  }

  const items = outbox.data?.items ?? [];
  const queued = items.filter((item) => item.status === 'queued').length;
  const sent = items.filter((item) => item.status === 'sent').length;
  const failed = items.filter((item) => item.status === 'failed').length;
  const bridgeOn = form.mode === 'bridge';

  const submit = () => {
    const payload: Record<string, unknown> = {
      enabled: form.enabled,
      owner_phone: form.owner_phone.trim() || null,
      mode: form.mode,
      auto_send: form.auto_send,
      auto_open: form.auto_open,
      events: form.events,
    };
    // Sólo se envían si el administrador escribió algo, para no borrar los
    // valores guardados al editar otros campos.
    if (form.bridge_url.trim()) payload.bridge_url = form.bridge_url.trim();
    if (form.bridge_token.trim()) payload.bridge_token = form.bridge_token.trim();
    save.mutate(payload);
  };

  return (
    <div className="space-y-5">
      <SectionTitle
        title="WhatsApp del encargado"
        subtitle={`Todos los avisos de ${PLATFORM_COVERAGE_TEXT} salen desde tu propio WhatsApp`}
      />

      {message ? (
        <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-900">{message}</div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Modo"
          value={bridgeOn ? 'Puente automático' : 'Enlaces wa.me'}
          hint={bridgeOn ? 'Envío desde el número conectado' : 'Abre WhatsApp Desktop con el texto'}
          tone="brand"
        />
        <StatCard label="En cola" value={queued} hint="Esperando apertura o envío" tone={queued ? 'warn' : 'default'} />
        <StatCard label="Enviados" value={sent} tone="brand" />
        <StatCard label="Fallidos" value={failed} tone={failed ? 'danger' : 'default'} />
      </div>

      <div className="card space-y-4 p-5">
        <div>
          <h3 className="text-base font-bold text-ink-900">Cómo funciona</h3>
          <p className="mt-1 text-sm text-ink-600">
            Con el modo <strong>enlaces</strong>, el panel arma el mensaje y abre WhatsApp Desktop
            (o Web) con el chat y el texto cargados. Es la opción más simple y no requiere instalar
            nada. Con el <strong>puente</strong> opcional, un programa local
            (<code>tools/whatsapp-bridge</code>) mantiene WhatsApp Web conectado y envía solo.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Número del dueño / encargado" hint="Recibe todos los pedidos nuevos. Ej.: +54 9 2284 55-5555">
            <input
              className="input"
              value={form.owner_phone}
              onChange={(e) => setForm((f) => ({ ...f, owner_phone: e.target.value }))}
              placeholder="+54 9 2284 55-5555"
            />
          </Field>
          <Field label="Modo de envío">
            <select
              className="input"
              value={form.mode}
              onChange={(e) => setForm((f) => ({ ...f, mode: e.target.value as 'links' | 'bridge' }))}
            >
              <option value="links">Enlaces wa.me (abre WhatsApp Desktop)</option>
              <option value="bridge">Puente automático (whatsapp-web.js)</option>
            </select>
          </Field>
        </div>

        {bridgeOn ? (
          <div className="grid gap-4 rounded-xl bg-ink-50 p-4 sm:grid-cols-2">
            <Field
              label="URL del puente"
              hint={
                status.data?.bridge_configured
                  ? 'Ya hay una URL guardada. Dejala vacía para conservarla.'
                  : 'Por defecto: http://127.0.0.1:3010/send'
              }
            >
              <input
                className="input"
                value={form.bridge_url}
                onChange={(e) => setForm((f) => ({ ...f, bridge_url: e.target.value }))}
                placeholder="http://127.0.0.1:3010/send"
              />
            </Field>
            <Field label="Token del puente" hint="Dejalo vacío para conservar el token actual.">
              <input
                className="input"
                type="password"
                value={form.bridge_token}
                onChange={(e) => setForm((f) => ({ ...f, bridge_token: e.target.value }))}
                placeholder="••••••••"
              />
            </Field>
          </div>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-start gap-3 rounded-xl border border-ink-200 p-3">
            <input
              type="checkbox"
              className="mt-1"
              checked={form.enabled}
              onChange={(e) => setForm((f) => ({ ...f, enabled: e.target.checked }))}
            />
            <span>
              <span className="block text-sm font-semibold text-ink-900">WhatsApp habilitado</span>
              <span className="text-xs text-ink-500">
                Si lo apagás, no se registran ni abren mensajes automáticos.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-xl border border-ink-200 p-3">
            <input
              type="checkbox"
              className="mt-1"
              checked={form.auto_open}
              onChange={(e) => setForm((f) => ({ ...f, auto_open: e.target.checked }))}
            />
            <span>
              <span className="block text-sm font-semibold text-ink-900">
                Abrir el chat al asignar un repartidor
              </span>
              <span className="text-xs text-ink-500">
                Al confirmar la asignación se abre WhatsApp con todos los datos.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-3 rounded-xl border border-ink-200 p-3">
            <input
              type="checkbox"
              className="mt-1"
              checked={form.auto_send}
              onChange={(e) => setForm((f) => ({ ...f, auto_send: e.target.checked }))}
            />
            <span>
              <span className="block text-sm font-semibold text-ink-900">
                Enviar automáticamente por el puente
              </span>
              <span className="text-xs text-ink-500">
                Sólo tiene efecto en modo puente. Requiere el programa local conectado.
              </span>
            </span>
          </label>
        </div>

        <div>
          <h4 className="text-sm font-bold text-ink-900">Avisos que se generan</h4>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {Object.entries(EVENT_LABELS).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm text-ink-700">
                <input
                  type="checkbox"
                  checked={form.events[key] ?? true}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, events: { ...f.events, [key]: e.target.checked } }))
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <div className="flex justify-end">
          <button type="button" className="btn-primary" disabled={save.isPending} onClick={submit}>
            {save.isPending ? 'Guardando…' : 'Guardar configuración'}
          </button>
        </div>
      </div>

      <div className="card space-y-3 p-5">
        <h3 className="text-base font-bold text-ink-900">Probar el envío</h3>
        <p className="text-sm text-ink-600">
          En modo enlaces, el botón arma el texto para que lo envíes desde WhatsApp Desktop. En modo
          puente, se envía directamente.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Teléfono de prueba">
            <input
              className="input"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="+54 9 2284 55-5555"
            />
          </Field>
          <Field label="Mensaje (opcional)">
            <input
              className="input"
              value={testText}
              onChange={(e) => setTestText(e.target.value)}
              placeholder="Prueba de acoYAradas!"
            />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary"
            disabled={!testPhone.trim() || test.isPending}
            onClick={() => test.mutate({ phone: testPhone.trim(), message: testText.trim() || undefined })}
          >
            {test.isPending ? 'Enviando…' : 'Enviar prueba'}
          </button>
          <a
            className="btn-whatsapp"
            href={`https://wa.me/${testPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
              testText.trim() || 'Prueba de WhatsApp desde acoYAradas!',
            )}`}
            target="_blank"
            rel="noreferrer"
          >
            💬 Abrir chat de prueba
          </a>
        </div>
      </div>

      <div>
        <SectionTitle
          title="Bandeja de salida"
          subtitle="Últimos mensajes generados por la plataforma"
          action={
            <button
              type="button"
              className="btn-secondary"
              onClick={() => void outbox.refetch()}
            >
              Actualizar
            </button>
          }
        />
        {items.length === 0 ? (
          <EmptyState
            title="Todavía no hay mensajes"
            description="Cuando se cree o actualice un pedido, acá vas a ver el mensaje y su estado."
          />
        ) : (
          <DataTable headers={['Pedido', 'Plantilla', 'Destino', 'Estado', 'Fecha', 'Acciones']}>
            {items.map((item) => (
              <tr key={item.id}>
                <td className="font-mono text-xs font-semibold text-ink-900">
                  {item.order_code ?? '—'}
                </td>
                <td className="text-xs">{item.template}</td>
                <td className="text-xs">{item.phone ?? '—'}</td>
                <td>
                  <span
                    className={`badge ${
                      item.status === 'sent'
                        ? 'bg-emerald-100 text-emerald-800'
                        : item.status === 'failed'
                          ? 'bg-red-100 text-red-800'
                          : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {STATUS_LABELS[item.status] ?? item.status}
                  </span>
                  {item.error ? <p className="mt-1 text-[11px] text-red-600">{item.error}</p> : null}
                </td>
                <td className="text-xs text-ink-500">{formatDateTime(item.created_at)}</td>
                <td>
                  <div className="flex flex-wrap gap-2 text-sm font-medium">
                    {item.link ? (
                      <a
                        className="text-brand-600 hover:underline"
                        href={item.link}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Abrir
                      </a>
                    ) : null}
                    {item.status !== 'sent' ? (
                      <button
                        type="button"
                        className="text-ink-600 hover:underline"
                        disabled={markSent.isPending}
                        onClick={() => markSent.mutate(item.id)}
                      >
                        Marcar enviado
                      </button>
                    ) : null}
                    {bridgeOn && item.status !== 'sent' ? (
                      <button
                        type="button"
                        className="text-indigo-700 hover:underline"
                        disabled={resend.isPending}
                        onClick={() => resend.mutate(item.id)}
                      >
                        Reenviar
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </div>
    </div>
  );
}
