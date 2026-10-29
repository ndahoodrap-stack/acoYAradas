import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, ApiError, tokens } from '../lib/api';
import { useCart } from '../lib/cart';
import { useSession } from '../lib/session';
import { formatMoney } from '../lib/format';
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '@acoyaradas/shared';
import { EmptyState, Field, Spinner } from '../components/ui';
import { detectZoneFromGeolocation, type ZoneMatch, formatCoordinatesAsAddress } from '../lib/zoneDetection';
import { AddressVerificationMap } from '../components/AddressVerificationMap';
import { BOLIVAR_CENTER } from '../lib/zoneStyles';

const LOCALIDAD = 'San Carlos de Bolívar';

export default function Checkout() {
  const { cart, loading, refresh } = useCart();
  const { user } = useSession();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    customer_name: user?.full_name ?? '',
    phone: user?.phone ?? '',
    address: '',
    locality: LOCALIDAD,
    references: '',
    notes: '',
    fulfillment_type: 'delivery',
    delivery_mode: 'platform',
    payment_method: 'transfer' as PaymentMethod,
  });

  const [promoCode, setPromoCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirmPopup, setShowConfirmPopup] = useState(false);
  const [confirmAddress, setConfirmAddress] = useState('');

  // Zona detectada automáticamente
  const [detectedZone, setDetectedZone] = useState<ZoneMatch | null>(null);
  const [zoneLoading, setZoneLoading] = useState(true);
  const [zoneError, setZoneError] = useState<string | null>(null);
  const [geoDenied, setGeoDenied] = useState(false);

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
            // Rellenar dirección con nombre de calle detectado (local, sin API externa)
            // El usuario solo necesita agregar su número de casa
            if (zone.streetName) {
              setForm(f => ({ ...f, address: `${zone.streetName} [número]` }));
            } else {
              // Fallback a coordenadas si no se detecta calle
              setForm(f => ({ ...f, address: formatCoordinatesAsAddress(position) }));
            }
          } else {
            // Fallback al centro de Bolívar
            setMapPosition(BOLIVAR_CENTER);
          }
          if (zone?.code === 'fuera_cobertura' || !zone) setZoneError('Tu ubicación está fuera de nuestra zona de cobertura');
        }
      } catch (err) {
        if (!cancelled) {
          // Detectar si fue por permiso denegado
          const isPermissionDenied = err instanceof GeolocationPositionError && err.code === GeolocationPositionError.PERMISSION_DENIED;
          setGeoDenied(isPermissionDenied);
          setZoneError(isPermissionDenied
            ? 'Permiso de ubicación denegado. Por favor ajustá el pin en el mapa manualmente.'
            : 'No pudimos detectar tu ubicación automáticamente. Ajustá el pin en el mapa.');
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

  // Abrir popup de confirmación de dirección
  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    // Address is optional when we have a detected zone (map position serves as address)
    if (!detectedZone && !form.address.trim()) {
      setError('Por favor ajustá tu ubicación en el mapa para capturar la dirección.');
      return;
    }
    if (!detectedZone) {
      setError('Tu ubicación está fuera de nuestra zona de cobertura.');
      return;
    }
    setConfirmAddress(form.address);
    setShowConfirmPopup(true);
    setError(null);
  };

  // Confirmar pedido desde el popup
  const confirmOrder = async () => {
    setSubmitting(true);
    setShowConfirmPopup(false);
    try {
      const body = {
        ...form,
        address: confirmAddress, // Usar la dirección confirmada/editada
        fulfillment_type: 'delivery',
        delivery_mode: 'platform',
        promo_code: promoCode.trim() || undefined,
        guest_token: tokens.guest ?? undefined,
        idempotency_key: `web-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        detected_zone_code: detectedZone?.code,
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

      <form onSubmit={handleSubmit} className="mt-6 grid gap-6 lg:grid-cols-3">
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
              <Field label="Localidad">
                <input className="input bg-ink-50 cursor-not-allowed" value={LOCALIDAD} readOnly />
              </Field>
              {/* Manual address entry as fallback when geolocation fails */}
              {geoDenied || zoneError || !detectedZone ? (
                <Field label="Dirección (manual)" hint="Calle y número, ej: Av. San Martín 123">
                  <input
                    className="input"
                    value={form.address}
                    onChange={field('address').onChange}
                    placeholder="Ingresá tu dirección manualmente"
                    autoComplete="street-address"
                  />
                </Field>
              ) : (
                <Field label="Dirección" hint="Se detectó la calle automáticamente desde el mapa.">
                  <input
                    className="input bg-ink-50 cursor-not-allowed"
                    value={form.address}
                    readOnly
                    autoComplete="street-address"
                  />
                </Field>
              )}
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
          <div className="sticky top-24 space-y-4 animate-fade-up">
            {/* Order Summary Card */}
            <div className="card p-5 bg-gradient-to-br from-white via-brand-50/30 to-white border-brand-200/50">
              <div className="flex items-center gap-2 mb-4">
                <div className="grid h-8 w-8 place-items-center rounded-xl bg-brand-100 text-brand-600">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                </div>
                <h2 className="text-lg font-bold text-ink-900">Tu pedido</h2>
              </div>

              <ul className="space-y-2.5 text-sm" role="list">
                {cart.items.map((item: any) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-2 rounded-xl bg-ink-50/50 transition-colors hover:bg-brand-50/30">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="shrink-0 inline-flex items-center justify-center h-8 w-8 rounded-lg bg-brand-100 text-brand-600 text-xs font-bold tabular-nums">
                        {item.quantity}
                      </span>
                      <span className="text-ink-700 truncate font-medium">{item.product_name}</span>
                    </div>
                    <span className="font-semibold text-ink-900 shrink-0 tabular-nums">{formatMoney(item.line_total)}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-4 space-y-3 border-t border-ink-200 pt-4">
                <div className="flex justify-between text-sm">
                  <span className="text-ink-600">Subtotal</span>
                  <span className="font-semibold text-ink-900 tabular-nums">{formatMoney(cart.subtotal)}</span>
                </div>

                {/* Delivery Zone Card */}
                <div className="relative rounded-xl p-3 transition-all duration-300"
                  style={{
                    backgroundColor: zoneLoading ? '#fef3c7' : detectedZone ? '#ecfdf5' : zoneError ? '#fef2f2' : '#f8fafc',
                    borderColor: zoneLoading ? '#fcd34d' : detectedZone ? '#6ee7b7' : zoneError ? '#fecaca' : '#e2e8f0',
                    borderWidth: zoneLoading || detectedZone || zoneError ? '2px' : '1px',
                  }}>
                  {zoneLoading && (
                    <div className="absolute -top-2 left-4 px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-medium">
                      Detectando zona…
                    </div>
                  )}
                  {detectedZone && !zoneLoading && (
                    <div className="absolute -top-2 left-4 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-medium">
                      ✓ Zona detectada
                    </div>
                  )}
                  {zoneError && !detectedZone && (
                    <div className="absolute -top-2 left-4 px-2 py-0.5 rounded-full bg-red-100 text-red-800 text-xs font-medium">
                      Fuera de cobertura
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className="shrink-0 h-10 w-10 rounded-xl flex items-center justify-center"
                        style={{
                          backgroundColor: zoneLoading ? '#fef3c7' : detectedZone ? '#d1fae5' : zoneError ? '#fee2e2' : '#f1f5f9',
                        }}
                      >
                        {zoneLoading ? (
                          <Spinner size="sm" />
                        ) : detectedZone ? (
                          <svg className="h-5 w-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        ) : zoneError ? (
                          <svg className="h-5 w-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                        ) : (
                          <svg className="h-5 w-5 text-ink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 2 16.09 5.77 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                          </svg>
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-ink-900 truncate">
                          {zoneLoading ? 'Calculando envío…' : detectedZone ? `Envío (${detectedZone.name})` : zoneError ? 'Fuera de cobertura' : 'Envío por calcular'}
                        </p>
                        {detectedZone && (
                          <p className="text-xs text-brand-600 font-medium">
                            Entrega estimada: 30-45 min
                          </p>
                        )}
                        {zoneError && (
                          <p className="text-xs text-red-600">
                            Mové el pin en el mapa a una zona cubierta
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      {zoneLoading ? (
                        <div className="h-6 w-16 animate-pulse rounded bg-brand-200" />
                      ) : detectedZone ? (
                        <span className="font-bold text-lg text-brand-600 tabular-nums">
                          {formatMoney(detectedZone.price)}
                        </span>
                      ) : zoneError ? (
                        <span className="text-red-600 font-medium">No disponible</span>
                      ) : (
                        <span className="text-ink-500 text-sm">—</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex justify-between border-t border-ink-200 pt-3">
                  <span className="font-bold text-ink-900">Total</span>
                  <span className="font-bold text-brand-600 text-xl tabular-nums">
                    {formatMoney(cart.subtotal + (detectedZone?.price ?? 0))}
                  </span>
                </div>
              </div>
            </div>

            {/* Map Verification Section */}
            <div className="card overflow-hidden border-brand-200/50 bg-gradient-to-br from-white via-brand-50/20 to-white">
              <div className="px-5 py-4 border-b border-ink-200/50 bg-ink-50/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="grid h-8 w-8 place-items-center rounded-xl bg-brand-100 text-brand-600">
                      <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M17.657 18.657A8 8 0 016.343 7.343S7 9 9 10c0-2 .5-5 2.986-7C14 2 16.09 5.77 17.656 7.343A7.975 7.975 0 0120 13a7.975 7.975 0 01-2.343 5.657z" />
                      </svg>
                    </div>
                    <h3 className="text-sm font-semibold text-ink-900">Verificá tu ubicación</h3>
                  </div>
                  {detectedZone && (
                    <span className="badge bg-brand-100 text-brand-700 font-semibold px-2.5 py-1">
                      {detectedZone.name}
                    </span>
                  )}
                </div>
              </div>
              <div className="p-0">
                <AddressVerificationMap
                  detectedZone={detectedZone}
                  position={mapPosition}
                  onPositionChange={handleMapPositionChange}
                  loading={zoneLoading}
                  zoneError={zoneError}
                  zoneLoading={zoneLoading}
                  height={280}
                />
              </div>
              <div className="px-5 py-3 border-t border-ink-200/50 bg-ink-50/30">
                <p className="text-xs text-ink-500 text-center flex items-center justify-center gap-1.5">
                  <svg className="h-3.5 w-3.5 text-ink-400" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                  </svg>
                  Arrastrá el pin para ajustar · La zona y precio se actualizan automáticamente
                </p>
              </div>
            </div>

            {/* Geolocation fallback guidance */}
            {(geoDenied || (zoneError && !detectedZone && !zoneLoading)) && (
              <div className="card border-amber-200 bg-amber-50 p-4 animate-fade-up" role="status">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 mt-0.5 grid h-6 w-6 place-items-center rounded-full bg-amber-100">
                    <svg className="h-4 w-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-amber-800">
                      {geoDenied ? 'Permiso de ubicación denegado' : 'Ubicación no detectada'}
                    </p>
                    <p className="text-xs text-amber-700 mt-1">
                      {geoDenied
                        ? 'Por favor arrastrá el pin en el mapa hasta tu dirección exacta. También podés escribir la dirección manualmente abajo.'
                        : 'No pudimos detectar tu ubicación. Arrastrá el pin en el mapa hasta tu dirección o escribila manualmente.'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="card border-red-200 bg-red-50 p-4 animate-shake" role="alert">
                <div className="flex items-start gap-3">
                  <div className="shrink-0 mt-0.5 grid h-5 w-5 place-items-center rounded-full bg-red-100">
                    <svg className="h-3.5 w-3.5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                  </div>
                  <p className="text-sm text-red-700 flex-1">{error}</p>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              className="btn-primary w-full py-4 text-base font-bold shadow-lg hover:shadow-xl transition-all duration-200 active:scale-[0.98] relative overflow-hidden"
              disabled={submitting || !detectedZone || (zoneLoading && !detectedZone) || (!detectedZone && !form.address.trim())}
            >
              <span className="relative flex items-center justify-center gap-2">
                {submitting ? (
                  <>
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                    Procesando tu pedido…
                  </>
                ) : (
                  <>
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Confirmar y pagar
                  </>
                )}
              </span>
              {!submitting && detectedZone && (
                <span className="absolute right-4 text-sm font-medium tabular-nums opacity-90">
                  {formatMoney(cart.subtotal + (detectedZone?.price ?? 0))}
                </span>
              )}
            </button>

            {!detectedZone && !zoneLoading && (
              <p className="text-center text-xs text-amber-600 bg-amber-50 rounded-xl px-3 py-2 border border-amber-200">
                ⚠ Ajustá tu ubicación en el mapa para habilitar el pedido
              </p>
            )}

            <p className="mt-3 text-center text-xs text-ink-500">
              {user ? (
                <>
                  <svg className="inline h-3.5 w-3.5 text-brand-500 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Pedido asociado a tu cuenta
                </>
              ) : (
                <>
                  <svg className="inline h-3.5 w-3.5 text-ink-400 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                  </svg>
                  Comprás como invitado
                </>
              )}
            </p>

            {/* Trust indicators */}
            <div className="flex items-center justify-center gap-6 text-xs text-ink-400 border-t border-ink-200 pt-4">
              <div className="flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Pago seguro</span>
              </div>
              <div className="flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                <span>Datos protegidos</span>
              </div>
              <div className="flex items-center gap-1.5">
                <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>Soporte 24/7</span>
              </div>
            </div>
          </div>
        </aside>
      </form>

      {/* Popup de confirmación de dirección */}
      {showConfirmPopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowConfirmPopup(false)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl animate-slide-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-4">
              <div className="w-10 h-10 rounded-full bg-brand-100 flex items-center justify-center">
                <svg className="w-5 h-5 text-brand-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-ink-900">¿Tu dirección es correcta?</h3>
            </div>

            <p className="text-sm text-ink-500 mb-4">
              Verificá la dirección capturada desde el mapa. Agregá el número de casa.
            </p>

            <div className="mb-4">
              <label className="block text-xs font-medium text-ink-600 mb-1">Dirección de entrega</label>
              <div className="flex gap-2">
                {/* Street name - read only */}
                <input
                  className="input flex-1 bg-ink-50 cursor-not-allowed"
                  value={detectedZone?.streetName || confirmAddress.split(' ').slice(0, -1).join(' ') || confirmAddress}
                  readOnly
                  placeholder="Calle detectada"
                  autoComplete="street-address"
                />
                {/* House number - editable */}
                <input
                  className="input w-24 text-center"
                  value={confirmAddress.replace(/.*?(\d+)$/, '$1').replace(/[^\d]/g, '') || ''}
                  onChange={(e) => {
                    const num = e.target.value.replace(/[^\d]/g, '');
                    const street = detectedZone?.streetName || confirmAddress.split(' ').slice(0, -1).join(' ') || confirmAddress;
                    setConfirmAddress(num ? `${street} ${num}` : street);
                  }}
                  placeholder="Nº"
                  autoComplete="address-level1"
                  maxLength={5}
                  inputMode="numeric"
                />
              </div>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirmPopup(false)}
                className="flex-1 btn-secondary"
                disabled={submitting}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmOrder}
                className="flex-1 btn-primary"
                disabled={submitting || !confirmAddress.trim() || !/\d/.test(confirmAddress)}
              >
                {submitting ? 'Enviando…' : 'Confirmar y enviar pedido'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
