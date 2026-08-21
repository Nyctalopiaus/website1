/**
 * Housing Calculator - Main Application Entry Point
 * Orchestrates modules and handles event listeners
 */

import { CONFIG, DEFAULTS } from './config.js';
import { debounce, clamp, getElement } from './utils.js';
import { performCalculations, extractInputValues, calculateSaleProceeds } from './calculator.js';
import { loadSavedInputs, applyLoadedDataToDOM, saveInputs, fetchMortgageRates } from './storage.js';
import { fetchPropertyData, validateMLSInput, fetchRedfinValueOnly } from './scraper.js';
import {
  createDOMReferences,
  updateTermCardSelection,
  updateAllOutputs,
  setButtonLoading,
  updateRatesAttribution,
  updateSellProceedsUI,
  updateStaleValueWarning
} from './ui.js';

// ============================================================================
// APPLICATION STATE
// ============================================================================

let activeTerm = 30;
// Epoch ms of the last time sellHomeValue was set (lookup or manual edit).
// null until it's actually been touched once — see config.js DEFAULTS.
let sellHomeValueUpdatedAt = null;
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
  results.grossAnnualIncome = inputs.grossAnnualIncome;
  results.additionalPayment = inputs.additionalPayment;

  updateAllOutputs(results, activeTerm, domRefs);
}

/**
 * Reads the "Have a house to sell?" fields into the shape calculateSaleProceeds() expects
 */
function getSellInputs() {
  return {
    sellHomeValue: parseFloat(domRefs.sellHomeValueInput.value) || 0,
    sellMortgagePayoff: parseFloat(domRefs.sellMortgagePayoffInput.value) || 0,
    sellCommissionPercent: parseFloat(domRefs.sellCommissionPercentInput.value) || 0,
    sellClosingCostsPercent: parseFloat(domRefs.sellClosingCostsPercentInput.value) || 0,
    sellRepairCosts: parseFloat(domRefs.sellRepairCostsInput.value) || 0,
    sellConcessions: parseFloat(domRefs.sellConcessionsInput.value) || 0,
    sellMovingCosts: parseFloat(domRefs.sellMovingCostsInput.value) || 0,
    sellProceedsPercent: parseFloat(domRefs.sellProceedsPercentSliderInput.value) || 0
  };
}

/**
 * Recomputes and re-renders the net-proceeds breakdown. Cheap arithmetic
 * (no amortization loop involved), so this runs directly on every relevant
 * input event rather than going through debouncedCalculate.
 */
function updateSellProceeds() {
  const inputs = getSellInputs();
  const proceeds = calculateSaleProceeds(inputs);
  updateSellProceedsUI(proceeds, inputs.sellProceedsPercent, domRefs);
  updateStaleValueWarning(sellHomeValueUpdatedAt, domRefs);
  return proceeds;
}

/**
 * Marks the home value as freshly confirmed right now — called whenever the
 * user actually provides a new value (manual edit or a successful Redfin
 * lookup), never just from opening the panel.
 */
