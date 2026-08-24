/**
 * Nycto's Rent vs. Sell Calculator — Core Financial Engine & UI Handler
 * 100% Client-Side Local Calculation & Privacy First
 */

(function () {
  'use strict';

  // DOM Elements
  const elements = {
    // Metrics
    metricMonthlyCashflow: document.getElementById('metric-monthly-cashflow'),
    metricHorizonCashflow: document.getElementById('metric-horizon-cashflow'),

    // Verdict Banner
    verdictCard: document.getElementById('verdict-card'),
    verdictTitle: document.getElementById('verdict-title'),
    verdictDesc: document.getElementById('verdict-desc'),
    statRentWealth: document.getElementById('stat-rent-wealth'),
    statSellWealth: document.getElementById('stat-sell-wealth'),
    statCrossover: document.getElementById('stat-crossover'),

    // Chart
    chartTitle: document.getElementById('chart-title'),
    btnChartCashflow: document.getElementById('btn-chart-cashflow'),
    btnChartWealth: document.getElementById('btn-chart-wealth'),
    mainChartCanvas: document.getElementById('mainChart'),
    chartLegend: document.getElementById('chart-legend'),

    // Tax Warning
    taxWarningBox: document.getElementById('tax-warning-box'),
    taxImpactTag: document.getElementById('tax-impact-tag'),

    // Inputs & Sliders
    rentAmount: document.getElementById('rentAmount'),
    rentAmountSlider: document.getElementById('rentAmountSlider'),
    mortgagePITI: document.getElementById('mortgagePITI'),
    mortgagePITISlider: document.getElementById('mortgagePITISlider'),
    helocPayment: document.getElementById('helocPayment'),
    helocPaymentSlider: document.getElementById('helocPaymentSlider'),
    rentGrowth: document.getElementById('rentGrowth'),
    rentGrowthSlider: document.getElementById('rentGrowthSlider'),
    holdingPeriod: document.getElementById('holdingPeriod'),
    holdingPeriodSlider: document.getElementById('holdingPeriodSlider'),

    // Advanced Reserves
    btnToggleReserves: document.getElementById('btn-toggle-reserves'),
    reservesCollapse: document.getElementById('reserves-collapse'),
    reserveRate: document.getElementById('reserveRate'),
    reserveRateSlider: document.getElementById('reserveRateSlider'),
    appreciationRate: document.getElementById('appreciationRate'),
    appreciationRateSlider: document.getElementById('appreciationRateSlider'),

    // Sell Inputs
    homeValue: document.getElementById('homeValue'),
    homeValueSlider: document.getElementById('homeValueSlider'),
    mortgageBalance: document.getElementById('mortgageBalance'),
    mortgageBalanceSlider: document.getElementById('mortgageBalanceSlider'),
    sellingCostsRate: document.getElementById('sellingCostsRate'),
    sellingCostsRateSlider: document.getElementById('sellingCostsRateSlider'),
    investmentReturn: document.getElementById('investmentReturn'),
    investmentReturnSlider: document.getElementById('investmentReturnSlider'),
    taxFilingStatus: document.getElementById('taxFilingStatus'),
    sellNetProceedsVal: document.getElementById('sell-net-proceeds-val'),

    // Table
    btnToggleTable: document.getElementById('btn-toggle-table'),
    tableContainer: document.getElementById('table-container'),
    scheduleTbody: document.getElementById('schedule-tbody'),

    // Recovery Card
    cashflowRecoveryCard: document.getElementById('cashflow-recovery-card'),
    recoverySubtitle: document.getElementById('recovery-subtitle'),
    fixRentVal: document.getElementById('fix-rent-val'),
    recoveryRentText: document.getElementById('recovery-rent-text'),
    recoveryHelocText: document.getElementById('recovery-heloc-text'),
    recoveryReservesText: document.getElementById('recovery-reserves-text'),
    recoveryBalancedText: document.getElementById('recovery-balanced-text'),
    btnFixRent: document.getElementById('btn-fix-rent'),
    btnFixHeloc: document.getElementById('btn-fix-heloc'),
    btnFixReserves: document.getElementById('btn-fix-reserves'),
    btnFixBalanced: document.getElementById('btn-fix-balanced'),

    // Property Import
    importUrlInput: document.getElementById('importUrlInput'),
    btnImportProperty: document.getElementById('btn-import-property'),
    importStatusMsg: document.getElementById('import-status-msg')
  };

  // State
  let chartMode = 'cashflow'; // 'cashflow' | 'wealth'
  let currentResults = null;

  // Format currency helper
  function formatCurrency(val) {
    const isNeg = val < 0;
    const absVal = Math.abs(Math.round(val));
    const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(absVal);
    return isNeg ? `-${formatted}` : formatted;
  }

  // Format compact number ($5K, $100K, etc.)
  function formatCompactCurrency(val) {
    if (Math.abs(val) >= 1000000) {
      return `$${(val / 1000000).toFixed(1)}M`;
    }
    if (Math.abs(val) >= 1000) {
      return `$${Math.round(val / 1000)}K`;
    }
    return `$${Math.round(val)}`;
  }

  // Bind paired Number Input and Range Slider
  function bindInputAndSlider(inputEl, sliderEl, onChangeCallback) {
    if (!inputEl || !sliderEl) return;

    inputEl.addEventListener('input', () => {
      let val = parseFloat(inputEl.value);
      if (!isNaN(val)) {
        sliderEl.value = val;
      }
      onChangeCallback();
    });

    sliderEl.addEventListener('input', () => {
      inputEl.value = sliderEl.value;
      onChangeCallback();
    });
  }

  // Read current form values
  function getInputs() {
    return {
      rentAmount: parseFloat(elements.rentAmount.value) || 0,
      mortgagePITI: parseFloat(elements.mortgagePITI.value) || 0,
      helocPayment: parseFloat(elements.helocPayment.value) || 0,
      rentGrowth: (parseFloat(elements.rentGrowth.value) || 0) / 100,
      holdingPeriod: parseInt(elements.holdingPeriod.value, 10) || 10,
      reserveRate: (parseFloat(elements.reserveRate.value) || 0) / 100,
      appreciationRate: (parseFloat(elements.appreciationRate.value) || 0) / 100,
      homeValue: parseFloat(elements.homeValue.value) || 0,
      mortgageBalance: parseFloat(elements.mortgageBalance.value) || 0,
      sellingCostsRate: (parseFloat(elements.sellingCostsRate.value) || 0) / 100,
      investmentReturn: (parseFloat(elements.investmentReturn.value) || 0) / 100,
      taxFilingStatus: elements.taxFilingStatus.value
    };
  }

  // Financial Model Calculation Engine
  function calculateModel(inputs) {
    const years = inputs.holdingPeriod;
    const schedule = [];

    // Sell Today baseline
    const initialSellingCosts = inputs.homeValue * inputs.sellingCostsRate;
    const netProceedsSellToday = Math.max(0, inputs.homeValue - inputs.mortgageBalance - initialSellingCosts);

    let cumulativeCashFlow = 0;
    let currentHomeValue = inputs.homeValue;
    let currentMortgageBalance = inputs.mortgageBalance;
    const annualMortgagePaydownRate = 0.025; // ~2.5% principal paydown per year estimate

    let crossoverYear = null;

    for (let y = 1; y <= years; y++) {
      // Rental Income in Year y
      const annualRentGrowthFactor = Math.pow(1 + inputs.rentGrowth, y - 1);
      const monthlyRentY = inputs.rentAmount * annualRentGrowthFactor;
      const annualGrossRentY = monthlyRentY * 12;

      // Expenses in Year y
      const monthlyReserveY = monthlyRentY * inputs.reserveRate;
      const monthlyNetCashflowY = monthlyRentY - monthlyReserveY - inputs.mortgagePITI - inputs.helocPayment;
      const annualNetCashflowY = monthlyNetCashflowY * 12;

      cumulativeCashFlow += annualNetCashflowY;

      // Home Value & Principal Paydown
      currentHomeValue = currentHomeValue * (1 + inputs.appreciationRate);
      currentMortgageBalance = Math.max(0, currentMortgageBalance * (1 - annualMortgagePaydownRate));

      const rentalGrossEquity = currentHomeValue - currentMortgageBalance;
      const futureSellingCosts = currentHomeValue * inputs.sellingCostsRate;

      // Section 121 Tax Calculation
      // If sold in year <= 3, primary residence exclusion applies ($250k single / $500k married tax free)
      const totalGainOnProperty = Math.max(0, currentHomeValue - inputs.homeValue);
      const taxExclusionLimit = inputs.taxFilingStatus === 'married' ? 500000 : 250000;
      let estimatedTaxOwed = 0;

      if (y > 3) {
        // Excluded period passed: capital gains tax + depreciation recapture
        const taxableGain = Math.max(0, totalGainOnProperty - taxExclusionLimit);
        const capitalGainsTax = taxableGain * 0.15; // 15% LTCG estimate
        const estimatedDepreciationRecapture = (inputs.homeValue * 0.7) / 27.5 * y * 0.25; // standard residential depreciation
        estimatedTaxOwed = capitalGainsTax + estimatedDepreciationRecapture;
      }

      // Rent Strategy Net Worth at Year y
      const rentNetWorthY = cumulativeCashFlow + rentalGrossEquity - futureSellingCosts - estimatedTaxOwed;

      // Sell Strategy Net Worth at Year y (proceeds growing at investment return rate)
      const sellNetWorthY = netProceedsSellToday * Math.pow(1 + inputs.investmentReturn, y);

      // Track crossover
      if (crossoverYear === null && rentNetWorthY >= sellNetWorthY) {
        crossoverYear = y;
      }

      schedule.push({
        year: y,
        monthlyRent: monthlyRentY,
        monthlyCashflow: monthlyNetCashflowY,
        annualCashflow: annualNetCashflowY,
        cumulativeCashflow: cumulativeCashFlow,
        homeValue: currentHomeValue,
        mortgageBalance: currentMortgageBalance,
        rentNetWorth: rentNetWorthY,
        sellNetWorth: sellNetWorthY,
        estimatedTaxOwed: estimatedTaxOwed,
        winner: rentNetWorthY >= sellNetWorthY ? 'rent' : 'sell'
      });
    }

    const year1MonthlyCashflow = schedule.length > 0 ? schedule[0].monthlyCashflow : 0;
    const finalYear = schedule[schedule.length - 1] || {};

    return {
      inputs,
      netProceedsSellToday,
      year1MonthlyCashflow,
      totalHorizonCashflow: cumulativeCashFlow,
      finalRentNetWorth: finalYear.rentNetWorth || 0,
      finalSellNetWorth: finalYear.sellNetWorth || 0,
      finalTaxOwed: finalYear.estimatedTaxOwed || 0,
      crossoverYear,
      schedule
    };
  }

  // Update DOM UI elements based on model results
  function updateUI(results) {
    currentResults = results;

    // Top Metrics (User Screenshot Match)
    elements.metricMonthlyCashflow.textContent = formatCurrency(results.year1MonthlyCashflow);
    elements.metricHorizonCashflow.textContent = formatCurrency(results.totalHorizonCashflow);

    // Sell Proceeds Summary Box
    elements.sellNetProceedsVal.textContent = formatCurrency(results.netProceedsSellToday);

    // Verdict Card
    const diff = Math.abs(results.finalRentNetWorth - results.finalSellNetWorth);
    const formattedDiff = formatCurrency(diff);

    if (results.finalRentNetWorth >= results.finalSellNetWorth) {
      elements.verdictCard.className = 'verdict-card verdict-rent';
      elements.verdictTitle.textContent = 'Renting Out Builds More Wealth';
      elements.verdictDesc.innerHTML = `Holding the house as a rental yields an estimated <strong>+${formattedDiff}</strong> more in total net worth over ${results.inputs.holdingPeriod} years compared to selling today and reinvesting the net proceeds.`;
    } else {
      elements.verdictCard.className = 'verdict-card verdict-sell';
      elements.verdictTitle.textContent = 'Selling Now Builds More Wealth';
      elements.verdictDesc.innerHTML = `Selling today and reinvesting the net cash proceeds yields an estimated <strong>+${formattedDiff}</strong> more in net worth over ${results.inputs.holdingPeriod} years compared to holding the rental.`;
    }

    elements.statRentWealth.textContent = formatCurrency(results.finalRentNetWorth);
    elements.statSellWealth.textContent = formatCurrency(results.finalSellNetWorth);
    elements.statCrossover.textContent = results.crossoverYear ? `Year ${results.crossoverYear}` : 'N/A (Sell Wins)';

    // Tax Warning Box
    if (results.inputs.holdingPeriod > 3) {
      elements.taxWarningBox.style.display = 'flex';
      elements.taxImpactTag.innerHTML = `Impact: Holding past Year 3 adds an estimated <strong>${formatCurrency(results.finalTaxOwed)}</strong> in taxes upon sale.`;
    } else {
      elements.taxWarningBox.style.display = 'flex';
      elements.taxImpactTag.innerHTML = `✅ <strong>Tax-Free Window Active:</strong> Selling within ${results.inputs.holdingPeriod} yrs qualifies for Sec 121 capital gains exclusion.`;
    }

    // Cash Flow Recovery Analysis
    if (results.year1MonthlyCashflow < 0 || results.totalHorizonCashflow < 0) {
      elements.cashflowRecoveryCard.style.display = 'flex';

      const deficit = Math.abs(results.year1MonthlyCashflow);
      elements.recoverySubtitle.textContent = `Your current sliders result in a monthly deficit of -${formatCurrency(deficit)}/mo (-${formatCurrency(deficit * 12)}/yr). Below are 4 ways to turn your cash flow positive:`;

      // 1. Break-Even Rent Target
      const totalMonthlyDebt = results.inputs.mortgagePITI + results.inputs.helocPayment;
      const targetRent = Math.ceil((totalMonthlyDebt / (1 - results.inputs.reserveRate)) / 50) * 50;
      const rentIncreaseNeeded = targetRent - results.inputs.rentAmount;

      elements.fixRentVal.textContent = formatCurrency(targetRent);
      elements.recoveryRentText.innerHTML = `Increase rent from ${formatCurrency(results.inputs.rentAmount)} to <strong>${formatCurrency(targetRent)}/mo</strong> (+${formatCurrency(rentIncreaseNeeded)}/mo) to break even on Year 1 cash flow.`;
      elements.btnFixRent.onclick = () => {
        elements.rentAmount.value = targetRent;
        elements.rentAmountSlider.value = targetRent;
        recalc();
      };

      // 2. HELOC Elimination
      if (results.inputs.helocPayment > 0) {
        const pctSaved = Math.min(100, Math.round((results.inputs.helocPayment / (deficit || 1)) * 100));
        elements.recoveryHelocText.innerHTML = `Paying off or refinancing your HELOC saves <strong>${formatCurrency(results.inputs.helocPayment)}/mo</strong>, cutting your monthly deficit by <strong>${pctSaved}%</strong>.`;
        elements.btnFixHeloc.onclick = () => {
          elements.helocPayment.value = 0;
          elements.helocPaymentSlider.value = 0;
          recalc();
        };
      } else {
        elements.recoveryHelocText.innerHTML = `HELOC is already $0. Refinancing primary mortgage PITI (${formatCurrency(results.inputs.mortgagePITI)}/mo) is needed to cut debt service.`;
        elements.btnFixHeloc.onclick = null;
      }

      // 3. Reserve Rate Optimization
      const currentReservePct = Math.round(results.inputs.reserveRate * 100);
      if (currentReservePct > 10) {
        const lowerReservePct = 10;
        const reserveSavings = results.inputs.rentAmount * (results.inputs.reserveRate - 0.10);
        elements.recoveryReservesText.innerHTML = `Self-managing or lowering maintenance reserves from <strong>${currentReservePct}%</strong> to <strong>${lowerReservePct}%</strong> saves <strong>+${formatCurrency(reserveSavings)}/mo</strong>.`;
        elements.btnFixReserves.onclick = () => {
          elements.reserveRate.value = 10;
          elements.reserveRateSlider.value = 10;
          recalc();
        };
      } else {
        elements.recoveryReservesText.innerHTML = `Reserves are already set low at <strong>${currentReservePct}%</strong> (${formatCurrency(results.inputs.rentAmount * results.inputs.reserveRate)}/mo).`;
        elements.btnFixReserves.onclick = null;
      }

      // 4. Balanced Action Plan
      const balancedRent = Math.ceil((results.inputs.rentAmount * 1.15) / 50) * 50;
      const balancedReserves = 0.15;
      const balancedHeloc = Math.max(0, Math.round((results.inputs.helocPayment * 0.4) / 25) * 25);
      const balancedCashflow = (balancedRent * (1 - balancedReserves)) - results.inputs.mortgagePITI - balancedHeloc;

      elements.recoveryBalancedText.innerHTML = `Raise rent to <strong>${formatCurrency(balancedRent)}</strong>, lower reserves to <strong>15%</strong>, and reduce HELOC to <strong>${formatCurrency(balancedHeloc)}</strong> to yield <strong>+${formatCurrency(balancedCashflow)}/mo</strong> net positive cash flow!`;
      elements.btnFixBalanced.onclick = () => {
        elements.rentAmount.value = balancedRent;
        elements.rentAmountSlider.value = balancedRent;
        elements.reserveRate.value = 15;
        elements.reserveRateSlider.value = 15;
        elements.helocPayment.value = balancedHeloc;
        elements.helocPaymentSlider.value = balancedHeloc;
        recalc();
      };

    } else {
      elements.cashflowRecoveryCard.style.display = 'none';
    }

    // Render Table
    renderScheduleTable(results.schedule);

    // Render Canvas Chart
    renderChart(results);
  }

  // Render Schedule Table
  function renderScheduleTable(schedule) {
    elements.scheduleTbody.innerHTML = '';

    schedule.forEach(row => {
      const tr = document.createElement('tr');
      const winnerBadge = row.winner === 'rent'
        ? `<span class="badge badge-gold" style="background: rgba(139, 92, 246, 0.15); color: #a855f7;">Rent</span>`
        : `<span class="badge badge-gold">Sell</span>`;

      tr.innerHTML = `
        <td>Yr ${row.year}</td>
        <td>${formatCurrency(row.monthlyRent)}</td>
        <td>${formatCurrency(row.monthlyCashflow)}</td>
        <td>${formatCurrency(row.cumulativeCashflow)}</td>
        <td>${formatCurrency(row.homeValue)}</td>
        <td>${formatCurrency(row.mortgageBalance)}</td>
        <td class="text-violet" style="font-weight:600;">${formatCurrency(row.rentNetWorth)}</td>
        <td class="text-gold" style="font-weight:600;">${formatCurrency(row.sellNetWorth)}</td>
        <td>${winnerBadge}</td>
      `;
      elements.scheduleTbody.appendChild(tr);
    });
  }

  // Canvas Chart Renderer (Native HTML5 Crisp Drawing)
  function renderChart(results) {
    const canvas = elements.mainChartCanvas;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    // Use container dimensions to prevent infinite canvas height growth
    const container = canvas.parentElement;
    const width = container.clientWidth || 600;
    const height = container.clientHeight || 280;

    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    const padding = { top: 30, right: 30, bottom: 40, left: 65 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const schedule = results.schedule;
    const totalYears = schedule.length;

    if (totalYears === 0) return;

    if (chartMode === 'cashflow') {
      elements.chartTitle.textContent = 'Cumulative Net Rental Surplus';
      elements.chartLegend.innerHTML = `<span class="legend-item"><span class="legend-dot dot-violet"></span> Cumulative Net Rental Cash Flow</span>`;

      // Data points: Year 0 (0) through Year N (cumulative cash flow)
      const points = [{ x: 0, y: 0 }];
      schedule.forEach(s => points.push({ x: s.year, y: s.cumulativeCashflow }));

      let maxY = Math.max(...points.map(p => p.y));
      let minY = Math.min(...points.map(p => p.y));

      // Handle scale bounds gracefully
      if (maxY === minY) {
        maxY = Math.max(1000, Math.abs(maxY) * 1.5);
        minY = Math.min(-1000, -Math.abs(minY) * 1.5);
      } else {
        const span = maxY - minY;
        maxY += span * 0.15;
        minY -= span * 0.15;
      }

      // Ensure 0 is always included in the scale
      if (minY > 0) minY = 0;
      if (maxY < 0) maxY = 0;

      const getYPos = (val) => padding.top + chartHeight - ((val - minY) / (maxY - minY)) * chartHeight;
      const getXPos = (yr) => padding.left + (yr / totalYears) * chartWidth;
      const zeroY = getYPos(0);

      // Draw Gridlines & Y-Axis Labels
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.fillStyle = '#8d9590';
      ctx.font = '11px Outfit, sans-serif';
      ctx.textAlign = 'right';

      const steps = 4;
      for (let i = 0; i <= steps; i++) {
        const val = minY + (i / steps) * (maxY - minY);
        const yPos = getYPos(val);

        ctx.beginPath();
        ctx.moveTo(padding.left, yPos);
        ctx.lineTo(width - padding.right, yPos);
        ctx.stroke();

        ctx.fillText(formatCompactCurrency(val), padding.left - 10, yPos + 4);
      }

      // Emphasize zero baseline
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding.left, zeroY);
      ctx.lineTo(width - padding.right, zeroY);
      ctx.stroke();

      // Draw X-Axis Labels
      ctx.textAlign = 'center';
      ctx.fillStyle = '#8d9590';
      const xStep = Math.max(1, Math.floor(totalYears / 5));
      for (let yr = 0; yr <= totalYears; yr += xStep) {
        const xPos = getXPos(yr);
        ctx.fillText(yr.toString(), xPos, height - 10);
      }
      ctx.fillText('Years of Ownership', padding.left + chartWidth / 2, height - 25);

      // Draw Fill Area anchored to zero baseline
      const isNegOverall = points[points.length - 1].y < 0;
      const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);

      if (isNegOverall) {
        gradient.addColorStop(0, 'rgba(239, 68, 68, 0.05)');
        gradient.addColorStop(1, 'rgba(239, 68, 68, 0.4)');
      } else {
        gradient.addColorStop(0, 'rgba(139, 92, 246, 0.45)');
        gradient.addColorStop(1, 'rgba(139, 92, 246, 0.02)');
      }

      ctx.beginPath();
      ctx.moveTo(getXPos(0), zeroY);
      points.forEach(p => ctx.lineTo(getXPos(p.x), getYPos(p.y)));
      ctx.lineTo(getXPos(totalYears), zeroY);
      ctx.closePath();
      ctx.fillStyle = gradient;
      ctx.fill();

      // Draw Line
      ctx.beginPath();
      ctx.moveTo(getXPos(0), getYPos(points[0].y));
      points.forEach(p => ctx.lineTo(getXPos(p.x), getYPos(p.y)));
      ctx.strokeStyle = isNegOverall ? '#f87171' : '#a855f7';
      ctx.lineWidth = 3;
      ctx.stroke();

    } else {
      // Wealth Comparison View (Rent Net Worth vs Sell Net Worth)
      elements.chartTitle.textContent = 'Net Worth Comparison Over Time';
      elements.chartLegend.innerHTML = `
        <span class="legend-item"><span class="legend-dot dot-violet"></span> Rent Out Strategy</span>
        <span class="legend-item"><span class="legend-dot dot-gold"></span> Sell & Reinvest Strategy</span>
      `;

      const rentPoints = [{ x: 0, y: results.netProceedsSellToday }];
      const sellPoints = [{ x: 0, y: results.netProceedsSellToday }];

      schedule.forEach(s => {
        rentPoints.push({ x: s.year, y: s.rentNetWorth });
        sellPoints.push({ x: s.year, y: s.sellNetWorth });
      });

      const allVals = [...rentPoints.map(p => p.y), ...sellPoints.map(p => p.y)];
      let maxY = Math.max(...allVals, 1000) * 1.15;
      let minY = Math.min(0, Math.min(...allVals)) * 1.1;

      const getYPos = (val) => padding.top + chartHeight - ((val - minY) / (maxY - minY)) * chartHeight;
      const getXPos = (yr) => padding.left + (yr / totalYears) * chartWidth;

      // Draw Gridlines & Y-Axis Labels
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
      ctx.fillStyle = '#8d9590';
      ctx.font = '11px Outfit, sans-serif';
      ctx.textAlign = 'right';

      const steps = 4;
      for (let i = 0; i <= steps; i++) {
        const val = minY + (i / steps) * (maxY - minY);
        const yPos = getYPos(val);

        ctx.beginPath();
        ctx.moveTo(padding.left, yPos);
        ctx.lineTo(width - padding.right, yPos);
        ctx.stroke();

        ctx.fillText(formatCompactCurrency(val), padding.left - 10, yPos + 4);
      }

      // X-Axis Labels
      ctx.textAlign = 'center';
      const xStep = Math.max(1, Math.floor(totalYears / 5));
      for (let yr = 0; yr <= totalYears; yr += xStep) {
        const xPos = getXPos(yr);
        ctx.fillText(yr.toString(), xPos, height - 10);
      }

      // Draw Sell Line (Gold)
      ctx.beginPath();
      ctx.moveTo(getXPos(0), getYPos(sellPoints[0].y));
      sellPoints.forEach(p => ctx.lineTo(getXPos(p.x), getYPos(p.y)));
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      // Draw Rent Line (Violet)
      ctx.beginPath();
      ctx.moveTo(getXPos(0), getYPos(rentPoints[0].y));
      rentPoints.forEach(p => ctx.lineTo(getXPos(p.x), getYPos(p.y)));
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Crossover Highlight
      if (results.crossoverYear) {
        const cx = getXPos(results.crossoverYear);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(cx, padding.top);
        ctx.lineTo(cx, height - padding.bottom);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }

  // Recalculate & save
  function recalc() {
    const inputs = getInputs();
    const results = calculateModel(inputs);
    updateUI(results);

    // Save to LocalStorage
    try {
      localStorage.setItem('nycto_rent_vs_sell', JSON.stringify(inputs));
    } catch (e) {
      // Ignore storage errors
    }
  }

  // Restore saved state from LocalStorage
  function restoreState() {
    try {
      const saved = localStorage.getItem('nycto_rent_vs_sell');
      if (!saved) return;

      const data = JSON.parse(saved);
      if (data.rentAmount !== undefined) {
        elements.rentAmount.value = data.rentAmount;
        elements.rentAmountSlider.value = data.rentAmount;
      }
      if (data.mortgagePITI !== undefined) {
        elements.mortgagePITI.value = data.mortgagePITI;
        elements.mortgagePITISlider.value = data.mortgagePITI;
      }
      if (data.helocPayment !== undefined) {
        elements.helocPayment.value = data.helocPayment;
        elements.helocPaymentSlider.value = data.helocPayment;
      }
      if (data.rentGrowth !== undefined) {
        elements.rentGrowth.value = (data.rentGrowth * 100).toFixed(1);
        elements.rentGrowthSlider.value = (data.rentGrowth * 100).toFixed(1);
      }
      if (data.holdingPeriod !== undefined) {
        elements.holdingPeriod.value = data.holdingPeriod;
        elements.holdingPeriodSlider.value = data.holdingPeriod;
      }
      if (data.reserveRate !== undefined) {
        elements.reserveRate.value = Math.round(data.reserveRate * 100);
        elements.reserveRateSlider.value = Math.round(data.reserveRate * 100);
      }
      if (data.appreciationRate !== undefined) {
        elements.appreciationRate.value = (data.appreciationRate * 100).toFixed(1);
        elements.appreciationRateSlider.value = (data.appreciationRate * 100).toFixed(1);
      }
      if (data.homeValue !== undefined) {
        elements.homeValue.value = data.homeValue;
        elements.homeValueSlider.value = data.homeValue;
      }
      if (data.mortgageBalance !== undefined) {
        elements.mortgageBalance.value = data.mortgageBalance;
        elements.mortgageBalanceSlider.value = data.mortgageBalance;
      }
      if (data.sellingCostsRate !== undefined) {
        elements.sellingCostsRate.value = (data.sellingCostsRate * 100).toFixed(1);
        elements.sellingCostsRateSlider.value = (data.sellingCostsRate * 100).toFixed(1);
      }
      if (data.investmentReturn !== undefined) {
        elements.investmentReturn.value = (data.investmentReturn * 100).toFixed(1);
        elements.investmentReturnSlider.value = (data.investmentReturn * 100).toFixed(1);
      }
      if (data.taxFilingStatus !== undefined) {
        elements.taxFilingStatus.value = data.taxFilingStatus;
      }
    } catch (e) {
      // Ignore restore errors
    }
  }

  // Initialize Event Listeners
  function init() {
    // Bind all slider-input pairs
    bindInputAndSlider(elements.rentAmount, elements.rentAmountSlider, recalc);
    bindInputAndSlider(elements.mortgagePITI, elements.mortgagePITISlider, recalc);
    bindInputAndSlider(elements.helocPayment, elements.helocPaymentSlider, recalc);
    bindInputAndSlider(elements.rentGrowth, elements.rentGrowthSlider, recalc);
    bindInputAndSlider(elements.holdingPeriod, elements.holdingPeriodSlider, recalc);
    bindInputAndSlider(elements.reserveRate, elements.reserveRateSlider, recalc);
    bindInputAndSlider(elements.appreciationRate, elements.appreciationRateSlider, recalc);
    bindInputAndSlider(elements.homeValue, elements.homeValueSlider, recalc);
    bindInputAndSlider(elements.mortgageBalance, elements.mortgageBalanceSlider, recalc);
    bindInputAndSlider(elements.sellingCostsRate, elements.sellingCostsRateSlider, recalc);
    bindInputAndSlider(elements.investmentReturn, elements.investmentReturnSlider, recalc);

    elements.taxFilingStatus.addEventListener('change', recalc);

    // Chart Toggles
    elements.btnChartCashflow.addEventListener('click', () => {
      chartMode = 'cashflow';
      elements.btnChartCashflow.classList.add('active');
      elements.btnChartWealth.classList.remove('active');
      recalc();
    });

    elements.btnChartWealth.addEventListener('click', () => {
      chartMode = 'wealth';
      elements.btnChartWealth.classList.add('active');
      elements.btnChartCashflow.classList.remove('active');
      recalc();
    });

    // Advanced Reserves Collapse Toggle
    elements.btnToggleReserves.addEventListener('click', () => {
      const isHidden = elements.reservesCollapse.style.display === 'none';
      elements.reservesCollapse.style.display = isHidden ? 'flex' : 'none';
      elements.btnToggleReserves.querySelector('.arrow').textContent = isHidden ? '▲' : '▼';
    });

    // Table Collapse Toggle
    elements.btnToggleTable.addEventListener('click', () => {
      const isHidden = elements.tableContainer.style.display === 'none';
      elements.tableContainer.style.display = isHidden ? 'block' : 'none';
      elements.btnToggleTable.textContent = isHidden ? 'Hide Yearly Schedule' : 'Show Yearly Schedule';
    });

    // Property Import Listener
    if (elements.btnImportProperty) {
      elements.btnImportProperty.addEventListener('click', () => handlePropertyImport(false));
    }
    if (elements.importUrlInput) {
      elements.importUrlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handlePropertyImport(false);
      });
    }

    const btnBookmarklet = document.getElementById('btn-open-bookmarklet');
    if (btnBookmarklet) {
      btnBookmarklet.addEventListener('click', () => {
        showImportStatus(`
          📌 <strong>Bookmarklet Import:</strong> Drag the <strong>🔖 Import to Nycto.ninja</strong> bookmarklet button from your Housing Cost Calculator into your browser toolbar. While viewing any listing on Zillow or Redfin, click it to instantly cache the property!
        `, 'info');
      });
    }

    // Handle Window Resize for Canvas
    window.addEventListener('resize', () => {
      if (currentResults) renderChart(currentResults);
    });

    // Load saved data and run initial calc
    restoreState();
    recalc();
  }

  // Handle Property Import from Redfin/Zillow via backend property-lookup.php
  async function handlePropertyImport(force = false) {
    const rawUrl = elements.importUrlInput ? elements.importUrlInput.value.trim() : '';
    if (!rawUrl) {
      showImportStatus('Please paste a valid Redfin, Zillow, or Realtor.com URL.', 'warn');
      return;
    }

    const modeText = force ? '⚡ Performing live property scrape (takes ~5-10s)...' : '⚡ Checking property cache...';
    showImportStatus(modeText, 'info');

    try {
      let endpoint = `../backend/property-lookup.php?url=${encodeURIComponent(rawUrl)}`;
      if (force) endpoint += '&force=1';

      const res = await fetch(endpoint);
      const data = await res.json();

      if (data.error) {
        if (!force && (data.error.includes('cache') || data.cached === false)) {
          showImportStatus(`
            ⚠️ <strong>Property not in 7-day cache yet.</strong> 
            <button type="button" id="btn-force-fetch" style="margin-left: 0.5rem; background: var(--accent-cyan); color: #080a0f; border: none; padding: 0.3rem 0.75rem; border-radius: 0.25rem; font-weight: 700; font-size: 0.78rem; cursor: pointer;">⚡ Live Fetch Property</button>
          `, 'warn');

          const btnForce = document.getElementById('btn-force-fetch');
          if (btnForce) {
            btnForce.onclick = () => handlePropertyImport(true);
          }
          return;
        }

        showImportStatus(`⚠️ ${data.error}`, 'warn');
        return;
      }

      let updatedFields = [];

      // Update Home Value if returned
      if (data.price && data.price > 10000) {
        elements.homeValue.value = data.price;
        elements.homeValueSlider.value = data.price;
        updatedFields.push(`Value: ${formatCurrency(data.price)}`);
      }

      // Update Rent Estimate if returned
      if (data.rentalEstimate && data.rentalEstimate > 100) {
        elements.rentAmount.value = data.rentalEstimate;
        elements.rentAmountSlider.value = data.rentalEstimate;
        updatedFields.push(`Est. Rent: ${formatCurrency(data.rentalEstimate)}/mo`);
      }

      // Recalculate model
      recalc();

      const addr = data.address || 'Property';
      if (updatedFields.length > 0) {
        showImportStatus(`✅ Loaded ${addr} — ${updatedFields.join(' | ')}`, 'success');
      } else {
        showImportStatus(`✓ Found ${addr}, but no numerical price/rent data extracted.`, 'info');
      }
    } catch (e) {
      showImportStatus('⚠️ Could not connect to property lookup service.', 'warn');
    }
  }

  function showImportStatus(msg, type) {
    const el = elements.importStatusMsg;
    if (!el) return;
    el.style.display = 'block';
    el.innerHTML = msg;
    if (type === 'success') el.style.color = '#10b981';
    else if (type === 'warn') el.style.color = '#fbbf24';
    else el.style.color = 'var(--text-muted)';
  }

  // Run on DOM load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
