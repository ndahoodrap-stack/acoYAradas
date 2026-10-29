import type { Database } from '../db/index.js';
import { config } from '../config.js';
import {
  buildOrderMessage,
  canWhatsApp,
  whatsappAppLink,
  whatsappLink,
  type WhatsAppMessageKind,
  type WhatsAppOrderInfo,
  type WhatsAppRecipient,
} from '@acoyaradas/shared';

/**
 * WhatsApp de acoYAradas!
 *
 * La plataforma no depende de la API de Meta: genera enlaces `wa.me` que
 * abren WhatsApp Desktop con el chat y el mensaje ya escritos. Si además se
 * configura el puente local (`tools/whatsapp-bridge`, whatsapp-web.js), los
 * mensajes se envían solos desde el número propio del encargado.
 */

export interface WhatsAppConfig {
  enabled: boolean;
  owner_phone: string | null;
  mode: 'links' | 'bridge';
  bridge_url: string | null;
  bridge_token: string | null;
  auto_send: boolean;
  auto_open: boolean;
  events: Record<string, boolean>;
}

const DEFAULT_EVENTS: Record<string, boolean> = {
  new_order: true,
  confirmed: true,
  preparing: true,
  ready: true,
  rider_assigned: true,
  on_the_way: true,
  delivered: true,
  cancelled: true,
  incident: true,
};

const SETTINGS_KEY = 'whatsapp';

function asBool(value: unknown, fallback: boolean): boolean {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  return Boolean(value);
}

/** Lee la configuración de WhatsApp desde `settings.whatsapp` + variables de entorno. */
export async function getWhatsAppConfig(db: Database): Promise<WhatsAppConfig> {
  let value: Record<string, unknown> = {};
  try {
    const { rows } = await db.system.query<{ value: Record<string, unknown> }>(
      'select value from public.settings where key = $1',
      [SETTINGS_KEY],
    );
    value = rows[0]?.value ?? {};
  } catch {
    value = {};
  }

  const envMode = config.whatsappProvider === 'none' ? 'links' : (config.whatsappProvider as 'links' | 'bridge');
  const mode = (String(value.mode ?? envMode) === 'bridge' ? 'bridge' : 'links') as 'links' | 'bridge';
  const bridgeUrl = String(value.bridge_url ?? config.whatsappWebhookUrl ?? '').trim() || null;
  const bridgeToken = String(value.bridge_token ?? config.whatsappWebhookToken ?? '').trim() || null;
  const ownerPhone = String(value.owner_phone ?? config.whatsappOwnerPhone ?? '').trim() || null;

  return {
    enabled: asBool(value.enabled, true),
    owner_phone: ownerPhone,
    mode,
    bridge_url: bridgeUrl,
    bridge_token: bridgeToken,
    auto_send: asBool(value.auto_send, config.whatsappAutoSend),
    auto_open: asBool(value.auto_open, config.whatsappAutoOpen),
    events: { ...DEFAULT_EVENTS, ...((value.events as Record<string, boolean>) ?? {}) },
  };
}

export function whatsappEventEnabled(settings: WhatsAppConfig, event: string): boolean {
  return settings.enabled && (settings.events[event] ?? true);
}

/** Datos de un pedido necesarios para armar los mensajes. */
export interface OrderMessageSource {
  code: string;
  public_token?: string | null;
  store_name: string;
  store_phone?: string | null;
  store_whatsapp?: string | null;
  store_address?: string | null;
  customer_name: string;
  phone: string;
  address?: string | null;
  locality?: string | null;
  references?: string | null;
  notes?: string | null;
  fulfillment_type: 'delivery' | 'pickup';
  delivery_mode: 'platform' | 'merchant';
  payment_method: string;
  total: number;
  shipping_cost?: number;
  rider_name?: string | null;
  rider_phone?: string | null;
  status?: string | null;
  merchant_responsible?: string | null;
  estimated_preparation_minutes?: number | null;
  items: { name_snapshot: string; quantity: number; line_total: number; notes?: string | null }[];
}