function markSellHomeValueFresh() {
  sellHomeValueUpdatedAt = Date.now();
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
    grossAnnualIncome: parseFloat(domRefs.grossAnnualIncomeInput.value),
    additionalPayment: parseFloat(domRefs.additionalPaymentInput.value) || 0,
    lumpSumAmount: parseFloat(domRefs.lumpSumAmountInput.value) || 0,
    lumpSumFrequency: parseInt(domRefs.lumpSumFrequencyInput.value) || 12,
    activeTerm,

    // "Have a house to sell?" section — local-only, same as everything else
    sellingHouse: domRefs.hasHouseToSellInput.checked,
    ...getSellInputs(),
    sellHomeValueUpdatedAt
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

    // Keep the down payment dollar amount fixed (it's the more static number
    // for most buyers) and recompute its percentage against the new price.
    let amount = parseFloat(domRefs.downPaymentAmountInput.value) || 0;
    if (amount > val) {
      amount = val;
      domRefs.downPaymentAmountInput.value = Math.round(amount);
    }
    const percent = val > 0 ? clamp((amount / val) * 100, 0, 100) : 0;
    domRefs.downPaymentPercentInput.value = Math.round(percent);
    domRefs.downPaymentSlider.value = Math.round(percent);

    debouncedCalculate();
  });

  domRefs.homePriceSlider.addEventListener('input', () => {
    const val = parseFloat(domRefs.homePriceSlider.value);
    domRefs.homePriceInput.value = val;

    const badge = getElement('badge-redfin-price');
    if (badge) badge.style.display = 'none';

    // Keep the down payment dollar amount fixed and recompute its percentage
    // against the new price (same logic as the Home Price number input above).
    let amount = parseFloat(domRefs.downPaymentAmountInput.value) || 0;
    if (amount > val) {
      amount = val;
      domRefs.downPaymentAmountInput.value = Math.round(amount);
    }
    const percent = val > 0 ? clamp((amount / val) * 100, 0, 100) : 0;
    domRefs.downPaymentPercentInput.value = Math.round(percent);
    domRefs.downPaymentSlider.value = Math.round(percent);

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
    domRefs.grossAnnualIncomeInput
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

/**
 * Helper: Attach listeners for the "Have a house to sell?" section
 */
function attachSellHouseListeners() {
  // Toggle checkbox — show/hide the fields panel
  domRefs.hasHouseToSellInput.addEventListener('change', () => {
    const isChecked = domRefs.hasHouseToSellInput.checked;
    domRefs.sellHouseFieldsPanel.style.display = isChecked ? 'block' : 'none';
    if (isChecked) updateSellProceeds();
    debouncedSave();
  });

  // Every field that feeds the net-proceeds math
  const sellNumericInputs = [
    domRefs.sellMortgagePayoffInput,
    domRefs.sellCommissionPercentInput,
    domRefs.sellClosingCostsPercentInput,
    domRefs.sellRepairCostsInput,
    domRefs.sellConcessionsInput,
    domRefs.sellMovingCostsInput
  ];
  sellNumericInputs.forEach(input => {
    input.addEventListener('input', () => {
      updateSellProceeds();
      debouncedSave();
    });
  });

  // Home value has its own listener so manual edits can clear the Redfin
  // source badge and mark the value as freshly confirmed (resets the
  // stale-value suggestion, since the user just told us what it is right now)
  domRefs.sellHomeValueInput.addEventListener('input', () => {
    const redfinBadge = getElement('badge-sell-redfin');
    if (redfinBadge) redfinBadge.style.display = 'none';
    markSellHomeValueFresh();
    updateSellProceeds();
    debouncedSave();
  });

  // Proceeds-to-down-payment slider
  domRefs.sellProceedsPercentSliderInput.addEventListener('input', () => {
    updateSellProceeds();
    debouncedSave();
  });

  // Redfin value lookup
  domRefs.btnSearchSellRedfin.addEventListener('click', () => handleSearchSellRedfin(false));

  // "Overwrite cache" — forces a fresh lookup bypassing mls-proxy.php's own
  // response cache, for when a cached value is known stale or was wrong
  // (this is how the redfin_estimate parsing bug's old cached $217,888
  // would otherwise keep showing up for up to its 20-minute TTL even after
  // the underlying fix is deployed). Requires a URL already entered — reuses
  // the same validation as the normal lookup button.
  if (domRefs.btnForceRefreshSellRedfin) {
    domRefs.btnForceRefreshSellRedfin.addEventListener('click', () => handleSearchSellRedfin(true));
  }

  // Apply computed proceeds to the main Down Payment field
  domRefs.btnApplyProceeds.addEventListener('click', handleApplyProceeds);

  // "Refresh Now" from the gentle stale-value suggestion — reuse the saved
  // Redfin URL if there is one, otherwise just put the user's cursor in the
  // value field so they can type a fresh number.
  if (domRefs.btnRefreshStaleValue) {
    domRefs.btnRefreshStaleValue.addEventListener('click', () => {
      const savedUrl = domRefs.sellHomeRedfinUrlInput.value.trim();
      if (savedUrl) {
        handleSearchSellRedfin();
      } else {
        domRefs.sellHomeValueInput.focus();
        domRefs.sellHomeValueInput.select();
      }
    });
  }
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

  // Quick Start Modal Toggle
  const btnOpenQuickstart = document.getElementById('btn-open-quickstart');
  const quickstartModal = document.getElementById('quickstart-modal');
  const btnCloseQuickstart = document.getElementById('btn-close-quickstart');

  if (btnOpenQuickstart && quickstartModal) {
    const openQsModal = () => {
      quickstartModal.style.display = 'flex';
      quickstartModal.classList.remove('hidden');
      quickstartModal.setAttribute('aria-hidden', 'false');
    };
    const closeQsModal = () => {
      quickstartModal.style.display = 'none';
      quickstartModal.classList.add('hidden');
      quickstartModal.setAttribute('aria-hidden', 'true');
    };

    btnOpenQuickstart.addEventListener('click', openQsModal);
    if (btnCloseQuickstart) btnCloseQuickstart.addEventListener('click', closeQsModal);
    quickstartModal.addEventListener('click', (e) => {
      if (e.target === quickstartModal) closeQsModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !quickstartModal.classList.contains('hidden')) {
        closeQsModal();
      }
    });
  }

  // Features Modal Toggle
  const btnOpenFeatures = document.getElementById('btn-open-features');
  const featuresModal = document.getElementById('features-modal');
  const btnCloseFeatures = document.getElementById('btn-close-features');

  if (btnOpenFeatures && featuresModal) {
    const openFeaturesModal = () => {
      featuresModal.style.display = 'flex';
      featuresModal.classList.remove('hidden');
      featuresModal.setAttribute('aria-hidden', 'false');
    };
    const closeFeaturesModal = () => {
      featuresModal.style.display = 'none';
      featuresModal.classList.add('hidden');
      featuresModal.setAttribute('aria-hidden', 'true');
    };

    btnOpenFeatures.addEventListener('click', openFeaturesModal);
    if (btnCloseFeatures) btnCloseFeatures.addEventListener('click', closeFeaturesModal);
    featuresModal.addEventListener('click', (e) => {
      if (e.target === featuresModal) closeFeaturesModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !featuresModal.classList.contains('hidden')) {
        closeFeaturesModal();
      }
    });
  }
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
 * Handles the sell-side Redfin value lookup — fills sellHomeValue only,
 * never touches the main purchase fields.
 * @param {boolean} [force=false] - Bypass mls-proxy.php's cache (see the
 * small "↻ overwrite cache" button) — for when a cached value is known
 * stale or was wrong (e.g. the redfin_estimate parsing bug found 2026-08-20).
 */
