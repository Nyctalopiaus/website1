import { setupGlobalErrorLogging, getVenueData, getGenreBucketData } from './utils.js';
import { getInterestedIds, saveInterestedIds } from './store.js';
import { initEmailModal, initVenueModal, initSetlistModal } from './modals.js';
import { initArtistInsights, initAudioPreview } from './media.js';
import { initFilters } from './filters.js';
import { loadWeatherForecasts } from './weather.js';

setupGlobalErrorLogging();

document.addEventListener('DOMContentLoaded', () => {
  const venueData = getVenueData();
  const genreBuckets = getGenreBucketData();

  initEmailModal(getInterestedIds);
  initVenueModal(venueData);
  initSetlistModal();
  initArtistInsights();
  initAudioPreview();
  initFilters({
    venueData,
    genreBuckets,
    getInterestedIds,
    saveInterestedIds
  });
  loadWeatherForecasts();
});
