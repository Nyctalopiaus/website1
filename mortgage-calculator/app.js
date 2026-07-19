/**
 * Housing Calculator - Main Application Entry Point
 * Orchestrates modules and handles event listeners
 */

import { CONFIG, DEFAULTS } from './config.js';
import { debounce, clamp, getElement } from './utils.js';
import { performCalculations, extractInputValues } from './calculator.js';
import { loadSavedInputs, applyLoadedDataToDOM, saveInputs, fetchMortgageRates } from './storage.js';
import { fetchPropertyData, validateMLSInput } from './scraper.js';
import {
  createDOMReferences,
  updateTermCardSelection,
  updateAllOutputs,
  setButtonLoading,
  updateRatesAttribution
} from './ui.js';

// ============================================================================
// APPLICATION STATE
// ============================================================================

let activeTerm = 30;
const domRefs = createDOMReferences();

// ============================================================================
// CALCULATION & UPDATE ORCHESTRATION
// ============================================================================

/**
 * Main calculation pipeline - extracts inputs, performs calculations, and updates UI
 */
function calculateAll() {
  const inputs = extractInputValues(domRefs);
  const results = performCalculations(inputs);

  // Add missing fields to results for UI rendering
  results.homePrice = inputs.homePrice;
  results.hoaFees = inputs.hoaFees;
  results.grossIncome = inputs.grossIncome;
  results.additionalPayment = inputs.additionalPayment;

  updateAllOutputs(results, activeTerm, domRefs);
}

/**
 * Debounced save function to reduce API calls
 */
const debouncedSave = debounce(() => {
  const data = {
    homePrice: parseFloat(domRefs.homePriceInput.value),
    downPaymentAmount: parseFloat(domRefs.downPaymentAmountInput.value),
    downPaymentPercent: parseFloat(domRefs.downPaymentPercentInput.value),
    interest30: parseFloat(domRefs.interest30Input.value),
    interest15: parseFloat(domRefs.interest15Input.value),
    taxRate: parseFloat(domRefs.taxRateInput.value),
    homeInsurance: parseFloat(domRefs.homeInsuranceInput.value),
    hoaFees: parseFloat(domRefs.hoaFeesInput.value),
    pmiRate: parseFloat(domRefs.pmiRateInput.value),
    grossIncome: parseFloat(domRefs.grossIncomeInput.value),
    additionalPayment: parseFloat(domRefs.additionalPaymentInput.value) || 0,
    lumpSumAmount: parseFloat(domRefs.lumpSumAmountInput.value) || 0,
    lumpSumFrequency: parseInt(domRefs.lumpSumFrequencyInput.value) || 12,
    activeTerm
  };
  saveInputs(data);
}, CONFIG.SAVE_DEBOUNCE_MS);

/**
 * Debounced calculation to reduce re-renders during rapid input
 */
const debouncedCalculate = debounce(() => {
  calculateAll();
  debouncedSave();
}, CONFIG.CALCULATE_DEBOUNCE_MS);

// ============================================================================
// EVENT LISTENERS - INPUT SYNCHRONIZATION
// ============================================================================

/**
 * Helper: Attach change listeners to all input elements
 */
