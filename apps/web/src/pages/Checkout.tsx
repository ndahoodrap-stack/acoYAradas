import { useMemo, useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError, tokens } from '../lib/api';
import { useCart } from '../lib/cart';
import { useSession } from '../lib/session';
import { formatMoney } from '../lib/format';
import { PAYMENT_METHOD_LABELS, type PaymentMethod, type StoreDto } from '@acoyaradas/shared';
import { EmptyState, Field, Spinner } from '../components/ui';

type Fulfillment = 'delivery' | 'pickup';
type DeliveryMode = 'platform' | 'merchant';

interface ZoneGeometry {
  id: string;
  name: string;
  code: string;
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];
  };
}

interface GeocodeCache {
  [address: string]: {
    lat: number;
    lng: number;
    display_name: string;
    timestamp: number;
  };
}

const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 horas
const BOLIVAR_CENTER: [number, number] = [-36.23, -61.11]; // [lat, lng]
const BOLIVAR_BOUNDS: [[number, number], [number, number]] = [
  [-36.30, -61.25], // suroeste
  [-36.15, -61.00], // noreste
];

const ZONE_COLORS: Record<string, string> = {
  planta_urbana: '#22c55e',    // verde
  zona_barrial: '#f59e0b',     // ámbar
  zona_rural: '#ef4444',       // rojo
};


function DeliveryMap() {
  return <div style={{ height: '350px', width: '100%', borderRadius: '12px', background: '#f5f5f5' }} />;
}

