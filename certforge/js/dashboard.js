// Dashboard stats, domain mastery circle grid renderer, and select population

import {
  ACTIVE_EXAM_ID,
  ACTIVE_EXAM_STORAGE_KEY,
  FALLBACK_EXAM_CONFIG,
  CIRCUMFERENCE,
  MASTERY_COLOR_NO_DATA,
  getMasteryColor,
  escapeHtml
} from './config.js';

import {
  examManifest,
  examConfig,
  getActiveExamConfig,
  perfData,
  getDomainPerf,
  questions,
  bookmarks,
  attempts
} from './state.js';

import { getStudyStreak } from './storage.js';

let domainBars = {};
let domainPcts = {};
let domainCorrectEls = {};
let domainIncorrectEls = {};
let domainConfidenceEls = {};

const domainsGridEl = document.getElementById('domains-grid');
const examSelectEl = document.getElementById('exam-select');
const headerLogoTextEl = document.getElementById('header-logo-text');

const statAnsweredEl = document.getElementById('stat-answered');
const statAccuracyEl = document.getElementById('stat-accuracy');
const statReadinessEl = document.getElementById('stat-readiness');
const statStreakEl = document.getElementById('stat-streak');
const statFlaggedEl = document.getElementById('stat-flagged');
const statPassedEl = document.getElementById('stat-passed');
const freshStartBannerEl = document.getElementById('fresh-start-banner');

export function updateDashboardStats() {
  if (freshStartBannerEl) freshStartBannerEl.hidden = perfData.answered > 0;

  if (statAnsweredEl) statAnsweredEl.textContent = perfData.answered;
  const accuracy = perfData.answered > 0 ? Math.round((perfData.correct / perfData.answered) * 100) : 0;
  if (statAccuracyEl) statAccuracyEl.textContent = `${accuracy}%`;

  if (statStreakEl) {
    const streak = getStudyStreak();
    statStreakEl.textContent = `🔥 ${streak}d`;
  }

  if (statFlaggedEl) statFlaggedEl.textContent = bookmarks.length;

  const dashPassingThreshold = (getActiveExamConfig().mock_exam || FALLBACK_EXAM_CONFIG.mock_exam).passing_threshold;
  const passedCount = attempts.filter(a => a.score >= dashPassingThreshold).length;
  if (statPassedEl) statPassedEl.textContent = passedCount;

  let totalDomainCoverage = 0;
  const domainList = getActiveExamConfig().domains || [];
  domainList.forEach(d => {
    const dData = getDomainPerf(d.id);
    const totalInDomain = questions.filter(q => q.domain === d.id).length;
    const completedPct = totalInDomain > 0 ? Math.round((dData.answered / totalInDomain) * 100) : 0;
    totalDomainCoverage += completedPct;
    const accuracyPct = dData.answered > 0 ? Math.round((dData.correct / dData.answered) * 100) : 0;
    const incorrect = dData.answered - dData.correct;

    if (domainPcts[d.id]) domainPcts[d.id].textContent = `${completedPct}%`;
    if (domainBars[d.id]) {
      const offset = CIRCUMFERENCE - (completedPct / 100) * CIRCUMFERENCE;
      domainBars[d.id].style.strokeDashoffset = offset;
      domainBars[d.id].style.stroke = getMasteryColor(completedPct, dData.answered);
    }
    if (domainCorrectEls[d.id]) {
      domainCorrectEls[d.id].textContent = `${dData.correct} / ${totalInDomain} correct`;
    }
    if (domainIncorrectEls[d.id]) {
      domainIncorrectEls[d.id].textContent = `${incorrect} / ${totalInDomain} incorrect`;
    }
    if (domainConfidenceEls[d.id]) {
      domainConfidenceEls[d.id].textContent = `${accuracyPct}% testing confidence`;
      domainConfidenceEls[d.id].style.color = getMasteryColor(accuracyPct, dData.answered);
    }
  });

  if (statReadinessEl) {
    const avgCoverage = domainList.length > 0 ? totalDomainCoverage / domainList.length : 0;
    const readiness = Math.round((accuracy * 0.6) + (avgCoverage * 0.4));
    statReadinessEl.textContent = `${readiness}%`;
  }
}

