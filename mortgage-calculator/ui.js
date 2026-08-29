/**
 * UI Module - Handles all DOM rendering and updates
 * Includes chart drawing, element updates, and event setup
 */

import { CONFIG, OUTPUT_IDS } from './config.js';
import { formatCurrency, formatSignedCurrency, formatTimeSaved, linearInterpolateYear, setElementText, getElement, daysSince } from './utils.js';
import { getDTIStatus, getBackEndDTIStatus } from './calculator.js';

/**
 * Creates references to all DOM elements needed for calculations
 * @returns {Object} Object containing all DOM element references
 */
export function createDOMReferences() {
  const getEl = id => document.getElementById(id);

  return {
    // Inputs
    homePriceInput: getEl('homePrice'),
    homePriceSlider: getEl('homePriceSlider'),
    cashDownPaymentInput: getEl('cashDownPayment'),
    houseSaleDownPaymentInput: getEl('houseSaleDownPayment'),
    houseSaleDownPaymentWrapper: getEl('house-sale-downpayment-wrapper'),
    downPaymentAmountInput: getEl('downPaymentAmount'),
    downPaymentPercentInput: getEl('downPaymentPercent'),
    downPaymentSlider: getEl('downPaymentSlider'),
    dpBreakdownHouse: getEl('dp-breakdown-house'),
    dpBreakdownCash: getEl('dp-breakdown-cash'),
    dpBreakdownTotal: getEl('dp-breakdown-total'),
    interest30Input: getEl('interest30'),
    interest15Input: getEl('interest15'),
    taxRateInput: getEl('taxRate'),
    homeInsuranceInput: getEl('homeInsurance'),
    hoaFeesInput: getEl('hoaFees'),
    pmiRateInput: getEl('pmiRate'),
    grossAnnualIncomeInput: getEl('grossAnnualIncome'),
    otherMonthlyDebtsInput: getEl('otherMonthlyDebts'),
    btnIncomeBasisGross: getEl('btn-income-basis-gross'),
    btnIncomeBasisNet: getEl('btn-income-basis-net'),
    incomeBasisAdjustWrap: getEl('income-basis-adjust-wrap'),
    btnPayFreqBiweekly: getEl('btn-pay-freq-biweekly'),
    btnPayFreqSemiMonthly: getEl('btn-pay-freq-semimonthly'),
    btnPayFreqMonthly: getEl('btn-pay-freq-monthly'),
    incomeBasisPaycheckAmountInput: getEl('incomeBasisPaycheckAmount'),
    incomeBasisPaycheckHelpEl: getEl('income-basis-paycheck-help'),
    incomeBasisAdjustSlider: getEl('incomeBasisAdjustSlider'),
    incomeBasisAdjustValueEl: getEl('income-basis-adjust-value'),
    btnResetIncomeBasisAdjust: getEl('btn-reset-income-basis-adjust'),
    incomeBasisBreakdownEl: getEl('income-basis-breakdown'),
    additionalPaymentInput: getEl('additionalPayment'),
    additionalPaymentSlider: getEl('additionalPaymentSlider'),
    lumpSumAmountInput: getEl('lumpSumAmount'),
    lumpSumFrequencyInput: getEl('lumpSumFrequency'),
    
    // Frequency and Biweekly inputs
    btnFreqMonthly: getEl('btn-freq-monthly'),
    btnFreqBiweekly: getEl('btn-freq-biweekly'),
    btnFreqAccelerated: getEl('btn-freq-accelerated'),
    freqExplanationBox: getEl('freq-explanation-box'),
    biweeklyExtraContainer: getEl('biweekly-extra-container'),
    biweeklyExtraInput: getEl('biweeklyExtra'),
    biweeklyExtraSlider: getEl('biweeklyExtraSlider'),
    
    mlsNumberInput: getEl('mlsNumber'),

    // "Have a house to sell?" inputs
    hasHouseToSellInput: getEl('hasHouseToSell'),
    sellHouseFieldsPanel: getEl('sell-house-panel'),
    sellHomeRedfinUrlInput: getEl('sellHomeRedfinUrl'),
    sellHomeValueInput: getEl('sellHomeValue'),
    sellMortgagePayoffInput: getEl('sellMortgagePayoff'),
    sellCommissionPercentInput: getEl('sellCommissionPercent'),
    sellClosingCostsPercentInput: getEl('sellClosingCostsPercent'),
    sellRepairCostsInput: getEl('sellRepairCosts'),
    sellConcessionsInput: getEl('sellConcessions'),
    sellMovingCostsInput: getEl('sellMovingCosts'),
    sellProceedsPercentSliderInput: getEl('sellProceedsPercentSlider'),

    // Bridge Loan mode inputs
    saleModeSellFirstPanel: getEl('sale-mode-sell-first-panel'),
    saleModeBridgePanel: getEl('sale-mode-bridge-panel'),
    btnSaleModeSellFirst: getEl('btn-sale-mode-sell-first'),
    btnSaleModeBridge: getEl('btn-sale-mode-bridge'),
    btnFinancingTypeBridge: getEl('btn-financing-type-bridge'),
    btnFinancingTypeHeloc: getEl('btn-financing-type-heloc'),
    bridgeLoanAmountInput: getEl('bridgeLoanAmount'),
    bridgeLoanAmountLabel: getEl('bridgeLoanAmountLabel'),
    bridgeLoanAmountTooltip: getEl('bridgeLoanAmountTooltip'),
    bridgeExtraCashInput: getEl('bridgeExtraCash'),
    bridgeExtraCashLabel: getEl('bridgeExtraCashLabel'),
    bridgeExtraCashTooltip: getEl('bridgeExtraCashTooltip'),
    monthsUntilSaleInput: getEl('monthsUntilSale'),
    bridgeLoanRateInput: getEl('bridgeLoanRate'),
    bridgeLoanRateLabel: getEl('bridgeLoanRateLabel'),
    bridgeLoanRateTooltip: getEl('bridgeLoanRateTooltip'),
    bridgeLoanFeesPercentInput: getEl('bridgeLoanFeesPercent'),
    bridgeLoanFeesLabel: getEl('bridgeLoanFeesLabel'),
    bridgeLoanFeesTooltip: getEl('bridgeLoanFeesTooltip'),
    recastFeeInput: getEl('recastFee'),
    recastStrategySwitch: getEl('recast-strategy-switch'),
    btnRecastStratRecast: getEl('btn-recast-strat-recast'),
    btnRecastStratExtra: getEl('btn-recast-strat-extra'),
    recastFeeGroup: getEl('recast-fee-group'),
    recastStrategyComparisonBox: getEl('recast-strategy-comparison-box'),
    stratCompLumpSumBadge: getEl('strat-comp-lump-sum-badge'),
    stratCardRecast: getEl('strat-card-recast'),
    stratCardExtra: getEl('strat-card-extra'),
    stratRecastActiveTag: getEl('strat-recast-active-tag'),
    stratExtraActiveTag: getEl('strat-extra-active-tag'),
    stratRecastPiti: getEl('strat-recast-piti'),
    stratRecastSavings: getEl('strat-recast-savings'),
    stratRecastTerm: getEl('strat-recast-term'),
    stratRecastInterest: getEl('strat-recast-interest'),
    stratExtraPiti: getEl('strat-extra-piti'),
    stratExtraTerm: getEl('strat-extra-term'),
    stratExtraTimeSaved: getEl('strat-extra-time-saved'),
    stratExtraInterest: getEl('strat-extra-interest'),
    stratExtraInterestSaved: getEl('strat-extra-interest-saved'),
    stratCompSummaryText: getEl('strat-comp-summary-text'),
    stratCompBestOfBothNote: getEl('strat-comp-best-of-both-note'),

    // Buttons
    btnSearchMls: getEl('btn-search-mls'),
    btnViewAmort: getEl('btn-view-amort'),
    loadRatesBtn: getEl('btn-load-rates'),
    btnSearchSellRedfin: getEl('btn-search-sell-redfin'),
    btnForceRefreshSellRedfin: getEl('btn-force-refresh-sell-redfin'),
    btnApplyProceeds: getEl('btn-apply-proceeds'),
    btnRefreshStaleValue: getEl('btn-refresh-stale-value'),
    
    // Cards
    card30: getEl('card-30yr'),
    card15: getEl('card-15yr'),
    
    // Outputs
    totalPayment30El: getEl('total-payment-30'),
    piPayment30El: getEl('pi-payment-30'),
    lifetimeInterest30El: getEl('lifetime-interest-30'),
    interestSavings30El: getEl('interest-savings-30'),
    timeSavedRow30El: getEl('time-saved-row-30'),
    timeSaved30El: getEl('time-saved-30'),
    biweeklyReadout30: getEl('biweekly-readout-30'),
    biweeklyPayment30El: getEl('biweekly-payment-30'),
    biweeklyBadge30El: getEl('biweekly-badge-30'),
    savedBiweeklyRow30El: getEl('saved-biweekly-row-30'),
    savedBiweeklyVal30El: getEl('saved-biweekly-val-30'),
    paymentLabel30El: getEl('payment-label-30'),
    recastReadout30El: getEl('recast-readout-30'),
    recastTransition30El: getEl('recast-transition-30'),
    btnRecastPhasePost30El: getEl('btn-recast-phase-post-30'),
    btnRecastPhasePre30El: getEl('btn-recast-phase-pre-30'),
    savedRecastRow30El: getEl('saved-recast-row-30'),
    savedRecastLabel30El: getEl('saved-recast-label-30'),
    savedRecastTooltip30El: getEl('saved-recast-tooltip-30'),
    savedRecastVal30El: getEl('saved-recast-val-30'),
    
    totalPayment15El: getEl('total-payment-15'),
    piPayment15El: getEl('pi-payment-15'),
    lifetimeInterest15El: getEl('lifetime-interest-15'),
    interestSavings15El: getEl('interest-savings-15'),
    timeSavedRow15El: getEl('time-saved-row-15'),
    timeSaved15El: getEl('time-saved-15'),
    biweeklyReadout15: getEl('biweekly-readout-15'),
    biweeklyPayment15El: getEl('biweekly-payment-15'),
    biweeklyBadge15El: getEl('biweekly-badge-15'),
    savedBiweeklyRow15El: getEl('saved-biweekly-row-15'),
    savedBiweeklyVal15El: getEl('saved-biweekly-val-15'),
    paymentLabel15El: getEl('payment-label-15'),
    recastReadout15El: getEl('recast-readout-15'),
    recastTransition15El: getEl('recast-transition-15'),
    btnRecastPhasePost15El: getEl('btn-recast-phase-post-15'),
    btnRecastPhasePre15El: getEl('btn-recast-phase-pre-15'),
    savedRecastRow15El: getEl('saved-recast-row-15'),
    savedRecastLabel15El: getEl('saved-recast-label-15'),
    savedRecastTooltip15El: getEl('saved-recast-tooltip-15'),
    savedRecastVal15El: getEl('saved-recast-val-15'),
    
    // Interactive display
    chartTotalValEl: getEl('chart-total-val'),
    activeTermLabelEl: getEl('active-term-label'),
    legendPiEl: getEl('legend-pi'),
    legendTaxEl: getEl('legend-tax'),
    legendInsEl: getEl('legend-ins'),
    legendPmiEl: getEl('legend-pmi'),
    legendHoaEl: getEl('legend-hoa'),
    pmiLegendItem: document.querySelector('.id-pmi-item'),
    hoaLegendItem: document.querySelector('.id-hoa-item'),
    
    // Donut segments
    segmentPi: document.querySelector('.donut-segment.pi'),
    segmentTax: document.querySelector('.donut-segment.tax'),
    segmentIns: document.querySelector('.donut-segment.ins'),
    segmentPmi: document.querySelector('.donut-segment.pmi'),
    segmentHoa: document.querySelector('.donut-segment.hoa'),
    
    // Affordability
    residualCashFlowBanner: getEl('residual-cash-flow-banner'),
    residualCashFlowStandardBox: getEl('residual-cash-flow-standard-box'),
    residualCashFlowBridgeBox: getEl('residual-cash-flow-bridge-box'),
    residualHoldingCostTag: getEl('residual-holding-cost-tag'),
    residualHoldingAmount: getEl('residual-holding-amount'),
    residualHoldingPercent: getEl('residual-holding-percent'),
    residualRecastCostTag: getEl('residual-recast-cost-tag'),
    residualRecastAmount: getEl('residual-recast-amount'),
    residualRecastPercent: getEl('residual-recast-percent'),
    residualBridgeIncomeNote: getEl('residual-bridge-income-note'),
    residualCashFlowSubtitle: getEl('residual-cash-flow-subtitle'),
    residualCashFlowAmount: getEl('residual-cash-flow-amount'),
    residualCashFlowPercent: getEl('residual-cash-flow-percent'),
    bridgeDtiPhaseToggle: getEl('bridge-dti-phase-toggle'),
    btnBridgePhaseHolding: getEl('btn-bridge-phase-holding'),
    btnBridgePhaseRecast: getEl('btn-bridge-phase-recast'),
    dtiTabBtnBank: getEl('dti-tab-btn-bank'),
    dtiTabBtnBackend: getEl('dti-tab-btn-backend'),
    dtiTabBtnEffective: getEl('dti-tab-btn-effective'),
    dtiTitleBank: getEl('dti-title-bank'),
    dtiTitleBackend: getEl('dti-title-backend'),
    dtiTitleEffective: getEl('dti-title-effective'),
    dtiTooltipBank: getEl('dti-tooltip-bank'),
    dtiTooltipBackend: getEl('dti-tooltip-backend'),
    dtiTooltipEffective: getEl('dti-tooltip-effective'),
    dtiProgressMarkersBank: getEl('dti-progress-markers-bank'),
    dtiProgressMarkersBackend: getEl('dti-progress-markers-backend'),
    dtiProgressMarkersEffective: getEl('dti-progress-markers-effective'),
    dtiRatioEl: getEl('dti-ratio'),
    dtiStatusBadge: getEl('dti-status-badge'),
    dtiProgressBar: getEl('dti-progress-bar'),
    dtiDescriptionEl: getEl('dti-description'),
    dtiDollarBreakdownEl: getEl('dti-dollar-breakdown'),
    backendDtiRatioEl: getEl('backend-dti-ratio'),
    backendDtiBadgeEl: getEl('backend-dti-badge'),
    backendDtiProgressBarEl: getEl('backend-dti-progress-bar'),
    backendDtiDescriptionEl: getEl('backend-dti-description'),
    backendDtiDollarBreakdownEl: getEl('backend-dti-dollar-breakdown'),
    effectiveDtiRatioEl: getEl('effective-dti-ratio'),
    effectiveDtiDeltaBadge: getEl('effective-dti-delta-badge'),
    effectiveDtiProgressBar: getEl('effective-dti-progress-bar'),
    effectiveDtiDescriptionEl: getEl('effective-dti-description'),
    effectiveDtiDollarBreakdownEl: getEl('effective-dti-dollar-breakdown'),
    bridgeHoldingDtiRatioEl: getEl('bridge-holding-dti-ratio'),
    bridgeHoldingDtiBadgeEl: getEl('bridge-holding-dti-badge'),
    bridgeHoldingDtiProgressBarEl: getEl('bridge-holding-dti-progress-bar'),
    bridgeHoldingDtiDescriptionEl: getEl('bridge-holding-dti-description'),
    bridgeHoldingDtiDollarBreakdownEl: getEl('bridge-holding-dti-dollar-breakdown'),
    bridgeHoldingBackendDtiRatioEl: getEl('bridge-holding-backend-dti-ratio'),
    bridgeHoldingBackendDtiBadgeEl: getEl('bridge-holding-backend-dti-badge'),
    bridgeHoldingBackendDtiProgressBarEl: getEl('bridge-holding-backend-dti-progress-bar'),
    bridgeHoldingBackendDtiDescriptionEl: getEl('bridge-holding-backend-dti-description'),
    bridgeHoldingBackendDtiDollarBreakdownEl: getEl('bridge-holding-backend-dti-dollar-breakdown'),
    
    // MLS/Rates & Bookmarklet Import Banner
    recentImportBanner: getEl('recent-import-banner'),
    recentImportAddress: getEl('recent-import-address'),
    btnApplyRecentImport: getEl('btn-apply-recent-import'),
    mlsPreviewBox: getEl('mls-preview-box'),
    mlsPreviewAddress: getEl('mls-preview-address'),
    mlsPreviewDetails: getEl('mls-preview-details'),
    ratesAttributionEl: getEl('rates-attribution'),

    // Bookmarklet Needed Modal
    bookmarkletNeededModal: getEl('bookmarklet-needed-modal'),
    btnCloseBookmarkletNeeded: getEl('btn-close-bookmarklet-needed'),
    btnOpenBookmarkletFromNeeded: getEl('btn-open-bookmarklet-from-needed'),
    btnDismissBookmarkletNeeded: getEl('btn-dismiss-bookmarklet-needed'),
    bookmarkletNeededModalMessage: getEl('bookmarklet-needed-modal-message'),

    // "Have a house to sell?" outputs
    sellLineValueEl: getEl('sell-line-value'),
    sellLinePayoffEl: getEl('sell-line-payoff'),
    sellLineCommissionEl: getEl('sell-line-commission'),
    sellLineClosingEl: getEl('sell-line-closing'),
    sellLineRepairsEl: getEl('sell-line-repairs'),
    sellLineConcessionsEl: getEl('sell-line-concessions'),
    sellLineMovingEl: getEl('sell-line-moving'),
    sellNetProceedsEl: getEl('sell-net-proceeds'),
    sellProceedsBoxEl: getEl('sell-proceeds-box'),
    sellUnderwaterWarningEl: getEl('sell-underwater-warning'),
    sellProceedsPercentValueEl: getEl('sell-proceeds-percent-value'),
    sellProceedsDollarValueEl: getEl('sell-proceeds-dollar-value'),
    sellStaleWarningEl: getEl('sell-stale-warning'),
    sellStaleWarningTextEl: getEl('sell-stale-warning-text'),

    // Bridge Loan mode outputs
    houseSaleDownPaymentLabelEl: getEl('house-sale-downpayment-label'),
    houseSaleDownPaymentTooltipEl: getEl('house-sale-downpayment-tooltip'),
    houseSaleDownPaymentBoxEl: getEl('house-sale-downpayment-box'),
    houseSaleDownPaymentPrefixEl: getEl('house-sale-downpayment-prefix'),
    bridgeCltvWarningEl: getEl('bridge-cltv-warning'),
    bridgeMonthlyInterestEl: getEl('bridge-monthly-interest'),
    bridgeNewMortgagePaymentEl: getEl('bridge-new-mortgage-payment'),
    bridgeCombinedMonthlyEl: getEl('bridge-combined-monthly'),
    bridgeHoldingDtiRatioEl: getEl('bridge-holding-dti-ratio'),
    bridgeHoldingDtiBadgeEl: getEl('bridge-holding-dti-badge'),
    bridgeHoldingDtiProgressBarEl: getEl('bridge-holding-dti-progress-bar'),
    bridgeHoldingDtiDescriptionEl: getEl('bridge-holding-dti-description'),
    bridgeHoldingDtiDollarBreakdownEl: getEl('bridge-holding-dti-dollar-breakdown'),
    bridgeHoldingBackendDtiRatioEl: getEl('bridge-holding-backend-dti-ratio'),
    bridgeHoldingBackendDtiBadgeEl: getEl('bridge-holding-backend-dti-badge'),
    bridgeHoldingBackendDtiProgressBarEl: getEl('bridge-holding-backend-dti-progress-bar'),
    bridgeHoldingBackendDtiDescriptionEl: getEl('bridge-holding-backend-dti-description'),
    bridgeHoldingBackendDtiDollarBreakdownEl: getEl('bridge-holding-backend-dti-dollar-breakdown'),
    bridgeTotalInterestEl: getEl('bridge-total-interest'),
    bridgeTotalCostEl: getEl('bridge-total-cost'),
    recastLineNetProceedsEl: getEl('recast-line-net-proceeds'),
    recastLineBridgePayoffEl: getEl('recast-line-bridge-payoff'),
    recastAvailableEl: getEl('recast-available'),
    recastLineFeeEl: getEl('recast-line-fee'),
    recastFeeRowEl: getEl('recast-fee-row'),
    recastLumpSumEl: getEl('recast-lump-sum'),
    recastLumpSumLabelEl: getEl('recast-lump-sum-label'),
    recastMinLumpWarningEl: getEl('recast-min-lump-warning'),
    recastResultHeadingEl: getEl('recast-result-heading'),
    recastRowsRecastMode: getEl('recast-rows-recast-mode'),
    recastRowsExtraMode: getEl('recast-rows-extra-mode'),
    recastCurrentPaymentEl: getEl('recast-current-payment'),
    recastNewPaymentEl: getEl('recast-new-payment'),
    recastMonthlySavingsEl: getEl('recast-monthly-savings'),
    recastNewPitiEl: getEl('recast-new-piti'),
    recastExtraCurrentPaymentEl: getEl('recast-extra-current-payment'),
    recastExtraTimeSavedEl: getEl('recast-extra-time-saved'),
    recastExtraInterestSavedEl: getEl('recast-extra-interest-saved'),
    recastTradeoffNoteEl: getEl('recast-tradeoff-note'),

    // DTI Sub-Accordion Summaries & Controls
    dtiSummaryInputs: getEl('dti-summary-inputs'),
    dtiSummaryCashflow: getEl('dti-summary-cashflow'),
    dtiSummaryRatios: getEl('dti-summary-ratios'),
    dtiHeaderCashflow: getEl('dti-header-cashflow'),
    dtiBodyCashflow: getEl('dti-body-cashflow')
  };
}

