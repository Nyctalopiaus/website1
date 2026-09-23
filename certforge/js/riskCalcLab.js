// Risk Calc Lab: AI-Integrated Quantitative Risk & Calculation PBQ Engine
// Covers SLE, ALE, ARO, ROSI, Net Benefit, AV, EF, and BIA Timeline Metrics (RTO, RPO, MTD, WRT)

import { escapeHtml, ICON_SPARKLE } from './config.js';
import { getGeminiApiKey, getGeminiModel } from './vault.js';
import { callGeminiAPI } from './ai.js';
import { getExamName } from './state.js';

// Pre-defined scenario templates with parametric scaling
const SCENARIO_TEMPLATES = [
  {
    id: 'datacenter_flood',
    title: 'Enterprise Datacenter Water Intrusion',
    assetName: 'Primary Datacenter Infrastructure',
    domain: 'Information Risk Management',
    description: 'A major financial services firm operates a primary datacenter valued at ${AV}. Risk assessments indicate a major water intrusion event has an exposure factor (EF) of {EF_pct}%. Historical climate and flood plain data show this event occurs once every {ARO_years} years.',
    controlName: 'Subterranean Sump Pumps & Water Barriers',
    controlCostPerYear: '{COST}',
    mitigatedEfPct: '{MIT_EF_pct}',
    mitigatedAroYears: '{MIT_ARO_years}'
  },
  {
    id: 'ransomware_attack',
    title: 'Critical Database Ransomware Incident',
    assetName: 'Core ERP & Customer Database Cluster',
    domain: 'Information Risk Management',
    description: 'A healthcare system relies on a central database cluster with an asset value (AV) of ${AV}. A ransomware infection is estimated to cause a {EF_pct}% loss of operational capacity and regulatory fines. Threat intelligence indicates this attack vector occurs {ARO_freq} times per year.',
    controlName: 'Immutable Air-Gapped Backups & EDR Security',
    controlCostPerYear: '{COST}',
    mitigatedEfPct: '{MIT_EF_pct}',
    mitigatedAroYears: '{MIT_ARO_years}'
  },
  {
    id: 'ddos_ecommerce',
    title: 'E-Commerce Platform Volumetric DDoS',
    assetName: 'Public Web Checkout Portal',
    domain: 'Information Security Incident Management',
    description: 'An online retailer generates high-volume revenues through a web checkout portal valued at ${AV}. A DDoS attack is estimated to cause an exposure factor (EF) of {EF_pct}% due to lost customer transactions. Industry telemetry records an occurrence rate of {ARO_freq} times per year.',
    controlName: 'Cloud-Based Scrubbing & Web Application Firewall (WAF)',
    controlCostPerYear: '{COST}',
    mitigatedEfPct: '{MIT_EF_pct}',
    mitigatedAroYears: '{MIT_ARO_years}'
  },
  {
    id: 'insider_data_breach',
    title: 'Insider Data Exfiltration Risk',
    assetName: 'Proprietary IP & R&D Repository',
    domain: 'Information Security Governance',
    description: 'A technology firm values its confidential research database at ${AV}. An unauthorized insider exfiltration incident carries an estimated exposure factor of {EF_pct}%. Based on internal audit records, such incidents occur once every {ARO_years} years.',
    controlName: 'Data Loss Prevention (DLP) & User Activity Monitoring',
    controlCostPerYear: '{COST}',
    mitigatedEfPct: '{MIT_EF_pct}',
    mitigatedAroYears: '{MIT_ARO_years}'
  },
  {
    id: 'cloud_api_outage',
    title: 'SaaS API Integration Outage',
    assetName: 'Payment Processing Microservices',
    domain: 'Information Security Program Management',
    description: 'A fintech firm processes client transactions through microservices valued at ${AV}. An unmitigated service disruption results in a {EF_pct}% exposure factor. Historical vendor reliability metrics indicate this failure occurs {ARO_freq} times per year.',
    controlName: 'Multi-Region Redundant Cloud Failover',
    controlCostPerYear: '{COST}',
    mitigatedEfPct: '{MIT_EF_pct}',
    mitigatedAroYears: '{MIT_ARO_years}'
  }
];

// Active State
let currentRiskScenario = null;
let activeMetricFilter = 'all'; // 'all', 'sle', 'ale', 'aro', 'rosi', 'bia'
let activeLabMode = 'drill'; // 'drill', 'table', 'concept', 'decision'
let userAnswers = {};
let checkedResults = null;
let currentHintStep = 0;

// Format helper
function formatCurrency(val) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
}

function formatPercent(val) {
  return `${(val * 100).toFixed(1).replace(/\.0$/, '')}%`;
}

function parseNumericInput(val) {
  if (val === null || val === undefined) return NaN;
  const str = String(val).replace(/[\$,%\s]/g, '').trim();
  return parseFloat(str);
}

