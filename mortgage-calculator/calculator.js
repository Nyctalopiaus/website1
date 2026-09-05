/**
 * Housing Calculator - Core calculation engine
 * Handles all amortization, DTI, and financial computations
 */

import { CONFIG } from './config.js';
import { parseFloatSafe, formatCurrency } from './utils.js';

/**
 * Calculates monthly principal + interest payment using the standard amortization formula
 * @param {number} principal - Loan amount
 * @param {number} annualRate - Annual interest rate (as percentage)
 * @param {number} years - Loan term in years
 * @returns {number} Monthly P&I payment
 * @example
 * calcPIPayment(300000, 6.5, 30) // Returns monthly payment
 */
export function calcPIPayment(principal, annualRate, years) {
  if (annualRate <= 0) {
    return principal / (years * CONFIG.MONTHS_PER_YEAR);
  }
  
  const monthlyRate = annualRate / 12 / 100;
  const monthsCount = years * CONFIG.MONTHS_PER_YEAR;
  const numerator = monthlyRate * Math.pow(1 + monthlyRate, monthsCount);
  const denominator = Math.pow(1 + monthlyRate, monthsCount) - 1;
  
  return principal * (numerator / denominator);
}

/**
 * Simulates full loan payoff including extra monthly payments and lump sums
 * Generates yearly snapshots of remaining balance, cumulative interest, and cumulative principal
 * @param {number} principal - Initial loan amount
 * @param {number} annualRate - Annual interest rate (%)
 * @param {number} years - Loan term (years)
 * @param {number} additionalPayment - Extra monthly payment beyond regular P&I
 * @param {number} lumpSumAmount - One-time lump sum payment amount
 * @param {number} lumpSumFreq - How often to apply lump sum (in months, e.g., 12 = annually)
 * @returns {Object} Result object with yearly data and totals
 */
export function simulatePayoff(
  principal,
  annualRate,
  years,
  additionalPayment = 0,
  lumpSumAmount = 0,
  lumpSumFreq = 12,
  paymentFrequency = 'monthly',
  biweeklyExtra = 0
) {
  const monthlyRate = annualRate / 12 / 100;
  const originalMonths = years * CONFIG.MONTHS_PER_YEAR;
  
  // Calculate regular monthly P&I
  let regularPi = 0;
  if (annualRate > 0) {
    const numerator = monthlyRate * Math.pow(1 + monthlyRate, originalMonths);
    const denominator = Math.pow(1 + monthlyRate, originalMonths) - 1;
    regularPi = principal * (numerator / denominator);
  } else {
    regularPi = principal / originalMonths;
  }

  // Calculate base biweekly payment according to frequency mode
  let biweeklyPi = 0;
  if (paymentFrequency === 'biweekly') {
    biweeklyPi = (regularPi * 12) / 26;
  } else if (paymentFrequency === 'accelerated') {
    biweeklyPi = regularPi / 2;
  }

  let balance = principal;
  let totalInterest = 0;
  let monthsCount = 0;
  
  const yearlyBalances = [principal];
  const yearlyInterest = [0];
  const yearlyPayments = [0];

  let cumInterest = 0;
  let cumPrincipal = 0;
  let totalExtraMonthly = 0;
  let totalBiweeklyExtra = 0;
  let totalLumpsum = 0;

  // Month-by-month simulation
  while (balance > CONFIG.LOAN_BALANCE_THRESHOLD && monthsCount < CONFIG.MAX_MONTHS) {
    monthsCount++;
    
    // Interest accrual this month
    const interestThisMonth = balance * monthlyRate;
    
    let requiredPiThisMonth = regularPi;
    let biweeklyExtraThisMonth = 0;
    
    if (paymentFrequency === 'biweekly' || paymentFrequency === 'accelerated') {
      // 26 biweekly payments per year: 10 months have 2 payments, 2 months (months 6 & 12) have 3 payments
      const numPayments = (monthsCount % 6 === 0) ? 3 : 2;
      requiredPiThisMonth = numPayments * biweeklyPi;
      biweeklyExtraThisMonth = numPayments * biweeklyExtra;
    }

    const regularPrincipalPaid = Math.max(0, requiredPiThisMonth - interestThisMonth);
    const maxExtra = Math.max(0, balance - regularPrincipalPaid);

    // Apply biweekly extra payment (capped by remaining balance)
    const actualBiweeklyExtra = Math.min(biweeklyExtraThisMonth, maxExtra);
    totalBiweeklyExtra += actualBiweeklyExtra;
    
    // Apply extra monthly payment (capped by remaining balance)
    const maxMonthlyExtra = Math.max(0, maxExtra - actualBiweeklyExtra);
    const actualExtraMonthly = Math.min(additionalPayment, maxMonthlyExtra);
    totalExtraMonthly += actualExtraMonthly;
    
    // Apply lump sum if it's the right month
    let actualLumpSum = 0;
    if (lumpSumAmount > 0 && monthsCount % lumpSumFreq === 0) {
      actualLumpSum = Math.min(lumpSumAmount, Math.max(0, maxMonthlyExtra - actualExtraMonthly));
    }
    totalLumpsum += actualLumpSum;
    
    // Total principal paid this month
    const actualPrincipalPaid = Math.min(
      balance,
      regularPrincipalPaid + actualBiweeklyExtra + actualExtraMonthly + actualLumpSum
    );
    
    // Update running totals
    totalInterest += interestThisMonth;
    cumInterest += interestThisMonth;
    cumPrincipal += actualPrincipalPaid;
    balance -= actualPrincipalPaid;

    // Snapshot at end of each year
    if (monthsCount % CONFIG.MONTHS_PER_YEAR === 0) {
      yearlyBalances.push(Math.max(0, balance));
      yearlyInterest.push(cumInterest);
      yearlyPayments.push(cumPrincipal);
    }
  }

  // Ensure final balance is exactly zero
  if (yearlyBalances[yearlyBalances.length - 1] > CONFIG.LOAN_BALANCE_THRESHOLD) {
    yearlyBalances.push(0);
    yearlyInterest.push(cumInterest);
    yearlyPayments.push(cumPrincipal);
  }

  // Pad remaining years with final cumulative values
  while (yearlyBalances.length <= years) {
    yearlyBalances.push(0);
    yearlyInterest.push(cumInterest);
    yearlyPayments.push(cumPrincipal);
  }

  return {
    regularPi,
    biweeklyPi,
    totalInterest,
    monthsToPayoff: monthsCount,
    monthsSaved: Math.max(0, originalMonths - monthsCount),
    yearlyBalances,
    yearlyInterest,
    yearlyPayments,
    totalExtraMonthly,
    totalBiweeklyExtra,
    totalLumpsum
  };
}

/**
 * Solves for the extra payment (per payment period, matching the given
 * payment frequency) needed to pay a loan off in fewer years than its
 * original term — e.g. "how much extra to pay a 30-year loan off in 15".
 * Binary-searches over simulatePayoff() itself so the result honors the
 * exact same payment-count mechanics (10 months w/ 2 biweekly payments,
 * 2 months w/ 3, etc.) as the rest of the app's extra-payment math, rather
 * than approximating with a closed-form formula.
 * @param {number} principal - Loan amount
 * @param {number} annualRate - Annual interest rate (%)
 * @param {number} originalYears - The loan's actual term (e.g. 30)
 * @param {number} targetYears - Desired payoff term (e.g. 15)
 * @param {string} [paymentFrequency='monthly'] - 'monthly' | 'biweekly' | 'accelerated'
 * @returns {Object} { alreadyMet, extraPerPayment, paymentsPerYear, monthsToPayoff, totalInterest, interestSaved }
 */
export function calcExtraForTargetPayoff(principal, annualRate, originalYears, targetYears, paymentFrequency = 'monthly') {
  const paymentsPerYear = paymentFrequency === 'monthly' ? 12 : 26;

  if (principal <= 0 || targetYears <= 0 || targetYears >= originalYears) {
    return {
      alreadyMet: targetYears >= originalYears,
      extraPerPayment: 0,
      paymentsPerYear,
      monthsToPayoff: 0,
      totalInterest: 0,
      interestSaved: 0
    };
  }

  const targetMonths = Math.round(targetYears * CONFIG.MONTHS_PER_YEAR);
  const useMonthlyExtra = paymentFrequency === 'monthly';

  const runWithExtra = (extra) => useMonthlyExtra
    ? simulatePayoff(principal, annualRate, originalYears, extra, 0, 12, paymentFrequency, 0)
    : simulatePayoff(principal, annualRate, originalYears, 0, 0, 12, paymentFrequency, extra);

  const baseline = runWithExtra(0);

  if (baseline.monthsToPayoff <= targetMonths) {
    return {
      alreadyMet: true,
      extraPerPayment: 0,
      paymentsPerYear,
      monthsToPayoff: baseline.monthsToPayoff,
      totalInterest: baseline.totalInterest,
      interestSaved: 0
    };
  }

  // Grow the upper bound until it clears the target, then binary-search down
  // to the smallest extra payment that still hits it.
  let hi = Math.max(50, principal / targetMonths);
  for (let i = 0; i < 60 && runWithExtra(hi).monthsToPayoff > targetMonths; i++) {
    hi *= 2;
  }

  let lo = 0;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (runWithExtra(mid).monthsToPayoff <= targetMonths) {
      hi = mid;
    } else {
      lo = mid;
    }
  }

  const finalResult = runWithExtra(hi);

  return {
    alreadyMet: false,
    extraPerPayment: hi,
    paymentsPerYear,
    monthsToPayoff: finalResult.monthsToPayoff,
    totalInterest: finalResult.totalInterest,
    interestSaved: Math.max(0, baseline.totalInterest - finalResult.totalInterest)
  };
}

/**
 * Calculates DTI (Debt-to-Income) ratio
 * @param {number} monthlyHousingCost - Monthly housing payment
 * @param {number} grossMonthlyIncome - Gross monthly income
 * @returns {number} DTI ratio as percentage
 */
