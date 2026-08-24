/**
 * Housing Calculator - Main Application Entry Point
 * Orchestrates modules and handles event listeners
 */

import { CONFIG, DEFAULTS } from './config.js';
import { debounce, clamp, getElement, getProviderLabel } from './utils.js';
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
  updateStaleValueWarning,
  updateDownPaymentBreakdownUI
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
 * Computes applied house sale proceeds for down payment calculation if active
 */
function getHouseProceedsAmount() {
  const sellInputs = getSellInputs();
  const proceeds = calculateSaleProceeds(sellInputs);
  return Math.max(0, proceeds.amountToDownPayment);
}

/**
 * Unified down payment synchronization for cash, house proceeds, total amount, percent, and slider.
 * @param {'cash'|'amount'|'percent'|'slider'|'house'} source - The input source that triggered sync
 */
function syncDownPaymentFields(source) {
  const homePrice = parseFloat(domRefs.homePriceInput.value) || 0;
  const houseProceeds = getHouseProceedsAmount();
  let cash = parseFloat(domRefs.cashDownPaymentInput.value) || 0;
  let total = parseFloat(domRefs.downPaymentAmountInput.value) || 0;
  let percent = parseFloat(domRefs.downPaymentPercentInput.value) || 0;

  if (source === 'cash') {
    total = houseProceeds + cash;
    if (homePrice > 0 && total > homePrice) {
      total = homePrice;
      cash = Math.max(0, total - houseProceeds);
      domRefs.cashDownPaymentInput.value = Math.round(cash);
    }
    percent = homePrice > 0 ? clamp((total / homePrice) * 100, 0, 100) : 0;
    domRefs.downPaymentAmountInput.value = Math.round(total);
    domRefs.downPaymentPercentInput.value = Math.round(percent);
    domRefs.downPaymentSlider.value = Math.round(percent);
  } else if (source === 'amount') {
    if (homePrice > 0 && total > homePrice) {
      total = homePrice;
      domRefs.downPaymentAmountInput.value = Math.round(total);
    }
    cash = Math.max(0, total - houseProceeds);
    domRefs.cashDownPaymentInput.value = Math.round(cash);
    percent = homePrice > 0 ? clamp((total / homePrice) * 100, 0, 100) : 0;
    domRefs.downPaymentPercentInput.value = Math.round(percent);
    domRefs.downPaymentSlider.value = Math.round(percent);
  } else if (source === 'percent' || source === 'slider') {
    if (source === 'slider') {
      percent = parseFloat(domRefs.downPaymentSlider.value) || 0;
      domRefs.downPaymentPercentInput.value = Math.round(percent);
    } else {
      percent = clamp(percent, 0, 100);
      domRefs.downPaymentSlider.value = Math.round(percent);
    }
    total = (percent / 100) * homePrice;
    domRefs.downPaymentAmountInput.value = Math.round(total);
    cash = Math.max(0, total - houseProceeds);
    domRefs.cashDownPaymentInput.value = Math.round(cash);
  } else if (source === 'house') {
    total = houseProceeds + cash;
    if (homePrice > 0 && total > homePrice) {
      total = homePrice;
    }
    percent = homePrice > 0 ? clamp((total / homePrice) * 100, 0, 100) : 0;
    domRefs.downPaymentAmountInput.value = Math.round(total);
    domRefs.downPaymentPercentInput.value = Math.round(percent);
    domRefs.downPaymentSlider.value = Math.round(percent);
  }

  updateDownPaymentBreakdownUI(cash, houseProceeds, total, percent, domRefs);
}

/**
 * Debounced save function to reduce API calls
 */
