/**
 * Housing Calculator - Core calculation engine
 * Handles all amortization, DTI, and financial computations
 */

import { CONFIG } from './config.js';
import { parseFloatSafe } from './utils.js';

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

