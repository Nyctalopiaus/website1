/**
 * Property Scraper Module - Fetches and parses property data from Redfin
 * Uses secure mls-proxy.php backend with URL encoding
 */

import { CONFIG } from './config.js';
import { looksLikeUrl, encodeUrlParam } from './utils.js';

/**
 * Fetches property data from a Redfin URL
 * @param {string} inputUrl - Full Redfin property page URL
 * @param {Object} domRefs - DOM element references for updating UI
 * @param {Object} callbacks - Callback functions: onSuccess, onError, onStart, onComplete
 */
// NOTE: Property fetching always routes through mls-proxy.php (server-side).
// Do not add a client-side scrape API call here — any token embedded in this
// file ships to every visitor's browser in plain text (view-source, network
// tab). Keep scrape/proxy credentials server-side only (see api.env).

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
      applyPropertyData(data, homePrice, domRefs);
      renderPreviewBox(data, homePrice, domRefs);
      onSuccess(data);
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
 */
function applyPropertyData(data, homePrice, domRefs) {
  // Set home price
  if (domRefs.homePriceInput) {
    domRefs.homePriceInput.value = homePrice;
    domRefs.homePriceSlider.value = Math.min(Math.max(homePrice, CONFIG.MIN_HOME_PRICE), CONFIG.MAX_HOME_PRICE);
    
    const badge = document.getElementById('badge-redfin-price');
    if (badge) badge.style.display = 'inline-block';
  }

  // Update down payment to maintain percentage
  if (domRefs.downPaymentPercentInput && domRefs.downPaymentAmountInput) {
    const percent = parseFloat(domRefs.downPaymentPercentInput.value) || 0;
    const amount = (percent / 100) * homePrice;
    domRefs.downPaymentAmountInput.value = Math.round(amount);
  }

  // Apply HOA fee
  const hoaFee = data.hoa_fee !== undefined ? data.hoa_fee : data.hoaFee;
  if (hoaFee !== undefined && domRefs.hoaFeesInput) {
    domRefs.hoaFeesInput.value = hoaFee;
    const badge = document.getElementById('badge-redfin-hoa');
    if (badge) badge.style.display = 'inline-block';
  }

  // Apply property tax rate
  const propertyTax = data.property_tax || data.taxRate;
  if (propertyTax !== undefined && domRefs.taxRateInput) {
    domRefs.taxRateInput.value = parseFloat(propertyTax).toFixed(2);
    const badge = document.getElementById('badge-redfin-tax');
    if (badge) badge.style.display = 'inline-block';
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

  const hoaFee = data.hoa_fee !== undefined ? data.hoa_fee : data.hoaFee;
  previewAddress.textContent = data.address || 'Property Parsed Successfully';
  previewDetails.textContent = `Home Price: $${parseInt(homePrice).toLocaleString()} | HOA: $${hoaFee || 0}/mo`;
  previewBox.style.display = 'block';

  console.log('[SYSTEM] Target URL details applied successfully.');
}

/**
 * Fetches a value estimate for the "Have a house to sell?" section, reusing
 * the same mls-proxy.php backend as the purchase-side Redfin auto-fill.
 * Unlike fetchPropertyData() above, this does NOT touch any of the main
 * purchase inputs (home price, HOA, tax rate) — it only returns the parsed
 * price/address so the caller can apply it to the sell-side fields.
 *
 * This is genuinely best-effort: the proxy's extraction was built against
 * active Redfin *listing* pages, and an off-market home's page (the case
 * here — you're not selling on Redfin, just looking up its estimate) can
 * carry the value under a different JSON key. mls-proxy.php tries a few
 * known field name patterns, but if Redfin changes their page structure
 * this may need re-tuning against a real URL.
 *
 * @param {string} inputUrl - Full Redfin property page URL for the user's current home
 * @param {boolean} [force=false] - Bypass mls-proxy.php's 20-minute response cache and fetch live (still writes a fresh cache entry on success). Used by the "overwrite cache" button when a cached value is known-stale or was wrong.
 * @returns {Promise<{ price: number, address: string|null }|null>} Parsed result, or null on failure
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
      return { price: data.price, address: data.address || null };
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
