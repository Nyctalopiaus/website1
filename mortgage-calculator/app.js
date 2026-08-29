/**
 * Housing Calculator - Main Application Entry Point
 * Orchestrates modules and handles event listeners
 */

import { CONFIG, DEFAULTS } from './config.js';
import { debounce, clamp, getElement, getProviderLabel } from './utils.js';
import {
  performCalculations,
  extractInputValues,
  calculateSaleProceeds,
  getNormalizedDepartureMortgagePayment,
  calculateBridgeLoanCosts,
  calculateRecast,
  estimateNetAnnualIncome,
  convertPaycheckToMonthly,
  convertMonthlyToPaycheck
} from './calculator.js';
import { loadSavedInputs, applyLoadedDataToDOM, saveInputs, fetchMortgageRates } from './storage.js';
import { fetchPropertyData, validateMLSInput, fetchRedfinValueOnly } from './scraper.js';
import {
  createDOMReferences,
  updateTermCardSelection,
  updateAllOutputs,
  updateAffordability,
  setButtonLoading,
  updateRatesAttribution,
  updateSellProceedsUI,
  updateStaleValueWarning,
  updateDownPaymentBreakdownUI,
  updateBridgeHoldingCostUI,
  updateBridgeCltvWarning,
  updateFinancingTypeLabelsUI,
  updateBridgeHoldingDtiUI,
  updateSellMortgageScheduleUI,
  updateBackEndDTI,
  updateBridgeHoldingBackEndDtiUI,
  updateRecastSummaryUI,
  setupDtiSwitcher,
  setupCollapsibleCards,
  getCollapsedSectionsState,
  applyCollapsedSectionsState,
  setIncomeBasisToggleUI,
  updateIncomeBasisBreakdownUI,
  updateIncomeBasisAdjustLabelUI,
  setPayFrequencyToggleUI,
  configureIncomeBasisAdjustSlider,
  updateDtiTabLabels,
  updateDtiMarkers,
  updateResidualCashFlowUI,
  setBridgeDtiPhaseToggleUI,
  updateDtiAccordionSummaries,
  expandDtiCashFlowGroup,
  setRecastStrategyUI,
  updateStrategyComparisonUI,
  setupLoanComparisonModal
} from './ui.js';

// ============================================================================
// APPLICATION STATE
// ============================================================================

