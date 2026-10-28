import { useEffect, useRef, useState, useCallback } from 'react';
import Map, { Marker, Popup } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { DELIVERY_ZONES, getZoneStyle, BOLIVAR_CENTER, ZOOM, BOLIVAR_BOUNDS } from '../lib/zoneStyles';
import type { ZoneMatch } from '../lib/zoneDetection';
import { pointInPolygon } from '../lib/zoneDetection';

interface AddressVerificationMapProps {
  /** Currently detected zone from geolocation */
  detectedZone: ZoneMatch | null;
  /** Current marker position [lng, lat] */
  position: [number, number] | null;
  /** Called when user drags the marker to a new position */
  onPositionChange: (position: [number, number], zoneCode: string | null, fullAddress: string | null) => void;
  /** Whether the map is loading */
  loading?: boolean;
  /** Map loading error (network, tiles, etc.) - shows full error screen */
  mapError?: string | null;
  /** Zone detection error (outside coverage) - shows warning on map but keeps map visible */
  zoneError?: string | null;
  /** Whether zone detection is in progress */
  zoneLoading?: boolean;
  /** Height of the map container */
  height?: number;
}

export function AddressVerificationMap({
  detectedZone,
  position,
  onPositionChange,
  loading = false,
  mapError = null,
  zoneError = null,
  zoneLoading = false,
  height = 300,
}: AddressVerificationMapProps) {
  const [mapLoaded, setMapLoaded] = useState(false);
  const [isLocating, setIsLocating] = useState(false);
  const zoneFeaturesRef = useRef<any[]>([]);
  const streetsDataRef = useRef<any>(null);
  const addressesDataRef = useRef<any>(null);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  // Detect zone at a given position using client-side point-in-polygon
  const detectZoneAtPosition = useCallback((lngLat: [number, number]) => {
    try {
      // Client-side zone detection using pointInPolygon (same as server)
      // Priority: planta_urbana > zona_barrial > zona_rural (smallest first for nested polygons)
      const zoneOrder = ['planta_urbana', 'zona_barrial', 'zona_rural'];

      let detectedZoneCode: string | null = null;

      for (const code of zoneOrder) {
        const feature = zoneFeaturesRef.current.find(f => f.properties?.zone_code === code);
        if (feature && pointInPolygon(lngLat, feature.geometry)) {
          detectedZoneCode = code;
          break;
        }
      }

      // Detect exact building address (street + house number) using point-in-polygon on building footprints
      let detectedStreet: string | null = null;
      let detectedHouseNumber: string | null = null;

      if (addressesDataRef.current?.features) {
        for (const feature of addressesDataRef.current.features) {
          const geom = feature.geometry;
          const props = feature.properties || {};

          // Check if point is inside building polygon
          if (geom && (geom.type === 'Polygon' || geom.type === 'MultiPolygon') && pointInPolygon(lngLat, geom)) {
            detectedStreet = props['addr:street'] || props['addr:housename'] || null;
            detectedHouseNumber = props['addr:housenumber'] || null;
            break; // Found the building, stop searching
          }
        }
      }

      // Fallback: nearest street if no building found
      if (!detectedStreet && streetsDataRef.current?.features) {
        let minDistance = Infinity;
        for (const feature of streetsDataRef.current.features) {
          if (!feature.properties?.name || feature.geometry?.type !== 'LineString') continue;

          const coords = feature.geometry.coordinates;
          for (let i = 0; i < coords.length - 1; i++) {
            const [lng1, lat1] = coords[i];
            const [lng2, lat2] = coords[i + 1];

            const A = lngLat[0] - lng1;
            const B = lngLat[1] - lat1;
            const C = lng2 - lng1;
            const D = lat2 - lat1;

            const dot = A * C + B * D;
            const lenSq = C * C + D * D;
            let param = -1;
            if (lenSq !== 0) param = dot / lenSq;

            let xx, yy;
            if (param < 0) { xx = lng1; yy = lat1; }
            else if (param > 1) { xx = lng2; yy = lat2; }
            else { xx = lng1 + param * C; yy = lat1 + param * D; }

            const dx = lngLat[0] - xx;
            const dy = lngLat[1] - yy;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < minDistance) {
              minDistance = dist;
              detectedStreet = feature.properties.name;
            }
          }
        }
        if (minDistance > 0.0005) detectedStreet = null;
      }

      // Combine street + house number for the address
      const fullAddress = detectedStreet && detectedHouseNumber
        ? `${detectedStreet} ${detectedHouseNumber}`
        : detectedStreet;

      onPositionChange(lngLat, detectedZoneCode, fullAddress);
    } catch (err) {
      console.warn('Zone detection error:', err);
      onPositionChange(lngLat, null, null);
    }
  }, [onPositionChange]);

  // Handle "My Location" button click
  const handleLocateMe = useCallback(async () => {
    if (!navigator.geolocation) {
      console.warn('Geolocation not supported');
      return;
    }
    setIsLocating(true);
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0,
        });
      });
      const lngLat: [number, number] = [position.coords.longitude, position.coords.latitude];
      // Update viewport to center on user location
      mapRef.current?.jumpTo?.({ center: lngLat, zoom: ZOOM.NEIGHBORHOOD });
      // Move marker and trigger detection
      if (markerRef.current) {
        markerRef.current.setLngLat(lngLat);
      }
      detectZoneAtPosition(lngLat);
    } catch (err) {
      console.warn('Geolocation failed:', err);
    } finally {
      setIsLocating(false);
    }
  }, [detectZoneAtPosition]);

  // Initialize map viewport when position is available
  useEffect(() => {
    if (position && !loading) {
      mapRef.current?.jumpTo?.({ center: position, zoom: ZOOM.NEIGHBORHOOD });
    }
  }, [position, loading]);

  // Load streets GeoJSON and zone boundaries when map loads
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    // Load bolivar-calles-simplified.geojson as a source
    const loadStreets = async () => {
      try {
        const res = await fetch('/bolivar-calles-simplified.geojson');
        if (!res.ok) throw new Error('Failed to load streets');
        const streetsData = await res.json();

        // Store for client-side street detection
        streetsDataRef.current = streetsData;

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
            ] as any,
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
          const zoneCode = (Object.values(props) as string[]).find(v =>
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

        // Store for client-side zone detection
        zoneFeaturesRef.current = processedFeatures;

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

        zoneOrder.forEach((code) => {
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
    loadAddresses();
  }, [mapLoaded]);

  // Load building addresses with house numbers from bolivar-addresses.geojson
  const loadAddresses = async () => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    try {
      const res = await fetch('/bolivar-addresses.geojson');
      if (!res.ok) throw new Error('Failed to load addresses');
      const addressesData = await res.json();

      // Store for client-side building address detection
      addressesDataRef.current = addressesData;

      // Add addresses source (building footprints)
      if (!map.getSource('bolivar-addresses')) {
        map.addSource('bolivar-addresses', {
          type: 'geojson',
          data: addressesData,
        });
      }

      // Add building footprints layer (subtle, for visual reference at high zoom)
      if (!map.getLayer('bolivar-addresses-layer')) {
        map.addLayer({
          id: 'bolivar-addresses-layer',
          type: 'fill',
          source: 'bolivar-addresses',
          paint: {
            'fill-color': '#e5e7eb', // gray-200
            'fill-opacity': [
              'interpolate',
              ['linear'],
              ['zoom'],
              16, 0,
              18, 0.15,
              20, 0.3,
            ],
          },
          minzoom: 16,
        });
      }

      // Add building outlines
      if (!map.getLayer('bolivar-addresses-outline')) {
        map.addLayer({
          id: 'bolivar-addresses-outline',
          type: 'line',
          source: 'bolivar-addresses',
          paint: {
            'line-color': '#9ca3af', // gray-400
            'line-width': [
              'interpolate',
              ['linear'],
              ['zoom'],
              16, 0,
              18, 0.5,
              20, 1,
            ],
            'line-opacity': 0.5,
          },
          minzoom: 16,
        });
      }

      // Add house number labels at high zoom
      if (!map.getLayer('bolivar-house-numbers')) {
        map.addLayer({
          id: 'bolivar-house-numbers',
          type: 'symbol',
          source: 'bolivar-addresses',
          layout: {
            'text-field': ['get', 'addr:housenumber'],
            'text-font': ['Open Sans Regular'],
            'text-size': 10,
            'text-anchor': 'center',
            'text-allow-overlap': true,
          },
          paint: {
            'text-color': '#374151', // gray-700
            'text-halo-color': '#ffffff',
            'text-halo-width': 1,
          },
          minzoom: 18,
          filter: ['has', 'addr:housenumber'],
        });
      }

    } catch (err) {
      console.warn('Could not load building addresses:', err);
    }
  };

  useEffect(() => {
    if (markerRef.current && position && !Number.isNaN(position[0]) && !Number.isNaN(position[1])) {
      markerRef.current.setLngLat(position);
      // Re-detect zone at new position
      detectZoneAtPosition(position);
    }
  }, [position]);

  // Handle marker drag end
  const handleDragEnd = useCallback(() => {
    if (markerRef.current) {
      const ll = markerRef.current.getLngLat();
      const lngLat = ll?.toArray?.() ?? [ll?.lng, ll?.lat];
      if (lngLat && !Number.isNaN(lngLat[0]) && !Number.isNaN(lngLat[1])) {
        detectZoneAtPosition(lngLat);
      }
    }
  }, [detectZoneAtPosition]);

  // Handle map click to move marker
  const handleMapClick = useCallback((e: any) => {
    // In MapLibre, e.lngLat is an LngLat object, convert to array
    const lngLat = e.lngLat?.toArray?.() ?? [e.lngLat?.lng, e.lngLat?.lat];
    if (!lngLat || Number.isNaN(lngLat[0]) || Number.isNaN(lngLat[1])) return;
    // Move marker immediately, zone detection will happen async via detectZoneAtPosition
    if (markerRef.current) {
      markerRef.current.setLngLat(lngLat);
      detectZoneAtPosition(lngLat);
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

  // Show map loading error state (only for actual map loading failures)
  if (mapError) {
    return (
      <div className="rounded-xl bg-red-50 border border-red-200 h-[300px] flex items-center justify-center p-4">
        <div className="text-center text-red-700">
          <p className="font-medium">No se pudo cargar el mapa</p>
          <p className="text-sm mt-1">{mapError}</p>
        </div>
      </div>
    );
  }

  // Simple raster tile style for MapLibre - using CartoDB (free, no API key, generous limits)
  const osmStyle = {
    version: 8,
    sources: {
      carto: {
        type: 'raster',
        tiles: [
          'https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
          'https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
          'https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
          'https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        ],
        tileSize: 256,
        attribution: '© CARTO, © OpenStreetMap contributors',
        maxzoom: 20,
      },
    },
    layers: [
      {
        id: 'carto-layer',
        type: 'raster',
        source: 'carto',
        minzoom: 0,
        maxzoom: 20,
      },
    ],
  };

  return (
    <div className="relative rounded-xl overflow-hidden border border-ink-200">
      {/* Zone error warning banner */}
      {zoneError && (
        <div className="absolute top-2 left-2 right-2 z-20 mx-2 px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm font-medium text-center shadow-lg animate-slide-down">
          ⚠️ {zoneError}
        </div>
      )}

      {/* Zone loading indicator */}
      {zoneLoading && !zoneError && !detectedZone && (
        <div className="absolute top-2 left-2 right-2 z-20 mx-2 px-3 py-2 rounded-lg bg-brand-50 border border-brand-200 text-brand-700 text-sm font-medium text-center shadow-lg animate-slide-down">
          Detectando zona...
        </div>
      )}

      <Map
        ref={mapRef}
        initialViewState={{
          longitude: BOLIVAR_CENTER[0],
          latitude: BOLIVAR_CENTER[1],
          zoom: ZOOM.CITY,
        }}
        maxZoom={ZOOM.BUILDING}
        minZoom={ZOOM.CITY - 2}
        style={{ width: '100%', height: `${height}px` }}
        mapStyle={osmStyle as any}
        attributionControl={false}
        onLoad={() => setMapLoaded(true)}
        onClick={handleMapClick}
        maxBounds={[
          BOLIVAR_BOUNDS[0][0], BOLIVAR_BOUNDS[0][1],
          BOLIVAR_BOUNDS[1][0], BOLIVAR_BOUNDS[1][1]
        ] as [number, number, number, number]}
      >
        {/* Current location marker - color changes based on zone status */}
        {position && (
          <Marker
            ref={markerRef}
            longitude={position[0]}
            latitude={position[1]}
            draggable
            onDragEnd={handleDragEnd}
          >
            <div className="relative">
              <div className={`w-6 h-6 rounded-full border-3 border-white shadow-lg ${
                zoneError ? 'bg-red-500' : detectedZone ? 'bg-brand-500' : 'bg-gray-400'
              }`} />
              <div className={`absolute -top-1 -left-1 w-8 h-8 rounded-full animate-ping ${
                zoneError ? 'bg-red-500/30' : detectedZone ? 'bg-brand-500/30' : 'bg-gray-400/30'
              }`} />
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

        {/* Outside coverage popup */}
        {zoneError && position && !detectedZone && (
          <Popup
            longitude={position[0]}
            latitude={position[1]}
            closeButton={false}
            anchor="top"
            offset={20}
          >
            <div className="px-3 py-2 rounded-lg bg-red-50 shadow-lg border border-red-200">
              <p className="font-bold text-red-700">Fuera de cobertura</p>
              <p className="text-sm text-red-600">No hay servicio de entrega en esta zona</p>
              <p className="text-xs text-red-500 mt-1">Mové el pin a una zona cubierta</p>
            </div>
          </Popup>
        )}
      </Map>

      {/* Map controls - top right */}
      <div className="absolute top-2 right-2 z-10 flex flex-col gap-1.5">
        {/* My Location button - Enhanced like Google Maps */}
        <div className="relative group">
          <button
            type="button"
            onClick={handleLocateMe}
            disabled={isLocating || !mapLoaded}
            className="w-11 h-11 rounded-xl bg-white shadow-lg border border-ink-200/50 flex items-center justify-center transition-all duration-200
              hover:shadow-xl hover:border-brand-300 hover:-translate-y-0.5
              active:scale-95 active:shadow-md
              disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:transform-none disabled:hover:shadow-lg
              focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2
              relative overflow-hidden"
            aria-label={isLocating ? 'Obteniendo ubicación...' : 'Mostrar mi ubicación'}
            title={isLocating ? 'Obteniendo ubicación...' : 'Mostrar mi ubicación'}
          >
            {/* Active indicator ring when location is centered */}
            {position && !isLocating && (
              <span className="absolute inset-0 rounded-xl ring-2 ring-brand-500/30 animate-ping opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            )}

            <svg
              className={`w-5.5 h-5.5 transition-all duration-300 ${
                isLocating
                  ? 'animate-spin text-brand-500'
                  : position
                    ? 'text-brand-500'
                    : 'text-ink-700 hover:text-brand-500'
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
              <path d="M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" strokeWidth={1.5} />
            </svg>

            {/* Loading indicator */}
            {isLocating && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="sr-only">Obteniendo ubicación...</span>
              </span>
            )}
          </button>

          {/* Tooltip on hover */}
          <div className="absolute right-full mr-2 top-1/2 -translate-y-1/2
            opacity-0 invisible group-hover:opacity-100 group-hover:visible
            transition-all duration-200 whitespace-nowrap pointer-events-none">
            <span className="px-2.5 py-1.5 text-xs font-medium text-white bg-ink-900/95 rounded-lg shadow-lg backdrop-blur-sm">
              {isLocating ? 'Obteniendo ubicación…' : 'Centrar en mi ubicación'}
            </span>
            <span className="absolute right-[-4px] top-1/2 -translate-y-1/2 border-4 border-transparent border-l-ink-900/95" />
          </div>
        </div>

        {/* Zoom controls - Enhanced */}
        <div className="flex flex-col gap-1 bg-white/5 backdrop-blur-sm rounded-xl border border-ink-200/50 p-1 shadow-lg">
          <button
            type="button"
            onClick={() => mapRef.current?.zoomIn?.()}
            className="w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-150
              hover:bg-ink-100 hover:text-brand-500
              active:scale-95 active:bg-ink-200
              focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
            aria-label="Acercar"
            title="Acercar (+)"
          >
            <svg className="w-5 h-5 text-ink-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round"><path d="M12 5v14M5 12h14"/></svg>
          </button>
          <div className="h-px bg-ink-200/50 mx-2 my-0.5" />
          <button
            type="button"
            onClick={() => mapRef.current?.zoomOut?.()}
            className="w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-150
              hover:bg-ink-100 hover:text-brand-500
              active:scale-95 active:bg-ink-200
              focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
            aria-label="Alejar"
            title="Alejar (-)"
          >
            <svg className="w-5 h-5 text-ink-700" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2} strokeLinecap="round"><path d="M5 12h14"/></svg>
          </button>
        </div>
      </div>

      {/* Zone legend */}
      <div className="absolute bottom-2 right-2 z-10 flex flex-col gap-1">
        {DELIVERY_ZONES.map((zone) => (
          <div key={zone.code} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-white/95 backdrop-blur-sm shadow-lg border border-ink-200 text-xs">
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

      {/* Hint */}
      <div className="absolute bottom-2 left-2 z-10 px-3 py-1.5 rounded-lg bg-white/95 backdrop-blur-sm shadow-lg border border-ink-200 text-xs text-ink-500">
        Click para mover · Arrastrá el pin
      </div>
    </div>
  );
}

export default AddressVerificationMap;