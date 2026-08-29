/**
 * Configuration constants for the Housing Calculator
 * Centralized management of magic numbers, defaults, and constraints
 */

export const CONFIG = {
  // Calculation Constraints
  MIN_HOME_PRICE: 100000,
  MAX_HOME_PRICE: 1500000,
  DEFAULT_HOME_PRICE: 400000,
  DEFAULT_DOWN_PAYMENT_PERCENT: 20,
  DEFAULT_DOWN_PAYMENT_AMOUNT: 80000,
  DEFAULT_CASH_DOWN_PAYMENT: 80000,
  LOAN_BALANCE_THRESHOLD: 0.01,
  MAX_MONTHS: 1200,
  PMI_THRESHOLD_PERCENT: 20,
  
  // Rate Defaults (used as fallback)
  DEFAULT_RATE_30: 6.5,
  DEFAULT_RATE_15: 5.8,
  DEFAULT_TAX_RATE: 1.2,
  DEFAULT_HOME_INSURANCE: 1200,
  DEFAULT_PMI_RATE: 0.75,
  DEFAULT_GROSS_ANNUAL_INCOME: 120000,
  DEFAULT_HOA_FEES: 0,
  DEFAULT_LUMP_SUM_FREQUENCY: 12,
  
  // Sell Home Defaults
  DEFAULT_SELL_HOME_VALUE: 350000,
  DEFAULT_SELL_MORTGAGE_PAYOFF: 180000,
  DEFAULT_SELL_COMMISSION_PERCENT: 6,
  DEFAULT_SELL_CLOSING_COSTS_PERCENT: 1.5,
  DEFAULT_SELL_REPAIR_COSTS: 0,
  DEFAULT_SELL_CONCESSIONS: 0,
  DEFAULT_SELL_MOVING_COSTS: 2000,
  DEFAULT_SELL_PROCEEDS_PERCENT: 100,

  // Bridge Loan Defaults — used when "Have a house to sell?" is set to
  // Bridge Loan mode instead of Sell First (buy now with a short-term loan
  // against current-home equity, pay it off + recast the new mortgage once
  // the old house actually sells).
  SALE_MODE_SELL_FIRST: 'sellFirst',
  SALE_MODE_BRIDGE_LOAN: 'bridgeLoan',
  SALE_PAYOFF_STRATEGY_RECAST: 'recast',
  SALE_PAYOFF_STRATEGY_EXTRA_PAYMENT: 'extraPayment',
  DEFAULT_BRIDGE_LOAN_RATE: 8.5,
  DEFAULT_BRIDGE_LOAN_FEES_PERCENT: 1.5,
  DEFAULT_MONTHS_UNTIL_SALE: 4,
  DEFAULT_RECAST_FEE: 250,
  // Typical lender combined-loan-to-value cap for bridge loans (current
  // mortgage payoff + bridge amount vs. current home value) — used only to
  // surface a gentle "this may not be approvable" warning, not to clamp input.
  BRIDGE_LOAN_TYPICAL_MAX_CLTV_PERCENT: 80,
  // Most lenders want at least this much principal reduction to bother
  // recasting a loan — informational only.
  RECAST_TYPICAL_MIN_LUMP_SUM: 5000,

  // Financing Type sub-choice within Bridge Loan mode — 'bridge' (a
  // traditional short-term bridge loan, the original/default behavior above)
  // vs. 'heloc' (a revolving home equity line of credit against the current
  // home). Deliberately distinct string values from SALE_MODE_BRIDGE_LOAN
  // ('bridgeLoan') so the two concepts can never be confused/compared by
  // accident. Switching this only swaps which default rate/fees/CLTV-cap
  // apply — calculateBridgeLoanCosts() itself needs no changes, since it
  // already takes rate/fees/amount as generic inputs either way.
  FINANCING_TYPE_BRIDGE_LOAN: 'bridge',
  FINANCING_TYPE_HELOC: 'heloc',
  // HELOC starting values — national-average HELOC rate per Bankrate
  // (Aug 26, 2026: 7.30% average for a $30k HELOC) and 0% fees (many HELOCs
  // are marketed as no-closing-cost, unlike a bridge loan's origination
  // points). These are just starting points for the input boxes — always
  // editable afterward, same as every other default in this file.
  DEFAULT_HELOC_RATE: 7.3,
  DEFAULT_HELOC_FEES_PERCENT: 0,
  // HELOCs are typically approved to a looser combined-LTV than a dedicated
  // bridge loan product (typically ~85% vs. ~80%) — same "informational
  // warning only" role as BRIDGE_LOAN_TYPICAL_MAX_CLTV_PERCENT above.
  HELOC_TYPICAL_MAX_CLTV_PERCENT: 85,

  // DTI Thresholds (front-end / housing-only - Gross mode)
  DTI_HEALTHY_MAX: 28,
  DTI_MODERATE_MAX: 36,
  DTI_HEALTHY_LABEL: 'Healthy',
  DTI_MODERATE_LABEL: 'Moderate',
  DTI_HIGH_LABEL: 'High Risk',

  // Back-End DTI Thresholds (housing + other monthly debts - Gross mode)
  DTI_BACKEND_HEALTHY_MAX: 36,
  DTI_BACKEND_MODERATE_MAX: 45,
  DEFAULT_OTHER_MONTHLY_DEBTS: 0,

  // Net Income Basis DTI Thresholds (Take-home pay lifestyle benchmarks)
  DTI_NET_HEALTHY_MAX: 33,
  DTI_NET_MODERATE_MAX: 40,
  DTI_NET_BACKEND_HEALTHY_MAX: 45,
  DTI_NET_BACKEND_MODERATE_MAX: 55,

  // Gross vs. Net (Best Guess) income basis toggle — which figure feeds the
  // income denominator on every DTI panel. 'net' runs estimateNetAnnualIncome()
  // so the DTI panels reflect an estimated take-home paycheck instead of the
  // gross figure lenders use to qualify a loan.
  INCOME_BASIS_GROSS: 'gross',
  INCOME_BASIS_NET: 'net',

  // National-average assumptions behind the Net (Best Guess) income-basis
  // estimate — NOT tax advice. Modeled as a single filer taking the standard
  // deduction, current (2026) federal brackets and FICA rules, plus a
  // blended average state income tax rate. Real take-home pay varies by
  // state, filing status, dependents, deductions, and retirement
  // contributions — this exists purely to show a ballpark "what actually
  // hits your bank account" figure, not a paycheck calculator.
  NET_ESTIMATE_STANDARD_DEDUCTION: 16100, // 2026 single-filer standard deduction
  NET_ESTIMATE_FEDERAL_BRACKETS: [ // 2026 single-filer brackets (cumulative upper bound, rate)
    { upTo: 12400, rate: 0.10 },
    { upTo: 50400, rate: 0.12 },
    { upTo: 105700, rate: 0.22 },
    { upTo: 201775, rate: 0.24 },
    { upTo: 256225, rate: 0.32 },
    { upTo: 640600, rate: 0.35 },
    { upTo: Infinity, rate: 0.37 }
  ],
  NET_ESTIMATE_SS_RATE: 0.062,
  NET_ESTIMATE_SS_WAGE_CAP: 184500, // 2026 Social Security taxable wage base
  NET_ESTIMATE_MEDICARE_RATE: 0.0145,
  NET_ESTIMATE_ADDL_MEDICARE_RATE: 0.009,
  NET_ESTIMATE_ADDL_MEDICARE_THRESHOLD: 200000, // single-filer Additional Medicare threshold
  NET_ESTIMATE_AVG_STATE_TAX_RATE: 0.04, // blended national-average estimate

  // Pay-frequency options for the Net (Best Guess) fine-tune control — lets
  // the user calibrate against a real per-paycheck take-home figure instead
  // of an abstract adjustment. Values are the actual number of pay periods
  // per year, used to convert between a single paycheck and a monthly total.
  PAY_FREQUENCY_BIWEEKLY: 'biweekly',
  PAY_FREQUENCY_SEMIMONTHLY: 'semiMonthly',
  PAY_FREQUENCY_MONTHLY: 'monthly',
  PAY_PERIODS_PER_YEAR: {
    biweekly: 26,
    semiMonthly: 24,
    monthly: 12
  },

  // Fine-tune slider bounds, expressed as a multiple of the currently
  // active per-paycheck figure (its own "zero point") — wide enough to
  // cover real-world variance (extra retirement contributions, no state
  // income tax, high state income tax, etc.) without being unusably wide.
  // The upper bound is also hard-capped at the gross paycheck amount itself
  // (take-home can never exceed gross) wherever it's applied.
  NET_ESTIMATE_ADJUST_MIN_FACTOR: 0.6,
  NET_ESTIMATE_ADJUST_MAX_FACTOR: 1.25,
  NET_ESTIMATE_ADJUST_STEP: 10, // dollars, per paycheck

  // Chart Configuration
  CHART_WIDTH: 500,
  CHART_HEIGHT: 200,
  CHART_PAD_LEFT: 45,
  CHART_PAD_RIGHT: 15,
  CHART_PAD_TOP: 15,
  CHART_PAD_BOTTOM: 25,
  CHART_Y_TICKS: 4,
  CHART_GRID_COLOR: '#e5e7eb',
  CHART_AXIS_TEXT_COLOR: '#9ca3af',
  
  // Series Colors
  SERIES_BALANCE_COLOR: '#3182ce',
  SERIES_INTEREST_COLOR: '#68d391',
  SERIES_PRINCIPAL_COLOR: '#f59e0b',
  SERIES_BASELINE_COLOR: 'rgba(255,255,255,0.18)',
  
  // Milestone Configuration
  MILESTONE_RADIUS: 5,
  MILESTONE_STROKE_WIDTH: 2,
  MILESTONES: [
    { pct: 0.8, label: 'PMI Removal', sub: 'Reach 20% equity', color: '#3b82f6' },
    { pct: 0.5, label: 'Halfway There', sub: 'Hit 50% equity', color: '#8b5cf6' },
    { pct: 0.2, label: 'Nearly Home', sub: 'Reach 80% equity', color: '#06b6d4' }
  ],
  
  // Donut Chart
  DONUT_RADIUS: 70,
  get DONUT_CIRCUMFERENCE() {
    return 2 * Math.PI * this.DONUT_RADIUS;
  },
  
  // Storage Keys
  STORAGE_KEY_INPUTS: 'housing_calculator_inputs',
  STORAGE_KEY_ACTIVE_TERM: 'housing_calculator_active_term',
  
  // API Endpoints (server-side proxies only — calculator inputs are stored
  // locally in the browser and are never synced to a server; see storage.js)
  API_RATES: 'rates-proxy.php',
  // Shared Redfin lookup + 7-day cache used by both mortgage-calculator and
  // homeward (see backend/property-lookup.php). Absolute path since it
  // lives in a sibling top-level folder, not under mortgage-calculator/.
  // Superseded the old per-site mls-proxy.php (now a deprecation stub) —
  // do not point this back at a local mls-proxy.php.
  API_MLS: '/backend/property-lookup.php',

  // Debounce Timings
  SAVE_DEBOUNCE_MS: 500,
  CALCULATE_DEBOUNCE_MS: 300,
  
  // Loan Terms (in years)
  LOAN_TERM_30: 30,
  LOAN_TERM_15: 15,
  MONTHS_PER_YEAR: 12,
  
  // Error Messages
  ERROR_NO_PRICE: 'Could not extract a valid price from this page structure.',
  ERROR_NO_URL: 'Please enter a Redfin property page URL first.',
  ERROR_INVALID_URL: 'Please paste a full Redfin property page URL (e.g., https://www.redfin.com/...) instead of a raw MLS number.',
  ERROR_API_FETCH: 'A server error occurred while connecting to the parser backend.',
  ERROR_API_RATES: 'Could not fetch live rates',
  
  // UI Messages
  MSG_PARSING_PAGE: '⏳ Parsing Page...',
  MSG_SYNCING_RATES: '⏳ Syncing...',
  MSG_UPDATED: '✅ Updated',
  MSG_ERROR: '❌ Error',
  MSG_FETCH_PROPERTY: '🔍 Load Cached Property',
  MSG_FETCH_VALUE: '🔍 Load Cached Value',
  MSG_SELL_LOOKUP: '⏳ Looking Up Value...',
  ERROR_SELL_NO_VALUE: 'Could not extract a value estimate from this page. Please enter the value manually.',

  // How old a sell-side home value estimate can get before we gently
  // suggest refreshing it (home prices drift over time).
  SELL_VALUE_STALE_DAYS: 14
};

