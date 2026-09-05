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
import { parseFloatSafe, parseIntSafe, mergeDefaults, setVisible } from './utils.js';

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
 * Encodes calculator state into a URL-safe string for the "Copy Link" share
 * feature — same JSON shape as the localStorage blob, just percent-encoded
 * into a query-string value instead of written to disk. Never touches a
 * server: the numbers live entirely in the link itself, so sharing one
 * doesn't compromise the "100% Private & Local" promise shown in the UI.
 * @param {Object} data - Same shape as saveInputs()'s argument (see buildSaveData() in app.js)
 * @returns {string} Percent-encoded JSON, safe to use as a query param value
 */
export function encodeStateForSharing(data) {
  return encodeURIComponent(JSON.stringify(data));
}

/**
 * Reverses encodeStateForSharing(). Returns null on any malformed input
 * (hand-edited URL, truncated copy/paste, a link from a much older version
 * of this app, etc.) so the caller can fall back to the normal localStorage
 * load instead of crashing on startup.
 * @param {string} encoded
 * @returns {Object|null}
 */
export function decodeStateFromSharing(encoded) {
  try {
    return JSON.parse(decodeURIComponent(encoded));
  } catch (error) {
    console.error('[ERROR] Failed to decode shared calculator link:', error);
    return null;
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
  safeSet(domRefs.cashDownPaymentInput, data.cashDownPayment !== undefined ? data.cashDownPayment : data.downPaymentAmount);
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
  safeSet(domRefs.otherMonthlyDebtsInput, data.otherMonthlyDebts);
  // Max Affordability solver + Cash-to-Close tally. The credit-score band's
  // suggested-DTI note is re-rendered separately by app.js (it isn't a
  // simple value-based restore since it also needs the lookup-table note text).
  safeSet(domRefs.targetBackEndDTIInput, data.targetBackEndDTI !== undefined ? data.targetBackEndDTI : CONFIG.DEFAULT_TARGET_BACKEND_DTI);
  safeSet(domRefs.creditScoreBandInput, data.creditScoreBand || '');
  safeSet(domRefs.closingCostPercentInput, data.closingCostPercent !== undefined ? data.closingCostPercent : CONFIG.DEFAULT_CLOSING_COST_PERCENT);
  safeSet(domRefs.reserveMonthsInput, data.reserveMonths !== undefined ? data.reserveMonths : CONFIG.DEFAULT_RESERVE_MONTHS);
  safeSet(domRefs.extraProjectCashInput, data.extraProjectCash || 0);
  safeSet(domRefs.cashAvailableInput, data.cashAvailable || 0);
  // Income-basis toggle, pay frequency, and the fine-tune slider/number
  // field are all restored by app.js (setIncomeBasis()/setPayFrequency())
  // right after this runs — not simple value-based restores, since the
  // fine-tune control's displayed value is always computed from
  // payFrequency + netMonthlyOverride + the live income, not stored directly.
  safeSet(domRefs.additionalPaymentInput, data.additionalPayment);
  safeSet(domRefs.additionalPaymentSlider, data.additionalPayment);
  safeSet(domRefs.lumpSumAmountInput, data.lumpSumAmount);
  safeSet(domRefs.lumpSumFrequencyInput, data.lumpSumFrequency);
  safeSet(domRefs.biweeklyExtraInput, data.biweeklyExtra || 0);
  safeSet(domRefs.biweeklyExtraSlider, data.biweeklyExtra || 0);

  // Frequency toggle buttons
  const freq = data.paymentFrequency || 'monthly';
  [domRefs.btnFreqMonthly, domRefs.btnFreqBiweekly, domRefs.btnFreqAccelerated].forEach(btn => {
    if (btn) btn.classList.remove('active');
  });
  if (freq === 'biweekly' && domRefs.btnFreqBiweekly) {
    domRefs.btnFreqBiweekly.classList.add('active');
  } else if (freq === 'accelerated' && domRefs.btnFreqAccelerated) {
    domRefs.btnFreqAccelerated.classList.add('active');
  } else if (domRefs.btnFreqMonthly) {
    domRefs.btnFreqMonthly.classList.add('active');
  }

  if (domRefs.biweeklyExtraContainer) {
    setVisible(domRefs.biweeklyExtraContainer, freq === 'biweekly' || freq === 'accelerated');
  }

  // "Have a house to sell?" section. The checkbox's checked state and the
  // panel's show/hide are handled by app.js (not value-based, so safeSet
  // doesn't apply), right after this function runs.
  safeSet(domRefs.sellHomeValueInput, data.sellHomeValue);
  safeSet(domRefs.sellMortgagePayoffInput, data.sellMortgagePayoff);
  safeSet(domRefs.sellMortgagePaymentInput, data.sellMortgagePayment);
  safeSet(domRefs.sellMortgageScheduleInput, data.sellMortgageSchedule || 'monthly');
  safeSet(domRefs.sellCommissionPercentInput, data.sellCommissionPercent);
  safeSet(domRefs.sellClosingCostsPercentInput, data.sellClosingCostsPercent);
  safeSet(domRefs.sellRepairCostsInput, data.sellRepairCosts);
  safeSet(domRefs.sellConcessionsInput, data.sellConcessions);
  safeSet(domRefs.sellMovingCostsInput, data.sellMovingCosts);
  safeSet(domRefs.sellProceedsPercentSliderInput, data.sellProceedsPercent);
  safeSet(domRefs.asIsSaleValueInput, data.asIsSaleValue !== undefined ? data.asIsSaleValue : CONFIG.DEFAULT_AS_IS_SALE_VALUE);
  safeSet(domRefs.asIsMonthsSavedInput, data.asIsMonthsSaved !== undefined ? data.asIsMonthsSaved : CONFIG.DEFAULT_AS_IS_MONTHS_SAVED);

  // Bridge Loan mode fields. saleMode itself (which sub-panel is visible)
  // is restored by app.js's setSaleMode() right after this runs — not
  // value-based, so safeSet doesn't apply, same as the sell-house checkbox.
  safeSet(domRefs.bridgeLoanAmountInput, data.bridgeLoanAmount);
  safeSet(domRefs.bridgeExtraCashInput, data.bridgeExtraCash);
  safeSet(domRefs.monthsUntilSaleInput, data.monthsUntilSale);
  safeSet(domRefs.bridgeLoanRateInput, data.bridgeLoanRate);
  safeSet(domRefs.bridgeLoanFeesPercentInput, data.bridgeLoanFeesPercent);
  safeSet(domRefs.recastFeeInput, data.recastFee);

  // Keep as Rental mode fields. saleMode itself is restored by app.js's
  // setSaleMode() right after this runs, same as the other sub-modes.
  safeSet(domRefs.rentalProjectedMonthlyRentInput, data.rentalProjectedMonthlyRent !== undefined ? data.rentalProjectedMonthlyRent : CONFIG.DEFAULT_RENTAL_PROJECTED_RENT);
  safeSet(domRefs.rentalOffsetPercentInput, data.rentalOffsetPercent !== undefined ? data.rentalOffsetPercent : CONFIG.DEFAULT_RENTAL_OFFSET_PERCENT);
  // Rental down-payment funding sub-choice (Cash Only vs. HELOC). The mode
  // itself (which sub-panel is visible) is restored by app.js's
  // setRentalFundingMode() right after this runs, same pattern as saleMode.
  safeSet(domRefs.rentalHelocAmountInput, data.rentalHelocAmount || 0);
  safeSet(domRefs.rentalHelocRateInput, data.rentalHelocRate !== undefined ? data.rentalHelocRate : CONFIG.DEFAULT_RENTAL_HELOC_RATE);
  safeSet(domRefs.rentalHelocPaymentInput, data.rentalHelocPayment || 0);
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
