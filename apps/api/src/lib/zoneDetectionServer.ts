/**
 * Detección de zonas del lado del servidor (Node.js)
 * Consulta la base de datos para obtener zonas con sus geometrías
 */

import type { DbExecutor } from '../db/index.js';

export interface ZoneGeometry {
  id: string;
  name: string;
  code: string;
  geometry: {
    type: 'Polygon';
    coordinates: number[][][];
  };
}

/**
 * Obtiene todas las zonas activas con su geometría desde la base de datos
 */
export async function getZonesFromDB(tx: DbExecutor): Promise<ZoneGeometry[]> {
  const { rows } = await tx.query<{
    id: string;
    name: string;
    code: string;
    geometry: ZoneGeometry['geometry'];
  }>(
    `select id, name, code, geometry
       from public.coverage_zones
      where active = true and geometry is not null and deleted_at is null
      order by name`
  );

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    geometry: r.geometry as ZoneGeometry['geometry'],
  }));
}

/**
 * Verifica si un punto (lng, lat) está dentro de un polígono GeoJSON
 * Usa el algoritmo ray-casting (even-odd rule)
 */
export function pointInPolygon(
  point: [number, number],
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

/**
 * Detecta la zona a partir de coordenadas (lng, lat) usando zonas de la BD
 */
export async function detectZoneFromCoordinates(
  tx: DbExecutor,
  lng: number,
  lat: number
): Promise<ZoneGeometry | null> {
  const zones = await getZonesFromDB(tx);
  const point: [number, number] = [lng, lat];

  for (const zone of zones) {
    if (pointInPolygon(point, zone.geometry)) {
      return zone;
    }
  }
  return null;
}

/**
 * Detecta la zona y retorna el zone_id para usar en tarifas de envío
 */
export async function detectZoneIdFromCoordinates(
  tx: DbExecutor,
  lng: number,
  lat: number
): Promise<string | null> {
  const zone = await detectZoneFromCoordinates(tx, lng, lat);
  return zone?.id ?? null;
}