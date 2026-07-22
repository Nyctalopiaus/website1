import { setupGlobalErrorLogging, getVenueData, getGenreBucketData } from './utils.js?v=9';
import { getInterestedIds, saveInterestedIds } from './store.js?v=9';
import { initEmailModal, initFeatureModal, initVenueModal, initSetlistModal } from './modals.js?v=9';
import { initArtistInsights, initAudioPreview } from './media.js?v=9';
import { initFilters } from './filters.js?v=9';
import { loadWeatherForecasts } from './weather.js?v=9';

setupGlobalErrorLogging();

document.addEventListener('DOMContentLoaded', () => {
  const venueData = getVenueData();
  const genreBuckets = getGenreBucketData();
  const btnCopyMarketLink = document.getElementById('btn-copy-market-link');

  const copyTextFallback = text => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  };

  const setCopyButtonState = (button, label, className) => {
    button.textContent = label;
    button.classList.remove('success', 'error');
    if (className) {
      button.classList.add(className);
    }
  };

  if (btnCopyMarketLink) {
    const defaultLabel = btnCopyMarketLink.dataset.defaultLabel || 'Copy Link';
    btnCopyMarketLink.addEventListener('click', async () => {
      const shareUrl = window.location.href;
      let copied = false;

      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(shareUrl);
          copied = true;
        } else {
          copied = copyTextFallback(shareUrl);
        }
      } catch (error) {
        copied = copyTextFallback(shareUrl);
      }

      if (copied) {
        setCopyButtonState(btnCopyMarketLink, 'Copied!', 'success');
      } else {
        setCopyButtonState(btnCopyMarketLink, 'Copy Failed', 'error');
      }

      window.setTimeout(() => {
        setCopyButtonState(btnCopyMarketLink, defaultLabel, '');
      }, 1600);
    });
  }

  initEmailModal(getInterestedIds);
  initFeatureModal();
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
