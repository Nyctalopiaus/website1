/**
 * Property Scraper Module - Fetches and parses property data from Redfin
 * Uses the shared backend/property-lookup.php endpoint (URL-encoded),
 * which also maintains the 7-day cache shared with homeward.
 */

import { CONFIG } from './config.js';
import { looksLikeUrl, encodeUrlParam, getProviderLabel, setVisible } from './utils.js';

/**
 * Fetches property data from a Redfin URL
 * @param {string} inputUrl - Full Redfin property page URL
 * @param {Object} domRefs - DOM element references for updating UI
 * @param {Object} callbacks - Callback functions: onSuccess, onError, onStart, onComplete
 */
// NOTE: Property fetching always routes through backend/property-lookup.php
// (server-side). Do not add a client-side scrape API call here — any token
// embedded in this file ships to every visitor's browser in plain text
// (view-source, network tab). Keep scrape/proxy credentials server-side
// only (see api.env).

function parseAddressFromRedfinUrl(url) {
  try {
    const match = url.match(/redfin\.com\/([A-Z]{2})\/([^\/]+)\/([^\/]+)\/home/i);
    if (match) {
      const state = match[1].toUpperCase();
      const city = match[2].replace(/-/g, ' ');
      const rawStreet = match[3].replace(/-/g, ' ');
      return `${rawStreet}, ${city}, ${state}`;
    }
  } catch (e) {}
  return null;
}

export async function fetchPropertyData(inputUrl, domRefs, callbacks = {}) {
  const {
    onSuccess = () => {},
    onError = () => {},
    onStart = () => {},
    onComplete = () => {}
  } = callbacks;

  try {
    onStart();

    // Validate URL format
    if (!looksLikeUrl(inputUrl)) {
      const error = CONFIG.ERROR_INVALID_URL;
      onError(error);
      return;
    }

    let data = null;
    try {
      const fetchUrl = `${CONFIG.API_MLS}?url=${encodeUrlParam(inputUrl)}`;
      const response = await fetch(fetchUrl);
      const text = await response.text();

      if (!text.trim().startsWith('<?php') && !text.includes('<?php')) {
        data = JSON.parse(text);
      }
    } catch (e) {
      // Local static server fallback
    }

    if (data && data.price) {
      const homePrice = data.price;
      applyPropertyData(data, homePrice, domRefs, inputUrl);
      renderPreviewBox(data, homePrice, domRefs);
      onSuccess(data);
      return;
    }

    // Check if backend returned a specific error message (e.g. cache miss / bookmarklet required)
    if (data && data.error) {
      onError(data.error);
      return;
    }

    // Fallback for local static dev server: Parse address from URL and present preview box cleanly
    const fallbackAddress = parseAddressFromRedfinUrl(inputUrl);
    if (fallbackAddress) {
      const fallbackData = {
        address: fallbackAddress,
        hoa_fee: 0
      };
      renderPreviewBox(fallbackData, domRefs.homePriceInput.value || 400000, domRefs);
      if (domRefs.mlsPreviewAddress) {
        domRefs.mlsPreviewAddress.textContent = `📍 ${fallbackAddress} (Local Dev Mode)`;
      }
      onSuccess(fallbackData);
      return;
    }

    onError(CONFIG.ERROR_API_FETCH);
  } catch (error) {
    console.error('[ERROR] Property Fetch Error:', error);
    onError(CONFIG.ERROR_API_FETCH);
  } finally {
    onComplete();
  }
}

/**
 * Applies extracted property data to calculator inputs
 * @param {Object} data - Extracted property data
 * @param {number} homePrice - Property sale price
 * @param {Object} domRefs - DOM element references
 * @param {string} [inputUrl] - Original input URL
 */