/**
 * Updates term card UI to reflect active term
 * @param {number} activeTerm - 30 or 15
 * @param {Object} domRefs - DOM element references
 */
export function updateTermCardSelection(activeTerm, domRefs) {
  if (activeTerm === 30) {
    domRefs.card30.classList.add('selected');
    domRefs.card15.classList.remove('selected');
    domRefs.activeTermLabelEl.textContent = '30-Year';
  } else {
    domRefs.card15.classList.add('selected');
    domRefs.card30.classList.remove('selected');
    domRefs.activeTermLabelEl.textContent = '15-Year';
  }
}

/**
 * Updates all calculation output displays
 * @param {Object} results - Results from performCalculations()
 * @param {number} activeTerm - 30 or 15
 * @param {Object} domRefs - DOM element references
 */
export function updateAllOutputs(results, activeTerm, domRefs) {
  const {
    monthlyTax,
    monthlyInsurance,
    monthlyPmi,
    paymentFrequency = 'monthly',
    biweeklyExtra = 0,
    
    totalMonthly30, amort30, biweeklySaved30 = 0,
    totalMonthly15, amort15, biweeklySaved15 = 0,
    monthlySaved30, totalSaved30, lumpSumSaved30,
    monthlySaved15, totalSaved15, lumpSumSaved15,
    recast30, recast15, recastStrategy = 'recast', isRecastActive = false,
    cardPhase30 = 'post', cardPhase15 = 'post'
  } = results;

  const isExtraStrat = recastStrategy === 'extraPayment';

  // 30-Year Outputs
  const isRecastActive30 = isRecastActive && recast30 && recast30.appliedLumpSum > 0;
  if (isRecastActive30) {
    if (domRefs.recastReadout30El) domRefs.recastReadout30El.style.display = 'flex';
    if (domRefs.btnRecastPhasePost30El) domRefs.btnRecastPhasePost30El.classList.toggle('active', cardPhase30 === 'post');
    if (domRefs.btnRecastPhasePre30El) domRefs.btnRecastPhasePre30El.classList.toggle('active', cardPhase30 === 'pre');

    if (!isExtraStrat) {
      const prePITI30 = totalMonthly30;
      const monthlySavings30 = recast30.monthlySavings;
      const postPITI30 = Math.max(0, totalMonthly30 - monthlySavings30);

      if (domRefs.recastTransition30El) {
        domRefs.recastTransition30El.textContent = `${formatCurrency(prePITI30)} → ${formatCurrency(postPITI30)}`;
      }

      if (cardPhase30 === 'pre') {
        domRefs.totalPayment30El.textContent = formatCurrency(prePITI30);
        domRefs.piPayment30El.textContent = formatCurrency(amort30.regularPi);
        if (domRefs.paymentLabel30El) domRefs.paymentLabel30El.textContent = 'Estimated Monthly (Pre-Recast)';
      } else {
        domRefs.totalPayment30El.textContent = formatCurrency(postPITI30);
        domRefs.piPayment30El.textContent = formatCurrency(recast30.newMonthlyPI);
        if (domRefs.paymentLabel30El) domRefs.paymentLabel30El.textContent = 'Estimated Monthly (Post-Recast)';
      }

      if (domRefs.savedRecastRow30El) {
        domRefs.savedRecastRow30El.style.display = 'flex';
        if (domRefs.savedRecastLabel30El) domRefs.savedRecastLabel30El.textContent = '↳ Saved via House Sale Recast';
        if (domRefs.savedRecastTooltip30El) domRefs.savedRecastTooltip30El.setAttribute('data-tooltip', 'Monthly payment drop and lifetime interest saved after applying house sale proceeds to recast your balance.');
        if (domRefs.savedRecastVal30El) domRefs.savedRecastVal30El.textContent = `-${formatCurrency(monthlySavings30)}/mo`;
      }
    } else {
      if (domRefs.recastTransition30El) {
        domRefs.recastTransition30El.textContent = `Lump Sum: ${formatCurrency(recast30.appliedLumpSum)}`;
      }
      domRefs.totalPayment30El.textContent = formatCurrency(totalMonthly30);
      domRefs.piPayment30El.textContent = formatCurrency(amort30.regularPi);
      if (domRefs.paymentLabel30El) domRefs.paymentLabel30El.textContent = 'Estimated Monthly';

      if (domRefs.savedRecastRow30El) {
        domRefs.savedRecastRow30El.style.display = 'flex';
        if (domRefs.savedRecastLabel30El) domRefs.savedRecastLabel30El.textContent = '↳ Extra Saved via House Sale Lump Sum';
        if (domRefs.savedRecastTooltip30El) domRefs.savedRecastTooltip30El.setAttribute('data-tooltip', 'Lifetime interest avoided by applying house sale proceeds directly to loan principal.');
        if (domRefs.savedRecastVal30El) domRefs.savedRecastVal30El.textContent = formatCurrency(recast30.extraLifetimeInterestFromRecasting);
      }
    }
  } else {
    if (domRefs.recastReadout30El) domRefs.recastReadout30El.style.display = 'none';
    if (domRefs.savedRecastRow30El) domRefs.savedRecastRow30El.style.display = 'none';
    if (domRefs.paymentLabel30El) domRefs.paymentLabel30El.textContent = 'Estimated Monthly';
    domRefs.totalPayment30El.textContent = formatCurrency(totalMonthly30);
    domRefs.piPayment30El.textContent = formatCurrency(amort30.regularPi);
  }

  domRefs.lifetimeInterest30El.textContent = formatCurrency(amort30.totalInterest);

  if (paymentFrequency === 'biweekly' || paymentFrequency === 'accelerated') {
    const bwPerPeriod30 = amort30.biweeklyPi + (biweeklyExtra || 0);
    if (domRefs.biweeklyReadout30) {
      domRefs.biweeklyReadout30.style.display = 'flex';
      domRefs.biweeklyPayment30El.textContent = `${formatCurrency(bwPerPeriod30)} / 2 wks`;
      domRefs.biweeklyBadge30El.textContent = paymentFrequency === 'accelerated' ? '⚡ Accelerated' : 'Standard 26x';
    }
  } else {
    if (domRefs.biweeklyReadout30) domRefs.biweeklyReadout30.style.display = 'none';
  }

  if (totalSaved30 > 0.01 || isRecastActive30) {
    if (totalSaved30 > 0.01) {
      domRefs.interestSavings30El.textContent = `Total Saved ${formatCurrency(totalSaved30)}`;
      domRefs.interestSavings30El.style.display = 'block';
    } else {
      domRefs.interestSavings30El.style.display = 'none';
    }
    const advSavings = getElement('advanced-savings-30');
    if (advSavings) {
      advSavings.style.display = 'flex';
      getElement('saved-monthly-val-30').textContent = formatCurrency(monthlySaved30);
      getElement('saved-lump-val-30').textContent = formatCurrency(lumpSumSaved30);
      
      if (biweeklySaved30 > 0.01 && domRefs.savedBiweeklyRow30El) {
        domRefs.savedBiweeklyRow30El.style.display = 'flex';
        domRefs.savedBiweeklyVal30El.textContent = formatCurrency(biweeklySaved30);
      } else if (domRefs.savedBiweeklyRow30El) {
        domRefs.savedBiweeklyRow30El.style.display = 'none';
      }

      getElement('total-injected-30').textContent = formatCurrency(
        (amort30.totalExtraMonthly || 0) + (amort30.totalBiweeklyExtra || 0) + (amort30.totalLumpsum || 0)
      );
    }
  } else {
    domRefs.interestSavings30El.style.display = 'none';
    const advSavings = getElement('advanced-savings-30');
    if (advSavings) advSavings.style.display = 'none';
  }

  const effectiveMonthsSaved30 = isRecastActive30 && isExtraStrat
    ? Math.max(amort30.monthsSaved, Math.round(recast30.monthsLaterPayoffFromRecasting))
    : amort30.monthsSaved;
  if (effectiveMonthsSaved30 > 0) {
    domRefs.timeSaved30El.textContent = formatTimeSaved(effectiveMonthsSaved30);
    domRefs.timeSavedRow30El.style.display = 'flex';
  } else {
    domRefs.timeSavedRow30El.style.display = 'none';
  }

  // 15-Year Outputs
  const isRecastActive15 = isRecastActive && recast15 && recast15.appliedLumpSum > 0;
  if (isRecastActive15) {
    if (domRefs.recastReadout15El) domRefs.recastReadout15El.style.display = 'flex';
    if (domRefs.btnRecastPhasePost15El) domRefs.btnRecastPhasePost15El.classList.toggle('active', cardPhase15 === 'post');
    if (domRefs.btnRecastPhasePre15El) domRefs.btnRecastPhasePre15El.classList.toggle('active', cardPhase15 === 'pre');

    if (!isExtraStrat) {
      const prePITI15 = totalMonthly15;
      const monthlySavings15 = recast15.monthlySavings;
      const postPITI15 = Math.max(0, totalMonthly15 - monthlySavings15);

      if (domRefs.recastTransition15El) {
        domRefs.recastTransition15El.textContent = `${formatCurrency(prePITI15)} → ${formatCurrency(postPITI15)}`;
      }

      if (cardPhase15 === 'pre') {
        domRefs.totalPayment15El.textContent = formatCurrency(prePITI15);
        domRefs.piPayment15El.textContent = formatCurrency(amort15.regularPi);
        if (domRefs.paymentLabel15El) domRefs.paymentLabel15El.textContent = 'Estimated Monthly (Pre-Recast)';
      } else {
        domRefs.totalPayment15El.textContent = formatCurrency(postPITI15);
        domRefs.piPayment15El.textContent = formatCurrency(recast15.newMonthlyPI);
        if (domRefs.paymentLabel15El) domRefs.paymentLabel15El.textContent = 'Estimated Monthly (Post-Recast)';
      }

      if (domRefs.savedRecastRow15El) {
        domRefs.savedRecastRow15El.style.display = 'flex';
        if (domRefs.savedRecastLabel15El) domRefs.savedRecastLabel15El.textContent = '↳ Saved via House Sale Recast';
        if (domRefs.savedRecastTooltip15El) domRefs.savedRecastTooltip15El.setAttribute('data-tooltip', 'Monthly payment drop and lifetime interest saved after applying house sale proceeds to recast your balance.');
        if (domRefs.savedRecastVal15El) domRefs.savedRecastVal15El.textContent = `-${formatCurrency(monthlySavings15)}/mo`;
      }
    } else {
      if (domRefs.recastTransition15El) {
        domRefs.recastTransition15El.textContent = `Lump Sum: ${formatCurrency(recast15.appliedLumpSum)}`;
      }
      domRefs.totalPayment15El.textContent = formatCurrency(totalMonthly15);
      domRefs.piPayment15El.textContent = formatCurrency(amort15.regularPi);
      if (domRefs.paymentLabel15El) domRefs.paymentLabel15El.textContent = 'Estimated Monthly';

      if (domRefs.savedRecastRow15El) {
        domRefs.savedRecastRow15El.style.display = 'flex';
        if (domRefs.savedRecastLabel15El) domRefs.savedRecastLabel15El.textContent = '↳ Extra Saved via House Sale Lump Sum';
        if (domRefs.savedRecastTooltip15El) domRefs.savedRecastTooltip15El.setAttribute('data-tooltip', 'Lifetime interest avoided by applying house sale proceeds directly to loan principal.');
        if (domRefs.savedRecastVal15El) domRefs.savedRecastVal15El.textContent = formatCurrency(recast15.extraLifetimeInterestFromRecasting);
      }
    }
  } else {
    if (domRefs.recastReadout15El) domRefs.recastReadout15El.style.display = 'none';
    if (domRefs.savedRecastRow15El) domRefs.savedRecastRow15El.style.display = 'none';
    if (domRefs.paymentLabel15El) domRefs.paymentLabel15El.textContent = 'Estimated Monthly';
    domRefs.totalPayment15El.textContent = formatCurrency(totalMonthly15);
    domRefs.piPayment15El.textContent = formatCurrency(amort15.regularPi);
  }

  domRefs.lifetimeInterest15El.textContent = formatCurrency(amort15.totalInterest);

  if (paymentFrequency === 'biweekly' || paymentFrequency === 'accelerated') {
    const bwPerPeriod15 = amort15.biweeklyPi + (biweeklyExtra || 0);
    if (domRefs.biweeklyReadout15) {
      domRefs.biweeklyReadout15.style.display = 'flex';
      domRefs.biweeklyPayment15El.textContent = `${formatCurrency(bwPerPeriod15)} / 2 wks`;
      domRefs.biweeklyBadge15El.textContent = paymentFrequency === 'accelerated' ? '⚡ Accelerated' : 'Standard 26x';
    }
  } else {
    if (domRefs.biweeklyReadout15) domRefs.biweeklyReadout15.style.display = 'none';
  }

  if (totalSaved15 > 0.01 || isRecastActive15) {
    if (totalSaved15 > 0.01) {
      domRefs.interestSavings15El.textContent = `Total Saved ${formatCurrency(totalSaved15)}`;
      domRefs.interestSavings15El.style.display = 'block';
    } else {
      domRefs.interestSavings15El.style.display = 'none';
    }
    const advSavings = getElement('advanced-savings-15');
    if (advSavings) {
      advSavings.style.display = 'flex';
      getElement('saved-monthly-val-15').textContent = formatCurrency(monthlySaved15);
      getElement('saved-lump-val-15').textContent = formatCurrency(lumpSumSaved15);
      
      if (biweeklySaved15 > 0.01 && domRefs.savedBiweeklyRow15El) {
        domRefs.savedBiweeklyRow15El.style.display = 'flex';
        domRefs.savedBiweeklyVal15El.textContent = formatCurrency(biweeklySaved15);
      } else if (domRefs.savedBiweeklyRow15El) {
        domRefs.savedBiweeklyRow15El.style.display = 'none';
      }

      getElement('total-injected-15').textContent = formatCurrency(
        (amort15.totalExtraMonthly || 0) + (amort15.totalBiweeklyExtra || 0) + (amort15.totalLumpsum || 0)
      );
    }
  } else {
    domRefs.interestSavings15El.style.display = 'none';
    const advSavings = getElement('advanced-savings-15');
    if (advSavings) advSavings.style.display = 'none';
  }

  const effectiveMonthsSaved15 = isRecastActive15 && isExtraStrat
    ? Math.max(amort15.monthsSaved, Math.round(recast15.monthsLaterPayoffFromRecasting))
    : amort15.monthsSaved;
  if (effectiveMonthsSaved15 > 0) {
    domRefs.timeSaved15El.textContent = formatTimeSaved(effectiveMonthsSaved15);
    domRefs.timeSavedRow15El.style.display = 'flex';
  } else {
    domRefs.timeSavedRow15El.style.display = 'none';
  }

  // Active term display
  const activeTotal = activeTerm === 30 ? results.totalMonthly30 : results.totalMonthly15;
  const activePI = activeTerm === 30 ? amort30.regularPi : amort15.regularPi;

  domRefs.chartTotalValEl.textContent = formatCurrency(activeTotal);
  domRefs.legendPiEl.textContent = formatCurrency(activePI);
  domRefs.legendTaxEl.textContent = formatCurrency(monthlyTax);
  domRefs.legendInsEl.textContent = formatCurrency(monthlyInsurance);

  // Toggle PMI/HOA legends
  if (monthlyPmi > 0) {
    domRefs.legendPmiEl.textContent = formatCurrency(monthlyPmi);
    domRefs.pmiLegendItem.style.display = 'flex';
  } else {
    domRefs.pmiLegendItem.style.display = 'none';
  }

  if (results.hoaFees > 0) {
    domRefs.legendHoaEl.textContent = formatCurrency(results.hoaFees);
    domRefs.hoaLegendItem.style.display = 'flex';
  } else {
    domRefs.hoaLegendItem.style.display = 'none';
  }

  // Draw charts
  drawDonutChart(activePI, monthlyTax, monthlyInsurance, monthlyPmi, results.hoaFees, activeTotal, domRefs);
  
  const activeBankTotal = activeTerm === 30 ? results.bankMonthlyTotal30 : results.bankMonthlyTotal15;
  const activeEffectiveTotal = activeTerm === 30 ? results.effectiveMonthlyTotal30 : results.effectiveMonthlyTotal15;
  const activeExtraOutlay = activeTerm === 30 ? results.extraMonthlyOutlay30 : results.extraMonthlyOutlay15;

  updateAffordability(
    activeBankTotal,
    activeEffectiveTotal,
    activeExtraOutlay,
    results.effectiveMonthlyIncome,
    domRefs,
    results.isNetIncomeBasis
  );

  // Update payment schedule frequency explanation callout
  updateFrequencyExplanationUI(paymentFrequency, domRefs);

  // Draw amortization charts
  drawBurndownChart('burndown-svg-30', amort30, results.baseline30, results.homePrice);
  drawBurndownChart('burndown-svg-15', amort15, results.baseline15, results.homePrice);
}