function attachInputListeners() {
  // Home price syncing
  domRefs.homePriceInput.addEventListener('input', () => {
    const val = parseFloat(domRefs.homePriceInput.value) || 0;
    domRefs.homePriceSlider.value = clamp(val, CONFIG.MIN_HOME_PRICE, CONFIG.MAX_HOME_PRICE);

    // Hide Redfin badge when manually edited
    const badge = getElement('badge-redfin-price');
    if (badge) badge.style.display = 'none';

    // Maintain down payment percentage
    const percent = parseFloat(domRefs.downPaymentPercentInput.value) || 0;
    const amount = (percent / 100) * val;
    domRefs.downPaymentAmountInput.value = Math.round(amount);

    debouncedCalculate();
  });

  domRefs.homePriceSlider.addEventListener('input', () => {
    const val = parseFloat(domRefs.homePriceSlider.value);
    domRefs.homePriceInput.value = val;

    const badge = getElement('badge-redfin-price');
    if (badge) badge.style.display = 'none';

    const percent = parseFloat(domRefs.downPaymentPercentInput.value) || 0;
    const amount = (percent / 100) * val;
    domRefs.downPaymentAmountInput.value = Math.round(amount);

    debouncedCalculate();
  });

  // Down payment amount syncing
  domRefs.downPaymentAmountInput.addEventListener('input', () => {
    let amount = parseFloat(domRefs.downPaymentAmountInput.value) || 0;
    const homePrice = parseFloat(domRefs.homePriceInput.value) || 0;

    if (amount > homePrice) {
      domRefs.downPaymentAmountInput.value = homePrice;
      amount = homePrice;
    }

    if (homePrice > 0) {
      const percent = clamp((amount / homePrice) * 100, 0, 100);
      domRefs.downPaymentPercentInput.value = Math.round(percent);
      domRefs.downPaymentSlider.value = Math.round(percent);
    }

    debouncedCalculate();
  });

  // Down payment percent syncing
  domRefs.downPaymentPercentInput.addEventListener('input', () => {
    const percent = parseFloat(domRefs.downPaymentPercentInput.value) || 0;
    const homePrice = parseFloat(domRefs.homePriceInput.value) || 0;

    domRefs.downPaymentSlider.value = clamp(percent, 0, 100);
    const amount = (percent / 100) * homePrice;
    domRefs.downPaymentAmountInput.value = Math.round(amount);

    debouncedCalculate();
  });

  domRefs.downPaymentSlider.addEventListener('input', () => {
    const percent = parseFloat(domRefs.downPaymentSlider.value);
    const homePrice = parseFloat(domRefs.homePriceInput.value) || 0;

    domRefs.downPaymentPercentInput.value = percent;
    const amount = (percent / 100) * homePrice;
    domRefs.downPaymentAmountInput.value = Math.round(amount);

    debouncedCalculate();
  });

  // Additional payment syncing
  domRefs.additionalPaymentInput.addEventListener('input', () => {
    domRefs.additionalPaymentSlider.value = parseFloat(domRefs.additionalPaymentInput.value) || 0;
    debouncedCalculate();
  });

  domRefs.additionalPaymentSlider.addEventListener('input', () => {
    domRefs.additionalPaymentInput.value = domRefs.additionalPaymentSlider.value;
    debouncedCalculate();
  });

  // Standard numeric inputs (clear badges on edit)
  const numericInputsWithBadges = [
    { el: domRefs.interest30Input, badgeId: 'badge-live-30' },
    { el: domRefs.interest15Input, badgeId: 'badge-live-15' },
    { el: domRefs.taxRateInput, badgeId: 'badge-redfin-tax' },
    { el: domRefs.hoaFeesInput, badgeId: 'badge-redfin-hoa' }
  ];

  numericInputsWithBadges.forEach(({ el, badgeId }) => {
    el.addEventListener('input', () => {
      const badge = getElement(badgeId);
      if (badge) badge.style.display = 'none';
      debouncedCalculate();
    });
  });

  // Other numeric inputs
  const otherNumericInputs = [
    domRefs.homeInsuranceInput,
    domRefs.pmiRateInput,
    domRefs.grossIncomeInput
  ];

  otherNumericInputs.forEach(input => {
    input.addEventListener('input', debouncedCalculate);
  });

  // Lump sum inputs
  domRefs.lumpSumAmountInput.addEventListener('input', debouncedCalculate);
  domRefs.lumpSumFrequencyInput.addEventListener('change', debouncedCalculate);

  // Term card toggles
  domRefs.card30.addEventListener('click', () => {
    activeTerm = 30;
    updateTermCardSelection(activeTerm, domRefs);
    calculateAll();
    debouncedSave();
  });

  domRefs.card15.addEventListener('click', () => {
    activeTerm = 15;
    updateTermCardSelection(activeTerm, domRefs);
    calculateAll();
    debouncedSave();
  });
}