// Generate algorithmic parameters
export function generateRiskScenario(filterMetric = 'all', mode = 'drill') {
  currentHintStep = 0;
  checkedResults = null;
  userAnswers = {};

  const isBia = filterMetric === 'bia';

  if (isBia) {
    // Generate BIA Timeline parameters
    const mtdHours = Math.floor(Math.random() * 36) + 12; // 12h to 48h
    const rtoHours = Math.floor(mtdHours * (0.3 + Math.random() * 0.4)); // 30-70% of MTD
    const wrtHours = Math.floor(mtdHours * (0.2 + Math.random() * 0.3)); // 20-50% of MTD
    const totalRecovery = rtoHours + wrtHours;
    const meetsMtd = totalRecovery <= mtdHours;
    const rpoHours = [1, 2, 4, 12, 24][Math.floor(Math.random() * 5)];

    currentRiskScenario = {
      type: 'bia',
      title: 'Business Impact Analysis (BIA) Timeline Evaluation',
      assetName: 'Core Transaction Engine',
      mtd: mtdHours,
      rto: rtoHours,
      wrt: wrtHours,
      rpo: rpoHours,
      totalRecovery,
      meetsMtd,
      description: `During a Business Impact Analysis (BIA) review, executive management establishes a Maximum Tolerable Downtime (MTD) of <strong>${mtdHours} hours</strong> for the Core Transaction Engine. Technical engineering teams determine that system restoration requires a Recovery Time Objective (RTO) of <strong>${rtoHours} hours</strong> and a Work Recovery Time (WRT) of <strong>${wrtHours} hours</strong>. Automated database transaction logs are backed up every <strong>${rpoHours} hours</strong>.`
    };
    return currentRiskScenario;
  }

  // Pick template
  const tmpl = SCENARIO_TEMPLATES[Math.floor(Math.random() * SCENARIO_TEMPLATES.length)];

  // Randomized core variables
  const av = Math.floor((Math.random() * 45 + 5) * 100000); // $500,000 to $5,000,000
  const efDec = (Math.floor(Math.random() * 12) + 4) * 0.05; // 0.20 to 0.75
  const efPct = Math.round(efDec * 100);

  // ARO frequency or year interval
  const isInterval = Math.random() > 0.4;
  let aroYears = 1;
  let aroFreq = 1;
  let aroDec = 1;

  if (isInterval) {
    aroYears = Math.floor(Math.random() * 5) + 2; // 2 to 6 years
    aroDec = parseFloat((1 / aroYears).toFixed(3));
  } else {
    aroFreq = Math.floor(Math.random() * 3) + 2; // 2 to 4 times per year
    aroDec = aroFreq;
  }

  const sle = av * efDec;
  const alePrior = sle * aroDec;

  // Safeguard parameters
  const mitEfDec = parseFloat((efDec * (0.15 + Math.random() * 0.25)).toFixed(3)); // 15-40% of original EF
  const mitEfPct = Math.round(mitEfDec * 100);
  const alePost = av * mitEfDec * aroDec;
  const deltaAle = alePrior - alePost;

  // Cost designed to produce realistic positive or negative ROSI
  const isPositiveRosi = Math.random() > 0.3; // 70% positive ROSI
  const roiMultiplier = isPositiveRosi ? (0.25 + Math.random() * 0.65) : (1.15 + Math.random() * 0.5);
  const safeguardCost = Math.round((deltaAle * roiMultiplier) / 1000) * 1000 || 5000;
  const netBenefit = deltaAle - safeguardCost;
  const rosiPct = parseFloat(((deltaAle - safeguardCost) / safeguardCost * 100).toFixed(1));

  // Determine correct CISM risk strategy
  let recommendedStrategy = 'Mitigate';
  if (rosiPct < 0) {
    recommendedStrategy = 'Accept'; // Cost exceeds benefit
  } else if (av > 3000000 && rosiPct > 50) {
    recommendedStrategy = 'Mitigate';
  }

  // Populate dynamic text
  let desc = tmpl.description
    .replace('{AV}', av.toLocaleString())
    .replace('{EF_pct}', efPct)
    .replace('{ARO_years}', aroYears)
    .replace('{ARO_freq}', aroFreq);

  currentRiskScenario = {
    type: 'financial',
    templateId: tmpl.id,
    title: tmpl.title,
    assetName: tmpl.assetName,
    domain: tmpl.domain,
    description: desc,
    controlName: tmpl.controlName,
    controlCost: safeguardCost,
    av,
    ef: efDec,
    efPct,
    aro: aroDec,
    aroYears: isInterval ? aroYears : null,
    aroFreq: !isInterval ? aroFreq : null,
    sle,
    alePrior,
    mitEf: mitEfDec,
    mitEfPct,
    alePost,
    deltaAle,
    netBenefit,
    rosiPct,
    recommendedStrategy
  };

  return currentRiskScenario;
}

