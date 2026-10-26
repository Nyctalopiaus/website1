/**
 * Haven — Mindful Monthly Budgeting for Beginners
 * Main Coordinator & UI Application Controller
 * Handles 7 Core Pillars: Income Setup, 50/30/20 Dashboard, Guilt-Free Allowance,
 * Payday Rhythm Splitter, Quick-Add Palette, Sinking Funds, and What-If Simulator.
 */

(function () {
  'use strict';

  window.Haven = window.Haven || {};

  // DOM Elements: Income & Taxes
  const grossInput = document.getElementById('gross-income-input');
  const netInput = document.getElementById('net-income-input');
  const withholdingSlider = document.getElementById('withholding-slider');
  const withholdingPctLabel = document.getElementById('withholding-pct-label');
  const withholdingDollarLabel = document.getElementById('withholding-dollar-label');
  const payFreqSelect = document.getElementById('pay-frequency-select');
  const currencySelect = document.getElementById('currency-select');

  // DOM Elements: KPI & Framework Dashboard
  const kpiIncomeEl = document.getElementById('kpi-income');
  const kpiExpensesEl = document.getElementById('kpi-expenses');
  const kpiCushionEl = document.getElementById('kpi-cushion');
  const kpiCushionCard = document.getElementById('kpi-cushion-card');
  const kpiCushionSubtext = document.getElementById('kpi-cushion-subtext');

  // Guilt-Free Spending KPI
  const kpiAllowanceCard = document.getElementById('kpi-allowance-card');
  const kpiAllowanceDaily = document.getElementById('kpi-allowance-daily');
  const kpiAllowanceWeekly = document.getElementById('kpi-allowance-weekly');

  const pillarNeedsBar = document.getElementById('pillar-needs-bar');
  const pillarNeedsAmount = document.getElementById('pillar-needs-amount');
  const pillarNeedsStatus = document.getElementById('pillar-needs-status');

  const pillarWantsBar = document.getElementById('pillar-wants-bar');
  const pillarWantsAmount = document.getElementById('pillar-wants-amount');
  const pillarWantsStatus = document.getElementById('pillar-wants-status');

  const pillarSavingsBar = document.getElementById('pillar-savings-bar');
  const pillarSavingsAmount = document.getElementById('pillar-savings-amount');
  const pillarSavingsStatus = document.getElementById('pillar-savings-status');

  // DOM Elements: Spending Planner & Palette
  const tableBody = document.getElementById('budget-table-body');
  const emptyState = document.getElementById('table-empty-state');
  const filterTabs = document.querySelectorAll('.filter-tab');
  const quickAddChips = document.getElementById('quick-add-chips');

  // Payday Rhythm Elements
  const paycheckSplitterBanner = document.getElementById('paycheck-splitter-banner');
  const p1NetVal = document.getElementById('p1-net-val');
  const p1BillsVal = document.getElementById('p1-bills-val');
  const p1CushionVal = document.getElementById('p1-cushion-val');
  const p2NetVal = document.getElementById('p2-net-val');
  const p2BillsVal = document.getElementById('p2-bills-val');
  const p2CushionVal = document.getElementById('p2-cushion-val');

  // Toolbar & General Actions
  const addItemBtn = document.getElementById('btn-add-item');
  const addItemEmptyBtn = document.getElementById('btn-add-item-empty');
  const viewSampleBtn = document.getElementById('btn-view-sample');
  const viewSampleEmptyBtn = document.getElementById('btn-view-sample-empty');
  const sampleModal = document.getElementById('sample-modal');
  const closeSampleModalBtn = document.getElementById('btn-close-sample-modal');
  const closeSampleModalFootBtn = document.getElementById('btn-close-sample-modal-foot');
  const applySampleTemplateBtn = document.getElementById('btn-apply-sample-template');
  const sampleItemsContainer = document.getElementById('sample-items-container');

  // Tipped Income Elements
  const btnToggleTipsCalc = document.getElementById('btn-toggle-tips-calc');
  const tipsToggleIcon = document.getElementById('tips-toggle-icon');
  const tipsCalculatorPanel = document.getElementById('tips-calculator-panel');
  const tipsBasePaycheckInput = document.getElementById('tips-base-paycheck');
  const tipsAvgShiftInput = document.getElementById('tips-avg-shift');
  const tipsShiftsWeekInput = document.getElementById('tips-shifts-week');
  const tipsCalculatedTotalDisplay = document.getElementById('tips-calculated-total-display');
  const btnApplyTipsIncome = document.getElementById('btn-apply-tips-income');

  // Sinking Fund Elements
  const btnOpenSinkingFund = document.getElementById('btn-open-sinking-fund');
  const sinkingFundModal = document.getElementById('sinking-fund-modal');
  const btnCloseSinkingFund = document.getElementById('btn-close-sinking-fund');
  const btnCloseSinkingFundFoot = document.getElementById('btn-close-sinking-fund-foot');
  const sfBillNameInput = document.getElementById('sf-bill-name');
  const sfTotalTargetInput = document.getElementById('sf-total-target');
  const sfMonthsDueInput = document.getElementById('sf-months-due');
  const sfMonthlyResult = document.getElementById('sf-monthly-result');
  const sfNarrativeResult = document.getElementById('sf-narrative-result');
  const btnAddSinkingFundItem = document.getElementById('btn-add-sinking-fund-item');

  // What-If Scenario Simulator Elements
  const btnOpenWhatIf = document.getElementById('btn-open-what-if');
  const whatIfModal = document.getElementById('what-if-modal');
  const btnCloseWhatIf = document.getElementById('btn-close-what-if');
  const btnCloseWhatIfFoot = document.getElementById('btn-close-what-if-foot');
  const whatIfIncomeSlider = document.getElementById('what-if-income-slider');
  const whatIfWantsSlider = document.getElementById('what-if-wants-slider');
  const whatIfHousingSlider = document.getElementById('what-if-housing-slider');
  const whatIfIncomeDisplay = document.getElementById('what-if-income-display');
  const whatIfWantsDisplay = document.getElementById('what-if-wants-display');
  const whatIfHousingDisplay = document.getElementById('what-if-housing-display');
  const whatIfBaseCushion = document.getElementById('what-if-base-cushion');
  const whatIfSimCushion = document.getElementById('what-if-sim-cushion');
  const whatIfAnnualBanner = document.getElementById('what-if-annual-banner');
  const whatIfAnnualDiff = document.getElementById('what-if-annual-diff');
  const whatIfAnnualNarrative = document.getElementById('what-if-annual-narrative');
  const whatIfSimNeeds = document.getElementById('what-if-sim-needs');
  const whatIfSimWants = document.getElementById('what-if-sim-wants');
  const whatIfSimSavings = document.getElementById('what-if-sim-savings');
  const btnResetWhatIfSliders = document.getElementById('btn-reset-what-if-sliders');
  const btnApplyWhatIfChanges = document.getElementById('btn-apply-what-if-changes');

  // Header and Utility Buttons
  const clearBudgetBtn = document.getElementById('btn-clear-budget');
  const exportBtn = document.getElementById('btn-export');
  const importInput = document.getElementById('file-import-input');
  const importBtn = document.getElementById('btn-import');
  const printBtn = document.getElementById('btn-print');
  const themeToggleBtn = document.getElementById('btn-theme-toggle');

  const privacyBadge = document.getElementById('badge-privacy');
  const privacyModal = document.getElementById('privacy-modal');
  const closePrivacyModalBtn = document.getElementById('btn-close-privacy-modal');
  const btnPrivacyGotIt = document.getElementById('btn-privacy-got-it');
  const btnFooterPrivacy = document.getElementById('btn-footer-privacy');
  const toastContainer = document.getElementById('toast-container');

  // Show Toast Notification (Safely using textContent to prevent DOM XSS)
  function showToast(message, icon = 'check-circle') {
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = 'toast';

    const iconEl = document.createElement('i');
    iconEl.setAttribute('data-lucide', Haven.sanitizeIcon ? Haven.sanitizeIcon(icon) : 'check-circle');

    const spanEl = document.createElement('span');
    spanEl.textContent = String(message || '');

    toast.appendChild(iconEl);
    toast.appendChild(spanEl);
    toastContainer.appendChild(toast);

    if (window.lucide) lucide.createIcons({ root: toast });
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(8px)';
      setTimeout(() => toast.remove(), 300);
    }, 2800);
  }

  // Update Currency Symbols across all static symbol badges
  function updateCurrencySymbols() {
    const symbol = Haven.getActiveCurrency ? Haven.getActiveCurrency().symbol : '$';
    document.querySelectorAll('.input-symbol').forEach(el => {
      el.textContent = symbol;
    });
  }

  // Sync Input Controls with State
  function syncIncomeInputs() {
    const s = Haven.state || {};
    if (grossInput) grossInput.value = (s.grossMonthly && s.grossMonthly > 0) ? s.grossMonthly : '';
    if (netInput) netInput.value = (s.netMonthly && s.netMonthly > 0) ? s.netMonthly : '';
    if (withholdingSlider) withholdingSlider.value = s.withholdingPct || 22;
    if (withholdingPctLabel) withholdingPctLabel.textContent = `${s.withholdingPct}%`;
    if (payFreqSelect) payFreqSelect.value = s.payFrequency || 'monthly';
    if (currencySelect && Haven.getActiveCurrency) {
      currencySelect.value = Haven.getActiveCurrency().code;
    }

    if (withholdingDollarLabel) {
      if (s.grossMonthly > 0) {
        const deductionDollar = (s.grossMonthly * (s.withholdingPct / 100)) || 0;
        withholdingDollarLabel.textContent = `~${Haven.formatMoney(deductionDollar)} / mo in taxes & deductions`;
      } else {
        withholdingDollarLabel.textContent = `$0 / mo`;
      }
    }

    updateCurrencySymbols();
  }

  // Recalculate Net from Gross & Slider
  function recalculateEstimatedNet() {
    const gross = parseFloat(grossInput ? grossInput.value : 0) || 0;
    const pct = parseFloat(withholdingSlider ? withholdingSlider.value : 22) || 22;
    const res = Haven.calculateNetFromGross(gross, pct);

    Haven.state.grossMonthly = res.gross;
    Haven.state.withholdingPct = res.pct;
    Haven.state.netMonthly = res.net;

    if (netInput) netInput.value = res.net || '';
    syncIncomeInputs();
    renderAll();
    Haven.saveState();
  }

  // Calculate Tipped / Variable Pay
  function calculateMainTips() {
    const base = parseFloat(tipsBasePaycheckInput ? tipsBasePaycheckInput.value : 0) || 0;
    const avgShift = parseFloat(tipsAvgShiftInput ? tipsAvgShiftInput.value : 0) || 0;
    const shiftsWk = parseFloat(tipsShiftsWeekInput ? tipsShiftsWeekInput.value : 0) || 0;

    const res = Haven.calculateTippedMonthly(base, avgShift, shiftsWk);
    if (tipsCalculatedTotalDisplay) {
      tipsCalculatedTotalDisplay.textContent = `${Haven.formatMoney(res.totalNet)} / month`;
    }
    return res;
  }

  // Render Quick-Add "Common Essentials" Tap Palette
  function renderQuickAddChips() {
    if (!quickAddChips) return;
    quickAddChips.innerHTML = '';
    const presets = Haven.COMMON_PRESETS || [];

    presets.forEach((preset) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'quick-chip';
      btn.innerHTML = `
        <i data-lucide="${preset.icon}" style="width: 14px; height: 14px;"></i>
        <span>${Haven.escapeHtml(preset.name)}</span>
        <span class="quick-chip-amt">${Haven.formatMoney(preset.amount)}</span>
      `;

      btn.addEventListener('click', () => {
        const newItem = {
          id: 'item_' + Date.now(),
          name: preset.name,
          categoryId: preset.categoryId,
          tier: preset.tier,
          amount: preset.amount,
          paycheck: 'all',
          goalAmount: 0
        };
        Haven.state.items.push(newItem);
        Haven.saveState();
        renderAll();
        showToast(`Added ${preset.name} (${Haven.formatMoney(preset.amount)})`, 'plus-circle');
      });

      quickAddChips.appendChild(btn);
    });

    if (window.lucide) lucide.createIcons({ root: quickAddChips });
  }

  // Render Payday Rhythm Splitter Banner
  function renderPaydayRhythm() {
    if (!paycheckSplitterBanner) return;
    const isApplicable = Haven.state.payFrequency === 'bi-weekly' || Haven.state.payFrequency === 'semi-monthly';

    if (!isApplicable) {
      paycheckSplitterBanner.style.display = 'none';
      return;
    }

    paycheckSplitterBanner.style.display = 'block';
    const split = Haven.calculatePaycheckSplit(Haven.state.items, Haven.state.netMonthly, Haven.state.payFrequency);

    if (p1NetVal) p1NetVal.textContent = Haven.formatMoney(split.halfNet);
    if (p1BillsVal) p1BillsVal.textContent = Haven.formatMoney(split.p1Total);
    if (p1CushionVal) {
      p1CushionVal.textContent = (split.p1Cushion >= 0 ? '+' : '') + Haven.formatMoney(split.p1Cushion);
      p1CushionVal.className = split.p1Cushion >= 0 ? 'positive' : 'negative';
    }

    if (p2NetVal) p2NetVal.textContent = Haven.formatMoney(split.halfNet);
    if (p2BillsVal) p2BillsVal.textContent = Haven.formatMoney(split.p2Total);
    if (p2CushionVal) {
      p2CushionVal.textContent = (split.p2Cushion >= 0 ? '+' : '') + Haven.formatMoney(split.p2Cushion);
      p2CushionVal.className = split.p2Cushion >= 0 ? 'positive' : 'negative';
    }
  }

  // Render Spending Planner Table
  function renderTable() {
    if (!tableBody) return;
    tableBody.innerHTML = '';

    const itemsToDisplay = (Haven.state.items || []).filter(item => {
      if (Haven.state.filterTier === 'all') return true;
      return item.tier === Haven.state.filterTier;
    });

    if (itemsToDisplay.length === 0) {
      if (emptyState) emptyState.style.display = 'block';
      return;
    } else {
      if (emptyState) emptyState.style.display = 'none';
    }

    const allCats = Haven.getAllCategories ? Haven.getAllCategories() : Haven.CATEGORIES;
    const groups = {};
    allCats.forEach(cat => {
      if (!groups[cat.group]) groups[cat.group] = [];
      groups[cat.group].push(cat);
    });

    const activeCurr = Haven.getActiveCurrency ? Haven.getActiveCurrency() : { symbol: '$' };

    itemsToDisplay.forEach((item) => {
      const tr = document.createElement('tr');
      tr.dataset.itemId = item.id;

      let categoryOptionsHtml = '';
      for (const [groupName, cats] of Object.entries(groups)) {
        categoryOptionsHtml += `<optgroup label="${groupName}">`;
        cats.forEach(c => {
          const selected = c.id === item.categoryId ? 'selected' : '';
          const customMark = c.isCustom ? ' (Custom)' : '';
          categoryOptionsHtml += `<option value="${c.id}" ${selected}>${Haven.escapeHtml(c.name)}${customMark}</option>`;
        });
        categoryOptionsHtml += `</optgroup>`;
      }

      categoryOptionsHtml += `
        <optgroup label="Customization">
          <option value="__add_new_category__">➕ + Create New Category...</option>
        </optgroup>
      `;

      const tierClass = item.tier === 'needs' ? 'tier-needs' : (item.tier === 'wants' ? 'tier-wants' : 'tier-savings');
      const tierLabel = item.tier === 'needs' ? 'Essential (Needs)' : (item.tier === 'wants' ? 'Lifestyle (Wants)' : 'Future (Savings)');
      const safeAmountVal = (Number.isFinite(Number(item.amount)) && item.amount > 0) ? Math.max(0, Math.round(Number(item.amount))) : '';

      // Paycheck tag
      const paycheckVal = item.paycheck || 'all';
      const paycheckLabel = paycheckVal === 'p1' ? 'Paycheck 1' : (paycheckVal === 'p2' ? 'Paycheck 2' : 'Split / All');
      const paycheckTitle = paycheckVal === 'p1' ? 'Assigned to Paycheck 1' : (paycheckVal === 'p2' ? 'Assigned to Paycheck 2' : 'Split across Paychecks 1 & 2');

      // Savings Goal Badge
      let goalHtml = '';
      if (item.tier === 'savings' && item.amount > 0) {
        if (item.goalAmount > 0) {
          const cd = Haven.calculateGoalCountdown(item.amount, item.goalAmount);
          goalHtml = `<div class="goal-countdown-badge btn-edit-goal" title="Click to edit savings goal" style="cursor: pointer;"><i data-lucide="target" style="width: 12px; height: 12px;"></i><span>Target: ${Haven.formatMoney(item.goalAmount)} (${cd.months} mo)</span></div>`;
        } else {
          goalHtml = `<div class="goal-countdown-badge btn-edit-goal" style="background: transparent; border-style: dashed; opacity: 0.75; cursor: pointer;" title="Set target savings goal"><i data-lucide="target" style="width: 12px; height: 12px;"></i><span>+ Goal</span></div>`;
        }
      }

      tr.innerHTML = `
        <td>
          <input type="text" class="item-name-input" value="${Haven.escapeHtml(item.name)}" placeholder="Item name..." aria-label="Item name">
          ${goalHtml}
        </td>
        <td>
          <select class="category-select" aria-label="Item category">
            ${categoryOptionsHtml}
          </select>
        </td>
        <td>
          <button type="button" class="tier-pill ${tierClass}" title="Click to cycle tier (Needs -> Wants -> Savings)">
            ${tierLabel}
          </button>
        </td>
        <td>
          <div class="input-with-symbol" style="max-width: 140px;">
            <span class="input-symbol">${activeCurr.symbol}</span>
            <input type="number" class="item-amount-input form-input" value="${safeAmountVal}" placeholder="0" min="0" step="1" aria-label="Planned monthly amount">
          </div>
        </td>
        <td class="col-paycheck">
          <button type="button" class="paycheck-pill ${paycheckVal}" title="${paycheckTitle}">
            ${paycheckLabel}
          </button>
        </td>
        <td>
          <div class="row-actions">
            <button type="button" class="btn btn-icon-only btn-danger-ghost btn-delete-row" title="Delete spending item" aria-label="Delete">
              <i data-lucide="trash-2"></i>
            </button>
          </div>
        </td>
      `;

      const nameInput = tr.querySelector('.item-name-input');
      const catSelect = tr.querySelector('.category-select');
      const tierBtn = tr.querySelector('.tier-pill');
      const amountInput = tr.querySelector('.item-amount-input');
      const paycheckBtn = tr.querySelector('.paycheck-pill');
      const editGoalBtn = tr.querySelector('.btn-edit-goal');
      const delBtn = tr.querySelector('.btn-delete-row');

      nameInput.addEventListener('input', (e) => {
        item.name = String(e.target.value || '').slice(0, 80);
        Haven.saveState();
      });

      catSelect.addEventListener('change', (e) => {
        const selectedId = e.target.value;
        if (selectedId === '__add_new_category__') {
          catSelect.value = item.categoryId;
          if (Haven.openCustomCategoryModal) Haven.openCustomCategoryModal(item.id);
          return;
        }

        item.categoryId = selectedId;
        const meta = allCats.find(c => c.id === selectedId);
        if (meta) {
          item.tier = meta.tier;
          if (!item.name || item.name.trim() === '') {
            item.name = meta.name;
          }
        }
        Haven.saveState();
        renderAll();
      });

      tierBtn.addEventListener('click', () => {
        if (item.tier === 'needs') item.tier = 'wants';
        else if (item.tier === 'wants') item.tier = 'savings';
        else item.tier = 'needs';
        Haven.saveState();
        renderAll();
      });

      amountInput.addEventListener('input', (e) => {
        item.amount = Math.max(0, Math.min(10000000, parseFloat(e.target.value) || 0));
        Haven.saveState();
        renderSummaryAndCharts();
      });

      if (paycheckBtn) {
        paycheckBtn.addEventListener('click', () => {
          if (!item.paycheck || item.paycheck === 'all') item.paycheck = 'p1';
          else if (item.paycheck === 'p1') item.paycheck = 'p2';
          else item.paycheck = 'all';
          Haven.saveState();
          renderAll();
        });
      }

      if (editGoalBtn) {
        editGoalBtn.addEventListener('click', () => {
          const currentTarget = item.goalAmount || (item.amount * 6) || 1000;
          const userVal = prompt(`Enter target savings amount for "${item.name || 'this goal'}":`, currentTarget);
          if (userVal !== null) {
            const parsed = Math.max(0, parseInt(userVal, 10) || 0);
            item.goalAmount = parsed;
            Haven.saveState();
            renderAll();
            showToast(parsed > 0 ? `Target set to ${Haven.formatMoney(parsed)}` : 'Target cleared', 'target');
          }
        });
      }

      delBtn.addEventListener('click', () => {
        const deletedName = item.name || 'Spending item';
        Haven.state.items = Haven.state.items.filter(i => i.id !== item.id);
        Haven.saveState();
        renderAll();
        showToast(`Removed "${deletedName}"`, 'trash');
      });

      tableBody.appendChild(tr);
    });

    if (window.lucide) lucide.createIcons({ root: tableBody });
  }

  // Render KPI Cards, Guilt-Free Allowance, Payday Rhythm, & 50/30/20 Progress Bars
  function renderSummaryAndCharts() {
    const summary = Haven.getFinancialSummary(Haven.state, Haven.getAllCategories());

    // Main 3 KPIs
    if (kpiIncomeEl) kpiIncomeEl.textContent = Haven.formatMoney(summary.net);
    if (kpiExpensesEl) kpiExpensesEl.textContent = Haven.formatMoney(summary.totalExpenses);

    if (kpiCushionEl) {
      if (summary.cushion >= 0) {
        kpiCushionEl.textContent = '+' + Haven.formatMoney(summary.cushion);
        kpiCushionCard.className = 'kpi-card cushion-positive';
        kpiCushionSubtext.className = 'kpi-subtext positive';
        kpiCushionSubtext.innerHTML = '<i data-lucide="check-circle-2"></i> Safe to save or allocate';
      } else {
        kpiCushionEl.textContent = '-' + Haven.formatMoney(Math.abs(summary.cushion));
        kpiCushionCard.className = 'kpi-card cushion-negative';
        kpiCushionSubtext.className = 'kpi-subtext warning';
        kpiCushionSubtext.innerHTML = '<i data-lucide="alert-triangle"></i> Budget is over monthly income';
      }
    }

    // Daily & Weekly Guilt-Free Spending Allowance
    if (kpiAllowanceDaily && kpiAllowanceWeekly) {
      const gf = Haven.calculateGuiltFreeSpending(summary.wantsTotal, summary.cushion);
      kpiAllowanceDaily.innerHTML = `${Haven.formatMoney(gf.dailyAllowance)} <span style="font-size: 0.95rem; font-weight: 500; color: var(--text-muted);">/ day</span>`;

      if (gf.isDeficit) {
        if (kpiAllowanceCard) kpiAllowanceCard.classList.add('is-deficit');
        kpiAllowanceWeekly.innerHTML = `<span style="color: var(--brand-rose);"><i data-lucide="alert-triangle"></i> Deficit: -${Haven.formatMoney(gf.deficitAmount)} — trim wants</span>`;
      } else {
        if (kpiAllowanceCard) kpiAllowanceCard.classList.remove('is-deficit');
        kpiAllowanceWeekly.textContent = `${Haven.formatMoney(gf.weeklyAllowance)} / week (Wants + Cushion)`;
      }
    }

    // 50/30/20 Needs
    if (pillarNeedsBar) {
      const width = Math.min(100, Math.round(summary.needsPct));
      pillarNeedsBar.style.width = `${width}%`;
    }
    if (pillarNeedsAmount) {
      pillarNeedsAmount.textContent = `${Haven.formatMoney(summary.needsTotal)} (${Math.round(summary.needsPct)}%)`;
    }
    if (pillarNeedsStatus) {
      if (summary.needsPct <= 50) {
        pillarNeedsStatus.textContent = 'Ideal: Under 50% target';
        pillarNeedsStatus.style.color = 'var(--tier-savings)';
      } else if (summary.needsPct <= 60) {
        pillarNeedsStatus.textContent = 'Moderate: A bit above 50%';
        pillarNeedsStatus.style.color = 'var(--tier-wants)';
      } else {
        pillarNeedsStatus.textContent = 'High: Review housing & bills';
        pillarNeedsStatus.style.color = 'var(--brand-rose)';
      }
    }

    // 50/30/20 Wants
    if (pillarWantsBar) {
      const width = Math.min(100, Math.round(summary.wantsPct));
      pillarWantsBar.style.width = `${width}%`;
    }
    if (pillarWantsAmount) {
      pillarWantsAmount.textContent = `${Haven.formatMoney(summary.wantsTotal)} (${Math.round(summary.wantsPct)}%)`;
    }
    if (pillarWantsStatus) {
      if (summary.wantsPct <= 30) {
        pillarWantsStatus.textContent = 'Great: Within 30% guideline';
        pillarWantsStatus.style.color = 'var(--tier-savings)';
      } else {
        pillarWantsStatus.textContent = 'High: Opportunities to trim';
        pillarWantsStatus.style.color = 'var(--brand-rose)';
      }
    }

    // 50/30/20 Savings
    if (pillarSavingsBar) {
      const width = Math.min(100, Math.round(summary.savingsPct));
      pillarSavingsBar.style.width = `${width}%`;
    }
    if (pillarSavingsAmount) {
      pillarSavingsAmount.textContent = `${Haven.formatMoney(summary.savingsTotal)} (${Math.round(summary.savingsPct)}%)`;
    }
    if (pillarSavingsStatus) {
      if (summary.savingsPct >= 20) {
        pillarSavingsStatus.textContent = 'Excellent: Met 20% goal!';
        pillarSavingsStatus.style.color = 'var(--tier-savings)';
      } else if (summary.savingsPct > 0) {
        pillarSavingsStatus.textContent = 'Good start: Building habits';
        pillarSavingsStatus.style.color = 'var(--tier-wants)';
      } else {
        pillarSavingsStatus.textContent = 'None yet: Try starting with $50';
        pillarSavingsStatus.style.color = 'var(--text-muted)';
      }
    }

    renderPaydayRhythm();

    if (window.lucide) {
      if (kpiCushionCard) lucide.createIcons({ root: kpiCushionCard });
      if (kpiAllowanceCard) lucide.createIcons({ root: kpiAllowanceCard });
    }

    // Update Charts & Insights Modules
    if (Haven.updateCharts) Haven.updateCharts(summary);
    if (Haven.renderInsights) Haven.renderInsights(summary);
  }

  // Populate Sample Modal Items
  function renderSampleModalItems() {
    if (!sampleItemsContainer) return;
    sampleItemsContainer.innerHTML = '';
    const allCats = Haven.getAllCategories ? Haven.getAllCategories() : Haven.CATEGORIES;

    Haven.SAMPLE_BUDGET.items.forEach(item => {
      const meta = allCats.find(c => c.id === item.categoryId);
      const tierClass = item.tier === 'needs' ? 'tier-needs' : (item.tier === 'wants' ? 'tier-wants' : 'tier-savings');
      const tierLabel = item.tier === 'needs' ? 'Essential (Needs)' : (item.tier === 'wants' ? 'Lifestyle (Wants)' : 'Future (Savings)');
      const icon = meta ? meta.icon : 'tag';

      const row = document.createElement('div');
      row.className = 'sample-item-row';
      row.innerHTML = `
        <span class="sample-item-name">
          <i data-lucide="${icon}" style="width: 15px; height: 15px; color: var(--text-muted);"></i>
          <span>${Haven.escapeHtml(item.name)}</span>
        </span>
        <div class="sample-item-meta">
          <span class="tier-pill ${tierClass}" style="font-size: 0.72rem; padding: 0.2rem 0.55rem;">${tierLabel}</span>
          <span class="sample-item-amt">${Haven.formatMoney(item.amount)}</span>
        </div>
      `;
      sampleItemsContainer.appendChild(row);
    });
    if (window.lucide) lucide.createIcons({ root: sampleItemsContainer });
  }

  // Add New Item Row
  function addNewItem() {
    const allCats = Haven.getAllCategories ? Haven.getAllCategories() : Haven.CATEGORIES;
    const defaultCat = allCats.find(c => c.id === 'food_groceries') || allCats[0];
    const newItem = {
      id: 'item_' + Date.now(),
      name: '',
      categoryId: defaultCat.id,
      tier: defaultCat.tier,
      amount: 0,
      paycheck: 'all',
      goalAmount: 0
    };
    Haven.state.items.push(newItem);
    Haven.saveState();
    renderAll();

    setTimeout(() => {
      const lastRow = tableBody ? tableBody.lastElementChild : null;
      if (lastRow) {
        const input = lastRow.querySelector('.item-name-input');
        if (input) input.focus();
      }
    }, 50);
  }

  // Sinking Fund Live Calculation & Modal
  function updateSinkingFundCalc() {
    const target = parseFloat(sfTotalTargetInput ? sfTotalTargetInput.value : 0) || 0;
    const months = Math.max(1, parseInt(sfMonthsDueInput ? sfMonthsDueInput.value : 6) || 1);
    const res = Haven.calculateSinkingFund(target, months);

    if (sfMonthlyResult) {
      sfMonthlyResult.textContent = `${Haven.formatMoney(res.monthlyContribution)} / month`;
    }
    if (sfNarrativeResult) {
      sfNarrativeResult.textContent = target > 0
        ? `In ${months} months, you will have the full ${Haven.formatMoney(target)} saved with zero stress!`
        : 'Enter an amount and timeframe above';
    }
    return res;
  }

  function openSinkingFundModal() {
    if (sfBillNameInput) sfBillNameInput.value = '';
    if (sfTotalTargetInput) sfTotalTargetInput.value = '';
    if (sfMonthsDueInput) sfMonthsDueInput.value = '6';
    updateSinkingFundCalc();
    if (sinkingFundModal) sinkingFundModal.classList.add('active');
  }

  function closeSinkingFundModal() {
    if (sinkingFundModal) sinkingFundModal.classList.remove('active');
  }

  // What-If? Scenario Simulation
  function runWhatIfSimulation() {
    const incomeDelta = parseFloat(whatIfIncomeSlider ? whatIfIncomeSlider.value : 0) || 0;
    const wantsTrimPct = parseFloat(whatIfWantsSlider ? whatIfWantsSlider.value : 0) || 0;
    const housingDelta = parseFloat(whatIfHousingSlider ? whatIfHousingSlider.value : 0) || 0;

    const res = Haven.simulateWhatIfScenario(Haven.state, { incomeDelta, wantsTrimPct, housingDelta });

    if (whatIfIncomeDisplay) {
      const sign = incomeDelta > 0 ? '+' : '';
      whatIfIncomeDisplay.textContent = `${sign}${Haven.formatMoney(incomeDelta)} / mo`;
      whatIfIncomeDisplay.style.color = incomeDelta >= 0 ? 'var(--tier-savings)' : 'var(--brand-rose)';
    }

    if (whatIfWantsDisplay) {
      whatIfWantsDisplay.textContent = `${wantsTrimPct}% trim (${Haven.formatMoney(res.wantsSaved)}/mo saved)`;
    }

    if (whatIfHousingDisplay) {
      const sign = housingDelta > 0 ? '+' : '';
      whatIfHousingDisplay.textContent = `${sign}${Haven.formatMoney(housingDelta)} / mo`;
      whatIfHousingDisplay.style.color = housingDelta <= 0 ? 'var(--tier-savings)' : 'var(--brand-rose)';
    }

    if (whatIfBaseCushion) {
      whatIfBaseCushion.textContent = `${res.baseCushion >= 0 ? '+' : ''}${Haven.formatMoney(res.baseCushion)} / mo`;
    }

    if (whatIfSimCushion) {
      whatIfSimCushion.textContent = `${res.simCushion >= 0 ? '+' : ''}${Haven.formatMoney(res.simCushion)} / mo`;
      whatIfSimCushion.style.color = res.simCushion >= 0 ? 'var(--tier-savings)' : 'var(--brand-rose)';
    }

    if (whatIfAnnualDiff) {
      const sign = res.annualSavingsDelta > 0 ? '+' : '';
      whatIfAnnualDiff.textContent = `${sign}${Haven.formatMoney(res.annualSavingsDelta)} / year`;
      whatIfAnnualDiff.style.color = res.annualSavingsDelta >= 0 ? 'var(--tier-savings)' : 'var(--brand-rose)';
    }

    if (whatIfAnnualBanner) {
      whatIfAnnualBanner.style.background = res.annualSavingsDelta >= 0 ? 'var(--tier-savings-bg)' : 'rgba(225, 29, 72, 0.08)';
      whatIfAnnualBanner.style.borderColor = res.annualSavingsDelta >= 0 ? 'var(--tier-savings-border)' : 'rgba(225, 29, 72, 0.25)';
    }

    if (whatIfAnnualNarrative) {
      if (res.annualSavingsDelta > 0) {
        whatIfAnnualNarrative.textContent = `🚀 Superb! This scenario frees up an extra ${Haven.formatMoney(res.annualSavingsDelta)} every single year!`;
      } else if (res.annualSavingsDelta < 0) {
        whatIfAnnualNarrative.textContent = `⚠️ Caution: This scenario creates a ${Haven.formatMoney(Math.abs(res.annualSavingsDelta))}/year cash crunch.`;
      } else {
        whatIfAnnualNarrative.textContent = 'Adjust the sliders to test different scenarios.';
      }
    }

    const simNet = res.simNet || 1;
    if (whatIfSimNeeds) whatIfSimNeeds.textContent = `${Haven.formatMoney(res.simNeeds)} (${Math.round((res.simNeeds / simNet) * 100)}%)`;
    if (whatIfSimWants) whatIfSimWants.textContent = `${Haven.formatMoney(res.simWants)} (${Math.round((res.simWants / simNet) * 100)}%)`;
    if (whatIfSimSavings) whatIfSimSavings.textContent = `${Haven.formatMoney(res.simSavings)} (${Math.round((res.simSavings / simNet) * 100)}%)`;

    return res;
  }

  function openWhatIfModal() {
    if (whatIfIncomeSlider) whatIfIncomeSlider.value = 0;
    if (whatIfWantsSlider) whatIfWantsSlider.value = 0;
    if (whatIfHousingSlider) whatIfHousingSlider.value = 0;
    runWhatIfSimulation();
    if (whatIfModal) whatIfModal.classList.add('active');
  }

  function closeWhatIfModal() {
    if (whatIfModal) whatIfModal.classList.remove('active');
  }

  // Render Everything
  function renderAll() {
    renderTable();
    renderSummaryAndCharts();
  }

  // Setup Event Listeners
  function bindEvents() {
    if (grossInput) grossInput.addEventListener('input', recalculateEstimatedNet);
    if (withholdingSlider) withholdingSlider.addEventListener('input', recalculateEstimatedNet);
    if (netInput) {
      netInput.addEventListener('input', (e) => {
        Haven.state.netMonthly = Math.max(0, parseFloat(e.target.value) || 0);
        Haven.saveState();
        renderSummaryAndCharts();
      });
    }

    if (payFreqSelect) {
      payFreqSelect.addEventListener('change', (e) => {
        Haven.state.payFrequency = e.target.value;
        Haven.saveState();
        renderSummaryAndCharts();
      });
    }

    // Currency Selector
    if (currencySelect) {
      currencySelect.addEventListener('change', (e) => {
        const newCode = e.target.value;
        if (Haven.setActiveCurrency) Haven.setActiveCurrency(newCode);
        syncIncomeInputs();
        renderAll();
        renderQuickAddChips();
        renderSampleModalItems();
        showToast(`Currency set to ${Haven.getActiveCurrency().name}`, 'coins');
      });
    }

    filterTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        filterTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        Haven.state.filterTier = tab.dataset.filter;
        renderTable();
      });
    });

    if (addItemBtn) addItemBtn.addEventListener('click', addNewItem);
    if (addItemEmptyBtn) addItemEmptyBtn.addEventListener('click', addNewItem);

    // Sample Modal Handlers
    function openSampleModal() {
      renderSampleModalItems();
      if (sampleModal) sampleModal.classList.add('active');
    }

    function closeSampleModal() {
      if (sampleModal) sampleModal.classList.remove('active');
    }

    if (viewSampleBtn) viewSampleBtn.addEventListener('click', openSampleModal);
    if (viewSampleEmptyBtn) viewSampleEmptyBtn.addEventListener('click', openSampleModal);
    if (closeSampleModalBtn) closeSampleModalBtn.addEventListener('click', closeSampleModal);
    if (closeSampleModalFootBtn) closeSampleModalFootBtn.addEventListener('click', closeSampleModal);

    if (sampleModal) {
      sampleModal.addEventListener('click', (e) => {
        if (e.target === sampleModal) closeSampleModal();
      });
    }

    if (applySampleTemplateBtn) {
      applySampleTemplateBtn.addEventListener('click', () => {
        if (confirm('Copy the sample beginner budget into your personal budget? You can edit or delete any item afterwards.')) {
          const existingCustoms = Haven.state.customCategories || [];
          Haven.state = JSON.parse(JSON.stringify(Haven.SAMPLE_BUDGET));
          Haven.state.customCategories = existingCustoms;
          Haven.state.filterTier = 'all';
          syncIncomeInputs();
          Haven.saveState();
          renderAll();
          closeSampleModal();
          showToast('Sample template copied to your budget!', 'sparkles');
        }
      });
    }

    // Tipped & Variable Income Handlers
    if (btnToggleTipsCalc && tipsCalculatorPanel) {
      btnToggleTipsCalc.addEventListener('click', () => {
        const isActive = tipsCalculatorPanel.classList.toggle('active');
        if (tipsToggleIcon) {
          tipsToggleIcon.textContent = isActive ? 'Hide Calculator ▴' : 'Calculate Average Tips ▾';
        }
      });
    }

    if (tipsBasePaycheckInput) tipsBasePaycheckInput.addEventListener('input', calculateMainTips);
    if (tipsAvgShiftInput) tipsAvgShiftInput.addEventListener('input', calculateMainTips);
    if (tipsShiftsWeekInput) tipsShiftsWeekInput.addEventListener('input', calculateMainTips);

    if (btnApplyTipsIncome) {
      btnApplyTipsIncome.addEventListener('click', () => {
        const res = calculateMainTips();
        if (res.totalNet <= 0) {
          showToast('Please enter your tips and shifts first!', 'alert-circle');
          return;
        }
        Haven.state.netMonthly = res.totalNet;
        Haven.state.grossMonthly = res.roughGross;
        syncIncomeInputs();
        Haven.saveState();
        renderAll();
        showToast(`Applied ${Haven.formatMoney(res.totalNet)} monthly take-home income!`, 'check-circle-2');
      });
    }

    // Sinking Fund Modal Handlers
    if (btnOpenSinkingFund) btnOpenSinkingFund.addEventListener('click', openSinkingFundModal);
    if (btnCloseSinkingFund) btnCloseSinkingFund.addEventListener('click', closeSinkingFundModal);
    if (btnCloseSinkingFundFoot) btnCloseSinkingFundFoot.addEventListener('click', closeSinkingFundModal);

    if (sfTotalTargetInput) sfTotalTargetInput.addEventListener('input', updateSinkingFundCalc);
    if (sfMonthsDueInput) sfMonthsDueInput.addEventListener('input', updateSinkingFundCalc);

    if (sinkingFundModal) {
      sinkingFundModal.addEventListener('click', (e) => {
        if (e.target === sinkingFundModal) closeSinkingFundModal();
      });
    }

    if (btnAddSinkingFundItem) {
      btnAddSinkingFundItem.addEventListener('click', () => {
        const sfRes = updateSinkingFundCalc();
        if (sfRes.monthlyContribution <= 0) {
          showToast('Please enter a target bill amount and months due.', 'alert-circle');
          return;
        }
        const nameVal = (sfBillNameInput ? sfBillNameInput.value.trim() : '') || 'Sinking Fund Item';
        const tierRadio = document.querySelector('input[name="sf-tier"]:checked');
        const tierVal = tierRadio ? tierRadio.value : 'needs';
        const categoryId = tierVal === 'needs' ? 'trans_insurance' : 'save_goal';

        const newItem = {
          id: 'item_' + Date.now(),
          name: `${nameVal} (Sinking Fund)`,
          categoryId: categoryId,
          tier: tierVal,
          amount: sfRes.monthlyContribution,
          paycheck: 'all',
          goalAmount: sfRes.target
        };

        Haven.state.items.push(newItem);
        Haven.saveState();
        renderAll();
        closeSinkingFundModal();
        showToast(`Added "${newItem.name}" (${Haven.formatMoney(sfRes.monthlyContribution)}/mo)`, 'calendar');
      });
    }

    // What-If? Scenario Simulator Handlers
    if (btnOpenWhatIf) btnOpenWhatIf.addEventListener('click', openWhatIfModal);
    if (btnCloseWhatIf) btnCloseWhatIf.addEventListener('click', closeWhatIfModal);
    if (btnCloseWhatIfFoot) btnCloseWhatIfFoot.addEventListener('click', closeWhatIfModal);

    if (whatIfIncomeSlider) whatIfIncomeSlider.addEventListener('input', runWhatIfSimulation);
    if (whatIfWantsSlider) whatIfWantsSlider.addEventListener('input', runWhatIfSimulation);
    if (whatIfHousingSlider) whatIfHousingSlider.addEventListener('input', runWhatIfSimulation);

    if (btnResetWhatIfSliders) {
      btnResetWhatIfSliders.addEventListener('click', () => {
        if (whatIfIncomeSlider) whatIfIncomeSlider.value = 0;
        if (whatIfWantsSlider) whatIfWantsSlider.value = 0;
        if (whatIfHousingSlider) whatIfHousingSlider.value = 0;
        runWhatIfSimulation();
        showToast('Sliders reset to current budget baseline.', 'refresh-cw');
      });
    }

    if (btnApplyWhatIfChanges) {
      btnApplyWhatIfChanges.addEventListener('click', () => {
        const sim = runWhatIfSimulation();
        if (confirm(`Apply this scenario to your budget? (Net will become ${Haven.formatMoney(sim.simNet)}, housing adjusted by ${Haven.formatMoney(sim.simExpenses - sim.baseExpenses)})`)) {
          Haven.state.netMonthly = sim.simNet;
          const incomeDelta = parseFloat(whatIfIncomeSlider ? whatIfIncomeSlider.value : 0) || 0;
          Haven.state.grossMonthly = Math.max(0, Haven.state.grossMonthly + incomeDelta);

          // Apply wants trim proportionally across wants items
          const wantsTrimPct = parseFloat(whatIfWantsSlider ? whatIfWantsSlider.value : 0) || 0;
          if (wantsTrimPct > 0) {
            Haven.state.items.forEach(item => {
              if (item.tier === 'wants' && item.amount > 0) {
                item.amount = Math.max(0, Math.round(item.amount * (1 - wantsTrimPct / 100)));
              }
            });
          }

          // Apply housing delta to housing items
          const housingDelta = parseFloat(whatIfHousingSlider ? whatIfHousingSlider.value : 0) || 0;
          if (housingDelta !== 0) {
            const rentItem = Haven.state.items.find(i => i.categoryId === 'housing_rent');
            if (rentItem) {
              rentItem.amount = Math.max(0, rentItem.amount + housingDelta);
            }
          }

          syncIncomeInputs();
          Haven.saveState();
          renderAll();
          closeWhatIfModal();
          showToast('Applied scenario to your live budget!', 'sparkles');
        }
      });
    }

    if (whatIfModal) {
      whatIfModal.addEventListener('click', (e) => {
        if (e.target === whatIfModal) closeWhatIfModal();
      });
    }

    // Clear Budget
    if (clearBudgetBtn) {
      clearBudgetBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear your budget items and start fresh?')) {
          Haven.clearState(true);
          renderAll();
          showToast('Budget cleared.', 'refresh-cw');
        }
      });
    }

    // Export Backup
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        Haven.exportBackup();
        showToast('Budget backup downloaded safely.', 'download');
      });
    }

    // Import Backup
    if (importBtn && importInput) {
      importBtn.addEventListener('click', () => importInput.click());
      importInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        try {
          await Haven.importBackup(file);
          syncIncomeInputs();
          renderAll();
          if (Haven.renderCustomCategoryList) Haven.renderCustomCategoryList();
          showToast('Backup restored safely and validated!', 'check-circle-2');
        } catch (err) {
          showToast('Could not restore backup: ' + (err.message || 'Corrupted file'), 'alert-circle');
        } finally {
          importInput.value = '';
        }
      });
    }

    // Print Report
    if (printBtn) {
      printBtn.addEventListener('click', () => window.print());
    }

    // Theme Toggle
    if (themeToggleBtn) {
      themeToggleBtn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        const nextTheme = currentTheme === 'cozy-dark' ? 'warm-light' : 'cozy-dark';
        document.documentElement.setAttribute('data-theme', nextTheme);
        localStorage.setItem('haven_theme', nextTheme);

        const metaTheme = document.getElementById('theme-color-meta');
        if (metaTheme) metaTheme.setAttribute('content', nextTheme === 'cozy-dark' ? '#12161b' : '#fbf9f5');

        if (Haven.destroyCharts) Haven.destroyCharts();
        renderSummaryAndCharts();
        showToast(nextTheme === 'cozy-dark' ? 'Cozy Dark mode' : 'Warm Light mode', 'moon');
      });
    }

    // Resize listener for charts
    let resizeTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (Haven.handleChartResize) Haven.handleChartResize();
      }, 150);
    });

    // Privacy Modal
    if (privacyBadge && privacyModal) {
      privacyBadge.addEventListener('click', () => privacyModal.classList.add('active'));
    }
    if (btnFooterPrivacy && privacyModal) {
      btnFooterPrivacy.addEventListener('click', () => privacyModal.classList.add('active'));
    }
    if (closePrivacyModalBtn && privacyModal) {
      closePrivacyModalBtn.addEventListener('click', () => privacyModal.classList.remove('active'));
    }
    if (btnPrivacyGotIt && privacyModal) {
      btnPrivacyGotIt.addEventListener('click', () => privacyModal.classList.remove('active'));
    }
    if (privacyModal) {
      privacyModal.addEventListener('click', (e) => {
        if (e.target === privacyModal) privacyModal.classList.remove('active');
      });
    }
  }

  // Background switcher preview helper
  window.havenSetBg = function (bgName) {
    document.documentElement.setAttribute('data-bg', bgName);
    localStorage.setItem('haven_bg', bgName);
    showToast(`Background: ${bgName.charAt(0).toUpperCase() + bgName.slice(1)}`, 'palette');
  };

  // Initialization
  function init() {
    const savedTheme = localStorage.getItem('haven_theme') || 'warm-light';
    document.documentElement.setAttribute('data-theme', savedTheme);
    const metaTheme = document.getElementById('theme-color-meta');
    if (metaTheme) metaTheme.setAttribute('content', savedTheme === 'cozy-dark' ? '#12161b' : '#fbf9f5');

    const urlParams = new URLSearchParams(window.location.search);
    const bgParam = urlParams.get('bg') || localStorage.getItem('haven_bg') || 'currency';
    document.documentElement.setAttribute('data-bg', bgParam);

    Haven.loadState();
    syncIncomeInputs();
    bindEvents();
    if (Haven.bindCategoryEvents) Haven.bindCategoryEvents();
    if (Haven.bindTourEvents) Haven.bindTourEvents();
    if (Haven.initIconPicker) Haven.initIconPicker();
    if (Haven.renderCustomCategoryList) Haven.renderCustomCategoryList();
    renderQuickAddChips();
    renderAll();

    if (window.lucide) lucide.createIcons();
  }

  // Expose App Module
  Haven.syncIncomeInputs = syncIncomeInputs;
  Haven.renderAll = renderAll;
  Haven.renderTable = renderTable;
  Haven.renderQuickAddChips = renderQuickAddChips;
  Haven.renderPaydayRhythm = renderPaydayRhythm;
  Haven.showToast = showToast;
  Haven.init = init;

  document.addEventListener('DOMContentLoaded', init);
})();