export const DEFAULTS = {
  homePrice: CONFIG.DEFAULT_HOME_PRICE,
  downPaymentPercent: CONFIG.DEFAULT_DOWN_PAYMENT_PERCENT,
  downPaymentAmount: CONFIG.DEFAULT_DOWN_PAYMENT_AMOUNT,
  cashDownPayment: CONFIG.DEFAULT_CASH_DOWN_PAYMENT,
  interest30: CONFIG.DEFAULT_RATE_30,
  interest15: CONFIG.DEFAULT_RATE_15,
  taxRate: CONFIG.DEFAULT_TAX_RATE,
  homeInsurance: CONFIG.DEFAULT_HOME_INSURANCE,
  hoaFees: CONFIG.DEFAULT_HOA_FEES,
  pmiRate: CONFIG.DEFAULT_PMI_RATE,
  grossAnnualIncome: CONFIG.DEFAULT_GROSS_ANNUAL_INCOME,
  otherMonthlyDebts: CONFIG.DEFAULT_OTHER_MONTHLY_DEBTS,
  // Which income figure feeds the DTI panels: 'gross' (default, matches what
  // lenders actually qualify against) or 'net' (Best Guess take-home estimate).
  incomeBasis: CONFIG.INCOME_BASIS_GROSS,
  // Which pay frequency the Net fine-tune slider/field is expressed in.
  payFrequency: CONFIG.PAY_FREQUENCY_MONTHLY,
  // The user's pinned MONTHLY take-home figure (canonical unit regardless
  // of displayed pay frequency) once they've calibrated the fine-tune
  // control. null = not yet calibrated, so the control tracks the live
  // Best Guess estimate instead of a fixed dollar figure.
  netMonthlyOverride: null,
  additionalPayment: 0,
  lumpSumAmount: 0,
  lumpSumFrequency: CONFIG.DEFAULT_LUMP_SUM_FREQUENCY,
  activeTerm: 30,

  // "Have a house to sell?" section — off by default, values only matter
  // once the checkbox is enabled.
  sellingHouse: false,
  sellHomeValue: CONFIG.DEFAULT_SELL_HOME_VALUE,
  sellMortgagePayoff: CONFIG.DEFAULT_SELL_MORTGAGE_PAYOFF,
  sellCommissionPercent: CONFIG.DEFAULT_SELL_COMMISSION_PERCENT,
  sellClosingCostsPercent: CONFIG.DEFAULT_SELL_CLOSING_COSTS_PERCENT,
  sellRepairCosts: CONFIG.DEFAULT_SELL_REPAIR_COSTS,
  sellConcessions: CONFIG.DEFAULT_SELL_CONCESSIONS,
  sellMovingCosts: CONFIG.DEFAULT_SELL_MOVING_COSTS,
  sellProceedsPercent: CONFIG.DEFAULT_SELL_PROCEEDS_PERCENT,

  // Payment Frequency & Biweekly Strategy
  paymentFrequency: 'monthly', // 'monthly' | 'biweekly' | 'accelerated'
  biweeklyExtra: 0,

  // Epoch ms timestamp of the last time sellHomeValue was set (via lookup
  // or manual edit). null until the value has actually been touched once —
  // an untouched default shouldn't trigger a "this is stale" suggestion.
  sellHomeValueUpdatedAt: null,

  // Bridge Loan mode — how you're funding the down payment while the old
  // house is still unsold. 'sellFirst' keeps the original simultaneous-close
  // behavior (proceeds applied to down payment now). Bridge-loan-specific
  // fields below only matter when saleMode is 'bridgeLoan'.
  saleMode: CONFIG.SALE_MODE_SELL_FIRST,
  // Which kind of financing Bridge Loan mode assumes — see
  // FINANCING_TYPE_BRIDGE_LOAN/FINANCING_TYPE_HELOC above. Only matters when
  // saleMode is 'bridgeLoan'; defaults to the original bridge-loan behavior
  // so existing saved data (from before this field existed) is unaffected.
  bridgeFinancingType: CONFIG.FINANCING_TYPE_BRIDGE_LOAN,
  bridgeLoanAmount: 0,
  bridgeExtraCash: 0,
  bridgeLoanRate: CONFIG.DEFAULT_BRIDGE_LOAN_RATE,
  bridgeLoanFeesPercent: CONFIG.DEFAULT_BRIDGE_LOAN_FEES_PERCENT,
  monthsUntilSale: CONFIG.DEFAULT_MONTHS_UNTIL_SALE,
  recastFee: CONFIG.DEFAULT_RECAST_FEE,
  recastStrategy: CONFIG.SALE_PAYOFF_STRATEGY_RECAST,

  // Collapsible left-column card state — true = collapsed. All start
  // collapsed by default (a first-time visitor sees a short page); once
  // Josh opens a section it stays open across reloads via the same
  // localStorage blob as everything else. Keyed by each card's
  // data-section-key attribute in index.html.
  collapsedSections: {
    property: true,
    sellHouse: true,
    downPayment: true,
    extraPayments: true,
    ratesAndTaxes: true,
    insuranceAndFees: true,
    burndownChart: true
  }
};

