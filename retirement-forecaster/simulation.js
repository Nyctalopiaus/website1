export function getScaledSocialSecurityBenefit(monthlyBenefit, retirementAgeValue) {
  const baseMonthly = parseFloat(monthlyBenefit) || 0;
  const retirementAge = parseFloat(retirementAgeValue) || 67;
  const earliestClaimAge = 62 + (1 / 12);

  if (retirementAge < earliestClaimAge) return 0;
  if (retirementAge <= earliestClaimAge) return baseMonthly * 0.683;
  if (retirementAge >= 70) return baseMonthly * 1.259;

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

// IRS Uniform Lifetime Table (Pub. 590-B, Appendix B, Table III), divisors effective
// for distribution years 2022 onward per T.D. 9930. Verified against IRS-sourced
// reference tables (ustax.tools, fincalculators.net) September 2026 — cross-checked
// two independent sources rather than hardcoded from memory.
const RMD_DIVISORS = {
  73: 26.5, 74: 25.5, 75: 24.6, 76: 23.7, 77: 22.9, 78: 22.0, 79: 21.1, 80: 20.2,
  81: 19.4, 82: 18.5, 83: 17.7, 84: 16.8, 85: 16.0, 86: 15.2, 87: 14.4, 88: 13.7,
  89: 12.9, 90: 12.2, 91: 11.5, 92: 10.8, 93: 10.1, 94: 9.5, 95: 8.9, 96: 8.4,
  97: 7.8, 98: 7.3, 99: 6.8, 100: 6.4, 101: 6.0, 102: 5.6, 103: 5.2, 104: 4.9,
  105: 4.6, 106: 4.3, 107: 4.1, 108: 3.9, 109: 3.7, 110: 3.5, 111: 3.4, 112: 3.3,
  113: 3.1, 114: 3.0, 115: 2.9, 116: 2.8, 117: 2.7, 118: 2.5, 119: 2.3, 120: 2.0
};

function getRmdDivisor(age) {
  const flooredAge = Math.min(120, Math.max(73, Math.floor(age)));
  return RMD_DIVISORS[flooredAge];
}

export function discountData(item, startAge, inflationRate, isDiscounted) {
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

export function runRetirementSimulation(model, retirementAgeValue, isDiscounted) {
  const currentAge = model.currentAge;
  const retirementAge = parseInt(retirementAgeValue, 10);
  const lifeExpectancy = model.lifeExpectancy;

  const monthlyEmployerContribution = model.pretaxMonthly * (model.employerMatchRate / 100);
  const hysaMonthlyRate = model.hysaCompounds ? (model.hysaRate / 100) / 12 : 0;

  // Social Security is scaled off the CLAIMING age, not the retirement age — someone
  // can retire well before they start collecting. The benefit itself doesn't turn on
  // until `age >= claimAge` in the burn loop below (see socialSecurityAnnual there).
  const socialSecurityClaimAge = model.socialSecurityClaimAge ?? 67;
  const scaledSocialSecurityMonthly = getScaledSocialSecurityBenefit(model.socialSecurityMonthly, socialSecurityClaimAge);
  const socialSecurityAnnualAtClaim = scaledSocialSecurityMonthly * 12;

  const accumDataLocal = [];
  let curPretax = model.initialPretax;
  let curRoth = model.initialRoth;
  let curTaxable = model.initialTaxable;
  let curHysa = model.initialHysa;
  let hysaBalanceAtRetirement = model.initialHysa;

  // Cost basis for the taxable/brokerage bucket, tracked separately from its market
  // value so withdrawals can be taxed on gains only, not the whole balance. Basis
  // grows with new contributions (dollar for dollar) but never with investment
  // growth — that growth is exactly the unrealized gain that becomes taxable later.
  const initialTaxableGains = Math.min(model.initialTaxableUnrealizedGains || 0, model.initialTaxable);
  let curTaxableBasis = model.initialTaxable - initialTaxableGains;

  const rPreMonthly = (model.preReturn / 100) / 12;
  const accumYears = Math.max(0, retirementAge - currentAge);

  accumDataLocal.push({
    age: currentAge,
    year: new Date().getFullYear(),
    pretax: model.initialPretax,
    roth: model.initialRoth,
    taxable: model.initialTaxable + model.initialHysa,
    total: model.initialPretax + model.initialRoth + model.initialTaxable + model.initialHysa,
    contributions: 0,
    withdrawal: 0
  });

  let cumulativeContributions = 0;

  for (let y = 1; y <= accumYears; y++) {
    for (let m = 1; m <= 12; m++) {
      const pretaxContributionTotal = model.pretaxMonthly + monthlyEmployerContribution;
      curPretax = curPretax * (1 + rPreMonthly) + pretaxContributionTotal;
      curRoth = curRoth * (1 + rPreMonthly) + model.rothMonthly;
      curTaxable = curTaxable * (1 + rPreMonthly) + model.taxableMonthly;
      curTaxableBasis += model.taxableMonthly;

      if (model.hysaCompounds) {
        curHysa = curHysa * (1 + hysaMonthlyRate) + model.hysaMonthly;
      } else {
        curHysa += model.hysaMonthly;
      }

      hysaBalanceAtRetirement = curHysa;
      cumulativeContributions += (pretaxContributionTotal + model.rothMonthly + model.taxableMonthly + model.hysaMonthly);
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
  let curTaxableBurn = curTaxable + (model.hysaCompounds ? hysaBalanceAtRetirement : curHysa);

  // HYSA interest isn't taxed in this model (documented simplification, same as the
  // existing HYSA handling elsewhere), so the full HYSA balance counts as basis here —
  // only brokerage growth above contributions is a taxable capital gain going forward.
  let curTaxableBasisBurn = curTaxableBasis + (model.hysaCompounds ? hysaBalanceAtRetirement : curHysa);

  const rPostAnnual = model.postReturn / 100;
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

    // RMDs are based on the prior year-end Traditional balance — capture it before
    // this year's growth is applied.
    const pretaxBalanceForRmd = curPretaxBurn;

    curPretaxBurn *= (1 + rPostAnnual);
    curRothBurn *= (1 + rPostAnnual);
    curTaxableBurn *= (1 + rPostAnnual);

    const socialSecurityAnnual = age >= socialSecurityClaimAge ? socialSecurityAnnualAtClaim : 0;
    const netWithdrawalToday = Math.max(0, model.desiredIncome - socialSecurityAnnual);
    const netWithdrawalFuture = netWithdrawalToday * Math.pow(1 + model.inflation / 100, yearsFromStart);

    let remainingToWithdraw = netWithdrawalFuture;
    let actualWithdrawal = 0;
    let pretaxGrossWithdrawn = 0;

    if (remainingToWithdraw > 0 && curTaxableBurn > 0) {
      // Only the gain fraction of the balance is taxed, at the capital gains rate —
      // gains and basis are assumed to be withdrawn proportionally (average-cost
      // style), same simplification level as the rest of this model.
      const capGainsRateDecimal = model.capitalGainsRate / 100;
      const gainFraction = Math.max(0, Math.min(1, (curTaxableBurn - curTaxableBasisBurn) / curTaxableBurn));
      const effectiveTaxableRate = gainFraction * capGainsRateDecimal;

      const grossRequired = remainingToWithdraw / (1 - effectiveTaxableRate);
      const grossDeduct = Math.min(curTaxableBurn, grossRequired);
      const netDeduct = grossDeduct * (1 - effectiveTaxableRate);
      const basisReduction = grossDeduct * (curTaxableBasisBurn / curTaxableBurn);

      curTaxableBurn -= grossDeduct;
      curTaxableBasisBurn = Math.max(0, curTaxableBasisBurn - basisReduction);
      remainingToWithdraw -= netDeduct;
      actualWithdrawal += grossDeduct;
    }

    if (remainingToWithdraw > 0) {
      // IRS 10% early-withdrawal penalty applies to Traditional withdrawals before
      // 59½. Roth/Taxable withdrawal-ordering rules (5-year rule, contributions vs.
      // earnings) are not separately modeled — documented simplification.
      const taxRateDecimal = model.taxRate / 100;
      const penaltyRateDecimal = age < 59.5 ? (model.earlyWithdrawalPenaltyRate || 0) / 100 : 0;
      const effectivePretaxRate = taxRateDecimal + penaltyRateDecimal;
      const grossRequired = remainingToWithdraw / (1 - effectivePretaxRate);
      const grossDeduct = Math.min(curPretaxBurn, grossRequired);
      const netDeduct = grossDeduct * (1 - effectivePretaxRate);

      curPretaxBurn -= grossDeduct;
      remainingToWithdraw -= netDeduct;
      actualWithdrawal += grossDeduct;
      pretaxGrossWithdrawn += grossDeduct;
    }

    if (remainingToWithdraw > 0) {
      const rothDeduct = Math.min(curRothBurn, remainingToWithdraw);
      curRothBurn -= rothDeduct;
      remainingToWithdraw -= rothDeduct;
      actualWithdrawal += rothDeduct;
    }

    // Required Minimum Distributions: from age 73, the IRS forces a minimum
    // Traditional withdrawal regardless of desired spending. If the withdrawal
    // above already covers it, nothing changes. Otherwise the shortfall is forced
    // out, taxed as ordinary income (no early-withdrawal penalty — RMD age is
    // always well past 59½), and whatever isn't needed for spending lands in the
    // taxable bucket as already-taxed cash (100% basis going forward).
    if (age >= 73 && pretaxBalanceForRmd > 0) {
      const rmdRequired = pretaxBalanceForRmd / getRmdDivisor(age);
      if (rmdRequired > pretaxGrossWithdrawn) {
        const forcedExtra = Math.min(curPretaxBurn, rmdRequired - pretaxGrossWithdrawn);
        if (forcedExtra > 0) {
          const taxRateDecimal = model.taxRate / 100;
          const forcedNet = forcedExtra * (1 - taxRateDecimal);

          curPretaxBurn -= forcedExtra;
          actualWithdrawal += forcedExtra;
          curTaxableBurn += forcedNet;
          curTaxableBasisBurn += forcedNet;
        }
      }
    }

    const totalBurnBal = curPretaxBurn + curRothBurn + curTaxableBurn;

    if (remainingToWithdraw > 0.01 && shortfallAge === null) {
      shortfallAge = age;
    }

    burnDataLocal.push({
      age,
      year: new Date().getFullYear() + yearsFromStart,
      pretax: Math.max(0, curPretaxBurn),
      roth: Math.max(0, curRothBurn),
      taxable: Math.max(0, curTaxableBurn),
      total: Math.max(0, totalBurnBal),
      contributions: cumulativeContributions,
      withdrawal: actualWithdrawal
    });
  }

  const processedAccum = accumDataLocal.map(d => discountData(d, currentAge, model.inflation, isDiscounted));
  const processedBurn = burnDataLocal.map(d => discountData(d, currentAge, model.inflation, isDiscounted));

  return {
    accumData: accumDataLocal,
    burnData: burnDataLocal,
    processedAccum,
    processedBurn,
    shortfallAge,
    accumYears,
    cumulativeContributions,
    finalBalance: processedBurn[processedBurn.length - 1]?.total ?? 0,
    monthlyEmployerContribution,
    inflation: model.inflation,
    currentAge
  };
}

// Standard normal random variable via the Box-Muller transform.
function randomNormal() {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// Monte Carlo variant of runRetirementSimulation, for the opt-in "market variability"
// view. Mirrors the exact same three-bucket withdrawal cascade (SS claim timing,
// capital-gains gross-up, early-withdrawal penalty, RMD forcing) but draws a fresh
// random annual return each year from a normal distribution centered on the model's
// Market Return / Post-Retire Return inputs, instead of compounding at a single fixed
// rate every year.
//
// Deliberately kept as its own function rather than a parameterized version of
// runRetirementSimulation: that function's cascade math was hand-verified to the cent
// during Phase 1, and this way the deterministic path above is never touched by, or at
// risk from, this addition — with the variability toggle off, runRetirementSimulation
// runs completely unchanged, so output stays byte-identical to Phases 1-3.
export function runMonteCarloSimulation(model, retirementAgeValue, numPaths, returnStdevPercent) {
  const currentAge = model.currentAge;
  const retirementAge = parseInt(retirementAgeValue, 10);
  const lifeExpectancy = model.lifeExpectancy;
  const accumYears = Math.max(0, retirementAge - currentAge);
  const distributionYears = Math.max(0, lifeExpectancy - retirementAge);
  const totalYears = accumYears + distributionYears;

  const monthlyEmployerContribution = model.pretaxMonthly * (model.employerMatchRate / 100);
  const hysaMonthlyRate = model.hysaCompounds ? (model.hysaRate / 100) / 12 : 0;

  const socialSecurityClaimAge = model.socialSecurityClaimAge ?? 67;
  const scaledSocialSecurityMonthly = getScaledSocialSecurityBenefit(model.socialSecurityMonthly, socialSecurityClaimAge);
  const socialSecurityAnnualAtClaim = scaledSocialSecurityMonthly * 12;

  const stdevDecimal = (returnStdevPercent || 0) / 100;

  // One array of ending total balances per age, pooled across every simulated path,
  // so percentiles can be read off after all paths finish.
  const balancesByAge = Array.from({ length: totalYears + 1 }, () => []);
  let successCount = 0;

  for (let p = 0; p < numPaths; p++) {
    let curPretax = model.initialPretax;
    let curRoth = model.initialRoth;
    let curTaxable = model.initialTaxable;
    let curHysa = model.initialHysa;

    const initialTaxableGains = Math.min(model.initialTaxableUnrealizedGains || 0, model.initialTaxable);
    let curTaxableBasis = model.initialTaxable - initialTaxableGains;

    balancesByAge[0].push(curPretax + curRoth + curTaxable + curHysa);

    for (let y = 1; y <= accumYears; y++) {
      const yearReturn = model.preReturn / 100 + randomNormal() * stdevDecimal;
      const rMonthly = Math.pow(1 + Math.max(-0.99, yearReturn), 1 / 12) - 1;

      for (let m = 1; m <= 12; m++) {
        const pretaxContributionTotal = model.pretaxMonthly + monthlyEmployerContribution;
        curPretax = curPretax * (1 + rMonthly) + pretaxContributionTotal;
        curRoth = curRoth * (1 + rMonthly) + model.rothMonthly;
        curTaxable = curTaxable * (1 + rMonthly) + model.taxableMonthly;
        curTaxableBasis += model.taxableMonthly;

        if (model.hysaCompounds) {
          curHysa = curHysa * (1 + hysaMonthlyRate) + model.hysaMonthly;
        } else {
          curHysa += model.hysaMonthly;
        }
      }

      balancesByAge[y].push(curPretax + curRoth + curTaxable + curHysa);
    }

    let curPretaxBurn = curPretax;
    let curRothBurn = curRoth;
    let curTaxableBurn = curTaxable + curHysa;
    let curTaxableBasisBurn = curTaxableBasis + curHysa;
    let shortfallAge = null;

    for (let y = 1; y <= distributionYears; y++) {
      const age = retirementAge + y;
      const yearsFromStart = accumYears + y;
      const yearReturn = model.postReturn / 100 + randomNormal() * stdevDecimal;
      const rAnnual = Math.max(-0.99, yearReturn);

      const pretaxBalanceForRmd = curPretaxBurn;

      curPretaxBurn *= (1 + rAnnual);
      curRothBurn *= (1 + rAnnual);
      curTaxableBurn *= (1 + rAnnual);

      const socialSecurityAnnual = age >= socialSecurityClaimAge ? socialSecurityAnnualAtClaim : 0;
      const netWithdrawalToday = Math.max(0, model.desiredIncome - socialSecurityAnnual);
      const netWithdrawalFuture = netWithdrawalToday * Math.pow(1 + model.inflation / 100, yearsFromStart);

      let remainingToWithdraw = netWithdrawalFuture;
      let pretaxGrossWithdrawn = 0;

      if (remainingToWithdraw > 0 && curTaxableBurn > 0) {
        const capGainsRateDecimal = model.capitalGainsRate / 100;
        const gainFraction = Math.max(0, Math.min(1, (curTaxableBurn - curTaxableBasisBurn) / curTaxableBurn));
        const effectiveTaxableRate = gainFraction * capGainsRateDecimal;

        const grossRequired = remainingToWithdraw / (1 - effectiveTaxableRate);
        const grossDeduct = Math.min(curTaxableBurn, grossRequired);
        const netDeduct = grossDeduct * (1 - effectiveTaxableRate);
        const basisReduction = grossDeduct * (curTaxableBasisBurn / curTaxableBurn);

        curTaxableBurn -= grossDeduct;
        curTaxableBasisBurn = Math.max(0, curTaxableBasisBurn - basisReduction);
        remainingToWithdraw -= netDeduct;
      }

      if (remainingToWithdraw > 0) {
        const taxRateDecimal = model.taxRate / 100;
        const penaltyRateDecimal = age < 59.5 ? (model.earlyWithdrawalPenaltyRate || 0) / 100 : 0;
        const effectivePretaxRate = taxRateDecimal + penaltyRateDecimal;
        const grossRequired = remainingToWithdraw / (1 - effectivePretaxRate);
        const grossDeduct = Math.min(curPretaxBurn, grossRequired);
        const netDeduct = grossDeduct * (1 - effectivePretaxRate);

        curPretaxBurn -= grossDeduct;
        remainingToWithdraw -= netDeduct;
        pretaxGrossWithdrawn += grossDeduct;
      }

      if (remainingToWithdraw > 0) {
        const rothDeduct = Math.min(curRothBurn, remainingToWithdraw);
        curRothBurn -= rothDeduct;
        remainingToWithdraw -= rothDeduct;
      }

      if (age >= 73 && pretaxBalanceForRmd > 0) {
        const rmdRequired = pretaxBalanceForRmd / getRmdDivisor(age);
        if (rmdRequired > pretaxGrossWithdrawn) {
          const forcedExtra = Math.min(curPretaxBurn, rmdRequired - pretaxGrossWithdrawn);
          if (forcedExtra > 0) {
            const taxRateDecimal = model.taxRate / 100;
            const forcedNet = forcedExtra * (1 - taxRateDecimal);

            curPretaxBurn -= forcedExtra;
            curTaxableBurn += forcedNet;
            curTaxableBasisBurn += forcedNet;
          }
        }
      }

      curPretaxBurn = Math.max(0, curPretaxBurn);
      curRothBurn = Math.max(0, curRothBurn);
      curTaxableBurn = Math.max(0, curTaxableBurn);

      if (remainingToWithdraw > 0.01 && shortfallAge === null) {
        shortfallAge = age;
      }

      balancesByAge[accumYears + y].push(curPretaxBurn + curRothBurn + curTaxableBurn);
    }

    if (shortfallAge === null) successCount++;
  }

  const percentile = (sortedArr, fraction) => {
    const idx = Math.min(sortedArr.length - 1, Math.max(0, Math.floor(fraction * sortedArr.length)));
    return sortedArr[idx];
  };

  const percentileBands = balancesByAge.map((balances, idx) => {
    const sorted = [...balances].sort((a, b) => a - b);
    return {
      age: currentAge + idx,
      p10: percentile(sorted, 0.10),
      p50: percentile(sorted, 0.50),
      p90: percentile(sorted, 0.90)
    };
  });

  return {
    percentileBands,
    accumYears,
    distributionYears,
    probabilityOfSuccess: numPaths > 0 ? (successCount / numPaths) * 100 : null
  };
}

export function solveOptimalRetirementAge(model) {
  for (let candidateAge = model.currentAge + 1; candidateAge <= 80; candidateAge++) {
    const simulation = runRetirementSimulation(model, candidateAge, false);
    if (simulation.shortfallAge === null) {
      return { age: candidateAge, type: 'survive' };
    }
  }

  let bestSurvivalAge = null;
  let maxSurvivalAge = 0;

  for (let candidateAge = model.currentAge + 1; candidateAge <= 80; candidateAge++) {
    const simulation = runRetirementSimulation(model, candidateAge, false);
    const survivalPoint = simulation.shortfallAge ? simulation.shortfallAge : model.lifeExpectancy;
    if (survivalPoint > maxSurvivalAge) {
      maxSurvivalAge = survivalPoint;
      bestSurvivalAge = candidateAge;
    }
  }

  return { age: bestSurvivalAge, type: 'shortfall' };
}

export function solveMaxMonthlyIncome(model, startBalance, retirementAgeValue) {
  if (startBalance <= 0) return null;

  const retirementAge = parseInt(retirementAgeValue, 10);

  // Binary-search for the highest desiredIncome that keeps the plan solvent, reusing
  // the exact same three-bucket withdrawal simulation used everywhere else (ordinary
  // tax on Traditional, capital gains on Taxable, early-withdrawal penalty, SS timing)
  // instead of a second simplified pooled-balance model that would silently drift out
  // of sync with it — that mismatch previously let this KPI ignore taxes entirely.
  function isSolvent(annualIncome) {
    const testModel = { ...model, desiredIncome: annualIncome };
    return runRetirementSimulation(testModel, retirementAge, false).shortfallAge === null;
  }

  let lo = 0;
  let hi = startBalance;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (isSolvent(mid)) lo = mid;
    else hi = mid;
  }

  return (lo + hi) / 2 / 12;
}