function toOrderInfo(source: OrderMessageSource): WhatsAppOrderInfo {
  return {
    code: source.code,
    public_token: source.public_token,
    store_name: source.store_name,
    store_phone: source.store_phone,
    store_address: source.store_address,
    customer_name: source.customer_name,
    phone: source.phone,
    address: source.address,
    locality: source.locality,
    references: source.references,
    notes: source.notes,
    fulfillment_type: source.fulfillment_type,
    delivery_mode: source.delivery_mode,
    payment_method: source.payment_method,
    total: Number(source.total),
    shipping_cost: source.shipping_cost,
    rider_name: source.rider_name,
    rider_phone: source.rider_phone,
    status: source.status,
    merchant_responsible: source.merchant_responsible,
    prepared_minutes: source.estimated_preparation_minutes,
    items: source.items.map((item) => ({
      name: item.name_snapshot,
      quantity: Number(item.quantity),
      line_total: Number(item.line_total),
      notes: item.notes,
    })),
  };
}

export function trackingUrl(source: OrderMessageSource): string | null {
  if (!source.public_token) return null;
  return `${config.publicBaseUrl}/seguimiento/${encodeURIComponent(source.code)}?token=${encodeURIComponent(source.public_token)}`;
}

export interface WhatsAppTarget {
  recipient: WhatsAppRecipient;
  kind: WhatsAppMessageKind;
  label: string;
  name: string;
  phone: string;
  text: string;
  link: string;
  app_link: string;
}

/**
 * Genera los mensajes para los cuatro destinatarios posibles de un pedido.
 * Sólo devuelve los que tienen un teléfono utilizable.
 */
export function buildOrderTargets(
  source: OrderMessageSource,
  options: {
    ownerPhone?: string | null;
    ownerName?: string | null;
    storePhone?: string | null;
    riderPhone?: string | null;
    riderName?: string | null;
    statusNote?: string | null;
  } = {},
): WhatsAppTarget[] {
  const info = toOrderInfo(source);
  const panelUrl = `${config.publicBaseUrl}/admin/pedidos`;
  const tracking = trackingUrl(source);
  const targets: WhatsAppTarget[] = [];

  const push = (
    recipient: WhatsAppRecipient,
    kind: WhatsAppMessageKind,
    label: string,
    name: string,
    phone: string | null | undefined,
  ) => {
    if (!canWhatsApp(phone)) return;
    const text = buildOrderMessage(kind, info, {
      statusNote: options.statusNote,
      trackingUrl: tracking,
      panelUrl: recipient === 'owner' ? panelUrl : null,
      locality: config.platform.city,
      imageBaseUrl: config.publicBaseUrl,
    });
    targets.push({
      recipient,
      kind,
      label,
      name,
      phone: String(phone),
      text,
      link: whatsappLink(phone, text),
      app_link: whatsappAppLink(phone, text),
    });
  };

  push(
    'owner',
    'owner_new_order',
    'Encargado',
    options.ownerName ?? 'acoYAradas!',
    options.ownerPhone,
  );
  push(
    'store',
    source.fulfillment_type === 'delivery' && source.delivery_mode === 'platform'
      ? 'store_pickup_request'
      : 'store_new_order',
    'Comercio',
    source.store_name,
    options.storePhone ?? source.store_whatsapp ?? source.store_phone,
  );
  if (source.delivery_mode === 'platform' || source.rider_name) {
    push('rider', 'rider_assignment', 'Repartidor', options.riderName ?? source.rider_name ?? 'Repartidor', options.riderPhone ?? source.rider_phone);
  }
  push(
    'customer',
    source.status && source.status !== 'pending_confirmation' ? 'customer_status' : 'customer_created',
    'Cliente',
    source.customer_name,
    source.phone,
  );

  // Evita duplicados si el comercio usa el mismo número que el encargado.
  const seen = new Set<string>();
  return targets.filter((target) => {
    const digits = target.phone.replace(/\D/g, '');
    if (seen.has(digits)) return false;
    seen.add(digits);
    return true;
  });
}