export function calculateDTI(monthlyHousingCost, grossMonthlyIncome) {
  if (grossMonthlyIncome <= 0) return 0;
  return (monthlyHousingCost / grossMonthlyIncome) * 100;
}

/**
 * Calculates "back-end" DTI: housing cost PLUS other monthly debt
 * obligations (car payments, student loans, credit card minimums, other
 * loans) against gross income. This is what most lenders actually use to
 * qualify a loan — the front-end (housing-only) DTI elsewhere in this file
 * is looser and doesn't reflect a borrower's full debt load.
 * @param {number} monthlyHousingCost
 * @param {number} otherMonthlyDebts
 * @param {number} grossMonthlyIncome
 * @returns {number} Back-end DTI ratio as percentage
 */
export function calculateBackEndDTI(monthlyHousingCost, otherMonthlyDebts, grossMonthlyIncome) {
  return calculateDTI(monthlyHousingCost + Math.max(0, otherMonthlyDebts || 0), grossMonthlyIncome);
}

/**
 * Calculates residual monthly cash flow (uncommitted net income after housing and debts)
 * @param {number} netMonthlyIncome - Estimated or calibrated net take-home pay per month
 * @param {number} monthlyHousingCost - Total monthly housing payment
 * @param {number} otherMonthlyDebts - Other monthly debt payments (car, student loans, etc.)
 * @returns {Object} Result object with totalObligations, residualAmount, and residualPercent
 */
export function calculateResidualIncome(netMonthlyIncome, monthlyHousingCost, otherMonthlyDebts = 0) {
  const totalObligations = monthlyHousingCost + Math.max(0, otherMonthlyDebts || 0);
  const residualAmount = netMonthlyIncome - totalObligations;
  const residualPercent = netMonthlyIncome > 0 ? (residualAmount / netMonthlyIncome) * 100 : 0;
  
  return {
    totalObligations,
    residualAmount,
    residualPercent
  };
}

/**
 * Determines DTI affordability status
 * @param {number} dti - DTI ratio as percentage
 * @param {boolean} [isNetIncome=false] - True if ratio is evaluated against Net (take-home) income
 * @returns {Object} Status object with label and description
 */
export function getDTIStatus(dti, isNetIncome = false) {
  const healthyMax = isNetIncome ? (CONFIG.DTI_NET_HEALTHY_MAX || 33) : CONFIG.DTI_HEALTHY_LABEL ? CONFIG.DTI_HEALTHY_MAX : 28;
  const moderateMax = isNetIncome ? (CONFIG.DTI_NET_MODERATE_MAX || 40) : CONFIG.DTI_MODERATE_MAX;

  if (dti < healthyMax) {
    return {
      label: CONFIG.DTI_HEALTHY_LABEL,
      className: 'bg-healthy',
      description: isNetIncome
        ? `At ${dti.toFixed(1)}%, your mandatory housing payment takes less than ${healthyMax}% of your estimated take-home pay. This is considered a healthy personal budget range, leaving ample cash flow for living expenses.`
        : `At ${dti.toFixed(1)}%, this mandatory housing payment falls safely below the standard ${healthyMax}% front-end DTI limit. This is what mortgage lenders evaluate to qualify your loan for the house.`
    };
  }
  
  if (dti <= moderateMax) {
    return {
      label: CONFIG.DTI_MODERATE_LABEL,
      className: 'bg-moderate',
      description: isNetIncome
        ? `At ${dti.toFixed(1)}%, housing consumes ${healthyMax}%–${moderateMax}% of your take-home paycheck. This is manageable, but requires mindful budgeting for other lifestyle expenses.`
        : `At ${dti.toFixed(1)}%, your mandatory housing payment is within the ${healthyMax}%–${moderateMax}% range. Lenders may accept this for loan qualification, but it could stretch your budget if you have other debts.`
    };
  }
  
  return {
    label: CONFIG.DTI_HIGH_LABEL,
    className: 'bg-high',
    description: isNetIncome
      ? `At ${dti.toFixed(1)}%, housing consumes over ${moderateMax}% of your net take-home pay. This represents a heavy commitment against your monthly paycheck.`
      : `At ${dti.toFixed(1)}%, this mandatory payment exceeds the standard ${moderateMax}% threshold. Mortgage lenders will consider this high-risk for loan approval.`
  };
}

/**
 * Determines back-end DTI affordability status.
 * @param {number} dti - Back-end DTI ratio as percentage
 * @param {boolean} [isNetIncome=false] - True if ratio is evaluated against Net (take-home) income
 * @returns {Object} Status object with label, className, and description
 */
export function getBackEndDTIStatus(dti, isNetIncome = false) {
  const healthyMax = isNetIncome ? (CONFIG.DTI_NET_BACKEND_HEALTHY_MAX || 45) : CONFIG.DTI_BACKEND_HEALTHY_MAX;
  const moderateMax = isNetIncome ? (CONFIG.DTI_NET_BACKEND_MODERATE_MAX || 55) : CONFIG.DTI_BACKEND_MODERATE_MAX;

  if (dti < healthyMax) {
    return {
      label: CONFIG.DTI_HEALTHY_LABEL,
      className: 'bg-healthy',
      description: isNetIncome
        ? `At ${dti.toFixed(1)}%, your total monthly debt commitment (housing + other debts) consumes less than ${healthyMax}% of your take-home pay.`
        : `At ${dti.toFixed(1)}%, your total monthly debt load (housing + other debts) falls safely below the ${healthyMax}% back-end DTI most lenders use.`
    };
  }

  if (dti <= moderateMax) {
    return {
      label: CONFIG.DTI_MODERATE_LABEL,
      className: 'bg-moderate',
      description: isNetIncome
        ? `At ${dti.toFixed(1)}%, total debt commitments consume ${healthyMax}%–${moderateMax}% of your take-home pay. Watch your remaining discretionary budget carefully.`
        : `At ${dti.toFixed(1)}%, your total monthly debt load is within the ${healthyMax}%–${moderateMax}% range many lenders will still qualify, though tighter approval standards or compensating factors may come into play.`
    };
  }

  return {
    label: CONFIG.DTI_HIGH_LABEL,
    className: 'bg-high',
    description: isNetIncome
      ? `At ${dti.toFixed(1)}%, total debt obligations consume over ${moderateMax}% of your net paycheck, leaving limited cash flow for non-debt monthly expenses.`
      : `At ${dti.toFixed(1)}%, your total monthly debt load exceeds the ${moderateMax}% threshold most lenders use for back-end DTI — likely to affect loan approval without strong compensating factors.`
  };
}

/**
 * Rough "national average" estimate of net (take-home) annual income from
 * gross annual income — powers the optional Gross vs. Net (Best Guess)
 * income-basis toggle on the Affordability card. This is NOT tax advice and
 * doesn't know the user's actual filing status, state, dependents,
 * deductions, retirement contributions, or paycheck withholdings — it
 * applies one generic set of assumptions (single filer, standard deduction,
 * current-year federal brackets, FICA, and a blended average state income
 * tax rate) purely so the DTI panels can show a ballpark of what a housing
 * payment looks like against take-home pay, not an exact paycheck figure.
 * @param {number} grossAnnualIncome
 * @returns {Object} { federalTax, ficaTax, stateTax, totalDeductions, netAnnualIncome, effectiveDeductionRate }
 */
export function estimateNetAnnualIncome(grossAnnualIncome) {
  const gross = Math.max(0, grossAnnualIncome || 0);
  if (gross <= 0) {
    return { federalTax: 0, ficaTax: 0, stateTax: 0, totalDeductions: 0, netAnnualIncome: 0, effectiveDeductionRate: 0 };
  }

  // Federal income tax: progressive brackets applied to income after the
  // standard deduction (CONFIG.NET_ESTIMATE_* — see config.js for the
  // current-year figures and sourcing).
  const taxableIncome = Math.max(0, gross - CONFIG.NET_ESTIMATE_STANDARD_DEDUCTION);
  let federalTax = 0;
  let lastCap = 0;
  for (const bracket of CONFIG.NET_ESTIMATE_FEDERAL_BRACKETS) {
    if (taxableIncome <= lastCap) break;
    const amountInBracket = Math.min(taxableIncome, bracket.upTo) - lastCap;
    if (amountInBracket > 0) federalTax += amountInBracket * bracket.rate;
    lastCap = bracket.upTo;
  }

  // FICA: Social Security (capped wage base) + Medicare (uncapped) +
  // Additional Medicare surtax above the single-filer threshold.
  const socialSecurityTax = Math.min(gross, CONFIG.NET_ESTIMATE_SS_WAGE_CAP) * CONFIG.NET_ESTIMATE_SS_RATE;
  const medicareTax = gross * CONFIG.NET_ESTIMATE_MEDICARE_RATE;
  const additionalMedicareTax = Math.max(0, gross - CONFIG.NET_ESTIMATE_ADDL_MEDICARE_THRESHOLD) * CONFIG.NET_ESTIMATE_ADDL_MEDICARE_RATE;
  const ficaTax = socialSecurityTax + medicareTax + additionalMedicareTax;

  // State + local income tax: flat blended national-average rate. Actual
  // burden ranges from 0% (no-income-tax states) to 8%+ (highest-tax states).
  const stateTax = gross * CONFIG.NET_ESTIMATE_AVG_STATE_TAX_RATE;

  const totalDeductions = federalTax + ficaTax + stateTax;
  const netAnnualIncome = Math.max(0, gross - totalDeductions);

  return {
    federalTax,
    ficaTax,
    stateTax,
    totalDeductions,
    netAnnualIncome,
    effectiveDeductionRate: (totalDeductions / gross) * 100
  };
}

/**
 * Converts a single paycheck's dollar amount to its monthly equivalent for
 * a given pay frequency — used by the Net (Best Guess) fine-tune control,
 * which lets a user calibrate against what they actually see land in their
 * account per paycheck instead of an abstract adjustment.
 * @param {number} perPaycheckAmount
 * @param {number} payPeriodsPerYear - e.g. 26 (biweekly), 24 (semi-monthly), 12 (monthly)
 * @returns {number}
 */