// Check answers and run diagnostic analysis
export function checkRiskAnswers(inputs) {
  if (!currentRiskScenario) return null;

  const results = {
    isCorrectAll: true,
    fieldResults: {},
    diagnostics: [],
    scenario: currentRiskScenario
  };

  if (currentRiskScenario.type === 'bia') {
    // Check BIA Timeline
    const totalInput = parseNumericInput(inputs.totalRecovery);
    const mtdDecision = inputs.mtdDecision;

    const totalCorrect = Math.abs(totalInput - currentRiskScenario.totalRecovery) < 0.5;
    const decisionCorrect = mtdDecision === (currentRiskScenario.meetsMtd ? 'Pass' : 'Fail');

    results.fieldResults.totalRecovery = {
      userVal: totalInput,
      targetVal: currentRiskScenario.totalRecovery,
      isCorrect: totalCorrect
    };
    results.fieldResults.mtdDecision = {
      userVal: mtdDecision,
      targetVal: currentRiskScenario.meetsMtd ? 'Pass' : 'Fail',
      isCorrect: decisionCorrect
    };

    if (!totalCorrect) {
      results.isCorrectAll = false;
      results.diagnostics.push(`Total Recovery Time is calculated as RTO (${currentRiskScenario.rto}h) + WRT (${currentRiskScenario.wrt}h) = ${currentRiskScenario.totalRecovery}h.`);
    }
    if (!decisionCorrect) {
      results.isCorrectAll = false;
      results.diagnostics.push(`MTD Compliance Rule: System meets MTD if (RTO + WRT <= MTD). Here, ${currentRiskScenario.totalRecovery}h vs MTD ${currentRiskScenario.mtd}h.`);
    }

    checkedResults = results;
    return results;
  }

  // Financial Metrics Checks
  const sc = currentRiskScenario;

  // Depending on mode/filter, evaluate fields
  if (inputs.sle !== undefined && inputs.sle !== '') {
    const val = parseNumericInput(inputs.sle);
    const isOk = Math.abs(val - sc.sle) / sc.sle < 0.02; // 2% tolerance
    results.fieldResults.sle = { userVal: val, targetVal: sc.sle, isCorrect: isOk };
    if (!isOk) {
      results.isCorrectAll = false;
      if (Math.abs(val - sc.av * sc.efPct) < 5) {
        results.diagnostics.push(`Diagnostic: You forgot to convert ${sc.efPct}% to a decimal! Exposure Factor (EF) must be divided by 100 (${sc.efPct}% -> ${sc.ef}). SLE = AV * EF.`);
      } else if (Math.abs(val - (sc.av / sc.ef)) < 100) {
        results.diagnostics.push(`Diagnostic: You divided Asset Value by EF instead of multiplying. Formula: SLE = AV * EF.`);
      } else if (Math.abs(val - sc.alePrior) < 100) {
        results.diagnostics.push(`Diagnostic: You calculated ALE instead of SLE! Multiply AV * EF for SLE first, then multiply by ARO for ALE.`);
      } else {
        results.diagnostics.push(`SLE Check: SLE = Asset Value ($${sc.av.toLocaleString()}) * Exposure Factor (${sc.efPct}% = ${sc.ef}) = $${sc.sle.toLocaleString()}.`);
      }
    }
  }

  if (inputs.ale !== undefined && inputs.ale !== '') {
    const val = parseNumericInput(inputs.ale);
    const isOk = Math.abs(val - sc.alePrior) / sc.alePrior < 0.02;
    results.fieldResults.ale = { userVal: val, targetVal: sc.alePrior, isCorrect: isOk };
    if (!isOk) {
      results.isCorrectAll = false;
      if (sc.aroYears && Math.abs(val - (sc.sle * sc.aroYears)) < 100) {
        results.diagnostics.push(`Diagnostic: Event happens once every ${sc.aroYears} years, so ARO is 1 / ${sc.aroYears} = ${sc.aro.toFixed(3)}, NOT ${sc.aroYears}! ALE = SLE * (1 / ${sc.aroYears}).`);
      } else if (Math.abs(val - sc.sle) < 100) {
        results.diagnostics.push(`Diagnostic: You entered SLE instead of ALE. Remember ALE = SLE * ARO.`);
      } else {
        results.diagnostics.push(`ALE Check: ALE = Single Loss Expectancy ($${sc.sle.toLocaleString()}) * Annualized Rate of Occurrence (${sc.aro}) = $${sc.alePrior.toLocaleString()}.`);
      }
    }
  }

  if (inputs.rosi !== undefined && inputs.rosi !== '') {
    const val = parseNumericInput(inputs.rosi);
    const isOk = Math.abs(val - sc.rosiPct) < 2.5 || Math.abs(val - (sc.rosiPct / 100)) < 0.03;
    results.fieldResults.rosi = { userVal: val, targetVal: sc.rosiPct, isCorrect: isOk };
    if (!isOk) {
      results.isCorrectAll = false;
      if (Math.abs(val - ((sc.deltaAle) / sc.controlCost * 100)) < 2.5) {
        results.diagnostics.push(`Diagnostic: In ROSI numerator, you forgot to subtract the annual safeguard cost ($${sc.controlCost.toLocaleString()})! Formula: [(Risk Mitigated - Safeguard Cost) / Safeguard Cost] * 100.`);
      } else {
        results.diagnostics.push(`ROSI Check: ROSI = [($${sc.deltaAle.toLocaleString()} mitigated - $${sc.controlCost.toLocaleString()} cost) / $${sc.controlCost.toLocaleString()}] * 100 = ${sc.rosiPct}%.`);
      }
    }
  }

  if (inputs.strategy !== undefined && inputs.strategy !== '') {
    const isOk = inputs.strategy === sc.recommendedStrategy;
    results.fieldResults.strategy = { userVal: inputs.strategy, targetVal: sc.recommendedStrategy, isCorrect: isOk };
    if (!isOk) {
      results.isCorrectAll = false;
      results.diagnostics.push(`Managerial Strategy Lens: ROSI is ${sc.rosiPct}%. ${sc.rosiPct < 0 ? 'Since cost exceeds annual loss savings, management should ACCEPT or TRANSFER risk.' : 'Since ROSI is positive, the control pays for itself and management should MITIGATE risk.'}`);
    }
  }

  checkedResults = results;
  return results;
}

