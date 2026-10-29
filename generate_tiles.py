#!/usr/bin/env python3
"""
Generate raster tiles (PNG) from GeoJSON for Bolívar delivery zones.
Uses shapely for geometry and Pillow for rendering.
Run once to create static tiles, then serve them locally via MapLibre XYZ source.
"""

import json
import math
import os
import sys
from pathlib import Path

from shapely.geometry import shape, mapping, LineString, Polygon, MultiPolygon, MultiLineString
from shapely.ops import transform
from PIL import Image, ImageDraw

# Configuration
WEB_PUBLIC = Path("apps/web/public")
ZONAS_FILE = WEB_PUBLIC / "bolivar.geojson"
CALLES_FILE = WEB_PUBLIC / "bolivar-calles-simplified.geojson"
OUTPUT_DIR = WEB_PUBLIC / "tiles"

# Bolívar bounds [min_lon, min_lat, max_lon, max_lat]
BOLIVAR_BOUNDS = [-61.25, -36.35, -60.95, -36.10]

# Zoom levels to generate (10-16: city to street level, sufficient for delivery zones)
MIN_ZOOM = 10
MAX_ZOOM = 16

TILE_SIZE = 256

# Colors for zones (matching DELIVERY_ZONES from zoneStyles.ts)
ZONE_COLORS = {
    'planta_urbana': {'fill': (0x16, 0xa3, 0x4a, 100), 'border': (0x15, 0x80, 0x3d, 255), 'width': 2},  # green
    'zona_barrial':  {'fill': (0xea, 0xb3, 0x08, 100), 'border': (0xca, 0x8a, 0x04, 255), 'width': 2},  # yellow
    'zona_rural':    {'fill': (0xf9, 0x73, 0x16, 100), 'border': (0xea, 0x58, 0x0c, 255), 'width': 2},  # orange
}

# Street colors by highway type
STREET_COLORS = {
    'motorway': (0x9c, 0xa3, 0xaf, 200),
    'trunk': (0x9c, 0xa3, 0xaf, 200),
    'primary': (0x9c, 0xa3, 0xaf, 200),
    'secondary': (0x9c, 0xa3, 0xaf, 180),
    'tertiary': (0x9c, 0xa3, 0xaf, 160),
    'unclassified': (0x9c, 0xa3, 0xaf, 140),
    'residential': (0x9c, 0xa3, 0xaf, 120),
    'living_street': (0x9c, 0xa3, 0xaf, 100),
    'default': (0x9c, 0xa3, 0xaf, 120),
}

# Street widths by zoom (matching map style)
STREET_WIDTHS = {
    10: 0.5, 11: 0.5, 12: 0.5,
    13: 0.7, 14: 1.0,
    15: 1.2, 16: 1.5,
    17: 1.8, 18: 2.0,
}

