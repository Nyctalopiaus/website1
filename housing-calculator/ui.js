/**
 * UI Module - Handles all DOM rendering and updates
 * Includes chart drawing, element updates, and event setup
 */

import { CONFIG, OUTPUT_IDS } from './config.js';
import { formatCurrency, formatTimeSaved, linearInterpolateYear, setElementText, getElement } from './utils.js';
import { getDTIStatus } from './calculator.js';

/**
 * Creates references to all DOM elements needed for calculations
 * @returns {Object} Object containing all DOM element references
 */
export function createDOMReferences() {
  const getEl = id => document.getElementById(id);

  return {
    // Inputs
    homePriceInput: getEl('homePrice'),
    homePriceSlider: getEl('homePriceSlider'),
    downPaymentAmountInput: getEl('downPaymentAmount'),
    downPaymentPercentInput: getEl('downPaymentPercent'),
    downPaymentSlider: getEl('downPaymentSlider'),
    interest30Input: getEl('interest30'),
    interest15Input: getEl('interest15'),
    taxRateInput: getEl('taxRate'),
    homeInsuranceInput: getEl('homeInsurance'),
    hoaFeesInput: getEl('hoaFees'),
    pmiRateInput: getEl('pmiRate'),
    grossIncomeInput: getEl('grossIncome'),
    additionalPaymentInput: getEl('additionalPayment'),
    additionalPaymentSlider: getEl('additionalPaymentSlider'),
    lumpSumAmountInput: getEl('lumpSumAmount'),
    lumpSumFrequencyInput: getEl('lumpSumFrequency'),
    mlsNumberInput: getEl('mlsNumber'),
    
    // Buttons
    btnSearchMls: getEl('btn-search-mls'),
    btnViewAmort: getEl('btn-view-amort'),
    loadRatesBtn: getEl('btn-load-rates'),
    
    // Cards
    card30: getEl('card-30yr'),
    card15: getEl('card-15yr'),
    
    // Outputs
    totalPayment30El: getEl('total-payment-30'),
    piPayment30El: getEl('pi-payment-30'),
    lifetimeInterest30El: getEl('lifetime-interest-30'),
    interestSavings30El: getEl('interest-savings-30'),
    timeSavedRow30El: getEl('time-saved-row-30'),
    timeSaved30El: getEl('time-saved-30'),
    
    totalPayment15El: getEl('total-payment-15'),
    piPayment15El: getEl('pi-payment-15'),
    lifetimeInterest15El: getEl('lifetime-interest-15'),
    interestSavings15El: getEl('interest-savings-15'),
    timeSavedRow15El: getEl('time-saved-row-15'),
    timeSaved15El: getEl('time-saved-15'),
    
    // Interactive display
    chartTotalValEl: getEl('chart-total-val'),
    activeTermLabelEl: getEl('active-term-label'),
    legendPiEl: getEl('legend-pi'),
    legendTaxEl: getEl('legend-tax'),
    legendInsEl: getEl('legend-ins'),
    legendPmiEl: getEl('legend-pmi'),
    legendHoaEl: getEl('legend-hoa'),
    pmiLegendItem: document.querySelector('.id-pmi-item'),
    hoaLegendItem: document.querySelector('.id-hoa-item'),
    
    // Donut segments
    segmentPi: document.querySelector('.donut-segment.pi'),
    segmentTax: document.querySelector('.donut-segment.tax'),
    segmentIns: document.querySelector('.donut-segment.ins'),
    segmentPmi: document.querySelector('.donut-segment.pmi'),
    segmentHoa: document.querySelector('.donut-segment.hoa'),
    
    // Affordability
    dtiRatioEl: getEl('dti-ratio'),
    dtiStatusBadge: getEl('dti-status-badge'),
    dtiProgressBar: getEl('dti-progress-bar'),
    dtiDescriptionEl: getEl('dti-description'),
    
    // MLS/Rates
    mlsPreviewBox: getEl('mls-preview-box'),
    mlsPreviewAddress: getEl('mls-preview-address'),
    mlsPreviewDetails: getEl('mls-preview-details'),
    ratesAttributionEl: getEl('rates-attribution')
  };
}

