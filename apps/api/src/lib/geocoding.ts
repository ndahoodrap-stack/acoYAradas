/**
 * Geocodificación simple usando Nominatim (OpenStreetMap)
 * Gratis, sin API key, pero con límites de tasa (1 req/seg)
 */

export interface GeocodeResult {
  lat: number;
  lng: number;
  display_name: string;
}

/**
 * Geocodifica una dirección usando Nominatim
 * @param address - Dirección completa (calle, número, localidad)
 * @returns Coordenadas [lat, lng] o null si falla
 */
export async function geocodeAddress(address: string): Promise<GeocodeResult | null> {
  try {
    const encoded = encodeURIComponent(address);
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encoded}&limit=1&countrycodes=ar`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'acoYAradas/1.0 (contact@acoyaradas.app)',
      },
    });

    if (!response.ok) {
      console.error('Error en geocodificación:', response.status);
      return null;
    }

    interface NominatimResult {
      lat: string;
      lon: string;
      display_name: string;
    }

    const data = (await response.json()) as NominatimResult[];

    if (data.length === 0) {
      return null;
    }

    const result = data[0];
    return {
      lat: parseFloat(result.lat),
      lng: parseFloat(result.lon),
      display_name: result.display_name,
    };
  } catch (error) {
    console.error('Error en geocodificación:', error);
    return null;
  }
}

/**
 * Construye una dirección completa para geocodificar
 */
export function buildFullAddress(
  street: string | null | undefined,
  locality: string | null | undefined,
  reference: string | null | undefined
): string {
  const parts = [];
  if (street) parts.push(street);
  if (locality) parts.push(locality);
  if (reference) parts.push(reference);
  parts.push('San Carlos de Bolívar, Buenos Aires, Argentina');
  return parts.join(', ');
}

/**
 * Rate limiter simple para Nominatim (1 request por segundo)
 */
let lastRequestTime = 0;

export async function rateLimitedGeocode(address: string): Promise<GeocodeResult | null> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < 1000) {
    await new Promise(resolve => setTimeout(resolve, 1000 - timeSinceLastRequest));
  }

  lastRequestTime = Date.now();
  return geocodeAddress(address);
}