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
  lumpSumFreq = 12
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

  let balance = principal;
  let totalInterest = 0;
  let monthsCount = 0;
  
  const yearlyBalances = [principal];
  const yearlyInterest = [0];
  const yearlyPayments = [0];

  let cumInterest = 0;
  let cumPrincipal = 0;
  let totalExtraMonthly = 0;
  let totalLumpsum = 0;

  // Month-by-month simulation
  while (balance > CONFIG.LOAN_BALANCE_THRESHOLD && monthsCount < CONFIG.MAX_MONTHS) {
    monthsCount++;
    
    // Interest accrual this month
    const interestThisMonth = balance * monthlyRate;
    const regularPrincipalPaid = Math.max(0, regularPi - interestThisMonth);
    const maxExtra = Math.max(0, balance - regularPrincipalPaid);
    
    // Apply extra monthly payment (capped by remaining balance)
    const actualExtraMonthly = Math.min(additionalPayment, maxExtra);
    totalExtraMonthly += actualExtraMonthly;
    
    // Apply lump sum if it's the right month
    let actualLumpSum = 0;
    if (lumpSumAmount > 0 && monthsCount % lumpSumFreq === 0) {
      actualLumpSum = Math.min(lumpSumAmount, maxExtra - actualExtraMonthly);
    }
    totalLumpsum += actualLumpSum;
    
    // Total principal paid this month
    const actualPrincipalPaid = Math.min(
      balance,
      regularPrincipalPaid + actualExtraMonthly + actualLumpSum
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
    totalInterest,
    monthsToPayoff: monthsCount,
    monthsSaved: Math.max(0, originalMonths - monthsCount),
    yearlyBalances,
    yearlyInterest,
    yearlyPayments,
    totalExtraMonthly,
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
 * Determines DTI affordability status
 * @param {number} dti - DTI ratio as percentage
 * @returns {Object} Status object with label and description
 */
export function getDTIStatus(dti) {
  if (dti < CONFIG.DTI_HEALTHY_MAX) {
    return {
      label: CONFIG.DTI_HEALTHY_LABEL,
      className: 'bg-healthy',
      description: `At ${dti.toFixed(1)}%, this housing payment falls safely below the standard ${CONFIG.DTI_HEALTHY_MAX}% front-end DTI limit. This is considered highly affordable for your income profile.`
    };
  }
  
  if (dti <= CONFIG.DTI_MODERATE_MAX) {
    return {
      label: CONFIG.DTI_MODERATE_LABEL,
      className: 'bg-moderate',
      description: `At ${dti.toFixed(1)}%, your payment is within the ${CONFIG.DTI_HEALTHY_MAX}%–${CONFIG.DTI_MODERATE_MAX}% range. This is moderate, but may stretch your budget if you have substantial other monthly debts (student loans, car payments).`
    };
  }
  
  return {
    label: CONFIG.DTI_HIGH_LABEL,
    className: 'bg-high',
    description: `At ${dti.toFixed(1)}%, this payment exceeds the ${CONFIG.DTI_MODERATE_MAX}% threshold. Traditional lenders may find this risky. Consider making a larger down payment or searching for a lower-priced home.`
  };
}

/**
 * Extracts and validates input values from DOM
 * @param {Object} domRefs - Object containing DOM element references
 * @returns {Object} Extracted input values
 */
export function extractInputValues(domRefs) {
  return {
    homePrice: parseFloatSafe(domRefs.homePriceInput.value, 0),
    downPayment: parseFloatSafe(domRefs.downPaymentAmountInput.value, 0),
    interest30: parseFloatSafe(domRefs.interest30Input.value, 0),
    interest15: parseFloatSafe(domRefs.interest15Input.value, 0),
    taxRate: parseFloatSafe(domRefs.taxRateInput.value, 0),
    homeInsurance: parseFloatSafe(domRefs.homeInsuranceInput.value, 0),
    hoaFees: parseFloatSafe(domRefs.hoaFeesInput.value, 0),
    pmiRate: parseFloatSafe(domRefs.pmiRateInput.value, 0),
    grossIncome: parseFloatSafe(domRefs.grossIncomeInput.value, 1),
    additionalPayment: parseFloatSafe(domRefs.additionalPaymentInput.value, 0),
    lumpSumAmount: parseFloatSafe(domRefs.lumpSumAmountInput.value, 0),
    lumpSumFrequency: parseInt(domRefs.lumpSumFrequencyInput.value, 10) || 12,
    downPaymentPercent: parseFloatSafe(domRefs.downPaymentPercentInput.value, 0)
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
    grossIncome,
    additionalPayment,
    lumpSumAmount,
    lumpSumFrequency
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
  const amort30 = simulatePayoff(loanAmount, interest30, CONFIG.LOAN_TERM_30, additionalPayment, lumpSumAmount, lumpSumFrequency);
  const totalMonthly30 = amort30.regularPi + monthlyTax + monthlyInsurance + monthlyPmi + hoaFees;

  const amort30Monthly = simulatePayoff(loanAmount, interest30, CONFIG.LOAN_TERM_30, additionalPayment, 0, 12);
  const monthlySaved30 = Math.max(0, baselineInterest30 - amort30Monthly.totalInterest);
  const totalSaved30 = Math.max(0, baselineInterest30 - amort30.totalInterest);
  const lumpSumSaved30 = Math.max(0, totalSaved30 - monthlySaved30);

  // 15-Year Calculations
  const baselinePi15 = calcPIPayment(loanAmount, interest15, CONFIG.LOAN_TERM_15);
  const baselineInterest15 = Math.max(0, (baselinePi15 * 180) - loanAmount);
  const amort15 = simulatePayoff(loanAmount, interest15, CONFIG.LOAN_TERM_15, additionalPayment, lumpSumAmount, lumpSumFrequency);
  const totalMonthly15 = amort15.regularPi + monthlyTax + monthlyInsurance + monthlyPmi + hoaFees;

  const amort15Monthly = simulatePayoff(loanAmount, interest15, CONFIG.LOAN_TERM_15, additionalPayment, 0, 12);
  const monthlySaved15 = Math.max(0, baselineInterest15 - amort15Monthly.totalInterest);
  const totalSaved15 = Math.max(0, baselineInterest15 - amort15.totalInterest);
  const lumpSumSaved15 = Math.max(0, totalSaved15 - monthlySaved15);

  return {
    loanAmount,
    downPercent,
    monthlyTax,
    monthlyInsurance,
    monthlyPmi,
    
    // 30-year
    baselinePi30,
    baselineInterest30,
    amort30,
    totalMonthly30,
    monthlySaved30,
    totalSaved30,
    lumpSumSaved30,
    
    // 15-year
    baselinePi15,
    baselineInterest15,
    amort15,
    totalMonthly15,
    monthlySaved15,
    totalSaved15,
    lumpSumSaved15,
    
    // For chart baselines (no extra payments)
    baseline30: (additionalPayment > 0 || lumpSumAmount > 0)
      ? simulatePayoff(loanAmount, interest30, CONFIG.LOAN_TERM_30, 0, 0, 12)
      : null,
    baseline15: (additionalPayment > 0 || lumpSumAmount > 0)
      ? simulatePayoff(loanAmount, interest15, CONFIG.LOAN_TERM_15, 0, 0, 12)
      : null
  };
}
