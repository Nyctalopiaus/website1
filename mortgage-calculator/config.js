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
  DEFAULT_SELL_MORTGAGE_PAYMENT: 0,
  DEFAULT_SELL_MORTGAGE_SCHEDULE: 'monthly',
  DEFAULT_SELL_COMMISSION_PERCENT: 6,
  DEFAULT_SELL_CLOSING_COSTS_PERCENT: 1.5,
  DEFAULT_SELL_REPAIR_COSTS: 0,
  DEFAULT_SELL_CONCESSIONS: 0,
  DEFAULT_SELL_MOVING_COSTS: 2000,
  DEFAULT_SELL_PROCEEDS_PERCENT: 100,
  // "Sell As-Is Instead?" comparison — asIsSaleValue starts at 0 (comparison
  // box stays hidden until the user opens the section, which auto-suggests
  // a starting value off the entered home value; see attachSellHouseListeners()
  // in app.js). Months-saved default is a rough rule-of-thumb (skipping
  // repairs + a typically-faster as-is/investor sale), always editable.
  DEFAULT_AS_IS_SALE_VALUE: 0,
  DEFAULT_AS_IS_MONTHS_SAVED: 2,

  // Bridge Loan Defaults — used when "Have a house to sell?" is set to
  // Bridge Loan mode instead of Sell First (buy now with a short-term loan
  // against current-home equity, pay it off + recast the new mortgage once
  // the old house actually sells).
  SALE_MODE_SELL_FIRST: 'sellFirst',
  SALE_MODE_BRIDGE_LOAN: 'bridgeLoan',
  // Third "Have a house to sell?" funding mode: don't sell at all — convert
  // the departing home to a rental instead. No sale proceeds fund the down
  // payment in this mode (that comes from the generic cash/other-source
  // fields instead) and no recast ever applies, since there's no future sale
  // event — see calculateRentalOffset() in calculator.js. Deliberately scoped
  // to fixing DTI qualification math only.
  SALE_MODE_RENTAL: 'rental',
  SALE_PAYOFF_STRATEGY_RECAST: 'recast',
  SALE_PAYOFF_STRATEGY_EXTRA_PAYMENT: 'extraPayment',
  // Leftover sale proceeds (after the bridge loan payoff) are simply kept as
  // cash and never touch the new mortgage at all — no recast, no extra
  // principal payment, no change to payment or payoff timeline.
  SALE_PAYOFF_STRATEGY_KEEP_CASH: 'keepCash',
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

  // "Keep as Rental" mode defaults. 75% is the standard conventional
  // (Fannie Mae/Freddie Mac) offset applied to gross rent when qualifying —
  // some portfolio/local lenders use a different figure, so this is just the
  // starting point, always editable.
  DEFAULT_RENTAL_PROJECTED_RENT: 0,
  DEFAULT_RENTAL_OFFSET_PERCENT: 75,

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

  // "Keep as Rental" down-payment funding sub-choice — Cash Only (default;
  // no draw against the departure home, no new DTI line) vs. a HELOC against
  // its equity. Deliberately NOT a Bridge Loan option here: a bridge loan is
  // inherently sale-contingent (paid off in full when the old house sells),
  // and Keep as Rental means no sale is planned, so there's no payoff event
  // to bridge to. A HELOC has no such deadline, which is exactly why it (and
  // only it) fits this mode. Unlike the Sell-mode Bridge Loan/HELOC draw
  // (which conventional underwriting may exclude from DTI as temporary, tied
  // to an imminent sale), a rental-mode HELOC has nothing paying it off, so
  // its payment counts as a permanent monthly debt — see
  // calculateRentalHelocCost() in calculator.js.
  RENTAL_FUNDING_CASH: 'cash',
  RENTAL_FUNDING_HELOC: 'heloc',
  // Same national-average HELOC rate as the Sell-mode default above; kept as
  // its own constant so the two can diverge later without coupling them.
  DEFAULT_RENTAL_HELOC_RATE: 7.3,

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

  // Max Affordability solver + Cash-to-Close tally — reverse-solves the max
  // purchase price/loan for a target back-end DTI, then tallies the actual
  // liquid cash needed (down payment + closing costs + reserves), kept
  // separate from any HELOC/bridge draw. See calculator.js
  // solveMaxAffordablePrice()/calculateCashToClose().
  DEFAULT_TARGET_BACKEND_DTI: 45,
  DEFAULT_CLOSING_COST_PERCENT: 2.5,
  DEFAULT_RESERVE_MONTHS: 3,
  DEFAULT_EXTRA_PROJECT_CASH: 0,
  // How much liquid cash the user actually has on hand, compared against
  // calculateCashToClose()'s totalCashNeeded to show a surplus/shortfall,
  // and fed into evaluateCashCushion() as a rough DTI compensating-factor
  // signal. 0 = not entered (that comparison/note stays hidden).
  DEFAULT_CASH_AVAILABLE: 0,
  // Rough industry rule-of-thumb bands mapping a self-reported credit score
  // to a SUGGESTED back-end DTI ceiling for conventional/automated
  // underwriting (Fannie Mae Desktop Underwriter-style). Used only to
  // prefill the free-form Target DTI field — never a hard rule. suggestedDTI
  // is null for the sub-620 band since a DTI ceiling isn't really the
  // binding constraint at that point.
  CREDIT_SCORE_DTI_BANDS: [
    { value: 'below620', label: 'Below 620', suggestedDTI: null, note: 'Most conventional/automated-underwriting programs want at least ~620 — a DTI ceiling is largely moot below that. FHA may still work; talk to a loan officer.' },
    { value: '620-679', label: '620–679', suggestedDTI: 38, note: 'Conservative conventional ceiling — pushing past this usually needs strong compensating factors (large reserves, low loan-to-value).' },
    { value: '680-719', label: '680–719', suggestedDTI: 45, note: 'A common conventional/automated-underwriting ceiling for a solid, unremarkable file.' },
    { value: '720-759', label: '720–759', suggestedDTI: 47, note: 'Strong file — some automated underwriting will stretch a bit past the standard 45% cap.' },
    { value: '760plus', label: '760+', suggestedDTI: 50, note: "Well-qualified borrowers with reserves can sometimes reach the ~50% ceiling Fannie Mae's Desktop Underwriter allows. Not guaranteed — varies by lender, loan program, and reserves." }
  ],

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
  // Shown briefly on the "Load Live Rates" button when the fetch fails —
  // worded as a soft fallback rather than "Error" so it doesn't read like
  // the feature (or the page) is broken. The rate fields themselves keep
  // whatever value they had; see the fallback attribution text this pairs
  // with in loadLiveMortgageRates().
  MSG_ERROR: '⚠ Unavailable',
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

  // Max Affordability solver + Cash-to-Close tally
  targetBackEndDTI: CONFIG.DEFAULT_TARGET_BACKEND_DTI,
  creditScoreBand: '',
  closingCostPercent: CONFIG.DEFAULT_CLOSING_COST_PERCENT,
  reserveMonths: CONFIG.DEFAULT_RESERVE_MONTHS,
  extraProjectCash: CONFIG.DEFAULT_EXTRA_PROJECT_CASH,
  cashAvailable: CONFIG.DEFAULT_CASH_AVAILABLE,
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
  asIsSaleValue: CONFIG.DEFAULT_AS_IS_SALE_VALUE,
  asIsMonthsSaved: CONFIG.DEFAULT_AS_IS_MONTHS_SAVED,

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

  // "Keep as Rental" mode fields — only matter when saleMode is 'rental'.
  rentalProjectedMonthlyRent: CONFIG.DEFAULT_RENTAL_PROJECTED_RENT,
  rentalOffsetPercent: CONFIG.DEFAULT_RENTAL_OFFSET_PERCENT,
  // How the down payment gets funded when keeping the departure home as a
  // rental instead of selling — see RENTAL_FUNDING_CASH/HELOC above.
  rentalFundingMode: CONFIG.RENTAL_FUNDING_CASH,
  rentalHelocAmount: 0,
  rentalHelocRate: CONFIG.DEFAULT_RENTAL_HELOC_RATE,
  // Auto-calculated (interest-only draw × rate ÷ 12) whenever the amount/rate
  // change, UNLESS the user has typed their own figure — same "auto-fill,
  // never locked" pattern as bridgeLoanAmount in setSaleMode(). 0 = not yet
  // computed/entered.
  rentalHelocPayment: 0,

  // Collapsible card state — true = collapsed. Property and Down Payment
  // start OPEN (the two fields nearly every first-time visitor edits first);
  // everything else starts collapsed, including all four DTI/Affordability
  // sub-groups — that whole card used to load fully expanded, which is what
  // made the right-hand results column run far taller than the input and
  // payment-breakdown columns next to it (dead space below them once the
  // page scrolled past their shorter content). The Outlook Summary card now
  // covers the at-a-glance need, so the detailed DTI groups can stay tucked
  // away until someone drills in. Once a section is opened it stays open
  // across reloads via the same localStorage blob as everything else. Keyed
  // by each card's data-section-key attribute in index.html.
  collapsedSections: {
    property: false,
    sellHouse: true,
    downPayment: false,
    extraPayments: true,
    ratesAndTaxes: true,
    insuranceAndFees: true,
    burndownChart: true,
    dtiGroupInputs: true,
    dtiGroupCashflow: true,
    dtiGroupRatios: true,
    dtiGroupAfford: true,
    sellAsIsCompare: true,
    outlookSummary: true,
    // The "Sell It" and "Keep as Rental" cards split off from the old single
    // sell-house body (2026-09-03) — each independently collapsible, only
    // one visible at a time depending on saleMode. Default collapsed like
    // sellHouse always has been.
    sellHouseSell: true,
    sellHouseRental: true
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
  targetBackEndDTI: 'targetBackEndDTI',
  creditScoreBand: 'creditScoreBand',
  closingCostPercent: 'closingCostPercent',
  reserveMonths: 'reserveMonths',
  extraProjectCash: 'extraProjectCash',
  cashAvailable: 'cashAvailable',
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

  // Max Affordability solver + Cash-to-Close tally
  dtiSummaryAfford: 'dti-summary-afford',
  creditScoreDtiNote: 'credit-score-dti-note',
  maxAffordPhaseNote: 'max-afford-phase-note',
  maxAffordPrice: 'max-afford-price',
  maxAffordLoan: 'max-afford-loan',
  maxAffordPiti: 'max-afford-piti',
  maxAffordBackendDti: 'max-afford-backend-dti',
  maxAffordFrontendDti: 'max-afford-frontend-dti',
  maxAffordEmptyState: 'max-afford-empty-state',
  maxAffordResultBox: 'max-afford-result-box',
  cashToCloseDownPayment: 'cash-to-close-down-payment',
  cashToCloseClosingCosts: 'cash-to-close-closing-costs',
  cashToCloseReserves: 'cash-to-close-reserves',
  cashToCloseReservesLabel: 'cash-to-close-reserves-label',
  cashToCloseProject: 'cash-to-close-project',
  cashToCloseTotal: 'cash-to-close-total',

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