/**
 * Updates the explanation callout under the Payment Schedule & Frequency toggle
 * @param {'monthly'|'biweekly'|'accelerated'} paymentFrequency
 * @param {Object} domRefs
 */
export function updateFrequencyExplanationUI(paymentFrequency, domRefs) {
  if (!domRefs.freqExplanationBox) return;

  if (paymentFrequency === 'biweekly') {
    domRefs.freqExplanationBox.innerHTML = `
      <div style="color: var(--accent-cyan); font-weight: 600; font-family: var(--font-display); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.2rem;">📅 Standard Biweekly (26 payments/yr)</div>
      <div>Makes <strong>26 payments a year</strong> (every 2 weeks). Each payment equals <strong>(Monthly × 12) ÷ 26</strong>. Total paid per year equals 12 standard monthly payments.</div>
    `;
  } else if (paymentFrequency === 'accelerated') {
    domRefs.freqExplanationBox.innerHTML = `
      <div style="color: var(--accent-emerald); font-weight: 600; font-family: var(--font-display); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.2rem;">⚡ Accelerated Biweekly (26 payments/yr)</div>
      <div>Makes <strong>26 payments a year</strong> (every 2 weeks). Each payment equals <strong>half your monthly bill (Monthly ÷ 2)</strong>. Because there are 26 biweekly periods, you pay <strong>13 full monthly payments per year</strong> (1 extra payment/yr applied straight to principal).</div>
    `;
  } else {
    domRefs.freqExplanationBox.innerHTML = `
      <div style="color: var(--text-bright); font-weight: 600; font-family: var(--font-display); font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 0.2rem;">🗓️ Standard Monthly (12 payments/yr)</div>
      <div>Makes <strong>12 standard monthly payments per year</strong>. Each payment covers required Principal & Interest plus escrow fees.</div>
    `;
  }
}

/**
 * Draws donut chart for monthly payment breakdown
 * @param {number} pi - Principal & interest
 * @param {number} tax - Property tax
 * @param {number} insurance - Home insurance
 * @param {number} pmi - PMI
 * @param {number} hoa - HOA fees
 * @param {number} total - Total monthly payment
 * @param {Object} domRefs - DOM element references
 */
export function drawDonutChart(pi, tax, insurance, pmi, hoa, total, domRefs) {
  if (total <= 0) {
    domRefs.segmentPi.style.strokeDasharray = `0 ${CONFIG.DONUT_CIRCUMFERENCE}`;
    domRefs.segmentTax.style.strokeDasharray = `0 ${CONFIG.DONUT_CIRCUMFERENCE}`;
    domRefs.segmentIns.style.strokeDasharray = `0 ${CONFIG.DONUT_CIRCUMFERENCE}`;
    domRefs.segmentPmi.style.strokeDasharray = `0 ${CONFIG.DONUT_CIRCUMFERENCE}`;
    domRefs.segmentHoa.style.strokeDasharray = `0 ${CONFIG.DONUT_CIRCUMFERENCE}`;
    return;
  }

  const segments = [
    { el: domRefs.segmentPi, value: pi },
    { el: domRefs.segmentTax, value: tax },
    { el: domRefs.segmentIns, value: insurance },
    { el: domRefs.segmentPmi, value: pmi },
    { el: domRefs.segmentHoa, value: hoa }
  ];

  let accumulatedOffset = 0;
  segments.forEach(seg => {
    const percentage = seg.value / total;
    const strokeVal = percentage * CONFIG.DONUT_CIRCUMFERENCE;
    seg.el.style.strokeDasharray = `${strokeVal} ${CONFIG.DONUT_CIRCUMFERENCE}`;
    seg.el.style.strokeDashoffset = -accumulatedOffset;
    accumulatedOffset += strokeVal;
  });
}

/**
 * Colors a DTI switcher pill (bank/backend/effective/holding/holding-backend)
 * by that metric's own health status, independent of whether it's the
 * currently-selected tab — so at a glance you can see which metrics are
 * healthy/moderate/high without clicking through each one. The active tab
 * keeps its cyan "selected" styling on top (see .dti-tab-btn.active in CSS,
 * which is scoped to override this for the active pill specifically).
 * @param {'bank'|'backend'|'effective'|'holding'|'holding-backend'} tabKey
 * @param {'bg-healthy'|'bg-moderate'|'bg-high'|null} statusClassName
 */
function setDtiTabStatus(tabKey, statusClassName) {
  const btn = document.querySelector(`.dti-tab-btn[data-dti-tab="${tabKey}"]`);
  if (!btn) return;
  btn.classList.remove('bg-healthy', 'bg-moderate', 'bg-high');
  if (statusClassName) btn.classList.add(statusClassName);
}