// Render Risk Lab UI Container
export function renderRiskLabUI(containerEl) {
  if (!containerEl) return;

  if (!currentRiskScenario) {
    generateRiskScenario(activeMetricFilter, activeLabMode);
  }

  const sc = currentRiskScenario;

  containerEl.innerHTML = `
    <div class="risk-lab-panel">
      <!-- Header Toolbar -->
      <div class="risk-lab-header">
        <div class="risk-lab-title-block">
          <h2><svg class="icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> Quantitative Risk & Calculation Lab</h2>
          <span class="hud-tag">CISM // CISSP // Security+ Master Engine</span>
        </div>
        <div class="risk-lab-controls">
          <div class="filter-group">
            <label for="risk-metric-select">Metric Focus:</label>
            <select id="risk-metric-select" class="hud-select">
              <option value="all" ${activeMetricFilter === 'all' ? 'selected' : ''}>All Metrics (Mixed)</option>
              <option value="sle" ${activeMetricFilter === 'sle' ? 'selected' : ''}>SLE (Single Loss)</option>
              <option value="ale" ${activeMetricFilter === 'ale' ? 'selected' : ''}>ALE (Annualized Loss)</option>
              <option value="rosi" ${activeMetricFilter === 'rosi' ? 'selected' : ''}>ROSI (Security ROI)</option>
              <option value="bia" ${activeMetricFilter === 'bia' ? 'selected' : ''}>BIA Timelines (RTO/RPO/MTD)</option>
            </select>
          </div>
          <div class="filter-group">
            <label for="risk-mode-select">Lab Mode:</label>
            <select id="risk-mode-select" class="hud-select">
              <option value="drill" ${activeLabMode === 'drill' ? 'selected' : ''}>Single Formula Drill</option>
              <option value="decision" ${activeLabMode === 'decision' ? 'selected' : ''}>Math + Risk Strategy</option>
              <option value="table" ${activeLabMode === 'table' ? 'selected' : ''}>Full Scenario Matrix Table</option>
            </select>
          </div>
          <button type="button" id="btn-risk-new-scenario" class="btn-hud btn-hud-accent">
            <svg class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg> New Scenario
          </button>
        </div>
      </div>

      <!-- Main Scenario Display Card -->
      <div class="risk-scenario-card">
        <div class="risk-scenario-header">
          <span class="badge-domain">${escapeHtml(sc.domain || 'Business Continuity & Risk')}</span>
          <h3 class="risk-scenario-title">${escapeHtml(sc.title)}</h3>
        </div>
        <div class="risk-scenario-body">
          <p class="risk-scenario-desc">${sc.description}</p>
          ${sc.type !== 'bia' ? `
            <div class="risk-countermeasure-box">
              <h4>🛡️ Proposed Countermeasure / Safeguard:</h4>
              <p><strong>${escapeHtml(sc.controlName)}</strong> — Cost: <strong>${formatCurrency(sc.controlCost)}/year</strong>. If implemented, reduces the exposure factor (EF) down to <strong>${sc.mitigatedEfPct}%</strong>.</p>
            </div>
          ` : ''}
        </div>
      </div>

      <!-- Interactive Input Fields & Visual Graph Grid -->
      <div class="risk-workspace-grid">
        <div class="risk-input-card">
          <h4 class="workspace-card-header">✍️ Enter Required Calculations:</h4>
          <form id="risk-calc-form" autocomplete="off" onsubmit="return false;">
            ${renderRiskInputFields(sc, activeLabMode)}
            
            <div class="risk-action-bar">
              <button type="button" id="btn-risk-check" class="btn-hud btn-hud-primary">Check Answers</button>
              <button type="button" id="btn-risk-hint" class="btn-hud btn-hud-secondary">💡 Hint (<span id="hint-count">${currentHintStep}</span>/3)</button>
              <button type="button" id="btn-toggle-scratchpad" class="btn-hud btn-hud-secondary">🧮 Scratchpad</button>
              <button type="button" id="btn-risk-ai-explain" class="btn-hud btn-hud-sparkle">
                ${ICON_SPARKLE} Ask AI Tutor
              </button>
            </div>
          </form>
        </div>

        <!-- Visual Risk Savings Graph & Formulas -->
        <div class="risk-side-card">
          <div class="risk-visual-chart-box">
            <h4>📊 Risk Mitigation Analysis Chart</h4>
            ${renderVisualSavingsChart(sc)}
          </div>
          
          <!-- Collapsible Quick Formula Reference Card -->
          <div class="risk-formula-ref-box">
            <h4>📐 Exam Formula Cheat Sheet</h4>
            <ul class="formula-list">
              <li><code>SLE = AV × EF</code></li>
              <li><code>ALE = SLE × ARO</code></li>
              <li><code>ROSI = [(ΔALE - Safeguard Cost) / Cost] × 100</code></li>
              <li><code>MTD ≥ RTO + WRT</code></li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Polished Floating Draggable HUD Calculator Modal -->
      <div id="risk-scratchpad-drawer" class="risk-scratchpad-drawer" hidden>
        <div class="scratchpad-header" id="risk-scratchpad-header" title="Click and drag to move calculator anywhere on screen">
          <span class="scratchpad-title"><svg class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg> HUD CALCULATOR <span class="drag-handle-tag">⋮⋮ DRAG</span></span>
          <button type="button" id="btn-close-scratchpad" class="btn-text-close" aria-label="Close calculator">&times;</button>
        </div>
        <div class="scratchpad-body">
          <div class="scratchpad-screen">
            <div class="scratchpad-history font-mono" id="scratchpad-history"></div>
            <div class="scratchpad-display font-mono" id="scratchpad-display">0</div>
          </div>
          <div class="scratchpad-shortcuts-row">
            <button type="button" class="sp-shortcut-btn" id="sp-btn-pct" title="Convert percentage to decimal (e.g. 25% -> 0.25)">% → Dec</button>
            <button type="button" class="sp-shortcut-btn" id="sp-btn-sle" title="Formula helper for Single Loss Expectancy">SLE = AV × EF</button>
            <button type="button" class="sp-shortcut-btn" id="sp-btn-ale" title="Formula helper for Annualized Loss Expectancy">ALE = SLE × ARO</button>
          </div>
          <div class="scratchpad-keypad">
            <button class="sp-key sp-clear" data-act="C">C</button>
            <button class="sp-key sp-back" data-act="BACK" title="Backspace">⌫</button>
            <button class="sp-key sp-op" data-act="/">÷</button>
            <button class="sp-key sp-op" data-act="*">×</button>

            <button class="sp-key" data-act="7">7</button>
            <button class="sp-key" data-act="8">8</button>
            <button class="sp-key" data-act="9">9</button>
            <button class="sp-key sp-op" data-act="-">-</button>

            <button class="sp-key" data-act="4">4</button>
            <button class="sp-key" data-act="5">5</button>
            <button class="sp-key" data-act="6">6</button>
            <button class="sp-key sp-op" data-act="+">+</button>

            <button class="sp-key" data-act="1">1</button>
            <button class="sp-key" data-act="2">2</button>
            <button class="sp-key" data-act="3">3</button>
            <button class="sp-key sp-equals" data-act="=">=</button>

            <button class="sp-key sp-zero" data-act="0" style="grid-column: span 2;">0</button>
            <button class="sp-key" data-act=".">.</button>
          </div>
        </div>
      </div>

      <!-- Progressive Hint Box -->
      <div id="risk-hint-container" class="risk-hint-box" hidden></div>

      <!-- Diagnostic Results Banner & Feedback -->
      <div id="risk-feedback-container" class="risk-feedback-box" hidden></div>

      <!-- AI Tutor Explanation Container -->
      <div id="risk-ai-response-container" class="risk-ai-response-box" hidden></div>
    </div>
  `;

  attachRiskLabEventListeners(containerEl);
}

