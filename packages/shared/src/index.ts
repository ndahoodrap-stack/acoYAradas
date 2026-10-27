/**
 * acoYAradas! - Contratos compartidos entre API y Web.
 * Tipos, enums y esquemas de validación (zod) usados en ambos extremos.
 */

/* ------------------------------------------------------------------ */
/* Enums                                                               */
/* ------------------------------------------------------------------ */

export const USER_ROLES = ['admin', 'store_owner', 'store_staff', 'courier', 'customer'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const STORE_STATUSES = ['pending', 'active', 'suspended', 'rejected'] as const;
export type StoreStatus = (typeof STORE_STATUSES)[number];

export const PRODUCT_STATUSES = ['draft', 'pending_review', 'active', 'inactive'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const ORDER_STATUSES = [
  'pending_confirmation',
  'confirmed',
  'preparing',
  'ready',
  'rider_assigned',
  'on_the_way',
  'delivered',
  'cancelled',
  'incident',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const DELIVERY_MODES = ['platform', 'merchant'] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];

export const FULFILLMENT_TYPES = ['delivery', 'pickup'] as const;
export type FulfillmentType = (typeof FULFILLMENT_TYPES)[number];

export const PAYMENT_METHODS = ['cash', 'transfer'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_STATUSES = ['pending', 'confirmed', 'failed', 'refunded'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const SUBSCRIPTION_STATUSES = ['active', 'past_due', 'cancelled', 'expired'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const CAMPAIGN_STATUSES = [
  'draft',
  'pending',
  'active',
  'paused',
  'finished',
  'rejected',
] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export const AD_PLACEMENTS = ['home_banner', 'category_featured', 'product_sponsored'] as const;
export type AdPlacement = (typeof AD_PLACEMENTS)[number];

export const RIDER_ASSIGNMENT_STATUSES = ['assigned', 'picked_up', 'delivered', 'failed'] as const;
export type RiderAssignmentStatus = (typeof RIDER_ASSIGNMENT_STATUSES)[number];

export const NOTIFICATION_CHANNELS = ['in_app', 'whatsapp', 'email'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

/** Etiquetas legibles en español (se usan en la web). */
export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending_confirmation: 'Pendiente de confirmación',
  confirmed: 'Confirmado',
  preparing: 'En preparación',
  ready: 'Entregado al delivery',
  rider_assigned: 'Repartidor asignado',
  on_the_way: 'En camino',
  delivered: 'Entregado al cliente',
  cancelled: 'Cancelado',
  incident: 'Con incidencia',
};

export const DELIVERY_MODE_LABELS: Record<DeliveryMode, string> = {
  platform: 'Entrega por acoYAradas!',
  merchant: 'Entrega propia del comercio',
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'Efectivo',
  transfer: 'Transferencia bancaria',
};

/* ------------------------------------------------------------------ */
/* Constantes de negocio                                              */
/* ------------------------------------------------------------------ */

/** Etiqueta obligatoria para contenidos patrocinados (identificar publicidad). */
export const SPONSORED_LABEL = 'Publicidad';

/**
 * La plataforma opera en una única ciudad. Todo el texto público, los
 * formularios y los envíos usan esta localidad.
 */
export const PLATFORM_CITY = 'San Carlos de Bolívar';
export const PLATFORM_PROVINCE = 'Provincia de Buenos Aires';
export const PLATFORM_LOCALITY = `${PLATFORM_CITY}, ${PLATFORM_PROVINCE}`;
export const PLATFORM_COVERAGE_TEXT = `Cobertura exclusiva en ${PLATFORM_LOCALITY}. Llegamos a todo el casco urbano de ${PLATFORM_CITY}.`;

export const DEFAULT_CATEGORIES = [
  { name: 'Gastronomía', slug: 'gastronomia' },
  { name: 'Rotiserías', slug: 'rotiserias' },
  { name: 'Kioscos', slug: 'kioscos' },
  { name: 'Almacenes', slug: 'almacenes' },
  { name: 'Bebidas', slug: 'bebidas' },
  { name: 'Indumentaria', slug: 'indumentaria' },
  { name: 'Ferreterías', slug: 'ferreterias' },
  { name: 'Tecnología', slug: 'tecnologia' },
];

export const ORDER_STATUS_FLOW: Record<OrderStatus, OrderStatus[]> = {
  pending_confirmation: ['confirmed', 'cancelled', 'rider_assigned'],
  confirmed: ['preparing', 'cancelled', 'incident', 'rider_assigned'],
  preparing: ['ready', 'cancelled', 'incident', 'rider_assigned'],
  ready: ['rider_assigned', 'delivered', 'cancelled', 'incident'],
  rider_assigned: ['on_the_way', 'incident', 'cancelled'],
  on_the_way: ['delivered', 'incident'],
  delivered: [],
  cancelled: [],
  incident: ['cancelled', 'delivered', 'ready'],
};

/* ------------------------------------------------------------------ */
/* Zod                                                                 */
/* ------------------------------------------------------------------ */
import { z } from 'zod';

export const moneySchema = z.number().min(0).max(100_000_000);

export const idSchema = z.string().uuid('Identificador inválido');

export const registerSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
  full_name: z.string().min(2, 'Ingresá tu nombre').max(120),
  phone: z.string().min(6, 'Ingresá un teléfono válido').max(40).optional().or(z.literal('')),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Ingresá tu contraseña'),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const storeApplicationSchema = z.object({
  store_name: z.string().min(2, 'Ingresá el nombre del negocio').max(120),
  owner_name: z.string().min(2, 'Ingresá el nombre del responsable').max(120),
  phone: z.string().min(6, 'Ingresá un teléfono').max(40),
  address: z.string().min(5, 'Ingresá la dirección').max(200),
  locality: z.string().min(2, 'Ingresá la localidad').max(120),
  category_id: idSchema,
  email: z.string().email().optional().or(z.literal('')),
  notes: z.string().max(1000).optional().or(z.literal('')),
  accepted_terms: z.literal(true, 'Debés aceptar las condiciones para comercios'),
});
export type StoreApplicationInput = z.infer<typeof storeApplicationSchema>;

export const productSchema = z.object({
  name: z.string().min(2, 'Ingresá el nombre del producto').max(160),
  description: z.string().max(2000).optional().or(z.literal('')),
  price: moneySchema,
  stock: z.number().int().min(0).max(1_000_000),
  category_id: idSchema.nullable().optional(),
  image_url: z.string().max(500).optional().or(z.literal('')),
  is_available: z.boolean().optional(),
  featured: z.boolean().optional(),
});
export type ProductInput = z.infer<typeof productSchema>;

export const cartItemSchema = z.object({
  product_id: idSchema,
  quantity: z.number().int().min(1).max(500),
  notes: z.string().max(500).optional().or(z.literal('')),
});
export type CartItemInput = z.infer<typeof cartItemSchema>;

export const checkoutSchema = z.object({
  customer_name: z.string().min(2, 'Ingresá tu nombre').max(120),
  phone: z.string().min(6, 'Ingresá un teléfono').max(40),
  address: z.string().max(300).optional().or(z.literal('')),
  locality: z.string().max(120).optional().or(z.literal('')),
  references: z.string().max(500).optional().or(z.literal('')),
  notes: z.string().max(1000).optional().or(z.literal('')),
  fulfillment_type: z.enum(FULFILLMENT_TYPES),
  delivery_mode: z.enum(DELIVERY_MODES),
  payment_method: z.enum(PAYMENT_METHODS),
  guest_token: z.string().max(120).optional().or(z.literal('')),
  idempotency_key: z.string().max(120).optional().or(z.literal('')),
});
export type CheckoutInput = z.infer<typeof checkoutSchema>;

export const orderStatusUpdateSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  note: z.string().max(1000).optional().or(z.literal('')),
});
export type OrderStatusUpdateInput = z.infer<typeof orderStatusUpdateSchema>;

export const promotionSchema = z.object({
  title: z.string().min(2).max(120),
  description: z.string().max(1000).optional().or(z.literal('')),
  discount_type: z.enum(['percent', 'fixed']),
  discount_value: moneySchema,
  code: z.string().max(40).optional().or(z.literal('')),
  starts_at: z.string().datetime().optional().or(z.literal('')),
  ends_at: z.string().datetime().optional().or(z.literal('')),
  min_subtotal: moneySchema.optional(),
  active: z.boolean().optional(),
});
export type PromotionInput = z.infer<typeof promotionSchema>;

export const campaignSchema = z.object({
  store_id: idSchema,
  placement: z.enum(AD_PLACEMENTS),
  title: z.string().min(2).max(120),
  body: z.string().max(500).optional().or(z.literal('')),
  image_url: z.string().max(500).optional().or(z.literal('')),
  link_url: z.string().max(500).optional().or(z.literal('')),
  product_id: idSchema.nullable().optional(),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  price: moneySchema,
  status: z.enum(CAMPAIGN_STATUSES).optional(),
  review_note: z.string().max(500).optional().or(z.literal('')),
});
export type CampaignInput = z.infer<typeof campaignSchema>;

export const storeProfileSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  description: z.string().max(2000).optional().or(z.literal('')),
  logo_url: z.string().max(500).optional().or(z.literal('')),
  cover_url: z.string().max(500).optional().or(z.literal('')),
  phone: z.string().max(40).optional().or(z.literal('')),
  whatsapp: z.string().max(40).optional().or(z.literal('')),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().max(200).optional().or(z.literal('')),
  locality: z.string().max(120).optional().or(z.literal('')),
  category_id: idSchema.nullable().optional(),
  is_open: z.boolean().optional(),
  preparation_time_minutes: z.number().int().min(0).max(10080).optional(),
  allows_platform_delivery: z.boolean().optional(),
  allows_merchant_delivery: z.boolean().optional(),
  allows_pickup: z.boolean().optional(),
  merchant_delivery_fee: moneySchema.optional(),
  merchant_delivery_notes: z.string().max(500).optional().or(z.literal('')),
  accepts_cash: z.boolean().optional(),
  accepts_transfer: z.boolean().optional(),
  accepts_cash_on_delivery: z.boolean().optional(),
  open_hours: z.record(z.string(), z.string()).optional(),
  accepts_terms: z.boolean().optional(),
});
export type StoreProfileInput = z.infer<typeof storeProfileSchema>;

