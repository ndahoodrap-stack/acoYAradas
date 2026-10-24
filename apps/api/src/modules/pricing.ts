import type { DbExecutor } from '../db/index.js';
import { money } from '../lib/money.js';

/**
 * Motor de precios: descuentos, envío y comisiones.
 * Todos los importes se calculan en el servidor (nunca se confía en el
 * cliente) y se redondean a 2 decimales.
 */

export interface PromotionRow {
  id: string;
  title: string;
  discount_type: 'percent' | 'fixed';
  discount_value: number;
  min_subtotal: number;
  code: string | null;
  store_id: string | null;
}

export interface DiscountResult {
  discount: number;
  promotion: PromotionRow | null;
}

export function computeDiscount(subtotal: number, promos: PromotionRow[]): DiscountResult {
  let best: DiscountResult = { discount: 0, promotion: null };

  for (const promo of promos) {
    if (money(subtotal) < money(promo.min_subtotal)) continue;
    const raw =
      promo.discount_type === 'percent'
        ? (subtotal * Number(promo.discount_value)) / 100
        : Number(promo.discount_value);
    const value = money(Math.min(raw, subtotal));
    if (value > best.discount) best = { discount: value, promotion: promo };
  }
  return best;
}

export interface ShippingResult {
  cost: number;
  notes: string;
  tariff: string | null;
}

/**
 * Calcula el costo de envío según la modalidad:
 *  - retiro en el local → 0
 *  - entrega propia del comercio → tarifa del comercio (o "a coordinar")
 *  - entrega organizada por acoYAradas! → tarifa por zona/distancia/fija
 */
export async function computeShipping(
  tx: DbExecutor,
  store: {
    id: string;
    zone_id: string | null;
    merchant_delivery_fee: number;
    merchant_delivery_notes: string | null;
  },
  fulfillmentType: 'delivery' | 'pickup',
  deliveryMode: 'platform' | 'merchant',
): Promise<ShippingResult> {
  if (fulfillmentType === 'pickup') {
    return { cost: 0, notes: 'Retiro en el local', tariff: null };
  }

  if (deliveryMode === 'merchant') {
    const fee = money(Number(store.merchant_delivery_fee ?? 0));
    if (fee > 0) {
      return {
        cost: fee,
        notes: store.merchant_delivery_notes ?? 'Envío gestionado por el comercio',
        tariff: 'store',
      };
    }
    return {
      cost: 0,
      notes:
        store.merchant_delivery_notes ??
        'El envío lo coordina el comercio: el costo debe calcularse con el comercio',
      tariff: null,
    };
  }

  const { rows } = await tx.query<any>(
    `select id, name, mode, base_price, price_per_km, min_price, max_price
       from public.shipping_tariffs
      where active = true and deleted_at is null
        and (store_id = $1 or store_id is null)
        and (zone_id = $2 or zone_id is null)
      order by (store_id is not null) desc, (zone_id is not null) desc, base_price asc
      limit 1`,
    [store.id, store.zone_id],
  );

  if (!rows.length) {
    return {
      cost: 0,
      notes: 'El costo de envío debe calcularse (consultar zona de cobertura)',
      tariff: null,
    };
  }

  const t = rows[0];
  let cost = money(Number(t.base_price ?? 0));
  if (t.mode === 'distance') {
    // Sin geocodificación del cliente se aplica la tarifa base; la distancia
    // puede ajustarse manualmente desde el panel del comercio.
    cost = money(cost);
  }
  if (t.min_price !== null && t.min_price !== undefined) {
    cost = Math.max(cost, money(Number(t.min_price)));
  }
  if (t.max_price !== null && t.max_price !== undefined) {
    cost = Math.min(cost, money(Number(t.max_price)));
  }
  return { cost, notes: `Tarifa ${t.name}`, tariff: t.name };
}

export interface CommissionResult {
  base: number;
  rateType: 'percent' | 'fixed';
  rateValue: number;
  amount: number;
  net: number;
  ruleId: string | null;
}

/**
 * Comisión de acoYAradas! sobre un pedido.
 * La base de cálculo (productos u orden completo) y el tipo (porcentaje o
 * importe fijo) son configurables por comercio o globalmente.
 */
export async function computeCommission(
  tx: DbExecutor,
  storeId: string,
  totals: { subtotal: number; discount: number; shipping: number; total: number },
): Promise<CommissionResult> {
  const { rows } = await tx.query<any>(
    `select id, type, value, basis
       from public.commission_rules
      where active = true and deleted_at is null and (store_id = $1 or store_id is null)
      order by (store_id is not null) desc
      limit 1`,
    [storeId],
  );

  const rule = rows[0];
  if (!rule) {
    const base = money(Math.max(0, totals.subtotal - totals.discount));
    return { base, rateType: 'percent', rateValue: 0, amount: 0, net: base, ruleId: null };
  }

  const base =
    rule.basis === 'order_total'
      ? money(totals.total)
      : money(Math.max(0, totals.subtotal - totals.discount));

  const amount =
    rule.type === 'percent' ? money((base * Number(rule.value)) / 100) : money(Number(rule.value));
  const capped = money(Math.min(amount, base));

  return {
    base,
    rateType: rule.type,
    rateValue: money(Number(rule.value)),
    amount: capped,
    net: money(base - capped),
    ruleId: rule.id,
  };
}
