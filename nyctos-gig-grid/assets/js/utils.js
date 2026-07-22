export const ICONS = {
  email: '\u2709\ufe0f',
  sending: '\u23f3',
  sent: '\u2705',
  warning: '\u26a0\ufe0f',
  headphones: '\ud83c\udfa7',
  play: '\u25b6',
  pause: '\u23f8',
  starFilled: '\u2605',
  starEmpty: '\u2606',
  star: '\u2b50',
  music: '\ud83c\udfb5',
  noEntry: '\ud83d\udeab',
  check: '\u2713',
  cross: '\u2715'
};

export function setupGlobalErrorLogging() {
  window.onerror = function(message, source, lineno, colno) {
    const errInfo = `${message} at ${source}:${lineno}:${colno}`;
    fetch('aggregator.php?action=log_js_error', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'error=' + encodeURIComponent(errInfo)
    });
    return false;
  };
}

export function getVenueData() {
  const venueDataElement = document.getElementById('venue-data');
  return venueDataElement ? JSON.parse(venueDataElement.textContent) : [];
}

export function getGenreBucketData() {
  const genreBucketDataElement = document.getElementById('genre-buckets-data');
  return genreBucketDataElement ? JSON.parse(genreBucketDataElement.textContent) : {};
}

export function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export function findVenueDetails(venueData, searchName) {
  if (!searchName) return null;
  let searchLower = searchName.trim().toLowerCase();
  searchLower = searchLower.replace(/[^a-z0-9]/g, '');
  searchLower = searchLower.replace(/theatre/g, 'theater');

  const wordsToRemove = ['the', 'amphitheater', 'theater', 'musichall', 'music', 'hall', 'auditorium', 'ballroom', 'stadium', 'center', 'arena'];
  wordsToRemove.forEach(word => {
    searchLower = searchLower.replace(new RegExp(word, 'g'), '');
  });

  for (const venue of venueData) {
    let nameLower = venue.venue_name.toLowerCase();
    nameLower = nameLower.replace(/[^a-z0-9]/g, '');
    nameLower = nameLower.replace(/theatre/g, 'theater');
    wordsToRemove.forEach(word => {
      nameLower = nameLower.replace(new RegExp(word, 'g'), '');
    });

    const keyLower = venue.venue_key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (searchLower && nameLower && (searchLower.includes(nameLower) || nameLower.includes(searchLower) || searchLower.includes(keyLower))) {
      return venue;
    }
  }

  return null;
}
