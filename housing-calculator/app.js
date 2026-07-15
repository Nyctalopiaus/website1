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
  function simulatePayoff(principal, annualRate, years, additionalPayment) {
    const r = annualRate / 12 / 100;
    const originalMonths = years * 12;
    
    let regularPi = 0;
    if (annualRate > 0) {
      regularPi = principal * (r * Math.pow(1 + r, originalMonths)) / (Math.pow(1 + r, originalMonths) - 1);
    } else {
      regularPi = principal / originalMonths;
    }

    if (additionalPayment <= 0) {
      const totalInterest = Math.max(0, (regularPi * originalMonths) - principal);
      return {
        regularPi,
        totalInterest,
        monthsToPayoff: originalMonths,
        monthsSaved: 0
      };
    }

    let balance = principal;
    let totalInterest = 0;
    let monthsCount = 0;

    while (balance > 0.01 && monthsCount < 1200) {
      monthsCount++;
      const interestThisMonth = balance * r;
      const regularPrincipalPaid = Math.max(0, regularPi - interestThisMonth);
      const totalPrincipalPaid = regularPrincipalPaid + additionalPayment;
      const actualPrincipalPaid = Math.min(balance, totalPrincipalPaid);
      totalInterest += interestThisMonth;
      balance -= actualPrincipalPaid;
    }

    return {
      regularPi,
      totalInterest,
      monthsToPayoff: monthsCount,
      monthsSaved: Math.max(0, originalMonths - monthsCount)
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
    
    const amort30 = simulatePayoff(loanAmount, p30, 30, additionalPayment);
    const totalMonthly30 = amort30.regularPi + monthlyTax + monthlyIns + monthlyPmi + hoa;
    const interestSaved30 = Math.max(0, baselineInterest30 - amort30.totalInterest);

    // 15-Year calculations
    const baselinePi15 = calcPIPayment(loanAmount, p15, 15);
    const baselineInterest15 = Math.max(0, (baselinePi15 * 180) - loanAmount);
    
    const amort15 = simulatePayoff(loanAmount, p15, 15, additionalPayment);
    const totalMonthly15 = amort15.regularPi + monthlyTax + monthlyIns + monthlyPmi + hoa;
    const interestSaved15 = Math.max(0, baselineInterest15 - amort15.totalInterest);

    // Render Outputs
    totalPayment30El.textContent = formatCurrency(totalMonthly30);
    piPayment30El.textContent = formatCurrency(amort30.regularPi);
    lifetimeInterest30El.textContent = formatCurrency(amort30.totalInterest);

    if (additionalPayment > 0 && interestSaved30 > 0.01) {
      interestSavings30El.textContent = `Saved ${formatCurrency(interestSaved30)}`;
      interestSavings30El.style.display = 'block';
    } else {
      interestSavings30El.style.display = 'none';
    }

    if (additionalPayment > 0 && amort30.monthsSaved > 0) {
      timeSaved30El.textContent = formatTimeSaved(amort30.monthsSaved);
      timeSavedRow30El.style.display = 'flex';
    } else {
      timeSavedRow30El.style.display = 'none';
    }

    totalPayment15El.textContent = formatCurrency(totalMonthly15);
    piPayment15El.textContent = formatCurrency(amort15.regularPi);
    lifetimeInterest15El.textContent = formatCurrency(amort15.totalInterest);

    if (additionalPayment > 0 && interestSaved15 > 0.01) {
      interestSavings15El.textContent = `Saved ${formatCurrency(interestSaved15)}`;
      interestSavings15El.style.display = 'block';
    } else {
      interestSavings15El.style.display = 'none';
    }

    if (additionalPayment > 0 && amort15.monthsSaved > 0) {
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

    // Maintain down payment percentage
    const percent = parseFloat(downPaymentPercentInput.value) || 0;
    const amount = (percent / 100) * val;
    downPaymentAmountInput.value = Math.round(amount);

    calculateAll();
    saveCurrentInputs();
  });

  downPaymentAmountInput.addEventListener('input', () => {
    const amount = parseFloat(downPaymentAmountInput.value) || 0;
    const homePrice = parseFloat(homePriceInput.value) || 0;

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

  // Rate Loader
  loadRatesBtn.addEventListener('click', () => {
    interest30Input.value = estRates[30];
    interest15Input.value = estRates[15];
    
    // visual feedback flash
    loadRatesBtn.textContent = '✅ Rates Loaded';
    loadRatesBtn.style.background = '#059669';
    setTimeout(() => {
      loadRatesBtn.textContent = '⚡ Load Est. Rates';
      loadRatesBtn.style.background = '';
    }, 1500);

    calculateAll();
    saveCurrentInputs();
  });

  // View Amortization Table click handler
  viewAmortBtn.addEventListener('click', () => {
    const homePrice = parseFloat(homePriceInput.value) || 0;
    const downPayment = parseFloat(downPaymentAmountInput.value) || 0;
    const p30 = parseFloat(interest30Input.value) || 0;
    const p15 = parseFloat(interest15Input.value) || 0;
    const taxRate = parseFloat(taxRateInput.value) || 0;
    const homeInsAnnual = parseFloat(homeInsuranceInput.value) || 0;
    const hoa = parseFloat(hoaFeesInput.value) || 0;
    const pmiRate = parseFloat(pmiRateInput.value) || 0;
    const grossIncome = parseFloat(grossIncomeInput.value) || 1;
    const additionalPayment = parseFloat(additionalPaymentInput.value) || 0;

    const params = new URLSearchParams({
      price: homePrice,
      down: downPayment,
      rate30: p30,
      rate15: p15,
      tax: taxRate,
      ins: homeInsAnnual,
      pmi: pmiRate,
      hoa: hoa,
      income: grossIncome,
      additional: additionalPayment,
      term: activeTerm
    });

    window.location.href = `amortization.html?${params.toString()}`;
  });

  async function loadLiveMortgageRates() {
    try {
      const res = await fetch('/api/rates');
      if (res.ok) {
        const data = await res.json();
        if (data && data.rate30 && data.rate15) {
          estRates[30] = data.rate30;
          estRates[15] = data.rate15;
          if (ratesAttributionEl) {
            ratesAttributionEl.textContent = `Source: ${data.source} (${data.date})`;
            ratesAttributionEl.classList.add('visible');
          }
        }
      }
    } catch (e) {
      console.error('[ERROR] Failed to fetch live mortgage rates:', e);
    }
  }

  // Page Setup
  loadLiveMortgageRates();
  loadSavedInputs();
});
