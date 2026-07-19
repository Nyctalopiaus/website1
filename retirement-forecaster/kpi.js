export function syncLabels(dom) {
  dom.valCurrentAge.textContent = dom.currentAgeInput.value;
  dom.valRetirementAge.textContent = dom.retirementAgeInput.value;
  dom.valLifeExpectancy.textContent = dom.lifeExpectancyInput.value;

  const curr = parseInt(dom.currentAgeInput.value, 10);
  const ret = parseInt(dom.retirementAgeInput.value, 10);
  const life = parseInt(dom.lifeExpectancyInput.value, 10);

  if (ret <= curr) {
    dom.retirementAgeInput.value = curr + 1;
    dom.valRetirementAge.textContent = String(curr + 1);
  }

  if (life <= ret) {
    dom.lifeExpectancyInput.value = ret + 1;
    dom.valLifeExpectancy.textContent = String(ret + 1);
  }
}

export function updatePurchasingPowerUI(dom, isDiscounted) {
  if (isDiscounted) {
    dom.purchasingPowerLabel.classList.add('active');
    document.querySelectorAll('.stat-power-label').forEach(el => {
      el.style.display = 'inline';
    });
  } else {
    dom.purchasingPowerLabel.classList.remove('active');
    document.querySelectorAll('.stat-power-label').forEach(el => {
      el.style.display = 'none';
    });
  }
}

export function renderKPIs({ dom, model, simulation, burnDataRaw, optimalRetirementAge, maxMonthlyIncome, formatCurrency }) {
  const isDiscounted = dom.togglePurchasingPower.checked;

  const peakVal = simulation.processedAccum[simulation.processedAccum.length - 1].total;
  dom.kpiPeakVal.textContent = formatCurrency(peakVal);
  dom.kpiPeakAge.textContent = `Reached at age ${dom.retirementAgeInput.value}`;

  dom.kpiTotalContrib.textContent = formatCurrency(isDiscounted
    ? simulation.processedAccum[simulation.processedAccum.length - 1].contributions
    : simulation.cumulativeContributions);
  dom.kpiAccumYears.textContent = `Over ${simulation.accumYears} accumulation years`;

  if (optimalRetirementAge) {
    const retirementYear = new Date().getFullYear() + (optimalRetirementAge.age - model.currentAge);
    dom.kpiOptimalAge.textContent = String(optimalRetirementAge.age);
    const kpiOptimalYear = document.getElementById('kpi-optimal-year');
    if (kpiOptimalYear) kpiOptimalYear.textContent = `Year ${retirementYear}`;
    dom.kpiOptimalAgeDesc.textContent = 'Earliest age with ~ $0 balance at life expectancy';
    const suggestedAge = parseInt(optimalRetirementAge.age, 10);
    const selectedAge = parseInt(dom.retirementAgeInput.value, 10);
    dom.kpiOptimalWarning.style.display = suggestedAge > selectedAge ? 'flex' : 'none';
  } else {
    dom.kpiOptimalAge.textContent = '—';
    dom.kpiOptimalAgeDesc.textContent = 'Increase savings to find a valid age';
    dom.kpiOptimalWarning.style.display = 'none';
  }

  const kpiMaxIncome = document.getElementById('kpi-max-income');
  const kpiMaxIncomeVs = document.getElementById('kpi-max-income-vs');
  const kpiMaxIncomeDesc = document.getElementById('kpi-max-income-desc');
  if (kpiMaxIncome) {
    const currentMonthly = (model.desiredIncome || 0) / 12;
    if (maxMonthlyIncome !== null && maxMonthlyIncome > 0) {
      kpiMaxIncome.textContent = formatCurrency(maxMonthlyIncome) + '/mo';
      const diff = maxMonthlyIncome - currentMonthly;
      if (diff > 1) {
        kpiMaxIncomeVs.textContent = `+${formatCurrency(diff)}/mo vs. your target`;
        kpiMaxIncomeVs.style.color = 'var(--color-success)';
      } else {
        kpiMaxIncomeVs.textContent = 'At or near your income target';
        kpiMaxIncomeVs.style.color = 'var(--text-muted)';
      }
      kpiMaxIncomeDesc.textContent = 'Monthly amount that draws your portfolio to $0 at life expectancy';

      const breakdown = document.getElementById('kpi-max-income-breakdown');
      const kpiAnnual = document.getElementById('kpi-max-income-annual');
      const kpiAfterTax = document.getElementById('kpi-max-income-aftertax');
      const kpiAfterTaxLabel = document.getElementById('kpi-max-income-aftertax-label');
      if (breakdown && kpiAnnual && kpiAfterTax) {
        const taxRate = model.taxRate || 22;
        const annualGross = maxMonthlyIncome * 12;
        const afterTaxMonthly = maxMonthlyIncome * (1 - taxRate / 100);
        kpiAnnual.textContent = formatCurrency(annualGross) + '/yr';
        kpiAfterTax.textContent = formatCurrency(afterTaxMonthly) + '/mo';
        if (kpiAfterTaxLabel) kpiAfterTaxLabel.textContent = `After ~${taxRate}% tax`;
        breakdown.style.display = 'grid';
      }
    } else {
      kpiMaxIncome.textContent = '—';
      kpiMaxIncomeVs.textContent = '';
      kpiMaxIncomeDesc.textContent = 'Increase contributions to calculate';
    }
  }

  if (simulation.shortfallAge === null) {
    dom.successBanner.classList.remove('shortfall');
    dom.successEmoji.textContent = '🎉';
    dom.successHeadline.textContent = 'Fully Funded';
    dom.successSub.textContent = `Your portfolio is projected to survive past your life expectancy of ${dom.lifeExpectancyInput.value}.`;
  } else {
    dom.successBanner.classList.add('shortfall');
    dom.successEmoji.textContent = '⚠️';
    dom.successHeadline.textContent = `Shortfall at Age ${simulation.shortfallAge}`;
    dom.successSub.textContent = 'Your portfolio is projected to deplete prematurely. Adjust contributions or retirement age.';
  }

  dom.accumAgeStart.textContent = dom.currentAgeInput.value;
  dom.accumAgeEnd.textContent = dom.retirementAgeInput.value;
  dom.burnAgeStart.textContent = dom.retirementAgeInput.value;
  dom.burnAgeEnd.textContent = dom.lifeExpectancyInput.value;

  void burnDataRaw;
}
