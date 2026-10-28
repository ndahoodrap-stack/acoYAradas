/**
 * Utilidad para detección de zonas usando point-in-polygon con GeoJSON
 * Basado en el algoritmo ray-casting para determinar si un punto está dentro de un polígono
 */

export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][]; // [ [ [lng, lat], ... ] ] - anillo exterior
}

export interface GeoJSONFeature {
  type: 'Feature';
  properties: Record<string, any>;
  geometry: GeoJSONPolygon;
}

export interface GeoJSONFeatureCollection {
  type: 'FeatureCollection';
  features: GeoJSONFeature[];
}

export interface ZoneGeometry {
  id: string;
  name: string;
  code: string;
  geometry: GeoJSONPolygon;
}

/**
 * Verifica si un punto (lng, lat) está dentro de un polígono GeoJSON
 * Usa el algoritmo ray-casting (even-odd rule)
 */
export function pointInPolygon(
  point: [number, number], // [lng, lat]
  polygon: GeoJSONPolygon
): boolean {
  const [lng, lat] = point;
  const coords = polygon.coordinates[0]; // Anillo exterior

  let inside = false;

  for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
    const [lngI, latI] = coords[i];
    const [lngJ, latJ] = coords[j];

    // Verificar si el punto cruza el segmento
    const intersect =
      ((latI > lat) !== (latJ > lat)) &&
      (lng < (lngJ - lngI) * (lat - latI) / (latJ - latI) + lngI);

    if (intersect) inside = !inside;
  }

  return inside;
}

/**
 * Detecta la zona a partir de coordenadas (lng, lat)
 * Retorna la primera zona que contiene el punto, o null si no está en ninguna
 */
export function detectZone(
  point: [number, number],
  zones: ZoneGeometry[]
): ZoneGeometry | null {
  for (const zone of zones) {
    if (pointInPolygon(point, zone.geometry)) {
      return zone;
    }
  }
  return null;
}

/**
 * Convierte una feature de GeoJSON a ZoneGeometry
 */
export function featureToZoneGeometry(feature: GeoJSONFeature): ZoneGeometry | null {
  // El GeoJSON de Bolívar tiene properties con la clave siendo el nombre y valor el código
  // Ej: { "Planta Urbana": "planta_urbana" }
  const props = feature.properties;
  const entries = Object.entries(props);

  if (entries.length === 0) return null;

  const [name, code] = entries[0];

  if (feature.geometry.type !== 'Polygon') return null;

  return {
    id: '', // Se llenará desde la BD
    name,
    code,
    geometry: feature.geometry,
  };
}

/**
 * Carga las zonas desde el archivo bolivar.geojson
 */
export async function loadZonesFromGeoJSON(): Promise<ZoneGeometry[]> {
  // En el servidor, leer el archivo directamente
  // En el cliente, hacer fetch
  try {
    const response = await fetch('/bolivar.geojson');
    const data = (await response.json()) as GeoJSONFeatureCollection;

    return data.features
      .map(featureToZoneGeometry)
      .filter((z): z is ZoneGeometry => z !== null);
  } catch (error) {
    console.error('Error cargando zonas desde GeoJSON:', error);
    return [];
  }
}

/**
 * Función para usar en el cliente (navegador) - detecta zona desde coordenadas
 * Usa las zonas precargadas
 */
let cachedZones: ZoneGeometry[] | null = null;

export async function getZones(): Promise<ZoneGeometry[]> {
  if (cachedZones) return cachedZones;
  cachedZones = await loadZonesFromGeoJSON();
  return cachedZones;
}

export async function detectZoneFromCoordinates(
  lng: number,
  lat: number
): Promise<ZoneGeometry | null> {
  const zones = await getZones();
  return detectZone([lng, lat], zones);
}