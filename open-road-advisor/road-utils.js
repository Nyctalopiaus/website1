export function calculateTripCost(totalDistance, mpg, fuelPrice) {
  if (isNaN(mpg) || mpg <= 0 || isNaN(fuelPrice) || fuelPrice < 0) {
    return 0;
  }
  return (totalDistance / mpg) * fuelPrice;
}

export function downloadGPX(waypoints) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<gpx version="1.1" creator="Open Road Advisor" xmlns="http://www.topografix.com/GPX/1/1">\n';
  xml += '  <metadata>\n    <name>Open Road Route</name>\n  </metadata>\n';
  xml += '  <trk>\n    <name>Journey Route</name>\n    <trkseg>\n';

  waypoints.forEach(wp => {
    const lon = wp.coord[0];
    const lat = wp.coord[1];
    const ele = (wp.elevationFeet || 0) / 3.28084;
    const timeISO = new Date(wp.arrivalTimeUnix * 1000).toISOString();
    xml += `      <trkpt lat="${lat}" lon="${lon}">\n`;
    xml += `        <ele>${ele.toFixed(2)}</ele>\n`;
    xml += `        <time>${timeISO}</time>\n`;
    xml += '      </trkpt>\n';
  });

  xml += '    </trkseg>\n  </trk>\n</gpx>\n';

  const blob = new Blob([xml], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'route.gpx';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function escapeHTML(str) {
  if (!str) return '';
  return str.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function getCurrencySymbol(c) {
  if (c === 'EUR') return '€';
  if (c === 'GBP') return '£';
  return '$';
}
