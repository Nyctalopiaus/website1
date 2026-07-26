import { ICONS } from './utils.js';

const outdoorVenues = {
  'Red Rocks Amphitheatre': { lat: 39.6654, lon: -105.2057 },
  "Fiddler's Green Amphitheatre": { lat: 39.5986, lon: -104.8872 },
  'Mishawaka Amphitheatre': { lat: 40.6865, lon: -105.3562 },
  'The Junkyard': { lat: 39.7397, lon: -105.0195 }
};

const defaultCityCoords = {
  'morrison': { lat: 39.6536, lon: -105.1911 },
  'greenwood village': { lat: 39.5986, lon: -104.8872 },
  'bellvue': { lat: 40.6865, lon: -105.3562 },
  'denver': { lat: 39.7392, lon: -104.9903 },
  'boulder': { lat: 40.0150, lon: -105.2705 },
  'fort collins': { lat: 40.5853, lon: -105.0844 },
  'colorado springs': { lat: 38.8339, lon: -104.8214 },
  'los angeles': { lat: 34.0522, lon: -118.2437 },
  'san diego': { lat: 32.7157, lon: -117.1611 },
  'san francisco': { lat: 37.7749, lon: -122.4194 }
};

function isOutdoorVenue(venueName) {
  if (!venueName) return false;
  const vLower = venueName.toLowerCase().trim();
  if (outdoorVenues[venueName] || outdoorVenues[vLower]) return true;
  const keywords = [
    'amphitheatre', 'amphitheater', 'park', 'field', 'gardens',
    'fairgrounds', 'ranch', 'pavilion', 'junkyard', 'patio',
    'outdoor', 'stadium', 'bowl'
  ];
  return keywords.some(kw => vLower.includes(kw));
}

function getVenueCoords(container, venueName) {
  if (outdoorVenues[venueName]) return outdoorVenues[venueName];

  const dataLat = parseFloat(container.getAttribute('data-lat'));
  const dataLon = parseFloat(container.getAttribute('data-lon'));
  if (!isNaN(dataLat) && !isNaN(dataLon) && dataLat !== 0 && dataLon !== 0) {
    return { lat: dataLat, lon: dataLon };
  }

  const venueList = window.venueData || [];
  const matched = venueList.find(v => v.venue_name && v.venue_name.toLowerCase() === venueName.toLowerCase());
  if (matched) {
    const vLat = parseFloat(matched.latitude);
    const vLon = parseFloat(matched.longitude);
    if (!isNaN(vLat) && !isNaN(vLon) && vLat !== 0 && vLon !== 0) {
      return { lat: vLat, lon: vLon };
    }
    const cLower = (matched.city || '').toLowerCase().trim();
    if (cLower && defaultCityCoords[cLower]) {
      return defaultCityCoords[cLower];
    }
  }

  return defaultCityCoords['denver'];
}

const weatherCodes = {
  0: { label: 'Clear', emoji: '\u2600\ufe0f' },
  1: { label: 'Mainly Clear', emoji: '\ud83c\udf24\ufe0f' },
  2: { label: 'Partly Cloudy', emoji: '\u26c5' },
  3: { label: 'Overcast', emoji: '\u2601\ufe0f' },
  45: { label: 'Foggy', emoji: '\ud83c\udf2b\ufe0f' },
  48: { label: 'Depositing Rime Fog', emoji: '\ud83c\udf2b\ufe0f' },
  51: { label: 'Light Drizzle', emoji: '\ud83c\udf26\ufe0f' },
  53: { label: 'Drizzle', emoji: '\ud83c\udf26\ufe0f' },
  55: { label: 'Heavy Drizzle', emoji: '\ud83c\udf26\ufe0f' },
  61: { label: 'Light Rain', emoji: '\ud83c\udf27\ufe0f' },
  63: { label: 'Rain', emoji: '\ud83c\udf27\ufe0f' },
  65: { label: 'Heavy Rain', emoji: '\ud83c\udf27\ufe0f' },
  71: { label: 'Light Snow', emoji: '\ud83c\udf28\ufe0f' },
  73: { label: 'Snow', emoji: '\ud83c\udf28\ufe0f' },
  75: { label: 'Heavy Snow', emoji: '\ud83c\udf28\ufe0f' },
  77: { label: 'Snow Grains', emoji: '\ud83c\udf28\ufe0f' },
  80: { label: 'Light Rain Showers', emoji: '\ud83c\udf27\ufe0f' },
  81: { label: 'Rain Showers', emoji: '\ud83c\udf27\ufe0f' },
  82: { label: 'Violent Rain Showers', emoji: '\u26c8\ufe0f' },
  85: { label: 'Light Snow Showers', emoji: '\ud83c\udf28\ufe0f' },
  86: { label: 'Snow Showers', emoji: '\ud83c\udf28\ufe0f' },
  95: { label: 'Thunderstorm', emoji: '\u26c8\ufe0f' },
  96: { label: 'Thunderstorm with Hail', emoji: '\u26c8\ufe0f' },
  99: { label: 'Thunderstorm with Heavy Hail', emoji: '\u26c8\ufe0f' }
};