export function convertPaycheckToMonthly(perPaycheckAmount, payPeriodsPerYear) {
  if (!payPeriodsPerYear) return 0;
  return (perPaycheckAmount || 0) * payPeriodsPerYear / CONFIG.MONTHS_PER_YEAR;
}

/**
 * Converts a monthly dollar amount back to its per-paycheck equivalent for
 * a given pay frequency — the inverse of convertPaycheckToMonthly().
 * @param {number} monthlyAmount
 * @param {number} payPeriodsPerYear
 * @returns {number}
 */
export function convertMonthlyToPaycheck(monthlyAmount, payPeriodsPerYear) {
  if (!payPeriodsPerYear) return 0;
  return (monthlyAmount || 0) * CONFIG.MONTHS_PER_YEAR / payPeriodsPerYear;
}

/**
 * Calculates net proceeds from selling a current home, and how much of
 * that would be routed toward the new home's down payment.
 * @param {Object} inputs - { sellHomeValue, sellMortgagePayoff, sellCommissionPercent,
 *   sellClosingCostsPercent, sellRepairCosts, sellConcessions, sellMovingCosts, sellProceedsPercent }
 * @returns {Object} Breakdown of costs, net proceeds, and down-payment routing
 */
export function calculateSaleProceeds(inputs) {
  const {
    sellHomeValue = 0,
    sellMortgagePayoff = 0,
    sellCommissionPercent = 0,
    sellClosingCostsPercent = 0,
    sellRepairCosts = 0,
    sellConcessions = 0,
    sellMovingCosts = 0,
    sellProceedsPercent = 0
  } = inputs;

  const commissionAmount = sellHomeValue * (sellCommissionPercent / 100);
  const closingCostsAmount = sellHomeValue * (sellClosingCostsPercent / 100);
  const totalSellingCosts = commissionAmount + closingCostsAmount + sellRepairCosts + sellConcessions + sellMovingCosts;

  // Net proceeds can legitimately be negative (a short sale / bringing cash
  // to closing), so this is intentionally NOT clamped to zero — the UI is
  // responsible for surfacing that as a warning rather than hiding it.
  const netProceeds = sellHomeValue - sellMortgagePayoff - totalSellingCosts;
  const isUnderwater = netProceeds < 0;

  // Only a positive net proceeds figure can actually fund a down payment.
  const availableForDownPayment = Math.max(0, netProceeds);
  const amountToDownPayment = availableForDownPayment * (clamp01Percent(sellProceedsPercent) / 100);
  const remainingCash = availableForDownPayment - amountToDownPayment;

  return {
    commissionAmount,
    closingCostsAmount,
    totalSellingCosts,
    netProceeds,
    isUnderwater,
    availableForDownPayment,
    amountToDownPayment,
    remainingCash
  };
}

function clamp01Percent(value) {
  return Math.min(Math.max(value, 0), 100);
}

/**
 * Compares two paths for a departing home: sell traditionally (after the
 * repairs already budgeted in sellInputs.sellRepairCosts) vs. sell as-is
 * right now at a lower price with no repairs. Reuses calculateSaleProceeds()
 * for both legs — the as-is leg just swaps in the as-is price and zeroes
 * the repair line, so commission/closing (both %-of-price) scale down
 * automatically. The traditional leg's advantage is discounted by the
 * extra carrying cost of the months it takes longer (repairs + slower
 * traditional listing) — an as-is sale is assumed to close sooner.
 * @param {Object} params
 * @param {Object} params.sellInputs - Same shape calculateSaleProceeds() takes (from getSellInputs())
 * @param {number} params.asIsSaleValue - Estimated as-is sale price (no repairs done)
 * @param {number} params.monthsSavedByAsIs - Months of carrying cost skipped by not waiting on repairs/a slower traditional sale
 * @param {number} params.monthlyCarryingCost - Monthly cost of holding the home during that extra time (typically the departure PITI)
 * @returns {{ traditional: Object, asIs: Object, extraCarryingCost: number, netAdvantage: number }}
 *   netAdvantage > 0 means as-is comes out ahead once the traditional path's extra carrying cost is subtracted; < 0 means traditional still wins.
 */
export function compareSaleStrategies({ sellInputs = {}, asIsSaleValue = 0, monthsSavedByAsIs = 0, monthlyCarryingCost = 0 } = {}) {
  const traditional = calculateSaleProceeds(sellInputs);
  const asIs = calculateSaleProceeds({
    ...sellInputs,
    sellHomeValue: Math.max(0, asIsSaleValue),
    sellRepairCosts: 0
  });

  const extraCarryingCost = Math.max(0, monthsSavedByAsIs) * Math.max(0, monthlyCarryingCost);
  const netAdvantage = asIs.netProceeds - (traditional.netProceeds - extraCarryingCost);

  return { traditional, asIs, extraCarryingCost, netAdvantage };
}

/**
 * Normalizes an existing (departure) home mortgage payment to an equivalent monthly amount.
 * @param {number} payment - raw payment amount
 * @param {'monthly'|'biweekly'} [schedule='monthly'] - payment schedule
 * @returns {number} monthly equivalent payment
 */
export function getNormalizedDepartureMortgagePayment(payment, schedule = 'monthly') {
  const numPayment = Math.max(0, parseFloat(payment) || 0);
  if (schedule === 'biweekly') {
    return (numPayment * 26) / 12;
  }
  return numPayment;
}

/**
 * Interest-only carrying costs for a bridge loan taken out against the
 * current home's equity while it's still on the market.
 * @param {Object} inputs - { bridgeLoanAmount, bridgeExtraCash, bridgeLoanRate (annual %),
 *   bridgeLoanFeesPercent (origination points, %), monthsUntilSale }
 * @returns {Object} monthlyInterestOnlyPayment, originationFee,
 *   totalBridgeInterest (over the holding period), totalBridgeCost (interest + fee), totalBorrowed
 */
export function calculateBridgeLoanCosts(inputs) {
  const {
    bridgeLoanAmount = 0,
    bridgeExtraCash = 0,
    bridgeLoanRate = 0,
    bridgeLoanFeesPercent = 0,
    monthsUntilSale = 0
  } = inputs;

  const totalBorrowed = Math.max(0, bridgeLoanAmount) + Math.max(0, bridgeExtraCash);
  const monthlyInterestOnlyPayment = totalBorrowed * (bridgeLoanRate / 100 / 12);
  const originationFee = totalBorrowed * (bridgeLoanFeesPercent / 100);
  const totalBridgeInterest = monthlyInterestOnlyPayment * Math.max(0, monthsUntilSale);
  const totalBridgeCost = totalBridgeInterest + originationFee;

  return {
    monthlyInterestOnlyPayment,
    originationFee,
    totalBridgeInterest,
    totalBridgeCost,
    totalBorrowed
  };
}

/**
 * HELOC cost when "Keep as Rental" funds its down payment by borrowing
 * against the departure home's equity instead of using cash. Deliberately
 * simpler than calculateBridgeLoanCosts() above: no origination fee, no
 * holding-period/total-interest tally, and no recast, because there's no
 * future sale event this loan gets paid off by — it's a permanent revolving
 * debt, so only the ongoing interest-only draw-period payment is modeled.
 * That payment isn't netted against rental income like the departure
 * mortgage is (see calculateRentalOffset below); it's counted as a straight
 * additional monthly debt, since (unlike a sale-contingent Bridge Loan/HELOC
 * in Sell mode) there's no future event that would let underwriting exclude
 * it from DTI.
 * @param {Object} inputs - { rentalHelocAmount, rentalHelocRate }
 * @returns {{ monthlyPayment: number }}
 */
export function calculateRentalHelocCost(inputs) {
  const { rentalHelocAmount = 0, rentalHelocRate = 0 } = inputs;
  const amount = Math.max(0, rentalHelocAmount);
  const rate = Math.max(0, rentalHelocRate);
  return { monthlyPayment: amount * (rate / 100 / 12) };
}

/**
 * DTI qualification math for "Keep as Rental" mode: instead of selling the
 * departing home, convert it to a rental and let a documented lease/market-rent
 * estimate offset its own mortgage payment for qualifying purposes. Standard
 * conventional (Fannie Mae/Freddie Mac) underwriting rule: only a percentage
 * of gross rent counts (a vacancy/expense haircut — 75% by default, editable
 * since some portfolio/local lenders use a different figure), then that offset
 * rent is netted against the departure home's own PITIA payment.
 *   - If the offset rent covers the payment (net position >= 0), the
 *     departure PITIA is excluded from DTI entirely (the standard treatment
 *     when a lease documents the rental income) — conservatively, the
 *     surplus itself is NOT added to qualifying income by default, since not
 *     every lender allows that; it's returned for informational display only.
 *   - If it doesn't cover the payment (net position < 0), the shortfall
 *     counts as a monthly debt against DTI, same as any other obligation.
 * Deliberately scoped to this one qualification question — where the new
 * home's down payment comes from (cash, or a HELOC against this same home's
 * equity) is handled separately by calculateRentalHelocCost() above, and no
 * recast ever applies here since no future sale is planned.
 * @param {Object} inputs - { rentalProjectedMonthlyRent, rentalOffsetPercent, departureMortgagePayment }
 * @returns {{ offsetRent: number, departureMortgagePayment: number, netPosition: number, qualifyingHousingObligation: number, surplusIncome: number }}
 */
export function calculateRentalOffset(inputs) {
  const {
    rentalProjectedMonthlyRent = 0,
    rentalOffsetPercent = 0,
    departureMortgagePayment = 0
  } = inputs;

  const offsetRent = Math.max(0, rentalProjectedMonthlyRent) * (clamp01Percent(rentalOffsetPercent) / 100);
  const safeDeparturePayment = Math.max(0, departureMortgagePayment);
  const netPosition = offsetRent - safeDeparturePayment;

  return {
    offsetRent,
    departureMortgagePayment: safeDeparturePayment,
    netPosition,
    qualifyingHousingObligation: netPosition >= 0 ? 0 : Math.abs(netPosition),
    surplusIncome: Math.max(0, netPosition)
  };
}

