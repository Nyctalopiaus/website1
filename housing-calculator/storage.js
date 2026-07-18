/**
 * Storage Module - Handles persistent storage via localStorage and API
 * Provides fallback mechanisms for offline support
 */

import { CONFIG, DEFAULTS } from './config.js';
import { parseFloatSafe, parseIntSafe, mergeDefaults } from './utils.js';

/**
 * Loads calculator state from API, with localStorage fallback
 * @returns {Promise<Object>} Loaded calculator state
 */
export async function loadSavedInputs() {
  try {
    const response = await fetch(CONFIG.API_CALCULATOR);
    if (response.ok) {
      const data = await response.json();
      if (data) {
        return mergeDefaults(DEFAULTS, data);
      }
    } else {
      console.error('[ERROR] Failed to fetch calculator profile:', response.statusText);
      return loadFromLocalStorage();
    }
  } catch (error) {
    console.error('[ERROR] API connection error:', error);
    return loadFromLocalStorage();
  }
}

/**
 * Loads calculator state from browser localStorage
 * @returns {Object} Loaded state or defaults
 */
export function loadFromLocalStorage() {
  try {
    const saved = localStorage.getItem(CONFIG.STORAGE_KEY_INPUTS);
    if (saved) {
      const data = JSON.parse(saved);
      return mergeDefaults(DEFAULTS, data);
    }
  } catch (error) {
    console.error('[ERROR] Failed to parse localStorage:', error);
  }
  return DEFAULTS;
}

/**
 * Saves calculator state to localStorage immediately, and syncs to API after debounce
 * @param {Object} data - Calculator state to save
 * @param {Function} onSyncComplete - Optional callback after sync completes
 */
export function saveInputs(data, onSyncComplete) {
  // Save locally for instant offline feedback
  localStorage.setItem(CONFIG.STORAGE_KEY_INPUTS, JSON.stringify(data));

  // Debounce the network sync request
  if (saveInputs.debounceTimer) {
    clearTimeout(saveInputs.debounceTimer);
  }

  saveInputs.debounceTimer = setTimeout(async () => {
    try {
      const response = await fetch(CONFIG.API_CALCULATOR, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });

      if (!response.ok) {
        console.error('[ERROR] API sync failed:', response.statusText);
      }

      if (onSyncComplete) {
        onSyncComplete(response.ok);
      }
    } catch (error) {
      console.error('[ERROR] Failed to sync calculator inputs with database:', error);
      if (onSyncComplete) {
        onSyncComplete(false);
      }
    }
  }, CONFIG.SAVE_DEBOUNCE_MS);
}

// Static property for debounce timer
saveInputs.debounceTimer = null;

/**
 * Applies loaded data to DOM input elements
 * @param {Object} data - Loaded state
 * @param {Object} domRefs - Object containing DOM element references
 */
export function applyLoadedDataToDOM(data, domRefs) {
  const safeSet = (element, value) => {
    if (element) element.value = value;
  };

  safeSet(domRefs.homePriceInput, data.homePrice);
  safeSet(domRefs.homePriceSlider, data.homePrice);
  safeSet(domRefs.downPaymentAmountInput, data.downPaymentAmount);
  safeSet(domRefs.downPaymentPercentInput, data.downPaymentPercent);
  safeSet(domRefs.downPaymentSlider, data.downPaymentPercent);
  safeSet(domRefs.interest30Input, data.interest30);
  safeSet(domRefs.interest15Input, data.interest15);
  safeSet(domRefs.taxRateInput, data.taxRate);
  safeSet(domRefs.homeInsuranceInput, data.homeInsurance);
  safeSet(domRefs.hoaFeesInput, data.hoaFees);
  safeSet(domRefs.pmiRateInput, data.pmiRate);
  safeSet(domRefs.grossIncomeInput, data.grossIncome);
  safeSet(domRefs.additionalPaymentInput, data.additionalPayment);
  safeSet(domRefs.additionalPaymentSlider, data.additionalPayment);
  safeSet(domRefs.lumpSumAmountInput, data.lumpSumAmount);
  safeSet(domRefs.lumpSumFrequencyInput, data.lumpSumFrequency);
}

/**
 * Fetches current mortgage rates from proxy
 * @returns {Promise<Object|null>} Rate data or null if failed
 */
export async function fetchMortgageRates() {
  try {
    const response = await fetch(CONFIG.API_RATES);
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('[ERROR] Could not fetch live rates:', error);
    return null;
  }
}
