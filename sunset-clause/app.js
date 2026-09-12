import { getDomRefs, toModel, modelFromRawValues } from './dom.js';
import { formatCurrency } from './formatters.js';
import { runRetirementSimulation, solveOptimalRetirementAge, solveMaxMonthlyIncome, runMonteCarloSimulation } from './simulation.js';
import { renderAccumChart, renderBurnChart } from './charts.js';
import { renderKPIs, syncLabels, updatePurchasingPowerUI } from './kpi.js';
import { renderLedger } from './ledger.js';
import {
  readScenarioFromForm, writeScenarioToForm, listSavedScenarios, saveScenario,
  deleteScenario, encodeScenarioToHash, decodeScenarioFromHash, buildLedgerCsv
} from './scenario.js';

document.addEventListener('DOMContentLoaded', () => {
  const dom = getDomRefs();

  let burnData = [];

  // Applies the same today's-purchasing-power discount the deterministic chart data
  // gets (see simulation.js's discountData) to a Monte Carlo percentile band, so the
  // shaded range stays in the same units as the line it surrounds.
  function discountBand(band, currentAge, inflation, isDiscounted) {
    if (!isDiscounted) return band;
    return band.map(b => {
      const discountFactor = Math.pow(1 + inflation / 100, b.age - currentAge);
      return { age: b.age, p10: b.p10 / discountFactor, p50: b.p50 / discountFactor, p90: b.p90 / discountFactor };
    });
  }

  function calculateAll() {
    syncLabels(dom);

    const isDiscounted = dom.togglePurchasingPower.checked;
    updatePurchasingPowerUI(dom, isDiscounted);

    const model = toModel(dom);
    const simulation = runRetirementSimulation(model, model.retirementAge, isDiscounted);
    burnData = simulation.burnData;

    dom.employerContributionMonthlyInput.value = formatCurrency(simulation.monthlyEmployerContribution);

    const optimalRetirementAge = solveOptimalRetirementAge(model);
    const rawBurnStart = burnData[0]?.total ?? 0;
    const maxMonthlyIncome = solveMaxMonthlyIncome(model, rawBurnStart, model.retirementAge);

    renderKPIs({
      dom,
      model,
      simulation,
      optimalRetirementAge,
      maxMonthlyIncome,
      formatCurrency
    });

    // Market variability (Phase 4): opt-in, off by default. When off, the charts and
    // KPIs below get no `band`/probability data at all, so this path renders exactly
    // as it did before Phase 4 — the deterministic simulation above is untouched.
    const includeMarketVariability = !!(dom.toggleMarketVariability && dom.toggleMarketVariability.checked);
    let accumBand;
    let burnBand;
    let probabilityOfSuccess = null;

    if (includeMarketVariability) {
      const returnStdev = parseFloat(dom.returnStdevInput.value) || 0;
      const monteCarlo = runMonteCarloSimulation(model, model.retirementAge, 300, returnStdev);
      accumBand = discountBand(
        monteCarlo.percentileBands.slice(0, monteCarlo.accumYears + 1),
        simulation.currentAge, simulation.inflation, isDiscounted
      );
      burnBand = discountBand(
        monteCarlo.percentileBands.slice(monteCarlo.accumYears),
        simulation.currentAge, simulation.inflation, isDiscounted
      );
      probabilityOfSuccess = monteCarlo.probabilityOfSuccess;
    }

    if (dom.kpiProbabilityCard) {
      dom.kpiProbabilityCard.style.display = includeMarketVariability ? 'flex' : 'none';
      if (dom.kpiProbabilitySuccess && probabilityOfSuccess !== null) {
        dom.kpiProbabilitySuccess.textContent = `${probabilityOfSuccess.toFixed(0)}%`;
      }
    }

    renderAccumChart(simulation.processedAccum, dom, formatCurrency, accumBand);
    renderBurnChart(simulation.processedBurn, dom, formatCurrency, burnBand);

    renderLedger(
      simulation.processedAccum,
      simulation.processedBurn,
      model.retirementAge,
      dom.ledgerTbody,
      formatCurrency
    );
  }

  const allInputs = [
    dom.currentAgeInput,
    dom.retirementAgeInput,
    dom.lifeExpectancyInput,
    dom.pretaxBalanceInput,
    dom.pretaxMonthlyInput,
    dom.employerMatchRateInput,
    dom.rothBalanceInput,
    dom.rothMonthlyInput,
    dom.taxableBalanceInput,
    dom.taxableMonthlyInput,
    dom.taxableUnrealizedGainsInput,
    dom.taxableHysaBalanceInput,
    dom.taxableHysaMonthlyInput,
    dom.retirementIncomeInput,
    dom.socialSecurityInput,
    dom.ssClaimAgeInput,
    dom.preReturnInput,
    dom.postReturnInput,
    dom.inflationRateInput,
    dom.taxRateInput,
    dom.capitalGainsRateInput,
    dom.earlyWithdrawalPenaltyInput
  ];

  allInputs.forEach(input => {
    input.addEventListener('input', calculateAll);
    input.addEventListener('change', calculateAll);
  });

  [dom.taxableHysaCompoundInput, dom.taxableHysaRateInput].forEach(input => {
    input.addEventListener('change', calculateAll);
    input.addEventListener('input', calculateAll);
  });

  dom.togglePurchasingPower.addEventListener('change', calculateAll);

  if (dom.toggleMarketVariability) dom.toggleMarketVariability.addEventListener('change', calculateAll);
  if (dom.returnStdevInput) {
    dom.returnStdevInput.addEventListener('input', calculateAll);
    dom.returnStdevInput.addEventListener('change', calculateAll);
  }

  // "Clear example data": the balance/monthly fields ship pre-filled with a
  // plausible example scenario so first load shows real charts instead of an
  // empty page. This zeroes just those fields — ages, rates and goals are left
  // as-is since they're reasonable defaults regardless of whose numbers these are.
  const btnClearExample = document.getElementById('btn-clear-example');
  const exampleDataBanner = document.getElementById('example-data-banner');
  const exampleFieldInputs = [
    dom.pretaxBalanceInput, dom.pretaxMonthlyInput, dom.employerMatchRateInput,
    dom.rothBalanceInput, dom.rothMonthlyInput,
    dom.taxableBalanceInput, dom.taxableMonthlyInput, dom.taxableUnrealizedGainsInput,
    dom.taxableHysaBalanceInput, dom.taxableHysaMonthlyInput
  ];
  if (btnClearExample && exampleDataBanner) {
    btnClearExample.addEventListener('click', () => {
      exampleFieldInputs.forEach(input => {
        input.value = 0;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      exampleDataBanner.remove();
    });
  }

  // Shared modal wiring for Quick Start and Features: open/close, backdrop click,
  // Escape, a focus trap while open, and returning focus to whatever triggered the
  // modal when it closes (Escape previously closed the modal but left focus stranded
  // wherever it was, and Tab could escape the dialog entirely).
  function setupModal(openBtn, modal, closeBtn) {
    if (!openBtn || !modal) return;
    let previouslyFocused = null;

    const getFocusable = () => Array.from(
      modal.querySelectorAll('a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ).filter(el => el.offsetParent !== null);

    const openModal = () => {
      previouslyFocused = document.activeElement;
      modal.style.display = 'flex';
      modal.classList.remove('hidden');
      modal.setAttribute('aria-hidden', 'false');
      (closeBtn || getFocusable()[0])?.focus();
    };

    const closeModal = () => {
      modal.style.display = 'none';
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
      if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
        previouslyFocused.focus();
      }
    };

    openBtn.addEventListener('click', openModal);
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (modal.classList.contains('hidden')) return;
      if (e.key === 'Escape') {
        closeModal();
        return;
      }
      if (e.key === 'Tab') {
        const focusable = getFocusable();
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
  }

  setupModal(
    document.getElementById('btn-open-quickstart'),
    document.getElementById('quickstart-modal'),
    document.getElementById('btn-close-quickstart')
  );
  setupModal(
    document.getElementById('btn-open-features'),
    document.getElementById('features-modal'),
    document.getElementById('btn-close-features')
  );
  setupModal(
    document.getElementById('btn-open-scenarios'),
    document.getElementById('scenarios-modal'),
    document.getElementById('btn-close-scenarios')
  );

  // --- Scenarios: save/load/delete, compare, share link, CSV export ---

  function renderSavedScenariosList() {
    const listEl = document.getElementById('saved-scenarios-list');
    if (!listEl) return;
    const scenarios = listSavedScenarios();
    listEl.textContent = '';

    if (scenarios.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText = 'font-size: 0.8rem; opacity: 0.6;';
      empty.textContent = 'No saved scenarios yet.';
      listEl.appendChild(empty);
      return;
    }

    scenarios.forEach(sc => {
      const row = document.createElement('div');
      row.style.cssText = 'display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.5rem 0.75rem; border-radius: 8px; background: rgba(255,255,255,0.04); flex-wrap: wrap;';

      const label = document.createElement('div');
      label.style.cssText = 'font-size: 0.85rem;';
      const nameSpan = document.createElement('strong');
      nameSpan.textContent = sc.name;
      const dateSpan = document.createElement('span');
      dateSpan.style.cssText = 'opacity: 0.6; font-size: 0.75rem; margin-left: 0.5rem;';
      const savedDate = new Date(sc.savedAt);
      dateSpan.textContent = isNaN(savedDate.getTime()) ? '' : savedDate.toLocaleDateString();
      label.appendChild(nameSpan);
      label.appendChild(dateSpan);

      const btnRow = document.createElement('div');
      btnRow.style.cssText = 'display: flex; gap: 0.4rem;';

      const loadBtn = document.createElement('button');
      loadBtn.type = 'button';
      loadBtn.className = 'btn-back';
      loadBtn.textContent = 'Load';
      loadBtn.addEventListener('click', () => {
        writeScenarioToForm(sc.data);
        const banner = document.getElementById('example-data-banner');
        if (banner) banner.remove();
        const statusEl = document.getElementById('scenario-save-status');
        if (statusEl) {
          statusEl.style.color = 'var(--color-success, #10b981)';
          statusEl.textContent = `Loaded "${sc.name}".`;
          setTimeout(() => { statusEl.textContent = ''; }, 3000);
        }
      });

      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn-back';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', () => {
        deleteScenario(sc.id);
        renderSavedScenariosList();
        renderCompareOptions();
      });

      btnRow.appendChild(loadBtn);
      btnRow.appendChild(deleteBtn);
      row.appendChild(label);
      row.appendChild(btnRow);
      listEl.appendChild(row);
    });
  }

  function renderCompareOptions() {
    const selA = document.getElementById('compare-select-a');
    const selB = document.getElementById('compare-select-b');
    if (!selA || !selB) return;
    const scenarios = listSavedScenarios();
    const prevA = selA.value;
    const prevB = selB.value;

    const buildOptions = (select) => {
      select.textContent = '';
      const currentOpt = document.createElement('option');
      currentOpt.value = 'current';
      currentOpt.textContent = 'Current (live form)';
      select.appendChild(currentOpt);
      scenarios.forEach(sc => {
        const opt = document.createElement('option');
        opt.value = sc.id;
        opt.textContent = sc.name;
        select.appendChild(opt);
      });
    };
    buildOptions(selA);
    buildOptions(selB);

    const hasOption = (select, value) => Array.from(select.options).some(o => o.value === value);
    if (hasOption(selA, prevA)) selA.value = prevA;
    if (scenarios.length > 0) {
      selB.value = hasOption(selB, prevB) ? prevB : scenarios[scenarios.length - 1].id;
    }
  }

  function getModelForCompareValue(value) {
    if (value === 'current') return toModel(dom);
    const found = listSavedScenarios().find(sc => sc.id === value);
    return found ? modelFromRawValues(found.data) : null;
  }

  function computeCompareSummary(model) {
    const isDiscounted = dom.togglePurchasingPower.checked;
    const sim = runRetirementSimulation(model, model.retirementAge, isDiscounted);
    const optimal = solveOptimalRetirementAge(model);
    const maxIncome = solveMaxMonthlyIncome(model, sim.burnData[0]?.total ?? 0, model.retirementAge);
    return {
      peakVal: sim.processedAccum[sim.processedAccum.length - 1].total,
      optimalAge: optimal ? optimal.age : null,
      optimalType: optimal ? optimal.type : null,
      maxIncome,
      shortfallAge: sim.shortfallAge
    };
  }

  const btnSaveScenario = document.getElementById('btn-save-scenario');
  const scenarioNameInput = document.getElementById('scenario-name-input');
  const scenarioSaveStatus = document.getElementById('scenario-save-status');
  if (btnSaveScenario && scenarioNameInput && scenarioSaveStatus) {
    btnSaveScenario.addEventListener('click', () => {
      const name = scenarioNameInput.value.trim() || 'Untitled scenario';
      const entry = saveScenario(name, readScenarioFromForm());
      if (entry) {
        scenarioNameInput.value = '';
        scenarioSaveStatus.style.color = 'var(--color-success, #10b981)';
        scenarioSaveStatus.textContent = `Saved "${entry.name}".`;
        renderSavedScenariosList();
        renderCompareOptions();
      } else {
        scenarioSaveStatus.style.color = 'var(--color-warning, #b45309)';
        scenarioSaveStatus.textContent = 'Could not save — your browser storage may be full or disabled.';
      }
      setTimeout(() => { scenarioSaveStatus.textContent = ''; }, 4000);
    });
  }

  const btnCompareScenarios = document.getElementById('btn-compare-scenarios');
  if (btnCompareScenarios) {
    btnCompareScenarios.addEventListener('click', () => {
      const resultsEl = document.getElementById('compare-results');
      if (!resultsEl) return;
      const modelA = getModelForCompareValue(document.getElementById('compare-select-a').value);
      const modelB = getModelForCompareValue(document.getElementById('compare-select-b').value);
      resultsEl.textContent = '';
      if (!modelA || !modelB) {
        resultsEl.textContent = 'Could not load one of the selected scenarios.';
        return;
      }

      const a = computeCompareSummary(modelA);
      const b = computeCompareSummary(modelB);
      const fmtAge = (s) => s.optimalAge ? `${s.optimalAge}${s.optimalType === 'shortfall' ? ' (still short)' : ''}` : '—';
      const fmtStatus = (s) => s.shortfallAge === null ? 'Fully Funded' : `Shortfall at Age ${s.shortfallAge}`;

      const rows = [
        ['Peak Portfolio Value', formatCurrency(a.peakVal), formatCurrency(b.peakVal)],
        ['Optimal Retirement Age', fmtAge(a), fmtAge(b)],
        ['Max Monthly Income', a.maxIncome ? formatCurrency(a.maxIncome) + '/mo' : '—', b.maxIncome ? formatCurrency(b.maxIncome) + '/mo' : '—'],
        ['Status', fmtStatus(a), fmtStatus(b)]
      ];

      const table = document.createElement('table');
      table.style.cssText = 'width: 100%; border-collapse: collapse; font-size: 0.85rem;';
      rows.forEach(([label, valA, valB]) => {
        const tr = document.createElement('tr');
        [label, valA, valB].forEach((text, i) => {
          const cell = document.createElement('td');
          cell.textContent = text;
          cell.style.cssText = 'padding: 0.4rem 0.5rem; border-bottom: 1px solid rgba(255,255,255,0.08);' +
            (i === 0 ? ' opacity: 0.75;' : ' text-align: right; font-weight: 600;');
          tr.appendChild(cell);
        });
        table.appendChild(tr);
      });
      resultsEl.appendChild(table);
    });
  }

  const btnCopyShareLink = document.getElementById('btn-copy-share-link');
  const shareLinkStatus = document.getElementById('share-link-status');
  if (btnCopyShareLink && shareLinkStatus) {
    btnCopyShareLink.addEventListener('click', () => {
      const hash = encodeScenarioToHash(readScenarioFromForm());
      const url = `${window.location.origin}${window.location.pathname}#${hash}`;
      const showFallback = () => {
        shareLinkStatus.style.color = 'var(--color-warning, #b45309)';
        shareLinkStatus.textContent = url;
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(url).then(() => {
          shareLinkStatus.style.color = 'var(--color-success, #10b981)';
          shareLinkStatus.textContent = 'Link copied to clipboard!';
          setTimeout(() => { shareLinkStatus.textContent = ''; }, 5000);
        }).catch(showFallback);
      } else {
        showFallback();
      }
    });
  }

  const btnExportCsv = document.getElementById('btn-export-csv');
  if (btnExportCsv) {
    btnExportCsv.addEventListener('click', () => {
      const model = toModel(dom);
      const isDiscounted = dom.togglePurchasingPower.checked;
      const sim = runRetirementSimulation(model, model.retirementAge, isDiscounted);
      const csv = buildLedgerCsv(sim.processedAccum, sim.processedBurn, model.retirementAge);
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `retirement-forecast-age-${model.currentAge}-to-${model.lifeExpectancy}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });
  }

  renderSavedScenariosList();
  renderCompareOptions();

  // "How this calculator works" link: force the details drawer open before the
  // browser's default anchor jump, since auto-expanding a closed <details> on
  // anchor navigation isn't consistently supported across browsers.
  const methodologyLink = document.querySelector('a[href="#methodology-drawer"]');
  const methodologyDrawer = document.getElementById('methodology-drawer');
  if (methodologyLink && methodologyDrawer) {
    methodologyLink.addEventListener('click', () => {
      methodologyDrawer.open = true;
    });
  }

  // If the page was opened via a "Copy Share Link" URL, pre-fill the form from the
  // scenario packed into the hash before the first render, and drop the example-data
  // banner since real (or at least intentionally shared) numbers are now in play.
  const sharedScenario = decodeScenarioFromHash(window.location.hash);
  if (sharedScenario) {
    writeScenarioToForm(sharedScenario);
    const exampleBanner = document.getElementById('example-data-banner');
    if (exampleBanner) exampleBanner.remove();
  }

  calculateAll();
});