export interface WhatsAppLogInput {
  template: string;
  phone: string;
  text: string;
  order_id?: string | null;
  user_id?: string | null;
  store_id?: string | null;
  rider_id?: string | null;
  recipient?: WhatsAppRecipient;
  name?: string;
}

export interface WhatsAppLogResult {
  id: string;
  status: string;
  link: string | null;
}

/**
 * Registra los mensajes en la tabla `notifications` (canal whatsapp) y, si
 * el puente está configurado con envío automático, los envía.
 * Usa el contexto `system` porque las notificaciones del encargado no
 * dependen de un perfil de usuario.
 */
export async function logWhatsAppMessages(
  db: Database,
  inputs: WhatsAppLogInput[],
): Promise<WhatsAppLogResult[]> {
  if (!inputs.length) return [];
  const settings = await getWhatsAppConfig(db);
  const results: WhatsAppLogResult[] = [];

  for (const input of inputs) {
    if (!settings.enabled) {
      results.push({ id: '', status: 'skipped', link: null });
      continue;
    }
    const link = whatsappLink(input.phone, input.text);
    const payload = {
      phone: input.phone,
      text: input.text,
      link,
      recipient: input.recipient ?? null,
      name: input.name ?? null,
    };

    const inserted = await db.system.query<{ id: string }>(
      `insert into public.notifications
         (user_id, store_id, rider_id, order_id, channel, template, payload, status, error)
       values ($1,$2,$3,$4,'whatsapp',$5,$6::jsonb,'queued',null)
       returning id`,
      [
        input.user_id ?? null,
        input.store_id ?? null,
        input.rider_id ?? null,
        input.order_id ?? null,
        input.template,
        JSON.stringify(payload),
      ],
    );
    const id = inserted.rows[0].id;

    if (settings.mode === 'bridge' && settings.auto_send && settings.bridge_url) {
      const mediaUrl = getWhatsAppImageUrl(input.template as any, config.publicBaseUrl);
      const result = await sendThroughBridge(settings, input.phone, input.text, mediaUrl);
      await db.system.query(
        `update public.notifications
            set status = $2, attempts = attempts + 1, error = $3, sent_at = case when $2 = 'sent' then now() else null end
          where id = $1`,
        [id, result.ok ? 'sent' : 'failed', result.ok ? null : result.error],
      );
      results.push({ id, status: result.ok ? 'sent' : 'failed', link });
    } else {
      results.push({ id, status: 'queued', link });
    }
  }

  return results;
}

