import { setupGlobalErrorLogging, getVenueData, getGenreBucketData } from './utils.js?v=20260801_v11';
import { getInterestedIds, saveInterestedIds, getIgnoredEventIds, saveIgnoredEventIds } from './store.js?v=20260801_v11';
import { initEmailModal, initFeatureModal, initVenueModal, initSetlistModal, initContactModal } from './modals.js?v=20260801_v11';
import { initArtistInsights, initAudioPreview, initArtistLinksDropdown } from './media.js?v=20260801_v11';
import { initFilters } from './filters.js?v=20260801_v11';
import { loadWeatherForecasts } from './weather.js?v=20260801_v11';

setupGlobalErrorLogging();

if (typeof window.__softNavigate !== 'function') {
  window.__softNavigate = async (targetUrl) => {
    if (!targetUrl) return;

    const absoluteTarget = new URL(targetUrl, window.location.href).toString();
    if (absoluteTarget === window.location.href) return;

    try {
      document.documentElement.classList.add('is-soft-navigating');
      const response = await fetch(absoluteTarget, {
        credentials: 'same-origin',
        headers: {
          'Accept': 'text/html'
        }
      });

      if (!response.ok) {
        throw new Error(`Soft navigation failed (${response.status})`);
      }

      const html = await response.text();
      window.history.pushState({}, '', absoluteTarget);

      document.open();
      document.write(html);
      document.close();
    } catch (error) {
      console.warn('Soft navigation fallback to hard navigation', error);
      window.location.assign(absoluteTarget);
    }
  };
}

document.addEventListener('DOMContentLoaded', () => {
  const venueData = getVenueData();
  const genreBuckets = getGenreBucketData();
  const btnCopyMarketLink = document.getElementById('btn-copy-market-link');
  const btnBackToTop = document.getElementById('btn-back-to-top');

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

  const safeInit = (label, fn) => {
    try {
      fn();
    } catch (error) {
      console.error(`[GigGrid] ${label} init failed`, error);
    }
  };

  safeInit('Email modal', () => initEmailModal(getInterestedIds));
  safeInit('Feature modal', () => initFeatureModal());
  safeInit('Venue modal', () => initVenueModal(venueData));
  safeInit('Setlist modal', () => initSetlistModal());
  safeInit('Contact modal', () => initContactModal());
  safeInit('Artist insights', () => initArtistInsights());
  safeInit('Audio preview', () => initAudioPreview());
  safeInit('Artist links dropdown', () => initArtistLinksDropdown());
  safeInit('Filters', () => initFilters({
    venueData,
    genreBuckets,
    getInterestedIds,
    saveInterestedIds,
    getIgnoredEventIds,
    saveIgnoredEventIds
  }));
  initMarketLinkPrefetching();

  if (btnBackToTop) {
    const updateBackToTopVisibility = () => {
      const shouldShow = window.scrollY > 520;
      btnBackToTop.classList.toggle('is-visible', shouldShow);
    };

    btnBackToTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    window.addEventListener('scroll', updateBackToTopVisibility, { passive: true });
    window.addEventListener('resize', updateBackToTopVisibility, { passive: true });
    updateBackToTopVisibility();
  }
  
  // Defer weather API calls after initial DOM paint to maximize Lighthouse TBT & FCP performance
  if ('requestIdleCallback' in window) {
    requestIdleCallback(() => loadWeatherForecasts(), { timeout: 1500 });
  } else {
    setTimeout(loadWeatherForecasts, 200);
  }
});