let activeTerm = 30;
// Epoch ms of the last time sellHomeValue was set (lookup or manual edit).
// null until it's actually been touched once — see config.js DEFAULTS.
let sellHomeValueUpdatedAt = null;
// 'sellFirst' (simultaneous close, proceeds fund down payment now) or
// 'bridgeLoan' (buy now with a short-term loan, pay it off + recast later).
let saleMode = CONFIG.SALE_MODE_SELL_FIRST;
// Which kind of financing Bridge Loan mode assumes — 'bridge' (traditional
// short-term bridge loan) or 'heloc' (revolving home equity line of
// credit). Only meaningful when saleMode is SALE_MODE_BRIDGE_LOAN.
let bridgeFinancingType = DEFAULTS.bridgeFinancingType;
// 'recast' (lower monthly payment) or 'extraPayment' (pay off loan sooner).
let recastStrategy = CONFIG.SALE_PAYOFF_STRATEGY_RECAST;
// 'holding' (carrying both homes) or 'recast' (after old home sells & recast applied) —
// controls which bridge phase the DTI section evaluates when in Bridge Loan mode.
let bridgeDtiPhase = 'recast';
// 'gross' (default, what lenders actually qualify against) or 'net' (Best
// Guess take-home estimate) — which income figure feeds every DTI panel.
let incomeBasis = CONFIG.INCOME_BASIS_GROSS;
// Net (Best Guess) fine-tune: which pay frequency the calibration control is
// expressed in, and the user's pinned MONTHLY take-home figure (canonical
// unit regardless of displayed frequency) once they've dragged/typed one —
// null means "not yet calibrated," so the control auto-tracks the live Best
// Guess estimate instead of a fixed dollar figure.
let payFrequency = CONFIG.PAY_FREQUENCY_MONTHLY;
let netMonthlyOverride = null;
let cardPhase30 = 'post';
let cardPhase15 = 'post';
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
  results.otherMonthlyDebts = inputs.otherMonthlyDebts;
  results.additionalPayment = inputs.additionalPayment;

  // Gross vs. Net (Best Guess) income basis: every DTI panel below reads
  // results.effectiveMonthlyIncome instead of grossAnnualIncome directly, so
  // switching the toggle re-bases all of them at once without touching any
  // loan/payment math.
  const incomeBasisData = getIncomeBasisData(results.grossAnnualIncome);
  results.effectiveMonthlyIncome = incomeBasisData.effectiveMonthlyIncome;
  results.isNetIncomeBasis = incomeBasisData.isNetIncome;
  renderIncomeBasisAdjustControls(results.grossAnnualIncome, incomeBasisData);
  updateIncomeBasisBreakdownUI(incomeBasisData.isNetIncome, incomeBasisData.netEstimate, domRefs, incomeBasisData.hasOverride);

  const hasHouseToSell = !!domRefs.hasHouseToSellInput?.checked;
  const isBridgeActive = hasHouseToSell && saleMode === CONFIG.SALE_MODE_BRIDGE_LOAN;

  const sellInputs = getSellInputs();
  updateSellMortgageScheduleUI(sellInputs.sellMortgageSchedule, domRefs);

  if (isBridgeActive) {
    const proceeds = calculateSaleProceeds(sellInputs);
    const bridgeInputs = getBridgeInputs();
    const recastLumpSum = Math.max(0, proceeds.netProceeds - (bridgeInputs.bridgeLoanAmount || 0));

    if (proceeds.netProceeds > 0) {
      results.recast30 = calculateRecast({
        loanAmount: results.loanAmount,
        annualRate: inputs.interest30,
        termYears: 30,
        monthsElapsed: bridgeInputs.monthsUntilSale || 4,
        recastLumpSum,
        recastFee: bridgeInputs.recastFee || 250
      });
      results.recast15 = calculateRecast({
        loanAmount: results.loanAmount,
        annualRate: inputs.interest15,
        termYears: 15,
        monthsElapsed: bridgeInputs.monthsUntilSale || 4,
        recastLumpSum,
        recastFee: bridgeInputs.recastFee || 250
      });
      results.isRecastActive = true;
      results.recastStrategy = recastStrategy;
      results.cardPhase30 = cardPhase30;
      results.cardPhase15 = cardPhase15;
    }
  }

  // Update dynamic tab labels and progress bar markers
  setBridgeDtiPhaseToggleUI(bridgeDtiPhase, isBridgeActive, domRefs);
  updateDtiTabLabels(results.isNetIncomeBasis, domRefs, isBridgeActive ? { isBridge: true, bridgePhase: bridgeDtiPhase } : null);
  updateDtiMarkers(results.isNetIncomeBasis, domRefs);

  updateAllOutputs(results, activeTerm, domRefs);

  const bankMonthlyTotal = activeTerm === 30 ? results.bankMonthlyTotal30 : results.bankMonthlyTotal15;
  const effectiveMonthlyTotal = activeTerm === 30 ? results.effectiveMonthlyTotal30 : results.effectiveMonthlyTotal15;
  const extraOutlay = activeTerm === 30 ? results.extraMonthlyOutlay30 : results.extraMonthlyOutlay15;

  let bridgePayload = null;

  if (isBridgeActive) {
    const bridgeInputs = getBridgeInputs();
    const bridgeCosts = calculateBridgeLoanCosts(bridgeInputs);
    const sellInputs = getSellInputs();
    const departureMortgageMonthly = getNormalizedDepartureMortgagePayment(sellInputs.sellMortgagePayment, sellInputs.sellMortgageSchedule);
    const combinedMonthlyCost = departureMortgageMonthly + bridgeCosts.monthlyInterestOnlyPayment + bankMonthlyTotal;

    const proceeds = calculateSaleProceeds(sellInputs);
    const recastLumpSum = Math.max(0, proceeds.netProceeds - bridgeInputs.bridgeLoanAmount);
    const rate = activeTerm === 30 ? parseFloat(domRefs.interest30Input.value) || 0 : parseFloat(domRefs.interest15Input.value) || 0;
    const recast = calculateRecast({
      loanAmount: results.loanAmount,
      annualRate: rate,
      termYears: activeTerm,
      monthsElapsed: bridgeInputs.monthsUntilSale,
      recastLumpSum,
      recastFee: bridgeInputs.recastFee
    });

    const isExtraStrategy = recastStrategy === CONFIG.SALE_PAYOFF_STRATEGY_EXTRA_PAYMENT;
    const effectiveSavings = isExtraStrategy ? 0 : recast.monthlySavings;
    const recastHousingTotal = Math.max(0, bankMonthlyTotal - effectiveSavings);
    const recastEffectiveTotal = Math.max(0, effectiveMonthlyTotal - effectiveSavings);

    const activeHousingCost = bridgeDtiPhase === 'holding' ? combinedMonthlyCost : recastHousingTotal;
    const activeEffectiveCost = bridgeDtiPhase === 'holding' ? (combinedMonthlyCost + extraOutlay) : recastEffectiveTotal;

    updateAffordability(activeHousingCost, activeEffectiveCost, extraOutlay, results.effectiveMonthlyIncome, domRefs, results.isNetIncomeBasis);
    updateBackEndDTI(activeHousingCost, getOtherMonthlyDebts(), results.effectiveMonthlyIncome, domRefs, results.isNetIncomeBasis);

    bridgePayload = {
      isBridge: true,
      holdingHousingCost: combinedMonthlyCost,
      recastHousingCost: recastHousingTotal,
      monthlySavings: effectiveSavings
    };
  } else {
    updateBackEndDTI(bankMonthlyTotal, getOtherMonthlyDebts(), results.effectiveMonthlyIncome, domRefs, results.isNetIncomeBasis);
  }

  // Update Residual Cash Flow Banner (Net mode only)
  updateResidualCashFlowUI(
    results.effectiveMonthlyIncome,
    bankMonthlyTotal,
    getOtherMonthlyDebts(),
    domRefs,
    results.isNetIncomeBasis,
    bridgePayload
  );

  updateBridgeAndRecast(results);
  updateDtiAccordionSummaries(results, domRefs);
}

/**
 * Sets the active DTI phase when in Bridge Loan mode ('holding' vs 'recast')
 * @param {'holding'|'recast'} phase
 */
function setBridgeDtiPhase(phase) {
  bridgeDtiPhase = phase === 'recast' ? 'recast' : 'holding';
  calculateAll();
  debouncedSave();
}

/**
 * Computes the monthly income figure that feeds every DTI panel, honoring
 * the Gross vs. Net (Best Guess) income-basis toggle. Net mode runs
 * estimateNetAnnualIncome()'s national-average tax/FICA/state-tax
 * assumptions (see calculator.js) as the "Best Guess" zero point, then
 * substitutes the user's own calibrated paycheck figure (netMonthlyOverride)
 * once they've set one via the fine-tune control — see
 * setIncomeBasisPaycheckValue() below. The netEstimate returned when
 * calibrated is recomputed against that pinned figure so its
 * deductions/rate stay honest for display, not the stale unmodified guess.
 * @param {number} grossAnnualIncome
 * @returns {{ effectiveMonthlyIncome: number, netEstimate: Object|null, isNetIncome: boolean, hasOverride: boolean, baseEstimate: Object|null }}
 */
