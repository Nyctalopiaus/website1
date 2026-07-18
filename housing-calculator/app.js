document.addEventListener('DOMContentLoaded', () => {
  // Inputs
  const homePriceInput = document.getElementById('homePrice');
  const homePriceSlider = document.getElementById('homePriceSlider');
  const downPaymentAmountInput = document.getElementById('downPaymentAmount');
  const downPaymentPercentInput = document.getElementById('downPaymentPercent');
  const downPaymentSlider = document.getElementById('downPaymentSlider');
  const interest30Input = document.getElementById('interest30');
  const interest15Input = document.getElementById('interest15');
  const taxRateInput = document.getElementById('taxRate');
  const homeInsuranceInput = document.getElementById('homeInsurance');
  const hoaFeesInput = document.getElementById('hoaFees');
  const pmiRateInput = document.getElementById('pmiRate');
  const grossIncomeInput = document.getElementById('grossIncome');
  const additionalPaymentInput = document.getElementById('additionalPayment');
  const additionalPaymentSlider = document.getElementById('additionalPaymentSlider');
  const viewAmortBtn = document.getElementById('btn-view-amort');
  const lumpSumAmountInput = document.getElementById('lumpSumAmount');
  const lumpSumFrequencyInput = document.getElementById('lumpSumFrequency');
  const mlsNumberInput = document.getElementById('mlsNumber');
  const btnSearchMls = document.getElementById('btn-search-mls');

  // Outputs & Display Cards
  const card30 = document.getElementById('card-30yr');
  const card15 = document.getElementById('card-15yr');
  const totalPayment30El = document.getElementById('total-payment-30');
  const piPayment30El = document.getElementById('pi-payment-30');
  const lifetimeInterest30El = document.getElementById('lifetime-interest-30');
  const interestSavings30El = document.getElementById('interest-savings-30');
  const timeSavedRow30El = document.getElementById('time-saved-row-30');
  const timeSaved30El = document.getElementById('time-saved-30');
  
  const totalPayment15El = document.getElementById('total-payment-15');
  const piPayment15El = document.getElementById('pi-payment-15');
  const lifetimeInterest15El = document.getElementById('lifetime-interest-15');
  const interestSavings15El = document.getElementById('interest-savings-15');
  const timeSavedRow15El = document.getElementById('time-saved-row-15');
  const timeSaved15El = document.getElementById('time-saved-15');

  // Interactive Chart Elements
  const chartTotalValEl = document.getElementById('chart-total-val');
  const activeTermLabelEl = document.getElementById('active-term-label');
  const legendPiEl = document.getElementById('legend-pi');
  const legendTaxEl = document.getElementById('legend-tax');
  const legendInsEl = document.getElementById('legend-ins');
  const legendPmiEl = document.getElementById('legend-pmi');
  const legendHoaEl = document.getElementById('legend-hoa');
  const pmiLegendItem = document.querySelector('.id-pmi-item');
  const hoaLegendItem = document.querySelector('.id-hoa-item');

  // Donut Segments
  const segmentPi = document.querySelector('.donut-segment.pi');
  const segmentTax = document.querySelector('.donut-segment.tax');
  const segmentIns = document.querySelector('.donut-segment.ins');
  const segmentPmi = document.querySelector('.donut-segment.pmi');
  const segmentHoa = document.querySelector('.donut-segment.hoa');

  // Affordability
  const dtiRatioEl = document.getElementById('dti-ratio');
  const dtiStatusBadge = document.getElementById('dti-status-badge');
  const dtiProgressBar = document.getElementById('dti-progress-bar');
  const dtiDescriptionEl = document.getElementById('dti-description');

  // Button rates load
  const loadRatesBtn = document.getElementById('btn-load-rates');
  const ratesAttributionEl = document.getElementById('rates-attribution');

  const STORAGE_KEY = 'housing_calculator_inputs';
  let activeTerm = 30; // 30 or 15
  let saveDebounceTimer;

  // Donut circumference (2 * PI * r) where r = 70
  const CIRCUMFERENCE = 2 * Math.PI * 70;

  // Synced rates mock
  const estRates = {
    30: 6.85,
    15: 6.15
  };

  async function loadSavedInputs() {
    try {
      const res = await fetch('/api/calculator');
      if (res.ok) {
        const data = await res.json();
        if (data) {
          homePriceInput.value = data.homePrice || 400000;
          homePriceSlider.value = data.homePrice || 400000;
          downPaymentAmountInput.value = data.downPaymentAmount || 80000;
          downPaymentPercentInput.value = data.downPaymentPercent || 20;
          downPaymentSlider.value = data.downPaymentPercent || 20;
          interest30Input.value = data.interest30 || 6.5;
          interest15Input.value = data.interest15 || 5.8;
          taxRateInput.value = data.taxRate || 1.2;
          homeInsuranceInput.value = data.homeInsurance || 1200;
          hoaFeesInput.value = data.hoaFees || 0;
          pmiRateInput.value = data.pmiRate || 0.75;
          grossIncomeInput.value = data.grossIncome || 10000;
          additionalPaymentInput.value = data.additionalPayment || 0;
          additionalPaymentSlider.value = data.additionalPayment || 0;
          lumpSumAmountInput.value = data.lumpSumAmount || 0;
          lumpSumFrequencyInput.value = data.lumpSumFrequency || 12;
          activeTerm = data.activeTerm || 30;
        }
      } else {
        console.error('[ERROR] Failed to fetch calculator profile:', res.statusText);
        loadLocalFallback();
      }
    } catch (e) {
      console.error('[ERROR] API connection error:', e);
      loadLocalFallback();
    }
    updateTermCardSelection();
    calculateAll();
  }

  function loadLocalFallback() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const data = JSON.parse(saved);
        homePriceInput.value = data.homePrice || 400000;
        homePriceSlider.value = data.homePrice || 400000;
        downPaymentAmountInput.value = data.downPaymentAmount || 80000;
        downPaymentPercentInput.value = data.downPaymentPercent || 20;
        downPaymentSlider.value = data.downPaymentPercent || 20;
        interest30Input.value = data.interest30 || 6.5;
        interest15Input.value = data.interest15 || 5.8;
        taxRateInput.value = data.taxRate || 1.2;
        homeInsuranceInput.value = data.homeInsurance || 1200;
        hoaFeesInput.value = data.hoaFees || 0;
        pmiRateInput.value = data.pmiRate || 0.75;
        grossIncomeInput.value = data.grossIncome || 10000;
        additionalPaymentInput.value = data.additionalPayment || 0;
        additionalPaymentSlider.value = data.additionalPayment || 0;
        lumpSumAmountInput.value = data.lumpSumAmount || 0;
        lumpSumFrequencyInput.value = data.lumpSumFrequency || 12;
        activeTerm = data.activeTerm || 30;
      } catch (e) {
        console.error('[ERROR] Failed to parse saved local fallback calculator inputs:', e);
      }
    }
  }

  function saveCurrentInputs() {
    const data = {
      homePrice: parseFloat(homePriceInput.value),
      downPaymentAmount: parseFloat(downPaymentAmountInput.value),
      downPaymentPercent: parseFloat(downPaymentPercentInput.value),
      interest30: parseFloat(interest30Input.value),
      interest15: parseFloat(interest15Input.value),
      taxRate: parseFloat(taxRateInput.value),
      homeInsurance: parseFloat(homeInsuranceInput.value),
      hoaFees: parseFloat(hoaFeesInput.value),
      pmiRate: parseFloat(pmiRateInput.value),
      grossIncome: parseFloat(grossIncomeInput.value),
      additionalPayment: parseFloat(additionalPaymentInput.value) || 0,
      lumpSumAmount: parseFloat(lumpSumAmountInput.value) || 0,
      lumpSumFrequency: parseInt(lumpSumFrequencyInput.value) || 12,
      activeTerm: activeTerm
    };

    // Save locally for instant offline feedback
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

    // Debounce the network request (wait 500ms after last edit before uploading)
    clearTimeout(saveDebounceTimer);
    saveDebounceTimer = setTimeout(async () => {
      try {
        await fetch('/api/calculator', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });
      } catch (e) {
        console.error('[ERROR] Failed to sync calculator inputs with database:', e);
      }
    }, 500);
  }

  function updateTermCardSelection() {
    if (activeTerm === 30) {
      card30.classList.add('selected');
      card15.classList.remove('selected');
      activeTermLabelEl.textContent = '30-Year';
    } else {
      card15.classList.add('selected');
      card30.classList.remove('selected');
      activeTermLabelEl.textContent = '15-Year';
    }
  }

  // Calculate Amortized Principal & Interest Monthly Payment
  function calcPIPayment(principal, annualRate, years) {
    if (annualRate <= 0) return principal / (years * 12);
    const r = annualRate / 12 / 100;
    const n = years * 12;
    return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  }

  // Calculate payoff details given additional payments (amortization schedule loop)
  function simulatePayoff(principal, annualRate, years, additionalPayment, lumpSumAmount = 0, lumpSumFreq = 12) {
    const r = annualRate / 12 / 100;
    const originalMonths = years * 12;
    
    let regularPi = 0;
    if (annualRate > 0) {
      regularPi = principal * (r * Math.pow(1 + r, originalMonths)) / (Math.pow(1 + r, originalMonths) - 1);
    } else {
      regularPi = principal / originalMonths;
    }

    let balance = principal;
    let totalInterest = 0;
    let monthsCount = 0;
    const yearlyBalances  = [principal]; // remaining balance at end of each year
    const yearlyInterest  = [0];         // cumulative interest paid through each year
    const yearlyPayments  = [0];         // cumulative principal paid through each year

    let cumInterest  = 0;
    let cumPrincipal = 0;
    let totalExtraMonthly = 0;
    let totalLumpsum      = 0;

    while (balance > 0.01 && monthsCount < 1200) {
      monthsCount++;
      const interestThisMonth    = balance * r;
      const regularPrincipalPaid = Math.max(0, regularPi - interestThisMonth);
      const maxExtra             = Math.max(0, balance - regularPrincipalPaid);
      const actualExtraMonthly   = Math.min(additionalPayment, maxExtra);
      totalExtraMonthly += actualExtraMonthly;
      let actualLumpSum = 0;
      if (lumpSumAmount > 0 && monthsCount % lumpSumFreq === 0) {
        actualLumpSum = Math.min(lumpSumAmount, maxExtra - actualExtraMonthly);
      }
      totalLumpsum += actualLumpSum;
      const actualPrincipalPaid = Math.min(balance, regularPrincipalPaid + actualExtraMonthly + actualLumpSum);
      totalInterest  += interestThisMonth;
      cumInterest    += interestThisMonth;
      cumPrincipal   += actualPrincipalPaid;
      balance        -= actualPrincipalPaid;

      if (monthsCount % 12 === 0) {
        yearlyBalances.push(Math.max(0, balance));
        yearlyInterest.push(cumInterest);
        yearlyPayments.push(cumPrincipal);
      }
    }

    // Ensure the final year is capped at zero
    if (yearlyBalances[yearlyBalances.length - 1] > 0.01) {
      yearlyBalances.push(0);
      yearlyInterest.push(cumInterest);
      yearlyPayments.push(cumPrincipal);
    }

    // Pad remaining slots to the full term length with final cumulative values
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

  function formatTimeSaved(months) {
    if (months <= 0) return '';
    const yrs = Math.floor(months / 12);
    const mos = months % 12;
    if (yrs > 0 && mos > 0) {
      return `${yrs} year${yrs > 1 ? 's' : ''}, ${mos} month${mos > 1 ? 's' : ''}`;
    } else if (yrs > 0) {
      return `${yrs} year${yrs > 1 ? 's' : ''}`;
    } else {
      return `${mos} month${mos > 1 ? 's' : ''}`;
    }
  }

  function calculateAll() {
    const homePrice = parseFloat(homePriceInput.value) || 0;
    const downPayment = parseFloat(downPaymentAmountInput.value) || 0;
    const p30 = parseFloat(interest30Input.value) || 0;
    const p15 = parseFloat(interest15Input.value) || 0;
    const taxRate = parseFloat(taxRateInput.value) || 0;
    const homeInsAnnual = parseFloat(homeInsuranceInput.value) || 0;
    const hoa = parseFloat(hoaFeesInput.value) || 0;
    const pmiRate = parseFloat(pmiRateInput.value) || 0;
    const grossIncome = parseFloat(grossIncomeInput.value) || 1; // prevent divide by zero
    const additionalPayment = parseFloat(additionalPaymentInput.value) || 0;
    const lumpSumAmt = parseFloat(lumpSumAmountInput.value) || 0;
    const lumpSumFreq = parseInt(lumpSumFrequencyInput.value) || 12;

    const loanAmount = Math.max(0, homePrice - downPayment);
    const downPercent = homePrice > 0 ? (downPayment / homePrice) * 100 : 0;

    // Monthly property tax
    const monthlyTax = (homePrice * (taxRate / 100)) / 12;

    // Monthly homeowners insurance
    const monthlyIns = homeInsAnnual / 12;

    // Monthly PMI (applies if down payment is less than 20% of home value)
    const monthlyPmi = downPercent < 20 ? (loanAmount * (pmiRate / 100)) / 12 : 0;

    // 30-Year calculations
    const baselinePi30 = calcPIPayment(loanAmount, p30, 30);
    const baselineInterest30 = Math.max(0, (baselinePi30 * 360) - loanAmount);
    
    const amort30 = simulatePayoff(loanAmount, p30, 30, additionalPayment, lumpSumAmt, lumpSumFreq);
    const totalMonthly30 = amort30.regularPi + monthlyTax + monthlyIns + monthlyPmi + hoa;

    const amort30MonthlyOnly = simulatePayoff(loanAmount, p30, 30, additionalPayment, 0, 12);
    const monthlySaved30 = Math.max(0, baselineInterest30 - amort30MonthlyOnly.totalInterest);
    const totalSaved30 = Math.max(0, baselineInterest30 - amort30.totalInterest);
    const lumpSumSaved30 = Math.max(0, totalSaved30 - monthlySaved30);
    const injected30 = amort30.totalExtraMonthly + amort30.totalLumpsum;

    // 15-Year calculations
    const baselinePi15 = calcPIPayment(loanAmount, p15, 15);
    const baselineInterest15 = Math.max(0, (baselinePi15 * 180) - loanAmount);
    
    const amort15 = simulatePayoff(loanAmount, p15, 15, additionalPayment, lumpSumAmt, lumpSumFreq);
    const totalMonthly15 = amort15.regularPi + monthlyTax + monthlyIns + monthlyPmi + hoa;

    const amort15MonthlyOnly = simulatePayoff(loanAmount, p15, 15, additionalPayment, 0, 12);
    const monthlySaved15 = Math.max(0, baselineInterest15 - amort15MonthlyOnly.totalInterest);
    const totalSaved15 = Math.max(0, baselineInterest15 - amort15.totalInterest);
    const lumpSumSaved15 = Math.max(0, totalSaved15 - monthlySaved15);
    const injected15 = amort15.totalExtraMonthly + amort15.totalLumpsum;

    // Render Outputs
    totalPayment30El.textContent = formatCurrency(totalMonthly30);
    piPayment30El.textContent = formatCurrency(amort30.regularPi);
    lifetimeInterest30El.textContent = formatCurrency(amort30.totalInterest);

    if (totalSaved30 > 0.01) {
      interestSavings30El.textContent = 'Total Saved ' + formatCurrency(totalSaved30);
      interestSavings30El.style.display = 'block';
      document.getElementById('advanced-savings-30').style.display = 'flex';
      document.getElementById('saved-monthly-val-30').textContent = formatCurrency(monthlySaved30);
      document.getElementById('saved-lump-val-30').textContent = formatCurrency(lumpSumSaved30);
      document.getElementById('total-injected-30').textContent = formatCurrency(injected30);
    } else {
      interestSavings30El.style.display = 'none';
      document.getElementById('advanced-savings-30').style.display = 'none';
    }

    if ((additionalPayment > 0 || lumpSumAmt > 0) && amort30.monthsSaved > 0) {
      timeSaved30El.textContent = formatTimeSaved(amort30.monthsSaved);
      timeSavedRow30El.style.display = 'flex';
    } else {
      timeSavedRow30El.style.display = 'none';
    }

    totalPayment15El.textContent = formatCurrency(totalMonthly15);
    piPayment15El.textContent = formatCurrency(amort15.regularPi);
    lifetimeInterest15El.textContent = formatCurrency(amort15.totalInterest);

    if (totalSaved15 > 0.01) {
      interestSavings15El.textContent = 'Total Saved ' + formatCurrency(totalSaved15);
      interestSavings15El.style.display = 'block';
      document.getElementById('advanced-savings-15').style.display = 'flex';
      document.getElementById('saved-monthly-val-15').textContent = formatCurrency(monthlySaved15);
      document.getElementById('saved-lump-val-15').textContent = formatCurrency(lumpSumSaved15);
      document.getElementById('total-injected-15').textContent = formatCurrency(injected15);
    } else {
      interestSavings15El.style.display = 'none';
      document.getElementById('advanced-savings-15').style.display = 'none';
    }

    if ((additionalPayment > 0 || lumpSumAmt > 0) && amort15.monthsSaved > 0) {
      timeSaved15El.textContent = formatTimeSaved(amort15.monthsSaved);
      timeSavedRow15El.style.display = 'flex';
    } else {
      timeSavedRow15El.style.display = 'none';
    }

    // Determine current values based on active card term selection
    const activeTotal = activeTerm === 30 ? totalMonthly30 : totalMonthly15;
    const activePI = activeTerm === 30 ? amort30.regularPi : amort15.regularPi;

    // Render active breakdown values
    chartTotalValEl.textContent = formatCurrency(activeTotal);
    legendPiEl.textContent = formatCurrency(activePI);
    legendTaxEl.textContent = formatCurrency(monthlyTax);
    legendInsEl.textContent = formatCurrency(monthlyIns);

    // Toggle legends depending on values
    if (monthlyPmi > 0) {
      legendPmiEl.textContent = formatCurrency(monthlyPmi);
      pmiLegendItem.style.display = 'flex';
    } else {
      pmiLegendItem.style.display = 'none';
    }

    if (hoa > 0) {
      legendHoaEl.textContent = formatCurrency(hoa);
      hoaLegendItem.style.display = 'flex';
    } else {
      legendHoaEl.textContent = formatCurrency(hoa);
      hoaLegendItem.style.display = 'none';
    }

    // Draw Donut segments
    drawDonutChart(activePI, monthlyTax, monthlyIns, monthlyPmi, hoa, activeTotal);

    // Update Affordability
    updateAffordability(activeTotal, grossIncome);

    // Draw Amortization Burndown Charts
    const hasExtraPayments = additionalPayment > 0 || lumpSumAmt > 0;
    const baseline30 = hasExtraPayments ? simulatePayoff(loanAmount, p30, 30, 0, 0, 12) : null;
    const baseline15 = hasExtraPayments ? simulatePayoff(loanAmount, p15, 15, 0, 0, 12) : null;
    drawBurndownChart('burndown-svg-30', amort30, baseline30, homePrice);
    drawBurndownChart('burndown-svg-15', amort15, baseline15, homePrice);
  }

  /**
   * Renders a three-line cumulative amortization burndown chart into the given SVG element.
   * @param {string} svgId        - The id of the target <svg> element.
   * @param {object} amortData    - The object returned by simulatePayoff() (with extra payments).
   * @param {object|null} baselineData - simulatePayoff() result with zero extra payments, or null.
   * @param {number} homePrice    - Full purchase price used for equity milestone thresholds.
   */
  function drawBurndownChart(svgId, amortData, baselineData, homePrice) {
    const svg = document.getElementById(svgId);
    if (!svg) return;

    svg.innerHTML = '';

    const { yearlyBalances, yearlyInterest, yearlyPayments } = amortData;
    const termYears = yearlyBalances.length - 1;
    const loanAmount = yearlyBalances[0];

    if (loanAmount <= 0 || termYears <= 0) return;

    const WIDTH      = 500;
    const HEIGHT     = 200;
    const PAD_LEFT   = 45;
    const PAD_RIGHT  = 15;
    const PAD_TOP    = 15;
    const PAD_BOTTOM = 25;
    const PLOT_W     = WIDTH  - PAD_LEFT  - PAD_RIGHT;
    const PLOT_H     = HEIGHT - PAD_TOP   - PAD_BOTTOM;

    const chartMax = Math.max(
      loanAmount,
      yearlyInterest[yearlyInterest.length - 1],
      yearlyPayments[yearlyPayments.length - 1]
    );

    const toX = (yr)  => PAD_LEFT + (yr / termYears) * PLOT_W;
    const toY = (val) => PAD_TOP  + (1 - val / chartMax) * PLOT_H;

    // --- SVG defs (shadow filter for tooltip) — defined once per SVG ---
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    const filt = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
    filt.setAttribute('id', `tip-shadow-${svgId}`);
    filt.setAttribute('x', '-20%');
    filt.setAttribute('y', '-20%');
    filt.setAttribute('width', '140%');
    filt.setAttribute('height', '140%');
    const fds = document.createElementNS('http://www.w3.org/2000/svg', 'feDropShadow');
    fds.setAttribute('dx', '0'); fds.setAttribute('dy', '1');
    fds.setAttribute('stdDeviation', '2');
    fds.setAttribute('flood-color', 'rgba(0,0,0,0.45)');
    filt.appendChild(fds);
    defs.appendChild(filt);
    svg.appendChild(defs);

    // --- Y-axis grid lines & labels ---
    const Y_TICKS = 4;
    for (let i = 0; i <= Y_TICKS; i++) {
      const val  = chartMax * (i / Y_TICKS);
      const yPos = toY(val);

      const gridLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      gridLine.setAttribute('x1', PAD_LEFT); gridLine.setAttribute('y1', yPos);
      gridLine.setAttribute('x2', WIDTH - PAD_RIGHT); gridLine.setAttribute('y2', yPos);
      gridLine.setAttribute('class', 'chart-grid-line');
      svg.appendChild(gridLine);

      let label;
      if      (val >= 1_000_000) label = `$${(val / 1_000_000).toFixed(1)}M`;
      else if (val >= 1_000)     label = `$${Math.round(val / 1_000)}k`;
      else                       label = `$${Math.round(val)}`;

      const yText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      yText.setAttribute('x', PAD_LEFT - 6); yText.setAttribute('y', yPos + 4);
      yText.setAttribute('text-anchor', 'end');
      yText.setAttribute('class', 'chart-axis-text');
      yText.textContent = label;
      svg.appendChild(yText);
    }

    // --- X-axis tick marks & labels ---
    const xStep = termYears <= 15 ? 5 : 10;
    for (let yr = 0; yr <= termYears; yr += xStep) {
      const xPos = toX(yr);
      if (yr > 0) {
        const vLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        vLine.setAttribute('x1', xPos); vLine.setAttribute('y1', PAD_TOP);
        vLine.setAttribute('x2', xPos); vLine.setAttribute('y2', HEIGHT - PAD_BOTTOM);
        vLine.setAttribute('class', 'chart-grid-line');
        svg.appendChild(vLine);
      }
      const xText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      xText.setAttribute('x', xPos);
      xText.setAttribute('y', HEIGHT - PAD_BOTTOM + 14);
      xText.setAttribute('text-anchor', 'middle');
      xText.setAttribute('class', 'chart-axis-text');
      xText.textContent = yr === 0 ? '0' : `${yr}yr`;
      svg.appendChild(xText);
    }

    // Builds a linear M…L SVG path from a values array.
    const buildLinearPath = (values) => {
      let d = '';
      for (let i = 0; i < values.length; i++) {
        d += i === 0 ? `M ${toX(i)} ${toY(values[i])}` : ` L ${toX(i)} ${toY(values[i])}`;
      }
      return d;
    };

    // --- Ghost baseline (no extra payments) ---
    if (baselineData) {
      const ghost = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      ghost.setAttribute('d', buildLinearPath(baselineData.yearlyBalances));
      ghost.setAttribute('class', 'chart-path-baseline');
      svg.appendChild(ghost);
    }

    // --- Main data series (back→front: interest, principal, balance) ---
    for (const { values, cls } of [
      { values: yearlyInterest, cls: 'chart-path-interest' },
      { values: yearlyPayments, cls: 'chart-path-payment'  },
      { values: yearlyBalances, cls: 'chart-path-balance'  },
    ]) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', buildLinearPath(values));
      path.setAttribute('class', cls);
      svg.appendChild(path);
    }

    // --- Axes ---
    const xAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    xAxis.setAttribute('x1', PAD_LEFT); xAxis.setAttribute('y1', HEIGHT - PAD_BOTTOM);
    xAxis.setAttribute('x2', WIDTH - PAD_RIGHT); xAxis.setAttribute('y2', HEIGHT - PAD_BOTTOM);
    xAxis.setAttribute('class', 'chart-axis');
    svg.appendChild(xAxis);

    const yAxis = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    yAxis.setAttribute('x1', PAD_LEFT); yAxis.setAttribute('y1', PAD_TOP);
    yAxis.setAttribute('x2', PAD_LEFT); yAxis.setAttribute('y2', HEIGHT - PAD_BOTTOM);
    yAxis.setAttribute('class', 'chart-axis');
    svg.appendChild(yAxis);

    // --- Equity milestone dots ---
    const effectiveHome = homePrice > 0 ? homePrice : loanAmount;
    const MILESTONES = [
      { pct: 0.80, label: 'PMI Removal', sub: '80% LTV',    color: '#90cdf4' },
      { pct: 0.50, label: '50% Equity',  sub: '50% LTV',    color: '#9ae6b4' },
      { pct: 0.20, label: '20% Equity',  sub: 'Near Payoff', color: '#fbd38d' },
    ];

    // Shared tooltip group — rendered last so it always appears on top
    const tipGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    tipGroup.setAttribute('class', 'chart-tooltip-group');
    tipGroup.style.display = 'none';
    tipGroup.style.pointerEvents = 'none';

    const tipRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    tipRect.setAttribute('class', 'chart-tooltip-bg');
    tipRect.setAttribute('rx', '4'); tipRect.setAttribute('ry', '4');
    tipRect.setAttribute('width', '96'); tipRect.setAttribute('height', '34');
    tipRect.setAttribute('filter', `url(#tip-shadow-${svgId})`);

    const tipLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    tipLabel.setAttribute('class', 'chart-tooltip-label');
    tipLabel.setAttribute('x', '8'); tipLabel.setAttribute('y', '14');

    const tipSub = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    tipSub.setAttribute('class', 'chart-tooltip-text');
    tipSub.setAttribute('x', '8'); tipSub.setAttribute('y', '27');

    tipGroup.appendChild(tipRect);
    tipGroup.appendChild(tipLabel);
    tipGroup.appendChild(tipSub);

    for (const { pct, label, sub, color } of MILESTONES) {
      const threshold = effectiveHome * pct;
      if (threshold >= loanAmount) continue; // loan never reaches this level

      // Linear interpolation to find the fractional year the balance crosses the threshold
      let crossYear = null;
      for (let i = 1; i < yearlyBalances.length; i++) {
        if (yearlyBalances[i - 1] > threshold && yearlyBalances[i] <= threshold) {
          const span = yearlyBalances[i - 1] - yearlyBalances[i];
          const t    = span > 0 ? (yearlyBalances[i - 1] - threshold) / span : 0;
          crossYear  = (i - 1) + t;
          break;
        }
      }
      if (crossYear === null) continue;

      const cx = toX(crossYear);
      const cy = toY(threshold);
      const yearStr = `Year ${(Math.round(crossYear * 10) / 10).toFixed(1)}`;

      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', cx); dot.setAttribute('cy', cy); dot.setAttribute('r', '5');
      dot.setAttribute('class', 'chart-milestone-dot');
      dot.style.stroke = color;

      dot.addEventListener('mouseenter', () => {
        tipLabel.textContent = label;
        tipSub.textContent   = yearStr;
        const TIP_W = 96;
        let tx = cx + 10;
        let ty = cy - 42;
        if (tx + TIP_W > WIDTH - PAD_RIGHT) tx = cx - TIP_W - 10;
        if (ty < PAD_TOP) ty = cy + 10;
        tipGroup.setAttribute('transform', `translate(${tx}, ${ty})`);
        tipGroup.style.display = '';
      });
      dot.addEventListener('mouseleave', () => { tipGroup.style.display = 'none'; });

      svg.appendChild(dot);
    }

    // Tooltip always rendered last (topmost layer)
    svg.appendChild(tipGroup);
  }

  function drawDonutChart(pi, tax, ins, pmi, hoa, total) {
    if (total <= 0) {
      segmentPi.style.strokeDasharray = `0 ${CIRCUMFERENCE}`;
      segmentTax.style.strokeDasharray = `0 ${CIRCUMFERENCE}`;
      segmentIns.style.strokeDasharray = `0 ${CIRCUMFERENCE}`;
      segmentPmi.style.strokeDasharray = `0 ${CIRCUMFERENCE}`;
      segmentHoa.style.strokeDasharray = `0 ${CIRCUMFERENCE}`;
      return;
    }

    const segments = [
      { el: segmentPi, value: pi },
      { el: segmentTax, value: tax },
      { el: segmentIns, value: ins },
      { el: segmentPmi, value: pmi },
      { el: segmentHoa, value: hoa }
    ];

    let accumulatedOffset = 0;

    segments.forEach(seg => {
      const percentage = seg.value / total;
      const strokeVal = percentage * CIRCUMFERENCE;
      seg.el.style.strokeDasharray = `${strokeVal} ${CIRCUMFERENCE}`;
      seg.el.style.strokeDashoffset = -accumulatedOffset;
      accumulatedOffset += strokeVal;
    });
  }

  function updateAffordability(monthlyHousingCost, grossMonthlyIncome) {
    const dti = (monthlyHousingCost / grossMonthlyIncome) * 100;
    dtiRatioEl.textContent = `${dti.toFixed(1)}%`;

    dtiProgressBar.style.width = `${Math.min(dti, 100)}%`;

    // Reset classes
    dtiProgressBar.className = 'progress-bar';
    dtiStatusBadge.className = 'badge-dti';

    if (dti < 28) {
      dtiStatusBadge.textContent = 'Healthy';
      dtiStatusBadge.classList.add('bg-healthy');
      dtiProgressBar.classList.add('bg-healthy');
      dtiDescriptionEl.textContent = `At ${dti.toFixed(1)}%, this housing payment falls safely below the standard 28% front-end DTI limit. This is considered highly affordable for your income profile.`;
    } else if (dti >= 28 && dti <= 36) {
      dtiStatusBadge.textContent = 'Moderate';
      dtiStatusBadge.classList.add('bg-moderate');
      dtiProgressBar.classList.add('bg-moderate');
      dtiDescriptionEl.textContent = `At ${dti.toFixed(1)}%, your payment is within the 28%–36% range. This is moderate, but may stretch your budget if you have substantial other monthly debts (student loans, car payments).`;
    } else {
      dtiStatusBadge.textContent = 'High Risk';
      dtiStatusBadge.classList.add('bg-high');
      dtiProgressBar.classList.add('bg-high');
      dtiDescriptionEl.textContent = `At ${dti.toFixed(1)}%, this payment exceeds the 36% threshold. Traditional lenders may find this risky. Consider making a larger down payment or searching for a lower-priced home.`;
    }
  }

  function formatCurrency(val) {
    return '$' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  // Sync logic for inputs & sliders
  homePriceInput.addEventListener('input', () => {
    const val = parseFloat(homePriceInput.value) || 0;
    homePriceSlider.value = Math.min(Math.max(val, 100000), 1500000);
    
    const badge = document.getElementById('badge-redfin-price');
    if (badge) badge.style.display = 'none';

    // Maintain down payment percentage
    const percent = parseFloat(downPaymentPercentInput.value) || 0;
    const amount = (percent / 100) * val;
    downPaymentAmountInput.value = Math.round(amount);

    calculateAll();
    saveCurrentInputs();
  });

  homePriceSlider.addEventListener('input', () => {
    const val = parseFloat(homePriceSlider.value);
    homePriceInput.value = val;

    const badge = document.getElementById('badge-redfin-price');
    if (badge) badge.style.display = 'none';

    // Maintain down payment percentage
    const percent = parseFloat(downPaymentPercentInput.value) || 0;
    const amount = (percent / 100) * val;
    downPaymentAmountInput.value = Math.round(amount);

    calculateAll();
    saveCurrentInputs();
  });

  downPaymentAmountInput.addEventListener('input', () => {
    let amount = parseFloat(downPaymentAmountInput.value) || 0;
    const homePrice = parseFloat(homePriceInput.value) || 0;

    if (amount > homePrice) {
      downPaymentAmountInput.value = homePrice;
      amount = homePrice;
    }

    if (homePrice > 0) {
      const percent = Math.min(100, Math.max(0, (amount / homePrice) * 100));
      downPaymentPercentInput.value = Math.round(percent);
      downPaymentSlider.value = Math.round(percent);
    }

    calculateAll();
    saveCurrentInputs();
  });

  downPaymentPercentInput.addEventListener('input', () => {
    const percent = parseFloat(downPaymentPercentInput.value) || 0;
    const homePrice = parseFloat(homePriceInput.value) || 0;

    downPaymentSlider.value = Math.min(100, Math.max(0, percent));
    const amount = (percent / 100) * homePrice;
    downPaymentAmountInput.value = Math.round(amount);

    calculateAll();
    saveCurrentInputs();
  });

  downPaymentSlider.addEventListener('input', () => {
    const percent = parseFloat(downPaymentSlider.value);
    const homePrice = parseFloat(homePriceInput.value) || 0;

    downPaymentPercentInput.value = percent;
    const amount = (percent / 100) * homePrice;
    downPaymentAmountInput.value = Math.round(amount);

    calculateAll();
    saveCurrentInputs();
  });

  // Basic numeric listeners
  const standardNumericInputs = [
    interest30Input, interest15Input, taxRateInput,
    homeInsuranceInput, hoaFeesInput, pmiRateInput, grossIncomeInput
  ];

  standardNumericInputs.forEach(input => {
    input.addEventListener('input', () => {
      if (input === taxRateInput) {
        const badge = document.getElementById('badge-redfin-tax');
        if (badge) badge.style.display = 'none';
      } else if (input === hoaFeesInput) {
        const badge = document.getElementById('badge-redfin-hoa');
        if (badge) badge.style.display = 'none';
      } else if (input === interest30Input) {
        const badge = document.getElementById('badge-live-30');
        if (badge) badge.style.display = 'none';
      } else if (input === interest15Input) {
        const badge = document.getElementById('badge-live-15');
        if (badge) badge.style.display = 'none';
      }
      calculateAll();
      saveCurrentInputs();
    });
  });

  additionalPaymentInput.addEventListener('input', () => {
    additionalPaymentSlider.value = parseFloat(additionalPaymentInput.value) || 0;
    calculateAll();
    saveCurrentInputs();
  });

  additionalPaymentSlider.addEventListener('input', () => {
    additionalPaymentInput.value = additionalPaymentSlider.value;
    calculateAll();
    saveCurrentInputs();
  });

  lumpSumAmountInput.addEventListener('input', () => { calculateAll(); saveCurrentInputs(); });
  lumpSumFrequencyInput.addEventListener('change', () => { calculateAll(); saveCurrentInputs(); });

  // Card term toggles
  card30.addEventListener('click', () => {
    activeTerm = 30;
    updateTermCardSelection();
    calculateAll();
    saveCurrentInputs();
  });

  card15.addEventListener('click', () => {
    activeTerm = 15;
    updateTermCardSelection();
    calculateAll();
    saveCurrentInputs();
  });

// Rate Loader - Hooked to the Proxy with visual feedback
  loadRatesBtn.addEventListener('click', async () => {
    const originalText = loadRatesBtn.textContent;
    loadRatesBtn.textContent = '⏳ Syncing...';
    loadRatesBtn.style.opacity = '0.7';
    loadRatesBtn.disabled = true;

    await loadLiveMortgageRates();

    loadRatesBtn.textContent = '✅ Updated';
    setTimeout(() => {
        loadRatesBtn.textContent = originalText;
        loadRatesBtn.style.opacity = '1';
        loadRatesBtn.disabled = false;
    }, 2000);
  });

// ==========================================
  // SECURE TARGETED URL PARSER ENGINE
  // ==========================================
  async function fetchPropertyData(inputUrl) {
    // Target the preview sub-elements
    const previewBox = document.getElementById('mls-preview-box');
    const previewAddress = document.getElementById('mls-preview-address');
    const previewDetails = document.getElementById('mls-preview-details');

    try {
      btnSearchMls.textContent = '⏳ Parsing Page...';
      btnSearchMls.disabled = true;
      if (previewBox) previewBox.style.display = 'none';

      // CRITICAL FIX: Explicitly send the parameter as ?url= and encode it safely
      const response = await fetch(`mls-proxy.php?url=${encodeURIComponent(inputUrl.trim())}`);
      const data = await response.json();

      if (data.error) {
        console.error("Parser Backend Error:", data.error);
        alert(data.error);
        return;
      }

      // 1. Map extracted JSON to your calculator inputs
      // Check both standard naming conventions used by common platform payloads
      const homePrice = data.price || (data.props?.pageProps?.initialReduxState?.propertyDetails?.property?.price);
      if (!homePrice) {
        alert("Could not extract a valid price from this page structure.");
        return;
      }

      homePriceInput.value = homePrice;
      homePriceSlider.value = Math.min(Math.max(homePrice, 100000), 1500000);
      
      const priceBadge = document.getElementById('badge-redfin-price');
      if (priceBadge) priceBadge.style.display = 'inline-block';
      
      const percent = parseFloat(downPaymentPercentInput.value) || 0;
      const amount = (percent / 100) * homePrice;
      downPaymentAmountInput.value = Math.round(amount);

      // Handle HOA mapping
      const hoaFee = data.hoa_fee !== undefined ? data.hoa_fee : data.hoaFee;
      if (hoaFee !== undefined) {
        hoaFeesInput.value = hoaFee;
        const hoaBadge = document.getElementById('badge-redfin-hoa');
        if (hoaBadge) hoaBadge.style.display = 'inline-block';
      }

      // Handle tax calculations
      const propertyTax = data.property_tax || data.taxRate;
      if (propertyTax !== undefined) {
        taxRateInput.value = parseFloat(propertyTax).toFixed(2);
        const taxBadge = document.getElementById('badge-redfin-tax');
        if (taxBadge) taxBadge.style.display = 'inline-block';
      }

      // 2. Render confirmation card
      if (previewBox && previewAddress && previewDetails) {
        previewAddress.textContent = data.address || "Property Parsed Successfully";
        previewDetails.textContent = `Home Price: $${parseInt(homePrice).toLocaleString()} | HOA: $${hoaFee || 0}/mo`;
        previewBox.style.display = 'block';
      }

      console.log("[SYSTEM] Target URL details applied successfully.");
      calculateAll();
      saveCurrentInputs();

    } catch (error) {
      console.error("Network Fetch Error:", error);
      alert("A server error occurred while connecting to the parser backend.");
    } finally {
      btnSearchMls.textContent = '🔍 Fetch Property';
      btnSearchMls.disabled = false;
    }
  }

  // Hook the click event listener
  btnSearchMls.addEventListener('click', () => {
    const userInput = mlsNumberInput.value.trim();
    if (!userInput) {
      alert("Please enter a Redfin property page URL first.");
      return;
    }

    // Check if the user entered a raw MLS number instead of a URL
    const looksLikeUrl = userInput.includes('.') || userInput.includes('/') || userInput.includes('http://') || userInput.includes('https://');
    if (!looksLikeUrl) {
      alert("Please paste a full Redfin property page URL (e.g., https://www.redfin.com/...) instead of a raw MLS number. The tool securely extracts price, taxes, and HOA details directly from the property page.");
      return;
    }

    fetchPropertyData(userInput);
  });

  // View Amortization Table click handler
  viewAmortBtn.addEventListener('click', () => {
    window.location.href = 'amortization.html';
  });

async function loadLiveMortgageRates() {
  const originalText = loadRatesBtn.textContent;
  loadRatesBtn.textContent = '⏳ Syncing...';
  loadRatesBtn.disabled = true;

  try {
    const res = await fetch('rates-proxy.php'); 
    const data = await res.json();
    
    if (data && data.rate) {
      const parsed30 = parseFloat(data.rate);
      if (!isNaN(parsed30)) {
        interest30Input.value = parsed30.toFixed(2);
        const badge30 = document.getElementById('badge-live-30');
        if (badge30) badge30.style.display = 'inline-block';
        
        const parsed15 = data.rate15 ? parseFloat(data.rate15) : (parsed30 - 0.70);
        if (!isNaN(parsed15)) {
          interest15Input.value = parsed15.toFixed(2);
          const badge15 = document.getElementById('badge-live-15');
          if (badge15) badge15.style.display = 'inline-block';
        }
      }
      
      // Update Attribution UI
      if (ratesAttributionEl) {
        ratesAttributionEl.textContent = `Source: ${data.source} (Updated: ${data.date})`;
        ratesAttributionEl.classList.add('visible');
      }
      
      // CRITICAL: Force recalculate and save after updating the value
      calculateAll();
      saveCurrentInputs();
      
      loadRatesBtn.textContent = '✅ Updated';
    } else {
      throw new Error("No rate data found");
    }
  } catch (e) {
    console.error('[ERROR] Could not fetch live rates:', e);
    ratesAttributionEl.textContent = 'Source: Fallback (July 2026)';
    ratesAttributionEl.classList.add('visible');
    loadRatesBtn.textContent = '❌ Error';
  }

  // Reset button state
  setTimeout(() => {
      loadRatesBtn.textContent = originalText;
      loadRatesBtn.disabled = false;
  }, 2000);
}

  // Page Setup
  loadLiveMortgageRates();
  loadSavedInputs();
});
