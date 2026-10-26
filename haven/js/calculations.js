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

  // Expose Calculations Module
  Haven.calculateNetFromGross = calculateNetFromGross;
  Haven.calculateTippedMonthly = calculateTippedMonthly;
  Haven.getFinancialSummary = getFinancialSummary;
})();