/**
 * Formats the dollar figures behind a DTI percentage — "$X,XXX.XX/mo ÷
 * $X,XXX.XX/mo income" — so the ratio's actual inputs are visible next to
 * the percentage, not just the computed number on its own.
 * @param {number} monthlyCost - The numerator (whatever monthly cost feeds this specific ratio)
 * @param {number} grossMonthlyIncome - The denominator (gross OR estimated net, depending on the income-basis toggle)
 * @param {boolean} [isNetIncome] - True when the denominator is the Net (Best Guess) estimate, not gross
 * @returns {string}
 */
function formatDtiDollarBreakdown(monthlyCost, grossMonthlyIncome, isNetIncome) {
  const incomeLabel = isNetIncome ? 'est. take-home' : 'income';
  return `${formatCurrency(monthlyCost)}/mo ÷ ${formatCurrency(grossMonthlyIncome)}/mo ${incomeLabel}`;
}

/**
 * Short clarifying note appended to a DTI panel's description when it's
 * being measured against the Net (Best Guess) estimate instead of gross
 * income — so it's never mistaken for what a lender would actually compute.
 * @param {boolean} isNetIncome
 * @returns {string}
 */
function netIncomeCaveat(isNetIncome) {
  return isNetIncome
    ? ' Shown against your estimated net take-home pay (national-average assumptions) — lenders still qualify you using gross income.'
    : '';
}

/**
 * Toggles the active/inactive styling on the Gross/Net income-basis pills.
 * Pure presentation — app.js owns which basis is actually in effect.
 * @param {boolean} isNetIncome
 * @param {Object} domRefs
 */
export function setIncomeBasisToggleUI(isNetIncome, domRefs) {
  if (domRefs.btnIncomeBasisGross) domRefs.btnIncomeBasisGross.classList.toggle('active', !isNetIncome);
  if (domRefs.btnIncomeBasisNet) domRefs.btnIncomeBasisNet.classList.toggle('active', isNetIncome);
  if (domRefs.incomeBasisAdjustWrap) domRefs.incomeBasisAdjustWrap.style.display = isNetIncome ? 'block' : 'none';

  const cashFlowGroup = document.getElementById('dti-group-cashflow');
  if (cashFlowGroup) {
    cashFlowGroup.style.display = isNetIncome ? 'block' : 'none';
  }
}

const PAY_FREQUENCY_HELP_LABELS = {
  [CONFIG.PAY_FREQUENCY_BIWEEKLY]: 'biweekly paycheck (26/year)',
  [CONFIG.PAY_FREQUENCY_SEMIMONTHLY]: 'semi-monthly paycheck (24/year)',
  [CONFIG.PAY_FREQUENCY_MONTHLY]: 'monthly paycheck (12/year)'
};

/**
 * Toggles the active/inactive styling on the Biweekly/Semi-Monthly/Monthly
 * pay-frequency pills, and updates the help text under the per-paycheck
 * dollar field to name which frequency it's currently expressed in.
 * @param {'biweekly'|'semiMonthly'|'monthly'} payFrequency
 * @param {Object} domRefs
 */
export function setPayFrequencyToggleUI(payFrequency, domRefs) {
  if (domRefs.btnPayFreqBiweekly) domRefs.btnPayFreqBiweekly.classList.toggle('active', payFrequency === CONFIG.PAY_FREQUENCY_BIWEEKLY);
  if (domRefs.btnPayFreqSemiMonthly) domRefs.btnPayFreqSemiMonthly.classList.toggle('active', payFrequency === CONFIG.PAY_FREQUENCY_SEMIMONTHLY);
  if (domRefs.btnPayFreqMonthly) domRefs.btnPayFreqMonthly.classList.toggle('active', payFrequency === CONFIG.PAY_FREQUENCY_MONTHLY);
  if (domRefs.incomeBasisPaycheckHelpEl) {
    const label = PAY_FREQUENCY_HELP_LABELS[payFrequency] || PAY_FREQUENCY_HELP_LABELS[CONFIG.PAY_FREQUENCY_MONTHLY];
    domRefs.incomeBasisPaycheckHelpEl.textContent = `Take-home per ${label}`;
  }
}

/**
 * Sets the fine-tune slider's bounds and mirrors its current value into
 * both the range input and the paired number field — called whenever the
 * calibration state, pay frequency, or gross income changes, since the
 * slider's bounds/value are always expressed in per-paycheck dollars for
 * whichever frequency is currently selected.
 * @param {Object} domRefs
 * @param {{valuePerPaycheck:number, minPerPaycheck:number, maxPerPaycheck:number, step:number}} bounds
 */
export function configureIncomeBasisAdjustSlider(domRefs, { valuePerPaycheck, minPerPaycheck, maxPerPaycheck, step }) {
  const rounded = Math.max(0, Math.round(valuePerPaycheck));
  const min = Math.max(0, Math.round(minPerPaycheck));
  const max = Math.round(Math.max(maxPerPaycheck, minPerPaycheck + step));

  if (domRefs.incomeBasisAdjustSlider) {
    domRefs.incomeBasisAdjustSlider.min = min;
    domRefs.incomeBasisAdjustSlider.max = max;
    domRefs.incomeBasisAdjustSlider.step = step;
    domRefs.incomeBasisAdjustSlider.value = rounded;
  }
  if (domRefs.incomeBasisPaycheckAmountInput) {
    domRefs.incomeBasisPaycheckAmountInput.value = rounded;
  }
}

/**
 * Updates the small "Best Guess" / "Conservative (−$X/mo)" / "Liberal
 * (+$X/mo)" label centered under the fine-tune slider.
 * @param {boolean} hasOverride - False when the control is still tracking the live Best Guess estimate
 * @param {number} deltaMonthly - Calibrated monthly take-home minus the Best Guess monthly take-home
 * @param {Object} domRefs
 */
export function updateIncomeBasisAdjustLabelUI(hasOverride, deltaMonthly, domRefs) {
  if (!domRefs.incomeBasisAdjustValueEl) return;

  if (!hasOverride || Math.abs(deltaMonthly) < 0.5) {
    domRefs.incomeBasisAdjustValueEl.textContent = 'Best Guess';
    return;
  }

  const direction = deltaMonthly > 0 ? 'Liberal' : 'Conservative';
  const sign = deltaMonthly > 0 ? '+' : '−';
  domRefs.incomeBasisAdjustValueEl.textContent = `${direction} (${sign}${formatCurrency(Math.abs(deltaMonthly))}/mo)`;
}

/**
 * Shows/hides and fills the small breakdown line under the Gross/Net
 * income-basis toggle (and its fine-tune control). Only meaningful in Net
 * (Best Guess) mode — spells out the estimated take-home figure now
 * feeding every DTI panel below, so the adjustment isn't invisible/mysterious.
 * @param {boolean} isNetIncome
 * @param {Object|null} netEstimate - Return value of calculator.js's estimateNetAnnualIncome(), recomputed against the calibrated figure when overridden; null when not in Net mode
 * @param {Object} domRefs
 * @param {boolean} [hasOverride] - True once the user has calibrated a real paycheck figure, rather than using the unmodified Best Guess
 */
export function updateIncomeBasisBreakdownUI(isNetIncome, netEstimate, domRefs, hasOverride) {
  if (!domRefs.incomeBasisBreakdownEl) return;

  if (!isNetIncome || !netEstimate) {
    domRefs.incomeBasisBreakdownEl.style.display = 'none';
    return;
  }

  const netMonthly = netEstimate.netAnnualIncome / CONFIG.MONTHS_PER_YEAR;
  const deductionsMonthly = netEstimate.totalDeductions / CONFIG.MONTHS_PER_YEAR;
  const sourceNote = hasOverride
    ? ', based on the paycheck figure you entered'
    : ', a national-average estimate — fine-tune it below to match your real paycheck';

  domRefs.incomeBasisBreakdownEl.style.display = 'block';
  domRefs.incomeBasisBreakdownEl.textContent =
    `Est. take-home: ${formatCurrency(netMonthly)}/mo (−${formatCurrency(deductionsMonthly)}/mo est. federal tax, FICA & state tax — ~${netEstimate.effectiveDeductionRate.toFixed(1)}% of gross${sourceNote}. Not tax advice — the pills below now reflect this figure instead of gross income.)`;
}

/**
 * Updates DTI (Debt-to-Income) affordability display for both Bank Qualifying DTI and Effective DTI
 * @param {number} bankMonthlyCost - Mandatory baseline monthly housing cost for bank loan qualification
 * @param {number} effectiveMonthlyCost - Total effective monthly housing cost including extra payments
 * @param {number} extraMonthlyOutlay - Total extra monthly out-of-pocket payment
 * @param {number} grossMonthlyIncome - Monthly income used as the DTI denominator (gross OR net estimate)
 * @param {Object} domRefs - DOM element references
 * @param {boolean} [isNetIncome] - True when grossMonthlyIncome is the Net (Best Guess) estimate
 */
export function updateAffordability(bankMonthlyCost, effectiveMonthlyCost, extraMonthlyOutlay, grossMonthlyIncome, domRefs, isNetIncome) {
  if (grossMonthlyIncome <= 0) return;

  const bankDti = (bankMonthlyCost / grossMonthlyIncome) * 100;
  const effectiveDti = (effectiveMonthlyCost / grossMonthlyIncome) * 100;
  const bankStatus = getDTIStatus(bankDti, isNetIncome);

  // 1. Bank Qualifying / Housing DTI
  if (domRefs.dtiRatioEl) domRefs.dtiRatioEl.textContent = `${bankDti.toFixed(1)}%`;
  if (domRefs.dtiProgressBar) {
    domRefs.dtiProgressBar.style.width = `${Math.min(bankDti, 100)}%`;
    domRefs.dtiProgressBar.className = 'progress-bar';
    domRefs.dtiProgressBar.classList.add(bankStatus.className);
  }
  if (domRefs.dtiStatusBadge) {
    domRefs.dtiStatusBadge.className = 'badge-dti';
    domRefs.dtiStatusBadge.textContent = bankStatus.label;
    domRefs.dtiStatusBadge.classList.add(bankStatus.className);
  }
  if (domRefs.dtiDescriptionEl) {
    domRefs.dtiDescriptionEl.textContent = bankStatus.description + netIncomeCaveat(isNetIncome);
  }
  if (domRefs.dtiDollarBreakdownEl) {
    domRefs.dtiDollarBreakdownEl.textContent = formatDtiDollarBreakdown(bankMonthlyCost, grossMonthlyIncome, isNetIncome);
  }
  setDtiTabStatus('bank', bankStatus.className);

  // 2. Effective DTI (With Extra Payments)
  const delta = effectiveDti - bankDti;
  if (domRefs.effectiveDtiRatioEl) {
    domRefs.effectiveDtiRatioEl.textContent = `${effectiveDti.toFixed(1)}%`;
  }
  
  if (domRefs.effectiveDtiProgressBar) {
    domRefs.effectiveDtiProgressBar.style.width = `${Math.min(effectiveDti, 100)}%`;
    domRefs.effectiveDtiProgressBar.className = 'progress-bar effective-bar';
    const healthyMax = isNetIncome ? (CONFIG.DTI_NET_HEALTHY_MAX || 33) : CONFIG.DTI_HEALTHY_MAX;
    const moderateMax = isNetIncome ? (CONFIG.DTI_NET_MODERATE_MAX || 40) : CONFIG.DTI_MODERATE_MAX;
    let effClass = 'bg-healthy';
    if (effectiveDti > moderateMax) effClass = 'bg-high';
    else if (effectiveDti > healthyMax) effClass = 'bg-moderate';
    domRefs.effectiveDtiProgressBar.classList.add(effClass);
    setDtiTabStatus('effective', effClass);
  }

  if (domRefs.effectiveDtiDeltaBadge) {
    if (extraMonthlyOutlay > 0.01) {
      domRefs.effectiveDtiDeltaBadge.textContent = `+${delta.toFixed(1)}% change`;
      domRefs.effectiveDtiDeltaBadge.className = 'badge-dti-delta active';
    } else {
      domRefs.effectiveDtiDeltaBadge.textContent = `0.0% change`;
      domRefs.effectiveDtiDeltaBadge.className = 'badge-dti-delta neutral';
    }
  }

  if (domRefs.effectiveDtiDescriptionEl) {
    if (extraMonthlyOutlay > 0.01) {
      domRefs.effectiveDtiDescriptionEl.textContent = `Taking into account your extra payments (+${formatCurrency(extraMonthlyOutlay)}/mo out-of-pocket), your actual household income committed to housing is ${effectiveDti.toFixed(1)}% (+${delta.toFixed(1)}% above base housing DTI).${netIncomeCaveat(isNetIncome)}`;
    } else {
      domRefs.effectiveDtiDescriptionEl.textContent = `You currently have no extra payments configured. Your effective DTI matches your base housing DTI at ${bankDti.toFixed(1)}%.${netIncomeCaveat(isNetIncome)}`;
    }
  }

  if (domRefs.effectiveDtiDollarBreakdownEl) {
    domRefs.effectiveDtiDollarBreakdownEl.textContent = formatDtiDollarBreakdown(effectiveMonthlyCost, grossMonthlyIncome, isNetIncome);
  }
}

/**
 * Toggles active styling and visibility of the Bridge DTI Phase Toggle bar (Carrying Both vs After Recast)
 * @param {'holding'|'recast'} bridgePhase
 * @param {boolean} isBridgeMode
 * @param {Object} domRefs
 */
export function setBridgeDtiPhaseToggleUI(bridgePhase, isBridgeMode, domRefs) {
  if (domRefs.bridgeDtiPhaseToggle) {
    domRefs.bridgeDtiPhaseToggle.style.display = isBridgeMode ? 'block' : 'none';
  }
  if (domRefs.btnBridgePhaseHolding) {
    domRefs.btnBridgePhaseHolding.classList.toggle('active', bridgePhase === 'holding');
  }
  if (domRefs.btnBridgePhaseRecast) {
    domRefs.btnBridgePhaseRecast.classList.toggle('active', bridgePhase === 'recast');
  }
}

/**
 * Dynamic tab titles based on active income basis (Gross vs Net) and Bridge Loan phase
 * @param {boolean} isNetIncome
 * @param {Object} domRefs
 * @param {{isBridge: boolean, bridgePhase: 'holding'|'recast'}|null} [bridgePhaseInfo]
 */
