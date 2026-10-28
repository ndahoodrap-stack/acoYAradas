import { useEffect, useRef, useState, useCallback } from 'react';
import Map, { Marker, Popup } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { DELIVERY_ZONES, getZoneStyle, BOLIVAR_CENTER, ZOOM, BOLIVAR_BOUNDS } from '../lib/zoneStyles';
import type { ZoneMatch } from '../lib/zoneDetection';

interface AddressVerificationMapProps {
  /** Currently detected zone from geolocation */
  detectedZone: ZoneMatch | null;
  /** Current marker position [lng, lat] */
  position: [number, number] | null;
  /** Called when user drags the marker to a new position */
  onPositionChange: (position: [number, number], zoneCode: string | null) => void;
  /** Whether the map is loading */
  loading?: boolean;
  /** Error message if any */
  error?: string | null;
  /** Height of the map container */
  height?: number;
}

export function AddressVerificationMap({
  detectedZone,
  position,
  onPositionChange,
  loading = false,
  error = null,
  height = 300,
}: AddressVerificationMapProps) {
  const [viewport, setViewport] = useState({
    longitude: BOLIVAR_CENTER[0],
    latitude: BOLIVAR_CENTER[1],
    zoom: ZOOM.CITY,
  });
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapRef = useRef<Map | null>(null);
  const markerRef = useRef<Marker | null>(null);

  // Initialize map viewport when position is available
  useEffect(() => {
    if (position && !loading) {
      setViewport(v => ({
        ...v,
        longitude: position[0],
        latitude: position[1],
        zoom: ZOOM.NEIGHBORHOOD,
      }));
    }
  }, [position, loading]);

  // Load streets GeoJSON and zone boundaries when map loads
  useEffect(() => {
    if (!mapRef.current || !mapLoaded) return;

    const map = mapRef.current.getMap();
    if (!map) return;

    // Load bolivar-calles-simplified.geojson as a source
    const loadStreets = async () => {
      try {
        const res = await fetch('/bolivar-calles-simplified.geojson');
        if (!res.ok) throw new Error('Failed to load streets');
        const streetsData = await res.json();

        // Add streets source
        if (!map.getSource('bolivar-streets')) {
          map.addSource('bolivar-streets', {
            type: 'geojson',
            data: streetsData,
          });
        }

        // Add streets layer
        if (!map.getLayer('bolivar-streets-layer')) {
          map.addLayer({
            id: 'bolivar-streets-layer',
            type: 'line',
            source: 'bolivar-streets',
            paint: {
              'line-color': '#9ca3af', // gray-400
              'line-width': [
                'interpolate',
                ['linear'],
                ['zoom'],
                12, 0.5,
                14, 1,
                16, 1.5,
                18, 2,
              ],
              'line-opacity': 0.7,
            },
            filter: ['in', ['get', 'highway'],
              'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
              'unclassified', 'residential', 'living_street'
            ],
          });
        }

        // Add street labels
        if (!map.getLayer('bolivar-street-labels')) {
          map.addLayer({
            id: 'bolivar-street-labels',
            type: 'symbol',
            source: 'bolivar-streets',
            layout: {
              'text-field': ['get', 'name'],
              'text-font': ['Open Sans Regular'],
              'text-size': 10,
              'text-anchor': 'center',
              'symbol-placement': 'line',
              'symbol-spacing': 200,
            },
            paint: {
              'text-color': '#6b7280', // gray-500
              'text-halo-color': '#ffffff',
              'text-halo-width': 1,
            },
            minzoom: 15,
            filter: ['has', 'name'],
          });
        }
      } catch (err) {
        console.warn('Could not load streets:', err);
      }
    };

    // Load zone boundaries from bolivar.geojson
    const loadZones = async () => {
      try {
        const res = await fetch('/bolivar.geojson');
        if (!res.ok) throw new Error('Failed to load zones');
        const zonesData = await res.json();

        // Add a consistent zone_code property to each feature for filtering
        // The original GeoJSON has different property keys: "Planta Urbana", "Zona Barrial", "Zona Rural"
        const processedFeatures = zonesData.features.map((f: any) => {
          const props = f.properties || {};
          // Find the property value that matches a zone code
          const zoneCode = Object.values(props).find(v =>
            ['planta_urbana', 'zona_barrial', 'zona_rural'].includes(v)
          );
          return {
            ...f,
            properties: {
              ...props,
              zone_code: zoneCode || null,
              name: props['Planta Urbana'] ? 'Planta Urbana' :
                    props['Zona Barrial'] ? 'Zona Barrial' :
                    props['Zona Rural'] ? 'Zona Rural' : ''
            }
          };
        });

        const processedData = {
          ...zonesData,
          features: processedFeatures
        };

        if (!map.getSource('delivery-zones')) {
          map.addSource('delivery-zones', {
            type: 'geojson',
            data: processedData,
          });
        }

        // Add zone fill layers (in order: rural, barrial, urbana - so urbana is on top)
        const zoneOrder = ['planta_urbana', 'zona_barrial', 'zona_rural'];

        zoneOrder.forEach((code, index) => {
          const zoneStyle = getZoneStyle(code);
          if (!zoneStyle) return;

          const layerId = `zone-fill-${code}`;
          if (!map.getLayer(layerId)) {
            map.addLayer({
              id: layerId,
              type: 'fill',
              source: 'delivery-zones',
              paint: {
                'fill-color': zoneStyle.fillColor,
                'fill-opacity': zoneStyle.fillOpacity,
                // Remove fill-outline-color to avoid white square artifacts
              },
              filter: ['==', ['get', 'zone_code'], code],
            });
          }
        });

        // Add zone border layers on top (separate line layer for clean borders)
        zoneOrder.forEach((code) => {
          const zoneStyle = getZoneStyle(code);
          if (!zoneStyle) return;

          const layerId = `zone-border-${code}`;
          if (!map.getLayer(layerId)) {
            map.addLayer({
              id: layerId,
              type: 'line',
              source: 'delivery-zones',
              paint: {
                'line-color': zoneStyle.borderColor,
                'line-width': zoneStyle.borderWidth,
              },
              filter: ['==', ['get', 'zone_code'], code],
            });
          }
        });

        // Add zone labels
        if (!map.getLayer('zone-labels')) {
          map.addLayer({
            id: 'zone-labels',
            type: 'symbol',
            source: 'delivery-zones',
            layout: {
              'text-field': ['get', 'name'],
              'text-font': ['Open Sans Bold'],
              'text-size': 12,
              'text-anchor': 'center',
            },
            paint: {
              'text-color': '#1f2937', // gray-800
              'text-halo-color': '#ffffff',
              'text-halo-width': 2,
            },
            minzoom: 12,
            filter: ['has', 'zone_code'],
          });
        }

      } catch (err) {
        console.warn('Could not load zones:', err);
      }
    };

    loadStreets();
    loadZones();
  }, [mapLoaded]);

  // Update marker position when position prop changes
  useEffect(() => {
    if (markerRef.current && position) {
      markerRef.current.setLngLat(position);
      // Re-detect zone at new position
      if (mapRef.current?.getMap()) {
        detectZoneAtPosition(mapRef.current.getMap(), position);
      }
    }
  }, [position]);

  // Detect zone at a given position using the zone boundaries
  const detectZoneAtPosition = useCallback(async (map: any, lngLat: [number, number]) => {
    if (!map.getSource('delivery-zones')) return;

    try {
      // Query rendered features at the point
      const point = map.project(lngLat);
      const features = map.queryRenderedFeatures(point, {
        layers: ['zone-fill-planta_urbana', 'zone-fill-zona_barrial', 'zone-fill-zona_rural'],
      });

      // Priority: planta_urbana > zona_barrial > zona_rural
      const zoneOrder = ['planta_urbana', 'zona_barrial', 'zona_rural'];

      for (const code of zoneOrder) {
        const found = features.find(f => f.layer.id === `zone-fill-${code}`);
        if (found) {
          onPositionChange(lngLat, code);
          return;
        }
      }

      // No zone found
      onPositionChange(lngLat, null);
    } catch (err) {
      console.warn('Zone detection error:', err);
    }
  }, [onPositionChange]);

  // Handle marker drag end
  const handleDragEnd = useCallback(() => {
    if (markerRef.current && mapRef.current?.getMap()) {
      const lngLat = markerRef.current.getLngLat() as [number, number];
      detectZoneAtPosition(mapRef.current.getMap(), lngLat);
    }
  }, [detectZoneAtPosition]);

  // Handle map click to move marker
  const handleMapClick = useCallback((e: any) => {
    const lngLat = e.lngLat as [number, number];
    // Move marker immediately, zone detection will happen async via detectZoneAtPosition
    if (markerRef.current && mapRef.current?.getMap()) {
      markerRef.current.setLngLat(lngLat);
      detectZoneAtPosition(mapRef.current.getMap(), lngLat);
    }
  }, [detectZoneAtPosition]);

  // Show loading state
  if (loading) {
    return (
      <div className="rounded-xl bg-ink-50 border border-ink-200 h-[300px] flex items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink-300 border-t-brand-500 mx-auto" />
          <p className="mt-2 text-sm text-ink-500">Cargando mapa...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 h-[300px] flex items-center justify-center p-4">
        <div className="text-center text-red-700">
          <p className="font-medium">No se pudo cargar el mapa</p>
          <p className="text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  // Simple OSM raster tile style for MapLibre
  const osmStyle = {
    version: 8,
    sources: {
      osm: {
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

  return (
    <div className="relative rounded-xl overflow-hidden border border-ink-200">
      <Map
        ref={mapRef}
        initialViewState={{
          longitude: BOLIVAR_CENTER[0],
          latitude: BOLIVAR_CENTER[1],
          zoom: ZOOM.CITY,
          maxZoom: ZOOM.BUILDING,
          minZoom: ZOOM.CITY - 2,
        }}
        style={{ width: '100%', height: `${height}px` }}
        mapStyle={osmStyle}
        attributionControl={false}
        onLoad={() => setMapLoaded(true)}
        onViewportChange={setViewport}
        onClick={handleMapClick}
        maxBounds={BOLIVAR_BOUNDS}
      >
        {/* Current location marker */}
        {position && (
          <Marker
            ref={markerRef}
            longitude={position[0]}
            latitude={position[1]}
            draggable
            onDragEnd={handleDragEnd}
          >
            <div className="relative">
              <div className="w-6 h-6 rounded-full bg-brand-500 border-3 border-white shadow-lg" />
              <div className="absolute -top-1 -left-1 w-8 h-8 rounded-full bg-brand-500/30 animate-ping" />
            </div>
          </Marker>
        )}

        {/* Detected zone info popup */}
        {detectedZone && position && (
          <Popup
            longitude={position[0]}
            latitude={position[1]}
            closeButton={false}
            anchor="top"
            offset={20}
          >
            <div className="px-3 py-2 rounded-lg bg-white shadow-lg border border-ink-200">
              <p className="font-bold text-ink-900">{detectedZone.name}</p>
              <p className="text-sm text-ink-600">Envío: {new Intl.NumberFormat('es-AR', {
                style: 'currency', currency: 'ARS', minimumFractionDigits: 0
              }).format(detectedZone.price)}</p>
              <p className="text-xs text-ink-500 mt-1">Arrastrá el pin para corregir</p>
            </div>
          </Popup>
        )}
      </Map>

      {/* Zone legend */}
      <div className="absolute bottom-2 right-2 z-10 flex flex-col gap-1">
        {DELIVERY_ZONES.map((zone) => (
          <div key={zone.code} className="flex items-center gap-2 px-2 py-1 rounded bg-white/90 backdrop-blur-sm shadow-sm border border-ink-200 text-xs">
            <div
              className="w-3 h-3 rounded"
              style={{
                backgroundColor: zone.fillColor,
                opacity: zone.fillOpacity,
                border: `1px solid ${zone.borderColor}`,
              }}
            />
            <span className="text-ink-700 font-medium">{zone.name}</span>
            <span className="text-brand-600 font-bold">
              {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(zone.price)}
            </span>
          </div>
        ))}
      </div>

      {/* Zoom controls hint */}
      <div className="absolute bottom-2 left-2 z-10 px-2 py-1 rounded bg-white/90 backdrop-blur-sm shadow-sm border border-ink-200 text-xs text-ink-500">
        Click para mover · Arrastrá el pin
      </div>
    </div>
  );
}

export default AddressVerificationMap;