const debouncedSave = debounce(() => {
  let paymentFreq = 'monthly';
  if (domRefs.btnFreqBiweekly?.classList.contains('active')) {
    paymentFreq = 'biweekly';
  } else if (domRefs.btnFreqAccelerated?.classList.contains('active')) {
    paymentFreq = 'accelerated';
  }

  const data = {
    homePrice: parseFloat(domRefs.homePriceInput.value),
    cashDownPayment: parseFloat(domRefs.cashDownPaymentInput.value) || 0,
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
    paymentFrequency: paymentFreq,
    biweeklyExtra: domRefs.biweeklyExtraInput ? (parseFloat(domRefs.biweeklyExtraInput.value) || 0) : 0,
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
  // Frequency toggle buttons
  const freqButtons = [domRefs.btnFreqMonthly, domRefs.btnFreqBiweekly, domRefs.btnFreqAccelerated];
  freqButtons.forEach(btn => {
    if (!btn) return;
    btn.addEventListener('click', () => {
      freqButtons.forEach(b => b?.classList.remove('active'));
      btn.classList.add('active');

      const freq = btn.getAttribute('data-freq');
      if (domRefs.biweeklyExtraContainer) {
        domRefs.biweeklyExtraContainer.style.display = (freq === 'biweekly' || freq === 'accelerated') ? 'block' : 'none';
      }

      calculateAll();
      debouncedSave();
    });
  });

  // Biweekly extra slider & input sync
  if (domRefs.biweeklyExtraInput && domRefs.biweeklyExtraSlider) {
    domRefs.biweeklyExtraInput.addEventListener('input', () => {
      const val = parseFloat(domRefs.biweeklyExtraInput.value) || 0;
      domRefs.biweeklyExtraSlider.value = clamp(val, 0, 1000);
      debouncedCalculate();
    });

    domRefs.biweeklyExtraSlider.addEventListener('input', () => {
      const val = parseFloat(domRefs.biweeklyExtraSlider.value) || 0;
      domRefs.biweeklyExtraInput.value = val;
      debouncedCalculate();
    });
  }

  // Home price syncing
  domRefs.homePriceInput.addEventListener('input', () => {
    const val = parseFloat(domRefs.homePriceInput.value) || 0;
    domRefs.homePriceSlider.value = clamp(val, CONFIG.MIN_HOME_PRICE, CONFIG.MAX_HOME_PRICE);

    // Hide Redfin badge when manually edited
    const badge = getElement('badge-redfin-price');
    if (badge) badge.style.display = 'none';

    syncDownPaymentFields('amount');
    debouncedCalculate();
  });

  domRefs.homePriceSlider.addEventListener('input', () => {
    const val = parseFloat(domRefs.homePriceSlider.value);
    domRefs.homePriceInput.value = val;

    const badge = getElement('badge-redfin-price');
    if (badge) badge.style.display = 'none';

    syncDownPaymentFields('amount');
    debouncedCalculate();
  });

  // Cash down payment syncing
  if (domRefs.cashDownPaymentInput) {
    domRefs.cashDownPaymentInput.addEventListener('input', () => {
      syncDownPaymentFields('cash');
      debouncedCalculate();
    });
  }

  // Total down payment amount syncing
  domRefs.downPaymentAmountInput.addEventListener('input', () => {
    syncDownPaymentFields('amount');
    debouncedCalculate();
  });

  // Down payment percent syncing
  domRefs.downPaymentPercentInput.addEventListener('input', () => {
    syncDownPaymentFields('percent');
    debouncedCalculate();
  });

  domRefs.downPaymentSlider.addEventListener('input', () => {
    syncDownPaymentFields('slider');
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
    updateSellProceeds();
    syncDownPaymentFields('house');
    debouncedCalculate();
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
      syncDownPaymentFields('house');
      debouncedCalculate();
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
    syncDownPaymentFields('house');
    debouncedCalculate();
  });

  // Proceeds-to-down-payment slider
  domRefs.sellProceedsPercentSliderInput.addEventListener('input', () => {
    updateSellProceeds();
    syncDownPaymentFields('house');
    debouncedCalculate();
  });

  // Redfin value lookup
  domRefs.btnSearchSellRedfin.addEventListener('click', () => handleSearchSellRedfin(false));

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

  // Bookmarklet Modal Toggle & Code Setup
  const BOOKMARKLET_CODE = `javascript:(function(){var u=window.location.href,s=['redfin.com','zillow.com','realtor.com','homes.com','trulia.com'];if(!s.some(function(d){return u.includes(d);}))return alert('Please run this bookmarklet while viewing a property listing on Redfin, Zillow, Realtor.com, or Homes.com.');try{if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(u);}else{var c=document.createElement('textarea');c.value=u;document.body.appendChild(c);c.select();document.execCommand('copy');c.remove();}}catch(e){}function b64(str){return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,function(m,p1){return String.fromCharCode('0x'+p1);}));}var w=window.open('about:blank','nycto_import','width=460,height=340,resizable=yes,scrollbars=no');var f=document.createElement('form');f.method='POST';f.action='https://nycto.ninja/backend/import-property.php';f.target='nycto_import';var iU=document.createElement('input');iU.type='hidden';iU.name='url';iU.value=u;f.appendChild(iU);var iH=document.createElement('input');iH.type='hidden';iH.name='html';iH.value=b64(document.documentElement.outerHTML);f.appendChild(iH);document.body.appendChild(f);f.submit();setTimeout(function(){f.remove();},1000);})();`;

  const btnOpenBookmarklet = document.getElementById('btn-open-bookmarklet');
  const bookmarkletModal = document.getElementById('bookmarklet-modal');
  const btnCloseBookmarklet = document.getElementById('btn-close-bookmarklet');
  const bookmarkletLink = document.getElementById('bookmarklet-link');
  const bookmarkletCodeText = document.getElementById('bookmarklet-code-text');
  const btnCopyBookmarkletCode = document.getElementById('btn-copy-bookmarklet-code');

  if (bookmarkletLink) bookmarkletLink.href = BOOKMARKLET_CODE;
  if (bookmarkletCodeText) bookmarkletCodeText.value = BOOKMARKLET_CODE;

  if (btnOpenBookmarklet && bookmarkletModal) {
    btnOpenBookmarklet.addEventListener('click', openBookmarkletModal);
    if (btnCloseBookmarklet) btnCloseBookmarklet.addEventListener('click', closeBookmarkletModal);
    bookmarkletModal.addEventListener('click', (e) => {
      if (e.target === bookmarkletModal) closeBookmarkletModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !bookmarkletModal.classList.contains('hidden')) {
        closeBookmarkletModal();
      }
    });
  }

  // Bookmarklet Needed Modal Toggle & Action Listeners
  if (domRefs.bookmarkletNeededModal) {
    if (domRefs.btnCloseBookmarkletNeeded) {
      domRefs.btnCloseBookmarkletNeeded.addEventListener('click', closeBookmarkletNeededModal);
    }
    if (domRefs.btnDismissBookmarkletNeeded) {
      domRefs.btnDismissBookmarkletNeeded.addEventListener('click', closeBookmarkletNeededModal);
    }
    if (domRefs.btnOpenBookmarkletFromNeeded) {
      domRefs.btnOpenBookmarkletFromNeeded.addEventListener('click', () => {
        closeBookmarkletNeededModal();
        openBookmarkletModal();
      });
    }
    domRefs.bookmarkletNeededModal.addEventListener('click', (e) => {
      if (e.target === domRefs.bookmarkletNeededModal) closeBookmarkletNeededModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !domRefs.bookmarkletNeededModal.classList.contains('hidden')) {
        closeBookmarkletNeededModal();
      }
    });
  }

  if (btnCopyBookmarkletCode && bookmarkletCodeText) {
    btnCopyBookmarkletCode.addEventListener('click', () => {
      navigator.clipboard.writeText(bookmarkletCodeText.value).then(() => {
        const orig = btnCopyBookmarkletCode.textContent;
        btnCopyBookmarkletCode.textContent = '✅ Copied!';
        setTimeout(() => { btnCopyBookmarkletCode.textContent = orig; }, 2000);
      });
    });
  }
}