export function updateDtiTabLabels(isNetIncome, domRefs, bridgePhaseInfo = null) {
  const isBridge = bridgePhaseInfo && bridgePhaseInfo.isBridge;
  const isHolding = isBridge && bridgePhaseInfo.bridgePhase === 'holding';
  const isRecast = isBridge && bridgePhaseInfo.bridgePhase === 'recast';

  const titleSuffix = isHolding ? ' (Carrying Both)' : '';

  if (domRefs.dtiTabBtnBank) {
    domRefs.dtiTabBtnBank.textContent = isNetIncome ? 'Housing %' : 'Housing DTI (Front-End)';
  }
  if (domRefs.dtiTabBtnBackend) {
    domRefs.dtiTabBtnBackend.textContent = isNetIncome ? 'Total Debts %' : 'Total Debt DTI (Back-End)';
  }
  if (domRefs.dtiTabBtnEffective) {
    domRefs.dtiTabBtnEffective.textContent = isNetIncome ? 'Total w/ Extras' : 'Effective DTI (w/ Extras)';
  }

  if (domRefs.dtiTitleBank) {
    domRefs.dtiTitleBank.textContent = isNetIncome
      ? `Housing Payment (% of Net Pay)${titleSuffix}`
      : `Housing DTI (Front-End)${titleSuffix}`;
  }
  if (domRefs.dtiTitleBackend) {
    domRefs.dtiTitleBackend.textContent = isNetIncome
      ? `Total Debt Commitment (% of Net Pay)${titleSuffix}`
      : `Total Debt DTI (Back-End)${titleSuffix}`;
  }
  if (domRefs.dtiTitleEffective) {
    domRefs.dtiTitleEffective.textContent = isNetIncome
      ? `Total Housing Commitment w/ Extras (% of Net Pay)${titleSuffix}`
      : `Effective DTI (w/ Extras)${titleSuffix}`;
  }

  if (domRefs.dtiTooltipBank) {
    const contextNote = isHolding
      ? ' Includes combined monthly carrying costs (bridge loan interest-only + new mortgage).'
      : isRecast
      ? ' Evaluated after applying net sale proceeds to recast the new mortgage payment.'
      : '';
    const bankTip = isNetIncome
      ? `Percentage of your net take-home paycheck committed to mandatory housing costs.${contextNote}`
      : `The baseline debt-to-income ratio mortgage lenders use to evaluate and approve your loan.${contextNote}`;
    domRefs.dtiTooltipBank.setAttribute('data-tooltip', bankTip);
  }

  if (domRefs.dtiTooltipBackend) {
    const contextNote = isHolding
      ? ' Includes combined carrying costs plus your other monthly debts.'
      : isRecast
      ? ' Evaluated after recast lower mortgage payment plus your other monthly debts.'
      : '';
    const backendTip = isNetIncome
      ? `Mandatory housing payment PLUS your other monthly debts against net take-home pay.${contextNote}`
      : `Housing payment PLUS your other monthly debts against gross income.${contextNote}`;
    domRefs.dtiTooltipBackend.setAttribute('data-tooltip', backendTip);
  }

  if (domRefs.dtiTooltipEffective) {
    const effectiveTip = isNetIncome
      ? 'Your net income percentage committed to housing when adding optional extra principal, biweekly schedule extras, and lump sum payments.'
      : 'Your true monthly gross income percentage committed to housing when adding optional extra principal, biweekly schedule extras, and lump sum payments.';
    domRefs.dtiTooltipEffective.setAttribute('data-tooltip', effectiveTip);
  }
}

/**
 * Updates marker thresholds on the progress bars for Gross vs Net view
 * @param {boolean} isNetIncome
 * @param {Object} domRefs
 */
export function updateDtiMarkers(isNetIncome, domRefs) {
  const frontM1 = isNetIncome ? '33%' : '28%';
  const frontM2 = isNetIncome ? '40%' : '36%';
  const backM1 = isNetIncome ? '45%' : '36%';
  const backM2 = isNetIncome ? '55%' : '45%';

  if (domRefs.dtiProgressMarkersBank) {
    const m1 = domRefs.dtiProgressMarkersBank.querySelector('.marker-m1');
    const m2 = domRefs.dtiProgressMarkersBank.querySelector('.marker-m2');
    if (m1) { m1.style.left = frontM1; m1.textContent = frontM1; }
    if (m2) { m2.style.left = frontM2; m2.textContent = frontM2; }
  }

  if (domRefs.dtiProgressMarkersBackend) {
    const m1 = domRefs.dtiProgressMarkersBackend.querySelector('.marker-m1');
    const m2 = domRefs.dtiProgressMarkersBackend.querySelector('.marker-m2');
    if (m1) { m1.style.left = backM1; m1.textContent = backM1; }
    if (m2) { m2.style.left = backM2; m2.textContent = backM2; }
  }

  if (domRefs.dtiProgressMarkersEffective) {
    const m1 = domRefs.dtiProgressMarkersEffective.querySelector('.marker-m1');
    const m2 = domRefs.dtiProgressMarkersEffective.querySelector('.marker-m2');
    if (m1) { m1.style.left = frontM1; m1.textContent = frontM1; }
    if (m2) { m2.style.left = frontM2; m2.textContent = frontM2; }
  }
}

/**
 * Renders the Residual Monthly Cash Flow Banner (Net Mode Only).
 * Supports standard single-stage view as well as Bridge Loan multi-stage view (Holding vs Post-Recast).
 * @param {number} netMonthlyIncome
 * @param {number} monthlyHousingCost
 * @param {number} otherMonthlyDebts
 * @param {Object} domRefs
 * @param {boolean} isNetIncome
 * @param {Object|null} [bridgeData] - Optional bridge loan details { isBridge: true, holdingHousingCost: number, recastHousingCost: number, monthlySavings: number }
 */
export function updateResidualCashFlowUI(netMonthlyIncome, monthlyHousingCost, otherMonthlyDebts, domRefs, isNetIncome, bridgeData = null) {
  if (!domRefs.residualCashFlowBanner) return;

  if (!isNetIncome || netMonthlyIncome <= 0) {
    domRefs.residualCashFlowBanner.style.display = 'none';
    return;
  }

  domRefs.residualCashFlowBanner.style.display = 'block';

  const isBridgeActive = bridgeData && bridgeData.isBridge;

  if (domRefs.residualCashFlowStandardBox) {
    domRefs.residualCashFlowStandardBox.style.display = isBridgeActive ? 'none' : 'flex';
  }
  if (domRefs.residualCashFlowBridgeBox) {
    domRefs.residualCashFlowBridgeBox.style.display = isBridgeActive ? 'flex' : 'none';
  }

  if (!isBridgeActive) {
    // Single-home standard view
    const totalObligations = monthlyHousingCost + Math.max(0, otherMonthlyDebts || 0);
    const residualAmount = netMonthlyIncome - totalObligations;
    const residualPercent = (residualAmount / netMonthlyIncome) * 100;

    const formattedResidual = formatSignedCurrency(residualAmount);
    const sign = residualAmount >= 0 ? '+' : '';

    if (domRefs.residualCashFlowAmount) {
      domRefs.residualCashFlowAmount.textContent = `${formatSignedCurrency(residualAmount)} / mo`;
      domRefs.residualCashFlowAmount.style.color = residualAmount >= 0 ? 'var(--accent-emerald)' : 'var(--color-pmi)';
    }

    if (domRefs.residualCashFlowPercent) {
      domRefs.residualCashFlowPercent.textContent = `${residualPercent.toFixed(1)}% of take-home pay available`;
    }

    if (domRefs.residualCashFlowSubtitle) {
      const obligationsText = otherMonthlyDebts > 0
        ? `After housing (${formatCurrency(monthlyHousingCost)}) & debts (${formatCurrency(otherMonthlyDebts)})`
        : `After mandatory housing payment (${formatCurrency(monthlyHousingCost)})`;
      domRefs.residualCashFlowSubtitle.textContent = `${obligationsText} out of ${formatCurrency(netMonthlyIncome)} net take-home`;
    }
  } else {
    // Bridge Loan multi-stage view
    const debts = Math.max(0, otherMonthlyDebts || 0);
    const holdingHousing = bridgeData.holdingHousingCost;
    const recastHousing = bridgeData.recastHousingCost;

    const holdingObligations = holdingHousing + debts;
    const holdingResidual = netMonthlyIncome - holdingObligations;
    const holdingPercent = (holdingResidual / netMonthlyIncome) * 100;

    const recastObligations = recastHousing + debts;
    const recastResidual = netMonthlyIncome - recastObligations;
    const recastPercent = (recastResidual / netMonthlyIncome) * 100;

    if (domRefs.residualBridgeIncomeNote) {
      domRefs.residualBridgeIncomeNote.textContent = `out of ${formatCurrency(netMonthlyIncome)} net take-home`;
    }

    // Stage 1: Holding Period
    if (domRefs.residualHoldingCostTag) {
      domRefs.residualHoldingCostTag.textContent = `${formatCurrency(holdingHousing)}/mo cost`;
    }
    if (domRefs.residualHoldingAmount) {
      domRefs.residualHoldingAmount.textContent = `${formatSignedCurrency(holdingResidual)} / mo`;
      domRefs.residualHoldingAmount.style.color = holdingResidual >= 0 ? 'var(--color-moderate)' : 'var(--color-pmi)';
    }
    if (domRefs.residualHoldingPercent) {
      domRefs.residualHoldingPercent.textContent = `${holdingPercent.toFixed(1)}% remaining`;
    }

    // Stage 2: After Recast
    if (domRefs.residualRecastCostTag) {
      const savings = bridgeData.monthlySavings || (holdingHousing - recastHousing);
      domRefs.residualRecastCostTag.textContent = savings > 0 ? `+${formatCurrency(savings)}/mo saved` : `${formatCurrency(recastHousing)}/mo cost`;
    }
    if (domRefs.residualRecastAmount) {
      domRefs.residualRecastAmount.textContent = `${formatSignedCurrency(recastResidual)} / mo`;
      domRefs.residualRecastAmount.style.color = recastResidual >= 0 ? 'var(--accent-emerald)' : 'var(--color-pmi)';
    }
    if (domRefs.residualRecastPercent) {
      domRefs.residualRecastPercent.textContent = `${recastPercent.toFixed(1)}% remaining`;
    }
  }
}

/**
 * Draws burndown amortization chart with three data series
 * @param {string} svgId - SVG element ID
 * @param {Object} amortData - Amortization result from simulatePayoff()
 * @param {Object|null} baselineData - Baseline amortization (no extra payments)
 * @param {number} homePrice - Home purchase price for equity milestones
 */
export function drawBurndownChart(svgId, amortData, baselineData, homePrice) {
  const svg = document.getElementById(svgId);
  if (!svg) return;

  svg.innerHTML = '';

  const { yearlyBalances, yearlyInterest, yearlyPayments } = amortData;
  const termYears = yearlyBalances.length - 1;
  const loanAmount = yearlyBalances[0];

  if (loanAmount <= 0 || termYears <= 0) return;

  const WIDTH = CONFIG.CHART_WIDTH;
  const HEIGHT = CONFIG.CHART_HEIGHT;
  const PAD_LEFT = CONFIG.CHART_PAD_LEFT;
  const PAD_RIGHT = CONFIG.CHART_PAD_RIGHT;
  const PAD_TOP = CONFIG.CHART_PAD_TOP;
  const PAD_BOTTOM = CONFIG.CHART_PAD_BOTTOM;
  const PLOT_W = WIDTH - PAD_LEFT - PAD_RIGHT;
  const PLOT_H = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const chartMax = Math.max(
    loanAmount,
    yearlyInterest[yearlyInterest.length - 1],
    yearlyPayments[yearlyPayments.length - 1]
  );

  const toX = yr => PAD_LEFT + (yr / termYears) * PLOT_W;
  const toY = val => PAD_TOP + (1 - val / chartMax) * PLOT_H;

  // SVG defs with shadow filter
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const filt = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
  filt.setAttribute('id', `tip-shadow-${svgId}`);
  filt.setAttribute('x', '-20%'); filt.setAttribute('y', '-20%');
  filt.setAttribute('width', '140%'); filt.setAttribute('height', '140%');
  const fds = document.createElementNS('http://www.w3.org/2000/svg', 'feDropShadow');
  fds.setAttribute('dx', '0'); fds.setAttribute('dy', '1');
  fds.setAttribute('stdDeviation', '2');
  fds.setAttribute('flood-color', 'rgba(0,0,0,0.45)');
  filt.appendChild(fds);
  defs.appendChild(filt);
  svg.appendChild(defs);

  // Y-axis grid lines & labels
  const Y_TICKS = CONFIG.CHART_Y_TICKS;
  for (let i = 0; i <= Y_TICKS; i++) {
    const val = chartMax * (i / Y_TICKS);
    const yPos = toY(val);

    const gridLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    gridLine.setAttribute('x1', PAD_LEFT); gridLine.setAttribute('y1', yPos);
    gridLine.setAttribute('x2', WIDTH - PAD_RIGHT); gridLine.setAttribute('y2', yPos);
    gridLine.setAttribute('class', 'chart-grid-line');
    svg.appendChild(gridLine);

    let label;
    if (val >= 1_000_000) label = `$${(val / 1_000_000).toFixed(1)}M`;
    else if (val >= 1_000) label = `$${Math.round(val / 1_000)}k`;
    else label = `$${Math.round(val)}`;

    const yText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    yText.setAttribute('x', PAD_LEFT - 6); yText.setAttribute('y', yPos + 4);
    yText.setAttribute('class', 'chart-axis-text');
    yText.setAttribute('text-anchor', 'end');
    yText.setAttribute('dominant-baseline', 'middle');
    yText.textContent = label;
    svg.appendChild(yText);
  }

  // Baseline line (if extra payments active)
  if (baselineData) {
    const baselinePath = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    let baselinePoints = '';
    for (let yr = 0; yr < baselineData.yearlyBalances.length; yr++) {
      const x = toX(yr);
      const y = toY(baselineData.yearlyBalances[yr]);
      baselinePoints += `${x},${y} `;
    }
    baselinePath.setAttribute('points', baselinePoints.trim());
    baselinePath.setAttribute('class', 'chart-path-baseline');
    svg.appendChild(baselinePath);
  }

  // Three main series paths
  const seriesConfigs = [
    { data: yearlyBalances, color: CONFIG.SERIES_BALANCE_COLOR, label: 'Remaining Balance' },
    { data: yearlyInterest, color: CONFIG.SERIES_INTEREST_COLOR, label: 'Cumulative Interest' },
    { data: yearlyPayments, color: CONFIG.SERIES_PRINCIPAL_COLOR, label: 'Cumulative Principal' }
  ];

  seriesConfigs.forEach(({ data, color, label }) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    let points = '';
    for (let yr = 0; yr < data.length; yr++) {
      const x = toX(yr);
      const y = toY(data[yr]);
      points += `${x},${y} `;
    }
    path.setAttribute('points', points.trim());
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', '2');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-linejoin', 'miter');
    svg.appendChild(path);
  });

  // Equity milestones
  const effectiveHome = Math.min(loanAmount * 1.25, homePrice);
  const tipGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  tipGroup.style.display = 'none';

  const tipBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  tipBg.setAttribute('width', '96'); tipBg.setAttribute('height', '54');
  tipBg.setAttribute('rx', '4'); tipBg.setAttribute('class', 'chart-tooltip-bg');
  tipBg.setAttribute('filter', `url(#tip-shadow-${svgId})`);
  tipGroup.appendChild(tipBg);

  const tipLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  tipLabel.setAttribute('x', '8'); tipLabel.setAttribute('y', '20');
  tipLabel.setAttribute('class', 'chart-tooltip-label');
  tipGroup.appendChild(tipLabel);

  const tipSub = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  tipSub.setAttribute('x', '8'); tipSub.setAttribute('y', '38');
  tipSub.setAttribute('class', 'chart-tooltip-text');
  tipGroup.appendChild(tipSub);

  CONFIG.MILESTONES.forEach(({ pct, label, sub, color }) => {
    const threshold = effectiveHome * pct;
    if (threshold >= loanAmount) return;

    const crossYear = linearInterpolateYear(yearlyBalances, threshold);
    if (crossYear === null) return;

    const cx = toX(crossYear);
    const cy = toY(threshold);
    const yearStr = `Year ${(Math.round(crossYear * 10) / 10).toFixed(1)}`;

    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', cx); dot.setAttribute('cy', cy); dot.setAttribute('r', CONFIG.MILESTONE_RADIUS);
    dot.setAttribute('class', 'chart-milestone-dot');
    dot.style.stroke = color;

    dot.addEventListener('mouseenter', () => {
      tipLabel.textContent = label;
      tipSub.textContent = yearStr;
      const TIP_W = 96;
      let tx = cx + 10;
      let ty = cy - 42;
      if (tx + TIP_W > WIDTH - PAD_RIGHT) tx = cx - TIP_W - 10;
      if (ty < PAD_TOP) ty = cy + 10;
      tipGroup.setAttribute('transform', `translate(${tx}, ${ty})`);
      tipGroup.style.display = '';
    });

    dot.addEventListener('mouseleave', () => { tipGroup.style.display = 'none'; });
    svg.appendChild(dot);
  });

  svg.appendChild(tipGroup);
}

