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

    // Fetch property data
    const fetchUrl = `${CONFIG.API_MLS}?url=${encodeUrlParam(inputUrl)}`;
    const response = await fetch(fetchUrl);
    const data = await response.json();

    if (data.error) {
      console.error('[ERROR] Parser Backend Error:', data.error);
      onError(data.error);
      return;
    }

    // Extract price (required field)
    const homePrice = data.price || data.props?.pageProps?.initialReduxState?.propertyDetails?.property?.price;
    if (!homePrice) {
      onError(CONFIG.ERROR_NO_PRICE);
      return;
    }

    // Apply extracted data to inputs
    applyPropertyData(data, homePrice, domRefs);
    
    // Render confirmation preview
    renderPreviewBox(data, homePrice, domRefs);

    onSuccess(data);
  } catch (error) {
    console.error('[ERROR] Network Fetch Error:', error);
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