export const riderSchema = z.object({
  full_name: z.string().min(2).max(120),
  phone: z.string().min(6).max(40),
  vehicle_type: z.string().max(60).optional().or(z.literal('')),
  zones: z.array(z.string().max(120)).optional(),
  active: z.boolean().optional(),
  available: z.boolean().optional(),
});
export type RiderInput = z.infer<typeof riderSchema>;

export const tariffSchema = z.object({
  name: z.string().min(2).max(120),
  zone_id: idSchema.nullable().optional(),
  store_id: idSchema.nullable().optional(),
  mode: z.enum(['fixed', 'distance', 'zone']),
  base_price: moneySchema.optional(),
  price_per_km: moneySchema.optional(),
  min_price: moneySchema.optional(),
  max_price: moneySchema.optional(),
  active: z.boolean().optional(),
});
export type TariffInput = z.infer<typeof tariffSchema>;

export const planSchema = z.object({
  name: z.string().min(2).max(120),
  code: z.string().min(2).max(40),
  price: moneySchema,
  billing_period: z.enum(['monthly', 'yearly']),
  product_limit: z.number().int().min(0).max(100000),
  promo_limit: z.number().int().min(0).max(1000),
  features: z.array(z.string().max(120)).optional(),
  active: z.boolean().optional(),
});
export type PlanInput = z.infer<typeof planSchema>;

