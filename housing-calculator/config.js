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
  
  // Rate Defaults (used as fallback)
  DEFAULT_RATE_30: 6.5,
  DEFAULT_RATE_15: 5.8,
  DEFAULT_TAX_RATE: 1.2,
  DEFAULT_HOME_INSURANCE: 1200,
  DEFAULT_PMI_RATE: 0.75,
  DEFAULT_GROSS_INCOME: 10000,
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
  
  // API Endpoints
  API_CALCULATOR: '/api/calculator',
  API_RATES: 'rates-proxy.php',
  API_MLS: 'mls-proxy.php',
  
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
  MAX_MONTHS: 1200 // 100 years safety limit
};

export const DEFAULTS = {
  homePrice: CONFIG.DEFAULT_HOME_PRICE,
  downPaymentPercent: CONFIG.DEFAULT_DOWN_PAYMENT_PERCENT,
  downPaymentAmount: CONFIG.DEFAULT_DOWN_PAYMENT_AMOUNT,
  interest30: CONFIG.DEFAULT_RATE_30,
  interest15: CONFIG.DEFAULT_RATE_15,
  taxRate: CONFIG.DEFAULT_TAX_RATE,
  homeInsurance: CONFIG.DEFAULT_HOME_INSURANCE,
  hoaFees: CONFIG.DEFAULT_HOA_FEES,
  pmiRate: CONFIG.DEFAULT_PMI_RATE,
  grossIncome: CONFIG.DEFAULT_GROSS_INCOME,
  additionalPayment: 0,
  lumpSumAmount: 0,
  lumpSumFrequency: CONFIG.DEFAULT_LUMP_SUM_FREQUENCY,
  activeTerm: 30
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
  grossIncome: 'grossIncome',
  additionalPayment: 'additionalPayment',
  additionalPaymentSlider: 'additionalPaymentSlider',
  lumpSumAmount: 'lumpSumAmount',
  lumpSumFrequency: 'lumpSumFrequency',
  mlsNumber: 'mlsNumber',
  btnSearchMls: 'btn-search-mls',
  btnViewAmort: 'btn-view-amort',
  loadRatesBtn: 'btn-load-rates'
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
  ratesAttribution: 'rates-attribution'
};

export const CARD_IDS = {
  card30: 'card-30yr',
  card15: 'card-15yr'
};

export const SVG_IDS = {
  burndown30: 'burndown-svg-30',
  burndown15: 'burndown-svg-15'
};
