import { useEffect, useRef, useState, useCallback } from 'react';
import Map, { Marker, Popup } from 'react-map-gl/maplibre';
import { DELIVERY_ZONES, BOLIVAR_CENTER, ZOOM, BOLIVAR_BOUNDS } from '../lib/zoneStyles';
import type { ZoneMatch } from '../lib/zoneDetection';
import { pointInPolygon, formatCoordinatesAsAddress } from '../lib/zoneDetection';

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
  const [geojsonLoaded, setGeojsonLoaded] = useState(false);
  const [callesLoaded, setCallesLoaded] = useState(false);
  const [callesGeoJson, setCallesGeoJson] = useState<any>(null);
  const [geojsonError, setGeojsonError] = useState<string | null>(null);
  const zoneFeaturesRef = useRef<any[]>([]);
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  // Initialize map when ref is set (callback ref pattern - replaces onLoad which doesn't fire in v8)
  const initializeMap = useCallback((mapInstance: any) => {
    if (!mapInstance) return;
    console.log('[Map] Map instance ready via callback ref');
    setMapLoaded(true);
    (window as any).__MAP__ = mapInstance;
    console.log('[Map] MapLibre loaded with raster tiles (self-hosted, no external deps)');
  }, []);

  // Detect zone at a given position using client-side point-in-polygon
  // Uses zoneFeaturesRef populated from the GeoJSON on mount
  const detectZoneAtPosition = useCallback((lngLat: [number, number], fullAddress?: string) => {
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

      onPositionChange(lngLat, detectedZoneCode, fullAddress ?? null);
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
      // Move marker and trigger detection with formatted address
      if (markerRef.current) {
        markerRef.current.setLngLat(lngLat);
      }
      // Pass formatted coordinates as address (local, no external API)
      const formattedAddress = formatCoordinatesAsAddress(lngLat);
      detectZoneAtPosition(lngLat, formattedAddress);
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

  // Debug: Component mount
  useEffect(() => {
    console.log('[AddressVerificationMap] Component MOUNTED');
    return () => console.log('[AddressVerificationMap] Component UNMOUNTED');
  }, []);

  // Fetch GeoJSON files for client-side zone detection (point-in-polygon)
  // The map itself loads GeoJSON via URL sources in mapStyle
  useEffect(() => {
    let cancelled = false;

    const loadBothGeoJSON = async () => {
      try {
        console.log('[Map] Fetching GeoJSON for zone detection...');

        // Fetch both in parallel
        const [zonasRes, callesRes] = await Promise.all([
          fetch('/bolivar.geojson'),
          fetch('/bolivar-calles-simplified.geojson'),
        ]);

        if (!zonasRes.ok) throw new Error(`Failed to load bolivar.geojson: ${zonasRes.status}`);
        if (!callesRes.ok) throw new Error(`Failed to load bolivar-calles-simplified.geojson: ${callesRes.status}`);

        const [zonasData, callesData] = await Promise.all([
          zonasRes.json(),
          callesRes.json(),
        ]);

        if (cancelled) return;

        console.log('[Map] Zonas GeoJSON loaded:', zonasData.features?.length, 'features');
        console.log('[Map] Calles GeoJSON loaded:', callesData.features?.length, 'features');

        // Store calles GeoJSON for vector street labels
        setCallesGeoJson(callesData);
        setCallesLoaded(true);

        // Process zone features for client-side detection
        const features = (zonasData.features || []).map((f: any) => {
          const props = f.properties || {};
          const zoneCode = (Object.values(props) as string[]).find(v =>
            ['planta_urbana', 'zona_barrial', 'zona_rural'].includes(v)
          ) || null;

          const zoneStyle = DELIVERY_ZONES.find(z => z.code === zoneCode);

          return {
            ...f,
            properties: {
              ...props,
              zone_code: zoneCode,
              name: props.name ||
                (props['Planta Urbana'] ? 'Planta Urbana' :
                  props['Zona Barrial'] ? 'Zona Barrial' :
                    props['Zona Rural'] ? 'Zona Rural' : ''),
              borderColor: zoneStyle?.borderColor || '#9ca3af',
              borderWidth: zoneStyle?.borderWidth || 2,
            }
          };
        });

        zoneFeaturesRef.current = features;
        console.log('[AddressVerificationMap] Loaded zone features from GeoJSON:', features.length, features.map((f: any) => f.properties.zone_code));

        setGeojsonLoaded(true);
        setGeojsonError(null);
      } catch (err) {
        if (cancelled) return;
        console.error('[Map] Failed to load GeoJSON files:', err);
        setGeojsonError(err instanceof Error ? err.message : 'Error loading map data');
      }
    };

    loadBothGeoJSON();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (markerRef.current && position && !Number.isNaN(position[0]) && !Number.isNaN(position[1])) {
      markerRef.current.setLngLat(position);
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
    const lngLat = e.lngLat?.toArray?.() ?? [e.lngLat?.lng, e.lngLat?.lat];
    if (!lngLat || Number.isNaN(lngLat[0]) || Number.isNaN(lngLat[1])) return;
    if (markerRef.current) {
      markerRef.current.setLngLat(lngLat);
      detectZoneAtPosition(lngLat);
    }
  }, [detectZoneAtPosition]);

  // Show loading state
  if (loading || !geojsonLoaded) {
    return (
      <div className="rounded-xl bg-ink-50 border border-ink-200 h-[300px] flex items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-ink-300 border-t-brand-500 mx-auto" />
          <p className="mt-2 text-sm text-ink-500">
            {geojsonError ? 'Error cargando datos del mapa' : 'Cargando mapa...'}
          </p>
          {geojsonError && <p className="mt-1 text-xs text-red-500">{geojsonError}</p>}
        </div>
      </div>
    );
  }

  // Show map loading error state
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

  // Build map style dynamically to include vector street labels when GeoJSON is loaded
  const mapStyle = {
    version: 8,
    sources: {
      zonas: {
        type: 'raster',
        tiles: ['/tiles/zonas/{z}/{x}/{y}.png'],
        tileSize: 256,
        minzoom: 10,
        maxzoom: 16,
      },
      calles: {
        type: 'raster',
        tiles: ['/tiles/calles/{z}/{x}/{y}.png'],
        tileSize: 256,
        minzoom: 10,
        maxzoom: 16,
      },
      // Vector source for street labels from local GeoJSON (added when loaded)
      ...(callesLoaded && callesGeoJson ? {
        calles_vector: {
          type: 'geojson',
          data: callesGeoJson,
          generateId: true,
          maxzoom: 18,
        },
      } : {}),
    },
    layers: [
      // Background layer (solid color - no external tiles needed)
      {
        id: 'background',
        type: 'background',
        paint: {
          'background-color': '#f3f4f6', // light gray (gray-100)
        },
      },
      // Calles raster layer
      {
        id: 'streets-raster',
        type: 'raster',
        source: 'calles',
        paint: {
          'raster-opacity': 0.8,
        },
      },
      // Zonas raster layer - reduced opacity to be less intrusive
      {
        id: 'zonas-raster',
        type: 'raster',
        source: 'zonas',
        paint: {
          'raster-opacity': 0.35,
        },
      },
      // Street name labels (vector layer on top) - only when GeoJSON is loaded
      ...(callesLoaded && callesGeoJson ? [{
        id: 'street-labels',
        type: 'symbol',
        source: 'calles_vector',
        minzoom: 14,
        maxzoom: 20,
        filter: ['==', ['geometry-type'], 'LineString'],
        layout: {
          'text-field': ['get', 'name'],
          'text-font': ['Open Sans Regular', 'Arial Unicode MS Regular'],
          'text-size': 11,
          'text-letter-spacing': 0.05,
          'text-anchor': 'center',
          'symbol-placement': 'line',
          'text-rotate': 0,
          'text-padding': 2,
          'text-keep-upright': true,
          'text-max-width': 12,
          'text-max-angle': 45,
        },
        paint: {
          'text-color': '#374151',
          'text-halo-color': '#ffffff',
          'text-halo-width': 1.5,
          'text-halo-blur': 0.5,
          'text-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0.5, 16, 1],
        },
      }] : []),
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
        ref={(el) => { mapRef.current = el; if (el) initializeMap(el.getMap()); }}
        initialViewState={{
          longitude: BOLIVAR_CENTER[0],
          latitude: BOLIVAR_CENTER[1],
          zoom: ZOOM.CITY,
        }}
        maxZoom={ZOOM.BUILDING}
        minZoom={ZOOM.CITY - 2}
        style={{ width: '100%', height: `${height}px` }}
        mapStyle={mapStyle}
        onClick={handleMapClick}
        maxBounds={[
          BOLIVAR_BOUNDS[0][0], BOLIVAR_BOUNDS[0][1],
          BOLIVAR_BOUNDS[1][0], BOLIVAR_BOUNDS[1][1]
        ] as [number, number, number, number]}
        // Fix: Explicit worker URL to avoid MIME type issues in Vite
        workerUrl="/assets/maplibre-gl-worker.mjs"
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
              <path d="M4.93 4.93l1.41 1.41M17.66 17.66l1.41-1.41M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" strokeWidth={1.5} />
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