// Sub-renderers for inputs and visual chart
function renderRiskInputFields(sc, mode) {
  if (sc.type === 'bia') {
    return `
      <div class="risk-input-group">
        <label for="input-total-recovery">1. Calculate Total System Recovery Time (RTO + WRT):</label>
        <div class="input-with-suffix">
          <input type="number" id="input-total-recovery" class="hud-input font-mono" placeholder="e.g. 18" />
          <span class="unit-tag">Hours</span>
        </div>
      </div>
      <div class="risk-input-group">
        <label for="input-mtd-decision">2. Does this system architecture satisfy executive MTD (${sc.mtd}h)?</label>
        <select id="input-mtd-decision" class="hud-select">
          <option value="">-- Choose Decision --</option>
          <option value="Pass">Pass (Compliant with MTD)</option>
          <option value="Fail">Fail (Breaches MTD Limit)</option>
        </select>
      </div>
    `;
  }

  let html = '';

  if (activeMetricFilter === 'sle' || activeMetricFilter === 'all') {
    html += `
      <div class="risk-input-group">
        <label for="input-sle">Single Loss Expectancy (SLE):</label>
        <div class="input-with-suffix">
          <span class="unit-tag-left">$</span>
          <input type="text" id="input-sle" class="hud-input font-mono" placeholder="e.g. 250,000" />
        </div>
      </div>
    `;
  }

  if (activeMetricFilter === 'ale' || activeMetricFilter === 'all' || mode === 'table') {
    html += `
      <div class="risk-input-group">
        <label for="input-ale">Annualized Loss Expectancy (ALE):</label>
        <div class="input-with-suffix">
          <span class="unit-tag-left">$</span>
          <input type="text" id="input-ale" class="hud-input font-mono" placeholder="e.g. 50,000" />
        </div>
      </div>
    `;
  }

  if (activeMetricFilter === 'rosi' || activeMetricFilter === 'all' || mode === 'table') {
    html += `
      <div class="risk-input-group">
        <label for="input-rosi">Return on Security Investment (ROSI %):</label>
        <div class="input-with-suffix">
          <input type="text" id="input-rosi" class="hud-input font-mono" placeholder="e.g. 45.5" />
          <span class="unit-tag">%</span>
        </div>
      </div>
    `;
  }

  if (mode === 'decision' || activeLabMode === 'decision') {
    html += `
      <div class="risk-input-group">
        <label for="input-strategy">CISM Governance Risk Treatment Recommendation:</label>
        <select id="input-strategy" class="hud-select">
          <option value="">-- Select Strategy --</option>
          <option value="Mitigate">Mitigate Risk (Implement Safeguard)</option>
          <option value="Accept">Accept Risk (Cost Exceeds Loss)</option>
          <option value="Transfer">Transfer Risk (Cyber Insurance)</option>
          <option value="Avoid">Avoid Risk (Terminate Activity)</option>
        </select>
      </div>
    `;
  }

  return html;
}