function getIncomeBasisData(grossAnnualIncome) {
  if (incomeBasis !== CONFIG.INCOME_BASIS_NET) {
    return {
      effectiveMonthlyIncome: (grossAnnualIncome || 0) / CONFIG.MONTHS_PER_YEAR,
      netEstimate: null,
      isNetIncome: false,
      hasOverride: false,
      baseEstimate: null
    };
  }

  const gross = grossAnnualIncome || 0;
  const baseEstimate = estimateNetAnnualIncome(gross);
  const hasOverride = netMonthlyOverride !== null;
  const effectiveMonthlyIncome = hasOverride ? netMonthlyOverride : baseEstimate.netAnnualIncome / CONFIG.MONTHS_PER_YEAR;

  const netEstimate = hasOverride
    ? {
        ...baseEstimate,
        netAnnualIncome: effectiveMonthlyIncome * CONFIG.MONTHS_PER_YEAR,
        totalDeductions: Math.max(0, gross - effectiveMonthlyIncome * CONFIG.MONTHS_PER_YEAR),
        effectiveDeductionRate: gross > 0 ? (Math.max(0, gross - effectiveMonthlyIncome * CONFIG.MONTHS_PER_YEAR) / gross) * 100 : 0
      }
    : baseEstimate;

  return { effectiveMonthlyIncome, netEstimate, isNetIncome: true, hasOverride, baseEstimate };
}

/**
 * Number of pay periods per year for the currently selected pay frequency.
 * @returns {number}
 */
function getPayPeriodsPerYear() {
  return CONFIG.PAY_PERIODS_PER_YEAR[payFrequency] || CONFIG.MONTHS_PER_YEAR;
}

/**
 * Refreshes the fine-tune slider/number field's bounds and displayed value
 * to match the current calibration state (a pinned override, or the live
 * Best Guess when nothing's pinned yet) and the selected pay frequency.
 * Pure presentation — never changes netMonthlyOverride itself. Bounds are
 * always expressed relative to whatever figure is currently in effect, so
 * that figure is always within range by construction.
 * @param {number} grossAnnualIncome
 * @param {Object} incomeBasisData - Return value of getIncomeBasisData()
 */
function renderIncomeBasisAdjustControls(grossAnnualIncome, incomeBasisData) {
  if (!incomeBasisData.isNetIncome) return;

  const periodsPerYear = getPayPeriodsPerYear();
  const referencePaycheck = convertMonthlyToPaycheck(incomeBasisData.effectiveMonthlyIncome, periodsPerYear);
  const grossPaycheck = convertMonthlyToPaycheck((grossAnnualIncome || 0) / CONFIG.MONTHS_PER_YEAR, periodsPerYear);

  configureIncomeBasisAdjustSlider(domRefs, {
    valuePerPaycheck: referencePaycheck,
    minPerPaycheck: Math.max(0, referencePaycheck * CONFIG.NET_ESTIMATE_ADJUST_MIN_FACTOR),
    maxPerPaycheck: Math.max(referencePaycheck, Math.min(referencePaycheck * CONFIG.NET_ESTIMATE_ADJUST_MAX_FACTOR, grossPaycheck)),
    step: CONFIG.NET_ESTIMATE_ADJUST_STEP
  });

  const baseMonthly = incomeBasisData.baseEstimate.netAnnualIncome / CONFIG.MONTHS_PER_YEAR;
  updateIncomeBasisAdjustLabelUI(incomeBasisData.hasOverride, incomeBasisData.effectiveMonthlyIncome - baseMonthly, domRefs);
}

/**
 * User dragged the fine-tune slider or typed a per-paycheck dollar figure —
 * pins netMonthlyOverride to the monthly equivalent (using the currently
 * selected pay frequency) and re-renders the controls immediately for a
 * snappy feel. The caller still triggers the actual recalculation afterward.
 * @param {number} perPaycheckValue
 */
function setIncomeBasisPaycheckValue(perPaycheckValue) {
  const value = Math.max(0, parseFloat(perPaycheckValue) || 0);
  netMonthlyOverride = convertPaycheckToMonthly(value, getPayPeriodsPerYear());
  if (domRefs.btnResetIncomeBasisAdjust) domRefs.btnResetIncomeBasisAdjust.style.display = 'inline-block';

  const grossAnnualIncome = parseFloat(domRefs.grossAnnualIncomeInput.value) || 0;
  renderIncomeBasisAdjustControls(grossAnnualIncome, getIncomeBasisData(grossAnnualIncome));
}

/**
 * Clears the pinned calibration — the fine-tune control goes back to
 * auto-tracking the live Best Guess estimate.
 */
function resetIncomeBasisAdjust() {
  netMonthlyOverride = null;
  if (domRefs.btnResetIncomeBasisAdjust) domRefs.btnResetIncomeBasisAdjust.style.display = 'none';

  const grossAnnualIncome = parseFloat(domRefs.grossAnnualIncomeInput.value) || 0;
  renderIncomeBasisAdjustControls(grossAnnualIncome, getIncomeBasisData(grossAnnualIncome));
}

/**
 * Switches which pay frequency the fine-tune control is expressed in.
 * Purely a display re-chunking — any pinned calibration (netMonthlyOverride)
 * is preserved exactly; only how it's divided into a single paycheck changes.
 * @param {'biweekly'|'semiMonthly'|'monthly'} frequency
 */
