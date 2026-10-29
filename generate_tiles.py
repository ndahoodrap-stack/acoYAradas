#!/usr/bin/env python3
"""
Generate raster tiles from GeoJSON for Bolívar delivery zones.
Run once to create static tiles, then serve them locally.
No external dependencies at runtime.
"""

import json
import os
import sys
from pathlib import Path

# Check if we have the required packages
try:
    import mapnik
    HAS_MAPNIK = True
except ImportError:
    HAS_MAPNIK = False
    print("mapnik not available")

try:
    from tilemaker import tilemaker
    HAS_TILEMAKER = True
except ImportError:
    HAS_TILEMAKER = False
    print("tilemaker not available")

try:
    import mercantile
    HAS_MERCANTILE = True
except ImportError:
    HAS_MERCANTILE = False
    print("mercantile not available")

def check_geojson_files():
    """Verify GeoJSON files exist and are valid."""
    web_public = Path("apps/web/public")
    zonas_file = web_public / "bolivar.geojson"
    calles_file = web_public / "bolivar-calles-simplified.geojson"

    if not zonas_file.exists():
        print(f"ERROR: {zonas_file} not found")
        return False
    if not calles_file.exists():
        print(f"ERROR: {calles_file} not found")
        return False

    with open(zonas_file) as f:
        zonas = json.load(f)
    with open(calles_file) as f:
        calles = json.load(f)

    print(f"Zonas: {len(zonas.get('features', []))} features")
    print(f"Calles: {len(calles.get('features', []))} features")
    return True

def generate_tiles_with_tippecanoe():
    """Generate PMTiles using tippecanoe (if available)."""
    import subprocess

    web_public = Path("apps/web/public")
    output_dir = Path("apps/web/public/tiles")
    output_dir.mkdir(parents=True, exist_ok=True)

    # Generate PMTiles for zones
    result = subprocess.run([
        "tippecanoe",
        "-o", str(output_dir / "zonas.pmtiles"),
        "--layer=zonas",
        "--minimum-zoom=10",
        "--maximum-zoom=18",
        "--drop-densest-as-needed",
        "--extend-zooms-if-still-dropping",
        str(web_public / "bolivar.geojson")
    ], capture_output=True, text=True)

    if result.returncode != 0:
        print(f"tippecanoe zonas failed: {result.stderr}")
        return False

    # Generate PMTiles for streets
    result = subprocess.run([
        "tippecanoe",
        "-o", str(output_dir / "calles.pmtiles"),
        "--layer=calles",
        "--minimum-zoom=10",
        "--maximum-zoom=18",
        "--drop-densest-as-needed",
        "--extend-zooms-if-still-dropping",
        str(web_public / "bolivar-calles-simplified.geojson")
    ], capture_output=True, text=True)

    if result.returncode != 0:
        print(f"tippecanoe calles failed: {result.stderr}")
        return False

    print("PMTiles generated successfully!")
    return True

def generate_raster_tiles_simple():
    """
    Generate simple raster tiles using a basic approach.
    This creates PNG tiles that can be served statically.
    """
    print("Generating raster tiles...")
    # This is a placeholder - would need mapnik or similar
    # For now, let's create a simple tile structure
    pass

def main():
    print("=== Tile Generation for Bolívar Delivery Map ===")

    if not check_geojson_files():
        sys.exit(1)

    # Try tippecanoe first (best for vector tiles)
    if HAS_TILEMAKER or True:  # Check if tippecanoe binary exists
        import shutil
        if shutil.which("tippecanoe"):
            print("Using tippecanoe...")
            if generate_tiles_with_tippecanoe():
                return
        else:
            print("tippecanoe not found in PATH")

    print("No suitable tile generator found.")
    print("Install tippecanoe: brew install tippecanoe (macOS) or apt install tippecanoe (Ubuntu)")
    print("Or use the GeoJSON directly with MapLibre (current approach)")

if __name__ == "__main__":
    main()