export const INPUT_IDS = {
  homePrice: 'homePrice',
  homePriceSlider: 'homePriceSlider',
  downPaymentAmount: 'downPaymentAmount',
  downPaymentPercent: 'downPaymentPercent',
  downPaymentSlider: 'downPaymentSlider',
  interest30: 'interest30',
  interest15: 'interest15',
  taxRate: 'taxRate',
  homeInsurance: 'homeInsurance',
  hoaFees: 'hoaFees',
  pmiRate: 'pmiRate',
  grossAnnualIncome: 'grossAnnualIncome',
  otherMonthlyDebts: 'otherMonthlyDebts',
  btnIncomeBasisGross: 'btn-income-basis-gross',
  btnIncomeBasisNet: 'btn-income-basis-net',
  btnPayFreqBiweekly: 'btn-pay-freq-biweekly',
  btnPayFreqSemiMonthly: 'btn-pay-freq-semimonthly',
  btnPayFreqMonthly: 'btn-pay-freq-monthly',
  incomeBasisPaycheckAmount: 'incomeBasisPaycheckAmount',
  incomeBasisAdjustSlider: 'incomeBasisAdjustSlider',
  btnResetIncomeBasisAdjust: 'btn-reset-income-basis-adjust',
  additionalPayment: 'additionalPayment',
  additionalPaymentSlider: 'additionalPaymentSlider',
  lumpSumAmount: 'lumpSumAmount',
  lumpSumFrequency: 'lumpSumFrequency',
  mlsNumber: 'mlsNumber',
  btnSearchMls: 'btn-search-mls',
  btnViewAmort: 'btn-view-amort',
  loadRatesBtn: 'btn-load-rates',

  // "Have a house to sell?" section
  hasHouseToSell: 'hasHouseToSell',
  sellHomeRedfinUrl: 'sellHomeRedfinUrl',
  btnSearchSellRedfin: 'btn-search-sell-redfin',
  sellHomeValue: 'sellHomeValue',
  sellMortgagePayoff: 'sellMortgagePayoff',
  sellCommissionPercent: 'sellCommissionPercent',
  sellClosingCostsPercent: 'sellClosingCostsPercent',
  sellRepairCosts: 'sellRepairCosts',
  sellConcessions: 'sellConcessions',
  sellMovingCosts: 'sellMovingCosts',
  sellProceedsPercentSlider: 'sellProceedsPercentSlider',
  btnApplyProceeds: 'btn-apply-proceeds',

  // Bridge Loan mode
  btnSaleModeSellFirst: 'btn-sale-mode-sell-first',
  btnSaleModeBridge: 'btn-sale-mode-bridge',
  btnFinancingTypeBridge: 'btn-financing-type-bridge',
  btnFinancingTypeHeloc: 'btn-financing-type-heloc',
  bridgeLoanAmount: 'bridgeLoanAmount',
  bridgeExtraCash: 'bridgeExtraCash',
  monthsUntilSale: 'monthsUntilSale',
  bridgeLoanRate: 'bridgeLoanRate',
  bridgeLoanFeesPercent: 'bridgeLoanFeesPercent',
  recastFee: 'recastFee'
};