def lonlat_to_tile(lon, lat, zoom):
    """Convert lon/lat to tile coordinates at given zoom."""
    n = 2.0 ** zoom
    x = int((lon + 180.0) / 360.0 * n)
    y = int((1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n)
    return x, y

def tile_to_lonlat(x, y, zoom):
    """Convert tile coordinates to lon/lat of top-left corner."""
    n = 2.0 ** zoom
    lon = x / n * 360.0 - 180.0
    lat = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    return lon, lat

def tile_bounds(x, y, zoom):
    """Get the geographic bounds of a tile [min_lon, min_lat, max_lon, max_lat]."""
    left, top = tile_to_lonlat(x, y, zoom)
    right, bottom = tile_to_lonlat(x + 1, y + 1, zoom)
    return [left, bottom, right, top]

def project_coords(geom, tile_bounds, tile_size=TILE_SIZE):
    """Project geometry coordinates from lon/lat to pixel coordinates within tile."""
    min_lon, min_lat, max_lon, max_lat = tile_bounds

    def project(coords):
        result = []
        for lon, lat in coords:
            # Normalize to [0, 1] within tile bounds
            px = (lon - min_lon) / (max_lon - min_lon) * tile_size
            py = (1 - (lat - min_lat) / (max_lat - min_lat)) * tile_size  # Flip Y
            result.append((px, py))
        return result

    # Use shapely.transform instead of deprecated shapely.ops.transform
    import shapely
    return shapely.transform(geom, lambda coords: project(coords))

def load_geojson(filepath):
    """Load GeoJSON file."""
    with open(filepath) as f:
        return json.load(f)

def get_zone_code(props):
    """Extract zone code from feature properties."""
    for v in props.values():
        if v in ZONE_COLORS:
            return v
    return None

def render_zones_tile(tile_bounds, zoom, zonas_features):
    """Render zones features to a tile image."""
    img = Image.new('RGBA', (TILE_SIZE, TILE_SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Get street width for this zoom
    street_width = STREET_WIDTHS.get(zoom, 1)

    for feature in zonas_features:
        geom = shape(feature['geometry'])
        zone_code = get_zone_code(feature.get('properties', {}))

        if not zone_code or zone_code not in ZONE_COLORS:
            continue

        colors = ZONE_COLORS[zone_code]

        # Project geometry to tile coordinates
        try:
            projected = project_coords(geom, tile_bounds)
        except Exception as e:
            continue

        if projected.is_empty:
            continue

        # Draw polygon
        if projected.geom_type == 'Polygon':
            coords = list(projected.exterior.coords)
            if len(coords) >= 3:
                # Fill
                draw.polygon(coords, fill=colors['fill'])
                # Border
                draw.line(coords, fill=colors['border'], width=colors['width'])
        elif projected.geom_type == 'MultiPolygon':
            for poly in projected.geoms:
                coords = list(poly.exterior.coords)
                if len(coords) >= 3:
                    draw.polygon(coords, fill=colors['fill'])
                    draw.line(coords, fill=colors['border'], width=colors['width'])

    return img

def render_calles_tile(tile_bounds, zoom, calles_features):
    """Render calles (streets) features to a tile image."""
    img = Image.new('RGBA', (TILE_SIZE, TILE_SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    street_width = STREET_WIDTHS.get(zoom, 1)

    for feature in calles_features:
        props = feature.get('properties', {})
        highway = props.get('highway', 'default')
        color = STREET_COLORS.get(highway, STREET_COLORS['default'])

        geom = shape(feature['geometry'])

        try:
            projected = project_coords(geom, tile_bounds)
        except Exception as e:
            continue

        if projected.is_empty:
            continue

        # Draw LineString or MultiLineString
        if projected.geom_type == 'LineString':
            coords = list(projected.coords)
            if len(coords) >= 2:
                draw.line(coords, fill=color, width=max(1, int(street_width)))
        elif projected.geom_type == 'MultiLineString':
            for line in projected.geoms:
                coords = list(line.coords)
                if len(coords) >= 2:
                    draw.line(coords, fill=color, width=max(1, int(street_width)))

    return img

def generate_tiles():
    """Main function to generate all tiles."""
    print("=== Generating Raster Tiles for Bolívar ===")

    # Load GeoJSON files
    print("Loading GeoJSON files...")
    zonas_data = load_geojson(ZONAS_FILE)
    calles_data = load_geojson(CALLES_FILE)

    zonas_features = zonas_data.get('features', [])
    calles_features = calles_data.get('features', [])

    print(f"Zonas: {len(zonas_features)} features")
    print(f"Calles: {len(calles_features)} features")

    # Create output directories
    for zoom in range(MIN_ZOOM, MAX_ZOOM + 1):
        (OUTPUT_DIR / "zonas" / str(zoom)).mkdir(parents=True, exist_ok=True)
        (OUTPUT_DIR / "calles" / str(zoom)).mkdir(parents=True, exist_ok=True)

    # Calculate tile range for Bolívar bounds
    # BOLIVAR_BOUNDS = [min_lon, min_lat, max_lon, max_lat]
    # For tile coordinates: x increases eastward, y increases southward
    # min_lat (southernmost) -> max_y, max_lat (northernmost) -> min_y
    min_x, min_y = lonlat_to_tile(BOLIVAR_BOUNDS[0], BOLIVAR_BOUNDS[3], MAX_ZOOM)  # min_lon, max_lat -> min_x, min_y
    max_x, max_y = lonlat_to_tile(BOLIVAR_BOUNDS[2], BOLIVAR_BOUNDS[1], MAX_ZOOM)  # max_lon, min_lat -> max_x, max_y

    # Generate tiles for each zoom level
    for zoom in range(MIN_ZOOM, MAX_ZOOM + 1):
        print(f"\nGenerating zoom level {zoom}...")

        # Calculate tile range for this zoom
        z_min_x, z_min_y = lonlat_to_tile(BOLIVAR_BOUNDS[0], BOLIVAR_BOUNDS[3], zoom)  # min_lon, max_lat
        z_max_x, z_max_y = lonlat_to_tile(BOLIVAR_BOUNDS[2], BOLIVAR_BOUNDS[1], zoom)  # max_lon, min_lat

        tiles_generated = 0

        for x in range(z_min_x, z_max_x + 1):
            for y in range(z_min_y, z_max_y + 1):
                bounds = tile_bounds(x, y, zoom)

                # Render zonas tile
                zonas_img = render_zones_tile(bounds, zoom, zonas_features)
                zonas_path = OUTPUT_DIR / "zonas" / str(zoom) / f"{x}" / f"{y}.png"
                zonas_path.parent.mkdir(parents=True, exist_ok=True)
                zonas_img.save(zonas_path, 'PNG')

                # Render calles tile
                calles_img = render_calles_tile(bounds, zoom, calles_features)
                calles_path = OUTPUT_DIR / "calles" / str(zoom) / f"{x}" / f"{y}.png"
                calles_path.parent.mkdir(parents=True, exist_ok=True)
                calles_img.save(calles_path, 'PNG')

                tiles_generated += 1

        print(f"  Generated {tiles_generated} tiles for zoom {zoom}")

    print(f"\n=== Done! Tiles saved to {OUTPUT_DIR} ===")

if __name__ == "__main__":
    generate_tiles()