// ============================================================================
// EVENT LISTENERS - ACTIONS
// ============================================================================

/**
 * Attach button and action listeners
 */
function attachActionListeners() {
  // View Amortization Table
  domRefs.btnViewAmort.addEventListener('click', () => {
    window.location.href = 'amortization.html';
  });

  // Load Live Rates
  domRefs.loadRatesBtn.addEventListener('click', loadLiveMortgageRates);

  // Fetch Property Data
  domRefs.btnSearchMls.addEventListener('click', handleSearchMls);
}

/**
 * Handles MLS/Redfin property data fetching
 */
function handleSearchMls() {
  const userInput = domRefs.mlsNumberInput.value.trim();

  const validation = validateMLSInput(userInput);
  if (!validation.isValid) {
    alert(validation.message);
    return;
  }

  // Show loading state
  setButtonLoading(domRefs.btnSearchMls, CONFIG.MSG_PARSING_PAGE, true);
  if (domRefs.mlsPreviewBox) domRefs.mlsPreviewBox.style.display = 'none';

  // Fetch and apply data
  fetchPropertyData(userInput, domRefs, {
    onStart: () => setButtonLoading(domRefs.btnSearchMls, CONFIG.MSG_PARSING_PAGE, true),
    onSuccess: () => {
      calculateAll();
      debouncedSave();
    },
    onError: (error) => alert(error),
    onComplete: () => setButtonLoading(domRefs.btnSearchMls, CONFIG.MSG_FETCH_PROPERTY, false)
  });
}

/**
 * Loads live mortgage rates from the proxy
 */
async function loadLiveMortgageRates() {
  setButtonLoading(domRefs.loadRatesBtn, CONFIG.MSG_SYNCING_RATES, true);

  try {
    const data = await fetchMortgageRates();

    if (data && data.rate) {
      const rate30 = parseFloat(data.rate);
      if (!isNaN(rate30)) {
        domRefs.interest30Input.value = rate30.toFixed(2);
        const badge = getElement('badge-live-30');
        if (badge) badge.style.display = 'inline-block';

        const rate15 = data.rate15 ? parseFloat(data.rate15) : (rate30 - 0.70);
        if (!isNaN(rate15)) {
          domRefs.interest15Input.value = rate15.toFixed(2);
          const badge15 = getElement('badge-live-15');
          if (badge15) badge15.style.display = 'inline-block';
        }
      }

      // Update attribution
      if (data.source && data.date) {
        updateRatesAttribution(data.source, data.date, domRefs);
      }

      calculateAll();
      debouncedSave();
      setButtonLoading(domRefs.loadRatesBtn, CONFIG.MSG_UPDATED, false);
    } else {
      throw new Error('No rate data found');
    }
  } catch (error) {
    console.error('[ERROR] Could not fetch live rates:', error);
    if (domRefs.ratesAttributionEl) {
      domRefs.ratesAttributionEl.textContent = 'Source: Fallback (July 2026)';
      domRefs.ratesAttributionEl.classList.add('visible');
    }
    setButtonLoading(domRefs.loadRatesBtn, CONFIG.MSG_ERROR, false);
  }

  // Reset button after delay
  setTimeout(() => {
    setButtonLoading(domRefs.loadRatesBtn, '⚡ Load Live Rates', false);
  }, 2000);
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the application on page load
 */
async function initializeApp() {
  try {
    // Load saved data
    const savedData = await loadSavedInputs();
    applyLoadedDataToDOM(savedData, domRefs);
    activeTerm = savedData.activeTerm || 30;

    // Attach all listeners
    attachInputListeners();
    attachActionListeners();

    // Update UI and calculate
    updateTermCardSelection(activeTerm, domRefs);
    calculateAll();

    // Load live rates on startup
    loadLiveMortgageRates();
  } catch (error) {
    console.error('[ERROR] Failed to initialize app:', error);
  }
}

// ============================================================================
// START APPLICATION
// ============================================================================

document.addEventListener('DOMContentLoaded', initializeApp);