/**
 * Remaining balance on a standard fully-amortizing loan after a given
 * number of payments, via the closed-form remaining-balance formula
 * (equivalent to running simulatePayoff's base schedule to that month, but
 * O(1) instead of a month-by-month loop).
 * @param {number} principal - Original loan amount
 * @param {number} annualRate - Annual interest rate (%)
 * @param {number} totalMonths - Full loan term in months
 * @param {number} elapsedMonths - Payments made so far
 * @returns {number} Remaining balance
 */
export function calcRemainingBalance(principal, annualRate, totalMonths, elapsedMonths) {
  const elapsed = Math.min(Math.max(0, elapsedMonths), totalMonths);
  if (elapsed <= 0) return principal;
  if (elapsed >= totalMonths) return 0;

  if (annualRate <= 0) {
    return Math.max(0, principal * (1 - elapsed / totalMonths));
  }

  const r = annualRate / 12 / 100;
  const growthTotal = Math.pow(1 + r, totalMonths);
  const growthElapsed = Math.pow(1 + r, elapsed);
  return Math.max(0, principal * (growthTotal - growthElapsed) / (growthTotal - 1));
}

/**
 * Models recasting the new mortgage once the old house sells: a lump sum
 * (sale proceeds left over after paying off the bridge loan, MINUS the
 * recast fee — the fee comes out of what actually gets applied to
 * principal, not paid separately) is applied to the loan's balance at that
 * point, and the lender re-amortizes the remaining balance over the
 * REMAINING term at the SAME rate — lowering the required monthly P&I
 * instead of shortening the term. Assumes only the loan's base required
 * payment has been made up to the recast point (not factoring in any
 * separate extra/lump-sum payments configured elsewhere in the calculator —
 * real balance would be lower if those are also in play).
 * @param {Object} inputs - { loanAmount, annualRate, termYears, monthsElapsed,
 *   recastLumpSum (before the fee is taken out), recastFee }
 * @returns {Object} Full before/after breakdown, plus a comparison against
 *   applying the same lump sum as a one-time extra payment WITHOUT recasting.
 */
export function calculateRecast(inputs) {
  const {
    loanAmount = 0,
    annualRate = 0,
    termYears = 30,
    monthsElapsed = 0,
    recastLumpSum = 0,
    recastFee = 0
  } = inputs;

  const totalMonths = termYears * CONFIG.MONTHS_PER_YEAR;
  const elapsed = Math.min(Math.max(0, monthsElapsed), totalMonths);
  const monthlyRate = annualRate / 12 / 100;

  const currentMonthlyPI = calcPIPayment(loanAmount, annualRate, termYears);
  const balanceAtRecast = calcRemainingBalance(loanAmount, annualRate, totalMonths, elapsed);

  // Fee is subtracted here (not by the caller) so every caller of
  // calculateRecast() automatically gets a lump sum that's actually net of
  // the fee, rather than each call site having to remember to do it.
  const appliedLumpSum = Math.min(Math.max(0, recastLumpSum - recastFee), balanceAtRecast);
  const newBalance = Math.max(0, balanceAtRecast - appliedLumpSum);
  const remainingMonths = Math.max(1, totalMonths - elapsed);

  const newMonthlyPI = newBalance > 0
    ? calcPIPayment(newBalance, annualRate, remainingMonths / CONFIG.MONTHS_PER_YEAR)
    : 0;
  const monthlySavings = Math.max(0, currentMonthlyPI - newMonthlyPI);
  const interestAfterRecast = Math.max(0, (newMonthlyPI * remainingMonths) - newBalance);

  // Comparison: same lump sum applied as a one-time extra principal payment,
  // but WITHOUT recasting — keep paying the current (higher) required
  // amount. This pays off faster and typically costs less total interest;
  // recasting trades that for a lower payment starting now.
  let monthsToPayoffNoRecast = remainingMonths;
  let interestNoRecast = interestAfterRecast;
  if (newBalance > 0 && currentMonthlyPI > newBalance * monthlyRate) {
    monthsToPayoffNoRecast = monthlyRate > 0
      ? Math.log(1 / (1 - (monthlyRate * newBalance) / currentMonthlyPI)) / Math.log(1 + monthlyRate)
      : newBalance / currentMonthlyPI;
    interestNoRecast = Math.max(0, (currentMonthlyPI * monthsToPayoffNoRecast) - newBalance);
  } else if (newBalance <= 0) {
    monthsToPayoffNoRecast = 0;
    interestNoRecast = 0;
  }

  return {
    currentMonthlyPI,
    balanceAtRecast,
    appliedLumpSum,
    newBalance,
    remainingMonths,
    newMonthlyPI,
    monthlySavings,
    interestAfterRecast,
    monthsToPayoffNoRecast,
    interestNoRecast,
    extraLifetimeInterestFromRecasting: Math.max(0, interestAfterRecast - interestNoRecast),
    monthsLaterPayoffFromRecasting: Math.max(0, remainingMonths - monthsToPayoffNoRecast),
    recastFee
  };
}

/**
 * Extracts and validates input values from DOM
 * @param {Object} domRefs - Object containing DOM element references
 * @returns {Object} Extracted input values
 */
export function extractInputValues(domRefs) {
  let paymentFrequency = 'monthly';
  if (domRefs.btnFreqBiweekly?.classList.contains('active')) {
    paymentFrequency = 'biweekly';
  } else if (domRefs.btnFreqAccelerated?.classList.contains('active')) {
    paymentFrequency = 'accelerated';
  }

  return {
    homePrice: parseFloatSafe(domRefs.homePriceInput.value, 0),
    downPayment: parseFloatSafe(domRefs.downPaymentAmountInput.value, 0),
    interest30: parseFloatSafe(domRefs.interest30Input.value, 0),
    interest15: parseFloatSafe(domRefs.interest15Input.value, 0),
    taxRate: parseFloatSafe(domRefs.taxRateInput.value, 0),
    homeInsurance: parseFloatSafe(domRefs.homeInsuranceInput.value, 0),
    hoaFees: parseFloatSafe(domRefs.hoaFeesInput.value, 0),
    pmiRate: parseFloatSafe(domRefs.pmiRateInput.value, 0),
    grossAnnualIncome: parseFloatSafe(domRefs.grossAnnualIncomeInput.value, 1),
    otherMonthlyDebts: domRefs.otherMonthlyDebtsInput ? parseFloatSafe(domRefs.otherMonthlyDebtsInput.value, 0) : 0,
    additionalPayment: parseFloatSafe(domRefs.additionalPaymentInput.value, 0),
    lumpSumAmount: parseFloatSafe(domRefs.lumpSumAmountInput.value, 0),
    lumpSumFrequency: parseInt(domRefs.lumpSumFrequencyInput.value, 10) || 12,
    downPaymentPercent: parseFloatSafe(domRefs.downPaymentPercentInput.value, 0),
    paymentFrequency,
    biweeklyExtra: domRefs.biweeklyExtraInput ? parseFloatSafe(domRefs.biweeklyExtraInput.value, 0) : 0
  };
}

/**
 * Performs all calculations for the given inputs
 * @param {Object} inputs - Input values from extractInputValues()
 * @returns {Object} Complete calculation results
 */