/**
 * Updates term card UI to reflect active term
 * @param {number} activeTerm - 30 or 15
 * @param {Object} domRefs - DOM element references
 */
export function updateTermCardSelection(activeTerm, domRefs) {
  if (activeTerm === 30) {
    domRefs.card30.classList.add('selected');
    domRefs.card15.classList.remove('selected');
    domRefs.activeTermLabelEl.textContent = '30-Year';
  } else {
    domRefs.card15.classList.add('selected');
    domRefs.card30.classList.remove('selected');
    domRefs.activeTermLabelEl.textContent = '15-Year';
  }
}

/**
 * Updates all calculation output displays
 * @param {Object} results - Results from performCalculations()
 * @param {number} activeTerm - 30 or 15
 * @param {Object} domRefs - DOM element references
 */
export function updateAllOutputs(results, activeTerm, domRefs) {
  const {
    monthlyTax,
    monthlyInsurance,
    monthlyPmi,
    
    totalMonthly30, amort30,
    totalMonthly15, amort15,
    monthlySaved30, totalSaved30, lumpSumSaved30,
    monthlySaved15, totalSaved15, lumpSumSaved15
  } = results;

  // 30-Year Outputs
  domRefs.totalPayment30El.textContent = formatCurrency(totalMonthly30);
  domRefs.piPayment30El.textContent = formatCurrency(amort30.regularPi);
  domRefs.lifetimeInterest30El.textContent = formatCurrency(amort30.totalInterest);

  if (totalSaved30 > 0.01) {
    domRefs.interestSavings30El.textContent = `Total Saved ${formatCurrency(totalSaved30)}`;
    domRefs.interestSavings30El.style.display = 'block';
    const advSavings = getElement('advanced-savings-30');
    if (advSavings) {
      advSavings.style.display = 'flex';
      getElement('saved-monthly-val-30').textContent = formatCurrency(monthlySaved30);
      getElement('saved-lump-val-30').textContent = formatCurrency(lumpSumSaved30);
      getElement('total-injected-30').textContent = formatCurrency(amort30.totalExtraMonthly + amort30.totalLumpsum);
    }
  } else {
    domRefs.interestSavings30El.style.display = 'none';
    const advSavings = getElement('advanced-savings-30');
    if (advSavings) advSavings.style.display = 'none';
  }

  if ((results.monthlyTax || 0) > 0 && amort30.monthsSaved > 0) {
    domRefs.timeSaved30El.textContent = formatTimeSaved(amort30.monthsSaved);
    domRefs.timeSavedRow30El.style.display = 'flex';
  } else {
    domRefs.timeSavedRow30El.style.display = 'none';
  }

  // 15-Year Outputs
  domRefs.totalPayment15El.textContent = formatCurrency(totalMonthly15);
  domRefs.piPayment15El.textContent = formatCurrency(amort15.regularPi);
  domRefs.lifetimeInterest15El.textContent = formatCurrency(amort15.totalInterest);

  if (totalSaved15 > 0.01) {
    domRefs.interestSavings15El.textContent = `Total Saved ${formatCurrency(totalSaved15)}`;
    domRefs.interestSavings15El.style.display = 'block';
    const advSavings = getElement('advanced-savings-15');
    if (advSavings) {
      advSavings.style.display = 'flex';
      getElement('saved-monthly-val-15').textContent = formatCurrency(monthlySaved15);
      getElement('saved-lump-val-15').textContent = formatCurrency(lumpSumSaved15);
      getElement('total-injected-15').textContent = formatCurrency(amort15.totalExtraMonthly + amort15.totalLumpsum);
    }
  } else {
    domRefs.interestSavings15El.style.display = 'none';
    const advSavings = getElement('advanced-savings-15');
    if (advSavings) advSavings.style.display = 'none';
  }

  if ((results.additionalPayment || 0) > 0 && amort15.monthsSaved > 0) {
    domRefs.timeSaved15El.textContent = formatTimeSaved(amort15.monthsSaved);
    domRefs.timeSavedRow15El.style.display = 'flex';
  } else {
    domRefs.timeSavedRow15El.style.display = 'none';
  }

  // Active term display
  const activeTotal = activeTerm === 30 ? results.totalMonthly30 : results.totalMonthly15;
  const activePI = activeTerm === 30 ? amort30.regularPi : amort15.regularPi;

  domRefs.chartTotalValEl.textContent = formatCurrency(activeTotal);
  domRefs.legendPiEl.textContent = formatCurrency(activePI);
  domRefs.legendTaxEl.textContent = formatCurrency(monthlyTax);
  domRefs.legendInsEl.textContent = formatCurrency(monthlyInsurance);

  // Toggle PMI/HOA legends
  if (monthlyPmi > 0) {
    domRefs.legendPmiEl.textContent = formatCurrency(monthlyPmi);
    domRefs.pmiLegendItem.style.display = 'flex';
  } else {
    domRefs.pmiLegendItem.style.display = 'none';
  }

  if (results.hoaFees > 0) {
    domRefs.legendHoaEl.textContent = formatCurrency(results.hoaFees);
    domRefs.hoaLegendItem.style.display = 'flex';
  } else {
    domRefs.hoaLegendItem.style.display = 'none';
  }

  // Draw charts
  drawDonutChart(activePI, monthlyTax, monthlyInsurance, monthlyPmi, results.hoaFees, activeTotal, domRefs);
  updateAffordability(activeTotal, results.grossIncome, domRefs);

  // Draw amortization charts
  drawBurndownChart('burndown-svg-30', amort30, results.baseline30, results.homePrice);
  drawBurndownChart('burndown-svg-15', amort15, results.baseline15, results.homePrice);
}

