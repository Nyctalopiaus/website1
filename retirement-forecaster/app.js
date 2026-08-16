import { getDomRefs, toModel } from './dom.js';
import { formatCurrency } from './formatters.js';
import { runRetirementSimulation, solveOptimalRetirementAge, solveMaxMonthlyIncome } from './simulation.js';
import { renderAccumChart, renderBurnChart } from './charts.js';
import { renderKPIs, syncLabels, updatePurchasingPowerUI } from './kpi.js';
import { renderLedger } from './ledger.js';

document.addEventListener('DOMContentLoaded', () => {
  const dom = getDomRefs();

  let burnData = [];

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
      burnDataRaw: burnData,
      optimalRetirementAge,
      maxMonthlyIncome,
      formatCurrency
    });

    renderAccumChart(simulation.processedAccum, dom, formatCurrency);
    renderBurnChart(simulation.processedBurn, dom, formatCurrency, {
      socialSecurityMonthly: model.socialSecurityMonthly,
      desiredIncome: model.desiredIncome,
      inflation: simulation.inflation,
      currentAge: simulation.currentAge,
      isDiscounted
    });

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
    dom.taxableHysaBalanceInput,
    dom.taxableHysaMonthlyInput,
    dom.retirementIncomeInput,
    dom.socialSecurityInput,
    dom.preReturnInput,
    dom.postReturnInput,
    dom.inflationRateInput,
    dom.taxRateInput
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

  // Quick Start Modal Toggle
  const btnOpenQuickstart = document.getElementById('btn-open-quickstart');
  const quickstartModal = document.getElementById('quickstart-modal');
  const btnCloseQuickstart = document.getElementById('btn-close-quickstart');

  if (btnOpenQuickstart && quickstartModal) {
    const openQsModal = () => {
      quickstartModal.style.display = 'flex';
      quickstartModal.classList.remove('hidden');
      quickstartModal.setAttribute('aria-hidden', 'false');
    };
    const closeQsModal = () => {
      quickstartModal.style.display = 'none';
      quickstartModal.classList.add('hidden');
      quickstartModal.setAttribute('aria-hidden', 'true');
    };

    btnOpenQuickstart.addEventListener('click', openQsModal);
    if (btnCloseQuickstart) btnCloseQuickstart.addEventListener('click', closeQsModal);
    quickstartModal.addEventListener('click', (e) => {
      if (e.target === quickstartModal) closeQsModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !quickstartModal.classList.contains('hidden')) {
        closeQsModal();
      }
    });
  }

  // Features Modal Toggle
  const btnOpenFeatures = document.getElementById('btn-open-features');
  const featuresModal = document.getElementById('features-modal');
  const btnCloseFeatures = document.getElementById('btn-close-features');

  if (btnOpenFeatures && featuresModal) {
    const openFeaturesModal = () => {
      featuresModal.style.display = 'flex';
      featuresModal.classList.remove('hidden');
      featuresModal.setAttribute('aria-hidden', 'false');
    };
    const closeFeaturesModal = () => {
      featuresModal.style.display = 'none';
      featuresModal.classList.add('hidden');
      featuresModal.setAttribute('aria-hidden', 'true');
    };

    btnOpenFeatures.addEventListener('click', openFeaturesModal);
    if (btnCloseFeatures) btnCloseFeatures.addEventListener('click', closeFeaturesModal);
    featuresModal.addEventListener('click', (e) => {
      if (e.target === featuresModal) closeFeaturesModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !featuresModal.classList.contains('hidden')) {
        closeFeaturesModal();
      }
    });
  }

  calculateAll();
});