/** Envía un mensaje a través del puente local (whatsapp-web.js). */
export async function sendThroughBridge(
  settings: WhatsAppConfig,
  phone: string,
  text: string,
  mediaUrl?: string | null,
): Promise<{ ok: boolean; error: string | null }> {
  if (!settings.bridge_url) return { ok: false, error: 'Puente de WhatsApp no configurado' };
  try {
    const res = await fetch(settings.bridge_url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(settings.bridge_token ? { authorization: `Bearer ${settings.bridge_token}` } : {}),
      },
      body: JSON.stringify({ phone, message: text, mediaUrl }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { ok: false, error: `HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ''}` };
    }
    return { ok: true, error: null };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

/** Datos completos de un pedido para armar mensajes (contexto interno). */
export type OrderMessageSourceFull = OrderMessageSource & {
  id: string;
  store_id: string;
  customer_id?: string | null;
  rider_id?: string | null;
};

/** Carga el pedido con sus ítems desde la base (contexto interno). */
export async function loadOrderMessageSource(
  db: Database,
  orderId: string,
): Promise<OrderMessageSourceFull | null> {
  const { rows } = await db.system.query<any>(
    `select o.id, o.code, o.public_token, o.store_id, o.customer_id, o.customer_name, o.phone,
            o.address, o.locality, o.reference_notes, o.notes, o.fulfillment_type, o.delivery_mode,
            o.status, o.total, o.shipping_cost, o.payment_method, o.rider_id, o.merchant_responsible,
            o.estimated_preparation_minutes,
            s.name as store_name, s.phone as store_phone, s.whatsapp as store_whatsapp,
            s.address as store_address,
            r.full_name as rider_name, r.phone as rider_phone
       from public.orders o
       join public.stores s on s.id = o.store_id
       left join public.riders r on r.id = o.rider_id
      where o.id = $1`,
    [orderId],
  );
  if (!rows.length) return null;
  const row = rows[0];
  const items = await db.system.query<any>(
    'select name_snapshot, quantity, line_total, notes from public.order_items where order_id = $1 order by id',
    [orderId],
  );
  return {
    id: row.id,
    store_id: row.store_id,
    customer_id: row.customer_id,
    rider_id: row.rider_id,
    code: row.code,
    public_token: row.public_token,
    store_name: row.store_name,
    store_phone: row.store_phone,
    store_whatsapp: row.store_whatsapp,
    store_address: row.store_address,
    customer_name: row.customer_name,
    phone: row.phone,
    address: row.address,
    locality: row.locality,
    references: row.reference_notes,
    notes: row.notes,
    fulfillment_type: row.fulfillment_type,
    delivery_mode: row.delivery_mode,
    payment_method: row.payment_method,
    total: Number(row.total),
    shipping_cost: Number(row.shipping_cost ?? 0),
    rider_name: row.rider_name,
    rider_phone: row.rider_phone,
    status: row.status,
    merchant_responsible: row.merchant_responsible,
    estimated_preparation_minutes: row.estimated_preparation_minutes,
    items: items.rows,
  };
}

/** Avisa por WhatsApp un cambio de estado de un pedido (por defecto al cliente). */
export async function notifyOrderStatusWhatsApp(
  db: Database,
  orderId: string,
  options: {
    recipients?: WhatsAppRecipient[];
    statusNote?: string | null;
    ownerName?: string | null;
    ownerPhone?: string | null;
    riderName?: string | null;
    riderPhone?: string | null;
    storePhone?: string | null;
  } = {},
): Promise<WhatsAppLogResult[]> {
  const source = await loadOrderMessageSource(db, orderId);
  if (!source) return [];
  const settings = await getWhatsAppConfig(db);
  const event = source.status ?? '';
  if (!whatsappEventEnabled(settings, event)) return [];
  return notifyOrderWhatsApp(db, source, {
    recipients: options.recipients ?? ['customer'],
    statusNote: options.statusNote,
    ownerName: options.ownerName,
    ownerPhone: options.ownerPhone ?? settings.owner_phone,
    storeId: source.store_id,
    riderId: source.rider_id,
  });
}

/** Atajo: arma y registra los mensajes de un pedido para sus destinatarios. */
export async function notifyOrderWhatsApp(
  db: Database,
  source: OrderMessageSource,
  options: {
    recipients?: WhatsAppRecipient[];
    statusNote?: string | null;
    ownerName?: string | null;
    ownerPhone?: string | null;
    storeId?: string | null;
    riderId?: string | null;
  } = {},
): Promise<WhatsAppLogResult[]> {
  const settings = await getWhatsAppConfig(db);
  if (!settings.enabled) return [];
  const targets = buildOrderTargets(source, {
    ownerPhone: options.ownerPhone ?? settings.owner_phone,
    ownerName: options.ownerName,
    statusNote: options.statusNote,
  });
  const allowed = options.recipients ? new Set(options.recipients) : null;
  const selected = allowed ? targets.filter((target) => allowed.has(target.recipient)) : targets;

  return logWhatsAppMessages(
    db,
    selected.map((target) => ({
      template: target.kind,
      phone: target.phone,
      text: target.text,
      recipient: target.recipient,
      name: target.name,
      order_id: (source as { id?: string }).id ?? null,
      user_id: (source as { customer_id?: string | null }).customer_id ?? null,
      store_id: options.storeId ?? (source as { store_id?: string }).store_id ?? null,
      rider_id: options.riderId ?? (source as { rider_id?: string }).rider_id ?? null,
    })),
  );
}