function setPayFrequency(frequency) {
  payFrequency = CONFIG.PAY_PERIODS_PER_YEAR[frequency] ? frequency : CONFIG.PAY_FREQUENCY_MONTHLY;
  setPayFrequencyToggleUI(payFrequency, domRefs);

  const grossAnnualIncome = parseFloat(domRefs.grossAnnualIncomeInput.value) || 0;
  renderIncomeBasisAdjustControls(grossAnnualIncome, getIncomeBasisData(grossAnnualIncome));
}

/**
 * Switches which income figure feeds every DTI panel: Gross (what lenders
 * actually qualify against) or Net/Best Guess (an estimated take-home
 * figure, so the pills show what this payment will actually look like
 * against the user's paycheck). Purely a display lens for the DTI
 * denominator — never touches any loan/payment math. Updates the toggle's
 * own styling, the fine-tune control's visibility/values, and the
 * breakdown line immediately for a snappy feel; the caller still triggers
 * the actual recalculation afterward (same pattern as setSaleMode below).
 * @param {'gross'|'net'} basis
 */
function setIncomeBasis(basis) {
  const wasGross = incomeBasis === CONFIG.INCOME_BASIS_GROSS;
  incomeBasis = basis === CONFIG.INCOME_BASIS_NET ? CONFIG.INCOME_BASIS_NET : CONFIG.INCOME_BASIS_GROSS;
  setIncomeBasisToggleUI(incomeBasis === CONFIG.INCOME_BASIS_NET, domRefs);

  // If switching to Net mode, auto-expand the Cash Flow sub-accordion group
  if (incomeBasis === CONFIG.INCOME_BASIS_NET) {
    expandDtiCashFlowGroup(domRefs);
  }

  // If switching to Gross mode and 'bank' (Housing Front-End) tab is active, default to 'backend' (Total Debt DTI) tab
  if (incomeBasis === CONFIG.INCOME_BASIS_GROSS && !wasGross) {
    const activeTabBtn = document.querySelector('.dti-tab-btn.active');
    if (activeTabBtn && activeTabBtn.getAttribute('data-dti-tab') === 'bank') {
      const backendBtn = document.querySelector('.dti-tab-btn[data-dti-tab="backend"]');
      if (backendBtn) backendBtn.click();
    }
  }

  const grossAnnualIncome = parseFloat(domRefs.grossAnnualIncomeInput.value) || 0;
  const incomeBasisData = getIncomeBasisData(grossAnnualIncome);
  renderIncomeBasisAdjustControls(grossAnnualIncome, incomeBasisData);
  updateIncomeBasisBreakdownUI(incomeBasisData.isNetIncome, incomeBasisData.netEstimate, domRefs, incomeBasisData.hasOverride);
}

/**
 * Reads the "Have a house to sell?" fields into the shape calculateSaleProceeds() expects
 */