function renderVisualSavingsChart(sc) {
  if (sc.type === 'bia') {
    const rtoPct = Math.min(100, Math.round((sc.rto / sc.mtd) * 100));
    const wrtPct = Math.min(100 - rtoPct, Math.round((sc.wrt / sc.mtd) * 100));
    const isOver = sc.totalRecovery > sc.mtd;

    return `
      <div class="chart-wrapper">
        <div class="chart-label">MTD Limit: ${sc.mtd} Hours</div>
        <div class="bia-bar-container">
          <div class="bia-bar-rto" style="width: ${rtoPct}%;" title="RTO: ${sc.rto}h">RTO (${sc.rto}h)</div>
          <div class="bia-bar-wrt" style="width: ${wrtPct}%;" title="WRT: ${sc.wrt}h">WRT (${sc.wrt}h)</div>
        </div>
        <div class="chart-status ${isOver ? 'status-fail' : 'status-pass'}">
          ${isOver ? `⚠️ Total (${sc.totalRecovery}h) EXCEEDS MTD (${sc.mtd}h)` : `✅ Total (${sc.totalRecovery}h) within MTD limit`}
        </div>
      </div>
    `;
  }

  const priorAle = sc.alePrior;
  const postAleAndCost = sc.alePost + sc.controlCost;
  const maxVal = Math.max(priorAle, postAleAndCost) * 1.15;
  const priorWidth = Math.round((priorAle / maxVal) * 100);
  const postWidth = Math.round((postAleAndCost / maxVal) * 100);
  const isSavings = sc.netBenefit > 0;

  return `
    <div class="chart-wrapper">
      <div class="bar-row">
        <span class="bar-row-label">Unmitigated ALE:</span>
        <div class="bar-outer">
          <div class="bar-inner bar-risk-prior" style="width: ${priorWidth}%;">${formatCurrency(priorAle)}</div>
        </div>
      </div>
      <div class="bar-row">
        <span class="bar-row-label">With Safeguard:</span>
        <div class="bar-outer">
          <div class="bar-inner bar-risk-post" style="width: ${postWidth}%;">${formatCurrency(postAleAndCost)}</div>
        </div>
      </div>
      <div class="chart-summary ${isSavings ? 'text-success' : 'text-danger'}">
        ${isSavings ? `💸 Net Annual Benefit: +${formatCurrency(sc.netBenefit)}` : `⚠️ Net Deficit: ${formatCurrency(sc.netBenefit)}`}
      </div>
    </div>
  `;
}

