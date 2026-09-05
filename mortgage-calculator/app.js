/**
 * Housing Calculator - Main Application Entry Point
 * Orchestrates modules and handles event listeners
 */

import { CONFIG, DEFAULTS } from './config.js';
import { debounce, clamp, getElement, getProviderLabel, setVisible, mergeDefaults } from './utils.js';
import {
  performCalculations,
  extractInputValues,
  calculateSaleProceeds,
  getNormalizedDepartureMortgagePayment,
  calculateBridgeLoanCosts,
  calculateRecast,
  calculateBackEndDTI,
  estimateNetAnnualIncome,
  convertPaycheckToMonthly,
  convertMonthlyToPaycheck,
  solveMaxAffordablePrice,
  calculateCashToClose,
  evaluateCashCushion,
  creditScoreToSuggestedDTI,
  generateOutlookSummary,
  compareSaleStrategies,
  calculateRentalOffset,
  calculateRentalHelocCost
} from './calculator.js';
import { loadSavedInputs, applyLoadedDataToDOM, saveInputs, fetchMortgageRates, encodeStateForSharing, decodeStateFromSharing } from './storage.js';
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
  setupLoanComparisonModal,
  attachTooltipPositioning,
  updateMaxAffordabilityUI,
  updateCashToCloseUI,
  updateCashCushionNoteUI,
  updateCreditScoreDtiNoteUI,
  updateTargetDtiGuidanceUI,
  updateOutlookSummaryUI,
  updateAsIsCompareUI,
  updateAsIsApplyButtonUI,
  updateRentalOffsetUI
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
// Remembers whichever of Sell First / Bridge Loan was last active, so the
// Card 1 "Sell It" button (a plain 2-way Sell/Rental choice) can restore the
// right one instead of always resetting to Sell First when coming back from
// Keep as Rental.
let lastSellFinancingMode = CONFIG.SALE_MODE_SELL_FIRST;
// 'cash' (down payment funded from savings/another source, no new debt) or
// 'heloc' (borrow against the departure home's equity instead). Only
// meaningful when saleMode is SALE_MODE_RENTAL — see RENTAL_FUNDING_CASH/HELOC
// in config.js for why Bridge Loan isn't an option here.
let rentalFundingMode = DEFAULTS.rentalFundingMode;
// True once the user has typed their own figure into the rental HELOC
// Monthly Payment field — after that, changing the draw amount/rate no
// longer overwrites it. Same "auto-fill, never locked" idea as
// bridgeLoanAmount in setSaleMode(), just tracked explicitly here since this
// field needs to keep recomputing live (not just once).
let rentalHelocPaymentOverridden = false;
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
// null until "Apply As-Is Pricing to Sale" is clicked on the As-Is compare
// box; then holds { sellHomeValue, sellRepairCosts } — the real sale inputs'
// values from just before applying, so "Revert" can restore them exactly
// instead of just zeroing Repairs / Prep Costs back out. Cleared back to
// null on Revert, or if the user manually edits either field afterward.
let asIsPricingApplied = null;
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
  const isRentalActive = hasHouseToSell && saleMode === CONFIG.SALE_MODE_RENTAL;

  const sellInputs = getSellInputs();
  updateSellMortgageScheduleUI(sellInputs.sellMortgageSchedule, domRefs);

  // "Compare: Sell As-Is Instead?" — mode-agnostic (applies whether funding
  // the down payment via Sell First or Bridge Loan), so it lives outside the
  // isBridgeActive branch below. Stays null (box shows its dashed
  // placeholder) until the user has actually entered an as-is value.
  let asIsCompare = null;
  if (hasHouseToSell && sellInputs.asIsSaleValue > 0) {
    const departureCarryingCost = getNormalizedDepartureMortgagePayment(sellInputs.sellMortgagePayment, sellInputs.sellMortgageSchedule);
    asIsCompare = compareSaleStrategies({
      sellInputs,
      asIsSaleValue: sellInputs.asIsSaleValue,
      monthsSavedByAsIs: sellInputs.asIsMonthsSaved,
      monthlyCarryingCost: departureCarryingCost
    });
  }
  updateAsIsCompareUI(asIsCompare, domRefs);
  updateAsIsApplyButtonUI(!!asIsCompare, !!asIsPricingApplied, domRefs);

  // Replays the same compareSaleStrategies() math the box itself used, but
  // against the pre-apply snapshot vs. the now-applied sale inputs — feeds
  // the Outlook Summary's "why As-Is was worth it" line below. Uses the
  // still-live Months Saved field (never reset by handleApplyAsIsPricing())
  // so the carrying-cost side of the math stays accurate.
  let asIsAppliedComparison = null;
  if (hasHouseToSell && asIsPricingApplied) {
    const departureCarryingCost = getNormalizedDepartureMortgagePayment(sellInputs.sellMortgagePayment, sellInputs.sellMortgageSchedule);
    asIsAppliedComparison = compareSaleStrategies({
      sellInputs: { ...sellInputs, sellHomeValue: asIsPricingApplied.sellHomeValue, sellRepairCosts: asIsPricingApplied.sellRepairCosts },
      asIsSaleValue: sellInputs.sellHomeValue,
      monthsSavedByAsIs: sellInputs.asIsMonthsSaved,
      monthlyCarryingCost: departureCarryingCost
    });
  }

  if (isBridgeActive) {
    const proceeds = calculateSaleProceeds(sellInputs);
    const bridgeInputs = getBridgeInputs();
    const rawRecastLumpSum = Math.max(0, proceeds.netProceeds - (bridgeInputs.bridgeLoanAmount || 0));
    // Keep as Cash never applies anything to the loan — feeding calculateRecast()
    // a $0 lump sum here makes recast30/recast15 come back with appliedLumpSum
    // 0, which is exactly what isRecastActive30/15 in updateAllOutputs() (ui.js)
    // keys off of to decide whether to show a "Recast Active" banner on the
    // term-comparison cards at all.
    const recastLumpSum = recastStrategy === CONFIG.SALE_PAYOFF_STRATEGY_KEEP_CASH ? 0 : rawRecastLumpSum;

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
  // Keep as Rental's DTI-offset result — kept in this outer scope so the
  // Outlook Summary at the end of this function can reuse it directly.
  let rentalOffset = null;
  // Keep as Rental's HELOC financing result (only when funded that way) —
  // same outer-scope reuse for the Outlook Summary.
  let rentalHeloc = null;
  // Mirrors whichever housing cost actually got passed to updateBackEndDTI
  // below (activeHousingCost while bridging, bankMonthlyTotal otherwise) —
  // kept in this outer scope so the Outlook Summary at the end of this
  // function can reuse the same number instead of recomputing it.
  let outlookHousingCost = bankMonthlyTotal;
  // Existing housing obligation the Max Affordability solver should treat as
  // already spoken-for — 0 for a plain purchase or once past the sale (the
  // 'recast' DTI lens), or the departure mortgage + bridge/HELOC
  // interest-only payment while still actively carrying both homes.
  let existingHousingObligation = 0;

  if (isBridgeActive) {
    const bridgeInputs = getBridgeInputs();
    const bridgeCosts = calculateBridgeLoanCosts(bridgeInputs);
    const sellInputs = getSellInputs();
    const departureMortgageMonthly = getNormalizedDepartureMortgagePayment(sellInputs.sellMortgagePayment, sellInputs.sellMortgageSchedule);
    const combinedMonthlyCost = departureMortgageMonthly + bridgeCosts.monthlyInterestOnlyPayment + bankMonthlyTotal;
    if (bridgeDtiPhase === 'holding') {
      existingHousingObligation = departureMortgageMonthly + bridgeCosts.monthlyInterestOnlyPayment;
    }

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

    // Only the plain "Recast" strategy actually lowers the real-world
    // payment — Extra Payment keeps paying the original amount (just pays
    // off sooner), and Keep as Cash never touches the loan at all, so both
    // contribute $0 savings toward the housing-cost totals below.
    const isRecastStrategyActive = recastStrategy === CONFIG.SALE_PAYOFF_STRATEGY_RECAST;
    const effectiveSavings = isRecastStrategyActive ? recast.monthlySavings : 0;
    const recastHousingTotal = Math.max(0, bankMonthlyTotal - effectiveSavings);
    const recastEffectiveTotal = Math.max(0, effectiveMonthlyTotal - effectiveSavings);

    const activeHousingCost = bridgeDtiPhase === 'holding' ? combinedMonthlyCost : recastHousingTotal;
    const activeEffectiveCost = bridgeDtiPhase === 'holding' ? (combinedMonthlyCost + extraOutlay) : recastEffectiveTotal;
    outlookHousingCost = activeHousingCost;

    updateAffordability(activeHousingCost, activeEffectiveCost, extraOutlay, results.effectiveMonthlyIncome, domRefs, results.isNetIncomeBasis);
    updateBackEndDTI(activeHousingCost, getOtherMonthlyDebts(), results.effectiveMonthlyIncome, domRefs, results.isNetIncomeBasis);

    bridgePayload = {
      isBridge: true,
      holdingHousingCost: combinedMonthlyCost,
      recastHousingCost: recastHousingTotal,
      monthlySavings: effectiveSavings,
      recastStrategy
    };
  } else if (isRentalActive) {
    const rentalInputs = getRentalInputs();
    const departureMortgageMonthly = getNormalizedDepartureMortgagePayment(sellInputs.sellMortgagePayment, sellInputs.sellMortgageSchedule);
    rentalOffset = calculateRentalOffset({
      rentalProjectedMonthlyRent: rentalInputs.rentalProjectedMonthlyRent,
      rentalOffsetPercent: rentalInputs.rentalOffsetPercent,
      departureMortgagePayment: departureMortgageMonthly
    });

    // If the down payment is funded via a HELOC against this same home,
    // that payment is a straight, permanent addition to DTI — unlike the
    // Bridge Loan case above, there's no future sale to pay it off with, so
    // underwriting can't exclude it. It is NOT netted against the rental
    // income the way the departure mortgage is; it's a separate debt.
    syncRentalHelocPayment();
    const rentalHelocMonthlyPayment = rentalInputs.rentalFundingMode === CONFIG.RENTAL_FUNDING_HELOC
      ? Math.max(0, parseFloat(domRefs.rentalHelocPaymentInput?.value) || 0)
      : 0;
    if (rentalHelocMonthlyPayment > 0) {
      rentalHeloc = { helocAmount: rentalInputs.rentalHelocAmount, monthlyPayment: rentalHelocMonthlyPayment };
    }

    existingHousingObligation = rentalOffset.qualifyingHousingObligation + rentalHelocMonthlyPayment;
    updateRentalOffsetUI(rentalOffset, domRefs);

    // The new home's own DTI panel isn't touched by the departure home at
    // all in this mode (no combined carrying cost — that's the whole point
    // of renting instead of bridging) — only a documented shortfall (if any)
    // plus any rental HELOC payment count as extra monthly debt here, same
    // treatment the Max Affordability solver gives existingHousingObligation
    // below.
    updateBackEndDTI(bankMonthlyTotal, getOtherMonthlyDebts() + existingHousingObligation, results.effectiveMonthlyIncome, domRefs, results.isNetIncomeBasis);
  } else {
    updateBackEndDTI(bankMonthlyTotal, getOtherMonthlyDebts(), results.effectiveMonthlyIncome, domRefs, results.isNetIncomeBasis);
  }

  // Clears the rental-offset box back to its dashed placeholder whenever
  // Keep as Rental isn't the active mode (bridge, sell-first, or no house to
  // sell at all) — a single call here instead of duplicating it in every
  // branch above.
  if (!isRentalActive) updateRentalOffsetUI(null, domRefs);

  // Max Affordability solver + Cash-to-Close tally. General-purpose — works
  // for a plain purchase (existingHousingObligation stays 0 above) and for
  // the bridge/HELOC holding period alike.
  const affordInputs = getMaxAffordInputs();
  updateTargetDtiGuidanceUI(affordInputs.targetBackEndDTI, domRefs);
  const activeRate = activeTerm === 30 ? inputs.interest30 : inputs.interest15;
  const maxAfford = solveMaxAffordablePrice({
    targetBackEndDTI: affordInputs.targetBackEndDTI,
    monthlyIncome: results.effectiveMonthlyIncome,
    otherMonthlyDebts: getOtherMonthlyDebts(),
    existingHousingObligation,
    fixedDownPaymentCash: parseFloat(domRefs.cashDownPaymentInput?.value) || 0,
    otherDownPaymentSource: getOtherDownPaymentSourceAmount(),
    interestRate: activeRate,
    termYears: activeTerm,
    taxRate: inputs.taxRate,
    homeInsurance: inputs.homeInsurance,
    hoaFees: inputs.hoaFees,
    pmiRate: inputs.pmiRate
  });
  updateMaxAffordabilityUI(maxAfford, isBridgeActive && bridgeDtiPhase === 'holding', domRefs);

  // Cash-to-Close reflects the ACTUAL price/down payment entered above (not
  // the hypothetical max-affordable ceiling) — "how much cash do I need for
  // this deal", separate from "what's my ceiling."
  // existingHousingObligation is 0 outside the "carrying both homes" phase,
  // so this is just bankMonthlyTotal then — and the full combined carrying
  // cost while holding both, without duplicating that sum a third time.
  const reserveBasisMonthlyCost = existingHousingObligation + bankMonthlyTotal;
  const cashToClose = calculateCashToClose({
    downPaymentCash: parseFloat(domRefs.cashDownPaymentInput?.value) || 0,
    purchasePrice: inputs.homePrice,
    closingCostPercent: affordInputs.closingCostPercent,
    reserveMonths: affordInputs.reserveMonths,
    monthlyHousingObligation: reserveBasisMonthlyCost,
    extraProjectCash: affordInputs.extraProjectCash
  });
  // Cash cushion: compares cash actually on hand against the tally above —
  // renders a surplus/shortfall in the Cash to Close box and, when the
  // surplus is generous, an informational compensating-factor note next to
  // the Target DTI field. See evaluateCashCushion() in calculator.js.
  const cashCushion = evaluateCashCushion({
    cashAvailable: affordInputs.cashAvailable,
    totalCashNeeded: cashToClose.totalCashNeeded,
    monthlyHousingObligation: reserveBasisMonthlyCost
  });
  updateCashToCloseUI(cashToClose, domRefs, affordInputs.cashAvailable, cashCushion);
  updateCashCushionNoteUI(cashCushion, affordInputs.cashAvailable, domRefs);

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

  // Outlook Summary — rule-based (no AI) synthesis of everything computed
  // above into a short read + one verdict. Reuses the local variables this
  // function already built rather than recalculating any of them; see
  // generateOutlookSummary() in calculator.js for the actual line logic.
  const outlookBackEndDti = calculateBackEndDTI(outlookHousingCost, getOtherMonthlyDebts(), results.effectiveMonthlyIncome);
  const outlookSummary = generateOutlookSummary(results, {
    activeTerm,
    activeRate,
    homePrice: inputs.homePrice,
    backEndDtiValue: outlookBackEndDti,
    otherMonthlyDebts: getOtherMonthlyDebts(),
    isBridgeActive,
    activeRecast: bridgePayload ? { monthlySavings: bridgePayload.monthlySavings } : null,
    bridgeSaleStrategy: bridgePayload ? bridgePayload.recastStrategy : null,
    maxAfford,
    targetBackEndDTI: affordInputs.targetBackEndDTI,
    cashToClose,
    cashAvailable: affordInputs.cashAvailable,
    extraMonthlyOutlay: extraOutlay,
    asIsCompare,
    isAsIsPricingApplied: !!asIsPricingApplied,
    asIsAppliedComparison,
    asIsPriceDelta: asIsPricingApplied ? (asIsPricingApplied.sellHomeValue - sellInputs.sellHomeValue) : 0,
    asIsRepairsSaved: asIsPricingApplied ? asIsPricingApplied.sellRepairCosts : 0,
    rentalOffset,
    rentalHeloc
  });
  updateOutlookSummaryUI(outlookSummary, domRefs);
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
 * @param {Object} [options]
 * @param {boolean} [options.restoring] - true when this call is just
 *   repainting the toggle to match already-loaded saved state (page init),
 *   as opposed to a live click. Suppresses the Cash-Flow-group auto-expand
 *   below in that case — that section's own open/closed state was already
 *   correctly restored moments earlier by applyCollapsedSectionsState()
 *   from the user's own saved preference, and this function running again
 *   on every reload (whenever the saved income basis happens to be 'net')
 *   was silently overriding it back open regardless of what the user had
 *   actually left it as. The auto-expand is still exactly right for a real
 *   user clicking the Net toggle mid-session — it's only page-load restore
 *   that shouldn't re-trigger a "just switched modes" reveal.
 */
function setIncomeBasis(basis, { restoring = false } = {}) {
  const wasGross = incomeBasis === CONFIG.INCOME_BASIS_GROSS;
  incomeBasis = basis === CONFIG.INCOME_BASIS_NET ? CONFIG.INCOME_BASIS_NET : CONFIG.INCOME_BASIS_GROSS;
  setIncomeBasisToggleUI(incomeBasis === CONFIG.INCOME_BASIS_NET, domRefs);

  // If switching to Net mode live, auto-expand the Cash Flow sub-accordion
  // group — but not when merely restoring saved state on page load (see
  // the `restoring` doc note above).
  if (incomeBasis === CONFIG.INCOME_BASIS_NET && !restoring) {
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
 * Reads the "Have a house to sell?" fields into the shape calculateSaleProceeds()
 * expects, plus a couple of fields calculateSaleProceeds() itself doesn't use
 * but other consumers of this same section do (sellMortgagePayment/Schedule
 * for getNormalizedDepartureMortgagePayment(); asIsSaleValue/asIsMonthsSaved
 * for compareSaleStrategies()) — kept in one read so every "Have a house to
 * sell?" consumer stays in sync off a single call.
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
    sellProceedsPercent: parseFloat(domRefs.sellProceedsPercentSliderInput.value) || 0,
    asIsSaleValue: parseFloat(domRefs.asIsSaleValueInput?.value) || 0,
    asIsMonthsSaved: parseFloat(domRefs.asIsMonthsSavedInput?.value) || 0
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
 * Switches between Sell First, Bridge Loan, and Keep as Rental. Since the
 * 2026-09-03 split, this spans two independent toggles across two cards:
 * Card 1's Sell/Rental choice (home-action-switch) picks the top-level
 * mode, and Card 2's Sell First/Bridge Loan sub-choice (sale-mode-switch)
 * only matters while Sell is active — see attachSellHouseListeners() below
 * for how each button maps to a call here. Also drives which of the "Sell
 * It" / "Keep It As a Rental" cards is visible (updateSellRentalCardVisibility).
 * @param {'sellFirst'|'bridgeLoan'|'rental'} mode
 */
function setSaleMode(mode) {
  saleMode = mode === CONFIG.SALE_MODE_BRIDGE_LOAN
    ? CONFIG.SALE_MODE_BRIDGE_LOAN
    : mode === CONFIG.SALE_MODE_RENTAL
      ? CONFIG.SALE_MODE_RENTAL
      : CONFIG.SALE_MODE_SELL_FIRST;
  const isBridge = saleMode === CONFIG.SALE_MODE_BRIDGE_LOAN;
  const isRental = saleMode === CONFIG.SALE_MODE_RENTAL;
  if (!isRental) lastSellFinancingMode = saleMode;

  if (domRefs.saleModeSellFirstPanel) setVisible(domRefs.saleModeSellFirstPanel, !isBridge && !isRental);
  if (domRefs.saleModeBridgePanel) setVisible(domRefs.saleModeBridgePanel, isBridge);
  if (domRefs.btnSaleModeSellFirst) domRefs.btnSaleModeSellFirst.classList.toggle('active', !isBridge && !isRental);
  if (domRefs.btnSaleModeBridge) domRefs.btnSaleModeBridge.classList.toggle('active', isBridge);
  if (domRefs.btnHomeActionSell) domRefs.btnHomeActionSell.classList.toggle('active', !isRental);
  if (domRefs.btnHomeActionRental) domRefs.btnHomeActionRental.classList.toggle('active', isRental);
  updateSellRentalCardVisibility();

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
 * Shows the "Sell It" card while Sell First/Bridge Loan is active, or the
 * "Keep It As a Rental" card while Rental is active — both hidden entirely
 * when "Have a house to sell?" itself is off. Called from setSaleMode() and
 * from the hasHouseToSell checkbox handler, so either input recomputes it.
 */
function updateSellRentalCardVisibility() {
  const hasHouseToSell = !!domRefs.hasHouseToSellInput?.checked;
  const isRental = saleMode === CONFIG.SALE_MODE_RENTAL;
  if (domRefs.sellHouseSellCard) setVisible(domRefs.sellHouseSellCard, hasHouseToSell && !isRental);
  if (domRefs.sellHouseRentalCard) setVisible(domRefs.sellHouseRentalCard, hasHouseToSell && isRental);
}

/**
 * Switches the "Keep as Rental" down-payment funding sub-choice: Cash Only
 * (no new debt) or a HELOC against the departure home's equity. Mirrors
 * setBridgeFinancingType()'s job (button styling + panel visibility), but
 * simpler — no rate/fee defaults to reset, since the HELOC panel has its own
 * always-visible rate field instead of swapping between two loan types.
 * @param {'cash'|'heloc'} mode
 */
function setRentalFundingMode(mode) {
  rentalFundingMode = mode === CONFIG.RENTAL_FUNDING_HELOC ? CONFIG.RENTAL_FUNDING_HELOC : CONFIG.RENTAL_FUNDING_CASH;
  const isHeloc = rentalFundingMode === CONFIG.RENTAL_FUNDING_HELOC;

  if (domRefs.btnRentalFundingCash) domRefs.btnRentalFundingCash.classList.toggle('active', !isHeloc);
  if (domRefs.btnRentalFundingHeloc) domRefs.btnRentalFundingHeloc.classList.toggle('active', isHeloc);
  if (domRefs.rentalHelocPanel) setVisible(domRefs.rentalHelocPanel, isHeloc);

  // Auto-suggest a HELOC draw amount the first time this mode is entered
  // with nothing set yet — same "auto-fill, never locked" pattern as
  // bridgeLoanAmount in setSaleMode().
  if (isHeloc && domRefs.rentalHelocAmountInput && (parseFloat(domRefs.rentalHelocAmountInput.value) || 0) === 0) {
    const total = parseFloat(domRefs.downPaymentAmountInput.value) || 0;
    const cash = parseFloat(domRefs.cashDownPaymentInput.value) || 0;
    domRefs.rentalHelocAmountInput.value = Math.max(0, Math.round(total - cash));
    syncRentalHelocPayment();
  }
}

/**
 * Recomputes the rental HELOC's interest-only monthly payment from the
 * current draw amount + rate and writes it into the payment field — unless
 * the user has already typed their own figure into that field
 * (rentalHelocPaymentOverridden), in which case it's left alone. Called on
 * every draw-amount/rate edit.
 */
function syncRentalHelocPayment() {
  if (rentalHelocPaymentOverridden || !domRefs.rentalHelocPaymentInput) return;
  const { monthlyPayment } = calculateRentalHelocCost({
    rentalHelocAmount: parseFloat(domRefs.rentalHelocAmountInput?.value) || 0,
    rentalHelocRate: parseFloat(domRefs.rentalHelocRateInput?.value) || 0
  });
  domRefs.rentalHelocPaymentInput.value = Math.round(monthlyPayment);
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
 * Switches the Sale Proceeds Strategy within Bridge Loan mode
 * ('recast' vs 'extraPayment' vs 'keepCash')
 * @param {'recast'|'extraPayment'|'keepCash'} strategy
 */
function setRecastStrategy(strategy) {
  if (strategy === CONFIG.SALE_PAYOFF_STRATEGY_EXTRA_PAYMENT) {
    recastStrategy = CONFIG.SALE_PAYOFF_STRATEGY_EXTRA_PAYMENT;
  } else if (strategy === CONFIG.SALE_PAYOFF_STRATEGY_KEEP_CASH) {
    recastStrategy = CONFIG.SALE_PAYOFF_STRATEGY_KEEP_CASH;
  } else {
    recastStrategy = CONFIG.SALE_PAYOFF_STRATEGY_RECAST;
  }
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

  // The fee only ever applies when actually recasting — Extra Payment has no
  // lender fee, and Keep as Cash never touches the loan at all. Note the lump
  // sum itself stays at its full value here regardless of strategy: the
  // comparison box (updateStrategyComparisonUI) needs the FULL-amount Recast
  // and Extra Payment numbers to stay accurate even while Keep as Cash is the
  // active choice, so the three columns remain a fair side-by-side. The
  // recast-summary box and effectiveSavings below independently ignore this
  // `recast` object's applied-amount fields whenever Keep as Cash is active.
  const isRecastStrategyActive = recastStrategy === CONFIG.SALE_PAYOFF_STRATEGY_RECAST;
  const effectiveFee = isRecastStrategyActive ? bridgeInputs.recastFee : 0;
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

  const effectiveSavings = isRecastStrategyActive ? recast.monthlySavings : 0;
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
 * Reads the "Keep as Rental" mode fields
 */
function getRentalInputs() {
  return {
    rentalProjectedMonthlyRent: parseFloat(domRefs.rentalProjectedMonthlyRentInput?.value) || 0,
    rentalOffsetPercent: parseFloat(domRefs.rentalOffsetPercentInput?.value) || 0,
    rentalFundingMode,
    rentalHelocAmount: parseFloat(domRefs.rentalHelocAmountInput?.value) || 0,
    rentalHelocRate: parseFloat(domRefs.rentalHelocRateInput?.value) || 0,
    rentalHelocPayment: parseFloat(domRefs.rentalHelocPaymentInput?.value) || 0
  };
}

/**
 * Reads the Max Affordability solver / Cash-to-Close tally fields
 */
function getMaxAffordInputs() {
  return {
    targetBackEndDTI: parseFloat(domRefs.targetBackEndDTIInput?.value) || CONFIG.DEFAULT_TARGET_BACKEND_DTI,
    creditScoreBand: domRefs.creditScoreBandInput?.value || '',
    closingCostPercent: Math.max(0, parseFloat(domRefs.closingCostPercentInput?.value) || 0),
    reserveMonths: Math.max(0, parseFloat(domRefs.reserveMonthsInput?.value) || 0),
    extraProjectCash: Math.max(0, parseFloat(domRefs.extraProjectCashInput?.value) || 0),
    cashAvailable: Math.max(0, parseFloat(domRefs.cashAvailableInput?.value) || 0)
  };
}

/**
 * Applies the suggested DTI ceiling for the selected credit-score band to
 * the free-form Target DTI field — a prefill, never a lock; the field stays
 * fully editable afterward. See creditScoreToSuggestedDTI() in calculator.js
 * for why this is a rough guideline, not a guarantee.
 */
function applyCreditScoreDtiSuggestion() {
  const band = domRefs.creditScoreBandInput?.value || '';
  const suggestion = creditScoreToSuggestedDTI(band);
  if (suggestion.suggestedDTI !== null && domRefs.targetBackEndDTIInput) {
    domRefs.targetBackEndDTIInput.value = suggestion.suggestedDTI;
  }
  updateCreditScoreDtiNoteUI(suggestion, domRefs);
}

/**
 * Computes the amount contributed to the down payment by whichever
 * non-cash source applies to the current sale mode: net sale proceeds
 * (Sell First — simultaneous close), the bridge loan draw itself (Bridge
 * Loan — the sale hasn't happened yet, so there are no proceeds to apply
 * until it does), or a HELOC draw (Keep as Rental — no sale ever happens in
 * this mode, so there are never any sale proceeds to fall back to; Cash Only
 * funding contributes 0 here since it isn't a distinct source at all, just
 * the plain Cash Contribution field).
 */
function getOtherDownPaymentSourceAmount() {
  if (!domRefs.hasHouseToSellInput.checked) return 0;
  if (saleMode === CONFIG.SALE_MODE_BRIDGE_LOAN) {
    return Math.max(0, getBridgeInputs().bridgeLoanAmount);
  }
  if (saleMode === CONFIG.SALE_MODE_RENTAL) {
    if (rentalFundingMode !== CONFIG.RENTAL_FUNDING_HELOC) return 0;
    return Math.max(0, getRentalInputs().rentalHelocAmount);
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

  // Financing sub-type to relabel the "other source" box with: Bridge Loan
  // mode's own Bridge/HELOC choice, or (in Rental mode) whether the rental
  // funding sub-choice is a HELOC — Cash Only never reaches here since
  // houseProceeds is 0 and the box just hides.
  const otherSourceFinancingType = saleMode === CONFIG.SALE_MODE_RENTAL
    ? (rentalFundingMode === CONFIG.RENTAL_FUNDING_HELOC ? CONFIG.FINANCING_TYPE_HELOC : null)
    : bridgeFinancingType;
  updateDownPaymentBreakdownUI(cash, houseProceeds, total, percent, domRefs, saleMode, otherSourceFinancingType);
}

/**
 * Collects every field that gets persisted — the same shape localStorage
 * saves and loads. Shared by debouncedSave() and the "Copy Link" share
 * feature so both always serialize the exact same fields; previously this
 * object was only ever built inline inside the debounce callback, which
 * would have meant duplicating ~40 lines of DOM-reading logic (and risking
 * the two falling out of sync on the next field addition) to reuse it for
 * sharing.
 * @returns {Object} Current calculator state, ready for saveInputs() or
 *   encodeStateForSharing()
 */
function buildSaveData() {
  let paymentFreq = 'monthly';
  if (domRefs.btnFreqBiweekly?.classList.contains('active')) {
    paymentFreq = 'biweekly';
  } else if (domRefs.btnFreqAccelerated?.classList.contains('active')) {
    paymentFreq = 'accelerated';
  }

  return {
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
    ...getMaxAffordInputs(),
    incomeBasis,
    payFrequency,
    netMonthlyOverride,
    additionalPayment: parseFloat(domRefs.additionalPaymentInput.value) || 0,
    lumpSumAmount: parseFloat(domRefs.lumpSumAmountInput.value) || 0,
    lumpSumFrequency: parseInt(domRefs.lumpSumFrequencyInput.value) || 12,
    paymentFrequency: paymentFreq,
    biweeklyExtra: domRefs.biweeklyExtraInput ? (parseFloat(domRefs.biweeklyExtraInput.value) || 0) : 0,
    activeTerm,

    // "Pay It Off Early" accelerator (30-year Payment Breakdown card) — local-only
    payoffAcceleratorEnabled: !!domRefs.payoffAcceleratorCheckbox?.checked,
    payoffAcceleratorYearsOff: parseInt(domRefs.payoffYearsOffSlider?.value, 10) || 15,

    // "Have a house to sell?" section — local-only, same as everything else
    sellingHouse: domRefs.hasHouseToSellInput.checked,
    ...getSellInputs(),
    sellHomeValueUpdatedAt,

    // As-Is compare box "Apply" state — see asIsPricingApplied declaration
    asIsPricingApplied,

    // Bridge Loan mode
    saleMode,
    bridgeFinancingType,
    recastStrategy,
    bridgeDtiPhase,
    ...getBridgeInputs(),

    // Keep as Rental mode
    ...getRentalInputs(),

    // Left-column card open/closed state — local-only, same as everything else
    collapsedSections: getCollapsedSectionsState()
  };
}

/**
 * Debounced save function to reduce API calls
 */
const debouncedSave = debounce(() => {
  saveInputs(buildSaveData());
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
        setVisible(domRefs.biweeklyExtraContainer, freq === 'biweekly' || freq === 'accelerated');
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

  // "Pay It Off Early" accelerator — checkbox reveals the years-off slider
  if (domRefs.payoffAcceleratorCheckbox) {
    domRefs.payoffAcceleratorCheckbox.addEventListener('change', () => {
      setVisible(domRefs.payoffAcceleratorBodyEl, domRefs.payoffAcceleratorCheckbox.checked);
      calculateAll();
      debouncedSave();
    });
  }
  if (domRefs.payoffYearsOffSlider) {
    domRefs.payoffYearsOffSlider.addEventListener('input', () => {
      debouncedCalculate();
    });
  }

  // Home price syncing
  domRefs.homePriceInput.addEventListener('input', () => {
    const val = parseFloat(domRefs.homePriceInput.value) || 0;
    domRefs.homePriceSlider.value = clamp(val, CONFIG.MIN_HOME_PRICE, CONFIG.MAX_HOME_PRICE);

    // Hide Redfin badge when manually edited
    const badge = getElement('badge-redfin-price');
    if (badge) setVisible(badge, false);

    syncDownPaymentFields('amount');
    debouncedCalculate();
  });

  domRefs.homePriceSlider.addEventListener('input', () => {
    const val = parseFloat(domRefs.homePriceSlider.value);
    domRefs.homePriceInput.value = val;

    const badge = getElement('badge-redfin-price');
    if (badge) setVisible(badge, false);

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
      if (badge) setVisible(badge, false);
      debouncedCalculate();
    });
  });

  // Other numeric inputs
  const otherNumericInputs = [
    domRefs.homeInsuranceInput,
    domRefs.pmiRateInput,
    domRefs.grossAnnualIncomeInput,
    domRefs.otherMonthlyDebtsInput,
    domRefs.targetBackEndDTIInput,
    domRefs.closingCostPercentInput,
    domRefs.reserveMonthsInput,
    domRefs.extraProjectCashInput,
    domRefs.cashAvailableInput
  ];

  otherNumericInputs.forEach(input => {
    input?.addEventListener('input', debouncedCalculate);
  });

  // Target DTI quick-pick presets — one-shot fills, not a persistent toggle,
  // since the field stays free-form (someone can type any number afterward).
  domRefs.targetDtiPresetButtons?.forEach(btn => {
    btn.addEventListener('click', () => {
      if (domRefs.targetBackEndDTIInput) {
        domRefs.targetBackEndDTIInput.value = btn.getAttribute('data-target-dti');
      }
      debouncedCalculate();
    });
  });

  // Credit-score band → suggested DTI ceiling (prefills Target DTI, never locks it)
  if (domRefs.creditScoreBandInput) {
    domRefs.creditScoreBandInput.addEventListener('change', () => {
      applyCreditScoreDtiSuggestion();
      debouncedCalculate();
    });
  }

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
    setVisible(domRefs.sellHouseFieldsPanel, isChecked);
    updateSellRentalCardVisibility();
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
      // Same reasoning as the sellHomeValueInput listener below — a manual
      // repair-cost edit after applying As-Is pricing invalidates it.
      if (input === domRefs.sellRepairCostsInput) asIsPricingApplied = null;
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
    // A manual edit after applying As-Is pricing means the user is telling
    // us their own number now — the applied snapshot/warning no longer apply.
    asIsPricingApplied = null;
    const redfinBadge = getElement('badge-sell-redfin');
    if (redfinBadge) setVisible(redfinBadge, false);
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

  // "Compare: Sell As-Is Instead?" fields — cheap enough to run through the
  // normal debounced pipeline rather than an instant path like updateSellProceeds().
  [domRefs.asIsSaleValueInput, domRefs.asIsMonthsSavedInput].forEach(input => {
    input?.addEventListener('input', debouncedCalculate);
  });

  // Auto-suggest an as-is value the first time this section is opened with
  // nothing set yet — same "auto-fill, never locked" pattern as bridgeLoanAmount
  // in setSaleMode(). ~8% off the entered home value is a rough as-is/investor
  // discount rule-of-thumb; always editable afterward.
  if (domRefs.sellAisCompareToggle) {
    domRefs.sellAisCompareToggle.addEventListener('click', () => {
      if (domRefs.asIsSaleValueInput && (parseFloat(domRefs.asIsSaleValueInput.value) || 0) === 0) {
        const homeValue = parseFloat(domRefs.sellHomeValueInput.value) || 0;
        if (homeValue > 0) {
          domRefs.asIsSaleValueInput.value = Math.round(homeValue * 0.92);
          debouncedCalculate();
        }
      }
    });
  }

  // "Apply As-Is Pricing to Sale" / "Revert" — copies the As-Is compare
  // box's value into the real sale inputs (or undoes that).
  if (domRefs.aisApplyBtn) {
    domRefs.aisApplyBtn.addEventListener('click', handleApplyAsIsPricing);
  }
  if (domRefs.aisRevertBtn) {
    domRefs.aisRevertBtn.addEventListener('click', handleRevertAsIsPricing);
  }

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

  // Sale mode switch (Sell First vs Bridge Loan vs Keep as Rental)
  // Card 1's top-level "What Are You Doing With This Home?" toggle.
  if (domRefs.btnHomeActionSell) {
    domRefs.btnHomeActionSell.addEventListener('click', () => {
      setSaleMode(lastSellFinancingMode);
      syncDownPaymentFields('house');
      debouncedCalculate();
    });
  }
  if (domRefs.btnHomeActionRental) {
    domRefs.btnHomeActionRental.addEventListener('click', () => {
      setSaleMode(CONFIG.SALE_MODE_RENTAL);
      syncDownPaymentFields('house');
      debouncedCalculate();
    });
  }

  // Card 2's "Sell It" financing sub-choice — only meaningful while Sell is active.
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

  // "Keep as Rental" fields
  [domRefs.rentalProjectedMonthlyRentInput, domRefs.rentalOffsetPercentInput].forEach(input => {
    input?.addEventListener('input', debouncedCalculate);
  });

  // Card 3's down-payment funding sub-choice — Cash Only vs. HELOC.
  if (domRefs.btnRentalFundingCash) {
    domRefs.btnRentalFundingCash.addEventListener('click', () => {
      setRentalFundingMode(CONFIG.RENTAL_FUNDING_CASH);
      syncDownPaymentFields('house');
      debouncedCalculate();
    });
  }
  if (domRefs.btnRentalFundingHeloc) {
    domRefs.btnRentalFundingHeloc.addEventListener('click', () => {
      setRentalFundingMode(CONFIG.RENTAL_FUNDING_HELOC);
      syncDownPaymentFields('house');
      debouncedCalculate();
    });
  }

  // Rental HELOC draw amount/rate — live-recompute the interest-only payment
  // (unless the user has typed their own figure into it directly, see
  // rentalHelocPaymentOverridden).
  [domRefs.rentalHelocAmountInput, domRefs.rentalHelocRateInput].forEach(input => {
    input?.addEventListener('input', () => {
      syncRentalHelocPayment();
      syncDownPaymentFields('house');
      debouncedCalculate();
    });
  });
  if (domRefs.rentalHelocPaymentInput) {
    domRefs.rentalHelocPaymentInput.addEventListener('input', () => {
      rentalHelocPaymentOverridden = true;
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
  if (domRefs.btnRecastStratCash) {
    domRefs.btnRecastStratCash.addEventListener('click', () => {
      setRecastStrategy(CONFIG.SALE_PAYOFF_STRATEGY_KEEP_CASH);
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

  // "Copy Link" — opens an explainer modal (share-link-modal) aimed at
  // non-technical users, with the actual copy action as a CTA button at
  // the bottom of that modal. The copy itself encodes the current
  // calculator state into a "?share=..." URL query param, the same shape
  // initializeApp() decodes back out on load (see
  // encodeStateForSharing()/decodeStateFromSharing() in storage.js).
  // Nothing is sent to a server; the numbers live entirely in the copied
  // link, so this doesn't compromise the "100% Private & Local" promise
  // shown in the trust banner.
  const btnOpenShareLink = document.getElementById('btn-open-share-link');
  const shareLinkModal = document.getElementById('share-link-modal');
  const btnCloseShareLink = document.getElementById('btn-close-share-link');
  const btnCopyShareLink = document.getElementById('btn-copy-share-link');

  if (btnOpenShareLink && shareLinkModal) {
    const openShareLinkModal = () => {
      shareLinkModal.style.display = 'flex';
      shareLinkModal.classList.remove('hidden');
      shareLinkModal.setAttribute('aria-hidden', 'false');
    };
    const closeShareLinkModal = () => {
      shareLinkModal.style.display = 'none';
      shareLinkModal.classList.add('hidden');
      shareLinkModal.setAttribute('aria-hidden', 'true');
    };

    btnOpenShareLink.addEventListener('click', openShareLinkModal);
    if (btnCloseShareLink) btnCloseShareLink.addEventListener('click', closeShareLinkModal);
    shareLinkModal.addEventListener('click', (e) => {
      if (e.target === shareLinkModal) closeShareLinkModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !shareLinkModal.classList.contains('hidden')) {
        closeShareLinkModal();
      }
    });
  }

  if (btnCopyShareLink) {
    const originalShareLinkLabel = btnCopyShareLink.innerHTML;
    btnCopyShareLink.addEventListener('click', async () => {
      const shareUrl = `${window.location.origin}${window.location.pathname}?share=${encodeStateForSharing(buildSaveData())}`;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(shareUrl);
        } else {
          const textarea = document.createElement('textarea');
          textarea.value = shareUrl;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          textarea.remove();
        }
        setButtonLoading(btnCopyShareLink, '✅ Shareable Link Copied!', false);
      } catch (error) {
        console.error('[ERROR] Failed to copy share link:', error);
        setButtonLoading(btnCopyShareLink, '❌ Copy Failed', false);
      }
      setTimeout(() => {
        btnCopyShareLink.innerHTML = originalShareLinkLabel;
      }, 2000);
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
        setVisible(badge, true, 'inline-block');
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
/**
 * "Apply As-Is Pricing to Sale" — copies the As-Is compare box's value into
 * the real Estimated Home Value field and zeroes Repairs / Prep Costs, so
 * every downstream number (net proceeds, down payment, cash-to-close, DTI,
 * Outlook) actually reflects an as-is sale instead of just showing a
 * side-by-side what-if. Snapshots the pre-apply sellHomeValue/sellRepairCosts
 * into asIsPricingApplied so handleRevertAsIsPricing() can restore them
 * exactly, and resets the what-if As-Is Sale Value field back to 0 — once
 * applied, both sides of the comparison would be identical, so leaving it
 * populated would just show a meaningless "wins by $0" box.
 */
function handleApplyAsIsPricing() {
  const asIsValue = parseFloat(domRefs.asIsSaleValueInput?.value) || 0;
  if (asIsValue <= 0) return;

  asIsPricingApplied = {
    sellHomeValue: parseFloat(domRefs.sellHomeValueInput.value) || 0,
    sellRepairCosts: parseFloat(domRefs.sellRepairCostsInput.value) || 0
  };

  domRefs.sellHomeValueInput.value = Math.round(asIsValue);
  domRefs.sellRepairCostsInput.value = 0;
  domRefs.asIsSaleValueInput.value = 0;

  const redfinBadge = getElement('badge-sell-redfin');
  if (redfinBadge) setVisible(redfinBadge, false);
  markSellHomeValueFresh();
  updateSellProceeds();
  syncDownPaymentFields('house');
  calculateAll();
  debouncedSave();
}

/**
 * "↩ Revert to Repair-First Pricing" — undoes handleApplyAsIsPricing(),
 * restoring the exact sellHomeValue/sellRepairCosts the user had before
 * applying (never just clearing them, so their original repair-cost figure
 * isn't lost).
 */
function handleRevertAsIsPricing() {
  if (!asIsPricingApplied) return;

  domRefs.sellHomeValueInput.value = asIsPricingApplied.sellHomeValue;
  domRefs.sellRepairCostsInput.value = asIsPricingApplied.sellRepairCosts;
  asIsPricingApplied = null;

  markSellHomeValueFresh();
  updateSellProceeds();
  syncDownPaymentFields('house');
  calculateAll();
  debouncedSave();
}

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
        if (badge) setVisible(badge, true, 'inline-block');

        const rate15 = data.rate15 ? parseFloat(data.rate15) : (rate30 - 0.70);
        if (!isNaN(rate15)) {
          domRefs.interest15Input.value = rate15.toFixed(2);
          const badge15 = getElement('badge-live-15');
          if (badge15) setVisible(badge15, true, 'inline-block');
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
      // Not tied to a specific month — a hardcoded date here ("Fallback
      // (July 2026)") would keep saying that forever and eventually read as
      // broken/stale rather than as an honest "still using a reasonable
      // estimate" note.
      domRefs.ratesAttributionEl.textContent = 'Source: default estimate — live rates unavailable right now';
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
    // Load saved data — a "?share=..." link (from the Copy Link button)
    // takes priority over localStorage the one time it's present, one-time-
    // import style (same pattern as the MLS bookmarklet's
    // nycto_recent_imported_property flow elsewhere in this file): apply it,
    // persist it locally so it survives future reloads, then strip the
    // param so editing a value afterward and reloading doesn't keep
    // reverting back to that original shared snapshot.
    const sharedParam = new URLSearchParams(window.location.search).get('share');
    const sharedState = sharedParam ? decodeStateFromSharing(sharedParam) : null;
    const savedData = sharedState ? mergeDefaults(DEFAULTS, sharedState) : await loadSavedInputs();
    if (sharedState) {
      saveInputs(savedData);
      window.history.replaceState(null, '', window.location.pathname + window.location.hash);
    }
    applyLoadedDataToDOM(savedData, domRefs);
    activeTerm = savedData.activeTerm || 30;

    // Re-render the credit-score band's disclaimer note on reload without
    // re-triggering its Target DTI prefill — the saved targetBackEndDTI may
    // have been hand-edited away from the suggestion since it was applied.
    updateCreditScoreDtiNoteUI(creditScoreToSuggestedDTI(savedData.creditScoreBand || ''), domRefs);

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
    setVisible(domRefs.sellHouseFieldsPanel, !!savedData.sellingHouse);

    // Restore "Pay It Off Early" accelerator state (checkbox-driven show/hide,
    // same reasoning as the sell-house panel above)
    if (domRefs.payoffAcceleratorCheckbox) {
      domRefs.payoffAcceleratorCheckbox.checked = !!savedData.payoffAcceleratorEnabled;
      setVisible(domRefs.payoffAcceleratorBodyEl, !!savedData.payoffAcceleratorEnabled);
    }
    if (domRefs.payoffYearsOffSlider) {
      domRefs.payoffYearsOffSlider.value = clamp(parseInt(savedData.payoffAcceleratorYearsOff, 10) || 15, 1, 25);
    }
    sellHomeValueUpdatedAt = savedData.sellHomeValueUpdatedAt || null;
    setSaleMode(savedData.saleMode || CONFIG.SALE_MODE_SELL_FIRST);
    // resetDefaults: false — the saved rate/fee values (restored to the DOM
    // by applyLoadedDataToDOM just above) must win here, not whichever
    // default this financing type would normally reset them to.
    setBridgeFinancingType(savedData.bridgeFinancingType || DEFAULTS.bridgeFinancingType, { resetDefaults: false });
    setRentalFundingMode(savedData.rentalFundingMode || DEFAULTS.rentalFundingMode);
    // A saved HELOC payment that differs from what amount/rate alone would
    // auto-compute means the user had overridden it before saving — restore
    // that override state so reloading doesn't silently snap it back.
    if (domRefs.rentalHelocPaymentInput) {
      const savedPayment = parseFloat(savedData.rentalHelocPayment) || 0;
      const autoPayment = calculateRentalHelocCost({
        rentalHelocAmount: parseFloat(savedData.rentalHelocAmount) || 0,
        rentalHelocRate: parseFloat(savedData.rentalHelocRate) || 0
      }).monthlyPayment;
      rentalHelocPaymentOverridden = savedPayment > 0 && Math.round(savedPayment) !== Math.round(autoPayment);
    }
    if (savedData.recastStrategy === CONFIG.SALE_PAYOFF_STRATEGY_EXTRA_PAYMENT) {
      recastStrategy = CONFIG.SALE_PAYOFF_STRATEGY_EXTRA_PAYMENT;
    } else if (savedData.recastStrategy === CONFIG.SALE_PAYOFF_STRATEGY_KEEP_CASH) {
      recastStrategy = CONFIG.SALE_PAYOFF_STRATEGY_KEEP_CASH;
    } else {
      recastStrategy = CONFIG.SALE_PAYOFF_STRATEGY_RECAST;
    }
    setRecastStrategyUI(recastStrategy, domRefs);
    bridgeDtiPhase = savedData.bridgeDtiPhase === 'recast' ? 'recast' : 'holding';
    asIsPricingApplied = (savedData.asIsPricingApplied
      && typeof savedData.asIsPricingApplied.sellHomeValue === 'number'
      && typeof savedData.asIsPricingApplied.sellRepairCosts === 'number')
      ? savedData.asIsPricingApplied
      : null;

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
    setIncomeBasis(savedData.incomeBasis || CONFIG.INCOME_BASIS_GROSS, { restoring: true });

    // Attach all listeners
    attachInputListeners();
    attachActionListeners();
    attachSellHouseListeners();
    attachTooltipPositioning();

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
// NUMBER INPUT PASTE SANITIZATION
// ============================================================================
// Pasting a comma-formatted number (e.g. "$650,000" copied off a listing
// site) into a native <input type="number"> fails the browser's built-in
// value sanitizer, which silently blanks the field instead of stripping the
// formatting. Every value read downstream uses `parseFloat(el.value) || 0`,
// so a blanked field quietly becomes 0 with no visible error. Intercept the
// paste ourselves and strip anything but digits/decimal/minus before the
// browser's native sanitizer gets a chance to reject it.
document.addEventListener('paste', (e) => {
  const target = e.target;
  if (!(target instanceof HTMLInputElement) || target.type !== 'number') return;
  const pasted = (e.clipboardData || window.clipboardData)?.getData('text') || '';
  const cleaned = pasted.replace(/[^0-9.-]/g, '');
  if (!cleaned || isNaN(parseFloat(cleaned))) return; // leave the field as-is
  e.preventDefault();
  target.value = cleaned;
  // Fire both — different listeners in this app bind to 'input' or 'change'.
  target.dispatchEvent(new Event('input', { bubbles: true }));
  target.dispatchEvent(new Event('change', { bubbles: true }));
});

// ============================================================================
// START APPLICATION
// ============================================================================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeApp);
} else {
  initializeApp();
}