export default function Checkout() {
  const { cart, loading, refresh } = useCart();
  const { user } = useSession();
  const navigate = useNavigate();

  const storeSlug = cart.items[0]?.store_slug ?? '';
  const isPlatform = cart.items.some((item: any) => !item.store_id || item.store_slug === null);
  const { data: storePage, isLoading: storeLoading } = useQuery({
    queryKey: ['store', storeSlug],
    queryFn: () => api.get<{ store: StoreDto }>(`/stores/${storeSlug}`),
    enabled: Boolean(storeSlug && !isPlatform),
  });
  const store = isPlatform
    ? ({
        id: cart.items[0]?.store_id ?? '',
        name: cart.store_name ?? 'acoYAradas!',
        allows_platform_delivery: true,
        allows_merchant_delivery: false,
        allows_pickup: false,
        accepts_cash: true,
        accepts_transfer: true,
        accepts_cash_on_delivery: false,
        merchant_delivery_fee: 0,
      } as any)
    : storePage?.store;

  const { data: publicSettings } = useQuery({
    queryKey: ['platform-settings'],
    queryFn: () => api.get<any>('/settings'),
    staleTime: 5 * 60 * 1000,
  });
  const cvu = String(publicSettings?.settings?.transfer_cvu ?? '0000003100000758197056');

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.get<{ profile: any }>('/auth/me'),
    enabled: Boolean(user),
  });

  // Cargar zonas para el mapa
  const { data: zonesData } = useQuery({
    queryKey: ['zones-for-map'],
    queryFn: async () => {
      const response = await fetch('/bolivar.geojson');
      const data = await response.json();
      return data.features
        .map((f: any) => {
          const entries = Object.entries(f.properties);
          if (entries.length === 0) return null;
          const [name, code] = entries[0];
          if (f.geometry.type !== 'Polygon') return null;
          return {
            id: '',
            name,
            code,
            geometry: f.geometry,
          };
        })
        .filter(Boolean) as ZoneGeometry[];
    },
  });

  const zones = zonesData ?? [];

  
  // Consultar tarifa de envío para la zona detectada (usa código, no UUID)
  const { data: shippingTariff } = useQuery({
    queryKey: ['shipping-tariff', detectedZone?.code],
    queryFn: () => api.get<any>(`/orders/shipping/tariff/${detectedZone!.code}`),
    enabled: Boolean(detectedZone?.code),
    staleTime: 5 * 60 * 1000,
  });

  const [form, setForm] = useState({
    customer_name: user?.full_name ?? '',
    phone: user?.phone ?? '',
    address: '',
    locality: '',
    references: '',
    notes: '',
    fulfillment_type: 'delivery' as Fulfillment,
    delivery_mode: 'platform' as DeliveryMode,
    payment_method: 'transfer' as PaymentMethod,
  });

  const [promoCode, setPromoCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Estado para el mapa y geocodificación
  const [mapCenter, setMapCenter] = useState<[number, number]>(BOLIVAR_CENTER);
  const [mapZoom, setMapZoom] = useState(13);
  const [markerPosition, setMarkerPosition] = useState<[number, number] | null>(null);
  const [detectedZone, setDetectedZone] = useState<ZoneGeometry | null>(null);
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const [locationRequested, setLocationRequested] = useState(false);

  useEffect(() => {
    const p = me?.profile;
    if (p) {
      setForm((f) => ({
        ...f,
        customer_name: f.customer_name || p.full_name || '',
        phone: f.phone || p.phone || '',
      }));
    }
  }, [me]);

  // Cargar caché de geocodificación y posición guardada
  useEffect(() => {
    const cached = localStorage.getItem('checkout_geocode_cache');
    if (cached) {
      try {
        const cache: GeocodeCache = JSON.parse(cached);
        // Limpiar entradas antiguas
        const now = Date.now();
        Object.keys(cache).forEach((key) => {
          if (now - cache[key].timestamp > CACHE_DURATION) {
            delete cache[key];
          }
        });
        localStorage.setItem('checkout_geocode_cache', JSON.stringify(cache));
      } catch {
        localStorage.removeItem('checkout_geocode_cache');
      }
    }
  }, []);

  // Geolocalización deshabilitada temporalmente para evitar TDZ/errores de bundle
  useEffect(() => {
    if (!isPlatform) return;
    setLocationRequested(true);
  }, [isPlatform]);

  // Geocodificación deshabilitada temporalmente
  useEffect(() => {
    if (!form.address || !form.locality || isPlatform === false) return;
    // skip
  }, [form.address, form.locality, isPlatform]);

  const geocodeAddress = async (_address: string) => {
    return;
  };

  const detectZoneFromCoords = (_lng: number, _lat: number) => {
    return;
  };

  const handleMapClick = (_e: any) => {
    return;
  };

  const reverseGeocode = async (_lat: number, _lng: number) => {
    return;
  };

  const paymentOptions = useMemo(() => {
    if (!store) return ['transfer'] as PaymentMethod[];
    const options: PaymentMethod[] = [];
    if (store.accepts_cash) options.push('cash');
    if (store.accepts_transfer) options.push('transfer');
    if (options.length === 0) options.push('transfer');
    return options;
  }, [store]);

  if (loading || (storeSlug && storeLoading)) return <Spinner label="Preparando el checkout…" />;

  if (!cart.items.length) {
    return (
      <div className="container-app py-10">
        <EmptyState
          title="Tu carrito está vacío"
          description="Agregá productos antes de finalizar la compra."
          action={{ label: 'Ver comercios', to: '/comercios' }}
        />
      </div>
    );
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const body = {
        ...form,
        fulfillment_type: 'delivery',
        delivery_mode: 'platform',
        promo_code: promoCode.trim() || undefined,
        guest_token: tokens.guest ?? undefined,
        idempotency_key: `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      };
      const order = await api.post<{ id: string; code: string; public_token?: string }>('/orders', body);
      await refresh();
      navigate(`/pedido/${order.code}?token=${order.public_token ?? ''}`);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (err.status === 400 && err.message.includes('carrito')) {
          await refresh();
        }
      } else {
        setError('No pudimos crear el pedido. Intentá de nuevo.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  return (
      <div className="container-app py-8">
        <h1 className="text-2xl font-black tracking-tight text-ink-900 sm:text-3xl">Finalizar compra</h1>
        <p className="mt-1 text-sm text-ink-500">
          Comercio: <strong className="text-ink-900">{cart.store_name}</strong>
        </p>

        <form onSubmit={submit} className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="card p-5">
            <h2 className="text-lg font-bold text-ink-900">Datos de contacto y entrega</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Nombre y apellido">
                <input
                  className="input"
                  required
                  minLength={2}
                  placeholder="Juan Pérez"
                  value={form.customer_name}
                  onChange={field('customer_name').onChange}
                />
              </Field>
              <Field label="Teléfono">
                <input
                  className="input"
                  required
                  placeholder="+54 9 11 0000-0000"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={form.phone}
                  onChange={(e) => {
                    const value = e.target.value.replace(/[^0-9+\-\s()]/g, '');
                    field('phone').onChange({ target: { value } } as any);
                  }}
                />
              </Field>
              <Field label="Dirección" hint={form.fulfillment_type === 'pickup' ? 'Opcional si retirás en el local.' : undefined}>
                <input
                  className="input"
                  placeholder="Av. Corrientes 1234, 3B"
                  value={form.address}
                  onChange={field('address').onChange}
                />
              </Field>
              <Field label="Localidad">
                <input
                  className="input"
                  placeholder="San Carlos de Bolívar"
                  value={form.locality}
                  onChange={field('locality').onChange}
                />
              </Field>
              <Field label="Referencias" hint="Timbre, piso, puerta, punto de referencia…">
                <input
                  className="input"
                  value={form.references}
                  onChange={field('references').onChange}
                />
              </Field>
              <Field label="Observaciones para el comercio">
                <input
                  className="input"
                  value={form.notes}
                  onChange={field('notes').onChange}
                />
              </Field>
            </div>
          </section>

          {/* Mapa interactivo para selección de zona */}
          {isPlatform && (
            <section className="card p-5">
              <h2 className="text-lg font-bold text-ink-900 flex items-center gap-2">
                Ubicación de entrega
                {isGeocoding && <span className="animate-spin text-sm text-brand-600">⟳ Buscando…</span>}
                {detectedZone && (
                  <span className="badge" style={{ backgroundColor: ZONE_COLORS[detectedZone.code] + '20', color: ZONE_COLORS[detectedZone.code] }}>
                    Zona detectada: {detectedZone.name}
                  </span>
                )}
              </h2>
              <p className="mt-2 text-sm text-ink-500">
                Hacé clic en el mapa para seleccionar tu ubicación exacta. La zona se detectará automáticamente.
              </p>
              {geocodeError && (
                <div className="mt-2 text-sm text-amber-700 bg-amber-50 p-3 rounded-xl">
                  ⚠️ {geocodeError}. Podés hacer clic en el mapa para seleccionar manualmente.
                </div>
              )}
              <div className="mt-4">
                <DeliveryMap />
              </div>
              {/* Leyenda de zonas */}
              {zones.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-3">
                  {zones.map((zone) => (
                    <span
                      key={zone.code}
                      className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-full ${
                        detectedZone?.code === zone.code ? 'ring-2' : ''
                      }`}
                      style={{
                        backgroundColor: ZONE_COLORS[zone.code] + '20',
                        color: ZONE_COLORS[zone.code],
                        border: `1px solid ${ZONE_COLORS[zone.code]}`,
                        ringColor: ZONE_COLORS[zone.code],
                      }}
                    >
                      <span
                        style={{
                          width: '8px',
                          height: '8px',
                          borderRadius: '50%',
                          backgroundColor: ZONE_COLORS[zone.code],
                          display: 'inline-block'
                        }}
                      />
                      {zone.name}
                    </span>
                  ))}
                </div>
              )}

              {/* Estado de ubicación */}
              <div className="mt-3 p-3 rounded-xl bg-ink-50/50 text-sm">
                {isGeocoding && (
                  <div className="flex items-center gap-2 text-brand-600">
                    <span className="animate-spin">⟳</span>
                    Detectando tu ubicación automáticamente…
                  </div>
                )}
                {!isGeocoding && !locationRequested && !markerPosition && (
                  <div className="text-amber-700 flex items-center gap-2">
                    <span>⚠</span>
                    No se pudo detectar tu ubicación automáticamente. Ingresá tu dirección manualmente abajo.
                  </div>
                )}
                {!isGeocoding && locationRequested && !markerPosition && (
                  <div className="text-amber-700 flex items-center gap-2">
                    <span>⚠</span>
                    Permiso de ubicación denegado. Ingresá tu dirección manualmente o permití el acceso en el navegador.
                  </div>
                )}
                {!isGeocoding && markerPosition && detectedZone && (
                  <div className="flex items-center gap-2 text-emerald-700">
                    <span>✓</span>
                    <strong>Ubicación detectada:</strong> {detectedZone.name} (click en mapa para ajustar)
                  </div>
                )}
                {!isGeocoding && markerPosition && !detectedZone && (
                  <div className="text-amber-700 flex items-center gap-2">
                    <span>⚠</span>
                    Ubicación fuera de zona de cobertura. Contactá al comercio.
                  </div>
                )}
              </div>
            </section>
          )}

          {!isPlatform && store ? (
            <section className="card p-5">
              <h2 className="text-lg font-bold text-ink-900">Entrega</h2>
              <div className="mt-4 space-y-4">
                <div className="rounded-xl border border-ink-200 p-3 text-sm">
                  <p className="font-medium text-ink-900">Envío gestionado por el comercio</p>
                  <p className="text-xs text-ink-500">El costo y modalidad los define el comercio.</p>
                </div>
              </div>
            </section>
          ) : null}

          <section className="card p-5">
            <h2 className="text-lg font-bold text-ink-900">Método de pago</h2>
            <div className="mt-4 space-y-2">
              {paymentOptions.map((method) => (
                <label key={method} className="flex items-center gap-2 rounded-xl border border-ink-200 p-3 text-sm">
                  <input
                    type="radio"
                    name="payment"
                    checked={form.payment_method === method}
                    onChange={() => setForm((f) => ({ ...f, payment_method: method }))}
                  />
                  {PAYMENT_METHOD_LABELS[method]}
                </label>
              ))}
              {paymentOptions.length === 0 ? (
                <p className="text-sm text-red-600">
                  Este comercio no tiene métodos de pago habilitados. Contactalo directamente.
                </p>
              ) : null}

              {form.payment_method === 'transfer' ? (
                <div className="mt-3 animate-fade-up rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm">
                  <p className="font-semibold text-brand-700">Transferí al siguiente CVU:</p>
                  <a
                    href={`https://link.mercadopago.com.ar/?cvu=${cvu}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 font-mono text-sm font-bold text-brand-600 shadow-sm transition hover:scale-[1.02]"
                  >
                    {cvu}
                    <span aria-hidden>↗</span>
                  </a>
                  <p className="mt-2 text-xs text-ink-500">
                    Usá este CVU para realizar la transferencia. El pedido queda pendiente hasta la verificación.
                  </p>
                </div>
              ) : null}
            </div>

            <div className="mt-4">
              <Field label="Código de promoción" hint="Opcional. Se aplica en el servidor.">
                <input
                  className="input"
                  value={promoCode}
                  onChange={(e) => setPromoCode(e.target.value)}
                  placeholder="BIENVENIDO10"
                />
              </Field>
            </div>
          </section>
        </div>

        <aside>
          <div className="card sticky top-24 p-5">
            <h2 className="text-lg font-bold text-ink-900">Tu pedido</h2>
            <ul className="mt-4 space-y-2 text-sm">
              {cart.items.map((item) => (
                <li key={item.id} className="flex justify-between gap-3">
                  <span className="text-ink-600">
                    {item.quantity} × {item.product_name}
                  </span>
                  <span className="font-medium text-ink-900">{formatMoney(item.line_total)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex justify-between border-t border-ink-100 pt-4">
              <span className="font-semibold text-ink-900">Subtotal</span>
              <span className="font-bold text-ink-900">{formatMoney(cart.subtotal)}</span>
            </div>
            {shippingTariff && (
              <div className="mt-2 flex justify-between text-sm">
                <span className="text-ink-600">Envío ({detectedZone?.name})</span>
                <span className="font-bold text-ink-900">{formatMoney(shippingTariff.base_price)}</span>
              </div>
            )}
            <div className="mt-2 flex justify-between border-t border-ink-100 pt-4">
              <span className="font-bold text-ink-900">Total</span>
              <span className="font-bold text-brand-600 text-lg">
                {formatMoney(cart.subtotal + (shippingTariff?.base_price ?? 0))}
              </span>
            </div>
            <p className="mt-1 text-xs text-ink-500">
              {shippingTariff
                ? 'El envío se calcula según tu zona detectada. Los descuentos se aplican al confirmar.'
                : 'El envío y los descuentos se calculan en el servidor al confirmar el pedido.'}
              {detectedZone && (
                <span className="ml-2 font-medium" style={{ color: ZONE_COLORS[detectedZone.code] }}>
                  (Zona: {detectedZone.name})
                </span>
              )}
            </p>

            {error ? (
              <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
            ) : null}

            <button type="submit" className="btn-primary mt-5 w-full" disabled={submitting}>
              {submitting ? 'Enviando pedido…' : 'Confirmar pedido'}
            </button>
            <p className="mt-3 text-xs text-ink-500">
              {user
                ? 'El pedido quedará asociado a tu cuenta.'
                : 'Comprás como invitado. Guardá el enlace de seguimiento para consultar el estado.'}
            </p>
            <Link to="/carrito" className="mt-2 block text-center text-sm text-ink-500 hover:text-brand-600">
              Volver al carrito
            </Link>
          </div>
        </aside>
      </form>
    </div>
  );
}

/**
 * Verifica si un punto (lng, lat) está dentro de un polígono GeoJSON
 * Usa el algoritmo ray-casting (even-odd rule)
 */
function pointInPolygon(
  point: [number, number], // [lng, lat]
  polygon: ZoneGeometry['geometry']
): boolean {
  const [lng, lat] = point;
  const coords = polygon.coordinates[0]; // Anillo exterior

  let inside = false;

  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const [lngI, latI] = coords[i];
    const [lngJ, latJ] = coords[j];

    const intersect =
      ((latI > lat) !== (latJ > lat)) &&
      (lng < (lngJ - lngI) * (lat - latI) / (latJ - latI) + lngI);

    if (intersect) inside = !inside;
  }

  return inside;
}