// Event Listeners Wiring
function attachRiskLabEventListeners(containerEl) {
  const metricSelect = containerEl.querySelector('#risk-metric-select');
  const modeSelect = containerEl.querySelector('#risk-mode-select');
  const btnNewScenario = containerEl.querySelector('#btn-risk-new-scenario');
  const btnCheck = containerEl.querySelector('#btn-risk-check');
  const btnHint = containerEl.querySelector('#btn-risk-hint');
  const btnScratchpad = containerEl.querySelector('#btn-toggle-scratchpad');
  const btnAiExplain = containerEl.querySelector('#btn-risk-ai-explain');

  if (metricSelect) {
    metricSelect.addEventListener('change', (e) => {
      activeMetricFilter = e.target.value;
      generateRiskScenario(activeMetricFilter, activeLabMode);
      renderRiskLabUI(containerEl);
    });
  }

  if (modeSelect) {
    modeSelect.addEventListener('change', (e) => {
      activeLabMode = e.target.value;
      generateRiskScenario(activeMetricFilter, activeLabMode);
      renderRiskLabUI(containerEl);
    });
  }

  if (btnNewScenario) {
    btnNewScenario.addEventListener('click', () => {
      generateRiskScenario(activeMetricFilter, activeLabMode);
      renderRiskLabUI(containerEl);
    });
  }

  if (btnCheck) {
    btnCheck.addEventListener('click', () => {
      const form = containerEl.querySelector('#risk-calc-form');
      const inputs = {
        sle: form.querySelector('#input-sle')?.value,
        ale: form.querySelector('#input-ale')?.value,
        rosi: form.querySelector('#input-rosi')?.value,
        strategy: form.querySelector('#input-strategy')?.value,
        totalRecovery: form.querySelector('#input-total-recovery')?.value,
        mtdDecision: form.querySelector('#input-mtd-decision')?.value
      };

      const res = checkRiskAnswers(inputs);
      renderFeedbackBanner(containerEl, res);
    });
  }

  if (btnHint) {
    btnHint.addEventListener('click', () => {
      currentHintStep = Math.min(3, currentHintStep + 1);
      const hintCountEl = containerEl.querySelector('#hint-count');
      if (hintCountEl) hintCountEl.textContent = currentHintStep;
      renderProgressiveHint(containerEl, currentHintStep);
    });
  }

  if (btnScratchpad) {
    btnScratchpad.addEventListener('click', () => {
      const drawer = containerEl.querySelector('#risk-scratchpad-drawer');
      if (drawer) drawer.hidden = !drawer.hidden;
    });
  }

  const btnCloseScratch = containerEl.querySelector('#btn-close-scratchpad');
  if (btnCloseScratch) {
    btnCloseScratch.addEventListener('click', () => {
      const drawer = containerEl.querySelector('#risk-scratchpad-drawer');
      if (drawer) drawer.hidden = true;
    });
  }

  // Draggable Floating Modal Logic
  const drawerEl = containerEl.querySelector('#risk-scratchpad-drawer');
  const headerEl = containerEl.querySelector('#risk-scratchpad-header');

  if (drawerEl && headerEl) {
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    const startDrag = (e) => {
      if (e.target.closest('#btn-close-scratchpad')) return;
      isDragging = true;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const rect = drawerEl.getBoundingClientRect();
      offsetX = clientX - rect.left;
      offsetY = clientY - rect.top;
      drawerEl.style.transition = 'none';
    };

    const doDrag = (e) => {
      if (!isDragging) return;
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      let left = clientX - offsetX;
      let top = clientY - offsetY;

      const maxLeft = window.innerWidth - drawerEl.offsetWidth - 10;
      const maxTop = window.innerHeight - drawerEl.offsetHeight - 10;
      left = Math.max(10, Math.min(left, maxLeft));
      top = Math.max(10, Math.min(top, maxTop));

      drawerEl.style.left = `${left}px`;
      drawerEl.style.top = `${top}px`;
      drawerEl.style.right = 'auto';
    };

    const stopDrag = () => {
      isDragging = false;
    };

    headerEl.addEventListener('mousedown', startDrag);
    document.addEventListener('mousemove', doDrag);
    document.addEventListener('mouseup', stopDrag);

    headerEl.addEventListener('touchstart', startDrag, { passive: true });
    document.addEventListener('touchmove', doDrag, { passive: true });
    document.addEventListener('touchend', stopDrag);
  }

  // Scratchpad Keypad & Keyboard Actions
  let spValue = '0';
  let spHistory = '';
  const spDisplay = containerEl.querySelector('#scratchpad-display');
  const spHistEl = containerEl.querySelector('#scratchpad-history');

  const updateDisplay = () => {
    if (spDisplay) spDisplay.textContent = spValue;
    if (spHistEl) spHistEl.textContent = spHistory;
  };

  const handleCalculatorAction = (act) => {
    if (act === 'C') {
      spValue = '0';
      spHistory = '';
    } else if (act === 'BACK') {
      if (spValue.length > 1) {
        spValue = spValue.slice(0, -1);
      } else {
        spValue = '0';
      }
    } else if (act === '=') {
      try {
        const sanitized = spValue.replace(/×/g, '*').replace(/÷/g, '/');
        const calculated = eval(sanitized);
        spHistory = `${spValue} =`;
        spValue = String(Number(calculated.toFixed(4))); // round nicely
      } catch (e) {
        spValue = 'Error';
      }
    } else {
      if (spValue === '0' || spValue === 'Error') spValue = act;
      else spValue += act;
    }
    updateDisplay();
  };

  containerEl.querySelectorAll('.sp-key').forEach(key => {
    key.addEventListener('click', () => handleCalculatorAction(key.dataset.act));
  });

  // Shortcut Buttons
  const btnPct = containerEl.querySelector('#sp-btn-pct');
  if (btnPct) {
    btnPct.addEventListener('click', () => {
      const num = parseFloat(spValue);
      if (!isNaN(num)) {
        spHistory = `${spValue}% → dec`;
        spValue = String(num / 100);
        updateDisplay();
      }
    });
  }

  const btnSle = containerEl.querySelector('#sp-btn-sle');
  if (btnSle && currentRiskScenario && currentRiskScenario.av) {
    btnSle.addEventListener('click', () => {
      spValue = `${currentRiskScenario.av} * ${currentRiskScenario.ef}`;
      spHistory = `SLE = $${currentRiskScenario.av.toLocaleString()} × ${currentRiskScenario.efPct}%`;
      updateDisplay();
    });
  }

  const btnAle = containerEl.querySelector('#sp-btn-ale');
  if (btnAle && currentRiskScenario && currentRiskScenario.sle) {
    btnAle.addEventListener('click', () => {
      spValue = `${currentRiskScenario.sle} * ${currentRiskScenario.aro}`;
      spHistory = `ALE = $${currentRiskScenario.sle.toLocaleString()} × ${currentRiskScenario.aro.toFixed(3)} ARO`;
      updateDisplay();
    });
  }

  // Physical Keyboard Listener
  document.addEventListener('keydown', (e) => {
    if (!drawerEl || drawerEl.hidden) return;
    const key = e.key;

    if (/^[0-9\.\+\-\*\/]$/.test(key)) {
      handleCalculatorAction(key);
    } else if (key === 'Enter' || key === '=') {
      e.preventDefault();
      handleCalculatorAction('=');
    } else if (key === 'Backspace') {
      handleCalculatorAction('BACK');
    } else if (key === 'Escape') {
      drawerEl.hidden = true;
    }
  });

  if (btnAiExplain) {
    btnAiExplain.addEventListener('click', () => handleAiRiskExplain(containerEl));
  }
}