function getSellInputs() {
  return {
    sellHomeValue: parseFloat(domRefs.sellHomeValueInput.value) || 0,
    sellMortgagePayoff: parseFloat(domRefs.sellMortgagePayoffInput.value) || 0,
    sellMortgagePayment: parseFloat(domRefs.sellMortgagePaymentInput?.value) || 0,
    sellMortgageSchedule: domRefs.sellMortgageScheduleInput?.value || 'monthly',
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
 * Switches between Sell First and Bridge Loan sub-panels within the
 * "Have a house to sell?" section. The top part of the panel (Redfin
 * lookup, home value, payoff, costs, net proceeds) is mode-agnostic and
 * stays visible either way — only what happens with those proceeds differs.
 * @param {'sellFirst'|'bridgeLoan'} mode
 */
function setSaleMode(mode) {
  saleMode = mode === CONFIG.SALE_MODE_BRIDGE_LOAN ? CONFIG.SALE_MODE_BRIDGE_LOAN : CONFIG.SALE_MODE_SELL_FIRST;
  const isBridge = saleMode === CONFIG.SALE_MODE_BRIDGE_LOAN;

  if (domRefs.saleModeSellFirstPanel) domRefs.saleModeSellFirstPanel.style.display = isBridge ? 'none' : 'block';
  if (domRefs.saleModeBridgePanel) domRefs.saleModeBridgePanel.style.display = isBridge ? 'block' : 'none';
  if (domRefs.btnSaleModeSellFirst) domRefs.btnSaleModeSellFirst.classList.toggle('active', !isBridge);
  if (domRefs.btnSaleModeBridge) domRefs.btnSaleModeBridge.classList.toggle('active', isBridge);

  // Auto-suggest a bridge loan amount the first time this mode is entered
  // with nothing set yet — the gap the down payment currently needs. Always
  // editable afterward, same "auto-fill, never locked" pattern as sellHomeValue.
  if (isBridge && domRefs.bridgeLoanAmountInput && (parseFloat(domRefs.bridgeLoanAmountInput.value) || 0) === 0) {
    const total = parseFloat(domRefs.downPaymentAmountInput.value) || 0;
    const cash = parseFloat(domRefs.cashDownPaymentInput.value) || 0;
    domRefs.bridgeLoanAmountInput.value = Math.max(0, Math.round(total - cash));
  }
}

/**
 * Switches the Financing Type sub-choice within Bridge Loan mode: a
 * traditional bridge loan vs. a HELOC. Purely a display/defaults choice —
 * calculateBridgeLoanCosts() takes whatever rate/fees/amount end up in the
 * inputs either way, so this function's only real jobs are (1) toggling the
 * button styling, (2) swapping the field labels/tooltips via
 * updateFinancingTypeLabelsUI(), and (3) optionally resetting the rate/fee
 * inputs to that type's default starting numbers.
 * @param {'bridge'|'heloc'} type
 * @param {Object} [options]
 * @param {boolean} [options.resetDefaults=true] - Overwrite the rate/fee
 *   inputs with the new type's defaults. True for a user-driven click on the
 *   toggle (Josh confirmed: losing a manually-typed number on switch is
 *   fine — you can just re-enter it). False when restoring a saved state on
 *   page load, where the saved rate/fee values must win instead.
 */
function setBridgeFinancingType(type, { resetDefaults = true } = {}) {
  bridgeFinancingType = type === CONFIG.FINANCING_TYPE_HELOC ? CONFIG.FINANCING_TYPE_HELOC : CONFIG.FINANCING_TYPE_BRIDGE_LOAN;
  const isHeloc = bridgeFinancingType === CONFIG.FINANCING_TYPE_HELOC;

  if (domRefs.btnFinancingTypeBridge) domRefs.btnFinancingTypeBridge.classList.toggle('active', !isHeloc);
  if (domRefs.btnFinancingTypeHeloc) domRefs.btnFinancingTypeHeloc.classList.toggle('active', isHeloc);

  updateFinancingTypeLabelsUI(bridgeFinancingType, domRefs);

  if (resetDefaults) {
    if (domRefs.bridgeLoanRateInput) {
      domRefs.bridgeLoanRateInput.value = isHeloc ? CONFIG.DEFAULT_HELOC_RATE : CONFIG.DEFAULT_BRIDGE_LOAN_RATE;
    }
    if (domRefs.bridgeLoanFeesPercentInput) {
      domRefs.bridgeLoanFeesPercentInput.value = isHeloc ? CONFIG.DEFAULT_HELOC_FEES_PERCENT : CONFIG.DEFAULT_BRIDGE_LOAN_FEES_PERCENT;
    }
  }
}

/**
 * Switches the Sale Proceeds Strategy within Bridge Loan mode ('recast' vs 'extraPayment')
 * @param {'recast'|'extraPayment'} strategy
 */
function setRecastStrategy(strategy) {
  recastStrategy = strategy === CONFIG.SALE_PAYOFF_STRATEGY_EXTRA_PAYMENT ? CONFIG.SALE_PAYOFF_STRATEGY_EXTRA_PAYMENT : CONFIG.SALE_PAYOFF_STRATEGY_RECAST;
  setRecastStrategyUI(recastStrategy, domRefs);
  calculateAll();
  debouncedSave();
}

/**
 * Typical lender combined-loan-to-value cap for the current Bridge Loan
 * financing type: current mortgage payoff + the borrowed amount shouldn't
 * usually exceed ~80% of the current home's value for a bridge loan, or
 * ~85% for a HELOC. Informational only — not enforced as a hard limit.
 */
function getMaxTypicalBridgeAmount() {
  const sellInputs = getSellInputs();
  const maxCltvPercent = bridgeFinancingType === CONFIG.FINANCING_TYPE_HELOC
    ? CONFIG.HELOC_TYPICAL_MAX_CLTV_PERCENT
    : CONFIG.BRIDGE_LOAN_TYPICAL_MAX_CLTV_PERCENT;
  const maxCombined = sellInputs.sellHomeValue * (maxCltvPercent / 100);
  return Math.max(0, maxCombined - sellInputs.sellMortgagePayoff);
}

/**
 * Recomputes and re-renders the Bridge Loan holding-cost and recast
 * outputs. Only meaningful in Bridge Loan mode; runs as part of the main
 * calculation pipeline (calculateAll) so it stays in sync with the active
 * term's rate/loan amount without duplicating that math here.
 * @param {Object} results - Output of performCalculations()
 */
function updateBridgeAndRecast(results) {
  if (!domRefs.hasHouseToSellInput?.checked || saleMode !== CONFIG.SALE_MODE_BRIDGE_LOAN) return;

  const bridgeInputs = getBridgeInputs();
  const bridgeCosts = calculateBridgeLoanCosts(bridgeInputs);
  const totalBridgePayoff = bridgeCosts.totalBorrowed;

  const sellInputs = getSellInputs();
  const departureMortgageMonthly = getNormalizedDepartureMortgagePayment(sellInputs.sellMortgagePayment, sellInputs.sellMortgageSchedule);

  const newMortgagePayment = activeTerm === 30 ? results.bankMonthlyTotal30 : results.bankMonthlyTotal15;
  updateBridgeHoldingCostUI(bridgeCosts, newMortgagePayment, domRefs, departureMortgageMonthly);
  const isHelocFinancing = bridgeFinancingType === CONFIG.FINANCING_TYPE_HELOC;
  const maxCltvPercent = isHelocFinancing ? CONFIG.HELOC_TYPICAL_MAX_CLTV_PERCENT : CONFIG.BRIDGE_LOAN_TYPICAL_MAX_CLTV_PERCENT;
  updateBridgeCltvWarning(totalBridgePayoff, getMaxTypicalBridgeAmount(), domRefs, maxCltvPercent, isHelocFinancing);

  const combinedMonthlyCost = departureMortgageMonthly + bridgeCosts.monthlyInterestOnlyPayment + newMortgagePayment;
  updateBridgeHoldingDtiUI(combinedMonthlyCost, results.effectiveMonthlyIncome, domRefs, results.isNetIncomeBasis);
  updateBridgeHoldingBackEndDtiUI(combinedMonthlyCost, getOtherMonthlyDebts(), results.effectiveMonthlyIncome, domRefs, results.isNetIncomeBasis);

  const proceeds = calculateSaleProceeds(sellInputs);
  const recastLumpSum = Math.max(0, proceeds.netProceeds - totalBridgePayoff);

  const isExtraStrategy = recastStrategy === CONFIG.SALE_PAYOFF_STRATEGY_EXTRA_PAYMENT;
  const effectiveFee = isExtraStrategy ? 0 : bridgeInputs.recastFee;
  const rate = activeTerm === 30 ? parseFloat(domRefs.interest30Input.value) || 0 : parseFloat(domRefs.interest15Input.value) || 0;
  const recast = calculateRecast({
    loanAmount: results.loanAmount,
    annualRate: rate,
    termYears: activeTerm,
    monthsElapsed: bridgeInputs.monthsUntilSale,
    recastLumpSum,
    recastFee: effectiveFee
  });

  updateRecastSummaryUI(proceeds, totalBridgePayoff, bridgeInputs.recastFee, recast, domRefs, newMortgagePayment, recastStrategy);
  updateStrategyComparisonUI(recast, proceeds, totalBridgePayoff, recastStrategy, domRefs);

  const effectiveSavings = isExtraStrategy ? 0 : recast.monthlySavings;
  // Update Residual Cash Flow Banner with Bridge Loan multi-stage view (Holding vs Post-Recast)
  updateResidualCashFlowUI(
    results.effectiveMonthlyIncome,
    newMortgagePayment,
    getOtherMonthlyDebts(),
    domRefs,
    results.isNetIncomeBasis,
    {
      isBridge: true,
      holdingHousingCost: combinedMonthlyCost,
      recastHousingCost: Math.max(0, newMortgagePayment - effectiveSavings),
      monthlySavings: effectiveSavings
    }
  );
}

/**
 * Reads the "Other Monthly Debts" field used for Back-End DTI
 */
function getOtherMonthlyDebts() {
  return Math.max(0, parseFloat(domRefs.otherMonthlyDebtsInput?.value) || 0);
}

/**
 * Reads the Bridge Loan mode fields
 */
function getBridgeInputs() {
  return {
    bridgeLoanAmount: parseFloat(domRefs.bridgeLoanAmountInput?.value) || 0,
    bridgeExtraCash: parseFloat(domRefs.bridgeExtraCashInput?.value) || 0,
    monthsUntilSale: parseFloat(domRefs.monthsUntilSaleInput?.value) || 0,
    bridgeLoanRate: parseFloat(domRefs.bridgeLoanRateInput?.value) || 0,
    bridgeLoanFeesPercent: parseFloat(domRefs.bridgeLoanFeesPercentInput?.value) || 0,
    recastFee: parseFloat(domRefs.recastFeeInput?.value) || 0
  };
}

/**
 * Computes the amount contributed to the down payment by whichever
 * non-cash source applies to the current sale mode: net sale proceeds
 * (Sell First — simultaneous close) or the bridge loan draw itself
 * (Bridge Loan — the sale hasn't happened yet, so there are no proceeds
 * to apply until it does).
 */
function getOtherDownPaymentSourceAmount() {
  if (!domRefs.hasHouseToSellInput.checked) return 0;
  if (saleMode === CONFIG.SALE_MODE_BRIDGE_LOAN) {
    return Math.max(0, getBridgeInputs().bridgeLoanAmount);
  }
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
  const houseProceeds = getOtherDownPaymentSourceAmount();
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
    if (domRefs.hasHouseToSellInput?.checked && total < houseProceeds) {
      total = houseProceeds;
      domRefs.downPaymentAmountInput.value = Math.round(total);
    }
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

  updateDownPaymentBreakdownUI(cash, houseProceeds, total, percent, domRefs, saleMode, bridgeFinancingType);
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
    otherMonthlyDebts: getOtherMonthlyDebts(),
    incomeBasis,
    payFrequency,
    netMonthlyOverride,
    additionalPayment: parseFloat(domRefs.additionalPaymentInput.value) || 0,
    lumpSumAmount: parseFloat(domRefs.lumpSumAmountInput.value) || 0,
    lumpSumFrequency: parseInt(domRefs.lumpSumFrequencyInput.value) || 12,
    paymentFrequency: paymentFreq,
    biweeklyExtra: domRefs.biweeklyExtraInput ? (parseFloat(domRefs.biweeklyExtraInput.value) || 0) : 0,
    activeTerm,

    // "Have a house to sell?" section — local-only, same as everything else
    sellingHouse: domRefs.hasHouseToSellInput.checked,
    ...getSellInputs(),
    sellHomeValueUpdatedAt,

    // Bridge Loan mode
    saleMode,
    bridgeFinancingType,
    recastStrategy,
    bridgeDtiPhase,
    ...getBridgeInputs(),

    // Left-column card open/closed state — local-only, same as everything else
    collapsedSections: getCollapsedSectionsState()
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
    domRefs.grossAnnualIncomeInput,
    domRefs.otherMonthlyDebtsInput
  ];

  otherNumericInputs.forEach(input => {
    input.addEventListener('input', debouncedCalculate);
  });

  // Gross vs. Net (Best Guess) income basis toggle
  if (domRefs.btnIncomeBasisGross) {
    domRefs.btnIncomeBasisGross.addEventListener('click', () => {
      setIncomeBasis(CONFIG.INCOME_BASIS_GROSS);
      debouncedCalculate();
    });
  }
  if (domRefs.btnIncomeBasisNet) {
    domRefs.btnIncomeBasisNet.addEventListener('click', () => {
      setIncomeBasis(CONFIG.INCOME_BASIS_NET);
      debouncedCalculate();
    });
  }

  // Pay-frequency picker for the fine-tune control (only meaningful/visible in Net mode)
  if (domRefs.btnPayFreqBiweekly) {
    domRefs.btnPayFreqBiweekly.addEventListener('click', () => {
      setPayFrequency(CONFIG.PAY_FREQUENCY_BIWEEKLY);
      debouncedCalculate();
    });
  }
  if (domRefs.btnPayFreqSemiMonthly) {
    domRefs.btnPayFreqSemiMonthly.addEventListener('click', () => {
      setPayFrequency(CONFIG.PAY_FREQUENCY_SEMIMONTHLY);
      debouncedCalculate();
    });
  }
  if (domRefs.btnPayFreqMonthly) {
    domRefs.btnPayFreqMonthly.addEventListener('click', () => {
      setPayFrequency(CONFIG.PAY_FREQUENCY_MONTHLY);
      debouncedCalculate();
    });
  }

  // Fine-tune slider + its paired number field stay in sync with each other
  if (domRefs.incomeBasisAdjustSlider) {
    domRefs.incomeBasisAdjustSlider.addEventListener('input', () => {
      setIncomeBasisPaycheckValue(domRefs.incomeBasisAdjustSlider.value);
      debouncedCalculate();
    });
  }
  if (domRefs.incomeBasisPaycheckAmountInput) {
    domRefs.incomeBasisPaycheckAmountInput.addEventListener('input', () => {
      setIncomeBasisPaycheckValue(domRefs.incomeBasisPaycheckAmountInput.value);
      debouncedCalculate();
    });
  }
  if (domRefs.btnResetIncomeBasisAdjust) {
    domRefs.btnResetIncomeBasisAdjust.addEventListener('click', () => {
      resetIncomeBasisAdjust();
      debouncedCalculate();
    });
  }

  // Lump sum inputs
  domRefs.lumpSumAmountInput?.addEventListener('input', debouncedCalculate);
  domRefs.lumpSumFrequencyInput?.addEventListener('change', debouncedCalculate);

  // Bridge Loan DTI Phase Toggle listeners
  if (domRefs.btnBridgePhaseHolding) {
    domRefs.btnBridgePhaseHolding.addEventListener('click', () => setBridgeDtiPhase('holding'));
  }
  if (domRefs.btnBridgePhaseRecast) {
    domRefs.btnBridgePhaseRecast.addEventListener('click', () => setBridgeDtiPhase('recast'));
  }

  // Term card toggles
  domRefs.card30?.addEventListener('click', () => {
    activeTerm = 30;
    updateTermCardSelection(activeTerm, domRefs);
    calculateAll();
    debouncedSave();
  });

  domRefs.card15?.addEventListener('click', () => {
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
    domRefs.sellMortgagePaymentInput,
    domRefs.sellCommissionPercentInput,
    domRefs.sellClosingCostsPercentInput,
    domRefs.sellRepairCostsInput,
    domRefs.sellConcessionsInput,
    domRefs.sellMovingCostsInput
  ];
  sellNumericInputs.forEach(input => {
    if (!input) return;
    input.addEventListener('input', () => {
      updateSellProceeds();
      syncDownPaymentFields('house');
      debouncedCalculate();
    });
  });

  if (domRefs.sellMortgageScheduleInput) {
    domRefs.sellMortgageScheduleInput.addEventListener('change', () => {
      updateSellMortgageScheduleUI(domRefs.sellMortgageScheduleInput.value, domRefs);
      updateSellProceeds();
      debouncedCalculate();
    });
  }

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

  // Sale mode switch (Sell First vs Bridge Loan)
  if (domRefs.btnSaleModeSellFirst) {
    domRefs.btnSaleModeSellFirst.addEventListener('click', () => {
      setSaleMode(CONFIG.SALE_MODE_SELL_FIRST);
      syncDownPaymentFields('house');
      debouncedCalculate();
    });
  }
  if (domRefs.btnSaleModeBridge) {
    domRefs.btnSaleModeBridge.addEventListener('click', () => {
      setSaleMode(CONFIG.SALE_MODE_BRIDGE_LOAN);
      syncDownPaymentFields('house');
      debouncedCalculate();
    });
  }

  // Financing Type switch (Bridge Loan vs HELOC) — only relevant within
  // Bridge Loan mode. Resets the rate/fee inputs to the newly-selected
  // type's defaults (confirmed behavior — a manually-typed number is lost
  // on switch, same as picking a fresh scenario).
  if (domRefs.btnFinancingTypeBridge) {
    domRefs.btnFinancingTypeBridge.addEventListener('click', () => {
      setBridgeFinancingType(CONFIG.FINANCING_TYPE_BRIDGE_LOAN);
      debouncedCalculate();
    });
  }
  if (domRefs.btnFinancingTypeHeloc) {
    domRefs.btnFinancingTypeHeloc.addEventListener('click', () => {
      setBridgeFinancingType(CONFIG.FINANCING_TYPE_HELOC);
      debouncedCalculate();
    });
  }

  // Sale Proceeds Strategy switch (Recast vs Extra Payment)
  if (domRefs.btnRecastStratRecast) {
    domRefs.btnRecastStratRecast.addEventListener('click', () => {
      setRecastStrategy(CONFIG.SALE_PAYOFF_STRATEGY_RECAST);
    });
  }
  if (domRefs.btnRecastStratExtra) {
    domRefs.btnRecastStratExtra.addEventListener('click', () => {
      setRecastStrategy(CONFIG.SALE_PAYOFF_STRATEGY_EXTRA_PAYMENT);
    });
  }

  // Pre/Post Recast Card View Toggles
  if (domRefs.btnRecastPhasePost30El) {
    domRefs.btnRecastPhasePost30El.addEventListener('click', (e) => {
      e.stopPropagation();
      cardPhase30 = 'post';
      calculateAll();
    });
  }
  if (domRefs.btnRecastPhasePre30El) {
    domRefs.btnRecastPhasePre30El.addEventListener('click', (e) => {
      e.stopPropagation();
      cardPhase30 = 'pre';
      calculateAll();
    });
  }
  if (domRefs.btnRecastPhasePost15El) {
    domRefs.btnRecastPhasePost15El.addEventListener('click', (e) => {
      e.stopPropagation();
      cardPhase15 = 'post';
      calculateAll();
    });
  }
  if (domRefs.btnRecastPhasePre15El) {
    domRefs.btnRecastPhasePre15El.addEventListener('click', (e) => {
      e.stopPropagation();
      cardPhase15 = 'pre';
      calculateAll();
    });
  }

  // Bridge loan amount feeds the down payment directly (live, like cash) —
  // every other bridge field only affects holding-cost/recast math.
  if (domRefs.bridgeLoanAmountInput) {
    domRefs.bridgeLoanAmountInput.addEventListener('input', () => {
      syncDownPaymentFields('house');
      debouncedCalculate();
    });
  }
  [domRefs.bridgeExtraCashInput, domRefs.monthsUntilSaleInput, domRefs.bridgeLoanRateInput, domRefs.bridgeLoanFeesPercentInput, domRefs.recastFeeInput].forEach(input => {
    if (input) input.addEventListener('input', debouncedCalculate);
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

  // Load Live Rates — also expands the Rates & Taxes card if it's
  // currently collapsed, so a synced rate isn't hidden from view.
  if (domRefs.loadRatesBtn) {
    domRefs.loadRatesBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const ratesToggle = document.getElementById('rates-toggle');
      if (ratesToggle && ratesToggle.getAttribute('aria-expanded') !== 'true') {
        ratesToggle.click();
      }
      loadLiveMortgageRates();
    });

    domRefs.loadRatesBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        domRefs.loadRatesBtn.click();
      }
    });
  }

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

    // Wire up the DTI switcher and collapsible cards before anything else
    // touches them (setSaleMode below can fall back to the Bank Qualifying
    // tab, which relies on the switcher's click handlers already being attached).
    setupDtiSwitcher();
    setupCollapsibleCards();

    // Restore each left-column card's open/closed state (defaults to
    // collapsed for any section not yet in a saved blob). Then save
    // whenever a card is toggled, so the choice sticks across reloads —
    // separate from the debounced input-save below since a toggle isn't
    // itself an input value.
    applyCollapsedSectionsState(savedData.collapsedSections);
    document.querySelectorAll('.collapsible-header[data-section-key]').forEach(header => {
      header.addEventListener('click', () => debouncedSave());
    });

    // Restore "Have a house to sell?" panel visibility (applyLoadedDataToDOM
    // only restores input values, not this checkbox-driven show/hide state)
    // and the home-value freshness timestamp used by the stale-value suggestion.
    domRefs.hasHouseToSellInput.checked = !!savedData.sellingHouse;
    domRefs.sellHouseFieldsPanel.style.display = savedData.sellingHouse ? 'block' : 'none';
    sellHomeValueUpdatedAt = savedData.sellHomeValueUpdatedAt || null;
    setSaleMode(savedData.saleMode || CONFIG.SALE_MODE_SELL_FIRST);
    // resetDefaults: false — the saved rate/fee values (restored to the DOM
    // by applyLoadedDataToDOM just above) must win here, not whichever
    // default this financing type would normally reset them to.
    setBridgeFinancingType(savedData.bridgeFinancingType || DEFAULTS.bridgeFinancingType, { resetDefaults: false });
    recastStrategy = savedData.recastStrategy === CONFIG.SALE_PAYOFF_STRATEGY_EXTRA_PAYMENT
      ? CONFIG.SALE_PAYOFF_STRATEGY_EXTRA_PAYMENT
      : CONFIG.SALE_PAYOFF_STRATEGY_RECAST;
    setRecastStrategyUI(recastStrategy, domRefs);
    bridgeDtiPhase = savedData.bridgeDtiPhase === 'recast' ? 'recast' : 'holding';

    // Net (Best Guess) fine-tune state: payFrequency/netMonthlyOverride are
    // plain JS state (not DOM-value-based, since the slider's displayed
    // value depends on which frequency is active) — restore both before
    // setIncomeBasis() below, since it immediately reads them to render the
    // fine-tune control's initial bounds/value and the reset button's visibility.
    payFrequency = CONFIG.PAY_PERIODS_PER_YEAR[savedData.payFrequency] ? savedData.payFrequency : CONFIG.PAY_FREQUENCY_MONTHLY;
    netMonthlyOverride = (typeof savedData.netMonthlyOverride === 'number' && !Number.isNaN(savedData.netMonthlyOverride))
      ? savedData.netMonthlyOverride
      : null;
    setPayFrequencyToggleUI(payFrequency, domRefs);
    if (domRefs.btnResetIncomeBasisAdjust) {
      domRefs.btnResetIncomeBasisAdjust.style.display = netMonthlyOverride !== null ? 'inline-block' : 'none';
    }
    setIncomeBasis(savedData.incomeBasis || CONFIG.INCOME_BASIS_GROSS);

    // Attach all listeners
    attachInputListeners();
    attachActionListeners();
    attachSellHouseListeners();

    // Initialize Loan Comparisons Matrix Modal
    setupLoanComparisonModal(domRefs, (selectedPrice) => {
      if (domRefs.homePriceInput) domRefs.homePriceInput.value = selectedPrice;
      if (domRefs.homePriceSlider) domRefs.homePriceSlider.value = selectedPrice;
      syncDownPaymentFields('house');
      calculateAll();
      debouncedSave();
    });

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

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
