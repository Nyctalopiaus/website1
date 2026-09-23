// Certforge Main Entry Module (ES Module)

import { STORAGE_KEYS } from './js/config.js';
import {
  setQuestions,
  setFlashcards,
  setDistractors,
  setBookmarks,
  setAttempts,
  setQuizAnsweredStates,
  setQuestionHistory,
  setFlashcardMastery,
  setGuideMastery,
  setAiTutorHistory,
  setPbqs,
  setPbqAttemptState,
  questions,
  flashcards,
  distractors,
  bookmarks,
  attempts,
  quizAnsweredStates,
  questionHistory,
  flashcardMastery,
  guideMastery,
  aiTutorHistory,
  pbqs,
  pbqAttemptState
} from './js/state.js';

import {
  loadJson,
  ensureNumericIds,
  loadExamManifest,
  ensureSeedData,
  ensurePbqData,
  loadUserStats,
  updateStudyStreak
} from './js/storage.js';

import {
  renderExamChrome,
  updateDashboardStats
} from './js/dashboard.js';

import {
  initFlashcards
} from './js/flashcards.js';

import {
  initQuiz,
  renderQuizQuestion
} from './js/quiz.js';

import {
  initPbqLab
} from './js/pbqLab.js';

import {
  initRiskLab
} from './js/riskCalcLab.js';

import {
  initMockExam,
  populateFullMockPicker,
  updateFullMockSelectorVisibility,
  updateMockSpecsDisplay
} from './js/mockExam.js';

import {
  initTrapSpotter
} from './js/trapspotter.js';

import {
  initGuides,
  refreshAllGuideWeakFlags
} from './js/guides.js';

import {
  initAiTutor,
  jumpToAiDeepDive
} from './js/aiTutor.js';

import {
  initTrainingPlan
} from './js/trainingPlan.js';

import {
  initCurator
} from './js/curator.js';

import {
  initSearch,
  buildSearchIndex,
  switchToTab
} from './js/search.js';

import {
  showToast,
  initUiModals,
  initAiSettingsUi
} from './js/ui.js';

import {
  wireAiExplainButton,
  buildAiExplainPrompt,
  buildTrapAiExplainPrompt,
  buildGuideAiExplainPrompt,
  buildGuideAiExhaustivePrompt
} from './js/ai.js';

