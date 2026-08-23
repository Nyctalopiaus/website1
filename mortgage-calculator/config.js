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
  
  // Rate Defaults (used as fallback)
  DEFAULT_RATE_30: 6.5,
  DEFAULT_RATE_15: 5.8,
  DEFAULT_TAX_RATE: 1.2,
  DEFAULT_HOME_INSURANCE: 1200,
  DEFAULT_PMI_RATE: 0.75,
  DEFAULT_GROSS_ANNUAL_INCOME: 120000,
  DEFAULT_HOA_FEES: 0,
  DEFAULT_LUMP_SUM_FREQUENCY: 12,
  
  // DTI Thresholds
  DTI_HEALTHY_MAX: 28,
  DTI_MODERATE_MAX: 36,
  DTI_HEALTHY_LABEL: 'Healthy',
  DTI_MODERATE_LABEL: 'Moderate',
  DTI_HIGH_LABEL: 'High Risk',
  
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
  MSG_FETCH_PROPERTY: '🔍 Fetch Property',
  
  // Down Payment Thresholds
  PMI_THRESHOLD_PERCENT: 20,

  // Amortization Precision
  LOAN_BALANCE_THRESHOLD: 0.01, // Cents
  MAX_MONTHS: 1200, // 100 years safety limit

  // "Have a house to sell?" defaults — selling your current home to help
  // fund the down payment on the new one.
  DEFAULT_SELL_HOME_VALUE: 350000,
  DEFAULT_SELL_MORTGAGE_PAYOFF: 180000,
  DEFAULT_SELL_COMMISSION_PERCENT: 6,     // combined buyer+seller agent commission
  DEFAULT_SELL_CLOSING_COSTS_PERCENT: 1.5, // title, escrow, attorney, etc.
  DEFAULT_SELL_REPAIR_COSTS: 0,
  DEFAULT_SELL_CONCESSIONS: 0,
  DEFAULT_SELL_MOVING_COSTS: 2000,
  DEFAULT_SELL_PROCEEDS_PERCENT: 100, // % of net proceeds routed to new down payment

  MSG_SELL_LOOKUP: '⏳ Looking Up...',
  MSG_FETCH_VALUE: '🔍 Look Up Value',
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

  // Epoch ms timestamp of the last time sellHomeValue was set (via lookup
  // or manual edit). null until the value has actually been touched once —
  // an untouched default shouldn't trigger a "this is stale" suggestion.
  sellHomeValueUpdatedAt: null
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
  btnApplyProceeds: 'btn-apply-proceeds'
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
  btnRefreshStaleValue: 'btn-refresh-stale-value'
};

export const CARD_IDS = {
  card30: 'card-30yr',
  card15: 'card-15yr'
};

export const SVG_IDS = {
  burndown30: 'burndown-svg-30',
  burndown15: 'burndown-svg-15'
};