export function renderDomainMasteryGrid() {
  if (!domainsGridEl) return;
  const domainList = getActiveExamConfig().domains || [];
  domainsGridEl.innerHTML = '';
  domainBars = {};
  domainPcts = {};
  domainCorrectEls = {};
  domainIncorrectEls = {};
  domainConfidenceEls = {};

  domainList.forEach(d => {
    const card = document.createElement('div');
    card.className = 'domain-card';
    card.dataset.domain = String(d.id);
    card.innerHTML = `
      <div class="domain-circle-wrapper">
        <svg width="70" height="70" viewBox="0 0 70 70">
          <circle cx="35" cy="35" r="28" class="circle-bg"></circle>
          <circle cx="35" cy="35" r="28" class="circle-bar" id="domain-bar-${d.id}" style="stroke: ${MASTERY_COLOR_NO_DATA};"></circle>
        </svg>
        <span class="circle-percent font-mono" id="domain-pct-${d.id}">0%</span>
      </div>
      <div class="domain-meta">
        <span class="domain-num">Domain ${d.id}${d.weight_pct ? ` (${d.weight_pct}%)` : ''}</span>
        <span class="domain-title">${escapeHtml(d.title || '')}</span>
        <span class="domain-progress font-mono" id="domain-correct-${d.id}">0 / 0 correct</span>
        <span class="domain-progress font-mono" id="domain-incorrect-${d.id}">0 / 0 incorrect</span>
        <span class="domain-progress font-mono domain-confidence" id="domain-confidence-${d.id}">0% testing confidence</span>
      </div>`;
    domainsGridEl.appendChild(card);
    domainBars[d.id] = document.getElementById(`domain-bar-${d.id}`);
    domainPcts[d.id] = document.getElementById(`domain-pct-${d.id}`);
    domainCorrectEls[d.id] = document.getElementById(`domain-correct-${d.id}`);
    domainIncorrectEls[d.id] = document.getElementById(`domain-incorrect-${d.id}`);
    domainConfidenceEls[d.id] = document.getElementById(`domain-confidence-${d.id}`);
  });
}

export function populateDomainSelect(selectEl, includeAll) {
  if (!selectEl) return;
  const domainList = getActiveExamConfig().domains || [];
  const previousValue = selectEl.value;
  selectEl.innerHTML = '';
  if (includeAll) {
    const allOpt = document.createElement('option');
    allOpt.value = 'all';
    allOpt.textContent = 'All Domains';
    selectEl.appendChild(allOpt);
  }
  domainList.forEach(d => {
    const opt = document.createElement('option');
    opt.value = String(d.id);
    opt.textContent = `Domain ${d.id}: ${d.title}`;
    selectEl.appendChild(opt);
  });
  if (previousValue && Array.from(selectEl.options).some(o => o.value === previousValue)) {
    selectEl.value = previousValue;
  }
}

export function populateResetDomainOptions() {
  const resetExamLabelEl = document.getElementById('local-reset-exam-label');
  if (resetExamLabelEl) {
    resetExamLabelEl.textContent = getActiveExamConfig().name || 'this exam';
  }

  const optgroup = document.getElementById('reset-domain-optgroup');
  if (!optgroup) return;
  const domainList = getActiveExamConfig().domains || [];
  optgroup.innerHTML = '';

  const allOpt = document.createElement('option');
  allOpt.value = 'domain:all';
  allOpt.textContent = 'All Domains (full progress reset)';
  optgroup.appendChild(allOpt);

  domainList.forEach(d => {
    const opt = document.createElement('option');
    opt.value = `domain:${d.id}`;
    opt.textContent = `Domain ${d.id}: ${d.title}`;
    optgroup.appendChild(opt);
  });
}

export function renderExamChrome({
  flashcardDomainSelect,
  quizDomainSelect,
  trapDomainSelect,
  aiTutorDomainSelect,
  pbqDomainSelect,
  populateFullMockPicker,
  updateFullMockSelectorVisibility,
  updateMockSpecsDisplay
}) {
  const cfg = getActiveExamConfig();

  if (headerLogoTextEl) {
    headerLogoTextEl.textContent = `${cfg.name || 'CISM'} // SECURITY COMMANDER`;
  }
  document.title = `Certforge — ${cfg.name || 'CISM'} Exam Trainer`;

  if (examSelectEl) {
    const allExams = (examManifest && examManifest.exams) || [FALLBACK_EXAM_CONFIG];
    examSelectEl.innerHTML = '';
    allExams.forEach(exam => {
      const opt = document.createElement('option');
      opt.value = exam.id;
      const comingSoon = exam.status && exam.status !== 'active';
      opt.textContent = comingSoon ? `${exam.name} (Coming Soon)` : exam.name;
      opt.disabled = comingSoon;
      if (exam.id === ACTIVE_EXAM_ID) opt.selected = true;
      examSelectEl.appendChild(opt);
    });
    examSelectEl.addEventListener('change', () => {
      const chosen = examSelectEl.value;
      if (!chosen || chosen === ACTIVE_EXAM_ID) return;
      localStorage.setItem(ACTIVE_EXAM_STORAGE_KEY, chosen);
      location.reload();
    });
  }

  renderDomainMasteryGrid();
  populateDomainSelect(flashcardDomainSelect, true);
  populateDomainSelect(quizDomainSelect, true);
  populateDomainSelect(trapDomainSelect, true);
  populateDomainSelect(aiTutorDomainSelect, true);
  populateDomainSelect(pbqDomainSelect, true);
  populateDomainSelect(document.getElementById('curator-flashcard-domain-select'), false);
  populateDomainSelect(document.getElementById('curator-question-domain-select'), false);
  populateResetDomainOptions();
  if (populateFullMockPicker) populateFullMockPicker();
  if (updateFullMockSelectorVisibility) updateFullMockSelectorVisibility();
  if (updateMockSpecsDisplay) updateMockSpecsDisplay();
}
