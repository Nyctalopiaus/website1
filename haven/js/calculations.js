/**
 * Haven — Mindful Monthly Budgeting for Beginners
 * Module: Financial Calculations & 50/30/20 Engine
 */

(function () {
  'use strict';

  window.Haven = window.Haven || {};

  // Calculate Net Monthly from Gross and Withholding Percentage
  function calculateNetFromGross(gross, withholdingPct) {
    const cleanGross = Math.max(0, Math.min(10000000, Number(gross) || 0));
    const cleanPct = Math.max(0, Math.min(100, Number(withholdingPct) || 22));
    const estimatedDeductions = cleanGross * (cleanPct / 100);
    const estimatedNet = Math.max(0, Math.round(cleanGross - estimatedDeductions));
    return {
      gross: cleanGross,
      pct: cleanPct,
      deductions: estimatedDeductions,
      net: estimatedNet
    };
  }

  // Calculate Tipped / Variable Service Worker Monthly Income
  // Formula: (Average Tips per Shift * Shifts per Week * 4.333 weeks) + Base Hourly Paycheck
  function calculateTippedMonthly(basePaycheck, avgShiftTips, shiftsPerWeek) {
    const base = Math.max(0, Math.min(10000000, Number(basePaycheck) || 0));
    const avgTips = Math.max(0, Math.min(100000, Number(avgShiftTips) || 0));
    const shifts = Math.max(0, Math.min(7, Number(shiftsPerWeek) || 0));

    const monthlyTips = Math.round(avgTips * shifts * 4.333);
    const totalNet = base + monthlyTips;
    const roughGross = Math.round(totalNet / 0.80); // Reverse calculate rough gross assuming 20% withholding

    return {
      base,
      avgTips,
      shifts,
      monthlyTips,
      totalNet,
      roughGross
    };
  }

  // Calculate Financial Summary: Expenses, Categories, Cushion, and 50/30/20 Breakdown
  function getFinancialSummary(state, allCategories) {
    const currentState = state || Haven.state || {};
    const categoriesList = allCategories || (Haven.getAllCategories ? Haven.getAllCategories() : Haven.CATEGORIES) || [];

    const net = Math.max(0, Number(currentState.netMonthly) || 0);
    let totalExpenses = 0;
    let needsTotal = 0;
    let wantsTotal = 0;
    let savingsTotal = 0;

    const groupTotals = {};
    const items = Array.isArray(currentState.items) ? currentState.items : [];

    items.forEach(item => {
      const amt = Math.max(0, Number(item.amount) || 0);
      totalExpenses += amt;

      if (item.tier === 'needs') needsTotal += amt;
      else if (item.tier === 'wants') wantsTotal += amt;
      else if (item.tier === 'savings') savingsTotal += amt;

      const meta = categoriesList.find(c => c.id === item.categoryId);
      const groupName = meta ? meta.group : 'Other';
      groupTotals[groupName] = (groupTotals[groupName] || 0) + amt;
    });

    const cushion = net - totalExpenses;
    const needsPct = net > 0 ? (needsTotal / net) * 100 : 0;
    const wantsPct = net > 0 ? (wantsTotal / net) * 100 : 0;
    const savingsPct = net > 0 ? (savingsTotal / net) * 100 : 0;

    return {
      net,
      totalExpenses,
      cushion,
      needsTotal,
      wantsTotal,
      savingsTotal,
      needsPct,
      wantsPct,
      savingsPct,
      groupTotals
    };
  }

  // Calculate Daily & Weekly Guilt-Free Spending Allowance
  // Combines planned lifestyle wants with any positive unallocated cushion
  function calculateGuiltFreeSpending(wantsTotal, cushion, daysInMonth = 30) {
    const wants = Math.max(0, Number(wantsTotal) || 0);
    const cushionVal = Number(cushion) || 0;
    // Guilt-free pool is planned wants plus any positive unassigned cushion
    const safePool = Math.max(0, wants + Math.max(0, cushionVal));
    const dailyAllowance = Math.round(safePool / Math.max(1, daysInMonth));
    const weeklyAllowance = Math.round(safePool / (Math.max(1, daysInMonth) / 7));

    return {
      dailyAllowance,
      weeklyAllowance,
      safePool,
      isDeficit: cushionVal < 0,
      deficitAmount: cushionVal < 0 ? Math.abs(cushionVal) : 0
    };
  }

  // Calculate Sinking Fund Monthly Contribution
  // Target Bill Amount / Months Until Due
  function calculateSinkingFund(targetAmount, monthsUntilDue) {
    const target = Math.max(0, Math.min(10000000, Number(targetAmount) || 0));
    const months = Math.max(1, Math.min(120, Number(monthsUntilDue) || 1));
    const monthlyContribution = Math.round(target / months);
    return {
      target,
      months,
      monthlyContribution
    };
  }

  // Calculate Payday Rhythm (Cash Flow Timing Balance)
  // For bi-weekly (26 checks/yr) or semi-monthly (24 checks/yr) earners
  function calculatePaycheckSplit(items, netMonthly, payFrequency) {
    const isApplicable = payFrequency === 'bi-weekly' || payFrequency === 'semi-monthly';
    const net = Math.max(0, Number(netMonthly) || 0);
    const halfNet = isApplicable ? Math.round(net / 2) : net;

    let p1Total = 0;
    let p2Total = 0;
    let splitTotal = 0;

    const itemList = Array.isArray(items) ? items : [];
    itemList.forEach(item => {
      const amt = Math.max(0, Number(item.amount) || 0);
      const assignment = item.paycheck || 'all';

      if (assignment === 'p1') {
        p1Total += amt;
      } else if (assignment === 'p2') {
        p2Total += amt;
      } else {
        // 'all' / split across both checks equally
        splitTotal += amt;
        const half = Math.round(amt / 2);
        p1Total += half;
        p2Total += (amt - half);
      }
    });

    return {
      isApplicable,
      halfNet,
      p1Total,
      p2Total,
      splitTotal,
      p1Cushion: halfNet - p1Total,
      p2Cushion: halfNet - p2Total
    };
  }

  // Interactive "What-If?" Scenario Simulator (Non-destructive)
  function simulateWhatIfScenario(baseState, options = {}) {
    const state = baseState || Haven.state || {};
    const incomeDelta = Number(options.incomeDelta) || 0;
    const wantsTrimPct = Math.max(0, Math.min(100, Number(options.wantsTrimPct) || 0));
    const housingDelta = Number(options.housingDelta) || 0;

    const baseSummary = getFinancialSummary(state);
    const simNet = Math.max(0, baseSummary.net + incomeDelta);

    let simNeeds = baseSummary.needsTotal + housingDelta;
    if (simNeeds < 0) simNeeds = 0;

    const wantsDiscount = (baseSummary.wantsTotal * (wantsTrimPct / 100));
    const simWants = Math.max(0, Math.round(baseSummary.wantsTotal - wantsDiscount));
    const simSavings = baseSummary.savingsTotal;

    const simExpenses = simNeeds + simWants + simSavings;
    const simCushion = simNet - simExpenses;
    const monthlyDelta = simCushion - baseSummary.cushion;
    const annualSavingsDelta = Math.round(monthlyDelta * 12);

    return {
      baseNet: baseSummary.net,
      simNet,
      baseExpenses: baseSummary.totalExpenses,
      simExpenses,
      baseCushion: baseSummary.cushion,
      simCushion,
      simNeeds,
      simWants,
      simSavings,
      monthlyDelta,
      annualSavingsDelta,
      wantsSaved: Math.round(wantsDiscount)
    };
  }

  // Calculate Time-to-Target for Savings Goals
  function calculateGoalCountdown(monthlyAmount, goalAmount) {
    const monthly = Math.max(0, Number(monthlyAmount) || 0);
    const goal = Math.max(0, Number(goalAmount) || 0);

    if (goal <= 0 || monthly <= 0) {
      return { months: 0, isCalculable: false };
    }

    const months = Math.ceil(goal / monthly);
    return {
      months,
      years: +(months / 12).toFixed(1),
      isCalculable: true
    };
  }

  // Expose Calculations Module
  Haven.calculateNetFromGross = calculateNetFromGross;
  Haven.calculateTippedMonthly = calculateTippedMonthly;
  Haven.getFinancialSummary = getFinancialSummary;
  Haven.calculateGuiltFreeSpending = calculateGuiltFreeSpending;
  Haven.calculateSinkingFund = calculateSinkingFund;
  Haven.calculatePaycheckSplit = calculatePaycheckSplit;
  Haven.simulateWhatIfScenario = simulateWhatIfScenario;
  Haven.calculateGoalCountdown = calculateGoalCountdown;
})();