export async function loadWeatherForecasts() {
  const containers = document.querySelectorAll('.weather-container');
  if (containers.length === 0) return;

  const weatherCache = {};
  const now = new Date();
  const todayLocal = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  for (const container of containers) {
    const venueName = container.getAttribute('data-venue');
    const startStr = container.getAttribute('data-start');
    const isOutdoorAttr = container.getAttribute('data-is-outdoor');
    if (!venueName || !startStr) continue;

    const isOutdoor = isOutdoorAttr === '1' || isOutdoorVenue(venueName);
    if (!isOutdoor) continue;

    const coords = getVenueCoords(container, venueName);
    if (!coords) continue;

    const showParts = startStr.split(' ')[0].split('-');
    const showYear = parseInt(showParts[0], 10);
    const showMonth = parseInt(showParts[1], 10) - 1;
    const showDay = parseInt(showParts[2], 10);
    const showDateLocal = new Date(showYear, showMonth, showDay);
    const diffTime = showDateLocal - todayLocal;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays >= 0 && diffDays < 7) {
      const cacheKey = `${coords.lat.toFixed(4)},${coords.lon.toFixed(4)}`;
      let forecastData = weatherCache[cacheKey];
      if (!forecastData) {
        try {
          const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&daily=temperature_2m_max,weathercode,precipitation_probability_max&temperature_unit=fahrenheit&timezone=America/Denver`);
          if (response.ok) {
            forecastData = await response.json();
            weatherCache[cacheKey] = forecastData;
          }
        } catch (error) {
          console.error(`Failed to fetch weather for ${venueName}`, error);
        }
      }

      if (forecastData && forecastData.daily && forecastData.daily.time) {
        const showDateStr = `${showYear}-${String(showMonth + 1).padStart(2, '0')}-${String(showDay).padStart(2, '0')}`;
        const idx = forecastData.daily.time.indexOf(showDateStr);
        if (idx !== -1) {
          const temp = Math.round(forecastData.daily.temperature_2m_max[idx]);
          const code = forecastData.daily.weathercode[idx];
          const prob = forecastData.daily.precipitation_probability_max[idx];
          const weather = weatherCodes[code] || { label: 'Clear', emoji: '\ud83c\udf24\ufe0f' };
          if (prob > 30) {
            container.innerHTML = `<span class="weather-badge rain-warning" title="${weather.label} - High precipitation probability">${ICONS.warning} ${prob}% Rain Warning</span>`;
          } else {
            container.innerHTML = `<span class="weather-badge" title="${weather.label}">${weather.emoji} ${temp}\u00b0F ${weather.label}</span>`;
          }
        }
      }
    } else if (diffDays >= 7) {
      container.innerHTML = '<span class="weather-badge unavailable" title="Weather forecast is only available within 7 days of the show">\ud83c\udf24\ufe0f Too Far to Forecast</span>';
    }
  }
}