// Render Hints & Feedback Banners
function renderProgressiveHint(containerEl, step) {
  const hintBox = containerEl.querySelector('#risk-hint-container');
  if (!hintBox || !currentRiskScenario) return;

  const sc = currentRiskScenario;
  hintBox.hidden = false;

  let hintHtml = '';
  if (step === 1) {
    hintHtml = `
      <div class="hint-step">
        <strong>💡 Hint 1/3 (Formula Reference):</strong>
        <p>${sc.type === 'bia' ? 'Total Recovery = RTO + WRT. Check if Total Recovery ≤ MTD.' : 'SLE = Asset Value × EF. ALE = SLE × ARO. ROSI = [(ΔALE - Control Cost) / Control Cost] × 100.'}</p>
      </div>
    `;
  } else if (step === 2) {
    hintHtml = `
      <div class="hint-step">
        <strong>💡 Hint 2/3 (Scenario Variable Mapping):</strong>
        ${sc.type === 'bia' ? `
          <p>MTD = ${sc.mtd}h | RTO = ${sc.rto}h | WRT = ${sc.wrt}h.</p>
        ` : `
          <p>AV = $${sc.av.toLocaleString()} | EF = ${sc.efPct}% (${sc.ef}) | ARO = ${sc.aro.toFixed(3)} | Control Cost = $${sc.controlCost.toLocaleString()}/yr.</p>
        `}
      </div>
    `;
  } else if (step >= 3) {
    hintHtml = `
      <div class="hint-step">
        <strong>💡 Hint 3/3 (Step-by-Step Calculation Guide):</strong>
        ${sc.type === 'bia' ? `
          <p>Total Recovery = ${sc.rto}h + ${sc.wrt}h = <strong>${sc.totalRecovery}h</strong>. Compare ${sc.totalRecovery}h against MTD limit (${sc.mtd}h).</p>
        ` : `
          <p>1. SLE = $${sc.av.toLocaleString()} × ${sc.ef} = <strong>$${sc.sle.toLocaleString()}</strong>.<br/>
          2. ALE = $${sc.sle.toLocaleString()} × ${sc.aro.toFixed(3)} = <strong>$${sc.alePrior.toLocaleString()}</strong>.<br/>
          3. ROSI = [($${sc.deltaAle.toLocaleString()} - $${sc.controlCost.toLocaleString()}) / $${sc.controlCost.toLocaleString()}] × 100 = <strong>${sc.rosiPct}%</strong>.</p>
        `}
      </div>
    `;
  }

  hintBox.innerHTML = hintHtml;
}

function renderFeedbackBanner(containerEl, results) {
  const box = containerEl.querySelector('#risk-feedback-container');
  if (!box) return;

  box.hidden = false;

  if (results.isCorrectAll) {
    box.className = 'risk-feedback-box feedback-success';
    box.innerHTML = `
      <h3>🎉 Correct! All calculations & decision metrics match perfectly.</h3>
      <p>Great job! You navigated this financial risk scenario with exact accuracy.</p>
    `;
  } else {
    box.className = 'risk-feedback-box feedback-error';
    let diagHtml = results.diagnostics.map(d => `<li>${escapeHtml(d)}</li>`).join('');
    box.innerHTML = `
      <h3>⚠️ Some calculations were off. Review Diagnostic Analysis:</h3>
      <ul class="diagnostic-list">${diagHtml}</ul>
    `;
  }
}

// AI Tutor Request Handler
async function handleAiRiskExplain(containerEl) {
  const aiBox = containerEl.querySelector('#risk-ai-response-container');
  if (!aiBox || !currentRiskScenario) return;

  const apiKey = getGeminiApiKey();
  const model = getGeminiModel();

  if (!apiKey) {
    aiBox.hidden = false;
    aiBox.innerHTML = `
      <div class="ai-warning-box">
        <strong>⚠️ Gemini AI Key Required:</strong> Configure your API key in the AI Setup menu to receive custom interactive breakdowns from Google Gemini.
      </div>
    `;
    return;
  }

  aiBox.hidden = false;
  aiBox.innerHTML = `<div class="ai-loading">Generating CISM Management Breakdown with Gemini AI...</div>`;

  const sc = currentRiskScenario;
  const sysPrompt = `You are an expert ${getExamName()} exam master tutor specializing in Quantitative Risk Management, Financial Loss Expectancy, and Business Impact Analysis. Give a structured, authoritative, plain text breakdown of the scenario provided. Organize with short paragraphs and bullet points. End with a section titled "How to remember this:" containing one memorable memory aid.`;
  const userPrompt = `Scenario: ${sc.title}
Asset: ${sc.assetName}
Description: ${sc.description}
${sc.type !== 'bia' ? `Control Cost: $${sc.controlCost}, Ground Truth SLE: $${sc.sle}, Ground Truth ALE: $${sc.alePrior}, Ground Truth ROSI: ${sc.rosiPct}%` : `MTD: ${sc.mtd}h, RTO: ${sc.rto}h, WRT: ${sc.wrt}h`}

Explain the core ${getExamName()} risk governance principle here, break down the step-by-step math derivation, highlight common exam distractor traps on this topic, and justify why executive management should act on this data.`;

  try {
    const text = await callGeminiAPI(apiKey, model, sysPrompt, userPrompt);
    aiBox.innerHTML = `
      <div class="ai-response-card">
        <div class="ai-response-meta">${ICON_SPARKLE} Gemini AI Master Tutor Breakdown</div>
        <div class="ai-response-text">${escapeHtml(text)}</div>
      </div>
    `;
  } catch (err) {
    aiBox.innerHTML = `<div class="ai-error">Failed to connect to AI API: ${escapeHtml(err.message)}</div>`;
  }
}

export function initRiskLab() {
  const container = document.getElementById('tab-risklab');
  if (container) {
    renderRiskLabUI(container);
  }
}