export function performCalculations(inputs) {
  const {
    homePrice,
    downPayment,
    interest30,
    interest15,
    taxRate,
    homeInsurance,
    hoaFees,
    pmiRate,
    grossAnnualIncome,
    additionalPayment,
    lumpSumAmount,
    lumpSumFrequency,
    paymentFrequency = 'monthly',
    biweeklyExtra = 0
  } = inputs;

  const loanAmount = Math.max(0, homePrice - downPayment);
  const downPercent = homePrice > 0 ? (downPayment / homePrice) * 100 : 0;

  // Monthly costs
  const monthlyTax = (homePrice * (taxRate / 100)) / 12;
  const monthlyInsurance = homeInsurance / 12;
  const monthlyPmi = downPercent < CONFIG.PMI_THRESHOLD_PERCENT
    ? (loanAmount * (pmiRate / 100)) / 12
    : 0;

  // 30-Year Calculations
  const baselinePi30 = calcPIPayment(loanAmount, interest30, CONFIG.LOAN_TERM_30);
  const baselineInterest30 = Math.max(0, (baselinePi30 * 360) - loanAmount);
  const amort30 = simulatePayoff(loanAmount, interest30, CONFIG.LOAN_TERM_30, additionalPayment, lumpSumAmount, lumpSumFrequency, paymentFrequency, biweeklyExtra);
  
  // Effective regular monthly payment display
  let regularMonthlyPI30 = amort30.regularPi;
  if (paymentFrequency === 'biweekly') {
    regularMonthlyPI30 = (amort30.biweeklyPi * 26) / 12;
  } else if (paymentFrequency === 'accelerated') {
    regularMonthlyPI30 = (amort30.biweeklyPi * 26) / 12;
  }
  const totalMonthly30 = regularMonthlyPI30 + monthlyTax + monthlyInsurance + monthlyPmi + hoaFees;

  // Bank Qualifying baseline total monthly cost (contractual baseline for loan qualification)
  const bankMonthlyTotal30 = baselinePi30 + monthlyTax + monthlyInsurance + monthlyPmi + hoaFees;
  const extraMonthlyOutlay30 = (additionalPayment || 0) +
    ((biweeklyExtra || 0) * 26 / 12) +
    (paymentFrequency === 'accelerated' ? (baselinePi30 / 12) : 0) +
    (lumpSumAmount > 0 && lumpSumFrequency > 0 ? (lumpSumAmount / lumpSumFrequency) : 0);
  const effectiveMonthlyTotal30 = bankMonthlyTotal30 + extraMonthlyOutlay30;

  const amort30Monthly = simulatePayoff(loanAmount, interest30, CONFIG.LOAN_TERM_30, additionalPayment, 0, 12, 'monthly', 0);
  const amort30BiweeklyOnly = simulatePayoff(loanAmount, interest30, CONFIG.LOAN_TERM_30, 0, 0, 12, paymentFrequency, biweeklyExtra);
  
  const biweeklySaved30 = (paymentFrequency !== 'monthly' || biweeklyExtra > 0)
    ? Math.max(0, baselineInterest30 - amort30BiweeklyOnly.totalInterest)
    : 0;
  const monthlySaved30 = Math.max(0, baselineInterest30 - amort30Monthly.totalInterest);
  const totalSaved30 = Math.max(0, baselineInterest30 - amort30.totalInterest);
  const lumpSumSaved30 = Math.max(0, totalSaved30 - monthlySaved30 - biweeklySaved30);

  // 15-Year Calculations
  const baselinePi15 = calcPIPayment(loanAmount, interest15, CONFIG.LOAN_TERM_15);
  const baselineInterest15 = Math.max(0, (baselinePi15 * 180) - loanAmount);
  const amort15 = simulatePayoff(loanAmount, interest15, CONFIG.LOAN_TERM_15, additionalPayment, lumpSumAmount, lumpSumFrequency, paymentFrequency, biweeklyExtra);
  
  let regularMonthlyPI15 = amort15.regularPi;
  if (paymentFrequency === 'biweekly') {
    regularMonthlyPI15 = (amort15.biweeklyPi * 26) / 12;
  } else if (paymentFrequency === 'accelerated') {
    regularMonthlyPI15 = (amort15.biweeklyPi * 26) / 12;
  }
  const totalMonthly15 = regularMonthlyPI15 + monthlyTax + monthlyInsurance + monthlyPmi + hoaFees;

  // Bank Qualifying baseline total monthly cost (contractual baseline for 15yr)
  const bankMonthlyTotal15 = baselinePi15 + monthlyTax + monthlyInsurance + monthlyPmi + hoaFees;
  const extraMonthlyOutlay15 = (additionalPayment || 0) +
    ((biweeklyExtra || 0) * 26 / 12) +
    (paymentFrequency === 'accelerated' ? (baselinePi15 / 12) : 0) +
    (lumpSumAmount > 0 && lumpSumFrequency > 0 ? (lumpSumAmount / lumpSumFrequency) : 0);
  const effectiveMonthlyTotal15 = bankMonthlyTotal15 + extraMonthlyOutlay15;

  const amort15Monthly = simulatePayoff(loanAmount, interest15, CONFIG.LOAN_TERM_15, additionalPayment, 0, 12, 'monthly', 0);
  const amort15BiweeklyOnly = simulatePayoff(loanAmount, interest15, CONFIG.LOAN_TERM_15, 0, 0, 12, paymentFrequency, biweeklyExtra);
  
  const biweeklySaved15 = (paymentFrequency !== 'monthly' || biweeklyExtra > 0)
    ? Math.max(0, baselineInterest15 - amort15BiweeklyOnly.totalInterest)
    : 0;
  const monthlySaved15 = Math.max(0, baselineInterest15 - amort15Monthly.totalInterest);
  const totalSaved15 = Math.max(0, baselineInterest15 - amort15.totalInterest);
  const lumpSumSaved15 = Math.max(0, totalSaved15 - monthlySaved15 - biweeklySaved15);

  return {
    loanAmount,
    downPercent,
    monthlyTax,
    monthlyInsurance,
    monthlyPmi,
    paymentFrequency,
    biweeklyExtra,
    interest30,

    // 30-year
    baselinePi30,
    baselineInterest30,
    amort30,
    totalMonthly30,
    bankMonthlyTotal30,
    effectiveMonthlyTotal30,
    extraMonthlyOutlay30,
    monthlySaved30,
    biweeklySaved30,
    totalSaved30,
    lumpSumSaved30,
    
    // 15-year
    baselinePi15,
    baselineInterest15,
    amort15,
    totalMonthly15,
    bankMonthlyTotal15,
    effectiveMonthlyTotal15,
    extraMonthlyOutlay15,
    monthlySaved15,
    biweeklySaved15,
    totalSaved15,
    lumpSumSaved15,
    
    // For chart baselines (no extra payments)
    baseline30: (additionalPayment > 0 || lumpSumAmount > 0 || biweeklyExtra > 0 || paymentFrequency !== 'monthly')
      ? simulatePayoff(loanAmount, interest30, CONFIG.LOAN_TERM_30, 0, 0, 12, 'monthly', 0)
      : null,
    baseline15: (additionalPayment > 0 || lumpSumAmount > 0 || biweeklyExtra > 0 || paymentFrequency !== 'monthly')
      ? simulatePayoff(loanAmount, interest15, CONFIG.LOAN_TERM_15, 0, 0, 12, 'monthly', 0)
      : null
  };
}

/**
 * Generates a loan comparison matrix table data array across a range of house prices
 * @param {Object} params
 * @param {number} params.minPrice - Minimum house price
 * @param {number} params.maxPrice - Maximum house price
 * @param {number} params.step - Price step increment
 * @param {string} params.downPaymentMode - 'fixed' (dollar) or 'percent'
 * @param {number} params.downPaymentValue - Fixed dollar down payment OR down payment percentage
 * @param {number} params.interest15 - 15-year interest rate %
 * @param {number} params.interest30 - 30-year interest rate %
 * @param {number} params.taxRate - Property tax rate %
 * @param {number} params.homeInsurance - Annual home insurance $
 * @param {number} params.hoaFees - Monthly HOA fee $
 * @param {number} params.pmiRate - PMI annual rate %
 * @returns {Array<Object>} Matrix of row objects
 */
export function generateLoanComparisonMatrix({
  minPrice = 300000,
  maxPrice = 700000,
  step = 25000,
  downPaymentMode = 'fixed',
  downPaymentValue = 300000,
  interest15 = 5.875,
  interest30 = 6.625,
  taxRate = 1.0,
  homeInsurance = 800,
  hoaFees = 0,
  pmiRate = 0.5,
  grossAnnualIncome = 120000,
  recastAmount = 0,
  recastMode = 'pre'
}) {
  const rows = [];
  const safeStep = Math.max(1000, step);
  const start = Math.max(0, minPrice);
  const end = Math.max(start, maxPrice);
  const monthlyGross = Math.max(0, grossAnnualIncome / 12);
  const safeRecast = Math.max(0, recastAmount || 0);

  const getStatus = (dti) => {
    if (dti <= 0) return { type: 'healthy', label: '<28%', title: 'Front-end DTI under 28%', class: 'healthy' };
    if (dti <= 28) return { type: 'healthy', label: `${dti.toFixed(1)}%`, title: `${dti.toFixed(1)}% DTI (Healthy / Under 28% Target)`, class: 'healthy' };
    if (dti <= 36) return { type: 'moderate', label: `${dti.toFixed(1)}%`, title: `${dti.toFixed(1)}% DTI (Moderate / 28-36% Cap)`, class: 'moderate' };
    return { type: 'high', label: `${dti.toFixed(1)}%`, title: `${dti.toFixed(1)}% DTI (High Risk / Over 36%)`, class: 'high' };
  };

  let maxBudgetFitIndex = -1;
  let fallbackFitIndex = -1;

  for (let price = start; price <= end; price += safeStep) {
    let initialDownPayment = 0;
    if (downPaymentMode === 'percent') {
      initialDownPayment = Math.round(price * (downPaymentValue / 100));
    } else {
      initialDownPayment = Math.min(price, Math.round(downPaymentValue));
    }

    const preRecastLoanAmount = Math.max(0, price - initialDownPayment);
    const preDownPercent = price > 0 ? (initialDownPayment / price) * 100 : 0;

    const monthlyTax = (price * (taxRate / 100)) / 12;
    const monthlyInsurance = homeInsurance / 12;
    const baseTaxesAndIns = monthlyTax + monthlyInsurance + hoaFees;

    // Pre-Recast Calculation
    const preMonthlyPmi = (preDownPercent < CONFIG.PMI_THRESHOLD_PERCENT && preRecastLoanAmount > 0)
      ? (preRecastLoanAmount * (pmiRate / 100)) / 12
      : 0;

    let prePiti15 = 0;
    let isCash15Pre = false;
    if (preRecastLoanAmount > 0) {
      const pi15 = calcPIPayment(preRecastLoanAmount, interest15, CONFIG.LOAN_TERM_15);
      prePiti15 = pi15 + monthlyTax + monthlyInsurance + preMonthlyPmi + hoaFees;
    } else {
      prePiti15 = baseTaxesAndIns;
      isCash15Pre = true;
    }

    let prePiti30 = 0;
    let isCash30Pre = false;
    if (preRecastLoanAmount > 0) {
      const pi30 = calcPIPayment(preRecastLoanAmount, interest30, CONFIG.LOAN_TERM_30);
      prePiti30 = pi30 + monthlyTax + monthlyInsurance + preMonthlyPmi + hoaFees;
    } else {
      prePiti30 = baseTaxesAndIns;
      isCash30Pre = true;
    }

    // Post-Recast Calculation
    const postTotalDown = Math.min(price, initialDownPayment + safeRecast);
    const postRecastLoanAmount = Math.max(0, price - postTotalDown);
    const postDownPercent = price > 0 ? (postTotalDown / price) * 100 : 0;

    const postMonthlyPmi = (postDownPercent < CONFIG.PMI_THRESHOLD_PERCENT && postRecastLoanAmount > 0)
      ? (postRecastLoanAmount * (pmiRate / 100)) / 12
      : 0;

    let postPiti15 = 0;
    let isCash15Post = false;
    if (postRecastLoanAmount > 0) {
      const pi15 = calcPIPayment(postRecastLoanAmount, interest15, CONFIG.LOAN_TERM_15);
      postPiti15 = pi15 + monthlyTax + monthlyInsurance + postMonthlyPmi + hoaFees;
    } else {
      postPiti15 = baseTaxesAndIns;
      isCash15Post = true;
    }

    let postPiti30 = 0;
    let isCash30Post = false;
    if (postRecastLoanAmount > 0) {
      const pi30 = calcPIPayment(postRecastLoanAmount, interest30, CONFIG.LOAN_TERM_30);
      postPiti30 = pi30 + monthlyTax + monthlyInsurance + postMonthlyPmi + hoaFees;
    } else {
      postPiti30 = baseTaxesAndIns;
      isCash30Post = true;
    }

    // Active mode values
    const isPost = recastMode === 'post';
    const loanAmount = isPost ? postRecastLoanAmount : preRecastLoanAmount;
    const piti15 = isPost ? postPiti15 : prePiti15;
    const piti30 = isPost ? postPiti30 : prePiti30;
    const isCash15 = isPost ? isCash15Post : isCash15Pre;
    const isCash30 = isPost ? isCash30Post : isCash30Pre;

    const dti15 = monthlyGross > 0 ? (piti15 / monthlyGross) * 100 : 0;
    const dti30 = monthlyGross > 0 ? (piti30 / monthlyGross) * 100 : 0;

    const incomeNeeded15 = (piti15 * 12) / 0.28;
    const incomeNeeded30 = (piti30 * 12) / 0.28;

    const monthlySavings15 = Math.max(0, prePiti15 - postPiti15);
    const monthlySavings30 = Math.max(0, prePiti30 - postPiti30);

    const rowIndex = rows.length;
    if (monthlyGross > 0) {
      if (dti30 <= 28) maxBudgetFitIndex = rowIndex;
      if (dti30 <= 36 && fallbackFitIndex === -1) fallbackFitIndex = rowIndex;
    }

    rows.push({
      housePrice: price,
      downPayment: isPost ? postTotalDown : initialDownPayment,
      initialDownPayment,
      recastAmount: safeRecast,
      downPercent: isPost ? postDownPercent : preDownPercent,
      loanAmount,
      preRecastLoanAmount,
      postRecastLoanAmount,
      isCash: loanAmount === 0,
      monthlyTax,
      monthlyInsurance,
      monthlyPmi: isPost ? postMonthlyPmi : preMonthlyPmi,
      hoaFees,
      baseTaxesAndIns,
      piti15,
      piti30,
      prePiti15,
      prePiti30,
      postPiti15,
      postPiti30,
      monthlySavings15,
      monthlySavings30,
      isCash15,
      isCash30,
      dti15,
      dti30,
      dtiStatus15: getStatus(dti15),
      dtiStatus30: getStatus(dti30),
      incomeNeeded15,
      incomeNeeded30,
      isMaxBudgetFit: false
    });
  }

  const bestFitIdx = maxBudgetFitIndex !== -1 ? maxBudgetFitIndex : fallbackFitIndex;
  if (bestFitIdx >= 0 && bestFitIdx < rows.length) {
    rows[bestFitIdx].isMaxBudgetFit = true;
  }

  return rows;
}