export const OUTPUT_IDS = {
  // 30-year outputs
  totalPayment30: 'total-payment-30',
  piPayment30: 'pi-payment-30',
  lifetimeInterest30: 'lifetime-interest-30',
  interestSavings30: 'interest-savings-30',
  timeSavedRow30: 'time-saved-row-30',
  timeSaved30: 'time-saved-30',
  
  // 15-year outputs
  totalPayment15: 'total-payment-15',
  piPayment15: 'pi-payment-15',
  lifetimeInterest15: 'lifetime-interest-15',
  interestSavings15: 'interest-savings-15',
  timeSavedRow15: 'time-saved-row-15',
  timeSaved15: 'time-saved-15',
  
  // Shared display
  chartTotalVal: 'chart-total-val',
  activeTermLabel: 'active-term-label',
  legendPi: 'legend-pi',
  legendTax: 'legend-tax',
  legendIns: 'legend-ins',
  legendPmi: 'legend-pmi',
  legendHoa: 'legend-hoa',
  
  // Affordability
  dtiRatio: 'dti-ratio',
  dtiStatusBadge: 'dti-status-badge',
  dtiProgressBar: 'dti-progress-bar',
  dtiDescription: 'dti-description',
  backendDtiRatio: 'backend-dti-ratio',
  backendDtiBadge: 'backend-dti-badge',
  backendDtiProgressBar: 'backend-dti-progress-bar',
  backendDtiDescription: 'backend-dti-description',
  incomeBasisBreakdown: 'income-basis-breakdown',

  // MLS Preview
  mlsPreviewBox: 'mls-preview-box',
  mlsPreviewAddress: 'mls-preview-address',
  mlsPreviewDetails: 'mls-preview-details',
  
  // Rates Attribution
  ratesAttribution: 'rates-attribution',

  // "Have a house to sell?" section
  sellHousePanel: 'sell-house-panel',
  sellLineValue: 'sell-line-value',
  sellLinePayoff: 'sell-line-payoff',
  sellLineCommission: 'sell-line-commission',
  sellLineClosing: 'sell-line-closing',
  sellLineRepairs: 'sell-line-repairs',
  sellLineConcessions: 'sell-line-concessions',
  sellLineMoving: 'sell-line-moving',
  sellNetProceeds: 'sell-net-proceeds',
  sellUnderwaterWarning: 'sell-underwater-warning',
  sellProceedsPercentValue: 'sell-proceeds-percent-value',
  sellProceedsDollarValue: 'sell-proceeds-dollar-value',
  badgeSellRedfin: 'badge-sell-redfin',
  sellStaleWarning: 'sell-stale-warning',
  sellStaleWarningText: 'sell-stale-warning-text',
  btnRefreshStaleValue: 'btn-refresh-stale-value',

  // Bridge Loan mode
  saleModeSellFirstPanel: 'sale-mode-sell-first-panel',
  saleModeBridgePanel: 'sale-mode-bridge-panel',
  bridgeCltvWarning: 'bridge-cltv-warning',
  bridgeMonthlyInterest: 'bridge-monthly-interest',
  bridgeNewMortgagePayment: 'bridge-new-mortgage-payment',
  bridgeCombinedMonthly: 'bridge-combined-monthly',
  bridgeHoldingDtiRatio: 'bridge-holding-dti-ratio',
  bridgeHoldingDtiBadge: 'bridge-holding-dti-badge',
  bridgeHoldingDtiProgressBar: 'bridge-holding-dti-progress-bar',
  bridgeHoldingDtiDescription: 'bridge-holding-dti-description',
  bridgeHoldingBackendDtiRatio: 'bridge-holding-backend-dti-ratio',
  bridgeHoldingBackendDtiBadge: 'bridge-holding-backend-dti-badge',
  bridgeHoldingBackendDtiProgressBar: 'bridge-holding-backend-dti-progress-bar',
  bridgeHoldingBackendDtiDescription: 'bridge-holding-backend-dti-description',
  bridgeTotalInterest: 'bridge-total-interest',
  bridgeTotalCost: 'bridge-total-cost',
  recastLineNetProceeds: 'recast-line-net-proceeds',
  recastLineBridgePayoff: 'recast-line-bridge-payoff',
  recastAvailable: 'recast-available',
  recastLineFee: 'recast-line-fee',
  recastLumpSum: 'recast-lump-sum',
  recastMinLumpWarning: 'recast-min-lump-warning',
  recastCurrentPayment: 'recast-current-payment',
  recastNewPayment: 'recast-new-payment',
  recastMonthlySavings: 'recast-monthly-savings',
  recastTradeoffNote: 'recast-tradeoff-note'
};

export const CARD_IDS = {
  card30: 'card-30yr',
  card15: 'card-15yr'
};

export const SVG_IDS = {
  burndown30: 'burndown-svg-30',
  burndown15: 'burndown-svg-15'
};