/**
 * Opens the main Bookmarklet setup modal
 */
function openBookmarkletModal() {
  const bookmarkletModal = document.getElementById('bookmarklet-modal');
  if (bookmarkletModal) {
    bookmarkletModal.style.display = 'flex';
    bookmarkletModal.classList.remove('hidden');
    bookmarkletModal.setAttribute('aria-hidden', 'false');
  }
}

/**
 * Closes the main Bookmarklet setup modal
 */
function closeBookmarkletModal() {
  const bookmarkletModal = document.getElementById('bookmarklet-modal');
  if (bookmarkletModal) {
    bookmarkletModal.style.display = 'none';
    bookmarkletModal.classList.add('hidden');
    bookmarkletModal.setAttribute('aria-hidden', 'true');
  }
}

/**
 * Opens the "Bookmarklet Ingestion Required" popup modal
 * @param {string} [messageText] - Optional custom message string to display
 */
function openBookmarkletNeededModal(messageText) {
  if (domRefs.bookmarkletNeededModal) {
    if (domRefs.bookmarkletNeededModalMessage && messageText) {
      domRefs.bookmarkletNeededModalMessage.textContent = messageText;
    }
    domRefs.bookmarkletNeededModal.style.display = 'flex';
    domRefs.bookmarkletNeededModal.classList.remove('hidden');
    domRefs.bookmarkletNeededModal.setAttribute('aria-hidden', 'false');
  }
}

/**
 * Closes the "Bookmarklet Ingestion Required" popup modal
 */
function closeBookmarkletNeededModal() {
  if (domRefs.bookmarkletNeededModal) {
    domRefs.bookmarkletNeededModal.style.display = 'none';
    domRefs.bookmarkletNeededModal.classList.add('hidden');
    domRefs.bookmarkletNeededModal.setAttribute('aria-hidden', 'true');
  }
}

/**
 * Handles errors occurring during property fetching, showing a useful modal popup
 * when a URL needs to be ingested by the bookmarklet first.
 * @param {string|Object} error - Error message string or object
 */
function handlePropertyFetchError(error) {
  const errStr = typeof error === 'string' ? error : (error?.message || '');
  
  if (
    !errStr ||
    errStr.includes('Bookmarklet') ||
    errStr.includes('cache') ||
    errStr.includes('not found') ||
    errStr.includes('Live server scraping') ||
    errStr.includes('parser backend') ||
    errStr === CONFIG.ERROR_API_FETCH
  ) {
    openBookmarkletNeededModal(errStr || 'This property URL has not been ingested by the bookmarklet yet.');
  } else {
    alert(errStr);
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
    onError: (error) => handlePropertyFetchError(error),
    onComplete: () => setButtonLoading(domRefs.btnSearchMls, CONFIG.MSG_FETCH_PROPERTY, false)
  });
}

