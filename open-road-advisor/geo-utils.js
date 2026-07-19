const US_STATES = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA', colorado: 'CO',
  connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA', hawaii: 'HI', idaho: 'ID',
  illinois: 'IL', indiana: 'IN', iowa: 'IA', kansas: 'KS', kentucky: 'KY', louisiana: 'LA',
  maine: 'ME', maryland: 'MD', massachusetts: 'MA', michigan: 'MI', minnesota: 'MN',
  mississippi: 'MS', missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY', 'north carolina': 'NC',
  'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK', oregon: 'OR', pennsylvania: 'PA',
  'rhode island': 'RI', 'south carolina': 'SC', 'south dakota': 'SD', tennessee: 'TN', texas: 'TX',
  utah: 'UT', vermont: 'VT', virginia: 'VA', washington: 'WA', 'west virginia': 'WV',
  wisconsin: 'WI', wyoming: 'WY'
};

function getStateAbbreviation(stateName) {
  if (!stateName) return '';
  const cleanName = stateName.trim().toLowerCase();
  if (cleanName.length === 2) return stateName.toUpperCase();
  return US_STATES[cleanName] || stateName;
}

export function haversineDistance(c1, c2) {
  const R = 6371e3;
  const lat1 = c1[1] * Math.PI / 180;
  const lat2 = c2[1] * Math.PI / 180;
  const dLat = (c2[1] - c1[1]) * Math.PI / 180;
  const dLon = (c2[0] - c1[0]) * Math.PI / 180;

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export function calculateBearing(c1, c2) {
  const lat1 = c1[1] * Math.PI / 180;
  const lat2 = c2[1] * Math.PI / 180;
  const dLon = (c2[0] - c1[0]) * Math.PI / 180;

  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) -
    Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  const brng = Math.atan2(y, x) * 180 / Math.PI;
  return (brng + 360) % 360;
}

export async function geocode(location) {
  try {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(location)}&limit=1`;
    const response = await fetch(url);
    if (response.ok) {
      const data = await response.json();
      if (data.features && data.features.length > 0) {
        const feat = data.features[0];
        return {
          lat: feat.geometry.coordinates[1],
          lon: feat.geometry.coordinates[0],
          name: feat.properties.name || location
        };
      }
    }
  } catch (e) {
    console.warn('Photon geocoding failed, falling back to Nominatim:', e);
  }

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(location)}&limit=1`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Geocoding request failed for: ${location}`);
  const results = await response.json();
  if (results.length === 0) throw new Error(`Location not found: "${location}"`);

  return {
    lat: parseFloat(results[0].lat),
    lon: parseFloat(results[0].lon),
    name: results[0].display_name.split(',')[0]
  };
}

export async function reverseGeocode(lat, lon) {
  const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=10`;
  try {
    const response = await fetch(nominatimUrl);
    if (response.ok) {
      const data = await response.json();
      if (data && data.address) {
        const place = data.address.city || data.address.town || data.address.village || data.address.hamlet || data.address.suburb || data.address.county || null;
        const stateVal = data.address.state || data.address.region || data.address.province || data.address.state_code || '';
        if (place) {
          const stateCode = getStateAbbreviation(stateVal);
          return stateCode ? `${place}, ${stateCode}` : place;
        }
      }
    }
  } catch (e) {
    console.warn('Nominatim reverse geocode failed, trying BigDataCloud:', e);
  }

  const bdcUrl = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`;
  try {
    const response = await fetch(bdcUrl);
    if (response.ok) {
      const data = await response.json();
      const place = data.city || data.locality || null;
      let stateVal = '';
      if (data.principalSubdivisionCode && data.principalSubdivisionCode.includes('-')) {
        stateVal = data.principalSubdivisionCode.split('-')[1];
      } else {
        stateVal = data.principalSubdivision || '';
      }
      if (place) {
        const stateCode = getStateAbbreviation(stateVal);
        return stateCode ? `${place}, ${stateCode}` : place;
      }
    }
  } catch (e) {
    console.error('BigDataCloud reverse geocode fallback failed:', e);
  }

  return null;
}

export function checkCurfewViolation(timeUnix, curfewStartH, curfewStartM, curfewEndH, curfewEndM) {
  const d = new Date(timeUnix * 1000);
  const hour = d.getUTCHours();
  const min = d.getUTCMinutes();
  const timeVal = hour + min / 60;

  const startVal = curfewStartH + curfewStartM / 60;
  const endVal = curfewEndH + curfewEndM / 60;

  if (endVal > startVal) {
    return (timeVal >= endVal || timeVal < startVal);
  }
  return (timeVal >= endVal && timeVal < startVal);
}

export function getCustomMealCrossing(t1, t2, mealsList) {
  const d1 = new Date(t1 * 1000);
  const d2 = new Date(t2 * 1000);

  const checkDays = [new Date(Date.UTC(d1.getUTCFullYear(), d1.getUTCMonth(), d1.getUTCDate()))];
  if (d1.getUTCDate() !== d2.getUTCDate() || d1.getUTCMonth() !== d2.getUTCMonth()) {
    checkDays.push(new Date(Date.UTC(d2.getUTCFullYear(), d2.getUTCMonth(), d2.getUTCDate())));
  }

  for (const day of checkDays) {
    for (const meal of mealsList) {
      const mealUnix = Math.floor(day.getTime() / 1000) + (meal.hour * 3600) + (meal.min * 60);
      if (mealUnix > t1 && mealUnix <= t2) {
        return { name: meal.name, timeUnix: mealUnix };
      }
    }
  }

  return null;
}

export async function fetchOSRMRoute(start, end) {
  const url = `https://router.project-osrm.org/route/v1/driving/${start.lon},${start.lat};${end.lon},${end.lat}?overview=full&geometries=geojson`;
  const response = await fetch(url);
  if (!response.ok) throw new Error('OSRM routing request failed.');
  const data = await response.json();
  if (!data.routes || data.routes.length === 0) throw new Error('No driving routes resolved between coordinates.');
  return data.routes[0];
}