/**
 * Draws donut chart for monthly payment breakdown
 * @param {number} pi - Principal & interest
 * @param {number} tax - Property tax
 * @param {number} insurance - Home insurance
 * @param {number} pmi - PMI
 * @param {number} hoa - HOA fees
 * @param {number} total - Total monthly payment
 * @param {Object} domRefs - DOM element references
 */
export function drawDonutChart(pi, tax, insurance, pmi, hoa, total, domRefs) {
  if (total <= 0) {
    domRefs.segmentPi.style.strokeDasharray = `0 ${CONFIG.DONUT_CIRCUMFERENCE}`;
    domRefs.segmentTax.style.strokeDasharray = `0 ${CONFIG.DONUT_CIRCUMFERENCE}`;
    domRefs.segmentIns.style.strokeDasharray = `0 ${CONFIG.DONUT_CIRCUMFERENCE}`;
    domRefs.segmentPmi.style.strokeDasharray = `0 ${CONFIG.DONUT_CIRCUMFERENCE}`;
    domRefs.segmentHoa.style.strokeDasharray = `0 ${CONFIG.DONUT_CIRCUMFERENCE}`;
    return;
  }

  const segments = [
    { el: domRefs.segmentPi, value: pi },
    { el: domRefs.segmentTax, value: tax },
    { el: domRefs.segmentIns, value: insurance },
    { el: domRefs.segmentPmi, value: pmi },
    { el: domRefs.segmentHoa, value: hoa }
  ];

  let accumulatedOffset = 0;
  segments.forEach(seg => {
    const percentage = seg.value / total;
    const strokeVal = percentage * CONFIG.DONUT_CIRCUMFERENCE;
    seg.el.style.strokeDasharray = `${strokeVal} ${CONFIG.DONUT_CIRCUMFERENCE}`;
    seg.el.style.strokeDashoffset = -accumulatedOffset;
    accumulatedOffset += strokeVal;
  });
}

/**
 * Updates DTI (Debt-to-Income) affordability display
 * @param {number} monthlyHousingCost - Monthly payment
 * @param {number} grossMonthlyIncome - Gross monthly income
 * @param {Object} domRefs - DOM element references
 */
