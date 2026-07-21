export function getInterestedIds() {
  try {
    const raw = localStorage.getItem('metal_interested_shows');
    return raw ? JSON.parse(raw) : [];
  } catch (error) {
    console.error('Failed to parse interested shows', error);
    return [];
  }
}

export function saveInterestedIds(ids) {
  try {
    localStorage.setItem('metal_interested_shows', JSON.stringify(ids));
  } catch (error) {
    console.error('Failed to save interested shows', error);
  }
}