async function handleSearchSellRedfin(force = false) {
  const userInput = domRefs.sellHomeRedfinUrlInput.value.trim();

  const validation = validateMLSInput(userInput);
  if (!validation.isValid) {
    alert(validation.message);
    return;
  }

  setButtonLoading(domRefs.btnSearchSellRedfin, CONFIG.MSG_SELL_LOOKUP, true);

  try {
    const result = await fetchRedfinValueOnly(userInput, force);
    if (result && result.price) {
      domRefs.sellHomeValueInput.value = Math.round(result.price);
      const badge = getElement('badge-sell-redfin');
      if (badge) badge.style.display = 'inline-block';
      markSellHomeValueFresh();
      updateSellProceeds();
      debouncedSave();
      setButtonLoading(domRefs.btnSearchSellRedfin, CONFIG.MSG_UPDATED, false);
    } else {
      alert(CONFIG.ERROR_SELL_NO_VALUE);
      setButtonLoading(domRefs.btnSearchSellRedfin, CONFIG.MSG_FETCH_VALUE, false);
    }
  } catch (error) {
    console.error('[ERROR] Sell-side Redfin lookup failed:', error);
    alert(CONFIG.ERROR_SELL_NO_VALUE);
    setButtonLoading(domRefs.btnSearchSellRedfin, CONFIG.MSG_FETCH_VALUE, false);
  }

  setTimeout(() => {
    setButtonLoading(domRefs.btnSearchSellRedfin, CONFIG.MSG_FETCH_VALUE, false);
  }, 2000);
}

/**
 * Pushes the currently computed sale-proceeds amount into the main Down
 * Payment field. Dispatches a synthetic 'input' event rather than
 * duplicating the amount/percent/slider sync logic already wired up on
 * downPaymentAmountInput above.
 */
function handleApplyProceeds() {
  const proceeds = updateSellProceeds();
  const amount = Math.round(proceeds.amountToDownPayment);

  domRefs.downPaymentAmountInput.value = amount;
  domRefs.downPaymentAmountInput.dispatchEvent(new Event('input', { bubbles: true }));

  setButtonLoading(domRefs.btnApplyProceeds, `✅ Applied ${amount > 0 ? '$' + amount.toLocaleString() : '$0'}`, false);
  setTimeout(() => {
    setButtonLoading(domRefs.btnApplyProceeds, '⬇ Apply to Down Payment', false);
  }, 2000);
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

    // Restore "Have a house to sell?" panel visibility (applyLoadedDataToDOM
    // only restores input values, not this checkbox-driven show/hide state)
    // and the home-value freshness timestamp used by the stale-value suggestion.
    domRefs.hasHouseToSellInput.checked = !!savedData.sellingHouse;
    domRefs.sellHouseFieldsPanel.style.display = savedData.sellingHouse ? 'block' : 'none';
    sellHomeValueUpdatedAt = savedData.sellHomeValueUpdatedAt || null;

    // Attach all listeners
    attachInputListeners();
    attachActionListeners();
    attachSellHouseListeners();

    // Update UI and calculate
    updateTermCardSelection(activeTerm, domRefs);
    calculateAll();
    updateSellProceeds();

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
