import * as Leaflet from 'leaflet';
const L = Leaflet as any;

// Fix Leaflet default marker icons BEFORE any component renders
// This prevents TDZ errors in minified builds where L.Icon.Default gets renamed to 'D'
// and is accessed by MapContainer/Marker before the class is initialized
if (L.Icon?.Default?.prototype) {
  delete L.Icon.Default.prototype._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
  });
}