document.addEventListener('DOMContentLoaded', async () => {
  // Initialize UI modals, focus traps, keyboard shortcuts, zen mode & AI settings vault UI
  initUiModals();
  const { openAiUnlockModal, refreshAiHeaderButtonState, openAiSettingsModal } = initAiSettingsUi();

  // Update study streak on app start
  updateStudyStreak();

  // Wire AI Explain buttons for Quiz, Trap Spotter, and Guides
  const btnAiExplain = document.getElementById('btn-ai-explain');
  const aiExplainResponseEl = document.getElementById('ai-explain-response');
  const aiExplainResponseBodyEl = document.getElementById('ai-explain-response-body');
  const btnAiExplainClose = document.getElementById('btn-ai-explain-close');

  const quizAiExplainHandle = wireAiExplainButton({
    btn: btnAiExplain,
    responseEl: aiExplainResponseEl,
    responseBodyEl: aiExplainResponseBodyEl,
    closeBtn: btnAiExplainClose,
    buildPrompt: () => {
      const q = window.__currentAiExplainQuestion;
      return q ? buildAiExplainPrompt(q) : null;
    },
    getCacheKey: () => {
      const q = window.__currentAiExplainQuestion;
      return q ? `quiz:${q.id}` : null;
    },
    openAiUnlockModal,
    refreshAiHeaderButtonState,
    showToast,
    openAiSettingsModal
  });
  const resetAiExplainPanel = () => quizAiExplainHandle?.reset();

  const btnAiDeepdiveLink = document.getElementById('btn-ai-deepdive-link');
  btnAiDeepdiveLink?.addEventListener('click', () => {
    const q = window.__currentAiExplainQuestion;
    if (!q) return;
    const seedMsg = `I'm stuck on the underlying concept behind this practice question, not just the specific answer (Domain ${q.domain}). The question was: "${q.question}" -- can you explain the broader concept it's testing, in depth?`;
    jumpToAiDeepDive(seedMsg, q.domain, { switchToTab });
  });

  const btnTrapAiExplain = document.getElementById('btn-trap-ai-explain');
  const trapAiExplainResponseEl = document.getElementById('trap-ai-explain-response');
  const trapAiExplainResponseBodyEl = document.getElementById('trap-ai-explain-response-body');
  const btnTrapAiExplainClose = document.getElementById('btn-trap-ai-explain-close');

  const trapAiExplainHandle = wireAiExplainButton({
    btn: btnTrapAiExplain,
    responseEl: trapAiExplainResponseEl,
    responseBodyEl: trapAiExplainResponseBodyEl,
    closeBtn: btnTrapAiExplainClose,
    buildPrompt: () => {
      const traps = window.__filteredTraps || [];
      const idx = window.__currentTrapIndex || 0;
      if (!traps || traps.length === 0) return null;
      return buildTrapAiExplainPrompt(traps[idx]);
    },
    getCacheKey: () => {
      const traps = window.__filteredTraps || [];
      const idx = window.__currentTrapIndex || 0;
      return (traps && traps.length > 0) ? `trap:${traps[idx].id}` : null;
    },
    openAiUnlockModal,
    refreshAiHeaderButtonState,
    showToast,
    openAiSettingsModal
  });

  const btnTrapAiDeepdiveLink = document.getElementById('btn-trap-ai-deepdive-link');
  btnTrapAiDeepdiveLink?.addEventListener('click', () => {
    const traps = window.__filteredTraps || [];
    const idx = window.__currentTrapIndex || 0;
    if (!traps || traps.length === 0) return;
    const trap = traps[idx];
    const seedMsg = `I'm stuck on the underlying concept behind this trap statement, not just this specific trap statement: "${trap.trap_statement}" -- the correct principle is: "${trap.correct_principle}". Can you explain the broader concept in depth?`;
    jumpToAiDeepDive(seedMsg, trap.domain, { switchToTab });
  });

  const btnGuideAiExplain = document.getElementById('btn-guide-ai-explain');
  const guideAiExplainResponseEl = document.getElementById('guide-ai-explain-response');
  const guideAiExplainResponseBodyEl = document.getElementById('guide-ai-explain-response-body');
  const btnGuideAiExplainClose = document.getElementById('btn-guide-ai-explain-close');
  const btnGuideAiUltraDeepdive = document.getElementById('btn-guide-ai-ultra-deepdive');

  const guideAiExplainHandle = wireAiExplainButton({
    btn: btnGuideAiExplain,
    responseEl: guideAiExplainResponseEl,
    responseBodyEl: guideAiExplainResponseBodyEl,
    closeBtn: btnGuideAiExplainClose,
    buildPrompt: () => {
      const activeItem = document.querySelector('.guide-menu-item.active');
      if (!activeItem) return null;
      const el = document.getElementById(activeItem.dataset.guide);
      if (!el) return null;
      const title = activeItem.textContent.trim();
      const body = (el.textContent || '').replace(/\s+/g, ' ').trim();
      return buildGuideAiExplainPrompt(title, body, []);
    },
    getCacheKey: () => {
      const activeItem = document.querySelector('.guide-menu-item.active');
      if (!activeItem) return null;
      return `guide:${activeItem.dataset.guide}:std`;
    },
    onRender: () => {
      if (btnGuideAiUltraDeepdive) btnGuideAiUltraDeepdive.hidden = false;
    },
    onReset: () => {
      if (btnGuideAiUltraDeepdive) btnGuideAiUltraDeepdive.hidden = true;
    },
    openAiUnlockModal,
    refreshAiHeaderButtonState,
    showToast,
    openAiSettingsModal
  });

  const guideAiUltraDeepdiveHandle = wireAiExplainButton({
    btn: btnGuideAiUltraDeepdive,
    responseEl: guideAiExplainResponseEl,
    responseBodyEl: guideAiExplainResponseBodyEl,
    closeBtn: btnGuideAiExplainClose,
    buildPrompt: () => {
      const activeItem = document.querySelector('.guide-menu-item.active');
      if (!activeItem) return null;
      const el = document.getElementById(activeItem.dataset.guide);
      if (!el) return null;
      const title = activeItem.textContent.trim();
      const body = (el.textContent || '').replace(/\s+/g, ' ').trim();
      return buildGuideAiExhaustivePrompt(title, body, []);
    },
    getCacheKey: () => {
      const activeItem = document.querySelector('.guide-menu-item.active');
      if (!activeItem) return null;
      return `guide:ultra:${activeItem.dataset.guide}:std`;
    },
    onRender: () => {
      if (btnGuideAiUltraDeepdive) btnGuideAiUltraDeepdive.hidden = false;
    },
    openAiUnlockModal,
    refreshAiHeaderButtonState,
    showToast,
    openAiSettingsModal
  });

  loadUserStats();

  async function loadData() {
    await loadExamManifest();
    renderExamChrome({
      flashcardDomainSelect: document.getElementById('flashcard-domain-select'),
      quizDomainSelect: document.getElementById('quiz-domain-select'),
      trapDomainSelect: document.getElementById('trap-domain-select'),
      aiTutorDomainSelect: document.getElementById('ai-tutor-domain-select'),
      pbqDomainSelect: document.getElementById('pbq-domain-select'),
      populateFullMockPicker,
      updateFullMockSelectorVisibility,
      updateMockSpecsDisplay
    });
    await ensureSeedData();
    await ensurePbqData();

    setQuestions(ensureNumericIds(loadJson(STORAGE_KEYS.questions, [])));
    setFlashcards(ensureNumericIds(loadJson(STORAGE_KEYS.flashcards, [])));
    setDistractors(loadJson(STORAGE_KEYS.distractors, []));
    setBookmarks(loadJson(STORAGE_KEYS.bookmarks, []));
    setAttempts(loadJson(STORAGE_KEYS.attempts, []));
    setQuizAnsweredStates(loadJson(STORAGE_KEYS.quizAnswered, {}));
    setQuestionHistory(loadJson(STORAGE_KEYS.questionHistory, {}));
    setFlashcardMastery(loadJson(STORAGE_KEYS.flashcardMastery, {}));
    setGuideMastery(loadJson(STORAGE_KEYS.guideMastery, {}));
    setAiTutorHistory(loadJson(STORAGE_KEYS.aiTutorHistory, []));
    setPbqs(loadJson(STORAGE_KEYS.pbqs, []));
    setPbqAttemptState(loadJson(STORAGE_KEYS.pbqAttempts, {}));

    initFlashcards();
    initQuiz({ showToast, refreshGuideFlagsCb: refreshAllGuideWeakFlags, quizAiExplainHandle, resetAiExplainPanel });
    initAiTutor({ openAiUnlockModal, refreshAiHeaderButtonState, showToast, openAiSettingsModal });
    initTrapSpotter({ trapAiExplainHandle });
    initGuides({ guideAiExplainHandle, guideAiUltraDeepdiveHandle });
    initPbqLab();
    initRiskLab();
    initMockExam();
    initTrainingPlan({
      openAiUnlockModal,
      refreshAiHeaderButtonState,
      showToast,
      openAiSettingsModal,
      switchToTab,
      quizDomainSelect: document.getElementById('quiz-domain-select'),
      quizWeakSpotToggle: document.getElementById('quiz-weak-spot-toggle'),
      quizShowAllToggle: document.getElementById('quiz-show-all-toggle'),
      quizMistakesToggle: document.getElementById('quiz-mistakes-toggle'),
      filterQuizQuestions: () => renderQuizQuestion({ quizAiExplainHandle, resetAiExplainPanel })
    });
    initCurator();
    updateDashboardStats();
    buildSearchIndex();
    initSearch({ jumpToAiDeepDive: (msg, dId) => jumpToAiDeepDive(msg, dId, { switchToTab }) });
  }

  const appLoadingOverlay = document.getElementById('app-loading');
  loadData()
    .catch(e => console.error('[SYSTEM] loadData() failed:', e))
    .finally(() => {
      if (appLoadingOverlay) appLoadingOverlay.classList.add('app-loaded');
    });
});
