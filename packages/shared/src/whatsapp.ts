/**
 * WhatsApp: normalización de teléfonos argentinos, enlaces wa.me y
 * plantillas de mensajes listas para usar desde los paneles.
 *
 * No requiere API de Meta ni credenciales: el enlace `wa.me` abre WhatsApp
 * (Desktop, Web o mobile) con el chat y el texto ya cargados.
 */

export type WhatsAppRecipient = 'owner' | 'store' | 'rider' | 'customer';

export type WhatsAppMessageKind =
  | 'owner_new_order'
  | 'store_new_order'
  | 'store_pickup_request'
  | 'rider_assignment'
  | 'customer_created'
  | 'customer_status';

export interface WhatsAppOrderItem {
  name: string;
  quantity: number;
  line_total: number;
  notes?: string | null;
}

export interface WhatsAppOrderInfo {
  code: string;
  public_token?: string | null;
  store_name: string;
  store_phone?: string | null;
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
  items: WhatsAppOrderItem[];
  rider_name?: string | null;
  rider_phone?: string | null;
  status?: string | null;
  merchant_responsible?: string | null;
  prepared_minutes?: number | null;
}

export interface WhatsAppMessageOptions {
  /** Texto adicional (por ejemplo la nota del cambio de estado). */
  statusNote?: string | null;
  /** URL de seguimiento del pedido. */
  trackingUrl?: string | null;
  /** URL del panel para el encargado. */
  panelUrl?: string | null;
  /** Nombre de la ciudad/pueblo donde opera la plataforma. */
  locality?: string;
}

/**
 * Normaliza un teléfono argentino a formato internacional sin signos.
 * Acepta `+54 9 2284 55-5555`, `02284 55-5555`, `2284555555`, etc.
 */
export function normalizePhoneAR(raw: string | null | undefined): string {
  let digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return '';

  // Ya viene con código de país.
  if (digits.startsWith('54')) {
    // 54 0 9 ... (formato viejo) => 54 9 ...
    if (digits.startsWith('540')) digits = `54${digits.slice(2)}`;
    return digits;
  }

  // Prefijo internacional sin 54 (raro, pero posible): 9 2284...
  if (digits.startsWith('0')) digits = digits.slice(1);

  // Móvil argentino sin 9: 11 5555-5555 (10 dígitos) -> 54911...
  if (digits.length === 10) return `549${digits}`;

  // 9 11 5555-5555 (11 dígitos) -> 549...
  if (digits.length === 11 && digits.startsWith('9')) return `54${digits}`;

  // 11 5555-5555 con código de área corto (11 dígitos) -> 549...
  if (digits.length === 11) return `549${digits.slice(-10)}`;

  // Cualquier otro caso: anteponer 54 y dejar los dígitos.
  return `54${digits}`;
}

/** Enlace universal que abre WhatsApp Desktop/Web con el chat precargado. */
export function whatsappLink(phone: string | null | undefined, text: string): string {
  const digits = normalizePhoneAR(phone);
  const query = text ? `?text=${encodeURIComponent(text)}` : '';
  return digits ? `https://wa.me/${digits}${query}` : `https://wa.me/${query}`;
}

/** Variante que fuerza la apertura de la aplicación de escritorio. */
export function whatsappAppLink(phone: string | null | undefined, text: string): string {
  const digits = normalizePhoneAR(phone);
  return `whatsapp://send?phone=${digits}&text=${encodeURIComponent(text)}`;
}

const money = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
});

const STATUS_TEXT: Record<string, string> = {
  pending_confirmation: 'Pendiente de confirmación',
  confirmed: 'Confirmado',
  preparing: 'En preparación',
  ready: 'Listo para retirar / despachar',
  rider_assigned: 'Repartidor asignado',
  on_the_way: 'En camino',
  delivered: 'Entregado',
  cancelled: 'Cancelado',
  incident: 'Con incidencia',
};

const PAYMENT_TEXT: Record<string, string> = {
  cash: 'Efectivo en el local',
  transfer: 'Transferencia bancaria',
  cash_on_delivery: 'Pago al recibir',
};

function itemsBlock(items: WhatsAppOrderItem[]): string {
  if (!items.length) return '';
  return items
    .map((item) => {
      const notes = item.notes ? ` (${item.notes})` : '';
      return `• ${item.quantity}× ${item.name}${notes} — ${money.format(item.line_total)}`;
    })
    .join('\n');
}

function deliveryLine(order: WhatsAppOrderInfo): string {
  if (order.fulfillment_type === 'pickup') return 'Retiro en el local';
  if (order.delivery_mode === 'platform') return 'Envío con repartidor de acoYAradas!';
  return 'Envío propio del comercio';
}

function addressBlock(order: WhatsAppOrderInfo): string {
  const parts = [order.address, order.locality].filter(Boolean).join(', ');
  if (!parts) return 'Retiro en el local';
  return order.references ? `${parts} (${order.references})` : parts;
}

/**
 * Construye el texto de WhatsApp para un pedido según el destinatario.
 * Los mensajes incluyen todos los datos que necesita quien los recibe.
 */
