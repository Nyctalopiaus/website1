import { setupGlobalErrorLogging, getVenueData, getGenreBucketData } from './utils.js?v=20260726_v5';
import { getInterestedIds, saveInterestedIds, getIgnoredEventIds, saveIgnoredEventIds } from './store.js?v=20260726_v5';
import { initEmailModal, initFeatureModal, initVenueModal, initSetlistModal, initContactModal } from './modals.js?v=20260726_v5';
import { initArtistInsights, initAudioPreview, initArtistLinksDropdown } from './media.js?v=20260726_v5';
import { initFilters } from './filters.js?v=20260726_v5';
import { loadWeatherForecasts } from './weather.js?v=20260726_v5';

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

  const initMarketLinkPrefetching = () => {
    const prefetchedUrls = new Set();
    const marketLinks = document.querySelectorAll('.header-market-link');

    const prefetchUrl = (url) => {
      if (!url || prefetchedUrls.has(url) || url === window.location.href) return;
      prefetchedUrls.add(url);

      const linkEl = document.createElement('link');
      linkEl.rel = 'prefetch';
      linkEl.href = url;
      linkEl.as = 'document';
      document.head.appendChild(linkEl);
    };

    marketLinks.forEach(link => {
      ['mouseenter', 'touchstart', 'focus'].forEach(evtType => {
        link.addEventListener(evtType, () => {
          const href = link.getAttribute('href');
          if (href) prefetchUrl(href);
        }, { passive: true });
      });
    });
  };

  initEmailModal(getInterestedIds);
  initFeatureModal();
  initVenueModal(venueData);
  initSetlistModal();
  initContactModal();
  initArtistInsights();
  initAudioPreview();
  initArtistLinksDropdown();
  initFilters({
    venueData,
    genreBuckets,
    getInterestedIds,
    saveInterestedIds,
    getIgnoredEventIds,
    saveIgnoredEventIds
  });
  initMarketLinkPrefetching();
  loadWeatherForecasts();
});
