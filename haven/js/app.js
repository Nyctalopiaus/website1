/**
 * Haven — Mindful Monthly Budgeting for Beginners
 * Main Coordinator & UI Application Controller
 */

(function () {
  'use strict';

  window.Haven = window.Haven || {};

  // DOM Elements
  const grossInput = document.getElementById('gross-income-input');
  const netInput = document.getElementById('net-income-input');
  const withholdingSlider = document.getElementById('withholding-slider');
  const withholdingPctLabel = document.getElementById('withholding-pct-label');
  const withholdingDollarLabel = document.getElementById('withholding-dollar-label');
  const payFreqSelect = document.getElementById('pay-frequency-select');

  const kpiIncomeEl = document.getElementById('kpi-income');
  const kpiExpensesEl = document.getElementById('kpi-expenses');
  const kpiCushionEl = document.getElementById('kpi-cushion');
  const kpiCushionCard = document.getElementById('kpi-cushion-card');
  const kpiCushionSubtext = document.getElementById('kpi-cushion-subtext');

  const pillarNeedsBar = document.getElementById('pillar-needs-bar');
  const pillarNeedsAmount = document.getElementById('pillar-needs-amount');
  const pillarNeedsStatus = document.getElementById('pillar-needs-status');

  const pillarWantsBar = document.getElementById('pillar-wants-bar');
  const pillarWantsAmount = document.getElementById('pillar-wants-amount');
  const pillarWantsStatus = document.getElementById('pillar-wants-status');

  const pillarSavingsBar = document.getElementById('pillar-savings-bar');
  const pillarSavingsAmount = document.getElementById('pillar-savings-amount');
  const pillarSavingsStatus = document.getElementById('pillar-savings-status');

  const tableBody = document.getElementById('budget-table-body');
  const emptyState = document.getElementById('table-empty-state');
  const filterTabs = document.querySelectorAll('.filter-tab');

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

  // Sync Input Controls with State
  function syncIncomeInputs() {
    const s = Haven.state || {};
    if (grossInput) grossInput.value = (s.grossMonthly && s.grossMonthly > 0) ? s.grossMonthly : '';
    if (netInput) netInput.value = (s.netMonthly && s.netMonthly > 0) ? s.netMonthly : '';
    if (withholdingSlider) withholdingSlider.value = s.withholdingPct || 22;
    if (withholdingPctLabel) withholdingPctLabel.textContent = `${s.withholdingPct}%`;
    if (payFreqSelect) payFreqSelect.value = s.payFrequency || 'monthly';

    if (withholdingDollarLabel) {
      if (s.grossMonthly > 0) {
        const deductionDollar = (s.grossMonthly * (s.withholdingPct / 100)) || 0;
        withholdingDollarLabel.textContent = `~${Haven.formatMoney(deductionDollar)} / mo in taxes & deductions`;
      } else {
        withholdingDollarLabel.textContent = `$0 / mo`;
      }
    }
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

      tr.innerHTML = `
        <td>
          <input type="text" class="item-name-input" value="${Haven.escapeHtml(item.name)}" placeholder="Item name..." aria-label="Item name">
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
            <span class="input-symbol">$</span>
            <input type="number" class="item-amount-input form-input" value="${safeAmountVal}" placeholder="0" min="0" step="1" aria-label="Planned monthly amount">
          </div>
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

  // Render KPI Cards & 50/30/20 Progress Bars
  function renderSummaryAndCharts() {
    const summary = Haven.getFinancialSummary(Haven.state, Haven.getAllCategories());

    // KPIs
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

    if (window.lucide) lucide.createIcons({ root: kpiCushionCard });

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
      amount: 0
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
    renderAll();

    if (window.lucide) lucide.createIcons();
  }

  // Expose App Module
  Haven.syncIncomeInputs = syncIncomeInputs;
  Haven.renderAll = renderAll;
  Haven.renderTable = renderTable;
  Haven.showToast = showToast;
  Haven.init = init;

  document.addEventListener('DOMContentLoaded', init);
})();