/**
 * Rough industry rule-of-thumb mapping a self-reported credit-score band to
 * a SUGGESTED back-end DTI ceiling for conventional/automated-underwriting
 * loans (this is what lets a well-qualified borrower get approved above the
 * standard 45% back-end cap defined in CONFIG.DTI_BACKEND_MODERATE_MAX).
 * This is a heuristic used only to prefill the free-form Target DTI field
 * elsewhere in the UI — never a guarantee of approval. Actual AUS ceilings
 * also depend on reserves, loan-to-value, loan program (FHA/VA/jumbo differ
 * from conventional), and lender-specific overlays.
 * @param {string} band - one of CONFIG.CREDIT_SCORE_DTI_BANDS[].value
 * @returns {{ suggestedDTI: number|null, label: string, note: string }} suggestedDTI is
 *   null when the band has no meaningful DTI ceiling to suggest (e.g. sub-620).
 */
export function creditScoreToSuggestedDTI(band) {
  const match = (CONFIG.CREDIT_SCORE_DTI_BANDS || []).find(b => b.value === band);
  if (!match) {
    return { suggestedDTI: null, label: '', note: '' };
  }
  return { suggestedDTI: match.suggestedDTI, label: match.label, note: match.note };
}

/**
 * Reverse-solves the maximum purchase price / loan amount that keeps the new
 * home's payment within a target back-end DTI, given whatever other monthly
 * obligations already apply — other debts, and (while carrying two homes)
 * the departure mortgage + bridge/HELOC interest-only payment. Inverts the
 * same PITI math used elsewhere in this file (calcPIPayment's factor, the
 * PMI-threshold rule) algebraically instead of scanning price steps like
 * generateLoanComparisonMatrix does, so the answer is exact rather than
 * rounded to a step size.
 * @param {Object} inputs
 * @param {number} inputs.targetBackEndDTI - target back-end DTI, as a percentage (e.g. 45)
 * @param {number} inputs.monthlyIncome - effective monthly income (gross or net, whichever basis is active)
 * @param {number} [inputs.otherMonthlyDebts=0]
 * @param {number} [inputs.existingHousingObligation=0] - 0 for a plain purchase or once the departure home is sold; departure mortgage + bridge/HELOC interest-only payment while still carrying both homes
 * @param {number} [inputs.fixedDownPaymentCash=0] - cash portion of the down payment (not counting any bridge/HELOC draw or sale proceeds)
 * @param {number} [inputs.otherDownPaymentSource=0] - non-cash down payment source: sale proceeds already applied, or the bridge/HELOC draw directed to the down payment
 * @param {number} inputs.interestRate - annual rate, % for the active term
 * @param {number} [inputs.termYears=30]
 * @param {number} [inputs.taxRate=0] - annual property tax rate, % of price
 * @param {number} [inputs.homeInsurance=0] - annual $ (flat, not price-based — matches the rest of this file)
 * @param {number} [inputs.hoaFees=0] - monthly $
 * @param {number} [inputs.pmiRate=0] - annual PMI rate, % of loan
 * @returns {Object|null} { maxPurchasePrice, maxLoanAmount, totalDown, monthlyPI,
 *   monthlyTax, monthlyInsurance, monthlyPmi, hoaFees, piti, frontEndDTI, backEndDTI,
 *   pmiApplies } — null when there's no room at all (existing obligations + other
 *   debts already meet or exceed the target, or income is 0).
 */
export function solveMaxAffordablePrice(inputs) {
  const {
    targetBackEndDTI = 0,
    monthlyIncome = 0,
    otherMonthlyDebts = 0,
    existingHousingObligation = 0,
    fixedDownPaymentCash = 0,
    otherDownPaymentSource = 0,
    interestRate = 0,
    termYears = 30,
    taxRate = 0,
    homeInsurance = 0,
    hoaFees = 0,
    pmiRate = 0
  } = inputs;

  if (monthlyIncome <= 0) return null;

  const maxTotalMonthlyDebt = (Math.max(0, targetBackEndDTI) / 100) * monthlyIncome;
  const maxNewHousingPayment = maxTotalMonthlyDebt - Math.max(0, otherMonthlyDebts) - Math.max(0, existingHousingObligation);
  if (maxNewHousingPayment <= 0) return null;

  const totalDown = Math.max(0, fixedDownPaymentCash) + Math.max(0, otherDownPaymentSource);
  const monthlyRate = interestRate / 12 / 100;
  const totalMonths = Math.max(1, termYears * CONFIG.MONTHS_PER_YEAR);

  // Monthly P&I per $1 of loan amount — same formula as calcPIPayment(),
  // just expressed as a per-dollar factor so it can be inverted algebraically.
  const piFactor = interestRate > 0
    ? (monthlyRate * Math.pow(1 + monthlyRate, totalMonths)) / (Math.pow(1 + monthlyRate, totalMonths) - 1)
    : (1 / totalMonths);

  const taxFactor = Math.max(0, taxRate) / 100 / 12;
  const monthlyInsurance = Math.max(0, homeInsurance) / 12;
  const safeHoa = Math.max(0, hoaFees);

  // price * (piFactor + pmiFactor + taxFactor) = M + totalDown*(piFactor + pmiFactor) - insurance - hoa
  const solveForPmi = (pmiFactor) => {
    const denom = piFactor + pmiFactor + taxFactor;
    if (denom <= 0) return null;
    return (maxNewHousingPayment + totalDown * (piFactor + pmiFactor) - monthlyInsurance - safeHoa) / denom;
  };

  // Two-pass PMI resolution: solve assuming no PMI first, check whether the
  // resulting down% would actually require it, then redo with PMI if so.
  let price = solveForPmi(0);
  let pmiApplies = false;
  if (price !== null && price > 0 && pmiRate > 0) {
    const downPercent = (totalDown / price) * 100;
    if (downPercent < CONFIG.PMI_THRESHOLD_PERCENT) {
      pmiApplies = true;
      price = solveForPmi(pmiRate / 100 / 12);
    }
  }

  if (price === null || price <= 0) return null;

  const maxLoanAmount = Math.max(0, price - totalDown);
  const monthlyPI = maxLoanAmount * piFactor;
  const monthlyTax = price * taxFactor;
  const monthlyPmi = pmiApplies ? maxLoanAmount * (pmiRate / 100 / 12) : 0;
  const piti = monthlyPI + monthlyTax + monthlyInsurance + monthlyPmi + safeHoa;

  return {
    maxPurchasePrice: price,
    maxLoanAmount,
    totalDown,
    monthlyPI,
    monthlyTax,
    monthlyInsurance,
    monthlyPmi,
    hoaFees: safeHoa,
    piti,
    frontEndDTI: (piti / monthlyIncome) * 100,
    backEndDTI: ((piti + existingHousingObligation + otherMonthlyDebts) / monthlyIncome) * 100,
    pmiApplies
  };
}