export const commissionRuleSchema = z.object({
  store_id: idSchema.nullable().optional(),
  type: z.enum(['percent', 'fixed']),
  value: moneySchema,
  basis: z.enum(['product_total', 'order_total']),
  active: z.boolean().optional(),
});
export type CommissionRuleInput = z.infer<typeof commissionRuleSchema>;

export const storeReviewSchema = z.object({
  status: z.enum(STORE_STATUSES),
  note: z.string().max(500).optional().or(z.literal('')),
});
export type StoreReviewInput = z.infer<typeof storeReviewSchema>;

export const legalPageSchema = z.object({
  title: z.string().min(2).max(200),
  body: z.string().max(100000),
});
export type LegalPageInput = z.infer<typeof legalPageSchema>;

export const adEventSchema = z.object({
  campaign_id: idSchema,
  type: z.enum(['impression', 'click']),
});
export type AdEventInput = z.infer<typeof adEventSchema>;

/* ------------------------------------------------------------------ */
/* DTOs (respuestas de la API)                                        */
/* ------------------------------------------------------------------ */

export interface ApiError {
  error: string;
  message: string;
  details?: unknown;
}

export interface SessionUser {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: UserRole;
  store_id?: string | null;
  rider_id?: string | null;
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user: SessionUser;
}

export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  icon_url: string | null;
  sort_order: number;
  active: boolean;
  stores_count?: number;
  products_count?: number;
}