/**
 * Sets button loading state
 * @param {HTMLElement} button - Button element
 * @param {string} text - Text to display
 * @param {boolean} isLoading - Whether button is in loading state
 */
export function setButtonLoading(button, text, isLoading) {
  if (!button) return;
  button.textContent = text;
  button.disabled = isLoading;
  button.style.opacity = isLoading ? '0.7' : '1';
}

/**
 * Updates rates attribution text
 * @param {string} source - Rate source
 * @param {string} date - Update date
 * @param {Object} domRefs - DOM element references
 */
export function updateRatesAttribution(source, date, domRefs) {
  if (domRefs.ratesAttributionEl) {
    domRefs.ratesAttributionEl.textContent = `Source: ${source} (Updated: ${date})`;
    domRefs.ratesAttributionEl.classList.add('visible');
  }
}



/**
 * Renders the "Have a house to sell?" net-proceeds breakdown, the
 * underwater warning state, and the proceeds-to-down-payment slider readout.
 * @param {Object} proceeds - Result of calculateSaleProceeds()
 * @param {number} sellProceedsPercent - Current slider value (0-100)
 * @param {Object} domRefs - DOM element references
 */
export function updateSellProceedsUI(proceeds, sellProceedsPercent, domRefs) {
  const homeValue = parseFloat(domRefs.sellHomeValueInput?.value) || 0;
  const payoff = parseFloat(domRefs.sellMortgagePayoffInput?.value) || 0;
  const repairCosts = parseFloat(domRefs.sellRepairCostsInput?.value) || 0;
  const concessions = parseFloat(domRefs.sellConcessionsInput?.value) || 0;
  const movingCosts = parseFloat(domRefs.sellMovingCostsInput?.value) || 0;

  const setText = (el, text) => { if (el) el.textContent = text; };

  setText(domRefs.sellLineValueEl, formatCurrency(homeValue));
  setText(domRefs.sellLinePayoffEl, formatSignedCurrency(-payoff));
  setText(domRefs.sellLineCommissionEl, formatSignedCurrency(-proceeds.commissionAmount));
  setText(domRefs.sellLineClosingEl, formatSignedCurrency(-proceeds.closingCostsAmount));
  setText(domRefs.sellLineRepairsEl, formatSignedCurrency(-repairCosts));
  setText(domRefs.sellLineConcessionsEl, formatSignedCurrency(-concessions));
  setText(domRefs.sellLineMovingEl, formatSignedCurrency(-movingCosts));
  setText(domRefs.sellNetProceedsEl, formatSignedCurrency(proceeds.netProceeds));

  if (domRefs.sellProceedsBoxEl) {
    domRefs.sellProceedsBoxEl.classList.toggle('underwater', proceeds.isUnderwater);
  }
  if (domRefs.sellUnderwaterWarningEl) {
    domRefs.sellUnderwaterWarningEl.style.display = proceeds.isUnderwater ? 'block' : 'none';
  }

  setText(domRefs.sellProceedsPercentValueEl, `${Math.round(sellProceedsPercent)}%`);
  setText(domRefs.sellProceedsDollarValueEl, formatCurrency(proceeds.amountToDownPayment));
}

/**
 * Shows a gentle suggestion to refresh the home value estimate once it's
 * gotten old enough that it might no longer reflect the market. Hidden
 * entirely if the value has never actually been set/touched (null
 * timestamp) — nothing to call "stale" yet.
 * @param {number|null} updatedAtMs - Epoch ms the value was last set, or null if never
 * @param {Object} domRefs - DOM element references
 */
export function updateStaleValueWarning(updatedAtMs, domRefs) {
  if (!domRefs.sellStaleWarningEl) return;

  const age = daysSince(updatedAtMs);
  const isStale = age !== null && age >= CONFIG.SELL_VALUE_STALE_DAYS;

  domRefs.sellStaleWarningEl.style.display = isStale ? 'flex' : 'none';

  if (isStale && domRefs.sellStaleWarningTextEl) {
    const ageText = age === 1 ? '1 day' : `${age} days`;
    domRefs.sellStaleWarningTextEl.textContent =
      `This value is ${ageText} old — home prices can shift. You may want to refresh it.`;
  }
}

/**
 * Renders the down payment breakdown pills and the "other source" (house
 * sale proceeds, or a bridge loan draw — whichever the current sale mode
 * applies) visibility and labeling.
 * @param {number} cash
 * @param {number} otherAmount - Amount from the non-cash source (house sale proceeds in Sell First mode, bridge loan draw in Bridge Loan mode)
 * @param {number} totalAmount
 * @param {number} percent
 * @param {Object} domRefs
 * @param {'sellFirst'|'bridgeLoan'} [mode='sellFirst']
 * @param {'bridge'|'heloc'} [financingType='bridge'] - Only relevant when mode is 'bridgeLoan'
 */
export function updateDownPaymentBreakdownUI(cash, otherAmount, totalAmount, percent, domRefs, mode = 'sellFirst', financingType = 'bridge') {
  const formatCurrencyLocal = (val) => '$' + Math.round(val).toLocaleString();
  const isBridge = mode === 'bridgeLoan';
  const isHeloc = isBridge && financingType === CONFIG.FINANCING_TYPE_HELOC;
  const pillLabel = isHeloc ? '🏦 HELOC' : isBridge ? '🌉 Bridge' : '🏡 House';

  if (domRefs.dpBreakdownHouse) {
    if (otherAmount > 0) {
      domRefs.dpBreakdownHouse.textContent = `${pillLabel}: ${formatCurrencyLocal(otherAmount)}`;
      domRefs.dpBreakdownHouse.style.display = 'inline';
    } else {
      domRefs.dpBreakdownHouse.style.display = 'none';
    }
  }

  if (domRefs.dpBreakdownCash) {
    domRefs.dpBreakdownCash.textContent = `💵 Cash: ${formatCurrencyLocal(cash)}`;
  }

  if (domRefs.dpBreakdownTotal) {
    domRefs.dpBreakdownTotal.textContent = `Total: ${formatCurrencyLocal(totalAmount)} (${Math.round(percent)}%)`;
  }

  if (domRefs.houseSaleDownPaymentWrapper) {
    domRefs.houseSaleDownPaymentWrapper.style.display = otherAmount > 0 ? 'block' : 'none';
  }

  if (domRefs.houseSaleDownPaymentInput) {
    domRefs.houseSaleDownPaymentInput.value = Math.round(otherAmount);
  }

  // Relabel the readonly "other source" field itself to match the mode —
  // same input/wrapper is reused for both House Sale and Bridge Loan so we
  // don't duplicate the whole down-payment-sources markup per mode.
  if (domRefs.houseSaleDownPaymentLabelEl) {
    domRefs.houseSaleDownPaymentLabelEl.textContent = isHeloc ? '🏦 From HELOC' : isBridge ? '🌉 From Bridge Loan' : '🏡 From House Sale';
  }
  if (domRefs.houseSaleDownPaymentTooltipEl) {
    domRefs.houseSaleDownPaymentTooltipEl.setAttribute(
      'data-tooltip',
      isHeloc
        ? "HELOC draw applied to this down payment (set in the 'Have a house to sell?' panel above)."
        : isBridge
        ? "Bridge loan draw applied to this down payment (set in the 'Have a house to sell?' panel above)."
        : "Net sale proceeds from your current home applied to this down payment (calculated in the 'Have a house to sell?' panel above)."
    );
  }
  const otherColor = isBridge ? 'var(--color-moderate)' : 'var(--accent-cyan)';
  const otherBg = isBridge ? 'rgba(245, 158, 11, 0.05)' : 'rgba(6, 182, 212, 0.05)';
  const otherBorder = isBridge ? 'rgba(245, 158, 11, 0.25)' : 'rgba(6, 182, 212, 0.25)';
  if (domRefs.houseSaleDownPaymentPrefixEl) domRefs.houseSaleDownPaymentPrefixEl.style.color = otherColor;
  if (domRefs.houseSaleDownPaymentInput) domRefs.houseSaleDownPaymentInput.style.color = otherColor;
  if (domRefs.houseSaleDownPaymentBoxEl) {
    domRefs.houseSaleDownPaymentBoxEl.style.background = otherBg;
    domRefs.houseSaleDownPaymentBoxEl.style.borderColor = otherBorder;
  }
}

/**
 * Renders the Bridge Loan holding-cost box: interest-only payment, combined
 * monthly cost of carrying both homes, and the total cost of the bridge loan
 * over the estimated holding period.
 * @param {Object} bridgeCosts - Result of calculateBridgeLoanCosts()
 * @param {number} newMortgagePayment - Full PITI on the new mortgage (bank-qualifying baseline for the active term)
 * @param {Object} domRefs
 */
export function updateBridgeHoldingCostUI(bridgeCosts, newMortgagePayment, domRefs) {
  const setText = (el, text) => { if (el) el.textContent = text; };
  const combined = bridgeCosts.monthlyInterestOnlyPayment + newMortgagePayment;

  setText(domRefs.bridgeMonthlyInterestEl, formatCurrency(bridgeCosts.monthlyInterestOnlyPayment));
  setText(domRefs.bridgeNewMortgagePaymentEl, formatCurrency(newMortgagePayment));
  setText(domRefs.bridgeCombinedMonthlyEl, formatCurrency(combined));
  setText(domRefs.bridgeTotalInterestEl, formatCurrency(bridgeCosts.totalBridgeInterest));
  setText(domRefs.bridgeTotalCostEl, formatCurrency(bridgeCosts.totalBridgeCost));
}

/**
 * Renders the holding-period DTI — the debt-to-income ratio for the
 * COMBINED monthly cost (bridge interest-only payment + new mortgage)
 * against income. This is deliberately separate from the main Affordability
 * card's DTI, which only reflects the new mortgage on its own (i.e. your
 * situation AFTER the house sells and the bridge loan is gone) — the
 * holding period is the financially riskiest window, since it's double
 * housing cost before any sale proceeds have landed.
 * @param {number} combinedMonthlyCost - Bridge interest-only payment + new mortgage PITI
 * @param {number} grossMonthlyIncome - Monthly income used as the DTI denominator (gross OR net estimate)
 * @param {Object} domRefs
 * @param {boolean} [isNetIncome] - True when grossMonthlyIncome is the Net (Best Guess) estimate
 */
export function updateBridgeHoldingDtiUI(combinedMonthlyCost, grossMonthlyIncome, domRefs, isNetIncome) {
  if (grossMonthlyIncome <= 0) return;

  const dti = (combinedMonthlyCost / grossMonthlyIncome) * 100;
  const status = getDTIStatus(dti);

  const ratioEl = domRefs?.bridgeHoldingDtiRatioEl || document.getElementById('bridge-holding-dti-ratio');
  const progressEl = domRefs?.bridgeHoldingDtiProgressBarEl || document.getElementById('bridge-holding-dti-progress-bar');
  const badgeEl = domRefs?.bridgeHoldingDtiBadgeEl || document.getElementById('bridge-holding-dti-badge');
  const descEl = domRefs?.bridgeHoldingDtiDescriptionEl || document.getElementById('bridge-holding-dti-description');
  const dollarEl = domRefs?.bridgeHoldingDtiDollarBreakdownEl || document.getElementById('bridge-holding-dti-dollar-breakdown');

  if (ratioEl) ratioEl.textContent = `${dti.toFixed(1)}%`;

  if (progressEl) {
    progressEl.style.width = `${Math.min(dti, 100)}%`;
    progressEl.className = 'progress-bar';
    progressEl.classList.add(status.className);
  }

  if (badgeEl) {
    badgeEl.className = 'badge-dti';
    badgeEl.textContent = status.label;
    badgeEl.classList.add(status.className);
  }

  if (descEl) {
    descEl.textContent =
      `Combines your bridge loan's interest-only payment with your full new mortgage payment — this is what you're actually carrying against income until the old house sells. ${status.description}${netIncomeCaveat(isNetIncome)}`;
  }
  if (dollarEl) {
    dollarEl.textContent = formatDtiDollarBreakdown(combinedMonthlyCost, grossMonthlyIncome, isNetIncome);
  }
  setDtiTabStatus('holding', status.className);
}

