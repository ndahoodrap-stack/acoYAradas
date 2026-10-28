/**
 * Zone styles and configuration for the delivery zone map
 */

export interface ZoneStyle {
  id: string;
  name: string;
  code: string;
  price: number;
  fillColor: string;
  fillOpacity: number;
  borderColor: string;
  borderWidth: number;
}

export const DELIVERY_ZONES: ZoneStyle[] = [
  {
    id: 'planta_urbana',
    name: 'Planta Urbana',
    code: 'planta_urbana',
    price: 3500,
    fillColor: '#16a34a', // green-600
    fillOpacity: 0.25,
    borderColor: '#15803d', // green-700
    borderWidth: 2,
  },
  {
    id: 'zona_barrial',
    name: 'Zona Barrial',
    code: 'zona_barrial',
    price: 4300,
    fillColor: '#eab308', // yellow-500
    fillOpacity: 0.25,
    borderColor: '#ca8a04', // yellow-600
    borderWidth: 2,
  },
  {
    id: 'zona_rural',
    name: 'Zona Rural',
    code: 'zona_rural',
    price: 6000,
    fillColor: '#f97316', // orange-500
    fillOpacity: 0.2,
    borderColor: '#ea580c', // orange-600
    borderWidth: 2,
  },
];

export function getZoneStyle(code: string): ZoneStyle | undefined {
  return DELIVERY_ZONES.find(z => z.code === code);
}

export function getZonePrice(code: string): number | null {
  const zone = DELIVERY_ZONES.find(z => z.code === code);
  return zone?.price ?? null;
}

// MapLibre GL style for the base map (customized for Bolívar)
export const MAP_STYLE = {
  version: 8,
  name: 'Bolívar Delivery Map',
  sources: {
    'osm': {
      type: 'raster',
      tiles: [
        'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
        'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
      ],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
      maxzoom: 19,
    },
  },
  layers: [
    {
      id: 'osm-layer',
      type: 'raster',
      source: 'osm',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

// Alternative: Use vector tiles from a free provider (if available)
// For now, using OSM raster tiles for simplicity

// Center of San Carlos de Bolívar, Argentina
export const BOLIVAR_CENTER = [-61.12, -36.23] as [number, number];
export const BOLIVAR_BOUNDS = [
  [-61.25, -36.35], // SW
  [-60.95, -36.10], // NE
] as [[number, number], [number, number]];

// Default zoom levels
export const ZOOM = {
  CITY: 13,
  NEIGHBORHOOD: 15,
  STREET: 17,
  BUILDING: 19,
};