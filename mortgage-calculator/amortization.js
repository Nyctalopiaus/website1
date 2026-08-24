/**
 * Amortization Schedule Page Logic
 * Extracted from an inline <script> tag in amortization.html so the page's
 * Content-Security-Policy can drop 'unsafe-inline' from script-src.
 * Behavior is unchanged from the original inline version.
 */

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

  // Setup inputs
  const loanAmount = Math.max(0, price - down);
  const activeRate = term === 30 ? rate30 : rate15;

  const paymentFrequency = data.paymentFrequency || 'monthly';
  const biweeklyExtra = parseFloat(data.biweeklyExtra) || 0;

  // Update Header Text
  const freqLabel = paymentFrequency === 'accelerated' ? ' (⚡ Accelerated Biweekly)' : (paymentFrequency === 'biweekly' ? ' (Biweekly 26x)' : '');
  document.getElementById('amort-title').textContent = `${term}-Year Amortization Schedule${freqLabel}`;
  document.getElementById('amort-subtitle').textContent = `Based on a $${price.toLocaleString()} home price, $${down.toLocaleString()} down payment, and ${activeRate}% interest rate.`;

  // Helper for Currency
  const formatCurrency = (val) => {
    return '$' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  // Math Amortization Loop
  const r = activeRate / 12 / 100;
  const originalMonths = term * 12;

  let regularPi = 0;
  if (activeRate > 0) {
    regularPi = loanAmount * (r * Math.pow(1 + r, originalMonths)) / (Math.pow(1 + r, originalMonths) - 1);
  } else {
    regularPi = loanAmount / originalMonths;
  }

  let biweeklyPi = 0;
  if (paymentFrequency === 'biweekly') {
    biweeklyPi = (regularPi * 12) / 26;
  } else if (paymentFrequency === 'accelerated') {
    biweeklyPi = regularPi / 2;
  }

  // Escrow and PMI calculations
  const monthlyTax = (price * (data.taxRate / 100)) / 12;
  const monthlyIns = data.homeInsurance / 12;
  const monthlyHoa = data.hoaFees || 0;
  const staticEscrow = monthlyTax + monthlyIns + monthlyHoa;
  const originalPmi = (down / price < 0.2) ? (loanAmount * (data.pmiRate / 100)) / 12 : 0;

  const tbody = document.getElementById('schedule-tbody');
  let balance = loanAmount;
  let totalInterest = 0;
  let month = 0;
  let htmlRows = '';

  // Baseline Interest for comparison
  const baselineInterest = Math.max(0, (regularPi * originalMonths) - loanAmount);

  while (balance > 0.01 && month < 1200) {
    month++;
    
    let requiredPiThisMonth = regularPi;
    let biweeklyExtraThisMonth = 0;
    if (paymentFrequency === 'biweekly' || paymentFrequency === 'accelerated') {
      const numPayments = (month % 6 === 0) ? 3 : 2;
      requiredPiThisMonth = numPayments * biweeklyPi;
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

    // PMI drop-off check based on current equity percentage
    const currentEquityPercent = 1 - (balance / price);
    const activePmi = (currentEquityPercent < 0.20) ? originalPmi : 0;

    // Build Table Row
    const isLastRow = balance <= 0.01;
    const rowClass = isLastRow ? 'payoff-highlight' : '';
    const trueTotalPayment = requiredPiThisMonth + extraPaid + bonusPayment + staticEscrow + activePmi;

    htmlRows += `<tr class="${rowClass}">
      <td><strong>Month ${month}</strong></td>
      <td>${formatCurrency(trueTotalPayment)}</td>
      <td>${formatCurrency(regularPi)}</td>
      <td>${formatCurrency(staticEscrow)}</td>
      <td>${formatCurrency(activePmi)}</td>
      <td class="${(extraPaid + bonusPayment) > 0 ? 'accent bold' : 'dim'}">${formatCurrency(extraPaid + bonusPayment)}</td>
      <td class="dim">${formatCurrency(actualInterestPaid)}</td>
      <td>${formatCurrency(actualPrincipalPaid - (isLastRow ? 0 : (extraPaid + bonusPayment)))}</td>
      <td class="${isLastRow ? 'bold accent' : ''}">${formatCurrency(Math.max(0, balance))}</td>
    </tr>`;
  }

  tbody.innerHTML = htmlRows;

  // Populate Summary metrics
  document.getElementById('sum-loan-amount').textContent = formatCurrency(loanAmount);
  document.getElementById('sum-monthly-pi').textContent = formatCurrency(regularPi);
  document.getElementById('sum-monthly-extra').textContent = formatCurrency(additional);
  document.getElementById('sum-total-interest').textContent = formatCurrency(totalInterest);

  const yrs = Math.floor(month / 12);
  const mos = month % 12;
  let timeStr = '';
  if (yrs > 0 && mos > 0) {
    timeStr = `${yrs} yr${yrs > 1 ? 's' : ''}, ${mos} mo${mos > 1 ? 's' : ''}`;
  } else if (yrs > 0) {
    timeStr = `${yrs} yr${yrs > 1 ? 's' : ''}`;
  } else {
    timeStr = `${mos} mo${mos > 1 ? 's' : ''}`;
  }

  const monthsSaved = Math.max(0, originalMonths - month);
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

  // Print Schedule button (moved from inline onclick so script-src can drop 'unsafe-inline')
  const btnPrint = document.getElementById('btn-print-schedule');
  if (btnPrint) {
    btnPrint.addEventListener('click', () => window.print());
  }

  // 5. CSV Export Trigger
  const btnExportCSV = document.getElementById('btn-export-csv');
  if (btnExportCSV) {
    btnExportCSV.addEventListener('click', () => {
      const rows = document.querySelectorAll('#schedule-table tr');
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