export function buildOrderMessage(
  kind: WhatsAppMessageKind,
  order: WhatsAppOrderInfo,
  options: WhatsAppMessageOptions = {},
): string {
  const detail = itemsBlock(order.items);
  const status = order.status ? STATUS_TEXT[order.status] ?? order.status : null;
  const payment = PAYMENT_TEXT[order.payment_method] ?? order.payment_method;
  const tracking = options.trackingUrl ? `\n🔗 Seguimiento: ${options.trackingUrl}` : '';
  const panel = options.panelUrl ? `\n🖥️ Panel: ${options.panelUrl}` : '';
  const note = options.statusNote ? `\n📝 Nota: ${options.statusNote}` : '';
  const city = options.locality ?? 'San Carlos de Bolívar';

  switch (kind) {
    case 'owner_new_order':
      return [
        `🛎️ NUEVO PEDIDO #${order.code}`,
        '',
        `🏪 ${order.store_name}`,
        `👤 ${order.customer_name} · ${order.phone}`,
        `📦 ${deliveryLine(order)}`,
        `📍 ${addressBlock(order)}`,
        `💳 ${payment}`,
        '',
        detail,
        '',
        `Total: ${money.format(order.total)}${order.shipping_cost ? ` (envío ${money.format(order.shipping_cost)})` : ''}`,
        note,
        tracking,
        panel,
        '',
        `acoYAradas! · ${city}`,
      ]
        .filter((line) => line !== undefined)
        .join('\n')
        .trim();

    case 'store_new_order':
    case 'store_pickup_request': {
      const pickup = kind === 'store_pickup_request' || order.delivery_mode === 'platform';
      return [
        pickup
          ? `🛵 Pedido #${order.code} — lo retira el delivery`
          : `🧾 Pedido #${order.code} para preparar`,
        '',
        `🏪 ${order.store_name}`,
        `👤 Cliente: ${order.customer_name} · ${order.phone}`,
        `📍 Entrega: ${addressBlock(order)}`,
        `📦 ${deliveryLine(order)}`,
        order.merchant_responsible ? `🙋 Responsable: ${order.merchant_responsible}` : '',
        order.prepared_minutes ? `⏱️ Preparación estimada: ${order.prepared_minutes} min` : '',
        '',
        detail,
        '',
        `Comisión acoYAradas (8%): -${money.format((order.total - (order.shipping_cost ?? 0)) * 0.08)}`,
        `Total a recibir: ${money.format((order.total - (order.shipping_cost ?? 0)) * 0.92)} · ${payment}`,
        order.notes ? `📝 Observaciones: ${order.notes}` : '',
        pickup ? '\nEl repartidor pasa a retirarlo por el local.' : '',
        note,
        tracking,
      ]
        .filter(Boolean)
        .join('\n')
        .trim();
    }

    case 'rider_assignment':
      return [
        `🛵 PEDIDO ASIGNADO #${order.code}`,
        '',
        `🏪 Retirar en: ${order.store_name}`,
        order.store_address ? `📍 ${order.store_address}` : '',
        order.store_phone ? `☎️ Local: ${order.store_phone}` : '',
        '',
        `👤 Entregar a: ${order.customer_name}`,
        `📍 ${addressBlock(order)}`,
        `☎️ Cliente: ${order.phone}`,
        '',
        detail,
        '',
        `💰 Total del pedido: ${money.format(order.total)}`,
        `💳 Cobrar: ${payment}`,
        order.notes ? `📝 Observaciones: ${order.notes}` : '',
        order.merchant_responsible ? `🙋 Contacto en el local: ${order.merchant_responsible}` : '',
        note,
        tracking,
        '',
        `acoYAradas! · ${city}`,
      ]
        .filter(Boolean)
        .join('\n')
        .trim();

    case 'customer_created':
      return [
        `✅ ¡Recibimos tu pedido #${order.code}!`,
        '',
        `🏪 ${order.store_name}`,
        `📦 ${deliveryLine(order)}`,
        `📍 ${addressBlock(order)}`,
        `💳 ${payment}`,
        '',
        detail,
        '',
        `Total: ${money.format(order.total)}`,
        '',
        'El comercio va a confirmarlo en breve. Te avisamos por acá.',
        tracking,
        '',
        `acoYAradas! · ${city}`,
      ]
        .filter(Boolean)
        .join('\n')
        .trim();

    case 'customer_status':
    default:
      return [
        `🔔 Pedido #${order.code}: ${status ?? 'actualizado'}`,
        '',
        `🏪 ${order.store_name}`,
        order.rider_name ? `🛵 Repartidor: ${order.rider_name}${order.rider_phone ? ` · ${order.rider_phone}` : ''}` : '',
        `📦 ${deliveryLine(order)}`,
        `📍 ${addressBlock(order)}`,
        `💰 Total: ${money.format(order.total)}`,
        note,
        order.status === 'cancelled' ? 'Si tenés dudas, escribinos y lo revisamos.' : '',
        tracking,
        '',
        `acoYAradas! · ${city}`,
      ]
        .filter(Boolean)
        .join('\n')
        .trim();
  }
}

/** Devuelve true si el teléfono parece utilizable para WhatsApp. */
export function canWhatsApp(phone: string | null | undefined): boolean {
  return normalizePhoneAR(phone).length >= 10;
}
