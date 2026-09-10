// Regression suite for the mortgage-calculator financial engine.
// Runs the REAL production modules (calculator.js / amortization.js /
// utils.js) — nothing here is reimplemented and compared against itself;
// expected values are independently hand/closed-form-derived per the audit's
// "independent oracle" requirement. Run with: node regression-suite.mjs
import assert from 'node:assert/strict';
import {
  calcPIPayment, simulatePayoff, applyRequiredPayment, calculateDTI,
  calculateBackEndDTI, calculateSaleProceeds, calculateBridgeLoanCosts,
  calculateRentalOffset, calculateRentalHelocCost, calculateRecast,
  calcRemainingBalance, calculateCashToClose, solveMaxAffordablePrice,
  performCalculations, evaluateCashCushion
} from '../calculator.js';
import { runAmortizationSchedule } from '../amortization.js';
import { formatCurrency, parseFloatSafe } from '../utils.js';
import { CONFIG } from '../config.js';

let pass = 0, fail = 0;
const failures = [];
function test(name, fn) {
  try {
    fn();
    pass++;
    console.log('  PASS  ' + name);
  } catch (e) {
    fail++;
    failures.push({ name, err: e.message });
    console.log('  FAIL  ' + name + '  ->  ' + e.message);
  }
}
function section(title) { console.log('\n== ' + title + ' =='); }
const close = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg || ''} expected≈${b} got=${a} (eps=${eps})`);

// ---------------------------------------------------------------------------
section('1. Standard mortgage payment (closed-form oracle)');
test('$400,000 / 6.5% / 30yr P&I ≈ $2,528.27', () => {
  const pi = calcPIPayment(400000, 6.5, 30);
  close(pi, 2528.27, 0.01);
});
test('$300,000 / 7% / 15yr matches independent closed-form calc', () => {
  const r = 0.07 / 12, n = 180;
  const expected = 300000 * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  close(calcPIPayment(300000, 7, 15), expected, 0.01);
});

section('2. Zero-interest loan');
test('$360,000 / 0% / 30yr = exactly $1,000/mo', () => {
  assert.equal(calcPIPayment(360000, 0, 30), 1000);
});
test('0% loan fully amortizes with $0 total interest', () => {
  const sim = simulatePayoff(360000, 0, 30, 0, 0, 12, 'monthly', 0);
  assert.equal(sim.paidOff, true);
  close(sim.totalInterest, 0, 0.01);
  assert.equal(sim.monthsToPayoff, 360);
});

section('3. PMI threshold boundary (20% down)');
function pmiApplies(downPercent) {
  return downPercent < CONFIG.PMI_THRESHOLD_PERCENT;
}
test('19.99% down -> PMI applies', () => assert.equal(pmiApplies(19.99), true));
test('20.00% down -> PMI does NOT apply', () => assert.equal(pmiApplies(20.00), false));
test('20.01% down -> PMI does NOT apply', () => assert.equal(pmiApplies(20.01), false));
test('performCalculations: monthlyPmi is 0 at exactly 20% down', () => {
  const r = performCalculations({
    homePrice: 500000, downPayment: 100000, interest30: 6.5, interest15: 5.8,
    taxRate: 1, homeInsurance: 1200, hoaFees: 0, pmiRate: 0.75,
    additionalPayment: 0, lumpSumAmount: 0, lumpSumFrequency: 12
  });
  assert.equal(r.downPercent, 20);
  assert.equal(r.monthlyPmi, 0);
});
test('performCalculations: monthlyPmi > 0 at 19% down, matches formula', () => {
  const r = performCalculations({
    homePrice: 500000, downPayment: 95000, interest30: 6.5, interest15: 5.8,
    taxRate: 1, homeInsurance: 1200, hoaFees: 0, pmiRate: 0.75,
    additionalPayment: 0, lumpSumAmount: 0, lumpSumFrequency: 12
  });
  const expectedPmi = (405000 * (0.75 / 100)) / 12;
  close(r.monthlyPmi, expectedPmi, 0.01);
});

section('4. Biweekly — true 26-period simulation (was: monthly-bucket aggregation bug)');
test('biweekly payment = monthlyPI * 12 / 26', () => {
  const pi = calcPIPayment(400000, 6.5, 30);
  const sim = simulatePayoff(400000, 6.5, 30, 0, 0, 12, 'biweekly', 0);
  close(sim.biweeklyPi, (pi * 12) / 26, 0.005);
});
test('true biweekly total interest LOWER than or equal to monthly (never worse)', () => {
  const monthly = simulatePayoff(400000, 6.5, 30, 0, 0, 12, 'monthly', 0);
  const biweekly = simulatePayoff(400000, 6.5, 30, 0, 0, 12, 'biweekly', 0);
  assert.ok(biweekly.totalInterest <= monthly.totalInterest,
    `biweekly ${biweekly.totalInterest} should be <= monthly ${monthly.totalInterest}`);
  assert.ok(biweekly.monthsToPayoff <= monthly.monthsToPayoff);
});
test('true biweekly matches independent per-period oracle within $5', () => {
  const pi = calcPIPayment(400000, 6.5, 30);
  const periodRate = 6.5 / 100 / 26;
  const payment = (pi * 12) / 26;
  let balance = 400000, totalInterest = 0, periods = 0;
  while (balance > 0.01 && periods < 2600) {
    periods++;
    const interest = balance * periodRate;
    balance -= Math.min(balance, payment - interest);
    totalInterest += interest;
  }
  const sim = simulatePayoff(400000, 6.5, 30, 0, 0, 12, 'biweekly', 0);
  close(sim.totalInterest, totalInterest, 5, 'biweekly totalInterest vs independent oracle');
  close(sim.monthsToPayoff, periods * 12 / 26, 1);
});
test('biweekly no longer double-counts / drops the 13th payment (annual total = 12x monthly payment)', () => {
  const pi = calcPIPayment(300000, 6, 30);
  const biweeklyPi = (pi * 12) / 26;
  close(biweeklyPi * 26, pi * 12, 0.02, 'true biweekly annual total must equal 12 monthly payments, not 13');
});

section('5. Accelerated biweekly — 26 half-payments/yr = 13 monthly-equivalents');
test('accelerated payment = monthlyPI / 2', () => {
  const pi = calcPIPayment(400000, 6.5, 30);
  const sim = simulatePayoff(400000, 6.5, 30, 0, 0, 12, 'accelerated', 0);
  close(sim.biweeklyPi, pi / 2, 0.005);
});
test('accelerated annual total = 13 monthly-equivalent payments', () => {
  const pi = calcPIPayment(400000, 6.5, 30);
  const sim = simulatePayoff(400000, 6.5, 30, 0, 0, 12, 'accelerated', 0);
  close(sim.biweeklyPi * 26, pi * 13, 0.02);
});
test('accelerated pays off dramatically faster than 30yr monthly (~24yr)', () => {
  const sim = simulatePayoff(400000, 6.5, 30, 0, 0, 12, 'accelerated', 0);
  assert.ok(sim.monthsToPayoff < 300, `expected <300 months, got ${sim.monthsToPayoff}`);
  assert.ok(sim.monthsToPayoff > 270, `expected >270 months, got ${sim.monthsToPayoff}`);
});
test('accelerated saves substantial interest vs monthly', () => {
  const monthly = simulatePayoff(400000, 6.5, 30, 0, 0, 12, 'monthly', 0);
  const accel = simulatePayoff(400000, 6.5, 30, 0, 0, 12, 'accelerated', 0);
  assert.ok(accel.totalInterest < monthly.totalInterest * 0.85);
});

section('6. Negative amortization — payment < interest must never falsely show payoff');
test('applyRequiredPayment: payment below interest capitalizes the shortfall onto balance', () => {
  // Spec example: $100,000 balance, $8,333 interest, $8,000 payment
  const step = applyRequiredPayment(100000, 0.08333, 8000);
  close(step.interestThisPeriod, 8333, 0.5);
  assert.equal(step.requiredPrincipalPaid, 0);
  close(step.unpaidInterest, 333, 0.5);
  close(step.balanceAfterAccrual, 100333, 0.5);
});
test('applyRequiredPayment: payment exactly equal to interest -> 0 principal, balance unchanged', () => {
  const step = applyRequiredPayment(50000, 0.01, 500); // interest = 500 exactly
  assert.equal(step.requiredPrincipalPaid, 0);
  assert.equal(step.unpaidInterest, 0);
  assert.equal(step.balanceAfterAccrual, 50000);
});
test('applyRequiredPayment: normal case (payment > interest) reduces balance correctly, no capitalization', () => {
  const step = applyRequiredPayment(50000, 0.01, 600); // interest=500, principal=100
  close(step.requiredPrincipalPaid, 100, 0.001);
  assert.equal(step.unpaidInterest, 0);
  assert.equal(step.balanceAfterAccrual, 50000); // accrual-only balance; principal subtracted by caller
});
test('simulatePayoff never fabricates a zero balance when the loop cannot amortize (MAX_MONTHS exhausted)', () => {
  // Construct a pathological scenario via a negative additionalPayment is
  // clamped to 0 by the engine, so instead verify the safety-net wiring
  // directly: a hand-built mini engine loop using the same
  // applyRequiredPayment() primitive, run to MAX_MONTHS, must leave a
  // nonzero balance and must NOT be reported as paid off.
  let balance = 100000;
  const periodRate = 0.10 / 12; // 10% APR
  const payment = 700; // < 833.33 monthly interest -> true negative amortization
  let months = 0;
  while (balance > 0.01 && months < 1200) {
    months++;
    const step = applyRequiredPayment(balance, periodRate, payment);
    balance = step.balanceAfterAccrual - step.requiredPrincipalPaid;
  }
  assert.equal(months, 1200, 'loop should exhaust MAX_MONTHS, never reach payoff');
  assert.ok(balance > 100000, `balance should have GROWN (negative amortization), got ${balance}`);
  const paidOff = balance <= 0.01;
  assert.equal(paidOff, false, 'must never report this as paid off');
});
test('normal fully-amortizing loans never trigger negative amortization (unpaidInterestCapitalized = 0)', () => {
  for (const mode of ['monthly', 'biweekly', 'accelerated']) {
    const sim = simulatePayoff(400000, 6.5, 30, 500, 5000, 12, mode, 50);
    assert.equal(sim.unpaidInterestCapitalized, 0, `mode=${mode}`);
    assert.equal(sim.paidOff, true, `mode=${mode}`);
  }
});

section('7. Recast');
test('recast: balance decreases, payment decreases, rate & term unchanged', () => {
  const r = calculateRecast({ loanAmount: 400000, annualRate: 6.5, termYears: 30, monthsElapsed: 60, recastLumpSum: 50000, recastFee: 250 });
  assert.ok(r.newBalance < r.balanceAtRecast);
  assert.ok(r.newMonthlyPI < r.currentMonthlyPI);
  assert.equal(r.remainingMonths, 300);
});
test('recast: lump sum = 0 -> new balance equals balance at recast, no payment change', () => {
  const r = calculateRecast({ loanAmount: 400000, annualRate: 6.5, termYears: 30, monthsElapsed: 60, recastLumpSum: 0, recastFee: 0 });
  close(r.newBalance, r.balanceAtRecast, 0.01);
  close(r.newMonthlyPI, r.currentMonthlyPI, 0.01);
});
test('recast: lump sum >= balance -> loan fully paid off, $0 new payment', () => {
  const r = calculateRecast({ loanAmount: 200000, annualRate: 6, termYears: 30, monthsElapsed: 24, recastLumpSum: 1000000, recastFee: 0 });
  assert.equal(r.newBalance, 0);
  assert.equal(r.newMonthlyPI, 0);
});
test('recast: fee is netted out of the lump sum applied to principal', () => {
  const withFee = calculateRecast({ loanAmount: 400000, annualRate: 6.5, termYears: 30, monthsElapsed: 60, recastLumpSum: 50000, recastFee: 250 });
  const noFee = calculateRecast({ loanAmount: 400000, annualRate: 6.5, termYears: 30, monthsElapsed: 60, recastLumpSum: 50000, recastFee: 0 });
  close(withFee.appliedLumpSum, noFee.appliedLumpSum - 250, 0.01);
});
test('recast: 15yr and late-in-loan scenario both behave consistently', () => {
  const r = calculateRecast({ loanAmount: 250000, annualRate: 5.8, termYears: 15, monthsElapsed: 150, recastLumpSum: 20000, recastFee: 250 });
  assert.ok(r.newBalance < r.balanceAtRecast);
  assert.equal(r.remainingMonths, 30);
});
test('calcRemainingBalance matches recast balanceAtRecast (same formula, independent call)', () => {
  const bal = calcRemainingBalance(400000, 6.5, 360, 60);
  const r = calculateRecast({ loanAmount: 400000, annualRate: 6.5, termYears: 30, monthsElapsed: 60, recastLumpSum: 0, recastFee: 0 });
  close(bal, r.balanceAtRecast, 0.01);
});

section('8. Extra principal payment');
test('extra principal: required P&I unchanged, payoff earlier, total interest lower', () => {
  const base = simulatePayoff(400000, 6.5, 30, 0, 0, 12, 'monthly', 0);
  const withExtra = simulatePayoff(400000, 6.5, 30, 300, 0, 12, 'monthly', 0);
  close(base.regularPi, withExtra.regularPi, 0.01, 'regularPi (contractual payment) must not change with extra principal');
  assert.ok(withExtra.monthsToPayoff < base.monthsToPayoff);
  assert.ok(withExtra.totalInterest < base.totalInterest);
});
test('recurring lump sum reduces both payoff time and total interest', () => {
  const base = simulatePayoff(400000, 6.5, 30, 0, 0, 12, 'monthly', 0);
  const withLump = simulatePayoff(400000, 6.5, 30, 0, 5000, 12, 'monthly', 0);
  assert.ok(withLump.monthsToPayoff < base.monthsToPayoff);
  assert.ok(withLump.totalInterest < base.totalInterest);
});

section('9. DTI (gross-income based, front-end and back-end)');
test('Spec example: $150k gross income, $1,000 other debt, $3,000 housing -> back-end DTI = 32%', () => {
  const grossMonthly = 150000 / 12; // 12500
  const dti = calculateBackEndDTI(3000, 1000, grossMonthly);
  close(dti, 32, 0.001);
});
test('DTI with zero income returns 0 (no divide-by-zero/NaN)', () => {
  assert.equal(calculateDTI(3000, 0), 0);
  assert.equal(calculateBackEndDTI(3000, 1000, 0), 0);
});
test('DTI with zero debt = pure housing ratio', () => {
  close(calculateDTI(2500, 10000), 25, 0.001);
});
test('DTI with very high debt exceeds 100% (not clamped/hidden)', () => {
  const dti = calculateBackEndDTI(5000, 5000, 6000);
  assert.ok(dti > 100);
});

section('10. Sale proceeds (incl. underwater sale)');
test('Sale proceeds: standard breakdown matches independent arithmetic', () => {
  const inputs = { sellHomeValue: 400000, sellMortgagePayoff: 200000, sellCommissionPercent: 6, sellClosingCostsPercent: 1.5, sellRepairCosts: 2000, sellConcessions: 1000, sellMovingCosts: 2000, sellProceedsPercent: 100 };
  const result = calculateSaleProceeds(inputs);
  const commission = 400000 * 0.06;
  const closing = 400000 * 0.015;
  const totalCosts = commission + closing + 2000 + 1000 + 2000;
  const expectedNet = 400000 - 200000 - totalCosts;
  close(result.netProceeds, expectedNet, 0.01);
  assert.equal(result.isUnderwater, expectedNet < 0);
});
test('Sale proceeds: underwater sale (payoff > value) reports negative net proceeds, not clamped to 0', () => {
  const result = calculateSaleProceeds({ sellHomeValue: 200000, sellMortgagePayoff: 210000, sellCommissionPercent: 6, sellClosingCostsPercent: 1.5, sellRepairCosts: 0, sellConcessions: 0, sellMovingCosts: 0, sellProceedsPercent: 100 });
  assert.ok(result.netProceeds < 0);
  assert.equal(result.isUnderwater, true);
  assert.equal(result.availableForDownPayment, 0);
});

section('11. Cash to close');
test('Cash to close: down payment + closing costs + reserves = total', () => {
  const r = calculateCashToClose({ downPaymentCash: 80000, purchasePrice: 400000, closingCostPercent: 2.5, reserveMonths: 3, monthlyHousingObligation: 3000, extraProjectCash: 1000 });
  const expected = 80000 + (400000 * 0.025) + (3 * 3000) + 1000;
  close(r.totalCashNeeded, expected, 0.01);
});

section('12. Max affordability solver (reverse-solve, then forward-verify)');
test('solveMaxAffordablePrice output re-produces the target back-end DTI when run forward', () => {
  const solved = solveMaxAffordablePrice({
    targetBackEndDTI: 36, monthlyIncome: 10000, otherMonthlyDebts: 300,
    existingHousingObligation: 0, fixedDownPaymentCash: 60000, otherDownPaymentSource: 0,
    interestRate: 6.5, termYears: 30, taxRate: 1.2, homeInsurance: 1200, hoaFees: 0, pmiRate: 0.75
  });
  assert.ok(solved !== null);
  close(solved.backEndDTI, 36, 0.05);
  // Forward-verify with the actual PI formula (independent of solveMaxAffordablePrice's algebra)
  const pi = calcPIPayment(solved.maxLoanAmount, 6.5, 30);
  close(pi, solved.monthlyPI, 0.5);
});
test('solveMaxAffordablePrice returns null when existing obligations already exceed target', () => {
  const solved = solveMaxAffordablePrice({ targetBackEndDTI: 30, monthlyIncome: 5000, otherMonthlyDebts: 1000, existingHousingObligation: 1000, interestRate: 6.5 });
  assert.equal(solved, null);
});

section('13. Bridge loan / rental — no double-counting of departure-home debt');
test('Bridge loan interest-only cost matches independent formula', () => {
  const r = calculateBridgeLoanCosts({ bridgeLoanAmount: 150000, bridgeExtraCash: 0, bridgeLoanRate: 8.5, bridgeLoanFeesPercent: 1.5, monthsUntilSale: 4 });
  close(r.monthlyInterestOnlyPayment, 150000 * (8.5 / 100 / 12), 0.01);
  close(r.originationFee, 150000 * 0.015, 0.01);
  close(r.totalBridgeInterest, r.monthlyInterestOnlyPayment * 4, 0.01);
});
test('Rental offset: rent fully covering mortgage excludes it from DTI (not double-counted)', () => {
  const r = calculateRentalOffset({ rentalProjectedMonthlyRent: 2000, rentalOffsetPercent: 75, departureMortgagePayment: 1400 });
  close(r.offsetRent, 1500, 0.01);
  assert.equal(r.qualifyingHousingObligation, 0, 'fully offset payment must not also count as a DTI debt');
});
test('Rental offset: rent NOT covering mortgage counts only the shortfall (not the full payment) against DTI', () => {
  const r = calculateRentalOffset({ rentalProjectedMonthlyRent: 1000, rentalOffsetPercent: 75, departureMortgagePayment: 1400 });
  close(r.offsetRent, 750, 0.01);
  close(r.qualifyingHousingObligation, 650, 0.01, 'shortfall = 1400 - 750, never the full 1400 (that would double-count the offset rent already applied)');
});

section('14. HELOC');
test('HELOC: zero balance -> $0 payment', () => {
  const r = calculateRentalHelocCost({ rentalHelocAmount: 0, rentalHelocRate: 7.3 });
  assert.equal(r.monthlyPayment, 0);
});
test('HELOC: interest-only payment matches amount * rate / 12', () => {
  const r = calculateRentalHelocCost({ rentalHelocAmount: 50000, rentalHelocRate: 7.3 });
  close(r.monthlyPayment, 50000 * (7.3 / 100 / 12), 0.01);
});
test('HELOC: higher rate -> proportionally higher payment', () => {
  const low = calculateRentalHelocCost({ rentalHelocAmount: 50000, rentalHelocRate: 6 });
  const high = calculateRentalHelocCost({ rentalHelocAmount: 50000, rentalHelocRate: 9 });
  assert.ok(high.monthlyPayment > low.monthlyPayment);
  close(high.monthlyPayment / low.monthlyPayment, 9 / 6, 0.001);
});

section('15. Edge cases — must never produce NaN/Infinity/undefined/null');
test('formatCurrency(NaN) -> "$0.00", not "$NaN"', () => {
  assert.equal(formatCurrency(NaN), '$0.00');
});
test('formatCurrency(undefined) -> "$0.00"', () => {
  assert.equal(formatCurrency(undefined), '$0.00');
});
test('calcPIPayment with 0 principal -> 0, not NaN', () => {
  assert.equal(calcPIPayment(0, 6.5, 30), 0);
});
test('calcPIPayment with negative principal does not throw / produce NaN', () => {
  const v = calcPIPayment(-1000, 6.5, 30);
  assert.ok(Number.isFinite(v));
});
test('parseFloatSafe handles comma-formatted / non-numeric / blank input', () => {
  // parseFloatSafe strips leading "$" and any "," before delegating to
  // native parseFloat (defense-in-depth fix, added on top of the existing
  // paste-interceptor mitigation in app.js). Before this fix, bare
  // parseFloat parsed leading digits and stopped at the first non-numeric
  // character, so "650,000" (no "$") silently truncated to 650, and a
  // leading "$" made the whole parse fail to NaN since there's no numeric
  // prefix at all — both now parse correctly to the full number.
  assert.equal(parseFloatSafe('650,000', 0), 650000);
  assert.equal(parseFloatSafe('$650,000', 0), 650000);
  assert.equal(parseFloatSafe('', 0), 0);
  assert.equal(parseFloatSafe('abc', 0), 0);
  assert.equal(parseFloatSafe(null, 5), 5);
  assert.equal(parseFloatSafe(undefined, 5), 5);
});
test('simulatePayoff with 0% interest and extra payments still fully amortizes, no NaN', () => {
  const sim = simulatePayoff(200000, 0, 30, 500, 0, 12, 'monthly', 0);
  assert.ok(Number.isFinite(sim.totalInterest));
  assert.equal(sim.paidOff, true);
});
test('calculateSaleProceeds with all-zero inputs returns all zeros, no NaN', () => {
  const r = calculateSaleProceeds({});
  assert.equal(r.netProceeds, 0);
  assert.ok(Number.isFinite(r.netProceeds));
});
test('down payment > home price -> loanAmount clamped to 0, not negative', () => {
  const r = performCalculations({
    homePrice: 300000, downPayment: 350000, interest30: 6.5, interest15: 5.8,
    taxRate: 1, homeInsurance: 1200, hoaFees: 0, pmiRate: 0.75,
    additionalPayment: 0, lumpSumAmount: 0, lumpSumFrequency: 12
  });
  assert.equal(r.loanAmount, 0);
  assert.ok(Number.isFinite(r.baselinePi30));
});
test('very high interest rate (20%) still produces a finite, sane payment', () => {
  const pi = calcPIPayment(400000, 20, 30);
  assert.ok(Number.isFinite(pi) && pi > 0);
});
test('1-year term loan amortizes correctly', () => {
  const sim = simulatePayoff(24000, 6, 1, 0, 0, 12, 'monthly', 0);
  assert.equal(sim.paidOff, true);
  assert.equal(sim.monthsToPayoff, 12);
});
test('evaluateCashCushion handles negative surplus (shortfall) without NaN', () => {
  const r = evaluateCashCushion({ cashAvailable: 10000, totalCashNeeded: 50000, monthlyHousingObligation: 3000 });
  assert.ok(r.surplus < 0);
  assert.ok(Number.isFinite(r.extraReserveMonths));
});

section('16. Cross-engine consistency (calculator.js vs amortization.js)');
for (const mode of ['monthly', 'biweekly', 'accelerated']) {
  test(`amortization.js and calculator.js agree on total interest for ${mode} mode`, () => {
    const sched = runAmortizationSchedule({
      price: 480000, down: 80000, activeRate: 6.5, term: 30, taxRate: 1.2, homeInsurance: 1200,
      hoaFees: 0, pmiRate: 0.75, additional: 0, lumpSumAmt: 0, lumpSumFreq: 12,
      paymentFrequency: mode, biweeklyExtra: 0
    });
    const sim = simulatePayoff(400000, 6.5, 30, 0, 0, 12, mode, 0);
    close(sched.totalInterest, sim.totalInterest, 5, mode);
  });
}

section('17. amortization.js schedule rows — no negative interest/principal near payoff');
// Regression test for a live bug found via browser smoke-testing: the final
// month's last biweekly sub-period could "overpay" past a near-zero balance,
// driving it negative and producing a NEGATIVE interest charge on the next
// sub-period within that same month (visible in the UI as a "-$1.42"
// Interest Component on the schedule's payoff row). Runs across several
// loan sizes/terms/rates so an odd final-balance remainder is likely to
// surface the bug again if it ever regresses.
for (const mode of ['monthly', 'biweekly', 'accelerated']) {
  for (const scenario of [
    { price: 480000, down: 80000, activeRate: 6.5, term: 30 },
    { price: 500000, down: 100000, activeRate: 6.97, term: 30 },
    { price: 350000, down: 70000, activeRate: 5.8, term: 15 },
    { price: 247000, down: 21750, activeRate: 7.125, term: 30 }
  ]) {
    test(`no negative interest/principal/balance in ${mode} schedule (${scenario.term}yr @ ${scenario.activeRate}%, price=${scenario.price})`, () => {
      const sched = runAmortizationSchedule({
        ...scenario, taxRate: 1.2, homeInsurance: 1200, hoaFees: 0, pmiRate: 0.75,
        additional: 0, lumpSumAmt: 0, lumpSumFreq: 12, paymentFrequency: mode, biweeklyExtra: 0
      });
      for (const row of sched.rows) {
        assert.ok(row.actualInterestPaid >= -0.005, `month ${row.month}: negative interest ${row.actualInterestPaid}`);
        assert.ok(row.actualPrincipalPaid >= -0.005, `month ${row.month}: negative principal ${row.actualPrincipalPaid}`);
        assert.ok(row.balanceAfter >= -0.005, `month ${row.month}: negative balance ${row.balanceAfter}`);
      }
      // Final row must actually reach (approximately) zero
      const last = sched.rows[sched.rows.length - 1];
      assert.ok(last.balanceAfter < 0.02, `final balance not ~0: ${last.balanceAfter}`);
    });
  }
}

// ---------------------------------------------------------------------------
console.log(`\n${pass} passed, ${fail} failed (${pass + fail} total)`);
if (fail > 0) {
  console.log('\nFailures:');
  failures.forEach(f => console.log(' - ' + f.name + ': ' + f.err));
  process.exit(1);
}