export function updateAffordability(monthlyHousingCost, grossMonthlyIncome, domRefs) {
  const dti = (monthlyHousingCost / grossMonthlyIncome) * 100;
  const status = getDTIStatus(dti);

  domRefs.dtiRatioEl.textContent = `${dti.toFixed(1)}%`;
  domRefs.dtiProgressBar.style.width = `${Math.min(dti, 100)}%`;

  // Reset and apply classes
  domRefs.dtiProgressBar.className = 'progress-bar';
  domRefs.dtiStatusBadge.className = 'badge-dti';

  domRefs.dtiStatusBadge.textContent = status.label;
  domRefs.dtiStatusBadge.classList.add(status.className);
  domRefs.dtiProgressBar.classList.add(status.className);
  domRefs.dtiDescriptionEl.textContent = status.description;
}

/**
 * Draws burndown amortization chart with three data series
 * @param {string} svgId - SVG element ID
 * @param {Object} amortData - Amortization result from simulatePayoff()
 * @param {Object|null} baselineData - Baseline amortization (no extra payments)
 * @param {number} homePrice - Home purchase price for equity milestones
 */
export function drawBurndownChart(svgId, amortData, baselineData, homePrice) {
  const svg = document.getElementById(svgId);
  if (!svg) return;

  svg.innerHTML = '';

  const { yearlyBalances, yearlyInterest, yearlyPayments } = amortData;
  const termYears = yearlyBalances.length - 1;
  const loanAmount = yearlyBalances[0];

  if (loanAmount <= 0 || termYears <= 0) return;

  const WIDTH = CONFIG.CHART_WIDTH;
  const HEIGHT = CONFIG.CHART_HEIGHT;
  const PAD_LEFT = CONFIG.CHART_PAD_LEFT;
  const PAD_RIGHT = CONFIG.CHART_PAD_RIGHT;
  const PAD_TOP = CONFIG.CHART_PAD_TOP;
  const PAD_BOTTOM = CONFIG.CHART_PAD_BOTTOM;
  const PLOT_W = WIDTH - PAD_LEFT - PAD_RIGHT;
  const PLOT_H = HEIGHT - PAD_TOP - PAD_BOTTOM;

  const chartMax = Math.max(
    loanAmount,
    yearlyInterest[yearlyInterest.length - 1],
    yearlyPayments[yearlyPayments.length - 1]
  );

  const toX = yr => PAD_LEFT + (yr / termYears) * PLOT_W;
  const toY = val => PAD_TOP + (1 - val / chartMax) * PLOT_H;

  // SVG defs with shadow filter
  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
  const filt = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
  filt.setAttribute('id', `tip-shadow-${svgId}`);
  filt.setAttribute('x', '-20%'); filt.setAttribute('y', '-20%');
  filt.setAttribute('width', '140%'); filt.setAttribute('height', '140%');
  const fds = document.createElementNS('http://www.w3.org/2000/svg', 'feDropShadow');
  fds.setAttribute('dx', '0'); fds.setAttribute('dy', '1');
  fds.setAttribute('stdDeviation', '2');
  fds.setAttribute('flood-color', 'rgba(0,0,0,0.45)');
  filt.appendChild(fds);
  defs.appendChild(filt);
  svg.appendChild(defs);

  // Y-axis grid lines & labels
  const Y_TICKS = CONFIG.CHART_Y_TICKS;
  for (let i = 0; i <= Y_TICKS; i++) {
    const val = chartMax * (i / Y_TICKS);
    const yPos = toY(val);

    const gridLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    gridLine.setAttribute('x1', PAD_LEFT); gridLine.setAttribute('y1', yPos);
    gridLine.setAttribute('x2', WIDTH - PAD_RIGHT); gridLine.setAttribute('y2', yPos);
    gridLine.setAttribute('class', 'chart-grid-line');
    svg.appendChild(gridLine);

    let label;
    if (val >= 1_000_000) label = `$${(val / 1_000_000).toFixed(1)}M`;
    else if (val >= 1_000) label = `$${Math.round(val / 1_000)}k`;
    else label = `$${Math.round(val)}`;

    const yText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    yText.setAttribute('x', PAD_LEFT - 6); yText.setAttribute('y', yPos + 4);
    yText.setAttribute('class', 'chart-axis-text');
    yText.setAttribute('text-anchor', 'end');
    yText.setAttribute('dominant-baseline', 'middle');
    yText.textContent = label;
    svg.appendChild(yText);
  }

  // Baseline line (if extra payments active)
  if (baselineData) {
    const baselinePath = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    let baselinePoints = '';
    for (let yr = 0; yr < baselineData.yearlyBalances.length; yr++) {
      const x = toX(yr);
      const y = toY(baselineData.yearlyBalances[yr]);
      baselinePoints += `${x},${y} `;
    }
    baselinePath.setAttribute('points', baselinePoints.trim());
    baselinePath.setAttribute('class', 'chart-path-baseline');
    svg.appendChild(baselinePath);
  }

  // Three main series paths
  const seriesConfigs = [
    { data: yearlyBalances, color: CONFIG.SERIES_BALANCE_COLOR, label: 'Remaining Balance' },
    { data: yearlyInterest, color: CONFIG.SERIES_INTEREST_COLOR, label: 'Cumulative Interest' },
    { data: yearlyPayments, color: CONFIG.SERIES_PRINCIPAL_COLOR, label: 'Cumulative Principal' }
  ];

  seriesConfigs.forEach(({ data, color, label }) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    let points = '';
    for (let yr = 0; yr < data.length; yr++) {
      const x = toX(yr);
      const y = toY(data[yr]);
      points += `${x},${y} `;
    }
    path.setAttribute('points', points.trim());
    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', '2');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-linejoin', 'miter');
    svg.appendChild(path);
  });

  // Equity milestones
  const effectiveHome = Math.min(loanAmount * 1.25, homePrice);
  const tipGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  tipGroup.style.display = 'none';

  const tipBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  tipBg.setAttribute('width', '96'); tipBg.setAttribute('height', '54');
  tipBg.setAttribute('rx', '4'); tipBg.setAttribute('class', 'chart-tooltip-bg');
  tipBg.setAttribute('filter', `url(#tip-shadow-${svgId})`);
  tipGroup.appendChild(tipBg);

  const tipLabel = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  tipLabel.setAttribute('x', '8'); tipLabel.setAttribute('y', '20');
  tipLabel.setAttribute('class', 'chart-tooltip-label');
  tipGroup.appendChild(tipLabel);

  const tipSub = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  tipSub.setAttribute('x', '8'); tipSub.setAttribute('y', '38');
  tipSub.setAttribute('class', 'chart-tooltip-text');
  tipGroup.appendChild(tipSub);

  CONFIG.MILESTONES.forEach(({ pct, label, sub, color }) => {
    const threshold = effectiveHome * pct;
    if (threshold >= loanAmount) return;

    const crossYear = linearInterpolateYear(yearlyBalances, threshold);
    if (crossYear === null) return;

    const cx = toX(crossYear);
    const cy = toY(threshold);
    const yearStr = `Year ${(Math.round(crossYear * 10) / 10).toFixed(1)}`;

    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('cx', cx); dot.setAttribute('cy', cy); dot.setAttribute('r', CONFIG.MILESTONE_RADIUS);
    dot.setAttribute('class', 'chart-milestone-dot');
    dot.style.stroke = color;

    dot.addEventListener('mouseenter', () => {
      tipLabel.textContent = label;
      tipSub.textContent = yearStr;
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
  });

  svg.appendChild(tipGroup);
}

/**
 * Sets button loading state
 * @param {HTMLElement} button - Button element
 * @param {string} text - Text to display
 * @param {boolean} isLoading - Whether button is in loading state
 */
export function setButtonLoading(button, text, isLoading) {
  if (!button) return;
  button.textContent = text;
  button.disabled = isLoading;
  button.style.opacity = isLoading ? '0.7' : '1';
}

/**
 * Updates rates attribution text
 * @param {string} source - Rate source
 * @param {string} date - Update date
 * @param {Object} domRefs - DOM element references
 */
export function updateRatesAttribution(source, date, domRefs) {
  if (domRefs.ratesAttributionEl) {
    domRefs.ratesAttributionEl.textContent = `Source: ${source} (Updated: ${date})`;
    domRefs.ratesAttributionEl.classList.add('visible');
  }
}