/**
 * Shared rendering for a single back-end DTI metric block (ratio, badge,
 * progress bar, description) — used by both the main Affordability card's
 * Back-End DTI and the bridge holding-period Back-End DTI, which are
 * otherwise identical except for their inputs and lead-in description text.
 */
function renderBackEndDtiBlock(monthlyHousingCost, otherMonthlyDebts, grossMonthlyIncome, els, leadIn, tabKey, isNetIncome) {
  if (grossMonthlyIncome <= 0) return;

  const dti = ((monthlyHousingCost + Math.max(0, otherMonthlyDebts || 0)) / grossMonthlyIncome) * 100;
  const status = getBackEndDTIStatus(dti, isNetIncome);

  if (els.ratioEl) els.ratioEl.textContent = `${dti.toFixed(1)}%`;

  if (els.progressBarEl) {
    els.progressBarEl.style.width = `${Math.min(dti, 100)}%`;
    els.progressBarEl.className = 'progress-bar';
    els.progressBarEl.classList.add(status.className);
  }

  if (els.badgeEl) {
    els.badgeEl.className = 'badge-dti';
    els.badgeEl.textContent = status.label;
    els.badgeEl.classList.add(status.className);
  }

  if (els.descriptionEl) {
    const fullDescription = `${status.description}${netIncomeCaveat(isNetIncome)}`;
    els.descriptionEl.textContent = leadIn ? `${leadIn} ${fullDescription}` : fullDescription;
  }

  if (els.dollarBreakdownEl) {
    const combinedCost = monthlyHousingCost + Math.max(0, otherMonthlyDebts || 0);
    els.dollarBreakdownEl.textContent = formatDtiDollarBreakdown(combinedCost, grossMonthlyIncome, isNetIncome);
  }

  if (tabKey) setDtiTabStatus(tabKey, status.className);
}

/**
 * Renders the main Affordability card's Back-End DTI — the Bank Qualifying
 * housing payment plus other monthly debts, against income. Sits alongside
 * (not in place of) the housing-only Bank Qualifying DTI above it.
 * @param {number} bankMonthlyCost - Same bank-qualifying baseline used for the front-end DTI
 * @param {number} otherMonthlyDebts
 * @param {number} grossMonthlyIncome - Monthly income used as the DTI denominator (gross OR net estimate)
 * @param {Object} domRefs
 * @param {boolean} [isNetIncome] - True when grossMonthlyIncome is the Net (Best Guess) estimate
 */
export function updateBackEndDTI(bankMonthlyCost, otherMonthlyDebts, grossMonthlyIncome, domRefs, isNetIncome) {
  renderBackEndDtiBlock(bankMonthlyCost, otherMonthlyDebts, grossMonthlyIncome, {
    ratioEl: domRefs?.backendDtiRatioEl || document.getElementById('backend-dti-ratio'),
    badgeEl: domRefs?.backendDtiBadgeEl || document.getElementById('backend-dti-badge'),
    progressBarEl: domRefs?.backendDtiProgressBarEl || document.getElementById('backend-dti-progress-bar'),
    descriptionEl: domRefs?.backendDtiDescriptionEl || document.getElementById('backend-dti-description'),
    dollarBreakdownEl: domRefs?.backendDtiDollarBreakdownEl || document.getElementById('backend-dti-dollar-breakdown')
  }, undefined, 'backend', isNetIncome);
}

/**
 * Renders the bridge holding-period Back-End DTI — the combined
 * bridge-loan + new-mortgage cost plus other monthly debts, against income.
 * Sits alongside the holding-period (housing-only) DTI above it.
 * @param {number} combinedMonthlyCost - Bridge interest-only payment + new mortgage PITI
 * @param {number} otherMonthlyDebts
 * @param {number} grossMonthlyIncome - Monthly income used as the DTI denominator (gross OR net estimate)
 * @param {Object} domRefs
 * @param {boolean} [isNetIncome] - True when grossMonthlyIncome is the Net (Best Guess) estimate
 */
export function updateBridgeHoldingBackEndDtiUI(combinedMonthlyCost, otherMonthlyDebts, grossMonthlyIncome, domRefs, isNetIncome) {
  renderBackEndDtiBlock(combinedMonthlyCost, otherMonthlyDebts, grossMonthlyIncome, {
    ratioEl: domRefs?.bridgeHoldingBackendDtiRatioEl || document.getElementById('bridge-holding-backend-dti-ratio'),
    badgeEl: domRefs?.bridgeHoldingBackendDtiBadgeEl || document.getElementById('bridge-holding-backend-dti-badge'),
    progressBarEl: domRefs?.bridgeHoldingBackendDtiProgressBarEl || document.getElementById('bridge-holding-backend-dti-progress-bar'),
    descriptionEl: domRefs?.bridgeHoldingBackendDtiDescriptionEl || document.getElementById('bridge-holding-backend-dti-description'),
    dollarBreakdownEl: domRefs?.bridgeHoldingBackendDtiDollarBreakdownEl || document.getElementById('bridge-holding-backend-dti-dollar-breakdown')
  }, "Adds your other monthly debts on top of the combined carrying cost above.", 'holding-backend', isNetIncome);
}

/**
 * Shows/hides the gentle "exceeds typical CLTV" warning. The cap and the
 * wording both depend on financing type (bridge loan vs. HELOC have
 * different typical lender comfort zones) — see
 * BRIDGE_LOAN_TYPICAL_MAX_CLTV_PERCENT / HELOC_TYPICAL_MAX_CLTV_PERCENT in
 * config.js. The caller (app.js) picks the right cap and passes it in here;
 * this function just renders whichever one it's given.
 * @param {number} bridgeLoanAmount
 * @param {number} maxTypicalBridge
 * @param {Object} domRefs
 * @param {number} [maxCltvPercent=80] - Which cap is currently active
 * @param {boolean} [isHeloc=false] - Swaps the warning's wording to say "HELOC" instead of "bridge"
 */
export function updateBridgeCltvWarning(bridgeLoanAmount, maxTypicalBridge, domRefs, maxCltvPercent = 80, isHeloc = false) {
  if (!domRefs.bridgeCltvWarningEl) return;
  const exceeds = bridgeLoanAmount > 0 && maxTypicalBridge >= 0 && bridgeLoanAmount > maxTypicalBridge;
  domRefs.bridgeCltvWarningEl.style.display = exceeds ? 'block' : 'none';
  if (exceeds) {
    const label = isHeloc ? 'HELOC' : 'bridge loan';
    domRefs.bridgeCltvWarningEl.textContent =
      `⚠ This exceeds a typical ${maxCltvPercent}% combined-loan-to-value ${label} limit (~${formatCurrencyLocalNoDecimals(maxTypicalBridge)} max here) — lenders may not approve this amount.`;
  }
}

/**
 * Swaps the Bridge Loan Amount / Interest Rate / Fees field labels and
 * tooltips to match the selected financing type. Purely cosmetic — the
 * underlying input ids (bridgeLoanAmount/bridgeLoanRate/bridgeLoanFeesPercent)
 * never change, so storage and every calculation function are unaffected.
 * @param {'bridge'|'heloc'} financingType
 * @param {Object} domRefs
 */
export function updateFinancingTypeLabelsUI(financingType, domRefs) {
  const isHeloc = financingType === CONFIG.FINANCING_TYPE_HELOC;
  const setText = (el, text) => { if (el) el.textContent = text; };
  const setTip = (el, text) => { if (el) el.setAttribute('data-tooltip', text); };

  setText(domRefs.bridgeLoanAmountLabel, isHeloc ? 'HELOC for Down Payment' : 'Bridge Loan Amount');
  setTip(domRefs.bridgeLoanAmountTooltip, isHeloc
    ? "How much you're borrowing against this home's equity via a HELOC to cover the new down payment before it sells."
    : "How much you're borrowing short-term against this home's equity to cover the new down payment before it sells.");

  setText(domRefs.bridgeExtraCashLabel, isHeloc ? 'Extra Cash Pulled from HELOC' : 'Extra Cash Pulled from Bridge Loan');
  setTip(domRefs.bridgeExtraCashTooltip, isHeloc
    ? "Extra money drawn from your HELOC to keep in your bank account (for moving costs, reserves, or covering 2 mortgage payments during transition). Paid off when home sells, but not applied to down payment."
    : "Extra money drawn from your bridge loan to keep in your bank account (for moving costs, reserves, or covering 2 mortgage payments during transition). Paid off when home sells, but not applied to down payment.");

  setText(domRefs.bridgeLoanRateLabel, isHeloc ? 'HELOC Interest Rate' : 'Bridge Loan Interest Rate');
  setTip(domRefs.bridgeLoanRateTooltip, isHeloc
    ? "HELOCs are typically variable-rate, tied to prime — this is just a starting rate, and it can move while you're carrying the balance. Usually interest-only during the draw period."
    : "Bridge loans typically carry a higher, roughly-fixed rate for the short term. Usually interest-only during the holding period.");

  setText(domRefs.bridgeLoanFeesLabel, isHeloc ? 'HELOC Fees (if any)' : 'Origination Fee / Points');
  setTip(domRefs.bridgeLoanFeesTooltip, isHeloc
    ? "Many HELOCs are marketed as no-closing-cost — set to 0 if yours has none, or enter whatever upfront fee your lender quotes."
    : "Lender fee charged upfront, typically a percentage of the total borrowed amount.");
}

function formatCurrencyLocalNoDecimals(val) {
  return '$' + Math.round(Math.max(0, val)).toLocaleString();
}

/**
 * Wires up the Affordability card's DTI switcher — clicking a tab button
 * shows that metric's panel and hides the others. Purely presentational;
 * every underlying value is still rendered by the existing update*() DTI
 * functions above into the same DOM ids they always used, regardless of
 * which panel is currently visible.
 */
export function setupDtiSwitcher() {
  const buttons = document.querySelectorAll('.dti-tab-btn');
  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.dtiTab;
      buttons.forEach(b => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.dti-panel').forEach(p => {
        p.classList.toggle('active', p.dataset.dtiPanel === tab);
      });
    });
  });
}

/**
 * Shows or hides the two Bridge-Loan-only DTI tabs (Holding Period,
 * Holding Period Back-End) depending on whether that mode is currently
 * active. If one of those tabs is the one showing when it's turned off,
 * falls back to the always-available Bank Qualifying tab rather than
 * leaving an empty/hidden panel selected.
 * @param {boolean} isHoldingAvailable
 */
export function updateDtiTabAvailability(isHoldingAvailable) {
  const holdingBtn = document.getElementById('dti-tab-btn-holding');
  const holdingBackendBtn = document.getElementById('dti-tab-btn-holding-backend');
  if (holdingBtn) holdingBtn.style.display = 'none';
  if (holdingBackendBtn) holdingBackendBtn.style.display = 'none';

  const activeBtn = document.querySelector('.dti-tab-btn.active');
  const onHoldingTab = activeBtn && (activeBtn.dataset.dtiTab === 'holding' || activeBtn.dataset.dtiTab === 'holding-backend');
  if (onHoldingTab) {
    const bankBtn = document.querySelector('.dti-tab-btn[data-dti-tab="bank"]');
    if (bankBtn) bankBtn.click();
  }
}

/**
 * Wires up every collapsible peer card (e.g. "Extra Payments & Schedule")
 * — clicking the header toggles its body's [hidden] attribute and the
 * chevron rotation. Field values are untouched by collapsing; inputs keep
 * firing their normal change/input events whether visible or not.
 */
export function setupCollapsibleCards() {
  document.querySelectorAll('.collapsible-header').forEach(header => {
    header.addEventListener('click', () => {
      const bodyId = header.getAttribute('aria-controls');
      const body = bodyId ? document.getElementById(bodyId) : null;
      const isExpanded = header.getAttribute('aria-expanded') === 'true';
      header.setAttribute('aria-expanded', String(!isExpanded));
      if (body) body.hidden = isExpanded;
    });
  });
}

/**
 * Reads the current open/closed state of every collapsible card, keyed by
 * each header's data-section-key (property/downPayment/extraPayments/
 * ratesAndTaxes/insuranceAndFees). Used to build the payload saved to
 * localStorage so a card someone opens stays open across reloads.
 * @returns {Object<string, boolean>} true = collapsed, per section key
 */
export function getCollapsedSectionsState() {
  const state = {};
  document.querySelectorAll('.collapsible-header[data-section-key]').forEach(header => {
    state[header.dataset.sectionKey] = header.getAttribute('aria-expanded') !== 'true';
  });
  return state;
}

/**
 * Applies a saved (or default) collapsed/expanded state to every
 * collapsible card on load. A section key missing from `collapsedMap`
 * (e.g. loading a save from before this field existed) defaults to
 * collapsed, matching every card's fresh-page-load state.
 * @param {Object<string, boolean>} collapsedMap - true = collapsed, per section key
 */
export function applyCollapsedSectionsState(collapsedMap) {
  document.querySelectorAll('.collapsible-header[data-section-key]').forEach(header => {
    const key = header.dataset.sectionKey;
    const defaultCollapsed = (key === 'extraPayments' || key === 'burndownChart' || key === 'dtiGroupCashflow');
    const isCollapsed = collapsedMap && Object.prototype.hasOwnProperty.call(collapsedMap, key)
      ? !!collapsedMap[key]
      : defaultCollapsed;
    const bodyId = header.getAttribute('aria-controls');
    const body = bodyId ? document.getElementById(bodyId) : null;
    header.setAttribute('aria-expanded', String(!isCollapsed));
    if (body) body.hidden = isCollapsed;
  });
}

/**
 * Updates the live summary badges on DTI sub-accordion headers
 * @param {Object} results - Results object from performCalculations()
 * @param {Object} domRefs - Object containing DOM element references
 */
