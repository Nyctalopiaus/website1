/**
 * Amortization Schedule Page Logic
 * Extracted from an inline <script> tag in amortization.html so the page's
 * Content-Security-Policy can drop 'unsafe-inline' from script-src.
 *
 * 2026-08-29: converted to an ES module (amortization.html now loads this as
 * type="module", same as index.html already does for app.js under the
 * identical CSP) so the core P&I formula and sale-proceeds math can be
 * imported straight from calculator.js instead of re-derived a second time.
 * Also added: Bridge Loan mode support — when the saved profile has "Have a
 * house to sell?" set to Bridge Loan mode, the schedule now models the
 * mortgage recast that happens once the old house sells (a lump sum applied
 * to principal, followed by a lower re-amortized required payment for the
 * remaining term). See runAmortizationSchedule() below for the pure
 * calculation; everything after it is DOM rendering only.
 */

import { CONFIG } from './config.js';
import { calcPIPayment, calculateSaleProceeds, calculateRecast } from './calculator.js';
import { formatCurrency } from './utils.js';

/**
 * Derives the biweekly-equivalent P&I payment from a monthly required
 * payment, for the two non-monthly payment-frequency modes. Mirrors the
 * same derivation calculator.js's simulatePayoff() uses.
 * @param {number} monthlyPi
 * @param {string} paymentFrequency - 'monthly' | 'biweekly' | 'accelerated'
 * @returns {number}
 */
function deriveBiweeklyPi(monthlyPi, paymentFrequency) {
  if (paymentFrequency === 'biweekly') return (monthlyPi * 12) / 26;
  if (paymentFrequency === 'accelerated') return monthlyPi / 2;
  return 0;
}

/**
 * Runs the full month-by-month amortization simulation, including an
 * optional bridge-loan recast event partway through. Pure function — no DOM
 * access — so it can be unit-tested directly (see the cross-check this was
 * verified against, described in project notes) and reused if this page's
 * rendering ever changes.
 *
 * Recast timing convention: the sale is assumed to close right AFTER the
 * `recastMonth`-th regular payment posts (i.e. `monthsUntilSale` full
 * payments are made under the pre-recast terms, matching how the bridge
 * loan's total holding-cost interest is already calculated elsewhere as
 * monthlyInterestOnlyPayment × monthsUntilSale) — the lump sum then lands
 * and every payment from `recastMonth + 1` onward uses the re-amortized
 * required payment.
 *
 * @param {Object} p
 * @param {number} p.price - Home price
 * @param {number} p.down - Down payment amount
 * @param {number} p.activeRate - Interest rate (%) for the active term
 * @param {number} p.term - Loan term in years (30 or 15)
 * @param {number} p.taxRate - Annual property tax rate (%)
 * @param {number} p.homeInsurance - Annual home insurance ($)
 * @param {number} p.hoaFees - Monthly HOA fees ($)
 * @param {number} p.pmiRate - Annual PMI rate (%)
 * @param {number} p.additional - Extra monthly payment ($)
 * @param {number} p.lumpSumAmt - Recurring lump sum amount ($)
 * @param {number} p.lumpSumFreq - Recurring lump sum frequency (months)
 * @param {string} p.paymentFrequency - 'monthly' | 'biweekly' | 'accelerated'
 * @param {number} p.biweeklyExtra - Extra amount per biweekly payment ($)
 * @param {boolean} [p.recastEnabled] - Whether Bridge Loan mode recast applies
 * @param {number|null} [p.recastMonth] - Month the sale closes / recast happens
 * @param {number} [p.recastNetProceeds] - Net proceeds from calculateSaleProceeds()
 * @param {number} [p.recastAvailableAfterBridge] - netProceeds - bridgeLoanAmount (before fee)
 * @param {number} [p.recastFeeAmt] - Flat recast fee
 * @param {number} [p.bridgeLoanAmount] - Original bridge loan principal (payoff amount)
 * @param {string} [p.recastStrategy] - 'recast' | 'extraPayment'
 * @returns {Object} { loanAmount, regularPi, staticEscrow, originalPmi,
 *   baselineInterest, originalMonths, rows, totalInterest, monthsToPayoff,
 *   recastResult }
 */
