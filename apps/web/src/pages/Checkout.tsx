import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, tokens } from '../lib/api';
import { useCart } from '../lib/cart';
import { useSession } from '../lib/session';
import { formatMoney } from '../lib/format';
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@acoyaradas/shared';
import { EmptyState, Field, Spinner } from '../components/ui';
import { detectZoneFromGeolocation, type ZoneMatch } from '../lib/zoneDetection';
import { AddressVerificationMap } from '../components/AddressVerificationMap';
import { BOLIVAR_CENTER } from '../lib/zoneStyles';

export default function Checkout() {
  const { cart, loading, refresh } = useCart();
  const { user } = useSession();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    customer_name: user?.full_name ?? '',
    phone: user?.phone ?? '',
    address: '',
    locality: '',
    references: '',
    notes: '',
    fulfillment_type: 'delivery',
    delivery_mode: 'platform',
    payment_method: 'transfer' as PaymentMethod,
  });

  const [promoCode, setPromoCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Zona detectada automáticamente
  const [detectedZone, setDetectedZone] = useState<ZoneMatch | null>(null);
  const [zoneLoading, setZoneLoading] = useState(true);
  const [zoneError, setZoneError] = useState<string | null>(null);

  // Posición en el mapa (para verificación visual)
  const [mapPosition, setMapPosition] = useState<[number, number] | null>(null);

  // Detectar zona al cargar la página
  useEffect(() => {
    let cancelled = false;

    async function detect() {
      try {
        setZoneLoading(true);
        const zone = await detectZoneFromGeolocation();
        if (!cancelled) {
          setDetectedZone(zone);
          // Usar las coordenadas reales de la geolocalización si están disponibles
          if (zone?.lng != null && zone?.lat != null) {
            const position: [number, number] = [zone.lng, zone.lat];
            setMapPosition(position);
            // La dirección se completará automáticamente via handleMapPositionChange
            // cuando el mapa cargue y detecte la dirección del edificio
          } else {
            // Fallback al centro de Bolívar
            setMapPosition(BOLIVAR_CENTER);
          }
          if (zone?.code === 'fuera_cobertura' || !zone) setZoneError('Tu ubicación está fuera de nuestra zona de cobertura');
        }
      } catch (err) {
        if (!cancelled) {
          setZoneError('No pudimos detectar tu ubicación automáticamente');
          console.warn('Geolocation failed:', err);
          setMapPosition(BOLIVAR_CENTER);
        }
      } finally {
        if (!cancelled) setZoneLoading(false);
      }
    }

    detect();
    return () => { cancelled = true; };
  }, []);

  // Manejar cambio de posición desde el mapa
  const handleMapPositionChange = (position: [number, number], zoneCode: string | null, fullAddress: string | null) => {
    setMapPosition(position);
    // El mapa ahora devuelve la dirección completa con número (calle + altura)
    // Usarla directamente para autocompletar
    if (fullAddress) {
      setForm(f => ({ ...f, address: fullAddress }));
    }

    if (zoneCode) {
      // Buscar la zona completa para actualizar el precio
      const zoneInfo = { code: zoneCode, name: '', price: 0 } as ZoneMatch;
      // El mapa detecta la zona y llama a este callback con el código
      // Actualizamos detectedZone basado en el código
      if (zoneCode === 'planta_urbana') zoneInfo.name = 'Planta Urbana', zoneInfo.price = 3500;
      else if (zoneCode === 'zona_barrial') zoneInfo.name = 'Zona Barrial', zoneInfo.price = 4300;
      else if (zoneCode === 'zona_rural') zoneInfo.name = 'Zona Rural', zoneInfo.price = 6000;
      setDetectedZone(zoneInfo);
      setZoneError(null);
    } else if (zoneCode === null && position) {
      // Fuera de cobertura
      setZoneError('Esta ubicación está fuera de nuestra zona de cobertura');
      setDetectedZone(null);
    }
  };

  const paymentOptions: PaymentMethod[] = ['transfer', 'cash'];
  const cvu = '0000003100000758197056';

  if (loading) return <Spinner label="Preparando el checkout…" />;

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
        // Zona detectada para validación server-side
        detected_zone_code: detectedZone?.code,
        // Coordenadas del mapa (si el usuario ajustó la posición)
        delivery_lng: mapPosition?.[0],
        delivery_lat: mapPosition?.[1],
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
    value: form[key] as string,
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
                <input className="input" required minLength={2} placeholder="Juan Pérez" value={form.customer_name} onChange={field('customer_name').onChange} />
              </Field>
              <Field label="Teléfono">
                <input className="input" required placeholder="+54 9 11 0000-0000" type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={(e) => {
                  const value = e.target.value.replace(/[^0-9+\-\s()]/g, '');
                  setForm((f) => ({ ...f, phone: value }));
                }} />
              </Field>
              <Field label="Dirección">
                <input className="input" placeholder="Av. Corrientes 1234" value={form.address} onChange={field('address').onChange} />
              </Field>
              <Field label="Localidad">
                <input className="input" placeholder="San Carlos de Bolívar" value={form.locality} onChange={field('locality').onChange} />
              </Field>
              <Field label="Referencias" hint="Timbre, piso, puerta, punto de referencia…">
                <input className="input" value={form.references} onChange={field('references').onChange} />
              </Field>
              <Field label="Observaciones para el comercio">
                <input className="input" value={form.notes} onChange={field('notes').onChange} />
              </Field>
            </div>
          </section>

          <section className="card p-5">
            <h2 className="text-lg font-bold text-ink-900">Método de pago</h2>
            <div className="mt-4 space-y-2">
              {paymentOptions.map((method) => (
                <label key={method} className="flex items-center gap-2 rounded-xl border border-ink-200 p-3 text-sm">
                  <input type="radio" name="payment" checked={form.payment_method === method} onChange={() => setForm((f) => ({ ...f, payment_method: method }))} />
                  {PAYMENT_METHOD_LABELS[method]}
                </label>
              ))}
              {form.payment_method === 'transfer' ? (
                <div className="mt-3 animate-fade-up rounded-xl border border-brand-200 bg-brand-50 p-4 text-sm">
                  <p className="font-semibold text-brand-700">Transferí al siguiente CVU:</p>
                  <a href={`https://link.mercadopago.com.ar/?cvu=${cvu}`} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 font-mono text-sm font-bold text-brand-600 shadow-sm transition hover:scale-[1.02]">
                    {cvu}
                    <span aria-hidden>↗</span>
                  </a>
                  <p className="mt-2 text-xs text-ink-500">Usá este CVU para realizar la transferencia. El pedido queda pendiente hasta la verificación.</p>
                </div>
              ) : null}
            </div>
            <div className="mt-4">
              <Field label="Código de promoción" hint="Opcional">
                <input className="input" value={promoCode} onChange={(e) => setPromoCode(e.target.value)} placeholder="BIENVENIDO10" />
              </Field>
            </div>
          </section>
        </div>

        <aside>
          <div className="card sticky top-24 p-5">
            <h2 className="text-lg font-bold text-ink-900">Tu pedido</h2>
            <ul className="mt-4 space-y-2 text-sm">
              {cart.items.map((item: any) => (
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
            <div className="mt-2 flex justify-between border-t border-ink-100 pt-4">
              <span className="font-semibold text-ink-900">Envío</span>
              {zoneLoading ? (
                <Spinner size="sm" />
              ) : detectedZone ? (
                <span className="font-bold text-brand-600">
                  {formatMoney(detectedZone.price)} <span className="font-normal text-sm text-ink-500">({detectedZone.name})</span>
                </span>
              ) : zoneError ? (
                <span className="text-red-600 text-sm">{zoneError}</span>
              ) : (
                <span className="text-ink-500">Por calcular</span>
              )}
            </div>
            <div className="mt-2 flex justify-between border-t border-ink-100 pt-4">
              <span className="font-bold text-ink-900">Total</span>
              <span className="font-bold text-brand-600 text-lg">{formatMoney(cart.subtotal + (detectedZone?.price ?? 0))}</span>
            </div>

            {/* Mapa de verificación de dirección */}
            <div className="mt-4">
              <h3 className="text-sm font-semibold text-ink-900 mb-2">Verificá tu ubicación en el mapa</h3>
              <AddressVerificationMap
                detectedZone={detectedZone}
                position={mapPosition}
                onPositionChange={handleMapPositionChange}
                loading={zoneLoading}
                zoneError={zoneError}
                zoneLoading={zoneLoading}
                height={280}
              />
              <p className="mt-2 text-xs text-ink-500 text-center">
                Arrastrá el pin para ajustar tu ubicación exacta. La zona y el precio se actualizan automáticamente.
              </p>
            </div>

            {error ? <div className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}

            <button type="submit" className="btn-primary mt-5 w-full" disabled={submitting}>
              {submitting ? 'Enviando pedido…' : 'Confirmar pedido'}
            </button>
            <p className="mt-3 text-xs text-ink-500">
              {user ? 'El pedido quedará asociado a tu cuenta.' : 'Comprás como invitado.'}
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}
