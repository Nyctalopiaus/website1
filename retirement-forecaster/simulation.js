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

  const scaledSocialSecurityMonthly = getScaledSocialSecurityBenefit(model.socialSecurityMonthly, retirementAge);
  const socialSecurityAnnual = scaledSocialSecurityMonthly * 12;

  const accumDataLocal = [];
  let curPretax = model.initialPretax;
  let curRoth = model.initialRoth;
  let curTaxable = model.initialTaxable;
  let curHysa = model.initialHysa;
  let hysaBalanceAtRetirement = model.initialHysa;

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

    curPretaxBurn *= (1 + rPostAnnual);
    curRothBurn *= (1 + rPostAnnual);
    curTaxableBurn *= (1 + rPostAnnual);

    const netWithdrawalToday = Math.max(0, model.desiredIncome - socialSecurityAnnual);
    const netWithdrawalFuture = netWithdrawalToday * Math.pow(1 + model.inflation / 100, yearsFromStart);

    let remainingToWithdraw = netWithdrawalFuture;
    let actualWithdrawal = 0;

    if (remainingToWithdraw > 0) {
      const taxableDeduct = Math.min(curTaxableBurn, remainingToWithdraw);
      curTaxableBurn -= taxableDeduct;
      remainingToWithdraw -= taxableDeduct;
      actualWithdrawal += taxableDeduct;
    }

    if (remainingToWithdraw > 0) {
      const taxRateDecimal = model.taxRate / 100;
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
  const ssMonthly = getScaledSocialSecurityBenefit(model.socialSecurityMonthly, retirementAge);
  const ssAnnual = ssMonthly * 12;
  const rPostAnnual = model.postReturn / 100;
  const years = Math.max(1, model.lifeExpectancy - retirementAge);

  function simulate(annualIncome) {
    let balance = startBalance;
    for (let y = 1; y <= years; y++) {
      balance *= (1 + rPostAnnual);
      const netToday = Math.max(0, annualIncome - ssAnnual);
      const netFuture = netToday * Math.pow(1 + model.inflation / 100, y);
      balance -= netFuture;
      if (balance < -1) return balance;
    }
    return balance;
  }

  if (simulate(0) < 0) return null;

  let lo = 0;
  let hi = startBalance;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (simulate(mid) > 0) lo = mid;
    else hi = mid;
  }

  return (lo + hi) / 2 / 12;
}