export function runAmortizationSchedule(p) {
  const {
    price, down, activeRate, term, taxRate, homeInsurance, hoaFees, pmiRate,
    additional, lumpSumAmt, lumpSumFreq, paymentFrequency, biweeklyExtra,
    recastEnabled = false, recastMonth = null, recastNetProceeds = 0,
    recastAvailableAfterBridge = 0, recastFeeAmt = 0, bridgeLoanAmount = 0,
    recastStrategy = CONFIG.SALE_PAYOFF_STRATEGY_RECAST
  } = p;

  const loanAmount = Math.max(0, price - down);
  const r = activeRate / 12 / 100;
  const originalMonths = term * 12;

  const regularPi = calcPIPayment(loanAmount, activeRate, term);
  const biweeklyPi = deriveBiweeklyPi(regularPi, paymentFrequency);

  const monthlyTax = (price * (taxRate / 100)) / 12;
  const monthlyIns = homeInsurance / 12;
  const monthlyHoa = hoaFees || 0;
  const staticEscrow = monthlyTax + monthlyIns + monthlyHoa;
  const originalPmi = (price > 0 && down / price < 0.2) ? (loanAmount * (pmiRate / 100)) / 12 : 0;

  const baselineInterest = Math.max(0, (regularPi * originalMonths) - loanAmount);

  let balance = loanAmount;
  let totalInterest = 0;
  let month = 0;
  let currentRegularPi = regularPi;
  let currentBiweeklyPi = biweeklyPi;
  let recastResult = null;
  const rows = [];

  while (balance > CONFIG.LOAN_BALANCE_THRESHOLD && month < CONFIG.MAX_MONTHS) {
    month++;

    let requiredPiThisMonth = currentRegularPi;
    let biweeklyExtraThisMonth = 0;
    if (paymentFrequency === 'biweekly' || paymentFrequency === 'accelerated') {
      const numPayments = (month % 6 === 0) ? 3 : 2;
      requiredPiThisMonth = numPayments * currentBiweeklyPi;
      biweeklyExtraThisMonth = numPayments * biweeklyExtra;
    }

    const interestThisMonth = balance * r;
    const requiredPrincipal = Math.max(0, requiredPiThisMonth - interestThisMonth);
    const extraPaid = additional + biweeklyExtraThisMonth;
    let bonusPayment = 0;
    if (lumpSumAmt > 0 && month % lumpSumFreq === 0) { bonusPayment = lumpSumAmt; }
    const totalPrincipal = requiredPrincipal + extraPaid + bonusPayment;

    const actualPrincipalPaid = Math.min(balance, totalPrincipal);
    const actualInterestPaid = interestThisMonth;

    balance -= actualPrincipalPaid;
    totalInterest += actualInterestPaid;

    const currentEquityPercent = 1 - (balance / price);
    const activePmi = (currentEquityPercent < 0.20) ? originalPmi : 0;

    const isLastRow = balance <= CONFIG.LOAN_BALANCE_THRESHOLD;
    const trueTotalPayment = requiredPiThisMonth + extraPaid + bonusPayment + staticEscrow + activePmi;

    rows.push({
      month,
      trueTotalPayment,
      requiredPiThisMonth,
      staticEscrow,
      activePmi,
      extraPaid,
      bonusPayment,
      actualInterestPaid,
      actualPrincipalPaid,
      balanceAfter: Math.max(0, balance),
      isLastRow
    });

    // Bridge loan recast / extra payment event: fires once, right after the
    // recastMonth-th payment above has posted. Skipped if the loan already
    // paid itself off before the planned sale month is reached.
    if (recastEnabled && recastMonth !== null && month === recastMonth && balance > CONFIG.LOAN_BALANCE_THRESHOLD) {
      const balanceAtRecast = balance;
      const isExtra = recastStrategy === CONFIG.SALE_PAYOFF_STRATEGY_EXTRA_PAYMENT;
      // Keep as Cash never touches the loan at all — no fee, no principal
      // applied, balance and payment continue completely unchanged.
      const isCash = recastStrategy === CONFIG.SALE_PAYOFF_STRATEGY_KEEP_CASH;
      const effectiveFee = (isExtra || isCash) ? 0 : recastFeeAmt;
      const availableForPrincipal = isCash ? 0 : Math.max(0, recastAvailableAfterBridge - effectiveFee);
      const appliedLumpSum = Math.min(availableForPrincipal, balanceAtRecast);
      const newBalance = Math.max(0, balanceAtRecast - appliedLumpSum);
      const remainingMonths = Math.max(1, originalMonths - month);

      const newRegularPi = (!isExtra && !isCash && newBalance > 0) ? calcPIPayment(newBalance, activeRate, remainingMonths / 12) : ((isExtra || isCash) ? currentRegularPi : 0);
      const newBiweeklyPi = deriveBiweeklyPi(newRegularPi, paymentFrequency);

      balance = newBalance;
      currentRegularPi = newRegularPi;
      currentBiweeklyPi = newBiweeklyPi;

      recastResult = {
        month,
        recastStrategy,
        netProceeds: recastNetProceeds,
        bridgeLoanAmount,
        availableAfterBridge: recastAvailableAfterBridge,
        recastFee: effectiveFee,
        appliedLumpSum,
        cashKeptAmount: isCash ? Math.max(0, recastAvailableAfterBridge) : 0,
        balanceAtRecast,
        newBalance,
        oldPayment: regularPi,
        newPayment: newRegularPi,
        monthlySavings: (isExtra || isCash) ? 0 : Math.max(0, regularPi - newRegularPi)
      };
    }
  }

  return {
    loanAmount,
    regularPi,
    staticEscrow,
    originalPmi,
    baselineInterest,
    originalMonths,
    rows,
    totalInterest,
    monthsToPayoff: month,
    recastResult
  };
}

