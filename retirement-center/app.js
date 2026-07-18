document.addEventListener('DOMContentLoaded', () => {
  // DOM Input elements
  const currentAgeInput = document.getElementById('current-age');
  const retirementAgeInput = document.getElementById('retirement-age');
  const lifeExpectancyInput = document.getElementById('life-expectancy');

  const pretaxBalanceInput = document.getElementById('pretax-balance');
  const pretaxMonthlyInput = document.getElementById('pretax-monthly');
  const employerMatchRateInput = document.getElementById('employer-match-rate');
  const employerContributionMonthlyInput = document.getElementById('employer-contrib-monthly');
  const rothBalanceInput = document.getElementById('roth-balance');
  const rothMonthlyInput = document.getElementById('roth-monthly');
  const taxableBalanceInput = document.getElementById('taxable-balance');
  const taxableMonthlyInput = document.getElementById('taxable-monthly');
  const taxableHysaBalanceInput = document.getElementById('taxable-hysa-balance');
  const taxableHysaMonthlyInput = document.getElementById('taxable-hysa-monthly');
  const taxableHysaCompoundInput = document.getElementById('taxable-hysa-compound');
  const taxableHysaRateInput = document.getElementById('taxable-hysa-rate');
  const taxableHysaNote = document.getElementById('taxable-hysa-note');

  const retirementIncomeInput = document.getElementById('retirement-income');
  const socialSecurityInput = document.getElementById('social-security');

  const preReturnInput = document.getElementById('pre-return');
  const postReturnInput = document.getElementById('post-return');
  const inflationRateInput = document.getElementById('inflation-rate');
  const taxRateInput = document.getElementById('tax-rate');

  const togglePurchasingPower = document.getElementById('toggle-purchasing-power');
  const purchasingPowerLabel = document.getElementById('purchasing-power-label');

  // DOM Display / Output elements
  const valCurrentAge = document.getElementById('val-current-age');
  const valRetirementAge = document.getElementById('val-retirement-age');
  const valLifeExpectancy = document.getElementById('val-life-expectancy');

  const successBanner = document.getElementById('success-banner');
  const successEmoji = document.getElementById('success-emoji');
  const successHeadline = document.getElementById('success-headline');
  const successSub = document.getElementById('success-sub');

  const kpiPeakVal = document.getElementById('kpi-peak-val');
  const kpiPeakAge = document.getElementById('kpi-peak-age');
  const kpiTotalContrib = document.getElementById('kpi-total-contrib');
  const kpiAccumYears = document.getElementById('kpi-accum-years');
  const kpiOptimalAge = document.getElementById('kpi-optimal-age');
  const kpiOptimalAgeDesc = document.getElementById('kpi-optimal-age-desc');
  const kpiOptimalWarning = document.getElementById('kpi-optimal-warning');

  const accumAgeStart = document.getElementById('accum-age-start');
  const accumAgeEnd = document.getElementById('accum-age-end');
  const burnAgeStart = document.getElementById('burn-age-start');
  const burnAgeEnd = document.getElementById('burn-age-end');

  const ledgerTbody = document.getElementById('ledger-tbody');

  // SVGs
  const accumSvg = document.getElementById('accum-svg');
  const burnSvg = document.getElementById('burn-svg');

  // Tooltips
  const accumTooltip = document.getElementById('accum-tooltip');
  const burnTooltip = document.getElementById('burn-tooltip');

  // Shared state simulation arrays
  let accumData = [];
  let burnData = [];
  let globalInflation = 2.5;
  let globalCurrentAge = 48;

  // Formatting Helpers
  function formatCurrency(val) {
    if (val < 0) val = 0;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0
    }).format(val);
  }

  // Sync Slider number label displays
  function syncLabels() {
    valCurrentAge.textContent = currentAgeInput.value;
    valRetirementAge.textContent = retirementAgeInput.value;
    valLifeExpectancy.textContent = lifeExpectancyInput.value;

    // Constrain retirement age slider relative to current age
    const curr = parseInt(currentAgeInput.value);
    const ret = parseInt(retirementAgeInput.value);
    const life = parseInt(lifeExpectancyInput.value);

    if (ret <= curr) {
      retirementAgeInput.value = curr + 1;
      valRetirementAge.textContent = curr + 1;
    }
    if (life <= ret) {
      lifeExpectancyInput.value = ret + 1;
      valLifeExpectancy.textContent = ret + 1;
    }
  }

  function getScaledSocialSecurityBenefit(monthlyBenefit, retirementAgeValue) {
    const baseMonthly = parseFloat(monthlyBenefit) || 0;
    const retirementAge = parseFloat(retirementAgeValue) || 67;
    const earliestClaimAge = 62 + (1 / 12);

    if (retirementAge < earliestClaimAge) {
      return 0;
    }

    if (retirementAge <= earliestClaimAge) {
      return baseMonthly * 0.683;
    }

    if (retirementAge >= 70) {
      return baseMonthly * 1.259;
    }

    if (retirementAge > earliestClaimAge && retirementAge < 67) {
      const progress = (retirementAge - earliestClaimAge) / (67 - earliestClaimAge);
      return baseMonthly * (0.683 + (1 - 0.683) * progress);
    }

    if (retirementAge > 67 && retirementAge < 70) {
      const progress = (retirementAge - 67) / 3;
      return baseMonthly * (1 + (1.259 - 1) * progress);
    }

    return baseMonthly;
  }

  function runRetirementSimulation(retirementAgeValue) {
    const currentAge = parseInt(currentAgeInput.value);
    const retirementAge = parseInt(retirementAgeValue);
    const lifeExpectancy = parseInt(lifeExpectancyInput.value);

    globalCurrentAge = currentAge;

    const initialPretax = parseFloat(pretaxBalanceInput.value) || 0;
    const pretaxMonthly = parseFloat(pretaxMonthlyInput.value) || 0;
    const employerMatchRate = parseFloat(employerMatchRateInput.value) || 0;
    const monthlyEmployerContribution = pretaxMonthly * (employerMatchRate / 100);
    const initialRoth = parseFloat(rothBalanceInput.value) || 0;
    const rothMonthly = parseFloat(rothMonthlyInput.value) || 0;
    const initialTaxable = parseFloat(taxableBalanceInput.value) || 0;
    const taxableMonthly = parseFloat(taxableMonthlyInput.value) || 0;
    const initialHysa = parseFloat(taxableHysaBalanceInput.value) || 0;
    const hysaMonthly = parseFloat(taxableHysaMonthlyInput.value) || 0;
    const hysaCompounds = taxableHysaCompoundInput.checked;
    const hysaRate = parseFloat(taxableHysaRateInput.value) || 0;
    const hysaMonthlyRate = hysaCompounds ? (hysaRate / 100) / 12 : 0;

    const desiredIncome = parseFloat(retirementIncomeInput.value) || 0;
    const scaledSocialSecurityMonthly = getScaledSocialSecurityBenefit(socialSecurityInput.value, retirementAge);
    const socialSecurityAnnual = scaledSocialSecurityMonthly * 12;

    const preReturn = parseFloat(preReturnInput.value) || 0;
    const postReturn = parseFloat(postReturnInput.value) || 0;
    const inflation = parseFloat(inflationRateInput.value) || 0;

    globalInflation = inflation;

    const accumDataLocal = [];
    let curPretax = initialPretax;
    let curRoth = initialRoth;
    let curTaxable = initialTaxable;
    let curHysa = initialHysa;
    let hysaBalanceAtRetirement = initialHysa;

    employerContributionMonthlyInput.value = formatCurrency(monthlyEmployerContribution);

    const rPreMonthly = (preReturn / 100) / 12;
    const accumYears = Math.max(0, retirementAge - currentAge);

    accumDataLocal.push({
      age: currentAge,
      year: new Date().getFullYear(),
      pretax: initialPretax,
      roth: initialRoth,
      taxable: initialTaxable + initialHysa,
      total: initialPretax + initialRoth + initialTaxable + initialHysa,
      contributions: 0,
      withdrawal: 0
    });

    let cumulativeContributions = 0;

    for (let y = 1; y <= accumYears; y++) {
      for (let m = 1; m <= 12; m++) {
        const pretaxContributionTotal = pretaxMonthly + monthlyEmployerContribution;
        curPretax = curPretax * (1 + rPreMonthly) + pretaxContributionTotal;
        curRoth = curRoth * (1 + rPreMonthly) + rothMonthly;
        curTaxable = curTaxable * (1 + rPreMonthly) + taxableMonthly;
        if (hysaCompounds) {
          curHysa = curHysa * (1 + hysaMonthlyRate) + hysaMonthly;
        } else {
          curHysa += hysaMonthly;
        }
        hysaBalanceAtRetirement = curHysa;
        cumulativeContributions += (pretaxContributionTotal + rothMonthly + taxableMonthly + hysaMonthly);
      }

      accumDataLocal.push({
        age: currentAge + y,
        year: new Date().getFullYear() + y,
        pretax: curPretax,
        roth: curRoth,
        taxable: curTaxable + curHysa,
        total: curPretax + curRoth + curTaxable + curHysa,
        contributions: cumulativeContributions,
        withdrawal: 0
      });
    }

    const burnDataLocal = [];
    let curPretaxBurn = curPretax;
    let curRothBurn = curRoth;
    let curTaxableBurn = curTaxable + (hysaCompounds ? hysaBalanceAtRetirement : curHysa);

    const rPostAnnual = postReturn / 100;
    const distributionYears = Math.max(0, lifeExpectancy - retirementAge);

    burnDataLocal.push({
      age: retirementAge,
      year: new Date().getFullYear() + accumYears,
      pretax: curPretaxBurn,
      roth: curRothBurn,
      taxable: curTaxableBurn,
      total: curPretaxBurn + curRothBurn + curTaxableBurn,
      contributions: cumulativeContributions,
      withdrawal: 0
    });

    let shortfallAge = null;

    for (let y = 1; y <= distributionYears; y++) {
      const age = retirementAge + y;
      const yearsFromStart = accumYears + y;

      curPretaxBurn *= (1 + rPostAnnual);
      curRothBurn *= (1 + rPostAnnual);
      curTaxableBurn *= (1 + rPostAnnual);

      const netWithdrawalToday = Math.max(0, desiredIncome - socialSecurityAnnual);
      const netWithdrawalFuture = netWithdrawalToday * Math.pow(1 + inflation / 100, yearsFromStart);

      let remainingToWithdraw = netWithdrawalFuture;
      let actualWithdrawal = 0;

      if (remainingToWithdraw > 0) {
        const taxableDeduct = Math.min(curTaxableBurn, remainingToWithdraw);
        curTaxableBurn -= taxableDeduct;
        remainingToWithdraw -= taxableDeduct;
        actualWithdrawal += taxableDeduct;
      }

      if (remainingToWithdraw > 0) {
        const taxRateDecimal = (parseFloat(taxRateInput.value) || 0) / 100;
        const grossRequired = remainingToWithdraw / (1 - taxRateDecimal);
        const grossDeduct = Math.min(curPretaxBurn, grossRequired);
        const netDeduct = grossDeduct * (1 - taxRateDecimal);

        curPretaxBurn -= grossDeduct;
        remainingToWithdraw -= netDeduct;
        actualWithdrawal += grossDeduct;
      }

      if (remainingToWithdraw > 0) {
        const rothDeduct = Math.min(curRothBurn, remainingToWithdraw);
        curRothBurn -= rothDeduct;
        remainingToWithdraw -= rothDeduct;
        actualWithdrawal += rothDeduct;
      }

      const totalBurnBal = curPretaxBurn + curRothBurn + curTaxableBurn;

      if (remainingToWithdraw > 0.01 && shortfallAge === null) {
        shortfallAge = age;
      }

      burnDataLocal.push({
        age: age,
        year: new Date().getFullYear() + yearsFromStart,
        pretax: Math.max(0, curPretaxBurn),
        roth: Math.max(0, curRothBurn),
        taxable: Math.max(0, curTaxableBurn),
        total: Math.max(0, totalBurnBal),
        contributions: cumulativeContributions,
        withdrawal: actualWithdrawal
      });
    }

    const isDiscounted = togglePurchasingPower.checked;
    const processedAccum = accumDataLocal.map(d => discountData(d, currentAge, inflation, isDiscounted));
    const processedBurn = burnDataLocal.map(d => discountData(d, currentAge, inflation, isDiscounted));

    return {
      accumData: accumDataLocal,
      burnData: burnDataLocal,
      processedAccum,
      processedBurn,
      shortfallAge,
      accumYears,
      cumulativeContributions,
      finalBalance: processedBurn[processedBurn.length - 1]?.total ?? 0
    };
  }