/**
 * Tallies the actual liquid cash needed at/after closing, kept deliberately
 * separate from any revolving HELOC/bridge draw — reserves and closing costs
 * must be real cash (or vested stocks/401k/IRA), never satisfiable from a
 * HELOC/bridge line, mirroring standard lender reserve requirements.
 * @param {Object} inputs
 * @param {number} [inputs.downPaymentCash=0] - cash portion of the down payment (not the HELOC/bridge draw)
 * @param {number} [inputs.purchasePrice=0]
 * @param {number} [inputs.closingCostPercent=0] - % of purchase price
 * @param {number} [inputs.reserveMonths=0] - months of housing payment required in reserve
 * @param {number} [inputs.monthlyHousingObligation=0] - the payment reserves are sized against (combined holding-period cost while carrying two homes, else the new PITI)
 * @param {number} [inputs.extraProjectCash=0] - additional cash budgeted separately (repairs, moving, etc.)
 * @returns {{ downPaymentCash: number, closingCostsDollars: number, reserveDollars: number, extraProjectCash: number, totalCashNeeded: number }}
 */
export function calculateCashToClose(inputs) {
  const {
    downPaymentCash = 0,
    purchasePrice = 0,
    closingCostPercent = 0,
    reserveMonths = 0,
    monthlyHousingObligation = 0,
    extraProjectCash = 0
  } = inputs;

  const safeDownPayment = Math.max(0, downPaymentCash);
  const closingCostsDollars = Math.max(0, purchasePrice) * (Math.max(0, closingCostPercent) / 100);
  const reserveDollars = Math.max(0, reserveMonths) * Math.max(0, monthlyHousingObligation);
  const safeExtra = Math.max(0, extraProjectCash);

  return {
    downPaymentCash: safeDownPayment,
    closingCostsDollars,
    reserveDollars,
    extraProjectCash: safeExtra,
    totalCashNeeded: safeDownPayment + closingCostsDollars + reserveDollars + safeExtra
  };
}

/**
 * Compares cash actually on hand against the total cash needed to close
 * (calculateCashToClose()'s totalCashNeeded) and gives a rough read on
 * whether the leftover surplus is generous enough that lenders might treat
 * it as a compensating factor for a higher back-end DTI ceiling. Purely
 * informational — same "suggests, never forces" pattern as
 * creditScoreToSuggestedDTI(); never writes to the Target DTI field itself.
 * @param {Object} inputs
 * @param {number} [inputs.cashAvailable=0] - liquid cash the user reports having on hand
 * @param {number} [inputs.totalCashNeeded=0] - calculateCashToClose().totalCashNeeded
 * @param {number} [inputs.monthlyHousingObligation=0] - same basis calculateCashToClose() sized reserves against
 * @returns {{ surplus: number, extraReserveMonths: number, suggestedDTIBonus: number }}
 *   surplus can be negative (a shortfall). extraReserveMonths is how many
 *   additional months of the housing payment the surplus, if any, would
 *   cover on top of the reserves already required. suggestedDTIBonus is a
 *   small heuristic bump in percentage points (0, 2, or 3) — 0 whenever no
 *   cash figure is entered or there's no real surplus.
 */
export function evaluateCashCushion(inputs) {
  const {
    cashAvailable = 0,
    totalCashNeeded = 0,
    monthlyHousingObligation = 0
  } = inputs;

  const safeCash = Math.max(0, cashAvailable);
  const surplus = safeCash - Math.max(0, totalCashNeeded);
  const extraReserveMonths = monthlyHousingObligation > 0 ? surplus / monthlyHousingObligation : 0;

  let suggestedDTIBonus = 0;
  if (safeCash > 0 && surplus >= 0) {
    if (extraReserveMonths >= 6) suggestedDTIBonus = 3;
    else if (extraReserveMonths >= 3) suggestedDTIBonus = 2;
  }

  return { surplus, extraReserveMonths, suggestedDTIBonus };
}

/**
 * Synthesizes the currently-filled-out settings and the feasibility of the
 * scenario they describe into a short, plain-language "outlook" — a handful
 * of read lines plus one overall verdict. Entirely rule-based: every line is
 * templated off values and status helpers already computed elsewhere in this
 * file (getBackEndDTIStatus, the PMI threshold, solveMaxAffordablePrice,
 * calculateCashToClose, calculateRecast, calculateResidualIncome) — no LLM
 * call, no new financial thresholds beyond CONFIG.
 * @param {Object} results - the results object from performCalculations(),
 *   extended with the fields calculateAll() adds (effectiveMonthlyIncome,
 *   isNetIncomeBasis, isRecastActive, recast30/recast15, etc.)
 * @param {Object} [context={}] - values local to calculateAll() at call time
 * @param {number} [context.activeTerm=30] - 30 or 15
 * @param {number} [context.activeRate=0] - the active term's interest rate, %
 * @param {number} [context.homePrice=0]
 * @param {number} [context.backEndDtiValue=0] - back-end DTI %, already computed for the active phase
 * @param {number} [context.otherMonthlyDebts=0]
 * @param {boolean} [context.isBridgeActive=false]
 * @param {Object|null} [context.activeRecast=null] - results.recast30/recast15 for the active term, when a recast is active
 * @param {Object|null} [context.maxAfford=null] - solveMaxAffordablePrice() output, when a target DTI is set
 * @param {number} [context.targetBackEndDTI=0]
 * @param {Object|null} [context.cashToClose=null] - calculateCashToClose() output
 * @param {number} [context.cashAvailable=0] - liquid cash the user reports having on hand
 * @param {number} [context.extraMonthlyOutlay=0] - extraMonthlyOutlay30/15 for the active term
 * @param {Object|null} [context.asIsCompare=null] - compareSaleStrategies() output, when an as-is sale value is entered
 * @param {boolean} [context.isAsIsPricingApplied=false] - true once the user has clicked "Apply As-Is Pricing to Sale", copying the as-is value into the real sale inputs
 * @param {Object|null} [context.asIsAppliedComparison=null] - compareSaleStrategies() output replayed against the pre-apply snapshot vs. the now-applied sale inputs, when isAsIsPricingApplied is true
 * @param {number} [context.asIsPriceDelta=0] - pre-apply sellHomeValue minus the applied as-is price (>0 means the as-is price is lower)
 * @param {number} [context.asIsRepairsSaved=0] - pre-apply sellRepairCosts (now zeroed by the apply)
 * @param {Object|null} [context.rentalOffset=null] - calculateRentalOffset() output, when "Keep as Rental" mode is active
 * @param {Object|null} [context.rentalHeloc=null] - { helocAmount, monthlyPayment }, when Keep as Rental funds its down payment via a HELOC
 * @returns {{ verdict: 'good'|'moderate'|'high', verdictLabel: string, verdictClass: string,
 *   lines: Array<{tone: 'good'|'moderate'|'high'|'neutral', icon: string, text: string}> }}
 */