// --- DOM rendering below. Guarded so this module can be imported in a
// plain Node context (e.g. for testing runAmortizationSchedule() above)
// without throwing on the missing `document`/`localStorage` globals. ---
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    // Parse data from localStorage
    const saved = localStorage.getItem('housing_calculator_inputs');
    if (!saved) {
      document.getElementById('error-card').style.display = 'block';
      return;
    }

    let data;
    try {
      data = JSON.parse(saved);
    } catch (e) {
      console.error('[ERROR] Failed to parse calculator inputs from localStorage:', e);
      document.getElementById('error-card').style.display = 'block';
      return;
    }

    const price = parseFloat(data.homePrice);
    const down = parseFloat(data.downPaymentAmount) || 0;
    const rate30 = parseFloat(data.interest30);
    const rate15 = parseFloat(data.interest15);
    const tax = parseFloat(data.taxRate) || 0;
    const ins = parseFloat(data.homeInsurance) || 0;
    const pmi = parseFloat(data.pmiRate) || 0;
    const hoa = parseFloat(data.hoaFees) || 0;
    const additional = parseFloat(data.additionalPayment) || 0;
    const lumpSumAmt = parseFloat(data.lumpSumAmount) || 0;
    const lumpSumFreq = parseInt(data.lumpSumFrequency) || 12;
    const term = parseInt(data.activeTerm) || 30;

    // Validate required params
    if (isNaN(price)) {
      document.getElementById('error-card').style.display = 'block';
      return;
    }

    // Display Content
    document.getElementById('amort-content').style.display = 'block';

    const activeRate = term === 30 ? rate30 : rate15;
    const paymentFrequency = data.paymentFrequency || 'monthly';
    const biweeklyExtra = parseFloat(data.biweeklyExtra) || 0;

    // Update Header Text
    const freqLabel = paymentFrequency === 'accelerated' ? ' (⚡ Accelerated Biweekly)' : (paymentFrequency === 'biweekly' ? ' (Biweekly 26x)' : '');
    document.getElementById('amort-title').textContent = `${term}-Year Amortization Schedule${freqLabel}`;
    document.getElementById('amort-subtitle').textContent = `Based on a $${price.toLocaleString()} home price, $${down.toLocaleString()} down payment, and ${activeRate}% interest rate.`;

    const formatSigned = (val) => (val < 0 ? `-${formatCurrency(Math.abs(val))}` : formatCurrency(val));

    // --- Bridge Loan / recast setup. Everything this needs was already
    // saved to the same localStorage blob by app.js's debouncedSave(), so
    // no new plumbing between the calculator page and this page is needed.
    // Gated the same way app.js gates the recast summary box, so any
    // profile saved with Sell First mode (or no house to sell at all)
    // behaves exactly as before this feature existed. ---
    const sellingHouse = !!data.sellingHouse;
    const saleMode = data.saleMode || CONFIG.SALE_MODE_SELL_FIRST;
    const bridgeLoanAmount = parseFloat(data.bridgeLoanAmount) || 0;
    const bridgeExtraCash = parseFloat(data.bridgeExtraCash) || 0;
    const totalBridgePayoff = bridgeLoanAmount + bridgeExtraCash;
    const monthsUntilSaleRaw = parseFloat(data.monthsUntilSale) || 0;
    const recastFeeAmt = parseFloat(data.recastFee) || 0;
    const recastStrategy = data.recastStrategy || CONFIG.SALE_PAYOFF_STRATEGY_RECAST;

    const recastEnabled = sellingHouse && saleMode === CONFIG.SALE_MODE_BRIDGE_LOAN && totalBridgePayoff > 0 && monthsUntilSaleRaw > 0;
    // Rounded to the nearest whole month — the schedule is month-by-month,
    // so a fractional "months until sale" needs to land on one row.
    const recastMonth = recastEnabled ? Math.round(monthsUntilSaleRaw) : null;

    let recastNetProceeds = 0;
    let recastAvailableAfterBridge = 0;
    if (recastEnabled) {
      const proceeds = calculateSaleProceeds({
        sellHomeValue: parseFloat(data.sellHomeValue) || 0,
        sellMortgagePayoff: parseFloat(data.sellMortgagePayoff) || 0,
        sellCommissionPercent: parseFloat(data.sellCommissionPercent) || 0,
        sellClosingCostsPercent: parseFloat(data.sellClosingCostsPercent) || 0,
        sellRepairCosts: parseFloat(data.sellRepairCosts) || 0,
        sellConcessions: parseFloat(data.sellConcessions) || 0,
        sellMovingCosts: parseFloat(data.sellMovingCosts) || 0,
        sellProceedsPercent: parseFloat(data.sellProceedsPercent) || 0
      });
      recastNetProceeds = proceeds.netProceeds;
      recastAvailableAfterBridge = recastNetProceeds - totalBridgePayoff;
    }

    const schedule = runAmortizationSchedule({
      price, down, activeRate, term, taxRate: tax, homeInsurance: ins, hoaFees: hoa, pmiRate: pmi,
      additional, lumpSumAmt, lumpSumFreq, paymentFrequency, biweeklyExtra,
      recastEnabled, recastMonth, recastNetProceeds, recastAvailableAfterBridge, recastFeeAmt, bridgeLoanAmount: totalBridgePayoff, recastStrategy
    });

    const { loanAmount, regularPi, totalInterest, monthsToPayoff, originalMonths, recastResult } = schedule;

    // Build table rows, inserting a divider row right after the recast
    // month explaining what happened (otherwise the required payment just
    // silently changes partway down the table, which reads as a bug).
    let htmlRows = '';
    schedule.rows.forEach((row) => {
      const rowClass = row.isLastRow ? 'payoff-highlight' : '';
      const extraTotal = row.extraPaid + row.bonusPayment;
      htmlRows += `<tr class="${rowClass}">
      <td><strong>Month ${row.month}</strong></td>
      <td>${formatCurrency(row.trueTotalPayment)}</td>
      <td>${formatCurrency(row.requiredPiThisMonth)}</td>
      <td>${formatCurrency(row.staticEscrow)}</td>
      <td>${formatCurrency(row.activePmi)}</td>
      <td class="${extraTotal > 0 ? 'accent bold' : 'dim'}">${formatCurrency(extraTotal)}</td>
      <td class="dim">${formatCurrency(row.actualInterestPaid)}</td>
      <td>${formatCurrency(row.actualPrincipalPaid - (row.isLastRow ? 0 : extraTotal))}</td>
      <td class="${row.isLastRow ? 'bold accent' : ''}">${formatCurrency(row.balanceAfter)}</td>
    </tr>`;

      if (recastResult && row.month === recastResult.month) {
        if (recastResult.recastStrategy === CONFIG.SALE_PAYOFF_STRATEGY_KEEP_CASH) {
          htmlRows += `<tr class="recast-event-row"><td colspan="9">🌉 Bridge loan paid off — ${formatCurrency(recastResult.cashKeptAmount)} kept as cash, not applied to the loan (required P&I remains ${formatCurrency(recastResult.oldPayment)}/mo)</td></tr>`;
        } else if (recastResult.recastStrategy === CONFIG.SALE_PAYOFF_STRATEGY_EXTRA_PAYMENT) {
          htmlRows += `<tr class="recast-event-row"><td colspan="9">🌉 Bridge loan paid off — ${formatCurrency(recastResult.appliedLumpSum)} applied as extra principal payment (required P&I remains ${formatCurrency(recastResult.oldPayment)}/mo)</td></tr>`;
        } else {
          htmlRows += `<tr class="recast-event-row"><td colspan="9">🌉 Bridge loan paid off — ${formatCurrency(recastResult.appliedLumpSum)} applied to principal, new required payment ${formatCurrency(recastResult.newPayment)}/mo</td></tr>`;
        }
      }
    });

    document.getElementById('schedule-tbody').innerHTML = htmlRows;

    // Populate Summary metrics
    document.getElementById('sum-loan-amount').textContent = formatCurrency(loanAmount);
    document.getElementById('sum-monthly-pi').textContent = formatCurrency(regularPi);
    document.getElementById('sum-monthly-extra').textContent = formatCurrency(additional);
    document.getElementById('sum-total-interest').textContent = formatCurrency(totalInterest);

    const yrs = Math.floor(monthsToPayoff / 12);
    const mos = monthsToPayoff % 12;
    let timeStr = '';
    if (yrs > 0 && mos > 0) {
      timeStr = `${yrs} yr${yrs > 1 ? 's' : ''}, ${mos} mo${mos > 1 ? 's' : ''}`;
    } else if (yrs > 0) {
      timeStr = `${yrs} yr${yrs > 1 ? 's' : ''}`;
    } else {
      timeStr = `${mos} mo${mos > 1 ? 's' : ''}`;
    }

    const monthsSaved = Math.max(0, originalMonths - monthsToPayoff);
    if (monthsSaved > 0) {
      const savedYrs = Math.floor(monthsSaved / 12);
      const savedMos = monthsSaved % 12;
      let savedStr = '';
      if (savedYrs > 0 && savedMos > 0) {
        savedStr = `${savedYrs}y ${savedMos}m`;
      } else if (savedYrs > 0) {
        savedStr = `${savedYrs} years`;
      } else {
        savedStr = `${savedMos} months`;
      }
      timeStr += ` (Saved ${savedStr}!)`;
    }
    document.getElementById('sum-payoff-time').textContent = timeStr;

    // Bridge Loan & Recast summary box — hidden unless a recast/extra payment
    // event actually occurred within this schedule.
    if (recastResult) {
      const recastBox = document.getElementById('amort-recast-box');
      if (recastBox) recastBox.style.display = 'block';

      const isExtra = recastResult.recastStrategy === CONFIG.SALE_PAYOFF_STRATEGY_EXTRA_PAYMENT;
      const isCash = recastResult.recastStrategy === CONFIG.SALE_PAYOFF_STRATEGY_KEEP_CASH;
      const isRecast = !isExtra && !isCash;
      const feeRow = document.getElementById('amort-recast-fee-row');
      if (feeRow) feeRow.style.display = isRecast ? 'flex' : 'none';

      const lumpSumLabel = document.getElementById('amort-recast-lump-sum-label');
      if (lumpSumLabel) {
        lumpSumLabel.textContent = isCash
          ? 'Cash Kept (Not Applied to Loan)'
          : (isExtra ? 'Extra Principal Lump Sum Applied' : 'Recast Lump Sum Applied to Principal');
      }

      document.getElementById('amort-recast-month-num').textContent = recastResult.month;
      document.getElementById('amort-recast-net-proceeds').textContent = formatSigned(recastResult.netProceeds);
      document.getElementById('amort-recast-bridge-payoff').textContent = formatSigned(-recastResult.bridgeLoanAmount);
      document.getElementById('amort-recast-available').textContent = formatSigned(recastResult.availableAfterBridge);
      document.getElementById('amort-recast-fee').textContent = formatSigned(isRecast ? -recastResult.recastFee : 0);
      document.getElementById('amort-recast-lump-sum').textContent = formatCurrency(isCash ? recastResult.cashKeptAmount : recastResult.appliedLumpSum);

      const breakdownBox = document.getElementById('amort-recast-breakdown');
      const underwaterWarning = document.getElementById('amort-recast-underwater-warning');
      if (recastResult.availableAfterBridge < 0) {
        if (breakdownBox) breakdownBox.classList.add('underwater');
        if (underwaterWarning) {
          underwaterWarning.style.display = 'block';
          underwaterWarning.textContent = `⚠ Sale proceeds don't fully cover the bridge loan payoff — you'd need ${formatCurrency(Math.abs(recastResult.availableAfterBridge))} from another source to close it out.`;
        }
      } else {
        if (breakdownBox) breakdownBox.classList.remove('underwater');
        if (underwaterWarning) underwaterWarning.style.display = 'none';
      }

      const minLumpWarning = document.getElementById('amort-recast-min-lump-warning');
      if (minLumpWarning) {
        const tooSmall = isRecast && recastResult.appliedLumpSum > 0 && recastResult.appliedLumpSum < CONFIG.RECAST_TYPICAL_MIN_LUMP_SUM;
        minLumpWarning.style.display = tooSmall ? 'block' : 'none';
        if (tooSmall) {
          minLumpWarning.textContent = `⚠ Most lenders want at least ${formatCurrency(CONFIG.RECAST_TYPICAL_MIN_LUMP_SUM).replace(/\.00$/, '')} applied to recast a loan — this amount may not qualify.`;
        }
      }

      const paymentTitle = document.getElementById('amort-recast-payment-title');
      if (paymentTitle) {
        paymentTitle.textContent = isCash
          ? 'No Change to Your Loan — Cash Kept'
          : (isExtra ? 'Payoff Acceleration After House Sale' : 'Monthly Payment After Recast');
      }

      const afterPaymentLabel = document.getElementById('amort-recast-after-payment-label');
      if (afterPaymentLabel) {
        afterPaymentLabel.textContent = isCash
          ? 'Payment After Sale (Unchanged)'
          : (isExtra ? 'Required Monthly Payment (Unchanged)' : 'Payment After Recast');
      }

      const savingsRow = document.getElementById('amort-recast-savings-row');
      if (savingsRow) savingsRow.style.display = isRecast ? 'flex' : 'none';

      document.getElementById('amort-recast-before-payment').textContent = formatCurrency(recastResult.oldPayment);
      document.getElementById('amort-recast-after-payment').textContent = formatCurrency(recastResult.newPayment);
      document.getElementById('amort-recast-savings').textContent = formatCurrency(recastResult.monthlySavings);

      const tradeoffNote = document.getElementById('amort-recast-tradeoff-note');
      if (tradeoffNote) {
        if (isCash) {
          if (recastResult.cashKeptAmount > 0) {
            tradeoffNote.style.display = 'block';
            tradeoffNote.textContent = `Heads up: applying this ${formatCurrency(recastResult.cashKeptAmount)} to the loan instead — either recasting to lower your required payment, or as an extra principal payment to pay it off sooner — would put it to work reducing debt. Keeping it as cash trades either benefit for money in hand.`;
          } else {
            tradeoffNote.style.display = 'none';
          }
        } else {
          const tradeoff = calculateRecast({
            loanAmount,
            annualRate: activeRate,
            termYears: term,
            monthsElapsed: recastResult.month,
            recastLumpSum: recastResult.availableAfterBridge,
            recastFee: recastResult.recastFee
          });
          if (tradeoff.appliedLumpSum > 0 && tradeoff.monthsLaterPayoffFromRecasting > 0.5) {
            tradeoffNote.style.display = 'block';
            if (!isExtra) {
              tradeoffNote.textContent = `Heads up: applying this same amount as a one-time extra payment instead of recasting would pay the loan off about ${Math.round(tradeoff.monthsLaterPayoffFromRecasting)} month(s) sooner and save roughly ${formatCurrency(tradeoff.extraLifetimeInterestFromRecasting)} more in lifetime interest. Recasting trades that for a lower required payment starting right away.`;
            } else {
              tradeoffNote.textContent = `Heads up: recasting this loan instead of applying an extra payment would lower your monthly P&I by ${formatCurrency(tradeoff.monthlySavings)}/mo. Extra payment trades that for paying off the loan about ${Math.round(tradeoff.monthsLaterPayoffFromRecasting)} month(s) sooner and saving ${formatCurrency(tradeoff.extraLifetimeInterestFromRecasting)} in interest.`;
            }
          } else {
            tradeoffNote.style.display = 'none';
          }
        }
      }
    }

    // Print Schedule button (moved from inline onclick so script-src can drop 'unsafe-inline')
    const btnPrint = document.getElementById('btn-print-schedule');
    if (btnPrint) {
      btnPrint.addEventListener('click', () => window.print());
    }

    // CSV Export Trigger — skips the recast divider row, which isn't a
    // data row and would otherwise misalign the CSV's columns.
    const btnExportCSV = document.getElementById('btn-export-csv');
    if (btnExportCSV) {
      btnExportCSV.addEventListener('click', () => {
        const rows = document.querySelectorAll('#schedule-table tr:not(.recast-event-row)');
        let csvContent = '';
        rows.forEach(row => {
          const cols = row.querySelectorAll('th, td');
          const rowData = [];
          cols.forEach(col => {
            let cellText = col.innerText || col.textContent || '';
            cellText = cellText.replace(/[$,]/g, '').trim();
            if (cellText.includes(' ') || cellText.includes('\n')) {
              cellText = `"${cellText.replace(/"/g, '""')}"`;
            }
            rowData.push(cellText);
          });
          csvContent += rowData.join(',') + '\n';
        });

        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', 'amortization_schedule.csv');
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      });
    }
  });
}