function solveOptimalRetirementAge() {
  const currentAge = parseInt(currentAgeInput.value);
  const lifeExpectancy = parseInt(lifeExpectancyInput.value);
  
  // Start searching from the current age + 1
  for (let candidateAge = currentAge + 1; candidateAge <= 80; candidateAge++) {
    const simulation = runRetirementSimulation(candidateAge);
    
    // Check if the simulation survives all the way to life expectancy
    // A simulation survives if shortfallAge is null
    if (simulation.shortfallAge === null) {
      return { age: candidateAge, type: 'survive' };
    }
  }

  // If no age survives, find the one that survives the longest
  let bestSurvivalAge = null;
  let maxSurvivalAge = 0;

  for (let candidateAge = currentAge + 1; candidateAge <= 80; candidateAge++) {
    const simulation = runRetirementSimulation(candidateAge);
    const survivalPoint = simulation.shortfallAge ? simulation.shortfallAge : lifeExpectancy;
    
    if (survivalPoint > maxSurvivalAge) {
      maxSurvivalAge = survivalPoint;
      bestSurvivalAge = candidateAge;
    }
  }

  return { age: bestSurvivalAge, type: 'shortfall' };
}

  // Recalculation Engine
  function calculateAll() {
    syncLabels();

    const isDiscounted = togglePurchasingPower.checked;

    if (isDiscounted) {
      purchasingPowerLabel.classList.add('active');
      document.querySelectorAll('.stat-power-label').forEach(el => el.style.display = 'inline');
    } else {
      purchasingPowerLabel.classList.remove('active');
      document.querySelectorAll('.stat-power-label').forEach(el => el.style.display = 'none');
    }

    const simulation = runRetirementSimulation(retirementAgeInput.value);
    accumData = simulation.accumData;
    burnData = simulation.burnData;

    const optimalRetirementAge = solveOptimalRetirementAge();

    renderKPIs(simulation.processedAccum, simulation.processedBurn, simulation.shortfallAge, simulation.accumYears, simulation.cumulativeContributions, optimalRetirementAge);

    renderAccumChart(simulation.processedAccum);
    renderBurnChart(simulation.processedBurn);

    renderLedger(simulation.processedAccum, simulation.processedBurn, parseInt(retirementAgeInput.value));
  }

  // Discount function
  function discountData(item, startAge, inflationRate, isDiscounted) {
    if (!isDiscounted) return { ...item };
    const yearsElapsed = item.age - startAge;
    const discountFactor = Math.pow(1 + inflationRate / 100, yearsElapsed);

    return {
      age: item.age,
      year: item.year,
      pretax: item.pretax / discountFactor,
      roth: item.roth / discountFactor,
      taxable: item.taxable / discountFactor,
      total: item.total / discountFactor,
      contributions: item.contributions / discountFactor,
      withdrawal: item.withdrawal / discountFactor
    };
  }

  // Display KPI Stats & Succes Banner
  function renderKPIs(accum, burn, shortfallAge, accumYears, rawContrib, optimalRetirementAge) {
    const isDiscounted = togglePurchasingPower.checked;

    // Peak Portfolio Value at retirement
    const peakVal = accum[accum.length - 1].total;
    kpiPeakVal.textContent = formatCurrency(peakVal);
    kpiPeakAge.textContent = `Reached at age ${retirementAgeInput.value}`;

    // Total Contributions
    kpiTotalContrib.textContent = formatCurrency(isDiscounted ? accum[accum.length - 1].contributions : rawContrib);
    kpiAccumYears.textContent = `Over ${accumYears} accumulation years`;

    if (optimalRetirementAge) {
      const currentAge = parseInt(currentAgeInput.value);
      const retirementYear = new Date().getFullYear() + (optimalRetirementAge.age - currentAge);
      kpiOptimalAge.textContent = `${optimalRetirementAge.age} (Year: ${retirementYear})`;
      kpiOptimalAgeDesc.textContent = 'Earliest age with ~ $0 balance at life expectancy';
      const suggestedAge = parseInt(optimalRetirementAge.age);
      const selectedAge = parseInt(retirementAgeInput.value);
      kpiOptimalWarning.style.display = suggestedAge > selectedAge ? 'flex' : 'none';
    } else {
      kpiOptimalAge.textContent = '—';
      kpiOptimalAgeDesc.textContent = 'Increase savings to find a valid age';
      kpiOptimalWarning.style.display = 'none';
    }

    // Success HUD Banner details
    if (shortfallAge === null) {
      successBanner.classList.remove('shortfall');
      successEmoji.textContent = '🎉';
      successHeadline.textContent = 'Fully Funded';
      successSub.textContent = `Your portfolio is projected to survive past your life expectancy of ${lifeExpectancyInput.value}.`;
    } else {
      successBanner.classList.add('shortfall');
      successEmoji.textContent = '⚠️';
      successHeadline.textContent = `Shortfall at Age ${shortfallAge}`;
      successSub.textContent = `Your portfolio is projected to deplete prematurely. Adjust contributions or retirement age.`;
    }

    // Set subtitle ranges
    accumAgeStart.textContent = currentAgeInput.value;
    accumAgeEnd.textContent = retirementAgeInput.value;
    burnAgeStart.textContent = retirementAgeInput.value;
    burnAgeEnd.textContent = lifeExpectancyInput.value;
  }

  // Helper to construct axis guidelines inside SVGs
  function drawGridLines(svg, padding, xMax, yMax, xScale, yScale, stepX, stepY) {
    const width = 600;
    const height = 240;

    // Horizontal grid lines
    for (let y = 0; y <= yMax; y += stepY) {
      const yCoord = yScale(y);
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', padding.left);
      line.setAttribute('y1', yCoord);
      line.setAttribute('x2', width - padding.right);
      line.setAttribute('y2', yCoord);
      line.setAttribute('class', y === 0 ? 'grid-line-bold' : 'grid-line');
      svg.appendChild(line);

      // Y Axis Label text
      const labelText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      labelText.setAttribute('x', padding.left - 10);
      labelText.setAttribute('y', yCoord + 3);
      labelText.setAttribute('text-anchor', 'end');
      labelText.setAttribute('class', 'chart-axis-label');
      
      // format label (e.g. $1.2M or $400K)
      let displayValue = '';
      if (y >= 1000000) {
        displayValue = '$' + (y / 1000000).toFixed(1) + 'M';
      } else if (y >= 1000) {
        displayValue = '$' + (y / 1000).toFixed(0) + 'K';
      } else {
        displayValue = '$' + y;
      }
      labelText.textContent = displayValue;
      svg.appendChild(labelText);
    }
  }

  // 1. Stacked Area growth chart for Accumulation phase
  function renderAccumChart(data) {
    accumSvg.innerHTML = ''; // Reset SVG

    const padding = { top: 20, right: 30, bottom: 30, left: 60 };
    const width = accumSvg.parentElement.clientWidth || 600;
    const height = 240;
    accumSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    const minAge = data[0].age;
    const maxAge = data[data.length - 1].age;

    // Find Max Balance for Y scaling
    let maxVal = 0;
    data.forEach(d => {
      if (d.total > maxVal) maxVal = d.total;
    });
    maxVal = maxVal * 1.15 || 100000; // 15% padding top

    // Scale mappings
    const xScale = (age) => padding.left + ((age - minAge) / (maxAge - minAge)) * (width - padding.left - padding.right);
    const yScale = (val) => height - padding.bottom - ((val / maxVal) * (height - padding.top - padding.bottom));

    // Round maxVal to pretty steps
    const stepY = Math.ceil(maxVal / 4 / 25000) * 25000 || 25000;
    const roundedYMax = stepY * 4;

    // Draw Grid Lines
    drawGridLines(accumSvg, padding, maxAge, roundedYMax, xScale, yScale, 5, stepY);

    // Draw X Axis labels
    const stepAge = Math.ceil((maxAge - minAge) / 5);
    for (let age = minAge; age <= maxAge; age += stepAge) {
      const xCoord = xScale(age);
      const labelText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      labelText.setAttribute('x', xCoord);
      labelText.setAttribute('y', height - 10);
      labelText.setAttribute('text-anchor', 'middle');
      labelText.setAttribute('class', 'chart-axis-label');
      labelText.textContent = `Age ${age}`;
      accumSvg.appendChild(labelText);
    }

    // Stacked Area Calculations
    // Bottom Layer: Taxable
    // Middle Layer: Taxable + Roth
    // Top Layer: Taxable + Roth + Traditional (Total)
    let taxablePoints = [];
    let rothPoints = [];
    let traditionalPoints = [];

    data.forEach(d => {
      const x = xScale(d.age);
      const yTaxable = yScale(d.taxable);
      const yRoth = yScale(d.taxable + d.roth);
      const yTotal = yScale(d.total);

      taxablePoints.push(`${x},${yTaxable}`);
      rothPoints.push(`${x},${yRoth}`);
      traditionalPoints.push(`${x},${yTotal}`);
    });

    const startX = xScale(minAge);
    const endX = xScale(maxAge);
    const zeroY = yScale(0);

    // Build SVG Path segments
    const pathTaxable = `M ${startX},${zeroY} L ${taxablePoints.join(' L ')} L ${endX},${zeroY} Z`;
    const pathRoth = `M ${startX},${zeroY} L ${rothPoints.join(' L ')} L ${endX},${zeroY} Z`;
    const pathTraditional = `M ${startX},${zeroY} L ${traditionalPoints.join(' L ')} L ${endX},${zeroY} Z`;

    // Draw Stacked Areas (Draw top first or stack bottom to top with proper overlay index)
    // 1. Traditional (Top Layer covers all)
    const pTraditional = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pTraditional.setAttribute('d', pathTraditional);
    pTraditional.setAttribute('class', 'traditional-fill');
    pTraditional.setAttribute('opacity', '0.25');
    accumSvg.appendChild(pTraditional);

    // 2. Roth (Middle Layer covers taxable + roth)
    const pRoth = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pRoth.setAttribute('d', pathRoth);
    pRoth.setAttribute('class', 'roth-fill');
    pRoth.setAttribute('opacity', '0.45');
    accumSvg.appendChild(pRoth);

    // 3. Taxable (Bottom Layer covers taxable only)
    const pTaxable = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pTaxable.setAttribute('d', pathTaxable);
    pTaxable.setAttribute('class', 'taxable-fill');
    pTaxable.setAttribute('opacity', '0.65');
    accumSvg.appendChild(pTaxable);

    // Overlay stroke boundary lines for crisp finish
    drawStrokePath(accumSvg, traditionalPoints, 'chart-line-traditional');
    drawStrokePath(accumSvg, rothPoints, 'chart-line-roth');
    drawStrokePath(accumSvg, taxablePoints, 'chart-line-taxable');

    // Interactive Hover Tracking Setup
    const hoverBar = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    hoverBar.setAttribute('y1', padding.top);
    hoverBar.setAttribute('y2', height - padding.bottom);
    hoverBar.setAttribute('class', 'hover-bar');
    hoverBar.style.display = 'none';
    accumSvg.appendChild(hoverBar);

    const hoverCircles = [];
    for (let i = 0; i < 3; i++) {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('r', '5');
      circle.setAttribute('class', 'hover-circle');
      circle.style.display = 'none';
      accumSvg.appendChild(circle);
      hoverCircles.push(circle);
    }

    // Hover mouse move listener
    accumSvg.addEventListener('mousemove', (e) => {
      const rect = accumSvg.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      
      // Convert mouseX back to age coordinate
      const ageFrac = minAge + ((mouseX - padding.left) / (width - padding.left - padding.right)) * (maxAge - minAge);
      const targetAge = Math.round(Math.max(minAge, Math.min(maxAge, ageFrac)));

      const targetDataIndex = data.findIndex(d => d.age === targetAge);
      if (targetDataIndex !== -1) {
        const item = data[targetDataIndex];
        const xPos = xScale(item.age);

        hoverBar.setAttribute('x1', xPos);
        hoverBar.setAttribute('x2', xPos);
        hoverBar.style.display = 'block';

        // Update positions of intersection indicators
        const yTax = yScale(item.taxable);
        const yRothVal = yScale(item.taxable + item.roth);
        const yTotal = yScale(item.total);

        hoverCircles[0].setAttribute('cx', xPos);
        hoverCircles[0].setAttribute('cy', yTax);
        hoverCircles[0].style.display = 'block';
        hoverCircles[0].style.fill = 'var(--color-taxable)';

        hoverCircles[1].setAttribute('cx', xPos);
        hoverCircles[1].setAttribute('cy', yRothVal);
        hoverCircles[1].style.display = 'block';
        hoverCircles[1].style.fill = 'var(--color-roth)';

        hoverCircles[2].setAttribute('cx', xPos);
        hoverCircles[2].setAttribute('cy', yTotal);
        hoverCircles[2].style.display = 'block';
        hoverCircles[2].style.fill = 'var(--color-traditional)';

        // Populate Floating Tooltip
        accumTooltip.style.display = 'flex';
        const tooltipWidth = 160;
        accumTooltip.style.left = (xPos + tooltipWidth > width) ? `${xPos - tooltipWidth - 20}px` : `${xPos + 15}px`;
        accumTooltip.style.top = `${yTotal - 110}px`;
        
        accumTooltip.innerHTML = `
          <div class="tooltip-title">Age ${item.age} (${item.year})</div>
          <div class="tooltip-row">
            <span><span class="tooltip-dot traditional-bg"></span>Traditional:</span>
            <strong>${formatCurrency(item.pretax)}</strong>
          </div>
          <div class="tooltip-row">
            <span><span class="tooltip-dot roth-bg"></span>Roth:</span>
            <strong>${formatCurrency(item.roth)}</strong>
          </div>
          <div class="tooltip-row">
            <span><span class="tooltip-dot taxable-bg"></span>Taxable:</span>
            <strong>${formatCurrency(item.taxable)}</strong>
          </div>
          <div class="tooltip-row" style="border-top: 1px dashed var(--border-color); margin-top:0.25rem; padding-top:0.25rem;">
            <span>Total:</span>
            <strong>${formatCurrency(item.total)}</strong>
          </div>
        `;
      }
    });

    accumSvg.addEventListener('mouseleave', () => {
      hoverBar.style.display = 'none';
      hoverCircles.forEach(c => c.style.display = 'none');
      accumTooltip.style.display = 'none';
    });
  }

  // 2. Portfolio burndown depletion chart
  function renderBurnChart(data) {
    burnSvg.innerHTML = ''; // Reset SVG

    const padding = { top: 20, right: 30, bottom: 30, left: 60 };
    const width = burnSvg.parentElement.clientWidth || 600;
    const height = 240;
    burnSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);

    const minAge = data[0].age;
    const maxAge = data[data.length - 1].age;

    // Find Max Balance for Y scaling
    let maxVal = 0;
    data.forEach(d => {
      if (d.total > maxVal) maxVal = d.total;
    });
    maxVal = maxVal * 1.15 || 100000;

    const xScale = (age) => padding.left + ((age - minAge) / (maxAge - minAge)) * (width - padding.left - padding.right);
    const yScale = (val) => height - padding.bottom - ((val / maxVal) * (height - padding.top - padding.bottom));

    const stepY = Math.ceil(maxVal / 4 / 25000) * 25000 || 25000;
    const roundedYMax = stepY * 4;

    // Draw Grid Lines
    drawGridLines(burnSvg, padding, maxAge, roundedYMax, xScale, yScale, 5, stepY);

    // Draw X Axis labels
    const stepAge = Math.ceil((maxAge - minAge) / 5);
    for (let age = minAge; age <= maxAge; age += stepAge) {
      const xCoord = xScale(age);
      const labelText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      labelText.setAttribute('x', xCoord);
      labelText.setAttribute('y', height - 10);
      labelText.setAttribute('text-anchor', 'middle');
      labelText.setAttribute('class', 'chart-axis-label');
      labelText.textContent = `Age ${age}`;
      burnSvg.appendChild(labelText);
    }

    // Build path points
    let points = [];
    data.forEach(d => {
      points.push(`${xScale(d.age)},${yScale(d.total)}`);
    });

    const startX = xScale(minAge);
    const endX = xScale(maxAge);
    const zeroY = yScale(0);

    // Fill area pathway
    const pathArea = `M ${startX},${zeroY} L ${points.join(' L ')} L ${endX},${zeroY} Z`;
    
    const pArea = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    pArea.setAttribute('d', pathArea);
    pArea.setAttribute('fill', 'var(--color-primary-dim)');
    pArea.setAttribute('opacity', '0.6');
    burnSvg.appendChild(pArea);

    // Outline boundary line
    drawStrokePath(burnSvg, points, 'chart-line-traditional');

    // Interactive Hover Tracking Setup
    const hoverBar = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    hoverBar.setAttribute('y1', padding.top);
    hoverBar.setAttribute('y2', height - padding.bottom);
    hoverBar.setAttribute('class', 'hover-bar');
    hoverBar.style.display = 'none';
    burnSvg.appendChild(hoverBar);

    const hoverCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    hoverCircle.setAttribute('r', '5');
    hoverCircle.setAttribute('class', 'hover-circle');
    hoverCircle.style.display = 'none';
    hoverCircle.style.fill = 'var(--color-primary)';
    burnSvg.appendChild(hoverCircle);

    // Mouse movement listener
    burnSvg.addEventListener('mousemove', (e) => {
      const rect = burnSvg.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;

      const ageFrac = minAge + ((mouseX - padding.left) / (width - padding.left - padding.right)) * (maxAge - minAge);
      const targetAge = Math.round(Math.max(minAge, Math.min(maxAge, ageFrac)));

      const targetDataIndex = data.findIndex(d => d.age === targetAge);
      if (targetDataIndex !== -1) {
        const item = data[targetDataIndex];
        const xPos = xScale(item.age);
        const yPos = yScale(item.total);

        hoverBar.setAttribute('x1', xPos);
        hoverBar.setAttribute('x2', xPos);
        hoverBar.style.display = 'block';

        hoverCircle.setAttribute('cx', xPos);
        hoverCircle.setAttribute('cy', yPos);
        hoverCircle.style.display = 'block';

        // Calculate actual required income that year
        const socialSecurityMonthly = parseFloat(socialSecurityInput.value) || 0;
        const socialSecurityAnnual = getScaledSocialSecurityBenefit(socialSecurityMonthly, item.age) * 12;
        const netToday = Math.max(0, parseFloat(retirementIncomeInput.value) - socialSecurityAnnual);
        const netFuture = netToday * Math.pow(1 + globalInflation / 100, item.age - globalCurrentAge);
        const discountFactor = Math.pow(1 + globalInflation / 100, item.age - globalCurrentAge);
        const isDiscounted = togglePurchasingPower.checked;
        const displayWithdrawal = isDiscounted ? (item.withdrawal) : (item.withdrawal * discountFactor);

        // Populate tooltip
        burnTooltip.style.display = 'flex';
        const tooltipWidth = 160;
        burnTooltip.style.left = (xPos + tooltipWidth > width) ? `${xPos - tooltipWidth - 20}px` : `${xPos + 15}px`;
        burnTooltip.style.top = `${yPos - 90}px`;

        burnTooltip.innerHTML = `
          <div class="tooltip-title">Age ${item.age} (${item.year})</div>
          <div class="tooltip-row">
            <span>Portfolio Value:</span>
            <strong>${formatCurrency(item.total)}</strong>
          </div>
          <div class="tooltip-row">
            <span>Annual Withdrawal:</span>
            <strong style="color: var(--color-warning);">${formatCurrency(item.withdrawal)}</strong>
          </div>
        `;
      }
    });

    burnSvg.addEventListener('mouseleave', () => {
      hoverBar.style.display = 'none';
      hoverCircle.style.display = 'none';
      burnTooltip.style.display = 'none';
    });
  }

  // Draw crisp path outline utility
  function drawStrokePath(svg, points, className) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${points.join(' L ')}`);
    path.setAttribute('class', className);
    svg.appendChild(path);
  }

  // Render LEDGER table values
  function renderLedger(accum, burn, retirementAge) {
    ledgerTbody.innerHTML = '';

    // Merge both arrays, avoiding duplicates at retirement age boundary
    const fullLedger = [...accum.slice(0, -1), ...burn];

    fullLedger.forEach(row => {
      const tr = document.createElement('tr');
      if (row.age === retirementAge) {
        tr.classList.add('retirement-row');
      }

      tr.innerHTML = `
        <td>${row.age}</td>
        <td>${row.year}</td>
        <td>${formatCurrency(row.pretax)}</td>
        <td>${formatCurrency(row.roth)}</td>
        <td>${formatCurrency(row.taxable)}</td>
        <td style="font-weight: 600;">${formatCurrency(row.total)}</td>
        <td style="color: ${row.withdrawal > 0 ? 'var(--color-warning)' : 'inherit'}; font-weight: ${row.withdrawal > 0 ? '600' : 'normal'};">
          ${row.withdrawal > 0 ? formatCurrency(row.withdrawal) : '—'}
        </td>
      `;
      ledgerTbody.appendChild(tr);
    });
  }

  // Hook Input Event Listeners
  const allInputs = [
    currentAgeInput, retirementAgeInput, lifeExpectancyInput,
    pretaxBalanceInput, pretaxMonthlyInput, employerMatchRateInput,
    rothBalanceInput, rothMonthlyInput,
    taxableBalanceInput, taxableMonthlyInput,
    taxableHysaBalanceInput, taxableHysaMonthlyInput,
    retirementIncomeInput, socialSecurityInput,
    preReturnInput, postReturnInput, inflationRateInput,
    taxRateInput
  ];

  allInputs.forEach(input => {
    input.addEventListener('input', calculateAll);
    input.addEventListener('change', calculateAll);
  });

  [taxableHysaCompoundInput, taxableHysaRateInput].forEach(input => {
    input.addEventListener('change', calculateAll);
    input.addEventListener('input', calculateAll);
  });

  togglePurchasingPower.addEventListener('change', calculateAll);

  // Initial calculation load
  calculateAll();
});
