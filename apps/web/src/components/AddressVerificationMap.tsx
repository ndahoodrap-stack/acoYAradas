import { useEffect, useRef, useState, useCallback } from 'react';
import Map, { Marker, Popup } from 'react-map-gl/maplibre';
import { Protocol } from 'pmtiles';
import * as maplibregl from 'maplibre-gl';
import { DELIVERY_ZONES, getZoneStyle, BOLIVAR_CENTER, ZOOM, BOLIVAR_BOUNDS } from '../lib/zoneStyles';
import type { ZoneMatch } from '../lib/zoneDetection';
import { pointInPolygon } from '../lib/zoneDetection';

// Configurar maplibre-gl ESM (la misma instancia que usa react-map-gl/maplibre)
maplibregl.workerCount = 0;
maplibregl.addProtocol('pmtiles', new Protocol());
console.log('[maplibre-gl] ESM configured: workerCount=0, pmtiles protocol registered');

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
  const mapRef = useRef<any>(null);
  const markerRef = useRef<any>(null);

  // Detect zone at a given position using client-side point-in-polygon
  // Uses zoneFeaturesRef populated from the vector tiles on map load
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

      // For street/house detection, we could query the vector tiles directly
      // but for simplicity we'll rely on the marker position + zone detection
      // The PMTiles contains all the data; we could add queryRenderedFeatures here if needed

      onPositionChange(lngLat, detectedZoneCode, null);
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

  // Load zone features from vector tiles for client-side point-in-polygon detection
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    // Query the 'zonas' source-layer to get zone polygons for point-in-polygon
    // We do this once on map load to populate zoneFeaturesRef
    const loadZoneFeatures = () => {
      try {
        // Get features from the vector tile source
        const features = map.querySourceFeatures('bolivar', {
          sourceLayer: 'zonas',
        });

        // Process features to ensure consistent zone_code property
        const processedFeatures = features.map((f: any) => {
          const props = f.properties || {};
          // The tippecanoe layers should already have zone_code from the original GeoJSON
          const zoneCode = props.zone_code ||
            (Object.values(props) as string[]).find(v =>
              ['planta_urbana', 'zona_barrial', 'zona_rural'].includes(v)
            ) || null;

          return {
            ...f,
            properties: {
              ...props,
              zone_code: zoneCode,
              name: props.name ||
                (props['Planta Urbana'] ? 'Planta Urbana' :
                  props['Zona Barrial'] ? 'Zona Barrial' :
                    props['Zona Rural'] ? 'Zona Rural' : ''),
            }
          };
        });

        zoneFeaturesRef.current = processedFeatures;
        console.log('[AddressVerificationMap] Loaded zone features:', processedFeatures.length);
      } catch (err) {
        console.warn('Could not load zone features from vector tiles:', err);
      }
    };

    // Wait a bit for tiles to load, then query
    const timer = setTimeout(loadZoneFeatures, 500);
    return () => clearTimeout(timer);
  }, [mapLoaded]);

  // Also re-query on map move/zoom to catch tiles at different zoom levels
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    const handleMapMove = () => {
      // Debounce
      clearTimeout((window as any).__zoneQueryTimer);
      (window as any).__zoneQueryTimer = setTimeout(() => {
        try {
          const features = map.querySourceFeatures('bolivar', {
            sourceLayer: 'zonas',
          });
          const processedFeatures = features.map((f: any) => {
            const props = f.properties || {};
            const zoneCode = props.zone_code ||
              (Object.values(props) as string[]).find(v =>
                ['planta_urbana', 'zona_barrial', 'zona_rural'].includes(v)
              ) || null;
            return {
              ...f,
              properties: {
                ...props,
                zone_code: zoneCode,
                name: props.name ||
                  (props['Planta Urbana'] ? 'Planta Urbana' :
                    props['Zona Barrial'] ? 'Zona Barrial' :
                      props['Zona Rural'] ? 'Zona Rural' : ''),
              }
            };
          });
          zoneFeaturesRef.current = processedFeatures;
        } catch (err) {
          // Ignore
        }
      }, 300);
    };

    map.on('moveend', handleMapMove);
    return () => map.off('moveend', handleMapMove);
  }, [mapLoaded]);

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

  // Minimal initial style - real source/layers added programmatically in onLoad
  // to ensure they use the same maplibregl instance (with pmtiles protocol registered)
  const minimalStyle = {
    version: 8,
    sources: {},
    layers: [],
  };

  // Layer definitions for programmatic addition
  const layerDefinitions = [
    // 1. Calles
    {
      id: 'streets',
      type: 'line' as const,
      source: 'bolivar',
      'source-layer': 'calles',
      paint: {
        'line-color': '#9ca3af',
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
      filter: ['in', ['get', 'highway'], ['literal', ['motorway', 'trunk', 'primary', 'secondary', 'tertiary', 'unclassified', 'residential', 'living_street']]],
    },
    // 2. Labels de calles
    {
      id: 'street-labels',
      type: 'symbol' as const,
      source: 'bolivar',
      'source-layer': 'calles',
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Open Sans Regular'],
        'text-size': 10,
        'text-anchor': 'center',
        'symbol-placement': 'line',
        'symbol-spacing': 200,
      },
      paint: {
        'text-color': '#6b7280',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1,
      },
      minzoom: 15,
      filter: ['has', 'name'],
    },
    // 3. Zonas fills
    {
      id: 'zone-fill-planta_urbana',
      type: 'fill' as const,
      source: 'bolivar',
      'source-layer': 'zonas',
      paint: { 'fill-color': '#10b981', 'fill-opacity': 0.15 },
      filter: ['==', ['get', 'zone_code'], 'planta_urbana'],
    },
    {
      id: 'zone-fill-zona_barrial',
      type: 'fill' as const,
      source: 'bolivar',
      'source-layer': 'zonas',
      paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.15 },
      filter: ['==', ['get', 'zone_code'], 'zona_barrial'],
    },
    {
      id: 'zone-fill-zona_rural',
      type: 'fill' as const,
      source: 'bolivar',
      'source-layer': 'zonas',
      paint: { 'fill-color': '#ef4444', 'fill-opacity': 0.15 },
      filter: ['==', ['get', 'zone_code'], 'zona_rural'],
    },
    // 4. Bordes de zonas
    {
      id: 'zone-borders',
      type: 'line' as const,
      source: 'bolivar',
      'source-layer': 'zonas',
      paint: {
        'line-color': ['get', 'borderColor'],
        'line-width': ['get', 'borderWidth']
      },
      filter: ['has', 'zone_code'],
    },
    // 5. Labels de zonas
    {
      id: 'zone-labels',
      type: 'symbol' as const,
      source: 'bolivar',
      'source-layer': 'zonas',
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Open Sans Bold'],
        'text-size': 12,
        'text-anchor': 'center',
      },
      paint: {
        'text-color': '#1f2937',
        'text-halo-color': '#ffffff',
        'text-halo-width': 2
      },
      minzoom: 12,
      filter: ['has', 'zone_code'],
    },
    // 6. Edificios
    {
      id: 'building-footprints',
      type: 'fill' as const,
      source: 'bolivar',
      'source-layer': 'direcciones',
      paint: {
        'fill-color': '#e5e7eb',
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
    },
    {
      id: 'building-outlines',
      type: 'line' as const,
      source: 'bolivar',
      'source-layer': 'direcciones',
      paint: {
        'line-color': '#9ca3af',
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
    },
    {
      id: 'house-numbers',
      type: 'symbol' as const,
      source: 'bolivar',
      'source-layer': 'direcciones',
      layout: {
        'text-field': ['get', 'addr:housenumber'],
        'text-font': ['Open Sans Regular'],
        'text-size': 10,
        'text-anchor': 'center',
        'text-allow-overlap': true,
      },
      paint: {
        'text-color': '#374151',
        'text-halo-color': '#ffffff',
        'text-halo-width': 1
      },
      minzoom: 18,
      filter: ['has', 'addr:housenumber'],
    },
  ];

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
        maplibregl={maplibregl}
        initialViewState={{
          longitude: BOLIVAR_CENTER[0],
          latitude: BOLIVAR_CENTER[1],
          zoom: ZOOM.CITY,
        }}
        maxZoom={ZOOM.BUILDING}
        minZoom={ZOOM.CITY - 2}
        style={{ width: '100%', height: `${height}px` }}
        mapStyle={minimalStyle as any}
        attributionControl={false}
        onLoad={() => {
          setMapLoaded(true);
          // Obtener instancia MapLibre real via ref (react-map-gl wrapper)
          const map = mapRef.current?.getMap?.();
          if (!map) {
            console.error('[Map] No se pudo obtener instancia MapLibre via ref');
            return;
          }

          // Expose globally for debugging: window.__MAP__
          (window as any).__MAP__ = map;

          // Añadir source PMTiles programáticamente (protocolo ya registrado en maplibregl ESM)
          try {
            map.addSource('bolivar', {
              type: 'vector',
              url: 'pmtiles://https://ndahoodrap-stack.github.io/acoYAradas/bolivar.pmtiles',
              maxzoom: 16,
            });
            console.log('[Map] Source "bolivar" added programmatically');
          } catch (e) {
            console.error('[Map] Failed to add source:', e);
            return;
          }

          // Añadir todas las capas programáticamente
          try {
            for (const layer of layerDefinitions) {
              map.addLayer(layer as any);
            }
            console.log('[Map] All layers added programmatically:', layerDefinitions.length);
          } catch (e) {
            console.error('[Map] Failed to add layers:', e);
          }

          // DEBUG: Log source info
          console.log('[Map] MapLibre loaded, source added');
          try {
            const source = map.getSource('bolivar');
            console.log('[Map] Source "bolivar":', source);
            if (source) {
              console.log('[Map] Source type:', source.type);
            }
          } catch (e) {
            console.error('[Map] Error getting source:', e);
          }

          // Check source caches after a short delay
          setTimeout(() => {
            try {
              const style = map.getStyle();
              if (style && (style as any).sourceCaches) {
                console.log('[Map] Source caches:', Object.keys((style as any).sourceCaches));
                const bolivarCache = (style as any).sourceCaches.bolivar;
                if (bolivarCache) {
                  console.log('[Map] Bolivar source cache:', bolivarCache);
                  if (bolivarCache._tiles) {
                    console.log('[Map] Tiles loaded:', Object.keys(bolivarCache._tiles).length);
                  }
                }
              }
            } catch (e) {
              console.error('[Map] Error inspecting style:', e);
            }
          }, 2000);
        }}
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