import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { formatDateTime } from '../../lib/format';
import { DataTable } from '../../components/PanelShell';
import { EmptyState, ErrorState, Field, Modal, SectionTitle, Spinner } from '../../components/ui';

interface SettingRow {
  key: string;
  value: unknown;
  updated_at: string;
}

interface LegalPage {
  id: string;
  slug: string;
  title: string;
  body: string;
  updated_at: string;
}

const SETTING_LABELS: Record<string, string> = {
  contact: 'Datos de contacto',
  coverage: 'Cobertura y zonas',
  hours: 'Horarios de atención',
  social: 'Redes sociales',
  features: 'Funcionalidades habilitadas',
  payment_methods: 'Métodos de pago',
  legal_note: 'Aviso legal',
};

export default function AdminSettings() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'config' | 'legales'>('config');
  const [message, setMessage] = useState<string | null>(null);
  const [editing, setEditing] = useState<SettingRow | null>(null);
  const [rawValue, setRawValue] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [legal, setLegal] = useState<LegalPage | null>(null);
  const [legalForm, setLegalForm] = useState({ title: '', body: '' });

  const settings = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => api.get<{ items: SettingRow[] }>('/admin/settings'),
  });

  const legalPages = useQuery({
    queryKey: ['admin-legal-pages'],
    queryFn: () => api.get<{ items: LegalPage[] }>('/admin/legal-pages'),
  });

  useEffect(() => {
    if (editing) {
      setRawValue(JSON.stringify(editing.value, null, 2));
      setParseError(null);
    }
  }, [editing]);

  const saveSetting = useMutation({
    mutationFn: (input: { key: string; value: unknown }) =>
      api.patch(`/admin/settings/${encodeURIComponent(input.key)}`, { value: input.value }),
    onSuccess: async () => {
      setEditing(null);
      setMessage('Configuración guardada.');
      await queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
      await queryClient.invalidateQueries({ queryKey: ['home'] });
      await queryClient.invalidateQueries({ queryKey: ['platform-settings'] });
    },
    onError: (err) => setMessage((err as Error).message),
  });

  const saveLegal = useMutation({
    mutationFn: (input: { slug: string; title: string; body: string }) =>
      api.patch(`/admin/legal-pages/${input.slug}`, { title: input.title, body: input.body }),
    onSuccess: async () => {
      setLegal(null);
      setMessage('Página legal guardada.');
      await queryClient.invalidateQueries({ queryKey: ['admin-legal-pages'] });
      await queryClient.invalidateQueries({ queryKey: ['home'] });
    },
    onError: (err) => setMessage((err as Error).message),
  });

  if (settings.isLoading || legalPages.isLoading) return <Spinner />;
  if (settings.error) {
    return (
      <ErrorState message={(settings.error as Error).message} onRetry={() => void settings.refetch()} />
    );
  }

  const settingRows = settings.data?.items ?? [];
  const legalRows = legalPages.data?.items ?? [];

  return (
    <div className="space-y-4">
      <SectionTitle
        title="Configuración de la plataforma"
        subtitle="Datos públicos, funcionalidades y textos legales"
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={`btn ${tab === 'config' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('config')}
        >
          Parámetros
        </button>
        <button
          type="button"
          className={`btn ${tab === 'legales' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => setTab('legales')}
        >
          Páginas legales
        </button>
      </div>

      {message ? (
        <div className="rounded-xl bg-ink-100 px-4 py-3 text-sm text-ink-700">{message}</div>
      ) : null}

      {tab === 'config' ? (
        settingRows.length === 0 ? (
          <EmptyState title="Sin configuración" description="No hay parámetros cargados." />
        ) : (
          <DataTable headers={['Clave', 'Descripción', 'Actualizado', 'Acciones']} empty="Sin parámetros.">
            {settingRows.map((row) => (
              <tr key={row.key}>
                <td className="font-mono text-xs font-semibold text-ink-900">{row.key}</td>
                <td className="text-xs">{SETTING_LABELS[row.key] ?? '—'}</td>
                <td className="text-xs text-ink-500">{formatDateTime(row.updated_at)}</td>
                <td>
                  <button
                    type="button"
                    className="text-sm font-medium text-brand-600 hover:underline"
                    onClick={() => setEditing(row)}
                  >
                    Editar
                  </button>
                </td>
              </tr>
            ))}
          </DataTable>
        )
      ) : null}

      {tab === 'legales' ? (
        <div className="space-y-3">
          <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">
            Los textos legales son editables pero <strong>no implican cumplimiento normativo</strong>.
            Antes de operar comercialmente en Argentina deben ser revisados por un profesional legal
            y adaptados a la normativa aplicable (Ley 25.326 de Protección de Datos Personales,
            Ley 27.286 de Defensa del Consumidor, AFIP/ARCA, condiciones de la cuenta de cobro y
            normativa provincial de comercio).
          </p>
          {legalRows.length === 0 ? (
            <EmptyState title="Sin páginas legales" description="No hay páginas cargadas." />
          ) : (
            <DataTable headers={['Página', 'Slug', 'Actualizado', 'Acciones']} empty="Sin páginas.">
              {legalRows.map((page) => (
                <tr key={page.id}>
                  <td className="font-medium text-ink-900">{page.title}</td>
                  <td className="font-mono text-xs text-ink-500">{page.slug}</td>
                  <td className="text-xs text-ink-500">{formatDateTime(page.updated_at)}</td>
                  <td>
                    <button
                      type="button"
                      className="text-sm font-medium text-brand-600 hover:underline"
                      onClick={() => {
                        setLegal(page);
                        setLegalForm({ title: page.title, body: page.body });
                      }}
                    >
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </DataTable>
          )}
        </div>
      ) : null}

      <Modal
        open={editing !== null}
        title={`Editar ${editing?.key ?? ''}`}
        onClose={() => setEditing(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setEditing(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={saveSetting.isPending}
              onClick={() => {
                if (!editing) return;
                let parsed: unknown;
                try {
                  parsed = JSON.parse(rawValue);
                } catch {
                  setParseError('El valor no es un JSON válido.');
                  return;
                }
                setParseError(null);
                saveSetting.mutate({ key: editing.key, value: parsed });
              }}
            >
              Guardar
            </button>
          </>
        }
      >
        <p className="text-sm text-ink-600">
          El valor se guarda como JSON. Un ejemplo de &laquo;contact»:
        </p>
        <pre className="overflow-auto rounded-xl bg-ink-900 p-3 text-xs text-ink-100">
{`{
  "email": "contacto@acoyaradas.app",
  "phone": "+54 9 11 0000-0000"
}`}
        </pre>
        <Field label="Valor (JSON)" error={parseError ?? undefined}>
          <textarea
            rows={12}
            className="input font-mono text-xs"
            value={rawValue}
            onChange={(e) => {
              setRawValue(e.target.value);
              setParseError(null);
            }}
          />
        </Field>
      </Modal>

      <Modal
        open={legal !== null}
        title={`Editar ${legal?.title ?? ''}`}
        onClose={() => setLegal(null)}
        footer={
          <>
            <button type="button" className="btn-secondary" onClick={() => setLegal(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn-primary"
              disabled={saveLegal.isPending}
              onClick={() =>
                legal && saveLegal.mutate({ slug: legal.slug, ...legalForm })
              }
            >
              Guardar
            </button>
          </>
        }
      >
        <Field label="Título">
          <input
            className="input"
            value={legalForm.title}
            onChange={(e) => setLegalForm((f) => ({ ...f, title: e.target.value }))}
          />
        </Field>
        <Field label="Contenido" hint="Texto plano. Se muestra en /legal/:slug">
          <textarea
            rows={14}
            className="input text-sm"
            value={legalForm.body}
            onChange={(e) => setLegalForm((f) => ({ ...f, body: e.target.value }))}
          />
        </Field>
      </Modal>
    </div>
  );
}
