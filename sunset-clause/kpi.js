export function syncLabels(dom) {
  dom.valCurrentAge.textContent = dom.currentAgeInput.value;
  dom.valRetirementAge.textContent = dom.retirementAgeInput.value;
  dom.valLifeExpectancy.textContent = dom.lifeExpectancyInput.value;
  if (dom.valSsClaimAge) dom.valSsClaimAge.textContent = dom.ssClaimAgeInput.value;

  const curr = parseInt(dom.currentAgeInput.value, 10);
  let ret = parseInt(dom.retirementAgeInput.value, 10);
  const life = parseInt(dom.lifeExpectancyInput.value, 10);

  if (ret <= curr) {
    ret = curr + 1;
    dom.retirementAgeInput.value = ret;
    dom.valRetirementAge.textContent = String(ret);
  }

  // Re-check against the possibly-just-corrected retirement age (not the stale
  // pre-correction value) so life expectancy can never end up <= retirement age,
  // which would collapse the burndown chart's age range and hang the chart renderer.
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

export function renderKPIs({ dom, model, simulation, optimalRetirementAge, maxMonthlyIncome, formatCurrency }) {
  const isDiscounted = dom.togglePurchasingPower.checked;

  const peakVal = simulation.processedAccum[simulation.processedAccum.length - 1].total;
  dom.kpiPeakVal.textContent = formatCurrency(peakVal);
  dom.kpiPeakAge.textContent = `Reached at age ${dom.retirementAgeInput.value}`;

  dom.kpiTotalContrib.textContent = formatCurrency(isDiscounted
    ? simulation.processedAccum[simulation.processedAccum.length - 1].contributions
    : simulation.cumulativeContributions);
  dom.kpiAccumYears.textContent = `Over ${simulation.accumYears} accumulation years`;

  const kpiOptimalWarningText = document.getElementById('kpi-optimal-warning-text');

  if (optimalRetirementAge) {
    const retirementYear = new Date().getFullYear() + (optimalRetirementAge.age - model.currentAge);
    dom.kpiOptimalAge.textContent = String(optimalRetirementAge.age);
    const kpiOptimalYear = document.getElementById('kpi-optimal-year');
    if (kpiOptimalYear) kpiOptimalYear.textContent = `Year ${retirementYear}`;
    const suggestedAge = parseInt(optimalRetirementAge.age, 10);
    const selectedAge = parseInt(dom.retirementAgeInput.value, 10);

    if (optimalRetirementAge.type === 'survive') {
      // A genuinely fully-funded age was found at or before age 80.
      dom.kpiOptimalAgeDesc.textContent = 'Earliest age with ~ $0 balance at life expectancy';
      if (kpiOptimalWarningText) kpiOptimalWarningText.textContent = 'You may need to work longer than expected.';
      dom.kpiOptimalWarning.style.display = suggestedAge > selectedAge ? 'flex' : 'none';
    } else {
      // Fallback: no age up to 80 fully funds the plan. This is just the age that
      // delays the shortfall the longest, not a solvent outcome — say so explicitly.
      dom.kpiOptimalAgeDesc.textContent = 'Best available age — your plan is still projected to run short';
      if (kpiOptimalWarningText) {
        kpiOptimalWarningText.textContent = 'Even retiring at this age, your portfolio is projected to run out before life expectancy. Increase savings or reduce planned spending.';
      }
      dom.kpiOptimalWarning.style.display = 'flex';
    }
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
}
