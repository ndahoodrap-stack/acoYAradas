/**
 * Detección de zona del lado del cliente (browser)
 * Usa bolivar.geojson y la API de geolocalización del navegador
 */

export interface ZoneFeature {
  type: 'Feature';
  properties: { [key: string]: string };
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];
  };
  bbox: number[];
}

export interface ZoneMatch {
  code: string;      // 'planta_urbana' | 'zona_barrial' | 'zona_rural'
  name: string;      // 'Planta Urbana' | 'Zona Barrial' | 'Zona Rural'
  price: number;     // 3500 | 4300 | 6000
  lng?: number;      // Longitud detectada
  lat?: number;      // Latitud detectada
}

/**
 * Algoritmo point-in-polygon (ray-casting / even-odd rule)
 * Idéntico al usado en el servidor (zoneDetectionServer.ts)
 */
export function pointInPolygon(
  point: [number, number], // [lng, lat]
  polygon: { type: 'Polygon'; coordinates: number[][][] }
): boolean {
  const [lng, lat] = point;
  const coords = polygon.coordinates[0]; // anillo exterior
  let inside = false;

  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const [lngI, latI] = coords[i];
    const [lngJ, latJ] = coords[j];

    const intersect =
      (latI > lat) !== (latJ > lat) &&
      lng < ((lngJ - lngI) * (lat - latI)) / (latJ - latI) + lngI;

    if (intersect) inside = !inside;
  }
  return inside;
}

// Mapeo de códigos de zona a nombre visible y precio (ARS)
const ZONE_PRICES: Record<string, { name: string; price: number }> = {
  planta_urbana: { name: 'Planta Urbana', price: 3500 },
  zona_barrial: { name: 'Zona Barrial', price: 4300 },
  zona_rural: { name: 'Zona Rural', price: 6000 },
};

/**
 * Detecta la zona del usuario usando geolocalización del navegador
 * Retorna la zona detectada con su precio, o null si está fuera de cobertura / error
 */
export async function detectZoneFromGeolocation(): Promise<ZoneMatch | null> {
  // 1. Obtener coordenadas del navegador
  const position = await new Promise<GeolocationPosition>((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocalización no soportada'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
      maximumAge: 0,
    });
  });

  const lng = position.coords.longitude;
  const lat = position.coords.latitude;

  // 2. Cargar bolivar.geojson desde public/
  const res = await fetch('/bolivar.geojson');
  if (!res.ok) {
    throw new Error('No se pudo cargar bolivar.geojson');
  }
  const data = await res.json();

  // 3. Buscar en qué zona cae el punto
  const features = data.features as ZoneFeature[];

  // Orden de prioridad: MÁS ESPECÍFICA (interior) -> MENOS ESPECÍFICA (exterior)
  // Los polígonos están anidados: Rural contiene Barrial contiene Urbana
  // Si estás en Barrial, TAMBIÉN estás en Rural, así que hay que chequear
  // primero la zona más chica para que matchee la correcta
  const zoneOrder = ['planta_urbana', 'zona_barrial', 'zona_rural'];

  for (const code of zoneOrder) {
    const feature = features.find(f => Object.values(f.properties)[0] === code);
    if (feature && pointInPolygon([lng, lat], feature.geometry)) {
      return { code, ...ZONE_PRICES[code], lng, lat };
    }
  }

  return { code: 'fuera_cobertura', name: 'Fuera de cobertura', price: 0, lng, lat }; // Fuera de cobertura
}

/**
 * Detecta la zona del usuario usando geolocalización por IP (fallback para desktop sin GPS)
 * Usa ipapi.co (gratis, 1k req/día) para obtener lat/lng y luego detecta la zona
 */
export async function detectZoneFromIP(): Promise<ZoneMatch | null> {
  try {
    // Obtener ubicación por IP
    const res = await fetch('https://ipapi.co/json/');
    if (!res.ok) throw new Error('IP geolocation failed');
    const data = await res.json();

    const lng = data.longitude;
    const lat = data.latitude;

    if (!lng || !lat) {
      console.warn('[IP Geolocation] No coordinates returned');
      return null;
    }

    console.log('[IP Geolocation] Location:', { lat, lng, city: data.city, region: data.region });

    // Cargar bolivar.geojson y detectar zona
    const geoRes = await fetch('/bolivar.geojson');
    if (!geoRes.ok) throw new Error('Failed to load bolivar.geojson');
    const geoData = await geoRes.json();

    const features = geoData.features as ZoneFeature[];
    const zoneOrder = ['planta_urbana', 'zona_barrial', 'zona_rural'];

    for (const code of zoneOrder) {
      const feature = features.find(f => Object.values(f.properties)[0] === code);
      if (feature && pointInPolygon([lng, lat], feature.geometry)) {
        return { code, ...ZONE_PRICES[code], lng, lat };
      }
    }

    return { code: 'fuera_cobertura', name: 'Fuera de cobertura', price: 0, lng, lat };
  } catch (err) {
    console.warn('[IP Geolocation] Failed:', err);
    return null;
  }
}

/**
 * Busca direcciones usando OpenStreetMap Nominatim (gratis, sin API key)
 * Rate limit: 1 req/seg
 */
export async function searchAddresses(query: string): Promise<Array<{ display_name: string; lat: string; lon: string }>> {
  if (!query || query.length < 3) return [];

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=ar&limit=5&addressdetails=1`;
    const res = await fetch(url, {
      headers: {
        'Accept-Language': 'es',
        'User-Agent': 'acoYAradas/1.0'
      }
    });
    if (!res.ok) throw new Error('Nominatim search failed');
    const data = await res.json();
    return data.map((item: any) => ({
      display_name: item.display_name,
      lat: item.lat,
      lon: item.lon
    }));
  } catch (err) {
    console.warn('[Nominatim] Search failed:', err);
    return [];
  }
}

/**
 * Obtiene la tarifa exacta desde la API (validación server-side)
 * Útil para confirmar el precio antes de enviar el pedido
 */
export async function fetchTariffForZone(zoneCode: string): Promise<{ cost: number; name: string } | null> {
  try {
    const res = await fetch(`/api/orders/shipping/tariff/${zoneCode}`);
    if (!res.ok) return null;
    const tariff = await res.json();
    if (!tariff) return null;
    return { cost: tariff.base_price, name: tariff.name };
  } catch {
    return null;
  }
}