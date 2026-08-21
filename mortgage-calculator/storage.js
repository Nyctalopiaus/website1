/**
 * Storage Module - Handles persistent storage via localStorage
 * Calculator inputs are intentionally local-only (per-browser), matching the
 * "100% Private & Local" claim shown in the UI. Do NOT reintroduce a server
 * sync call here without per-user auth/session scoping — a previous version
 * synced to a single shared, unauthenticated /api/calculator record, which
 * meant every visitor's inputs overwrote and were visible to every other
 * visitor. See project notes for details.
 */

import { CONFIG, DEFAULTS } from './config.js';
import { parseFloatSafe, parseIntSafe, mergeDefaults } from './utils.js';

/**
 * Loads calculator state from localStorage
 * @returns {Promise<Object>} Loaded calculator state
 */
export async function loadSavedInputs() {
  return loadFromLocalStorage();
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
 * Saves calculator state to localStorage only (no network sync — see module header)
 * @param {Object} data - Calculator state to save
 */
export function saveInputs(data) {
  try {
    localStorage.setItem(CONFIG.STORAGE_KEY_INPUTS, JSON.stringify(data));
  } catch (error) {
    console.error('[ERROR] Failed to save calculator inputs to localStorage:', error);
  }
}

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
  safeSet(domRefs.grossAnnualIncomeInput, data.grossAnnualIncome);
  safeSet(domRefs.additionalPaymentInput, data.additionalPayment);
  safeSet(domRefs.additionalPaymentSlider, data.additionalPayment);
  safeSet(domRefs.lumpSumAmountInput, data.lumpSumAmount);
  safeSet(domRefs.lumpSumFrequencyInput, data.lumpSumFrequency);

  // "Have a house to sell?" section. The checkbox's checked state and the
  // panel's show/hide are handled by app.js (not value-based, so safeSet
  // doesn't apply), right after this function runs.
  safeSet(domRefs.sellHomeValueInput, data.sellHomeValue);
  safeSet(domRefs.sellMortgagePayoffInput, data.sellMortgagePayoff);
  safeSet(domRefs.sellCommissionPercentInput, data.sellCommissionPercent);
  safeSet(domRefs.sellClosingCostsPercentInput, data.sellClosingCostsPercent);
  safeSet(domRefs.sellRepairCostsInput, data.sellRepairCosts);
  safeSet(domRefs.sellConcessionsInput, data.sellConcessions);
  safeSet(domRefs.sellMovingCostsInput, data.sellMovingCosts);
  safeSet(domRefs.sellProceedsPercentSliderInput, data.sellProceedsPercent);
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
