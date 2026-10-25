import type { ProductDto, StoreDto } from '@acoyaradas/shared';
import { isStoreOpenNow } from '../lib/storeHours.js';

export const STORE_SELECT = `
  s.id, s.name, s.slug, s.logo_url, s.cover_url, s.description, s.category_id,
  s.phone, s.whatsapp, s.email, s.address, s.locality, s.status, s.is_open,
  s.preparation_time_minutes, s.allows_platform_delivery, s.allows_merchant_delivery,
  s.allows_pickup, s.merchant_delivery_fee, s.merchant_delivery_notes,
  s.accepts_cash, s.accepts_transfer, s.accepts_cash_on_delivery,
  s.open_hours, s.created_at, s.rating, s.verified, s.featured
`;

export const PRODUCT_SELECT = `
  p.id, p.store_id, p.name, p.description, p.price, p.stock, p.image_url,
  p.category_id, p.is_available, p.featured, p.status, p.created_at
`;

export function mapStore(row: any): StoreDto {
  const openHours = row.open_hours ?? {};
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    logo_url: row.logo_url,
    cover_url: row.cover_url,
    description: row.description,
    category_id: row.category_id,
    category_name: row.category_name ?? null,
    phone: row.phone,
    whatsapp: row.whatsapp,
    email: row.email,
    address: row.address,
    locality: row.locality,
    status: row.status,
    is_open: row.status === 'active' ? isStoreOpenNow(openHours) : Boolean(row.is_open),
    preparation_time_minutes: row.preparation_time_minutes,
    allows_platform_delivery: row.allows_platform_delivery,
    allows_merchant_delivery: row.allows_merchant_delivery,
    allows_pickup: row.allows_pickup,
    merchant_delivery_fee: Number(row.merchant_delivery_fee ?? 0),
    merchant_delivery_notes: row.merchant_delivery_notes,
    accepts_cash: row.accepts_cash,
    accepts_transfer: row.accepts_transfer,
    accepts_cash_on_delivery: row.accepts_cash_on_delivery,
    open_hours: openHours,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    products_count: row.products_count !== undefined ? Number(row.products_count) : undefined,
    is_sponsored: Boolean(row.is_sponsored),
  };
}

export function mapProduct(row: any): ProductDto {
  return {
    id: row.id,
    store_id: row.store_id ?? null,
    store_name: row.store_name,
    store_slug: row.store_slug,
    name: row.name,
    description: row.description,
    price: Number(row.price ?? 0),
    stock: Number(row.stock ?? 0),
    image_url: row.image_url,
    category_id: row.category_id,
    is_available: row.is_available,
    featured: row.featured,
    status: row.status,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  };
}
