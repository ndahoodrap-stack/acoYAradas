#!/usr/bin/env node
/**
 * Build script to process Bolivarcalles.geojson into a simplified version
 * for client-side map rendering.
 *
 * Usage: node scripts/process-streets.mjs
 * Output: apps/web/public/bolivar-calles-simplified.geojson
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { simplify } from '@turf/turf';

const INPUT_FILE = path.resolve('Bolivarcalles.geojson');
const OUTPUT_FILE = path.resolve('apps/web/public/bolivar-calles-simplified.geojson');

// Highway types to keep (main streets, not footpaths/service roads)
const KEEP_HIGHWAYS = new Set([
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
  'unclassified', 'residential', 'living_street',
  'motorway_link', 'trunk_link', 'primary_link', 'secondary_link', 'tertiary_link'
]);

// Highway types to exclude
const EXCLUDE_HIGHWAYS = new Set([
  'footway', 'path', 'cycleway', 'pedestrian', 'steps',
  'service', 'track', 'bridleway', 'construction', 'proposed',
  'bus_guideway', 'raceway', 'road', 'corridor'
]);

async function processStreets() {
  console.log('📖 Reading Bolivarcalles.geojson...');
  const raw = await fs.readFile(INPUT_FILE, 'utf-8');
  const data = JSON.parse(raw);

  console.log(`📊 Original features: ${data.features.length}`);

  // Filter features
  const filtered = data.features.filter(f => {
    const props = f.properties || {};
    const highway = props.highway;

    // Skip if no highway property
    if (!highway) return false;

    // Handle array of highway types (e.g., ["residential", "service"])
    const highways = Array.isArray(highway) ? highway : [highway];

    // Keep if any highway type is in KEEP_HIGHWAYS
    const hasKeep = highways.some(h => KEEP_HIGHWAYS.has(h));
    // Exclude if any highway type is in EXCLUDE_HIGHWAYS
    const hasExclude = highways.some(h => EXCLUDE_HIGHWAYS.has(h));

    return hasKeep && !hasExclude;
  });

  console.log(`🔍 After highway filter: ${filtered.length} features`);

  // Simplify geometries (tolerance in degrees, ~10-15 meters at this latitude)
  console.log('🔧 Simplifying geometries...');
  const simplified = filtered.map(f => {
    try {
      const simplifiedFeature = simplify(f, {
        tolerance: 0.0001, // ~11 meters at latitude -36
        highQuality: true,
        mutate: false
      });
      return simplifiedFeature;
    } catch (e) {
      // If simplification fails, keep original
      return f;
    }
  });

  // Remove properties we don't need to reduce size
  const cleaned = simplified.map(f => ({
    ...f,
    properties: {
      name: f.properties?.name || null,
      highway: f.properties?.highway || null,
      oneway: f.properties?.oneway || null,
      surface: f.properties?.surface || null,
    }
  }));

  const output = {
    type: 'FeatureCollection',
    features: cleaned
  };

  console.log(`💾 Writing simplified GeoJSON (${cleaned.length} features)...`);
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(output));

  const stats = await fs.stat(OUTPUT_FILE);
  console.log(`✅ Done! Output: ${(stats.size / 1024).toFixed(1)} KB`);
  console.log(`   Location: ${OUTPUT_FILE}`);
}

processStreets().catch(console.error);