function applyPropertyData(data, homePrice, domRefs, inputUrl = '') {
  const providerLabel = getProviderLabel(data.url || inputUrl, data.provider);

  // Set home price
  if (domRefs.homePriceInput) {
    domRefs.homePriceInput.value = homePrice;
    domRefs.homePriceSlider.value = Math.min(Math.max(homePrice, CONFIG.MIN_HOME_PRICE), CONFIG.MAX_HOME_PRICE);
    
    const badge = document.getElementById('badge-redfin-price');
    if (badge) {
      badge.textContent = `✓ ${providerLabel}`;
      setVisible(badge, true, 'inline-block');
    }
  }

  // Update down payment to maintain percentage
  if (domRefs.downPaymentPercentInput && domRefs.downPaymentAmountInput) {
    const percent = parseFloat(domRefs.downPaymentPercentInput.value) || 0;
    const amount = (percent / 100) * homePrice;
    domRefs.downPaymentAmountInput.value = Math.round(amount);
  }

  // Apply HOA fee (canonical field: hoaFee — raw monthly dollar amount)
  const hoaFee = data.hoaFee;
  if (hoaFee !== undefined && hoaFee !== null && domRefs.hoaFeesInput) {
    domRefs.hoaFeesInput.value = hoaFee;
    const badge = document.getElementById('badge-redfin-hoa');
    if (badge) {
      badge.textContent = `✓ ${providerLabel}`;
      setVisible(badge, true, 'inline-block');
    }
  }

  // Apply property tax rate (canonical field: propertyTaxRate)
  const propertyTax = data.propertyTaxRate;
  if (propertyTax !== undefined && propertyTax !== null && domRefs.taxRateInput) {
    domRefs.taxRateInput.value = parseFloat(propertyTax).toFixed(2);
    const badge = document.getElementById('badge-redfin-tax');
    if (badge) {
      badge.textContent = `✓ ${providerLabel}`;
      setVisible(badge, true, 'inline-block');
    }
  }
}

/**
 * Renders the property preview confirmation box
 * @param {Object} data - Extracted property data
 * @param {number} homePrice - Property sale price
 * @param {Object} domRefs - DOM element references
 */
function renderPreviewBox(data, homePrice, domRefs) {
  const previewBox = domRefs.mlsPreviewBox;
  const previewAddress = domRefs.mlsPreviewAddress;
  const previewDetails = domRefs.mlsPreviewDetails;

  if (!previewBox || !previewAddress || !previewDetails) {
    return;
  }

  const hoaFee = data.hoaFee;
  previewAddress.textContent = data.address || 'Property Parsed Successfully';
  previewDetails.textContent = `Home Price: $${parseInt(homePrice).toLocaleString()} | HOA: $${hoaFee || 0}/mo`;
  previewBox.style.display = 'block';

  console.log('[SYSTEM] Target URL details applied successfully.');
}

/**
 * Fetches a value estimate for the "Have a house to sell?" section, reusing
 * the same shared backend/property-lookup.php endpoint (and its 7-day
 * cache) as the purchase-side Redfin auto-fill. Unlike fetchPropertyData()
 * above, this does NOT touch any of the main purchase inputs (home price,
 * HOA, tax rate) — it only returns the parsed price/address so the caller
 * can apply it to the sell-side fields.
 *
 * This is genuinely best-effort: the extraction was built against active
 * Redfin *listing* pages, and an off-market home's page (the case here —
 * you're not selling on Redfin, just looking up its estimate) can carry
 * the value under a different JSON key. The shared endpoint tries a few
 * known field name patterns, but if Redfin changes their page structure
 * this may need re-tuning against a real URL — see backend/tests/ for the
 * fixture-based test harness.
 *
 * @param {string} inputUrl - Full Redfin property page URL for the user's current home
 * @param {boolean} [force=false] - Bypass the shared 7-day cache lookup.
 * @returns {Promise<{ price?: number, address?: string|null, error?: string }|null>} Parsed result or error, or null on failure
 */
export async function fetchRedfinValueOnly(inputUrl, force = false) {
  if (!looksLikeUrl(inputUrl)) {
    return null;
  }

  try {
    const fetchUrl = `${CONFIG.API_MLS}?url=${encodeUrlParam(inputUrl)}${force ? '&force=1' : ''}`;
    const response = await fetch(fetchUrl);
    const text = await response.text();

    if (text.trim().startsWith('<?php') || text.includes('<?php')) {
      return null; // Local static dev server with no PHP runtime
    }

    const data = JSON.parse(text);
    if (data && data.price) {
      return {
        price: data.price,
        address: data.address || null,
        url: data.url || inputUrl,
        provider: data.provider || null
      };
    }
    if (data && data.error) {
      return { error: data.error };
    }
  } catch (e) {
    console.error('[ERROR] Sell-side value lookup failed:', e);
  }

  return null;
}

/**
 * Validates MLS input before fetching
 * @param {string} input - User input
 * @returns {Object} Validation result: { isValid: boolean, message?: string }
 */
export function validateMLSInput(input) {
  if (!input || !input.trim()) {
    return {
      isValid: false,
      message: CONFIG.ERROR_NO_URL
    };
  }

  if (!looksLikeUrl(input)) {
    return {
      isValid: false,
      message: CONFIG.ERROR_INVALID_URL
    };
  }

  return { isValid: true };
}