export function updateDtiAccordionSummaries(results, domRefs) {
  if (!domRefs) return;

  const { grossAnnualIncome, otherMonthlyDebts, isNetIncomeBasis } = results;

  // Group 1: Income & Monthly Debts Summary
  if (domRefs.dtiSummaryInputs) {
    const incText = isNetIncomeBasis
      ? `${formatCurrency(results.effectiveMonthlyIncome || 0)}/mo Net`
      : `${formatCurrency(grossAnnualIncome || 0)}/yr Gross`;
    const debtText = (otherMonthlyDebts && otherMonthlyDebts > 0)
      ? `${formatCurrency(otherMonthlyDebts)}/mo Debts`
      : '$0 Debts';
    domRefs.dtiSummaryInputs.textContent = `${incText} • ${debtText}`;
  }

  // Group 2: Monthly Cash Flow & Take-Home Summary
  if (domRefs.dtiSummaryCashflow) {
    if (!isNetIncomeBasis) {
      domRefs.dtiSummaryCashflow.textContent = 'Net Mode Only';
      domRefs.dtiSummaryCashflow.className = 'dti-summary-badge muted';
    } else {
      const residualText = domRefs.residualCashFlowAmount ? domRefs.residualCashFlowAmount.textContent : '+$0 / mo';
      if (!residualText || residualText === '+$0 / mo' || residualText === '$0') {
        domRefs.dtiSummaryCashflow.textContent = 'Net Cash Flow';
        domRefs.dtiSummaryCashflow.className = 'dti-summary-badge emerald';
      } else {
        domRefs.dtiSummaryCashflow.textContent = `${residualText} Remaining`;
        if (residualText.startsWith('-')) {
          domRefs.dtiSummaryCashflow.className = 'dti-summary-badge warning';
        } else {
          domRefs.dtiSummaryCashflow.className = 'dti-summary-badge emerald';
        }
      }
    }
  }

  // Group 3: DTI Ratios & Benchmarks Summary
  if (domRefs.dtiSummaryRatios) {
    const frontText = domRefs.dtiRatioEl ? domRefs.dtiRatioEl.textContent : '--%';
    const backText = domRefs.backendDtiRatioEl ? domRefs.backendDtiRatioEl.textContent : '--%';
    const backBadge = domRefs.backendDtiBadgeEl ? domRefs.backendDtiBadgeEl.textContent : '';
    domRefs.dtiSummaryRatios.textContent = `${frontText} Front • ${backText} Back${backBadge ? ' (' + backBadge + ')' : ''}`;
  }
}

/**
 * Expands the Cash Flow sub-accordion group if collapsed
 * @param {Object} domRefs - Object containing DOM element references
 */
export function expandDtiCashFlowGroup(domRefs) {
  if (domRefs && domRefs.dtiHeaderCashflow && domRefs.dtiBodyCashflow) {
    domRefs.dtiHeaderCashflow.setAttribute('aria-expanded', 'true');
    domRefs.dtiBodyCashflow.hidden = false;
  }
}

/**
 * Toggles active styling on the Sale Proceeds Strategy switch (Recast vs Extra Payment)
 * @param {'recast'|'extraPayment'} strategy
 * @param {Object} domRefs
 */
export function setRecastStrategyUI(strategy, domRefs) {
  const isExtra = strategy === CONFIG.SALE_PAYOFF_STRATEGY_EXTRA_PAYMENT;
  if (domRefs.btnRecastStratRecast) domRefs.btnRecastStratRecast.classList.toggle('active', !isExtra);
  if (domRefs.btnRecastStratExtra) domRefs.btnRecastStratExtra.classList.toggle('active', isExtra);
  if (domRefs.recastFeeGroup) domRefs.recastFeeGroup.style.display = isExtra ? 'none' : 'block';
}

/**
 * Renders the "When Your House Sells" recast breakdown and the before/after
 * monthly payment comparison.
 * @param {Object} proceeds - Result of calculateSaleProceeds() (the sale-side economics, mode-agnostic)
 * @param {number} bridgeLoanAmount
 * @param {number} recastFee
 * @param {Object} recast - Result of calculateRecast()
 * @param {Object} domRefs
 * @param {number} [newMortgagePaymentPiti=0]
 * @param {'recast'|'extraPayment'} [recastStrategy='recast']
 */
export function updateRecastSummaryUI(proceeds, bridgeLoanAmount, recastFee, recast, domRefs, newMortgagePaymentPiti = 0, recastStrategy = CONFIG.SALE_PAYOFF_STRATEGY_RECAST) {
  const setText = (el, text) => { if (el) el.textContent = text; };
  const availableAfterBridge = proceeds.netProceeds - bridgeLoanAmount;
  const isExtra = recastStrategy === CONFIG.SALE_PAYOFF_STRATEGY_EXTRA_PAYMENT;

  setText(domRefs.recastLineNetProceedsEl, formatSignedCurrency(proceeds.netProceeds));
  setText(domRefs.recastLineBridgePayoffEl, formatSignedCurrency(-bridgeLoanAmount));
  setText(domRefs.recastAvailableEl, formatSignedCurrency(availableAfterBridge));

  if (domRefs.recastFeeRowEl) domRefs.recastFeeRowEl.style.display = isExtra ? 'none' : 'flex';
  setText(domRefs.recastLineFeeEl, formatSignedCurrency(isExtra ? 0 : -recastFee));

  const appliedLumpSum = isExtra ? Math.max(0, availableAfterBridge) : recast.appliedLumpSum;
  setText(domRefs.recastLumpSumEl, formatCurrency(appliedLumpSum));
  setText(domRefs.recastLumpSumLabelEl, isExtra ? 'Extra Principal Lump Sum Applied' : 'Recast Lump Sum Applied to Principal');

  if (domRefs.recastMinLumpWarningEl) {
    const tooSmall = !isExtra && appliedLumpSum > 0 && appliedLumpSum < CONFIG.RECAST_TYPICAL_MIN_LUMP_SUM;
    domRefs.recastMinLumpWarningEl.style.display = tooSmall ? 'block' : 'none';
    if (tooSmall) {
      domRefs.recastMinLumpWarningEl.textContent =
        `⚠ Most lenders want at least ${formatCurrencyLocalNoDecimals(CONFIG.RECAST_TYPICAL_MIN_LUMP_SUM)} applied to recast a loan — this amount may not qualify.`;
    }
  }

  setText(domRefs.recastResultHeadingEl, isExtra ? 'Payoff Acceleration After House Sale' : 'Monthly Payment After Recast');

  if (domRefs.recastRowsRecastMode) domRefs.recastRowsRecastMode.style.display = isExtra ? 'none' : 'block';
  if (domRefs.recastRowsExtraMode) domRefs.recastRowsExtraMode.style.display = isExtra ? 'block' : 'none';

  if (!isExtra) {
    setText(domRefs.recastCurrentPaymentEl, formatCurrency(recast.currentMonthlyPI));
    setText(domRefs.recastNewPaymentEl, formatCurrency(recast.newMonthlyPI));
    setText(domRefs.recastMonthlySavingsEl, formatCurrency(recast.monthlySavings));

    if (domRefs.recastNewPitiEl && newMortgagePaymentPiti > 0) {
      const newTotalPiti = Math.max(0, newMortgagePaymentPiti - recast.monthlySavings);
      setText(domRefs.recastNewPitiEl, formatCurrency(newTotalPiti));
    }
  } else {
    setText(domRefs.recastExtraCurrentPaymentEl, formatCurrency(recast.currentMonthlyPI));
    const monthsSaved = Math.round(recast.monthsLaterPayoffFromRecasting);
    setText(domRefs.recastExtraTimeSavedEl, formatTimeSaved(monthsSaved));
    setText(domRefs.recastExtraInterestSavedEl, formatCurrency(recast.extraLifetimeInterestFromRecasting));
  }

  if (domRefs.recastTradeoffNoteEl) {
    if (appliedLumpSum > 0 && recast.monthsLaterPayoffFromRecasting > 0.5) {
      domRefs.recastTradeoffNoteEl.style.display = 'block';
      if (!isExtra) {
        domRefs.recastTradeoffNoteEl.textContent =
          `Heads up: applying this same amount as a one-time extra payment instead of recasting would pay the loan off about ${Math.round(recast.monthsLaterPayoffFromRecasting)} month(s) sooner and save roughly ${formatCurrency(recast.extraLifetimeInterestFromRecasting)} more in lifetime interest. Recasting trades that for a lower required payment starting right away.`;
      } else {
        const newTotalPitiIfRecast = newMortgagePaymentPiti > 0 ? Math.max(0, newMortgagePaymentPiti - recast.monthlySavings) : 0;
        const pitiNote = newTotalPitiIfRecast > 0 ? ` (${formatCurrency(newTotalPitiIfRecast)} total PITI)` : '';
        domRefs.recastTradeoffNoteEl.textContent =
          `Heads up: recasting this loan instead of applying an extra payment would lower your monthly P&I by ${formatCurrency(recast.monthlySavings)}/mo${pitiNote}. Extra payment trades that for paying off the loan about ${Math.round(recast.monthsLaterPayoffFromRecasting)} month(s) sooner and saving ${formatCurrency(recast.extraLifetimeInterestFromRecasting)} in interest.`;
      }
    } else {
      domRefs.recastTradeoffNoteEl.style.display = 'none';
    }
  }
}

/**
 * Renders the Real Numbers Comparison card directly under the strategy toggle in the input panel.
 * Displays side-by-side metrics for Recast vs. Extra Payment strategy.
 * @param {Object} recast - Result of calculateRecast()
 * @param {Object} proceeds - Result of calculateSaleProceeds()
 * @param {number} bridgeLoanAmount
 * @param {'recast'|'extraPayment'} recastStrategy
 * @param {Object} domRefs
 */
export function updateStrategyComparisonUI(recast, proceeds, bridgeLoanAmount, recastStrategy, domRefs) {
  if (!domRefs || !domRefs.recastStrategyComparisonBox) return;

  const setText = (el, text) => { if (el) el.textContent = text; };
  const availableAfterBridge = Math.max(0, proceeds.netProceeds - bridgeLoanAmount);
  const isExtra = recastStrategy === CONFIG.SALE_PAYOFF_STRATEGY_EXTRA_PAYMENT;

  const formatDuration = (totalMonths) => {
    const m = Math.max(0, Math.round(totalMonths));
    const yrs = Math.floor(m / 12);
    const mos = m % 12;
    if (yrs > 0 && mos > 0) return `${yrs}y ${mos}m`;
    if (yrs > 0) return `${yrs} yrs`;
    return `${mos} mos`;
  };

  // Header badge showing applied net proceeds
  setText(domRefs.stratCompLumpSumBadge, `Applied proceeds: ${formatCurrency(availableAfterBridge)}`);

  // Active tags & Column Highlights
  if (domRefs.stratCardRecast) {
    domRefs.stratCardRecast.style.borderColor = !isExtra ? 'rgba(16, 185, 129, 0.6)' : 'rgba(16, 185, 129, 0.15)';
    domRefs.stratCardRecast.style.background = !isExtra ? 'rgba(16, 185, 129, 0.12)' : 'rgba(16, 185, 129, 0.03)';
  }
  if (domRefs.stratCardExtra) {
    domRefs.stratCardExtra.style.borderColor = isExtra ? 'rgba(6, 182, 212, 0.6)' : 'rgba(6, 182, 212, 0.15)';
    domRefs.stratCardExtra.style.background = isExtra ? 'rgba(6, 182, 212, 0.12)' : 'rgba(6, 182, 212, 0.03)';
  }

  if (domRefs.stratRecastActiveTag) domRefs.stratRecastActiveTag.style.display = !isExtra ? 'inline-block' : 'none';
  if (domRefs.stratExtraActiveTag) domRefs.stratExtraActiveTag.style.display = isExtra ? 'inline-block' : 'none';

  // Recast Column
  setText(domRefs.stratRecastPiti, formatCurrency(recast.newMonthlyPI));
  setText(domRefs.stratRecastSavings, `-${formatCurrency(recast.monthlySavings)}/mo`);
  setText(domRefs.stratRecastTerm, formatDuration(recast.remainingMonths));
  setText(domRefs.stratRecastInterest, formatCurrency(recast.interestAfterRecast));

  // Extra Payment Column
  setText(domRefs.stratExtraPiti, formatCurrency(recast.currentMonthlyPI));
  setText(domRefs.stratExtraTerm, formatDuration(recast.monthsToPayoffNoRecast));
  const monthsSaved = Math.round(recast.monthsLaterPayoffFromRecasting);
  setText(domRefs.stratExtraTimeSaved, `Saved ${formatDuration(monthsSaved)}!`);
  setText(domRefs.stratExtraInterest, formatCurrency(recast.interestNoRecast));
  setText(domRefs.stratExtraInterestSaved, `Saved ${formatCurrency(recast.extraLifetimeInterestFromRecasting)}!`);

  // Tradeoff Summary Line
  if (domRefs.stratCompSummaryText) {
    if (availableAfterBridge <= 0) {
      domRefs.stratCompSummaryText.textContent = `ℹ Enter house sale details to compare real numbers between recasting and applying an extra payment.`;
    } else if (recast.monthlySavings > 0) {
      domRefs.stratCompSummaryText.innerHTML =
        `💡 <strong>Recast</strong> lowers your payment by <strong style="color:var(--accent-emerald);">${formatCurrency(recast.monthlySavings)}/mo</strong>. <strong>Extra Payment</strong> pays off <strong style="color:var(--accent-cyan);">${formatDuration(monthsSaved)} sooner</strong> and saves <strong style="color:var(--accent-cyan);">${formatCurrency(recast.extraLifetimeInterestFromRecasting)}</strong> in interest.`;
    } else {
      domRefs.stratCompSummaryText.textContent = `Both options produce identical results with zero remaining loan balance after applying proceeds.`;
    }
  }

  // "Best of Both Worlds" Strategy Note
  if (domRefs.stratCompBestOfBothNote) {
    if (availableAfterBridge > 0 && recast.monthlySavings > 5 && monthsSaved > 0) {
      domRefs.stratCompBestOfBothNote.style.display = 'block';
      domRefs.stratCompBestOfBothNote.innerHTML =
        `💡 <strong>The "Best of Both Worlds" Strategy:</strong><br/>` +
        `If you want interest savings without locking yourself into a higher mandatory bill:<br/>` +
        `1. <strong>Execute the Recast:</strong> Required payment drops to <strong style="color:var(--accent-emerald);">${formatCurrency(recast.newMonthlyPI)}/mo</strong>, lowering DTI risk.<br/>` +
        `2. <strong>Voluntarily Overpay:</strong> Pay your original <strong style="color:var(--text-bright);">${formatCurrency(recast.currentMonthlyPI)}/mo</strong> (adding an extra <strong>${formatCurrency(recast.monthlySavings)}/mo</strong> to principal).<br/>` +
        `<em>Delivers the exact same <strong style="color:var(--accent-cyan);">${formatDuration(monthsSaved)} shaved off</strong> and <strong style="color:var(--accent-cyan);">${formatCurrency(recast.extraLifetimeInterestFromRecasting)} interest savings</strong>, while leaving you free to drop back to ${formatCurrency(recast.newMonthlyPI)}/mo anytime cash flow tightens.</em>`;
    } else {
      domRefs.stratCompBestOfBothNote.style.display = 'none';
    }
  }
}
