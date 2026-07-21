import { setupGlobalErrorLogging, getVenueData, getGenreBucketData } from './utils.js?v=5';
import { getInterestedIds, saveInterestedIds } from './store.js?v=5';
import { initEmailModal, initVenueModal, initSetlistModal } from './modals.js?v=5';
import { initArtistInsights, initAudioPreview } from './media.js?v=5';
import { initFilters } from './filters.js?v=5';
import { loadWeatherForecasts } from './weather.js?v=5';

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