/**
 * Handles the sell-side Redfin value lookup — fills sellHomeValue only,
 * never touches the main purchase fields.
 * @param {boolean} [force=false] - Bypass the shared backend/property-lookup.php
 * cache (see the small "↻ overwrite cache" button) — for when a cached value is known
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
      if (badge) {
        const providerLabel = getProviderLabel(result.url || userInput, result.provider);
        badge.textContent = `✓ ${providerLabel}`;
        badge.style.display = 'inline-block';
      }
      markSellHomeValueFresh();
      updateSellProceeds();
      debouncedSave();
      setButtonLoading(domRefs.btnSearchSellRedfin, CONFIG.MSG_UPDATED, false);
    } else if (result && result.error) {
      handlePropertyFetchError(result.error);
      setButtonLoading(domRefs.btnSearchSellRedfin, CONFIG.MSG_FETCH_VALUE, false);
    } else {
      handlePropertyFetchError(CONFIG.ERROR_SELL_NO_VALUE);
      setButtonLoading(domRefs.btnSearchSellRedfin, CONFIG.MSG_FETCH_VALUE, false);
    }
  } catch (error) {
    console.error('[ERROR] Sell-side Redfin lookup failed:', error);
    handlePropertyFetchError(CONFIG.ERROR_SELL_NO_VALUE);
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
  const houseProceeds = Math.round(Math.max(0, proceeds.amountToDownPayment));

  syncDownPaymentFields('house');
  debouncedCalculate();

  const cash = parseFloat(domRefs.cashDownPaymentInput.value) || 0;
  const total = houseProceeds + cash;

  setButtonLoading(
    domRefs.btnApplyProceeds,
    `✅ Applied ${houseProceeds > 0 ? '$' + houseProceeds.toLocaleString() : '$0'} Proceeds (${total > 0 ? '$' + Math.round(total).toLocaleString() + ' Total' : '$0 Total'})`,
    false
  );
  setTimeout(() => {
    setButtonLoading(domRefs.btnApplyProceeds, '⬇ Apply to Down Payment', false);
  }, 2500);
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

/**
 * Checks localStorage for a property recently imported via the bookmarklet
 */
function checkRecentImportBanner() {
  if (!domRefs.recentImportBanner || !domRefs.recentImportAddress) return;

  try {
    const raw = localStorage.getItem('nycto_recent_imported_property');
    if (!raw) {
      domRefs.recentImportBanner.style.display = 'none';
      return;
    }

    const data = JSON.parse(raw);
    const ageMs = Date.now() - (data.ts || 0);

    // Only show if imported within the last 2 hours
    if (data.url && ageMs < 2 * 60 * 60 * 1000) {
      const priceText = data.price ? ` ($${Number(data.price).toLocaleString()})` : '';
      domRefs.recentImportAddress.textContent = `${data.address || 'Property'}${priceText}`;
      domRefs.recentImportBanner.style.display = 'block';
    } else {
      domRefs.recentImportBanner.style.display = 'none';
    }
  } catch (e) {
    domRefs.recentImportBanner.style.display = 'none';
  }
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

    // Attach Recent Import Load button listener
    if (domRefs.btnApplyRecentImport) {
      domRefs.btnApplyRecentImport.addEventListener('click', () => {
        try {
          const raw = localStorage.getItem('nycto_recent_imported_property');
          if (raw) {
            const data = JSON.parse(raw);
            if (data.url) {
              domRefs.mlsNumberInput.value = data.url;
              if (domRefs.recentImportBanner) domRefs.recentImportBanner.style.display = 'none';
              handleSearchMls();
            }
          }
        } catch (e) {}
      });
    }

    // Update UI, sync down payment, and calculate
    updateTermCardSelection(activeTerm, domRefs);
    updateSellProceeds();
    syncDownPaymentFields('house');
    calculateAll();

    // Check URL query parameters (e.g. ?url=https://www.redfin.com/...)
    const urlParams = new URLSearchParams(window.location.search);
    const paramUrl = urlParams.get('url') || urlParams.get('mls');
    if (paramUrl) {
      domRefs.mlsNumberInput.value = paramUrl;
      handleSearchMls();
    } else {
      checkRecentImportBanner();
    }

    // Listen for storage/focus events when switching tabs back to the calculator
    window.addEventListener('storage', (e) => {
      if (e.key === 'nycto_recent_imported_property') {
        checkRecentImportBanner();
      }
    });
    window.addEventListener('focus', checkRecentImportBanner);

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