export interface ProductDto {
  id: string;
  store_id: string | null;
  store_name?: string;
  store_slug?: string;
  store_is_open?: boolean;
  name: string;
  description: string | null;
  price: number;
  stock: number;
  image_url: string | null;
  category_id: string | null;
  is_available: boolean;
  featured: boolean;
  status: ProductStatus;
  created_at: string;
}

export interface StoreDto {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  cover_url: string | null;
  description: string | null;
  category_id: string | null;
  category_name?: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  locality: string | null;
  status: StoreStatus;
  is_open: boolean;
  preparation_time_minutes: number | null;
  allows_platform_delivery: boolean;
  allows_merchant_delivery: boolean;
  allows_pickup: boolean;
  merchant_delivery_fee: number;
  merchant_delivery_notes: string | null;
  accepts_cash: boolean;
  accepts_transfer: boolean;
  accepts_cash_on_delivery: boolean;
  open_hours: Record<string, string> | null;
  created_at: string;
  products_count?: number;
  is_sponsored?: boolean;
}

export interface CartItemDto {
  id: string;
  product_id: string;
  store_id: string;
  store_name: string;
  store_slug: string;
  product_name: string;
  price: number;
  image_url: string | null;
  quantity: number;
  notes: string | null;
  stock: number;
  available: boolean;
  line_total: number;
}

export interface CartDto {
  items: CartItemDto[];
  subtotal: number;
  store_id: string | null;
  store_name: string | null;
  other_stores: { store_id: string; store_name: string; items: number }[];
}

export interface OrderItemDto {
  id: string;
  product_id: string;
  name_snapshot: string;
  price_snapshot: number;
  quantity: number;
  notes: string | null;
  line_total: number;
}

export interface OrderDto {
  id: string;
  code: string;
  /** Token público del enlace de seguimiento (no es una credencial de acceso). */
  public_token?: string;
  store_id: string;
  store_name: string;
  store_phone?: string | null;
  store_address?: string | null;
  customer_name: string;
  phone: string;
  address: string | null;
  locality: string | null;
  references: string | null;
  notes: string | null;
  fulfillment_type: FulfillmentType;
  delivery_mode: DeliveryMode;
  status: OrderStatus;
  subtotal: number;
  discount: number;
  shipping_cost: number;
  total: number;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  estimated_preparation_minutes: number | null;
  shipping_notes: string | null;
  rider_id: string | null;
  rider_name?: string | null;
  rider_phone?: string | null;
  merchant_responsible?: string | null;
  items: OrderItemDto[];
  history?: { status: OrderStatus; note: string | null; created_at: string; actor: string | null }[];
  placed_at: string;
  updated_at: string;
}

export interface DashboardDto {
  sales_period: { gross: number; net: number; orders: number; commission: number };
  orders_by_status: Record<string, number>;
  pending_acceptance: number;
  preparing: number;
  deliveries_pending: number;
  stores_active: number;
  stores_pending: number;
  ads_active: number;
  ads_expiring: number;
  subscriptions_active: number;
  subscriptions_expired: number;
  commissions: { pending: number; settled: number };
  revenue: { subscriptions: number; advertising: number; commissions: number };
  logistics_expenses: number;
  incidents: number;
  cancelled: number;
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

/* ------------------------------------------------------------------ */
/* WhatsApp (enlaces y plantillas compartidas)                        */
/* ------------------------------------------------------------------ */
export * from './whatsapp.js';

export interface WhatsAppTargetDto {
  recipient: import('./whatsapp.js').WhatsAppRecipient;
  kind: import('./whatsapp.js').WhatsAppMessageKind;
  label: string;
  name: string;
  phone: string;
  text: string;
  link: string;
  /** Abre directamente la app de escritorio (whatsapp://). */
  app_link: string;
}

export interface WhatsAppOrderMessagesDto {
  order_code: string;
  targets: WhatsAppTargetDto[];
  auto_open: boolean;
}

export interface WhatsAppSettings {
  enabled: boolean;
  owner_phone: string | null;
  mode: 'links' | 'bridge';
  bridge_url: string | null;
  bridge_configured: boolean;
  auto_send: boolean;
  auto_open: boolean;
  events: Record<string, boolean>;
}

export interface WhatsAppOutboxItem {
  id: string;
  order_id: string | null;
  order_code: string | null;
  template: string;
  phone: string | null;
  text: string | null;
  link: string | null;
  status: string;
  error: string | null;
  created_at: string;
}
