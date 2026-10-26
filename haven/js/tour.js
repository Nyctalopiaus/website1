/**
 * Haven — Mindful Monthly Budgeting for Beginners
 * Module: Guided 2-Minute Starter Walkthrough Tour
 */

(function () {
  'use strict';

  window.Haven = window.Haven || {};

  let currentTourStep = 1;
  const tourData = {
    gross: 0,
    withholding: 22,
    net: 0,
    housing: 0,
    groceries: 0,
    utilities: 0,
    fun: 0,
    savings: 0
  };

  // DOM Elements
  const startTourBtn = document.getElementById('btn-start-tour');
  const startTourEmptyBtn = document.getElementById('btn-start-tour-empty');
  const tourModal = document.getElementById('tour-modal');
  const closeTourModalBtn = document.getElementById('btn-close-tour-modal');
  const tourSkipBtn = document.getElementById('btn-tour-skip');
  const tourPrevBtn = document.getElementById('btn-tour-prev');
  const tourNextBtn = document.getElementById('btn-tour-next');

  const tourGrossInput = document.getElementById('tour-input-gross');
  const tourSlider = document.getElementById('tour-slider');
  const tourWithholdingPct = document.getElementById('tour-withholding-pct');
  const tourWithholdingDollars = document.getElementById('tour-withholding-dollars');
  const tourNetInput = document.getElementById('tour-input-net');
  const tourStep1NetDisplay = document.getElementById('tour-step1-net-display');

  const tourHousingInput = document.getElementById('tour-input-housing');
  const tourGroceriesInput = document.getElementById('tour-input-groceries');
  const tourUtilitiesInput = document.getElementById('tour-input-utilities');
  const tourNeedsTotalEl = document.getElementById('tour-needs-total');
  const tourNeedsPctEl = document.getElementById('tour-needs-pct');

  const tourFunInput = document.getElementById('tour-input-fun');
  const tourSavingsInput = document.getElementById('tour-input-savings');
  const tourSummaryCushionEl = document.getElementById('tour-summary-cushion');

  const tourTipsCheckbox = document.getElementById('tour-tips-checkbox');
  const tourTipsFields = document.getElementById('tour-tips-fields');
  const tourTipsShiftAmt = document.getElementById('tour-tips-shift-amt');
  const tourTipsShiftsWk = document.getElementById('tour-tips-shifts-wk');

  const tourPanels = [
    document.getElementById('tour-panel-1'),
    document.getElementById('tour-panel-2'),
    document.getElementById('tour-panel-3')
  ];

  const tourIndicators = [
    document.getElementById('tour-step-indicator-1'),
    document.getElementById('tour-step-indicator-2'),
    document.getElementById('tour-step-indicator-3')
  ];

  const tourLines = [
    document.getElementById('tour-step-line-1'),
    document.getElementById('tour-step-line-2')
  ];

  // Open Walkthrough Modal
  function openTourModal() {
    currentTourStep = 1;
    const currentState = Haven.state || {};

    if (currentState.grossMonthly > 0) {
      tourData.gross = currentState.grossMonthly;
      tourData.withholding = currentState.withholdingPct || 22;
      tourData.net = currentState.netMonthly;
    } else {
      tourData.gross = 4200;
      tourData.withholding = 22;
      tourData.net = Math.round(4200 * 0.78);
    }

    if (tourGrossInput) tourGrossInput.value = tourData.gross || '';
    if (tourSlider) tourSlider.value = tourData.withholding;
    if (tourNetInput) tourNetInput.value = tourData.net || '';

    syncTourStep1();
    syncTourStep2();
    syncTourStep3();
    showTourStep(1);

    if (tourModal) tourModal.classList.add('active');
  }

  // Close Walkthrough Modal
  function closeTourModal() {
    if (tourModal) tourModal.classList.remove('active');
  }

  // Show Specific Step Panel
  function showTourStep(stepNum) {
    currentTourStep = stepNum;

    tourPanels.forEach((p, idx) => {
      if (p) p.classList.toggle('active', idx === stepNum - 1);
    });

    tourIndicators.forEach((ind, idx) => {
      if (!ind) return;
      ind.classList.remove('active', 'completed');
      if (idx + 1 === stepNum) ind.classList.add('active');
      else if (idx + 1 < stepNum) ind.classList.add('completed');
    });

    tourLines.forEach((line, idx) => {
      if (!line) return;
      line.classList.toggle('completed', idx + 1 < stepNum);
    });

    if (tourPrevBtn) tourPrevBtn.style.display = (stepNum > 1) ? 'inline-flex' : 'none';
    if (tourNextBtn) {
      if (stepNum === 1) {
        tourNextBtn.innerHTML = `<span>Next: Add Top Needs</span> <i data-lucide="arrow-right"></i>`;
      } else if (stepNum === 2) {
        tourNextBtn.innerHTML = `<span>Next: Joy & Savings</span> <i data-lucide="arrow-right"></i>`;
      } else if (stepNum === 3) {
        tourNextBtn.innerHTML = `<span>Complete My Budget</span> <i data-lucide="sparkles"></i>`;
      }
      if (window.lucide) lucide.createIcons({ root: tourNextBtn });
    }
  }

  function syncTourStep1() {
    const gross = parseFloat(tourGrossInput ? tourGrossInput.value : 0) || 0;
    const pct = parseFloat(tourSlider ? tourSlider.value : 22) || 22;
    tourData.gross = gross;
    tourData.withholding = pct;

    if (tourWithholdingPct) tourWithholdingPct.textContent = `${pct}%`;
    const ded = Math.round(gross * (pct / 100));
    if (tourWithholdingDollars) tourWithholdingDollars.textContent = `~${Haven.formatMoney(ded)} / mo`;

    const estNet = Math.max(0, Math.round(gross * (1 - (pct / 100))));
    if (document.activeElement !== tourNetInput && tourNetInput) {
      tourNetInput.value = estNet > 0 ? estNet : '';
      tourData.net = estNet;
    }
    if (tourStep1NetDisplay) tourStep1NetDisplay.textContent = Haven.formatMoney(tourData.net);
  }

  function syncTourStep2() {
    const housing = parseFloat(tourHousingInput ? tourHousingInput.value : 0) || 0;
    const groceries = parseFloat(tourGroceriesInput ? tourGroceriesInput.value : 0) || 0;
    const utilities = parseFloat(tourUtilitiesInput ? tourUtilitiesInput.value : 0) || 0;
    tourData.housing = housing;
    tourData.groceries = groceries;
    tourData.utilities = utilities;

    const needsTotal = housing + groceries + utilities;
    if (tourNeedsTotalEl) tourNeedsTotalEl.textContent = Haven.formatMoney(needsTotal);

    const net = tourData.net || 1;
    const needsPct = Math.round((needsTotal / net) * 100);
    if (tourNeedsPctEl) {
      tourNeedsPctEl.textContent = `${needsPct}% of income`;
      if (needsPct <= 50) {
        tourNeedsPctEl.style.color = 'var(--tier-savings)';
        tourNeedsPctEl.style.background = 'var(--tier-savings-bg)';
      } else {
        tourNeedsPctEl.style.color = 'var(--tier-needs)';
        tourNeedsPctEl.style.background = 'var(--tier-needs-bg)';
      }
    }
  }

  function syncTourStep3() {
    const fun = parseFloat(tourFunInput ? tourFunInput.value : 0) || 0;
    const savings = parseFloat(tourSavingsInput ? tourSavingsInput.value : 0) || 0;
    tourData.fun = fun;
    tourData.savings = savings;

    const totalAllocated = (tourData.housing || 0) + (tourData.groceries || 0) + (tourData.utilities || 0) + fun + savings;
    const cushion = (tourData.net || 0) - totalAllocated;

    if (tourSummaryCushionEl) {
      if (cushion >= 0) {
        tourSummaryCushionEl.textContent = `+${Haven.formatMoney(cushion)}`;
        tourSummaryCushionEl.style.color = 'var(--tier-savings)';
      } else {
        tourSummaryCushionEl.textContent = `-${Haven.formatMoney(Math.abs(cushion))}`;
        tourSummaryCushionEl.style.color = 'var(--brand-rose)';
      }
    }
  }

  function syncTourTips() {
    if (!tourTipsCheckbox || !tourTipsCheckbox.checked) return;
    const shiftAmt = parseFloat(tourTipsShiftAmt ? tourTipsShiftAmt.value : 0) || 0;
    const shiftsWk = parseFloat(tourTipsShiftsWk ? tourTipsShiftsWk.value : 0) || 0;
    const monthlyTips = Math.round(shiftAmt * shiftsWk * 4.333);
    if (monthlyTips > 0) {
      tourData.net = monthlyTips;
      tourData.gross = Math.round(monthlyTips / 0.80);
      if (tourNetInput) tourNetInput.value = monthlyTips;
      if (tourGrossInput) tourGrossInput.value = tourData.gross;
      if (tourStep1NetDisplay) tourStep1NetDisplay.textContent = Haven.formatMoney(monthlyTips);
    }
  }

  function completeTour() {
    Haven.state.grossMonthly = tourData.gross;
    Haven.state.withholdingPct = tourData.withholding;
    Haven.state.netMonthly = tourData.net;
    Haven.state.items = [];

    if (tourData.housing > 0) {
      Haven.state.items.push({
        id: 'item_housing_' + Date.now(),
        name: 'Housing (Rent / Mortgage)',
        categoryId: 'housing_rent',
        tier: 'needs',
        amount: tourData.housing
      });
    }
    if (tourData.groceries > 0) {
      Haven.state.items.push({
        id: 'item_groc_' + Date.now(),
        name: 'Groceries & Food Supplies',
        categoryId: 'food_groceries',
        tier: 'needs',
        amount: tourData.groceries
      });
    }
    if (tourData.utilities > 0) {
      Haven.state.items.push({
        id: 'item_util_' + Date.now(),
        name: 'Utilities / Transportation',
        categoryId: 'util_power',
        tier: 'needs',
        amount: tourData.utilities
      });
    }
    if (tourData.fun > 0) {
      Haven.state.items.push({
        id: 'item_fun_' + Date.now(),
        name: 'Lifestyle & Fun (Dining / Hobbies)',
        categoryId: 'food_dining',
        tier: 'wants',
        amount: tourData.fun
      });
    }
    if (tourData.savings > 0) {
      Haven.state.items.push({
        id: 'item_save_' + Date.now(),
        name: 'Emergency Rainy-Day Buffer',
        categoryId: 'save_emergency',
        tier: 'savings',
        amount: tourData.savings
      });
    }

    Haven.saveState();
    if (Haven.syncIncomeInputs) Haven.syncIncomeInputs();
    if (Haven.renderAll) Haven.renderAll();
    closeTourModal();
    if (Haven.showToast) Haven.showToast('Welcome! Your first monthly budget is ready.', 'sparkles');
  }

  // Setup Event Handlers for Guided Tour
  function bindTourEvents() {
    if (startTourBtn) startTourBtn.addEventListener('click', openTourModal);
    if (startTourEmptyBtn) startTourEmptyBtn.addEventListener('click', openTourModal);
    if (closeTourModalBtn) closeTourModalBtn.addEventListener('click', closeTourModal);
    if (tourSkipBtn) tourSkipBtn.addEventListener('click', closeTourModal);

    if (tourModal) {
      tourModal.addEventListener('click', (e) => {
        if (e.target === tourModal) closeTourModal();
      });
    }

    if (tourNextBtn) {
      tourNextBtn.addEventListener('click', () => {
        if (currentTourStep === 1) {
          syncTourStep1();
          showTourStep(2);
        } else if (currentTourStep === 2) {
          syncTourStep2();
          showTourStep(3);
        } else if (currentTourStep === 3) {
          completeTour();
        }
      });
    }

    if (tourPrevBtn) {
      tourPrevBtn.addEventListener('click', () => {
        if (currentTourStep > 1) {
          showTourStep(currentTourStep - 1);
        }
      });
    }

    if (tourGrossInput) tourGrossInput.addEventListener('input', syncTourStep1);
    if (tourSlider) tourSlider.addEventListener('input', syncTourStep1);
    if (tourNetInput) tourNetInput.addEventListener('input', () => {
      tourData.net = Math.max(0, parseFloat(tourNetInput.value) || 0);
      if (tourStep1NetDisplay) tourStep1NetDisplay.textContent = Haven.formatMoney(tourData.net);
    });

    if (tourHousingInput) tourHousingInput.addEventListener('input', syncTourStep2);
    if (tourGroceriesInput) tourGroceriesInput.addEventListener('input', syncTourStep2);
    if (tourUtilitiesInput) tourUtilitiesInput.addEventListener('input', syncTourStep2);

    if (tourFunInput) tourFunInput.addEventListener('input', syncTourStep3);
    if (tourSavingsInput) tourSavingsInput.addEventListener('input', syncTourStep3);

    if (tourTipsCheckbox && tourTipsFields) {
      tourTipsCheckbox.addEventListener('change', () => {
        tourTipsFields.style.display = tourTipsCheckbox.checked ? 'grid' : 'none';
        if (tourTipsCheckbox.checked) syncTourTips();
      });
    }

    if (tourTipsShiftAmt) tourTipsShiftAmt.addEventListener('input', syncTourTips);
    if (tourTipsShiftsWk) tourTipsShiftsWk.addEventListener('input', syncTourTips);
  }

  // Expose Tour Module
  Haven.openTourModal = openTourModal;
  Haven.closeTourModal = closeTourModal;
  Haven.bindTourEvents = bindTourEvents;
})();