export function generateOutlookSummary(results, context = {}) {
  const {
    activeTerm = 30,
    activeRate = 0,
    homePrice = 0,
    backEndDtiValue = 0,
    otherMonthlyDebts = 0,
    isBridgeActive = false,
    activeRecast = null,
    bridgeSaleStrategy = null,
    maxAfford = null,
    targetBackEndDTI = 0,
    cashToClose = null,
    cashAvailable = 0,
    extraMonthlyOutlay = 0,
    asIsCompare = null,
    isAsIsPricingApplied = false,
    asIsAppliedComparison = null,
    asIsPriceDelta = 0,
    asIsRepairsSaved = 0,
    rentalOffset = null,
    rentalHeloc = null
  } = context;

  const isNetIncomeBasis = !!results.isNetIncomeBasis;
  const effectiveMonthlyIncome = results.effectiveMonthlyIncome || 0;
  const hasIncome = effectiveMonthlyIncome > 0;
  const loanAmount = results.loanAmount || 0;
  const downPercent = results.downPercent || 0;
  const monthlyPmi = results.monthlyPmi || 0;
  const pmiApplies = downPercent < CONFIG.PMI_THRESHOLD_PERCENT && monthlyPmi > 0;
  const totalMonthly = activeTerm === 30 ? results.totalMonthly30 : results.totalMonthly15;

  const lines = [];
  let highRiskSignal = false;
  let moderateSignal = false;

  // 1. Headline — loan size, rate, term, current effective payment.
  lines.push({
    tone: 'neutral',
    icon: 'icon-home',
    text: `${formatCurrency(loanAmount)} loan at ${activeRate}% over ${activeTerm} years — about ${formatCurrency(totalMonthly)}/mo right now.`
  });

  // 2. Back-end DTI feasibility — skipped until income is actually filled in,
  // since a 0/0 DTI would otherwise read as a false "Healthy".
  if (hasIncome) {
    const dtiStatus = getBackEndDTIStatus(backEndDtiValue, isNetIncomeBasis);
    if (dtiStatus.className === 'bg-high') highRiskSignal = true;
    else if (dtiStatus.className === 'bg-moderate') moderateSignal = true;

    lines.push({
      tone: dtiStatus.className === 'bg-healthy' ? 'good' : dtiStatus.className === 'bg-moderate' ? 'moderate' : 'high',
      icon: dtiStatus.className === 'bg-high' ? 'icon-warning' : 'icon-check',
      text: dtiStatus.description
    });
  }

  // 3. PMI / down payment.
  if (pmiApplies) {
    const pointsToTwentyPercent = Math.max(0, CONFIG.PMI_THRESHOLD_PERCENT - downPercent);
    lines.push({
      tone: 'moderate',
      icon: 'icon-info',
      text: `Your ${downPercent.toFixed(1)}% down payment is ${pointsToTwentyPercent.toFixed(1)} points below the 20% mark, so PMI applies at about ${formatCurrency(monthlyPmi)}/mo until you cross that threshold.`
    });
  } else if (downPercent > 0) {
    lines.push({
      tone: 'good',
      icon: 'icon-check',
      text: `Your ${downPercent.toFixed(1)}% down payment clears the 20% PMI threshold — no mortgage insurance required.`
    });
  }

  // 4. Bridge / recast feasibility — only while the "sell house" bridge flow is active.
  if (isBridgeActive && activeRecast) {
    if (bridgeSaleStrategy === CONFIG.SALE_PAYOFF_STRATEGY_KEEP_CASH) {
      lines.push({
        tone: 'neutral',
        icon: 'icon-info',
        text: `You're keeping the leftover sale proceeds as cash instead of applying them to the new loan — this payment won't change once the sale closes.`
      });
    } else if (activeRecast.monthlySavings > 0) {
      lines.push({
        tone: 'good',
        icon: 'icon-trend-down',
        text: `Once your current home sells and the recast applies, this payment drops by about ${formatCurrency(activeRecast.monthlySavings)}/mo — a real reduction, not just cash spent.`
      });
    } else if (bridgeSaleStrategy === CONFIG.SALE_PAYOFF_STRATEGY_EXTRA_PAYMENT) {
      lines.push({
        tone: 'good',
        icon: 'icon-trend-down',
        text: `You're applying the leftover sale proceeds as an extra principal payment instead of recasting — this payment stays the same, but the loan pays off sooner and you save on interest.`
      });
    } else {
      moderateSignal = true;
      lines.push({
        tone: 'moderate',
        icon: 'icon-warning',
        text: `The planned recast isn't projected to lower this payment — the sale proceeds may be fully absorbed by the bridge payoff and recast fee.`
      });
    }
  }

  // 4b. Rental-income DTI offset — only while "Keep as Rental" mode is active.
  if (rentalOffset) {
    if (rentalOffset.netPosition >= 0) {
      lines.push({
        tone: 'good',
        icon: 'icon-check',
        text: `Renting your current home at ${formatCurrency(rentalOffset.offsetRent)}/mo (after the offset) fully covers its ${formatCurrency(rentalOffset.departureMortgagePayment)}/mo mortgage, so it's excluded from your DTI entirely.`
      });
    } else {
      moderateSignal = true;
      lines.push({
        tone: 'moderate',
        icon: 'icon-warning',
        text: `Renting your current home offsets ${formatCurrency(rentalOffset.offsetRent)}/mo of its ${formatCurrency(rentalOffset.departureMortgagePayment)}/mo mortgage — the remaining ${formatCurrency(Math.abs(rentalOffset.netPosition))}/mo shortfall still counts against your DTI.`
      });
    }
  }

  // 4c. Rental HELOC financing — only when Keep as Rental funds its down
  // payment with a HELOC against the departure home instead of cash. Purely
  // informational (the payment is already folded into the back-end DTI shown
  // in line 2 above) — flags WHY that DTI is as high as it is, since unlike
  // the sale-contingent Bridge Loan case there's no future payoff event.
  if (rentalHeloc && rentalHeloc.monthlyPayment > 0) {
    lines.push({
      tone: 'neutral',
      icon: 'icon-info',
      text: `Your down payment draws ${formatCurrency(rentalHeloc.helocAmount)} from a HELOC against your current home — with no sale planned to pay it off, its ${formatCurrency(rentalHeloc.monthlyPayment)}/mo interest-only payment counts as a permanent monthly debt in your DTI.`
    });
  }

  // 5. Extra-payment sustainability — Net income mode only, same gating as
  // the Residual Cash Flow banner this reuses calculateResidualIncome from.
  let residual = null;
  if (isNetIncomeBasis && hasIncome) {
    residual = calculateResidualIncome(effectiveMonthlyIncome, totalMonthly, otherMonthlyDebts);
    if (residual.residualAmount < 0) {
      highRiskSignal = true;
      lines.push({
        tone: 'high',
        icon: 'icon-warning',
        text: `After housing and other debts, your budget currently runs ${formatCurrency(Math.abs(residual.residualAmount))}/mo short against take-home pay${extraMonthlyOutlay > 0 ? ` — and that's before the ${formatCurrency(extraMonthlyOutlay)}/mo you're adding on top of the minimum` : ''}.`
      });
    } else if (extraMonthlyOutlay > 0) {
      lines.push({
        tone: 'good',
        icon: 'icon-check',
        text: `Your accelerated/extra-payment plan adds ${formatCurrency(extraMonthlyOutlay)}/mo, and still leaves about ${formatCurrency(residual.residualAmount)}/mo in cash flow after housing and other debts.`
      });
    }
  }

  // 6. Max-affordability cross-check — only when a target DTI ceiling is set.
  if (maxAfford && targetBackEndDTI > 0 && homePrice > 0) {
    const headroom = maxAfford.maxPurchasePrice - homePrice;
    if (headroom >= 0) {
      lines.push({
        tone: 'good',
        icon: 'icon-bar-chart',
        text: `At your ${targetBackEndDTI}% target DTI, you could afford up to ${formatCurrency(maxAfford.maxPurchasePrice)} — this ${formatCurrency(homePrice)} price leaves about ${formatCurrency(headroom)} of headroom.`
      });
    } else {
      highRiskSignal = true;
      lines.push({
        tone: 'high',
        icon: 'icon-warning',
        text: `This ${formatCurrency(homePrice)} price is about ${formatCurrency(Math.abs(headroom))} over what your ${targetBackEndDTI}% target DTI would support (max ${formatCurrency(maxAfford.maxPurchasePrice)}).`
      });
    }
  }

  // 7. Cash to close — compares against cash on hand when entered, always
  // separated from any HELOC/bridge draw.
  if (cashToClose && cashToClose.totalCashNeeded > 0) {
    if (cashAvailable > 0) {
      const surplus = cashAvailable - cashToClose.totalCashNeeded;
      if (surplus >= 0) {
        lines.push({
          tone: 'good',
          icon: 'icon-cash',
          text: `Your ${formatCurrency(cashAvailable)} in cash on hand covers the ${formatCurrency(cashToClose.totalCashNeeded)} needed to close, with about ${formatCurrency(surplus)} to spare.`
        });
      } else {
        highRiskSignal = true;
        lines.push({
          tone: 'high',
          icon: 'icon-warning',
          text: `Your ${formatCurrency(cashAvailable)} in cash on hand is about ${formatCurrency(Math.abs(surplus))} short of the ${formatCurrency(cashToClose.totalCashNeeded)} needed to close.`
        });
      }
    } else {
      lines.push({
        tone: 'neutral',
        icon: 'icon-cash',
        text: `You'll need roughly ${formatCurrency(cashToClose.totalCashNeeded)} in actual liquid cash at closing (down payment, closing costs, and reserves) — separate from any HELOC/bridge draw.`
      });
    }
  }

  // 7b. Sell As-Is comparison — only once entered, and only when the gap
  // clears a small noise threshold (a few hundred dollars either way isn't
  // worth a line). Purely informational either direction — neither path is
  // treated as objectively "better," so this never feeds highRiskSignal/moderateSignal.
  if (asIsCompare && Math.abs(asIsCompare.netAdvantage) > 2000) {
    const asIsWins = asIsCompare.netAdvantage >= 0;
    lines.push({
      tone: 'neutral',
      icon: 'icon-bar-chart',
      text: asIsWins
        ? `Selling as-is instead of repairing first could net you about ${formatCurrency(asIsCompare.netAdvantage)} more, once the traditional path's extra carrying costs are factored in.`
        : `Repairing and selling traditionally still nets about ${formatCurrency(Math.abs(asIsCompare.netAdvantage))} more than selling as-is, even after accounting for the extra carrying costs of waiting.`
    });
  }

  // 7c. As-Is pricing applied — shown only after the user has actually
  // clicked "Apply As-Is Pricing to Sale" on the compare box above, not just
  // for entering a what-if value. Two lines: the financial "why" (price/
  // repair/carrying-cost tradeoff, replaying the same compareSaleStrategies()
  // math the box itself used, against the pre-apply snapshot) and a
  // buyer-pool caution. Neither feeds highRiskSignal/moderateSignal or moves
  // the overall verdict badge — same "informational" reasoning as 7b above.
  if (isAsIsPricingApplied && asIsAppliedComparison) {
    const netAdvantageAbs = Math.abs(asIsAppliedComparison.netAdvantage);
    const netAdvantageWins = asIsAppliedComparison.netAdvantage >= 0;
    const priceVerb = asIsPriceDelta >= 0 ? 'dropped' : 'raised';
    const priceAmt = formatCurrency(Math.abs(asIsPriceDelta));
    const repairsClause = asIsRepairsSaved > 0 ? ` and skipped ${formatCurrency(asIsRepairsSaved)} in repairs` : '';

    lines.push({
      tone: 'neutral',
      icon: 'icon-bar-chart',
      text: `Applying As-Is pricing ${priceVerb} your sale price by about ${priceAmt}${repairsClause} — after the extra carrying costs a repair-first sale would've added, that nets you about ${formatCurrency(netAdvantageAbs)} ${netAdvantageWins ? 'more' : 'less'} than selling traditionally would have.`
    });
    lines.push({
      tone: 'moderate',
      icon: 'icon-warning',
      text: `Keep in mind many buyers prefer move-in-ready homes, so listing as-is can shrink your buyer pool and mean more time on market than a repaired, traditional sale.`
    });
  }

  // 8. Bottom-line verdict — a small deterministic decision table over the
  // signals collected above, not a new judgment call.
  let verdict = 'good';
  if (highRiskSignal) verdict = 'high';
  else if (moderateSignal) verdict = 'moderate';

  const verdictMeta = {
    good: { label: 'Feasible', className: 'bg-healthy' },
    moderate: { label: 'Feasible, but tight', className: 'bg-moderate' },
    high: { label: 'A stretch', className: 'bg-high' }
  }[verdict];

  return {
    verdict,
    verdictLabel: verdictMeta.label,
    verdictClass: verdictMeta.className,
    lines
  };
}

