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
  streetName?: string; // Nombre de la calle más cercana (para dirección amigable)
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
 * También detecta el nombre de la calle más cercana para dirección amigable
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
  const point: [number, number] = [lng, lat];

  // 2. Cargar bolivar.geojson y bolivar-calles-simplificado.geojson en paralelo
  const [zonasRes, callesRes] = await Promise.all([
    fetch('/bolivar.geojson'),
    fetch('/bolivar-calles-simplified.geojson'),
  ]);

  if (!zonasRes.ok) {
    throw new Error('No se pudo cargar bolivar.geojson');
  }
  if (!callesRes.ok) {
    console.warn('No se pudo cargar bolivar-calles-simplified.geojson, continuando sin detección de calle');
  }

  const [zonasData, callesData] = await Promise.all([
    zonasRes.json(),
    callesRes.ok ? callesRes.json() : null,
  ]);

  // 3. Buscar en qué zona cae el punto
  const features = zonasData.features as ZoneFeature[];

  // Orden de prioridad: MÁS ESPECÍFICA (interior) -> MENOS ESPECÍFICA (exterior)
  // Los polígonos están anidados: Rural contiene Barrial contiene Urbana
  // Si estás en Barrial, TAMBIÉN estás en Rural, así que hay que chequear
  // primero la zona más chica para que matchee la correcta
  const zoneOrder = ['planta_urbana', 'zona_barrial', 'zona_rural'];

  let detectedZone: ZoneMatch | null = null;

  for (const code of zoneOrder) {
    const feature = features.find(f => Object.values(f.properties)[0] === code);
    if (feature && pointInPolygon(point, feature.geometry)) {
      detectedZone = { code, ...ZONE_PRICES[code], lng, lat };
      break;
    }
  }

  if (!detectedZone) {
    return { code: 'fuera_cobertura', name: 'Fuera de cobertura', price: 0, lng, lat };
  }

  // 4. Detectar la calle más cercana si tenemos datos de calles
  if (callesData) {
    const streetName = findNearestStreet(point, callesData);
    if (streetName) {
      detectedZone.streetName = streetName;
    }
  }

  return detectedZone;
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

/**
 * Formatea coordenadas como string legible para usar como dirección local
 * Útil cuando no hay reverse geocoding externo disponible
 */
export function formatCoordinatesAsAddress(lngLat: [number, number]): string {
  const [lng, lat] = lngLat;
  return `Lat: ${lat.toFixed(4)}, Lng: ${lng.toFixed(4)}`;
}

/**
 * Calcula la distancia euclidiana al cuadrado entre un punto y un segmento de línea
 * Optimización: evita sqrt para comparaciones
 */
function distancePointToSegmentSquared(
  point: [number, number],
  segStart: [number, number],
  segEnd: [number, number]
): number {
  const [px, py] = point;
  const [x1, y1] = segStart;
  const [x2, y2] = segEnd;

  const dx = x2 - x1;
  const dy = y2 - y1;

  if (dx === 0 && dy === 0) {
    // Segmento es un punto
    const dpx = px - x1;
    const dpy = py - y1;
    return dpx * dpx + dpy * dpy;
  }

  // Proyección del punto en la línea
  const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);

  if (t < 0) {
    // Más cercano al inicio del segmento
    const dpx = px - x1;
    const dpy = py - y1;
    return dpx * dpx + dpy * dpy;
  } else if (t > 1) {
    // Más cercano al final del segmento
    const dpx = px - x2;
    const dpy = py - y2;
    return dpx * dpx + dpy * dpy;
  } else {
    // Proyección dentro del segmento
    const projX = x1 + t * dx;
    const projY = y1 + t * dy;
    const dpx = px - projX;
    const dpy = py - projY;
    return dpx * dpx + dpy * dpy;
  }
}

/**
 * Encuentra la calle más cercana a un punto dado
 * Usa el GeoJSON de calles (LineStrings con propiedad 'name')
 * Retorna el nombre de la calle más cercana o null si no hay calles
 */
export function findNearestStreet(
  point: [number, number],
  streetsGeoJSON: { type: 'FeatureCollection'; features: any[] }
): string | null {
  const features = streetsGeoJSON.features;
  if (!features || features.length === 0) return null;

  let nearestStreetName: string | null = null;
  let minDistanceSq = Infinity;

  for (const feature of features) {
    const geometry = feature.geometry;
    const properties = feature.properties;

    if (!geometry || geometry.type !== 'LineString') continue;
    if (!properties || !properties.name) continue;

    const coords = geometry.coordinates;
    if (!coords || coords.length < 2) continue;

    // Calcular distancia mínima a todos los segmentos de la calle
    for (let i = 0; i < coords.length - 1; i++) {
      const segStart: [number, number] = coords[i];
      const segEnd: [number, number] = coords[i + 1];

      const distSq = distancePointToSegmentSquared(point, segStart, segEnd);

      if (distSq < minDistanceSq) {
        minDistanceSq = distSq;
        nearestStreetName = properties.name;
      }
    }
  }

  return nearestStreetName;
}