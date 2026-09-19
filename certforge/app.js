document.addEventListener('DOMContentLoaded', () => {
  // Navigation Tabs
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  // Stats Elements
  const statAnsweredEl = document.getElementById('stat-answered');
  const statAccuracyEl = document.getElementById('stat-accuracy');
  const statFlaggedEl = document.getElementById('stat-flagged');
  const statPassedEl = document.getElementById('stat-passed');

  // Circle bars -- built dynamically by renderDomainMasteryGrid() once the
  // active exam's domain count is known (CISM has 4 today; CISSP will have 8).
  const domainsGridEl = document.getElementById('domains-grid');
  const examSelectEl = document.getElementById('exam-select');
  const headerLogoTextEl = document.getElementById('header-logo-text');
  let domainBars = {};
  let domainPcts = {};
  let domainCorrectEls = {};
  let domainIncorrectEls = {};
  let domainConfidenceEls = {};
  // Shared red/orange/green/gray tiering, used for both the circle (now
  // driven by % of the domain's question bank completed) and the testing
  // confidence line (driven by accuracy, correct/answered) below it. "Gray"
  // means no data yet, so an untouched domain never reads as a failing score.
  const MASTERY_COLOR_NO_DATA = '#6b7280';
  const MASTERY_COLOR_LOW = '#bf616a';
  const MASTERY_COLOR_MID = '#d08770';
  const MASTERY_COLOR_HIGH = '#a3be8c';
  function getMasteryColor(pct, answered) {
    if (answered <= 0) return MASTERY_COLOR_NO_DATA;
    if (pct >= 80) return MASTERY_COLOR_HIGH;
    if (pct >= 60) return MASTERY_COLOR_MID;
    return MASTERY_COLOR_LOW;
  }

  // Flashcards Elements
  const flashcardEl = document.getElementById('cism-card');
  const cardDomainTag = document.getElementById('card-domain-tag');
  const cardTermEl = document.getElementById('card-term');
  const cardDefinitionEl = document.getElementById('card-definition');
  const cardWhyMattersBlock = document.getElementById('card-why-matters-block');
  const cardWhyMattersEl = document.getElementById('card-why-matters');
  const cardCommonTrapBlock = document.getElementById('card-common-trap-block');
  const cardCommonTrapEl = document.getElementById('card-common-trap');
  const cardCounterEl = document.getElementById('card-counter');
  const flashcardDomainSelect = document.getElementById('flashcard-domain-select');
  const flashcardWeakSpotToggle = document.getElementById('flashcard-weak-spot-toggle');
  const flashcardUnlearnedToggle = document.getElementById('flashcard-unlearned-toggle');
  const cardMasteryBadgeEl = document.getElementById('card-mastery-badge');
  const flashcardAssessmentEl = document.getElementById('flashcard-assessment');
  const btnCardStillLearning = document.getElementById('btn-card-still-learning');
  const btnCardGotIt = document.getElementById('btn-card-got-it');
  const btnPrevCard = document.getElementById('btn-prev-card');
  const btnNextCard = document.getElementById('btn-next-card');

  // Quiz Elements
  const quizDomainTag = document.getElementById('quiz-domain-tag');
  const quizQuestionEl = document.getElementById('quiz-question');
  const quizOptionsList = document.getElementById('quiz-options-list');
  const quizExplanationContainer = document.getElementById('quiz-explanation-container');
  const explanationStatusEl = document.getElementById('explanation-status');
  const explanationTextEl = document.getElementById('explanation-text');
  const rationaleBreakdownEl = document.getElementById('rationale-breakdown');
  const quizCounterEl = document.getElementById('quiz-counter');
  const btnPrevQuiz = document.getElementById('btn-prev-quiz');
  const btnNextQuiz = document.getElementById('btn-next-quiz');
  const btnQuizBookmark = document.getElementById('btn-quiz-bookmark');
  const quizWeakSpotToggle = document.getElementById('quiz-weak-spot-toggle');
  const quizMistakesToggle = document.getElementById('quiz-mistakes-toggle');
  const quizShowAllToggle = document.getElementById('quiz-show-all-toggle');
  const quizDomainSelect = document.getElementById('quiz-domain-select');
  const quizSubmitRowEl = document.getElementById('quiz-submit-row');
  const quizSubmitBtnEl = document.getElementById('quiz-submit-btn');

  // AI Explain (Gemini) Elements
  const btnOpenAiSettings = document.getElementById('btn-open-ai-settings');
  const aiSettingsModal = document.getElementById('ai-settings-modal');
  const btnCloseAiSettings = document.getElementById('btn-close-ai-settings');
  const aiGeminiKeyInput = document.getElementById('ai-gemini-key-input');
  const aiGeminiKeyLabelEl = document.getElementById('ai-gemini-key-label');
  const aiGeminiModelInput = document.getElementById('ai-gemini-model-input');
  const btnSaveAiSettings = document.getElementById('btn-save-ai-settings');
  const btnClearAiSettings = document.getElementById('btn-clear-ai-settings');
  const aiSettingsStatusEl = document.getElementById('ai-settings-status');
  const btnTestAiSettings = document.getElementById('btn-test-ai-settings');
  const aiUnlockInlineRow = document.getElementById('ai-unlock-inline-row');
  const btnUnlockAiSettings = document.getElementById('btn-unlock-ai-settings');
  const btnOpenAiSettingsLabelEl = document.getElementById('btn-open-ai-settings-label');
  const aiStatusDotEl = document.getElementById('ai-status-dot');
  const aiVaultPinInput = document.getElementById('ai-vault-pin-input');
  const aiVaultPinConfirmRow = document.getElementById('ai-vault-pin-confirm-row');
  const aiVaultPinConfirmInput = document.getElementById('ai-vault-pin-confirm-input');
  const aiUnlockModal = document.getElementById('ai-unlock-modal');
  const btnCloseAiUnlock = document.getElementById('btn-close-ai-unlock');
  const aiUnlockPinInput = document.getElementById('ai-unlock-pin-input');
  const aiUnlockErrorEl = document.getElementById('ai-unlock-error');
  const btnAiUnlockSubmit = document.getElementById('btn-ai-unlock-submit');
  const btnAiUnlockForget = document.getElementById('btn-ai-unlock-forget');
  const aiExplainRowEl = document.getElementById('ai-explain-row');
  const btnAiExplain = document.getElementById('btn-ai-explain');
  const aiExplainResponseEl = document.getElementById('ai-explain-response');
  const aiExplainResponseBodyEl = document.getElementById('ai-explain-response-body');
  const btnAiExplainClose = document.getElementById('btn-ai-explain-close');
  // Jumps to the AI Deep Dive chat instead of explaining in place -- a
  // separate job from btnAiExplain (see jumpToAiDeepDive()).
  const btnAiDeepdiveLink = document.getElementById('btn-ai-deepdive-link');
  let currentAiExplainQuestion = null;
  // Same "explain this item" feature, reused on Trap Spotter and Concept
  // Guides -- see wireAiExplainButton().
  const btnTrapAiExplain = document.getElementById('btn-trap-ai-explain');
  const trapAiExplainResponseEl = document.getElementById('trap-ai-explain-response');
  const trapAiExplainResponseBodyEl = document.getElementById('trap-ai-explain-response-body');
  const btnTrapAiExplainClose = document.getElementById('btn-trap-ai-explain-close');
  const btnTrapAiDeepdiveLink = document.getElementById('btn-trap-ai-deepdive-link');
  const btnGuideAiExplain = document.getElementById('btn-guide-ai-explain');
  const guideAiExplainResponseEl = document.getElementById('guide-ai-explain-response');
  const guideAiExplainResponseBodyEl = document.getElementById('guide-ai-explain-response-body');
  const btnGuideAiExplainClose = document.getElementById('btn-guide-ai-explain-close');
  let trapAiExplainHandle = null;
  let guideAiExplainHandle = null;
  let quizAiExplainHandle = null;
  // AI Deep Dive -- freeform tutor chat tab.
  const aiTutorDomainSelect = document.getElementById('ai-tutor-domain-select');
  const aiTutorChatEl = document.getElementById('ai-tutor-chat');
  const aiTutorEmptyEl = document.getElementById('ai-tutor-empty');
  const aiTutorInput = document.getElementById('ai-tutor-input');
  const btnAiTutorSend = document.getElementById('btn-ai-tutor-send');
  const btnAiTutorClear = document.getElementById('btn-ai-tutor-clear');
  const aiTutorSuggestionChips = document.querySelectorAll('.ai-tutor-suggestion-chip');
  // Persisted per exam (STORAGE_KEYS.aiTutorHistory) and hydrated back into
  // the chat panel by initAiTutor(), so a page reload doesn't wipe out what
  // is often the longest, most valuable AI interaction in the app. Loaded
  // in loadData() once STORAGE_KEYS is available; starts empty until then.
  let aiTutorHistory = []; // [{role: 'user'|'model', parts:[{text}]}, ...]
  const AI_TUTOR_HISTORY_MAX_TURNS = 40; // ~20 exchanges, keeps storage/context bounded
  // Set by initAiTutor() to its internal sendAiTutorMessage() so the Quiz /
  // Trap Spotter "deep dive this concept" pills can hand it a seeded
  // message without exposing the whole chat closure.
  let aiTutorSendHandle = null;
  // sessionStorage (not localStorage) for the decrypted vault key: it
  // survives a hard/soft page refresh within this tab -- so you don't have
  // to re-enter your PIN on every reload -- but is wiped the instant the
  // tab closes, so the plaintext key never persists past this browsing
  // session or touches disk unencrypted.
  const AI_GEMINI_SESSION_KEY_STORAGE = 'certforge_ai_gemini_session_key_v1';
  let unlockedGeminiKey = sessionStorage.getItem(AI_GEMINI_SESSION_KEY_STORAGE) || null;
  let pendingUnlockCallback = null;

  // Keeps the in-memory variable and its sessionStorage backing in sync --
  // every unlock/lock path should go through this rather than assigning
  // unlockedGeminiKey directly.
  function setUnlockedGeminiKey(key) {
    unlockedGeminiKey = key || null;
    if (unlockedGeminiKey) {
      sessionStorage.setItem(AI_GEMINI_SESSION_KEY_STORAGE, unlockedGeminiKey);
    } else {
      sessionStorage.removeItem(AI_GEMINI_SESSION_KEY_STORAGE);
    }
  }

  // BYOK, 100% client-side: the key lives only in this browser's localStorage
  // (encrypted, once a vault PIN is set) and every call goes straight from
  // here to Google's API -- no backend, matching the rest of Certforge.
  const AI_GEMINI_KEY_STORAGE = 'certforge_ai_gemini_key_v1'; // legacy plaintext fallback, pre-vault
  const AI_GEMINI_VAULT_STORAGE = 'certforge_ai_gemini_vault_v1';
  const AI_GEMINI_MODEL_STORAGE = 'certforge_ai_gemini_model_v1';
  const AI_GEMINI_DEFAULT_MODEL = 'gemini-3.6-flash';
  const AI_VAULT_PBKDF2_ITERATIONS = 200000;

  // Concept Guides Elements
  const guideFocusShakyToggle = document.getElementById('guide-focus-shaky-toggle');
  const guideMasteryBadgeEl = document.getElementById('guide-mastery-badge');
  const btnGuideStillShaky = document.getElementById('btn-guide-still-shaky');
  const btnGuideSolid = document.getElementById('btn-guide-solid');
  const guideConfidenceBarEl = document.getElementById('guide-confidence-bar');
  const guideMenuEmptyEl = document.getElementById('guide-menu-empty');
  const guideViewerEmptyEl = document.getElementById('guide-viewer-empty');

  // Trap Spotter Elements
  const trapCardEl = document.getElementById('trap-card');
  const trapDomainTag = document.getElementById('trap-domain-tag');
  const trapStatementEl = document.getElementById('trap-statement');
  const trapWhyFailsEl = document.getElementById('trap-why-fails');
  const trapCorrectPrincipleEl = document.getElementById('trap-correct-principle');
  const trapCounterEl = document.getElementById('trap-counter');
  const trapDomainSelect = document.getElementById('trap-domain-select');
  const btnPrevTrap = document.getElementById('btn-prev-trap');
  const btnNextTrap = document.getElementById('btn-next-trap');

  // Mock Elements
  const mockSetup = document.getElementById('mock-setup');
  const mockActive = document.getElementById('mock-active');
  const mockResults = document.getElementById('mock-results');
  const btnStartMock = document.getElementById('btn-start-mock');
  const mockModeButtons = document.querySelectorAll('.mock-mode-btn');
  const mockSpecQuestionsEl = document.getElementById('mock-spec-questions');
  const mockSpecTimeEl = document.getElementById('mock-spec-time');
  const mockSpecPassingEl = document.getElementById('mock-spec-passing');
  const mockProgressEl = document.getElementById('mock-progress');
  const mockTimerEl = document.getElementById('mock-timer');
  const mockQuestionEl = document.getElementById('mock-question');
  const mockOptionsList = document.querySelector('#mock-active .quiz-options');
  const btnMockPrev = document.getElementById('btn-mock-prev');
  const btnMockNext = document.getElementById('btn-mock-next');
  const btnMockFlag = document.getElementById('btn-mock-flag');
  const btnMockFlagPrev = document.getElementById('btn-mock-flag-prev');
  const btnMockFlagNext = document.getElementById('btn-mock-flag-next');
  const resultsDomainBreakdownEl = document.getElementById('results-domain-breakdown');
  const resultsPctEl = document.getElementById('results-pct');
  const resultsStatusEl = document.getElementById('results-status');
  const resultsCorrectEl = document.getElementById('results-correct');
  const resultsDurationEl = document.getElementById('results-duration');
  const resultsVerdictEl = document.getElementById('results-verdict');
  const btnMockReset = document.getElementById('btn-mock-reset');
  const resultsPerfectNoteEl = document.getElementById('results-perfect-note');
  const btnTrainingPlan = document.getElementById('btn-training-plan');
  const trainingPlanModal = document.getElementById('training-plan-modal');
  const btnCloseTrainingPlan = document.getElementById('btn-close-training-plan');
  const trainingPlanResponseEl = document.getElementById('training-plan-response');
  const trainingPlanResponseBodyEl = document.getElementById('training-plan-response-body');
  const trainingPlanActionsEl = document.getElementById('training-plan-actions');
  const btnTrainingPlanCopy = document.getElementById('btn-training-plan-copy');
  const btnTrainingPlanPrint = document.getElementById('btn-training-plan-print');
  const btnTrainingPlanRetry = document.getElementById('btn-training-plan-retry');
  const btnTrainingPlanDrill = document.getElementById('btn-training-plan-drill');
  const trainingPlanStatusEl = document.getElementById('training-plan-status');
  const trainingPlanModalIntroEl = document.getElementById('training-plan-modal-intro');
  const btnQuizTrainingPlan = document.getElementById('btn-quiz-training-plan');
  const btnRetestMistakes = document.getElementById('btn-retest-mistakes');

  // Forms
  const formAddFlashcard = document.getElementById('form-add-flashcard');
  const formAddQuestion = document.getElementById('form-add-question');
  const flashcardStatus = document.getElementById('flashcard-form-status');
  const questionStatus = document.getElementById('question-form-status');
  const btnResetLocalData = document.getElementById('btn-reset-local-data');
  const localResetStatus = document.getElementById('local-reset-status');

  // State Variables
  let questions = [];
  let flashcards = [];
  let distractors = [];
  let bookmarks = [];
  let attempts = [];

  let currentCardIndex = 0;
  let currentQuizIndex = 0;
  let currentTrapIndex = 0;
  let filteredCards = [];
  let filteredQuestions = [];
  let filteredTraps = [];

  // Quiz answered states persisted locally
  let quizAnsweredStates = {}; // question_id -> selected_option

  // Personal mistake-tracking history, independent of the static, source-
  // authored weak_spot flag -- this reflects Josh's own actual performance
  // on each question across both Quiz and Mock Exam attempts.
  let questionHistory = {}; // question_id -> {seen, correct, incorrect, lastResult, lastSeenAt, streak}

  // A Quiz answer awaiting Submit -- the click that picks an option no
  // longer grades immediately; it locks the pick and waits for the Submit
  // button before handleQuizSelection() actually runs.
  let pendingQuizSelection = null; // { question, selectedOption } | null

  // Per-card mastery for flashcard spaced repetition: 0 = Learning (default),
  // 1 = Reviewing, 2 = Mastered. "Got It" advances a level; "Still Learning"
  // resets straight back to Learning (a simple Leitner-style progression).
  let flashcardMastery = {}; // card_id -> {level, timesReviewed, lastReviewedAt}
  const MASTERY_LEVEL_LABELS = ['Learning', 'Reviewing', 'Mastered'];
  const MASTERY_LEVEL_CLASSES = ['learning', 'reviewing', 'mastered'];

  // Same self-assessed confidence tracking as flashcard mastery, applied to
  // Concept Guides instead of cards. Keyed by the guide's stable HTML id
  // (e.g. "guide-bia") rather than a numeric content id, since guides are
  // static markup, not seed-loaded data.
  let guideMastery = {}; // guide_id -> {level, timesReviewed, lastReviewedAt}

  // Mock Exam mode: 'quick' (default, examConfig.mock_exam) or 'full'
  // (examConfig.mock_exam_full, falling back to 'quick' settings if an
  // exam hasn't defined a full-length config yet).
  let selectedMockMode = 'quick';

  // ==========================================
  // MULTI-EXAM CONFIG
  // ==========================================
  // Certforge now supports more than one certification's worth of content
  // (CISM today; CompTIA SecurityX and CISSP land later once their own content
  // is authored). ACTIVE_EXAM_ID picks which one this page instance studies.
  // The header exam-select lets a visitor switch; the choice is remembered in
  // a small, un-namespaced key (it has to live outside any single exam's
  // namespace since its whole job is picking the namespace). The storage/data
  // layer below is fully exam-scoped, so switching never mixes progress.
  const ACTIVE_EXAM_STORAGE_KEY = 'certforge_active_exam_id';
  const ACTIVE_EXAM_ID = localStorage.getItem(ACTIVE_EXAM_STORAGE_KEY) || 'cism';

  const FALLBACK_EXAM_CONFIG = {
    id: 'cism',
    name: 'CISM',
    full_name: 'Certified Information Security Manager',
    seed_file: 'data/cism_seed.json',
    seed_version: 1,
    domains: [
      { id: 1, title: 'Information Security Governance' },
      { id: 2, title: 'Information Risk Management' },
      { id: 3, title: 'Information Security Program Development & Management' },
      { id: 4, title: 'Information Security Incident Management' }
    ],
    mock_exam: { question_count: 10, time_limit_seconds: 900, passing_threshold: 70 },
    mock_exam_full: { question_count: 150, time_limit_seconds: 14400, passing_threshold: 70 }
  };

  let examManifest = null; // full data/exams_manifest.json, once loaded
  let examConfig = null;   // the ACTIVE_EXAM_ID entry within it

  async function loadExamManifest() {
    try {
      const response = await fetch('data/exams_manifest.json', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Manifest fetch failed with HTTP ${response.status}`);
      }
      examManifest = await response.json();
      examConfig = (examManifest.exams || []).find(e => e.id === ACTIVE_EXAM_ID) || FALLBACK_EXAM_CONFIG;
    } catch (e) {
      console.warn('[SYSTEM] Exam manifest unavailable. Falling back to built-in CISM config.', e);
      examManifest = { exams: [FALLBACK_EXAM_CONFIG] };
      examConfig = FALLBACK_EXAM_CONFIG;
    }
  }

  function examStorageKey(name) {
    return `certforge_${ACTIVE_EXAM_ID}_${name}`;
  }

  // Local Storage Keys -- namespaced per exam so studying for CISM, SecurityX,
  // and CISSP never mixes progress, bookmarks, or custom Curator entries.
  const STORAGE_KEYS = {
    perf: examStorageKey('performance_v1'),
    questions: examStorageKey('questions_v1'),
    flashcards: examStorageKey('flashcards_v1'),
    distractors: examStorageKey('distractors_v1'),
    bookmarks: examStorageKey('bookmarks_v1'),
    attempts: examStorageKey('attempts_v1'),
    quizAnswered: examStorageKey('quiz_answer_state_v1'),
    questionHistory: examStorageKey('question_history_v1'),
    flashcardMastery: examStorageKey('flashcard_mastery_v1'),
    guideMastery: examStorageKey('guide_mastery_v1'),
    seedInitialized: examStorageKey('seed_initialized_v1'),
    seedVersion: examStorageKey('seed_version_v1'),
    lastTab: examStorageKey('last_tab_v1'),
    aiCache: examStorageKey('ai_response_cache_v1'),
    aiTutorHistory: examStorageKey('ai_tutor_history_v1')
  };

  // Pre-multi-exam flat keys -- these were implicitly all CISM. Migrated once
  // into the certforge_cism_* namespaced keys above so this change doesn't
  // lose anyone's existing progress.
  const LEGACY_FLAT_KEYS = {
    perf: 'cism_performance_v2',
    questions: 'cism_questions_v1',
    flashcards: 'cism_flashcards_v1',
    bookmarks: 'cism_bookmarks_v1',
    attempts: 'cism_attempts_v1',
    quizAnswered: 'cism_quiz_answer_state_v1',
    seedInitialized: 'cism_seed_initialized_v1'
  };

  const LEGACY_STORAGE_KEYS = ['cism_performance_v1', 'cism_user'];

  function migrateLegacyFlatKeysToNamespaced() {
    if (ACTIVE_EXAM_ID !== 'cism') return; // only CISM ever had flat, unnamespaced keys
    Object.entries(LEGACY_FLAT_KEYS).forEach(([name, legacyKey]) => {
      const namespacedKey = STORAGE_KEYS[name];
      if (localStorage.getItem(namespacedKey) === null) {
        const legacyValue = localStorage.getItem(legacyKey);
        if (legacyValue !== null) {
          localStorage.setItem(namespacedKey, legacyValue);
        }
      }
    });
  }

  // domains starts empty and is populated lazily via getDomainPerf() -- this
  // keeps perfData agnostic to how many domains the active exam has (CISM: 4,
  // CISSP: 8) rather than hardcoding a domain count before the exam manifest
  // has even loaded.
  let perfData = {
    answered: 0,
    correct: 0,
    domains: {}
  };

  function getDomainPerf(domainId) {
    if (!perfData.domains[domainId]) {
      perfData.domains[domainId] = { answered: 0, correct: 0 };
    }
    return perfData.domains[domainId];
  }

  // Migration of legacy performance data key (pre-dates even the flat cism_* keys).
  const legacyPerf = localStorage.getItem('cism_performance_v1');
  if (legacyPerf && !localStorage.getItem(LEGACY_FLAT_KEYS.perf)) {
    localStorage.setItem(LEGACY_FLAT_KEYS.perf, legacyPerf);
    localStorage.removeItem('cism_performance_v1');
  }
  migrateLegacyFlatKeysToNamespaced();

  const loadJson = (key, fallback) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) {
        return fallback;
      }
      const parsed = JSON.parse(raw);
      return parsed ?? fallback;
    } catch (e) {
      console.error(`[SYSTEM] Failed to parse local storage key '${key}':`, e);
      return fallback;
    }
  };

  const saveJson = (key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
  };

  // ==========================================
  // AI RESPONSE CACHE
  // ==========================================
  // One cache per exam, keyed by `${type}:${id}` (e.g. "quiz:142",
  // "trap:37", "guide:guide-riskassess"). Storing the seed_version a cache
  // was written under means a future content update (new/edited questions,
  // guides, etc. -- the same seed_version bump ensureSeedData() already uses
  // to migrate seed content) automatically invalidates old explanations
  // instead of them silently going stale next to revised material.
  function loadAiCacheStore() {
    const store = loadJson(STORAGE_KEYS.aiCache, null);
    const currentSeedVersion = Number(examConfig?.seed_version || 1);
    if (!store || store.seedVersion !== currentSeedVersion) {
      return { seedVersion: currentSeedVersion, entries: {} };
    }
    return store;
  }

  function getCachedAiResponse(cacheKey) {
    if (!cacheKey) return null;
    return loadAiCacheStore().entries[cacheKey] || null;
  }

  function setCachedAiResponse(cacheKey, text, model) {
    if (!cacheKey) return;
    const store = loadAiCacheStore();
    store.entries[cacheKey] = { text, model, ts: Date.now() };
    saveJson(STORAGE_KEYS.aiCache, store);
  }

  function formatRelativeTime(ts) {
    const mins = Math.round((Date.now() - ts) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.round(hours / 24);
    if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
    const months = Math.round(days / 30);
    return `${months} month${months === 1 ? '' : 's'} ago`;
  }

  // Shared response formatting for every "ask Gemini" surface (Quiz/Trap
  // Spotter/Guides via wireAiExplainButton(), and the post-exam AI Training
  // Plan) -- one small meta line (cached vs. fresh, when, which model), the
  // main text, an optional visually separated callout split out of a known
  // trailing section (each feature's system prompt is instructed to always
  // end with an exact heading, so splitting on it is reliable), and a
  // standing disclaimer. Keeping this in one place means every AI surface in
  // the app looks and feels like the same feature instead of drifting apart.
  function buildAiResponseHtml(text, { cached, model, ts }, { calloutMarker, calloutLabel, disclaimer } = {}) {
    const metaLine = cached
      ? `🕓 Cached · asked ${formatRelativeTime(ts)} · ${escapeHtml(model || 'Gemini')}`
      : `✨ Fresh answer · just now · ${escapeHtml(model || 'Gemini')}`;

    const markerIndex = calloutMarker ? text.indexOf(calloutMarker) : -1;
    const mainText = markerIndex === -1 ? text.trim() : text.slice(0, markerIndex).trim();
    const callout = markerIndex === -1 ? '' : text.slice(markerIndex + calloutMarker.length).trim();

    let html = `<div class="ai-response-meta">${metaLine}</div>`;
    html += `<div class="ai-response-text">${escapeHtml(mainText)}</div>`;
    if (callout) {
      html += `<div class="ai-response-hook"><span class="ai-response-hook-label">${escapeHtml(calloutLabel || '')}</span>${escapeHtml(callout)}</div>`;
    }
    html += `<div class="ai-response-disclaimer">${escapeHtml(disclaimer || `AI-generated — cross-check against the rationale above and your official ${getExamName()} materials.`)}</div>`;
    return html;
  }

  const ensureNumericIds = items => {
    if (!Array.isArray(items)) {
      return [];
    }
    return items.map((item, idx) => {
      const candidate = Number(item?.id);
      const id = Number.isFinite(candidate) && candidate > 0 ? candidate : idx + 1;
      return { ...item, id };
    });
  };

  const nextLocalId = items => {
    if (!Array.isArray(items) || items.length === 0) {
      return 1;
    }
    return items.reduce((maxId, item) => {
      const value = Number(item?.id);
      return Number.isFinite(value) && value > maxId ? value : maxId;
    }, 0) + 1;
  };

  // Size of the original placeholder seed, before per-item "seed" tagging existed.
  // Used once, only for local data that predates this migration, to tell seed
  // content apart from anything already added via the Deck Curator.
  const PRE_TAGGING_SEED_COUNTS = { questions: 140, flashcards: 150 };

  function tagUntaggedLegacyItems(items, originalSeedCount) {
    return items.map(item => {
      if (item.seed === true || item.seed === false) return item; // already tagged, leave as-is
      return { ...item, seed: Number(item.id) <= originalSeedCount };
    });
  }

  async function ensureSeedData() {
    const storedSeedVersion = Number(localStorage.getItem(STORAGE_KEYS.seedVersion) || 0);
    const manifestSeedVersion = Number(examConfig?.seed_version || 1);
    const needsSeedUpgrade = manifestSeedVersion > storedSeedVersion;
    const alreadyInitialized = localStorage.getItem(STORAGE_KEYS.seedInitialized) === '1';

    if (alreadyInitialized && !needsSeedUpgrade) {
      // Local data (seed content + any custom Curator additions) is already current.
      return;
    }

    const existingQuestions = tagUntaggedLegacyItems(
      ensureNumericIds(loadJson(STORAGE_KEYS.questions, [])),
      PRE_TAGGING_SEED_COUNTS.questions
    );
    const existingFlashcards = tagUntaggedLegacyItems(
      ensureNumericIds(loadJson(STORAGE_KEYS.flashcards, [])),
      PRE_TAGGING_SEED_COUNTS.flashcards
    );

    try {
      const seedFile = examConfig?.seed_file || FALLBACK_EXAM_CONFIG.seed_file;
      const response = await fetch(seedFile, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Seed fetch failed with HTTP ${response.status}`);
      }

      const seedData = await response.json();
      const freshSeedQuestions = (seedData?.questions ?? []).map(q => ({ ...q, seed: true }));
      const freshSeedFlashcards = (seedData?.flashcards ?? []).map(c => ({ ...c, seed: true }));
      const freshSeedDistractors = seedData?.distractors ?? [];

      // Only seed-sourced items get replaced on a version bump -- anything the
      // user added themselves via the Deck Curator survives untouched.
      const keptCustomQuestions = alreadyInitialized ? existingQuestions.filter(q => q.seed !== true) : [];
      const keptCustomFlashcards = alreadyInitialized ? existingFlashcards.filter(c => c.seed !== true) : [];

      saveJson(STORAGE_KEYS.questions, ensureNumericIds([...freshSeedQuestions, ...keptCustomQuestions]));
      saveJson(STORAGE_KEYS.flashcards, ensureNumericIds([...freshSeedFlashcards, ...keptCustomFlashcards]));
      saveJson(STORAGE_KEYS.distractors, freshSeedDistractors);

      if (!alreadyInitialized) {
        saveJson(STORAGE_KEYS.bookmarks, []);
        saveJson(STORAGE_KEYS.attempts, []);
        saveJson(STORAGE_KEYS.quizAnswered, {});
        saveJson(STORAGE_KEYS.questionHistory, {});
        saveJson(STORAGE_KEYS.flashcardMastery, {});
        saveJson(STORAGE_KEYS.guideMastery, {});
      }
      localStorage.setItem(STORAGE_KEYS.seedInitialized, '1');
      localStorage.setItem(STORAGE_KEYS.seedVersion, String(manifestSeedVersion));
    } catch (e) {
      if (alreadyInitialized) {
        // Upgrade failed (offline, bad seed file, etc). Keep existing local data as-is.
        console.warn('[SYSTEM] Seed upgrade unavailable this load. Keeping existing local data.', e);
        saveJson(STORAGE_KEYS.questions, ensureNumericIds(existingQuestions));
        saveJson(STORAGE_KEYS.flashcards, ensureNumericIds(existingFlashcards));
        return;
      }
      console.warn('[SYSTEM] Seed file unavailable. Starting with empty local datasets.', e);
      saveJson(STORAGE_KEYS.questions, []);
      saveJson(STORAGE_KEYS.flashcards, []);
      saveJson(STORAGE_KEYS.distractors, []);
      saveJson(STORAGE_KEYS.bookmarks, []);
      saveJson(STORAGE_KEYS.attempts, []);
      saveJson(STORAGE_KEYS.quizAnswered, {});
      saveJson(STORAGE_KEYS.questionHistory, {});
      saveJson(STORAGE_KEYS.flashcardMastery, {});
      saveJson(STORAGE_KEYS.guideMastery, {});
      localStorage.setItem(STORAGE_KEYS.seedInitialized, '1');
    }
  }

  function loadUserStats() {
    const savedPerf = loadJson(STORAGE_KEYS.perf, null);
    if (savedPerf) {
      perfData = savedPerf;
    } else {
      resetPerfData();
    }
  }

  function resetPerfData() {
    perfData = {
      answered: 0,
      correct: 0,
      domains: {}
    };
  }

  function saveUserStats() {
    saveJson(STORAGE_KEYS.perf, perfData);
  }

  // Mock Exam Variables
  let mockQuestions = [];
  let mockAnswers = {}; // mock_question_index -> selected_option
  // Captured at grading time in submitMockExam(), consumed only if the
  // student clicks "Build My Training Plan" on the results screen. Not
  // itself persisted (overwritten by the next attempt), but its
  // attemptRecord field points at the actual object living in `attempts` --
  // see runTrainingPlanRequest(), which writes the generated plan onto that
  // record and re-saves STORAGE_KEYS.attempts so it survives past this
  // attempt (no re-spending a Gemini call just to re-read the same plan).
  let lastMockDiagnostics = null; // { mode, scorePct, correctCount, totalCount, missedByKs: [...], attemptRecord }
  // Whichever diagnostics object is currently loaded into the training plan
  // modal -- lastMockDiagnostics (mock exam) or a freshly-built quiz-mistakes
  // one (see buildQuizMistakesDiagnostics()). Set by openTrainingPlanModal()
  // so buildTrainingPlanPrompt()/runTrainingPlanRequest()/the drill button
  // all work off one shared pipeline regardless of which entry point opened it.
  let activeTrainingPlanDiag = null;
  // Raw plain-text plan behind whatever's currently rendered in the
  // training plan modal -- kept separately from the DOM so "Copy to
  // clipboard" copies clean text instead of the rendered HTML structure's
  // concatenated textContent (meta line/body/callout/disclaimer squished
  // together with no line breaks).
  let lastTrainingPlanText = '';
  let mockCurrentIndex = 0;
  let mockTimeRemaining = 900; // 15 mins
  let mockTimerInterval;
  let mockSecondsElapsed = 0;

  // Donut circumference (2 * PI * r) where r = 28
  const CIRCUMFERENCE = 2 * Math.PI * 28; // ~175.9

  // ==========================================
  // INITIALIZATION & TAB SWITCHING
  // ==========================================

  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const target = btn.dataset.target;
      document.getElementById(target).classList.add('active');
      localStorage.setItem(STORAGE_KEYS.lastTab, target);
    });
  });

  // Restore whichever tab Josh was last working in for this exam. Falls back
  // to the Flashcards tab already marked active in the HTML if nothing's
  // been saved yet, or if the saved tab id no longer exists.
  const savedTab = localStorage.getItem(STORAGE_KEYS.lastTab);
  if (savedTab) {
    const savedTabBtn = Array.from(tabButtons).find(b => b.dataset.target === savedTab);
    if (savedTabBtn) savedTabBtn.click();
  }

  // Concept Guides Sidebar Selectors
  const guideMenuItems = document.querySelectorAll('.guide-menu-item');
  const guideDetails = document.querySelectorAll('.guide-detail');

  guideMenuItems.forEach(item => {
    item.addEventListener('click', () => {
      // Deactivate menu items
      guideMenuItems.forEach(mi => mi.classList.remove('active'));
      // Activate clicked item
      item.classList.add('active');

      // Hide all details
      guideDetails.forEach(detail => detail.classList.remove('active'));
      // Show selected detail
      const targetGuideId = item.dataset.guide;
      const targetGuideEl = document.getElementById(targetGuideId);
      if (targetGuideEl) {
        targetGuideEl.classList.add('active');
      }
      updateGuideConfidenceBar();
      guideAiExplainHandle?.reset();
      guideAiExplainHandle?.showCachedIfAny();
    });
  });

  // Initial stats load
  loadUserStats();

  // ==========================================
  // Local Data Loaders
  // ==========================================
  
  async function loadData() {
    await loadExamManifest();
    renderExamChrome();
    await ensureSeedData();

    questions = ensureNumericIds(loadJson(STORAGE_KEYS.questions, []));
    flashcards = ensureNumericIds(loadJson(STORAGE_KEYS.flashcards, []));
    distractors = loadJson(STORAGE_KEYS.distractors, []);
    bookmarks = loadJson(STORAGE_KEYS.bookmarks, []);
    attempts = loadJson(STORAGE_KEYS.attempts, []);
    quizAnsweredStates = loadJson(STORAGE_KEYS.quizAnswered, {});
    questionHistory = loadJson(STORAGE_KEYS.questionHistory, {});
    flashcardMastery = loadJson(STORAGE_KEYS.flashcardMastery, {});
    guideMastery = loadJson(STORAGE_KEYS.guideMastery, {});
    aiTutorHistory = loadJson(STORAGE_KEYS.aiTutorHistory, []);

    initFlashcards();
    initQuiz();
    initAiExplain();
    initAiTutor();
    initTrapSpotter();
    initGuides();
    updateDashboardStats();
    buildSearchIndex();
  }

  // Everything that depends on knowing which exam is active and how many
  // domains it has: the header title/switcher, the dashboard mastery grid,
  // and every domain-filter <select> on the page.
  function renderExamChrome() {
    const cfg = examConfig || FALLBACK_EXAM_CONFIG;

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
    populateDomainSelect(document.getElementById('curator-flashcard-domain-select'), false);
    populateDomainSelect(document.getElementById('curator-question-domain-select'), false);
    populateResetDomainOptions();
    updateMockSpecsDisplay();
  }

  function updateDashboardStats() {
    // Answered & accuracy
    statAnsweredEl.textContent = perfData.answered;
    const accuracy = perfData.answered > 0 ? Math.round((perfData.correct / perfData.answered) * 100) : 0;
    statAccuracyEl.textContent = `${accuracy}%`;

    // Flagged count
    statFlaggedEl.textContent = bookmarks.length;

    // Mock Exams Passed (score >= exam's passing threshold)
    const dashPassingThreshold = ((examConfig || FALLBACK_EXAM_CONFIG).mock_exam || FALLBACK_EXAM_CONFIG.mock_exam).passing_threshold;
    const passedCount = attempts.filter(a => a.score >= dashPassingThreshold).length;
    statPassedEl.textContent = passedCount;

    // Domain Mastery Progress Circles -- one per domain in the active exam,
    // however many that is. The circle now tracks % of that domain's
    // question bank completed (answered / total), independent of how well
    // it's going; accuracy moves to the "testing confidence" line below,
    // colored with the same red/orange/green tiering the circle used to use.
    const domainList = (examConfig || FALLBACK_EXAM_CONFIG).domains || [];
    domainList.forEach(d => {
      const dData = getDomainPerf(d.id);
      const totalInDomain = questions.filter(q => q.domain === d.id).length;
      const completedPct = totalInDomain > 0 ? Math.round((dData.answered / totalInDomain) * 100) : 0;
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
  }

  // Builds the dashboard's domain-mastery circle grid from scratch based on
  // the active exam's domain list -- works whether there are 4 domains (CISM)
  // or 8 (CISSP), instead of a fixed set of hardcoded cards.
  function renderDomainMasteryGrid() {
    if (!domainsGridEl) return;
    const domainList = (examConfig || FALLBACK_EXAM_CONFIG).domains || [];
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

  // Fills a <select> with one <option> per domain in the active exam.
  // includeAll adds a leading "All Domains" option (used by filter selects,
  // skipped by the Curator's required single-domain selects).
  function populateDomainSelect(selectEl, includeAll) {
    if (!selectEl) return;
    const domainList = (examConfig || FALLBACK_EXAM_CONFIG).domains || [];
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

  function savePerformance() {
    saveUserStats();
    updateDashboardStats();
  }

  // Builds the "Domain Mastery" optgroup in the local-data reset dropdown --
  // one entry per domain in the active exam, plus an "all domains" shortcut.
  function populateResetDomainOptions() {
    const optgroup = document.getElementById('reset-domain-optgroup');
    if (!optgroup) return;
    const domainList = (examConfig || FALLBACK_EXAM_CONFIG).domains || [];
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

  // Clears mastery progress (answered/correct tally, per-question history, and
  // in-progress quiz answer state) for a single domain. Bookmarks, mock exam
  // history, and custom Curator content are untouched.
  function resetDomainProgress(domainId) {
    perfData.domains[domainId] = { answered: 0, correct: 0 };
    saveUserStats();

    const domainQuestionIds = questions
      .filter(q => String(q.domain) === String(domainId))
      .map(q => q.id);

    domainQuestionIds.forEach(qid => {
      delete questionHistory[qid];
      delete quizAnsweredStates[qid];
    });
    saveJson(STORAGE_KEYS.questionHistory, questionHistory);
    saveJson(STORAGE_KEYS.quizAnswered, quizAnsweredStates);
  }

  // ==========================================
  // PERSONAL MISTAKE TRACKING
  // ==========================================
  // Tracks Josh's own hit/miss history per question across both Quiz and Mock
  // Exam attempts, independent of the static, source-authored weak_spot flag.
  // "streak" is consecutive correct answers since the last miss -- once a
  // previously-missed question has been answered correctly twice in a row,
  // isPersonalMistake() retires it from the "My Mistakes" filter.
  function recordQuestionHistory(questionId, isCorrect) {
    const entry = questionHistory[questionId] || {
      seen: 0,
      correct: 0,
      incorrect: 0,
      lastResult: null,
      lastSeenAt: null,
      streak: 0
    };
    entry.seen++;
    if (isCorrect) {
      entry.correct++;
      entry.streak++;
    } else {
      entry.incorrect++;
      entry.streak = 0;
    }
    entry.lastResult = isCorrect ? 'correct' : 'incorrect';
    entry.lastSeenAt = new Date().toISOString();
    questionHistory[questionId] = entry;
    saveJson(STORAGE_KEYS.questionHistory, questionHistory);
  }

  function isPersonalMistake(questionId) {
    const entry = questionHistory[questionId];
    return !!entry && entry.incorrect > 0 && entry.streak < 2;
  }

  // ==========================================
  // FLASHCARD MASTERY (SPACED REPETITION)
  // ==========================================
  // A lightweight 3-level Leitner-style progression driven by Josh's own
  // self-assessment after flipping a card, rather than a fixed calendar
  // schedule -- simpler to reason about for a single-user offline app while
  // still surfacing what he hasn't nailed down yet via "Focus on Unlearned."
  function getMasteryLevel(cardId) {
    const entry = flashcardMastery[cardId];
    return entry ? entry.level : 0;
  }

  function setCardAssessment(cardId, gotIt) {
    const entry = flashcardMastery[cardId] || { level: 0, timesReviewed: 0, lastReviewedAt: null };
    entry.timesReviewed++;
    entry.lastReviewedAt = new Date().toISOString();
    entry.level = gotIt ? Math.min(entry.level + 1, 2) : 0;
    flashcardMastery[cardId] = entry;
    saveJson(STORAGE_KEYS.flashcardMastery, flashcardMastery);
  }

  // ==========================================
  // CONCEPT GUIDE CONFIDENCE TRACKING
  // ==========================================
  // Same Leitner-style self-assessment as flashcard mastery (0 Learning /
  // 1 Reviewing / 2 Mastered), but per concept guide. Drives a small colored
  // dot on each sidebar menu item and a "Focus on Shaky" filter that hides
  // guides already marked Mastered, so Josh can jump straight to what still
  // needs work without scrolling past guides he's already solid on.
  function getGuideMasteryLevel(guideId) {
    const entry = guideMastery[guideId];
    return entry ? entry.level : 0;
  }

  function setGuideAssessment(guideId, gotIt) {
    const entry = guideMastery[guideId] || { level: 0, timesReviewed: 0, lastReviewedAt: null };
    entry.timesReviewed++;
    entry.lastReviewedAt = new Date().toISOString();
    entry.level = gotIt ? Math.min(entry.level + 1, 2) : 0;
    guideMastery[guideId] = entry;
    saveJson(STORAGE_KEYS.guideMastery, guideMastery);
  }

  function isGuideForActiveExam(item) {
    return !item.dataset.exam || item.dataset.exam === ACTIVE_EXAM_ID;
  }

  function getActiveGuideItem() {
    return Array.from(guideMenuItems).find(mi => mi.classList.contains('active')) ||
      Array.from(guideMenuItems).find(isGuideForActiveExam);
  }

  function refreshGuideMenuItemDot(item) {
    let dot = item.querySelector('.guide-mastery-dot');
    if (!dot) {
      dot = document.createElement('span');
      dot.className = 'guide-mastery-dot';
      item.appendChild(dot);
    }
    const level = getGuideMasteryLevel(item.dataset.guide);
    dot.className = `guide-mastery-dot ${MASTERY_LEVEL_CLASSES[level]}`;
  }

  function refreshAllGuideDots() {
    guideMenuItems.forEach(refreshGuideMenuItemDot);
  }

  // Hides (rather than removes) already-Mastered guides from the sidebar
  // list when the toggle is on -- mirrors "Focus on Unlearned" for
  // flashcards -- and, separately, hides any guide authored for a
  // different exam than the one currently active (data-exam scoping).
  // Guides are authored incrementally per exam (CISM has a full set today;
  // other exams fill in over time), so it's normal for this to leave zero
  // guides visible for an exam that has none yet -- that's handled below
  // rather than falling through to a stranded/wrong-exam guide.
  function filterGuideMenu() {
    const focusShaky = guideFocusShakyToggle && guideFocusShakyToggle.checked;
    let anyVisible = false;
    let examHasAnyGuides = false;
    guideMenuItems.forEach(item => {
      const examMatch = isGuideForActiveExam(item);
      if (examMatch) examHasAnyGuides = true;
      const level = getGuideMasteryLevel(item.dataset.guide);
      item.hidden = !examMatch || (focusShaky && level >= 2);
      if (!item.hidden) anyVisible = true;
    });

    if (guideMenuEmptyEl) {
      guideMenuEmptyEl.hidden = anyVisible;
      if (!anyVisible) {
        guideMenuEmptyEl.textContent = examHasAnyGuides
          ? 'Every guide for this exam is marked Solid -- turn off "Focus on Shaky" to see them all.'
          : 'No concept guides for this exam yet -- check back as new content lands.';
      }
    }

    if (!anyVisible) {
      // Nothing to show for this exam right now -- clear any stale active
      // state instead of stranding the viewer on a hidden guide.
      guideMenuItems.forEach(mi => mi.classList.remove('active'));
      guideDetails.forEach(detail => detail.classList.remove('active'));
      if (guideViewerEmptyEl) guideViewerEmptyEl.hidden = false;
      if (guideConfidenceBarEl) guideConfidenceBarEl.hidden = true;
      return;
    }

    if (guideViewerEmptyEl) guideViewerEmptyEl.hidden = true;
    if (guideConfidenceBarEl) guideConfidenceBarEl.hidden = false;

    // If the currently active guide just got hidden (or nothing is marked
    // active yet), jump to the first still-visible one so the viewer never
    // strands on a hidden or wrong-exam selection.
    const activeItem = Array.from(guideMenuItems).find(mi => mi.classList.contains('active'));
    if (!activeItem || activeItem.hidden) {
      const firstVisible = Array.from(guideMenuItems).find(mi => !mi.hidden);
      if (firstVisible) firstVisible.click();
    }
  }

  function updateGuideConfidenceBar() {
    if (!guideMasteryBadgeEl) return;
    const activeItem = getActiveGuideItem();
    if (!activeItem) return;
    const level = getGuideMasteryLevel(activeItem.dataset.guide);
    guideMasteryBadgeEl.textContent = MASTERY_LEVEL_LABELS[level];
    guideMasteryBadgeEl.className = `mastery-badge ${MASTERY_LEVEL_CLASSES[level]}`;
  }

  function handleGuideAssessment(gotIt) {
    const activeItem = getActiveGuideItem();
    if (!activeItem) return;
    setGuideAssessment(activeItem.dataset.guide, gotIt);
    refreshGuideMenuItemDot(activeItem);
    updateGuideConfidenceBar();
    if (guideFocusShakyToggle && guideFocusShakyToggle.checked) {
      filterGuideMenu(); // may jump off a guide that just became Mastered
    }
  }

  function initGuides() {
    refreshAllGuideDots();
    filterGuideMenu();
    updateGuideConfidenceBar();

    if (guideFocusShakyToggle) {
      guideFocusShakyToggle.addEventListener('change', () => {
        guideFocusShakyToggle.closest('.weak-spot-toggle')?.classList.toggle('checked', guideFocusShakyToggle.checked);
        filterGuideMenu();
      });
    }

    if (btnGuideStillShaky) {
      btnGuideStillShaky.addEventListener('click', () => handleGuideAssessment(false));
    }
    if (btnGuideSolid) {
      btnGuideSolid.addEventListener('click', () => handleGuideAssessment(true));
    }
  }

  // ==========================================
  // ANSWER OPTION RANDOMIZATION
  // ==========================================
  // Session-scoped cache of a shuffled A/B/C/D display order per question id.
  // IMPORTANT: this only changes the on-screen POSITION/LABEL of each option.
  // Grading, storage (quizAnsweredStates, mockAnswers), and rationale lookups
  // all continue to key off the question's ORIGINAL letter (opt.key) --
  // q.correct_option, rationale_a..rationale_d, dataset.key, and every click
  // handler comparison are completely unaffected by the shuffle.
  const questionOptionOrder = new Map();

  function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function getOptionOrder(q) {
    if (!questionOptionOrder.has(q.id)) {
      questionOptionOrder.set(q.id, shuffleArray(['A', 'B', 'C', 'D']));
    }
    return questionOptionOrder.get(q.id);
  }

  // Builds the option list for rendering: `key` is the ORIGINAL letter (drives
  // grading/storage/dataset), `displayLetter` is the shuffled on-screen label.
  function getDisplayOptions(q) {
    const displayLetters = ['A', 'B', 'C', 'D'];
    return getOptionOrder(q).map((originalKey, idx) => ({
      key: originalKey,
      displayLetter: displayLetters[idx],
      text: q[`option_${originalKey.toLowerCase()}`],
      rationale: q[`rationale_${originalKey.toLowerCase()}`]
    }));
  }

  // ==========================================
  // FLASHCARDS CONSOLE
  // ==========================================
  
  function initFlashcards() {
    filterFlashcards();
    
    // Card flipping listener -- the self-assessment buttons only make sense
    // once the definition side is showing, so they follow the flip state.
    flashcardEl.addEventListener('click', () => {
      const nowFlipped = flashcardEl.classList.toggle('flipped');
      if (flashcardAssessmentEl) flashcardAssessmentEl.hidden = !nowFlipped;
    });

    // Domain filter changes
    flashcardDomainSelect.addEventListener('change', () => {
      filterFlashcards();
    });

    // Weak Spot Only toggle
    if (flashcardWeakSpotToggle) {
      flashcardWeakSpotToggle.addEventListener('change', () => {
        flashcardWeakSpotToggle.closest('.weak-spot-toggle')?.classList.toggle('checked', flashcardWeakSpotToggle.checked);
        filterFlashcards();
      });
    }

    // Focus on Unlearned toggle -- personal spaced-repetition mastery, not weak_spot
    if (flashcardUnlearnedToggle) {
      flashcardUnlearnedToggle.addEventListener('change', () => {
        flashcardUnlearnedToggle.closest('.weak-spot-toggle')?.classList.toggle('checked', flashcardUnlearnedToggle.checked);
        filterFlashcards();
      });
    }

    // Self-assessment -- "Got It" advances a level (capped at Mastered),
    // "Still Learning" resets straight back to Learning.
    if (btnCardStillLearning) {
      btnCardStillLearning.addEventListener('click', () => handleCardAssessment(false));
    }
    if (btnCardGotIt) {
      btnCardGotIt.addEventListener('click', () => handleCardAssessment(true));
    }

    btnPrevCard.addEventListener('click', () => {
      if (currentCardIndex > 0) {
        currentCardIndex--;
        renderFlashcard();
      }
    });

    btnNextCard.addEventListener('click', () => {
      if (currentCardIndex < filteredCards.length - 1) {
        currentCardIndex++;
        renderFlashcard();
      }
    });
  }

  function filterFlashcards() {
    const domainVal = flashcardDomainSelect.value;
    let pool = flashcards;
    if (domainVal !== 'all') {
      const dNum = parseInt(domainVal);
      pool = pool.filter(c => c.domain === dNum);
    }
    if (flashcardWeakSpotToggle && flashcardWeakSpotToggle.checked) {
      pool = pool.filter(c => c.weak_spot === true);
    }
    if (flashcardUnlearnedToggle && flashcardUnlearnedToggle.checked) {
      pool = pool.filter(c => getMasteryLevel(c.id) < 2);
    }
    filteredCards = pool;

    currentCardIndex = 0;
    renderFlashcard();
  }

  // Records a self-assessment for the current card, then advances -- unless
  // the Focus on Unlearned filter is active and the card just got mastered,
  // in which case it should drop out of the pool immediately.
  function handleCardAssessment(gotIt) {
    if (filteredCards.length === 0) return;
    const card = filteredCards[currentCardIndex];
    setCardAssessment(card.id, gotIt);

    if (flashcardUnlearnedToggle && flashcardUnlearnedToggle.checked) {
      filterFlashcards(); // rebuilds the pool (dropping newly-mastered cards) and re-renders
      return;
    }

    if (currentCardIndex < filteredCards.length - 1) {
      currentCardIndex++;
    }
    renderFlashcard();
  }

  function renderFlashcard() {
    flashcardEl.classList.remove('flipped'); // reset orientation
    if (flashcardAssessmentEl) flashcardAssessmentEl.hidden = true; // only shown once flipped again

    if (filteredCards.length === 0) {
      const weakOnly = flashcardWeakSpotToggle && flashcardWeakSpotToggle.checked;
      const unlearnedOnly = flashcardUnlearnedToggle && flashcardUnlearnedToggle.checked;
      cardDomainTag.textContent = 'NONE';
      cardTermEl.textContent = 'No Flashcards Found';
      cardDefinitionEl.textContent = unlearnedOnly
        ? "Every card in this domain is marked Mastered. Turn off Focus on Unlearned to review them anyway."
        : weakOnly
        ? 'No weak-spot flashcards in this domain. Try a different domain or turn off Weak Spots Only.'
        : 'Please insert custom flashcards via the Curator panel.';
      cardCounterEl.textContent = '0 / 0';
      if (cardMasteryBadgeEl) cardMasteryBadgeEl.hidden = true;
      btnPrevCard.disabled = true;
      btnNextCard.disabled = true;
      return;
    }

    const card = filteredCards[currentCardIndex];
    cardDomainTag.textContent = card.weak_spot ? `Domain ${card.domain} · ⚠ Weak Spot` : `Domain ${card.domain}`;
    cardTermEl.textContent = card.term;
    cardDefinitionEl.textContent = card.definition;
    cardCounterEl.textContent = `${currentCardIndex + 1} / ${filteredCards.length}`;

    if (cardMasteryBadgeEl) {
      cardMasteryBadgeEl.hidden = false;
      const level = getMasteryLevel(card.id);
      cardMasteryBadgeEl.textContent = MASTERY_LEVEL_LABELS[level];
      cardMasteryBadgeEl.className = `mastery-badge ${MASTERY_LEVEL_CLASSES[level]}`;
    }

    if (card.why_it_matters) {
      cardWhyMattersEl.textContent = card.why_it_matters;
      cardWhyMattersBlock.hidden = false;
    } else {
      cardWhyMattersBlock.hidden = true;
    }

    if (card.common_trap) {
      cardCommonTrapEl.textContent = card.common_trap;
      cardCommonTrapBlock.hidden = false;
    } else {
      cardCommonTrapBlock.hidden = true;
    }

    btnPrevCard.disabled = currentCardIndex === 0;
    btnNextCard.disabled = currentCardIndex === filteredCards.length - 1;
  }

  // ==========================================
  // PRACTICE QUIZ CONSOLE
  // ==========================================
  
  function initQuiz() {
    filterQuizQuestions();

    // Domain filter changes
    if (quizDomainSelect) {
      quizDomainSelect.addEventListener('change', () => {
        filterQuizQuestions();
      });
    }

    btnPrevQuiz.addEventListener('click', () => {
      if (currentQuizIndex > 0) {
        currentQuizIndex--;
        renderQuizQuestion();
        scrollQuizToTop();
      }
    });

    btnNextQuiz.addEventListener('click', () => {
      if (currentQuizIndex < filteredQuestions.length - 1) {
        currentQuizIndex++;
        renderQuizQuestion();
        scrollQuizToTop();
      }
    });

    // Weak Spot Only toggle
    if (quizWeakSpotToggle) {
      quizWeakSpotToggle.addEventListener('change', () => {
        quizWeakSpotToggle.closest('.weak-spot-toggle')?.classList.toggle('checked', quizWeakSpotToggle.checked);
        filterQuizQuestions();
      });
    }

    // My Mistakes toggle -- personal performance history, not the static weak_spot flag
    if (quizMistakesToggle) {
      quizMistakesToggle.addEventListener('change', () => {
        quizMistakesToggle.closest('.weak-spot-toggle')?.classList.toggle('checked', quizMistakesToggle.checked);
        filterQuizQuestions();
      });
    }

    // Retest Mistakes -- bulk-clears quizAnsweredStates for every question
    // currently flagged as an open mistake (isPersonalMistake), so they
    // render fresh and clickable again instead of stuck in the locked
    // "here's what you picked" review view. questionHistory (streak /
    // incorrect counts) is left untouched -- answering again just feeds the
    // existing streak logic, same as any other quiz attempt.
    if (btnRetestMistakes) {
      btnRetestMistakes.addEventListener('click', () => {
        const mistakeIds = questions.filter(q => isPersonalMistake(q.id)).map(q => q.id);
        if (mistakeIds.length === 0) {
          showToast('No open mistakes right now — nice work!');
          return;
        }
        mistakeIds.forEach(qid => delete quizAnsweredStates[qid]);
        saveJson(STORAGE_KEYS.quizAnswered, quizAnsweredStates);

        // Make sure what's on screen actually matches what just got cleared --
        // scope to My Mistakes and drop any domain/weak-spot narrowing that
        // could otherwise hide some of the reset questions.
        if (quizMistakesToggle) {
          quizMistakesToggle.checked = true;
          quizMistakesToggle.closest('.weak-spot-toggle')?.classList.add('checked');
        }
        if (quizWeakSpotToggle && quizWeakSpotToggle.checked) {
          quizWeakSpotToggle.checked = false;
          quizWeakSpotToggle.closest('.weak-spot-toggle')?.classList.remove('checked');
        }
        if (quizDomainSelect) quizDomainSelect.value = 'all';

        filterQuizQuestions();
        showToast(`Retesting ${mistakeIds.length} mistake${mistakeIds.length === 1 ? '' : 's'}`);
      });
    }

    // Show All Questions toggle -- default pool is unanswered-only (see
    // filterQuizQuestions) so returning to the tab always picks up where you
    // left off instead of restarting at question 1. Checking this includes
    // already-answered questions too.
    if (quizShowAllToggle) {
      quizShowAllToggle.addEventListener('change', () => {
        quizShowAllToggle.closest('.weak-spot-toggle')?.classList.toggle('checked', quizShowAllToggle.checked);
        filterQuizQuestions();
      });
    }

    // Submit -- commits and grades the pending selection (see the option
    // click handler in renderQuizQuestion()).
    if (quizSubmitBtnEl) {
      quizSubmitBtnEl.addEventListener('click', () => {
        if (!pendingQuizSelection) return;
        const { question, selectedOption } = pendingQuizSelection;
        pendingQuizSelection = null;
        if (quizSubmitRowEl) quizSubmitRowEl.hidden = true;
        handleQuizSelection(question, selectedOption);
      });
    }

    // Bookmark Toggle
    btnQuizBookmark.addEventListener('click', () => {
      if (filteredQuestions.length === 0) return;
      const q = filteredQuestions[currentQuizIndex];
      const isBookmarked = isItemBookmarked('question', q.id);

      if (!isBookmarked) {
        bookmarks.push({ item_type: 'question', item_id: q.id });
        btnQuizBookmark.classList.add('active');
        showToast('Bookmarked for review');
      } else {
        bookmarks = bookmarks.filter(b => !(b.item_type === 'question' && b.item_id === q.id));
        btnQuizBookmark.classList.remove('active');
        showToast('Bookmark removed', 'removed');
      }

      saveJson(STORAGE_KEYS.bookmarks, bookmarks);
      updateDashboardStats();
    });
  }

  // Brings the domain/counter header for the new question back into view.
  // Without this, moving Prev/Next while scrolled down to review a longer
  // question's options and explanation leaves you scrolled to that same
  // spot, so the new question's opening text is off-screen above the fold.
  function scrollQuizToTop() {
    const target = document.querySelector('#tab-quiz .quiz-header') || quizQuestionEl;
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function filterQuizQuestions() {
    let pool = questions;
    const domainVal = quizDomainSelect ? quizDomainSelect.value : 'all';
    if (domainVal !== 'all') {
      const dNum = parseInt(domainVal);
      pool = pool.filter(q => q.domain === dNum);
    }
    if (quizWeakSpotToggle && quizWeakSpotToggle.checked) {
      pool = pool.filter(q => q.weak_spot === true);
    }
    if (quizMistakesToggle && quizMistakesToggle.checked) {
      pool = pool.filter(q => isPersonalMistake(q.id));
    }
    // Default view: only unanswered questions, so coming back to this tab
    // resumes where you left off instead of starting at question 1 again.
    if (!(quizShowAllToggle && quizShowAllToggle.checked)) {
      pool = pool.filter(q => !quizAnsweredStates.hasOwnProperty(q.id));
    }
    // With All Domains selected, the underlying question bank is stored one
    // domain block at a time -- shuffle so domains interleave instead of
    // working through Domain 1 in full before ever seeing Domain 2, etc.
    // A single-domain filter is already a coherent block, so leave it as-is.
    filteredQuestions = domainVal === 'all' ? shuffleArray(pool) : pool;
    currentQuizIndex = 0;
    renderQuizQuestion();
  }

  function isItemBookmarked(type, id) {
    return bookmarks.some(b => b.item_type === type && b.item_id === id);
  }

  function renderQuizQuestion() {
    quizExplanationContainer.style.display = 'none'; // hide previous explanation
    resetAiExplainPanel();

    // A pending selection only makes sense against the question it was
    // picked for -- any (re)render (navigation, filter change, or the
    // answer just being submitted) clears it.
    pendingQuizSelection = null;
    if (quizSubmitRowEl) quizSubmitRowEl.hidden = true;

    if (filteredQuestions.length === 0) {
      const weakOnly = quizWeakSpotToggle && quizWeakSpotToggle.checked;
      const mistakesOnly = quizMistakesToggle && quizMistakesToggle.checked;
      const showAll = quizShowAllToggle && quizShowAllToggle.checked;
      quizDomainTag.textContent = 'NONE';
      quizQuestionEl.textContent = mistakesOnly
        ? "No open mistakes right now -- you've answered every previously-missed question correctly twice in a row since. Turn off My Mistakes to see the full bank."
        : weakOnly
        ? 'No weak-spot questions found. Turn off Weak Spots Only to see the full bank.'
        : !showAll && questions.length > 0
        ? "You've answered every question in this pool! Turn on Show All Questions to review them."
        : 'No practice questions found. Insert custom questions via Curator panel.';
      quizOptionsList.innerHTML = '';
      quizCounterEl.textContent = '0 / 0';
      btnPrevQuiz.disabled = true;
      btnNextQuiz.disabled = true;
      btnQuizBookmark.classList.remove('active');
      return;
    }

    const q = filteredQuestions[currentQuizIndex];
    quizDomainTag.textContent = q.weak_spot
      ? `Domain ${q.domain}: ${getDomainTitle(q.domain)} · ⚠ Weak Spot`
      : `Domain ${q.domain}: ${getDomainTitle(q.domain)}`;
    quizQuestionEl.textContent = q.question;
    quizCounterEl.textContent = `${currentQuizIndex + 1} / ${filteredQuestions.length}`;

    // Bookmark active checking
    if (isItemBookmarked('question', q.id)) {
      btnQuizBookmark.classList.add('active');
    } else {
      btnQuizBookmark.classList.remove('active');
    }

    // Render Options -- display order/labels are shuffled per question
    // (getDisplayOptions), but opt.key stays the ORIGINAL letter so grading
    // and storage below are unaffected by the shuffle.
    quizOptionsList.innerHTML = '';
    const options = getDisplayOptions(q);

    const hasAnswered = quizAnsweredStates.hasOwnProperty(q.id);
    const savedSelected = quizAnsweredStates[q.id];

    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.dataset.key = opt.key;

      const letterSpan = document.createElement('span');
      letterSpan.className = 'option-letter';
      letterSpan.textContent = opt.displayLetter;

      const textSpan = document.createElement('span');
      textSpan.textContent = opt.text;

      btn.appendChild(letterSpan);
      btn.appendChild(textSpan);

      // If user has already clicked this in this session, style it
      if (hasAnswered) {
        btn.classList.add('disabled');
        if (opt.key === q.correct_option) {
          btn.classList.add('correct');
        } else if (opt.key === savedSelected) {
          btn.classList.add('incorrect');
        }
      } else {
        // Picking an option doesn't grade immediately -- it surfaces the
        // Submit button, and handleQuizSelection() only runs once Submit is
        // clicked (see the submit button wiring in initQuiz()). Until then,
        // clicking a different option just moves the pending pick -- nothing
        // is locked in or graded yet.
        btn.addEventListener('click', () => {
          pendingQuizSelection = { question: q, selectedOption: opt.key };
          Array.from(quizOptionsList.children).forEach(otherBtn => otherBtn.classList.remove('pending-selected'));
          btn.classList.add('pending-selected');
          if (quizSubmitRowEl) quizSubmitRowEl.hidden = false;
        });
      }

      quizOptionsList.appendChild(btn);
    });

    // Reveal explanation if already answered
    if (hasAnswered) {
      revealQuizExplanation(q, savedSelected === q.correct_option, savedSelected);
    }

    btnPrevQuiz.disabled = currentQuizIndex === 0;
    btnNextQuiz.disabled = currentQuizIndex === filteredQuestions.length - 1;
  }

  function handleQuizSelection(questionObj, selectedOption) {
    // Record selection state
    quizAnsweredStates[questionObj.id] = selectedOption;
    saveJson(STORAGE_KEYS.quizAnswered, quizAnsweredStates);

    const isCorrect = selectedOption === questionObj.correct_option;

    // Update Local Stats
    perfData.answered++;
    if (isCorrect) perfData.correct++;

    // Update Domain metrics
    const dom = questionObj.domain;
    const domPerf = getDomainPerf(dom);
    domPerf.answered++;
    if (isCorrect) domPerf.correct++;

    // Update personal mistake-tracking history (drives the "My Mistakes" filter)
    recordQuestionHistory(questionObj.id, isCorrect);

    savePerformance();

    // Re-render choices to lock them and highlight answers
    renderQuizQuestion();
  }

  function revealQuizExplanation(q, isCorrect, selectedOption) {
    currentAiExplainQuestion = q;
    quizAiExplainHandle?.showCachedIfAny();
    explanationStatusEl.textContent = isCorrect ? 'CORRECT // MASTERED' : 'INCORRECT // RATIONALE';
    quizExplanationContainer.className = `quiz-explanation-box ${isCorrect ? 'correct' : 'incorrect'}`;

    const hasPerChoiceRationale = ['a', 'b', 'c', 'd'].every(k => !!q[`rationale_${k}`]);

    if (hasPerChoiceRationale) {
      // Full per-choice A/B/C/D breakdown, mirroring the source review format.
      explanationTextEl.textContent = '';
      explanationTextEl.style.display = 'none';
      rationaleBreakdownEl.innerHTML = '';

      // Same shuffled display order the user answered against, so the letter
      // shown here matches what they clicked -- opt.key (used for correctness
      // and selection comparisons below) is still the ORIGINAL letter.
      const options = getDisplayOptions(q);

      options.forEach(opt => {
        const row = document.createElement('div');
        const isRowCorrect = opt.key === q.correct_option;
        const isRowSelected = opt.key === selectedOption;
        row.className = 'rationale-row' + (isRowCorrect ? ' correct' : (isRowSelected ? ' incorrect' : ''));

        const head = document.createElement('div');
        head.className = 'rationale-row-head';
        head.innerHTML = `<span class="rationale-letter">${opt.displayLetter}</span><span class="rationale-opt-text">${escapeHtml(opt.text || '')}</span>`;

        const body = document.createElement('p');
        body.className = 'rationale-row-body';
        body.textContent = opt.rationale || '';

        row.appendChild(head);
        row.appendChild(body);
        rationaleBreakdownEl.appendChild(row);
      });
    } else {
      // Fallback for older / Curator-added items that only carry a single explanation.
      explanationTextEl.style.display = '';
      explanationTextEl.textContent = q.explanation || '';
      rationaleBreakdownEl.innerHTML = '';
    }

    quizExplanationContainer.style.display = 'block';
  }

  // ==========================================
  // AI EXPLAIN (Gemini, BYOK)
  // ==========================================
  // Optional, user-provided-key deep dive layered on top of the rationale
  // breakdown above. Pure client-side fetch straight to Google's API --
  // no backend, matching how the rest of Certforge already works.

  // ---- Encrypted key vault (AES-GCM, PBKDF2-derived from a PIN) ----
  // Same proportionate protection used in the photo-journey app: stops the
  // key from being readable in plain text via DevTools / local storage
  // files on a shared machine. Not a defense against XSS in this page
  // itself -- the decrypted key still has to live in memory while a
  // request is in flight, same as before this existed.

  function aiBufToBase64(buf) {
    let binary = '';
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
  }

  function aiBase64ToBuf(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  async function aiDeriveVaultKey(pin, salt) {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: AI_VAULT_PBKDF2_ITERATIONS, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  function hasGeminiVault() {
    return Boolean(localStorage.getItem(AI_GEMINI_VAULT_STORAGE));
  }

  function clearGeminiVault() {
    localStorage.removeItem(AI_GEMINI_VAULT_STORAGE);
  }

  async function createGeminiVault(pin, apiKey) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await aiDeriveVaultKey(pin, salt);
    const cipherBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(apiKey));
    localStorage.setItem(AI_GEMINI_VAULT_STORAGE, JSON.stringify({
      salt: aiBufToBase64(salt.buffer),
      iv: aiBufToBase64(iv.buffer),
      cipherText: aiBufToBase64(cipherBuf)
    }));
  }

  /** Decrypts and returns the saved key using pin. Throws a user-facing message on failure. */
  async function unlockGeminiVault(pin) {
    const raw = localStorage.getItem(AI_GEMINI_VAULT_STORAGE);
    if (!raw) throw new Error('No saved API key found on this device.');

    let stored;
    try {
      stored = JSON.parse(raw);
    } catch {
      throw new Error('Saved key data is corrupted.');
    }

    const salt = new Uint8Array(aiBase64ToBuf(stored.salt));
    const iv = new Uint8Array(aiBase64ToBuf(stored.iv));
    const key = await aiDeriveVaultKey(pin, salt);

    try {
      const plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, aiBase64ToBuf(stored.cipherText));
      return new TextDecoder().decode(plainBuf);
    } catch {
      throw new Error('Incorrect PIN.');
    }
  }

  // Resolution order: already unlocked this session > legacy plaintext key
  // saved before the vault existed. A locked vault (key saved + encrypted,
  // not yet unlocked) deliberately returns '' here -- callers check
  // hasGeminiVault() separately to decide whether to prompt for a PIN
  // instead of treating it as "no key at all".
  function getGeminiApiKey() {
    if (unlockedGeminiKey) return unlockedGeminiKey;
    return localStorage.getItem(AI_GEMINI_KEY_STORAGE) || '';
  }

  function getGeminiModel() {
    return localStorage.getItem(AI_GEMINI_MODEL_STORAGE) || AI_GEMINI_DEFAULT_MODEL;
  }

  function buildAiExplainPrompt(q) {
    const domainTitle = getDomainTitle(q.domain);
    // Use the SAME shuffled A/B/C/D order the student is looking at on
    // screen (getDisplayOptions -- opt.key is the original letter,
    // opt.displayLetter is what's actually shown), not the raw a/b/c/d
    // storage order. Labeling by storage order let Gemini call the correct
    // answer "Option C" while the student's screen showed it as D -- same
    // answer, contradictory-looking letters.
    const displayOptions = getDisplayOptions(q);
    const optionLines = displayOptions
      .filter(opt => opt.text)
      .map(opt => `${opt.displayLetter}) ${opt.text}${opt.key === q.correct_option ? '  [CORRECT]' : ''}`)
      .join('\n');
    const existingRationale = displayOptions
      .filter(opt => opt.rationale)
      .map(opt => `${opt.displayLetter}: ${opt.rationale}`)
      .join('\n') || (q.explanation || '');

    const systemPrompt = `You are an expert ${getExamFullName()} exam tutor helping a student who already answered a practice ` +
      "question and has read the standard rationale. Do not just repeat what they've already seen -- add genuine " +
      'depth. Be concise and direct, plain text with short paragraphs or a few dashes for lists (no markdown headers, ' +
      'no asterisk bullets). Always end with a section titled exactly "How to remember this:" containing one short, ' +
      'memorable mnemonic, analogy, or memory hook the student can recall under exam pressure for this specific concept.';

    const userPrompt = `Domain ${q.domain}: ${domainTitle}

Question: ${q.question}

Options:
${optionLines}

Rationale already shown to the student:
${existingRationale}

Give the student a deeper explanation: the underlying ${getExamName()} principle this question is really testing, why the ` +
      `correct answer reflects it, and why the wrong options are tempting traps (briefly -- don't just restate the ` +
      `rationale above). Then end with the "How to remember this:" memory aid as instructed.`;

    return { systemPrompt, userPrompt };
  }

  // Seeds the AI Deep Dive chat with the *concept* this question tests,
  // deliberately not the answer options or which one is correct -- that's
  // what buildAiExplainPrompt()/btnAiExplain already cover in place. This
  // is what "Deep dive this concept" hands to jumpToAiDeepDive().
  function buildQuizConceptSeed(q) {
    const domainTitle = getDomainTitle(q.domain);
    return `I'm stuck on the underlying concept behind this practice question, not just the specific answer ` +
      `(Domain ${q.domain}: ${domainTitle}). The question was: "${q.question}" -- can you explain the broader ` +
      `concept it's testing, in depth?`;
  }

  function buildTrapAiExplainPrompt(trap) {
    const domainTitle = getDomainTitle(trap.domain);

    const systemPrompt = `You are an expert ${getExamFullName()} exam tutor. The student is running a "trap statement" drill: ` +
      'a plausible-sounding wrong claim, followed by why it fails and the correct governing principle, both of which ' +
      "they have already read. Do not just repeat what they've already seen -- add genuine depth. Be concise and " +
      'direct, plain text with short paragraphs or a few dashes for lists (no markdown headers, no asterisk bullets). ' +
      'Always end with a section titled exactly "How to remember this:" containing one short, memorable mnemonic, ' +
      'analogy, or memory hook for this specific trap.';

    const userPrompt = `Domain ${trap.domain}: ${domainTitle}${trap.knowledge_statement ? ' -- ' + trap.knowledge_statement : ''}

Trap statement (plausible-sounding wrong claim): ${trap.trap_statement}

Why it fails (already shown to the student): ${trap.why_it_fails}

Correct governing principle (already shown to the student): ${trap.correct_principle}

Give the student a deeper explanation: the broader ${getExamName()} principle this trap is really testing, why the exam ` +
      `writers favor this specific style of trap, and a realistic scenario where someone would be tempted to fall for ` +
      `it. Then end with the "How to remember this:" memory aid as instructed.`;

    return { systemPrompt, userPrompt };
  }

  // Same idea as buildQuizConceptSeed() -- the broader principle behind the
  // trap, not a rehash of why_it_fails/correct_principle already shown.
  function buildTrapConceptSeed(trap) {
    const domainTitle = getDomainTitle(trap.domain);
    return `I'm stuck on the underlying concept behind this trap statement, not just this specific trap ` +
      `(Domain ${trap.domain}: ${domainTitle}). The trap was: "${trap.trap_statement}" -- the correct principle ` +
      `is: "${trap.correct_principle}". Can you explain the broader concept in depth?`;
  }

  function buildGuideAiExplainPrompt(title, bodyText) {
    const systemPrompt = `You are an expert ${getExamFullName()} exam tutor. The student is reading a concept guide reference ` +
      'page (shown in full below) and wants to go deeper. Do not just repeat the guide content back -- add genuine ' +
      `depth: connect it to related ${getExamName()} concepts, explain how exam questions commonly frame or trap around this ` +
      'topic, and give one realistic scenario. Be concise and direct, plain text with short paragraphs or a few ' +
      'dashes for lists (no markdown headers, no asterisk bullets). Always end with a section titled exactly "How to ' +
      'remember this:" containing one short, memorable mnemonic, analogy, or memory hook for this topic.';

    const userPrompt = `Concept guide: ${title}

Full guide content already shown to the student:
${bodyText}

Give the student a deeper explanation building on this guide: connect it to related ${getExamName()} concepts, explain how ` +
      `exam questions commonly frame or trap around this topic, and give one realistic scenario. Then end with ` +
      `the "How to remember this:" memory aid as instructed.`;

    return { systemPrompt, userPrompt };
  }

  // AI Deep Dive -- freeform tutor chat. One system instruction for the
  // whole conversation (set once via callGeminiChatAPI's systemInstruction
  // field) rather than a per-message prompt like the other three features.
  function buildAiTutorSystemPrompt(domainTitle) {
    const domainNote = domainTitle
      ? ` The student has flagged this conversation as focused on Domain: ${domainTitle} -- lean on that context when it's relevant, but still answer directly if they drift to something else.`
      : '';
    return `You are an expert ${getExamFullName()} exam tutor having an open-ended conversation with a student who is stuck on ` +
      'a specific topic. Answer what they actually asked -- don\'t pad with unrelated background. Be concise and ' +
      'direct, plain text with short paragraphs or a few dashes for lists (no markdown headers, no asterisk ' +
      'bullets). When you give a substantive explanation of a concept (not for short follow-up or clarifying ' +
      'exchanges), end that reply with a section titled exactly "How to remember this:" containing one short, ' +
      'memorable mnemonic, analogy, or memory hook the student can recall under exam pressure.' + domainNote;
  }

  async function callGeminiAPI(apiKey, model, systemPrompt, userPrompt) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
          // No cap here defaults to a modest per-model limit, which silently
          // truncates long responses (e.g. the comprehensive training plan,
          // which can run to dozens of Knowledge Statement sections) with no
          // error -- the API just stops mid-sentence and finishReason comes
          // back MAX_TOKENS instead of STOP. Set high enough that none of
          // the four AI features realistically hit it.
          generationConfig: { maxOutputTokens: 8192 }
        })
      });
    } catch (err) {
      // Surface the real browser error instead of guessing -- a CSP block, a
      // CORS failure, an ad blocker, and no network connection all throw
      // here, and the actual message (visible in DevTools too) is the
      // fastest way to tell them apart.
      const detail = err?.message || String(err);
      throw new Error(`Could not reach the Gemini API: ${detail}. If this mentions "Content Security Policy", the site's connect-src allowlist needs generativelanguage.googleapis.com added (and deployed). Otherwise check for an ad blocker/privacy extension or your network connection.`);
    }

    if (!response.ok) {
      let msg = `Gemini API error (${response.status})`;
      try {
        const errData = await response.json();
        if (errData.error?.message) msg = errData.error.message;
      } catch (_) { /* use default msg */ }
      throw new Error(msg);
    }

    const data = await response.json();
    const candidate = data.candidates?.[0];
    const text = candidate?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini returned an empty response. Try again.');
    // MAX_TOKENS means the response was cut off mid-plan rather than finished
    // naturally (STOP) -- surface that instead of silently rendering a
    // truncated plan that looks complete but is missing sections/the closing
    // "Suggested next 3 study actions:" block.
    return candidate?.finishReason === 'MAX_TOKENS'
      ? `${text}\n\n[Response was cut off before finishing -- click Regenerate to try again.]`
      : text;
  }

  // Multi-turn variant for the AI Deep Dive chat tab -- deliberately kept
  // separate from callGeminiAPI() above rather than folded into it, so the
  // already-working single-shot explain features on Quiz/Trap Spotter/
  // Concept Guides can't be broken by a chat-history refactor. Sends the
  // system instruction once (systemInstruction) plus the running history as
  // alternating user/model turns, per Gemini's multi-turn contents format.
  async function callGeminiChatAPI(apiKey, model, systemPrompt, historyTurns, newMessage) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

    const contents = [...historyTurns, { role: 'user', parts: [{ text: newMessage }] }];

    let response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents
        })
      });
    } catch (err) {
      const detail = err?.message || String(err);
      throw new Error(`Could not reach the Gemini API: ${detail}. If this mentions "Content Security Policy", the site's connect-src allowlist needs generativelanguage.googleapis.com added (and deployed). Otherwise check for an ad blocker/privacy extension or your network connection.`);
    }

    if (!response.ok) {
      let msg = `Gemini API error (${response.status})`;
      try {
        const errData = await response.json();
        if (errData.error?.message) msg = errData.error.message;
      } catch (_) { /* use default msg */ }
      throw new Error(msg);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Gemini returned an empty response. Try again.');
    return text;
  }

  // Quiz's "Explain this question" now runs through the same
  // wireAiExplainButton() plumbing as Trap Spotter and Concept Guides (see
  // initAiExplain()) -- resetAiExplainPanel() just clears the tracked
  // question and delegates the panel/button reset to that shared handle.
  function resetAiExplainPanel() {
    currentAiExplainQuestion = null;
    quizAiExplainHandle?.reset();
  }

  function setAiSettingsStatus(text, variant) {
    if (!aiSettingsStatusEl) return;
    aiSettingsStatusEl.textContent = text;
    aiSettingsStatusEl.className = 'ai-settings-status' + (variant ? ` ${variant}` : '');
  }

  // Shows/hides the "Confirm PIN" field (only needed the first time a vault
  // is created) and refreshes the status line to reflect current key state:
  // no key at all / a legacy unencrypted key / an encrypted vault.
  function updateAiVaultUiState() {
    const vaultExists = hasGeminiVault();
    const locked = vaultExists && !unlockedGeminiKey;

    if (aiUnlockInlineRow) aiUnlockInlineRow.hidden = !locked;
    if (aiVaultPinConfirmRow) aiVaultPinConfirmRow.style.display = vaultExists ? 'none' : '';
    if (aiGeminiKeyLabelEl) {
      aiGeminiKeyLabelEl.textContent = vaultExists ? 'Replace Gemini API Key' : 'Gemini API Key';
    }
    if (aiGeminiKeyInput) {
      aiGeminiKeyInput.placeholder = vaultExists
        ? 'Leave blank to keep your saved key'
        : 'Paste your Gemini API key';
    }

    if (locked) {
      setAiSettingsStatus('Your Gemini key is encrypted and locked for this session. Click "Unlock Saved Key" above to use it, or paste a new key + PIN below to replace it.');
    } else if (vaultExists) {
      setAiSettingsStatus('Your Gemini key is encrypted on this device and unlocked for this session. Leave the key field blank to keep it, or paste a new one to replace it.');
    } else if (localStorage.getItem(AI_GEMINI_KEY_STORAGE)) {
      setAiSettingsStatus('A Gemini key is saved on this device in plain text. Set a PIN below and save to encrypt it.');
    } else {
      setAiSettingsStatus('No key saved yet -- explanations are off until you add one.');
    }
  }

  // Header "AI Setup" button doubles as the primary unlock affordance AND
  // the at-a-glance connection status (mirrors photo-journey's header
  // button: a pulsing dot + label when the AI engine is actually active,
  // not just configured-but-locked).
  function refreshAiHeaderButtonState() {
    const locked = hasGeminiVault() && !unlockedGeminiKey;
    const active = Boolean(getGeminiApiKey());

    let label = 'AI Setup';
    let title = 'Configure AI-powered deeper explanations (Google Gemini)';
    if (locked) {
      label = 'Unlock AI';
      title = 'Your Gemini key is encrypted -- click to unlock it for this session';
    } else if (active) {
      label = 'Gemini Active';
      title = 'Gemini explanations are active -- click to manage your key';
    }

    if (btnOpenAiSettingsLabelEl) btnOpenAiSettingsLabelEl.textContent = label;
    if (aiStatusDotEl) aiStatusDotEl.hidden = !active;
    if (btnOpenAiSettings) btnOpenAiSettings.title = title;
  }

  function openAiSettingsModal() {
    if (!aiSettingsModal) return;
    if (aiGeminiModelInput) aiGeminiModelInput.value = localStorage.getItem(AI_GEMINI_MODEL_STORAGE) || '';
    if (aiGeminiKeyInput) aiGeminiKeyInput.value = '';
    if (aiVaultPinInput) aiVaultPinInput.value = '';
    if (aiVaultPinConfirmInput) aiVaultPinConfirmInput.value = '';
    updateAiVaultUiState();
    aiSettingsModal.style.display = 'flex';
    aiSettingsModal.classList.remove('hidden');
    aiSettingsModal.setAttribute('aria-hidden', 'false');
  }

  function closeAiSettingsModal() {
    if (!aiSettingsModal) return;
    aiSettingsModal.style.display = 'none';
    aiSettingsModal.classList.add('hidden');
    aiSettingsModal.setAttribute('aria-hidden', 'true');
  }

  function openAiUnlockModal(onSuccess) {
    if (!aiUnlockModal) return;
    pendingUnlockCallback = onSuccess || null;
    if (aiUnlockPinInput) aiUnlockPinInput.value = '';
    if (aiUnlockErrorEl) aiUnlockErrorEl.textContent = '';
    aiUnlockModal.style.display = 'flex';
    aiUnlockModal.classList.remove('hidden');
    aiUnlockModal.setAttribute('aria-hidden', 'false');
    aiUnlockPinInput?.focus();
  }

  function closeAiUnlockModal() {
    if (!aiUnlockModal) return;
    aiUnlockModal.style.display = 'none';
    aiUnlockModal.classList.add('hidden');
    aiUnlockModal.setAttribute('aria-hidden', 'true');
    pendingUnlockCallback = null;
  }

  // Shared "explain this" button, used identically by Quiz, Trap Spotter,
  // and Concept Guides (see initAiExplain()) -- one implementation means the
  // three surfaces can never visually or behaviorally drift apart.
  //
  // Beyond the ask/unlock/no-key routing, this now also:
  //  - checks the per-exam AI response cache (see loadAiCacheStore() et al
  //    above) before hitting the network, and auto-displays a cached answer
  //    the moment you land back on an item you've already asked about --
  //    showCachedIfAny(), called by each caller's render function -- so
  //    reviewing missed questions never re-spends a Gemini call just to
  //    re-read something you already saw;
  //  - renders the response as a small meta line (cached vs. fresh, when,
  //    which model), the main explanation, a visually separated "How to
  //    remember this" callout (every prompt in buildAiExplainPrompt() /
  //    buildTrapAiExplainPrompt() / buildGuideAiExplainPrompt() is instructed
  //    to end with that exact heading, so splitting on it is reliable), and
  //    a standing disclaimer -- instead of one flat block of text.
  function wireAiExplainButton({ btn, responseEl, responseBodyEl, closeBtn, buildPrompt, getCacheKey }) {
    if (!btn) return { reset() {}, showCachedIfAny() { return false; } };
    const idleLabel = btn.textContent;

    function renderResponse(text, { cached, model, ts }) {
      const html = buildAiResponseHtml(text, { cached, model, ts }, {
        calloutMarker: 'How to remember this:',
        calloutLabel: '🧠 How to remember this'
      });

      if (responseBodyEl) responseBodyEl.innerHTML = html;
      if (responseEl) {
        responseEl.hidden = false;
        responseEl.classList.remove('error');
      }
      btn.textContent = '🔄 Ask again';
    }

    function showCachedIfAny() {
      const key = getCacheKey ? getCacheKey() : null;
      const cached = key ? getCachedAiResponse(key) : null;
      if (!cached) return false;
      renderResponse(cached.text, { cached: true, model: cached.model, ts: cached.ts });
      return true;
    }

    async function runAsk() {
      const promptData = buildPrompt();
      if (!promptData) return;
      btn.disabled = true;
      btn.classList.add('loading');
      btn.textContent = 'Asking Gemini...';
      try {
        const model = getGeminiModel();
        const text = await callGeminiAPI(getGeminiApiKey(), model, promptData.systemPrompt, promptData.userPrompt);
        renderResponse(text, { cached: false, model, ts: Date.now() });
        const key = getCacheKey ? getCacheKey() : null;
        if (key) setCachedAiResponse(key, text, model);
      } catch (err) {
        const message = err?.message || 'Something went wrong asking Gemini.';
        if (responseBodyEl) responseBodyEl.textContent = message;
        if (responseEl) {
          responseEl.hidden = false;
          responseEl.classList.add('error');
        }
        btn.textContent = idleLabel;
      } finally {
        btn.disabled = false;
        btn.classList.remove('loading');
      }
    }

    btn.addEventListener('click', () => {
      if (getGeminiApiKey()) {
        runAsk();
        return;
      }
      if (hasGeminiVault()) {
        openAiUnlockModal(() => {
          refreshAiHeaderButtonState();
          runAsk();
        });
        return;
      }
      showToast('Add your Gemini API key in AI Setup first');
      openAiSettingsModal();
    });

    closeBtn?.addEventListener('click', () => {
      if (responseEl) responseEl.hidden = true;
    });

    return {
      reset() {
        if (responseEl) {
          responseEl.hidden = true;
          responseEl.classList.remove('error');
        }
        if (responseBodyEl) responseBodyEl.innerHTML = '';
        btn.disabled = false;
        btn.classList.remove('loading');
        btn.textContent = idleLabel;
      },
      showCachedIfAny
    };
  }

  function initAiExplain() {
    // Settings modal open/close -- same pattern as Quick Start / Features.
    if (btnOpenAiSettings && aiSettingsModal) {
      // A locked vault turns the header button into the primary "unlock"
      // shortcut -- reachable from anywhere, not just after answering a
      // quiz question or after already being inside Settings.
      btnOpenAiSettings.addEventListener('click', () => {
        if (hasGeminiVault() && !unlockedGeminiKey) {
          openAiUnlockModal(() => {
            updateAiVaultUiState();
            refreshAiHeaderButtonState();
            showToast('Gemini key unlocked');
          });
          return;
        }
        openAiSettingsModal();
      });
      btnCloseAiSettings?.addEventListener('click', closeAiSettingsModal);
      aiSettingsModal.addEventListener('click', (e) => {
        if (e.target === aiSettingsModal) closeAiSettingsModal();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !aiSettingsModal.classList.contains('hidden')) closeAiSettingsModal();
      });

      btnSaveAiSettings?.addEventListener('click', async () => {
        const key = aiGeminiKeyInput?.value.trim();
        const model = aiGeminiModelInput?.value.trim();
        const pin = aiVaultPinInput?.value || '';
        const pinConfirm = aiVaultPinConfirmInput?.value || '';
        const vaultExists = hasGeminiVault();

        if (model) localStorage.setItem(AI_GEMINI_MODEL_STORAGE, model);
        else localStorage.removeItem(AI_GEMINI_MODEL_STORAGE);

        if (!key) {
          // No new key entered -- just the model (if any) was updated. Any
          // existing vault is left exactly as-is.
          setAiSettingsStatus('Settings saved.', 'success');
          showToast('Settings saved');
          return;
        }

        if (!pin || pin.length < 4) {
          setAiSettingsStatus('Enter a vault PIN of at least 4 characters to encrypt this key before saving.', 'error');
          return;
        }
        if (!vaultExists && pin !== pinConfirm) {
          setAiSettingsStatus('PINs do not match.', 'error');
          return;
        }

        btnSaveAiSettings.disabled = true;
        try {
          await createGeminiVault(pin, key);
          localStorage.removeItem(AI_GEMINI_KEY_STORAGE); // drop any legacy plaintext key now that it's vaulted
          setUnlockedGeminiKey(key); // already unlocked this session, since it was just typed in
          if (aiGeminiKeyInput) aiGeminiKeyInput.value = '';
          if (aiVaultPinInput) aiVaultPinInput.value = '';
          if (aiVaultPinConfirmInput) aiVaultPinConfirmInput.value = '';
          updateAiVaultUiState();
          refreshAiHeaderButtonState();
          setAiSettingsStatus('Saved and encrypted. Gemini explanations and AI Deep Dive are now active.', 'success');
          showToast('Gemini key saved');
        } catch (err) {
          setAiSettingsStatus(`Could not encrypt key: ${err?.message || err}`, 'error');
        } finally {
          btnSaveAiSettings.disabled = false;
        }
      });

      btnUnlockAiSettings?.addEventListener('click', () => {
        openAiUnlockModal(() => {
          updateAiVaultUiState();
          refreshAiHeaderButtonState();
          setAiSettingsStatus('Key unlocked for this session.', 'success');
        });
      });

      const performAiKeyTest = async () => {
        const typedKey = aiGeminiKeyInput?.value.trim();
        const model = aiGeminiModelInput?.value.trim() || getGeminiModel();
        const keyToTest = typedKey || getGeminiApiKey();

        if (!keyToTest) {
          setAiSettingsStatus('Paste a key to test first.', 'error');
          return;
        }

        btnTestAiSettings.disabled = true;
        const prevLabel = btnTestAiSettings.textContent;
        btnTestAiSettings.textContent = 'Testing...';
        try {
          await callGeminiAPI(keyToTest, model, 'You are a connection test.', 'Reply with exactly: Connection OK');
          setAiSettingsStatus('Connected successfully to Gemini.', 'success');
        } catch (err) {
          setAiSettingsStatus(`Connection test failed: ${err?.message || err}`, 'error');
        } finally {
          btnTestAiSettings.disabled = false;
          btnTestAiSettings.textContent = prevLabel;
        }
      };

      btnTestAiSettings?.addEventListener('click', () => {
        const typedKey = aiGeminiKeyInput?.value.trim();
        // Nothing typed, no unlocked key in memory, but a vault exists --
        // unlock first instead of dead-ending on an error message.
        if (!typedKey && !getGeminiApiKey() && hasGeminiVault()) {
          openAiUnlockModal(() => {
            updateAiVaultUiState();
            refreshAiHeaderButtonState();
            performAiKeyTest();
          });
          return;
        }
        performAiKeyTest();
      });

      btnClearAiSettings?.addEventListener('click', () => {
        if (!hasGeminiVault() && !localStorage.getItem(AI_GEMINI_KEY_STORAGE)) return;
        if (!confirm('This permanently deletes the saved API key on this device. Continue?')) return;
        clearGeminiVault();
        localStorage.removeItem(AI_GEMINI_KEY_STORAGE);
        setUnlockedGeminiKey(null);
        if (aiGeminiKeyInput) aiGeminiKeyInput.value = '';
        if (aiVaultPinInput) aiVaultPinInput.value = '';
        if (aiVaultPinConfirmInput) aiVaultPinConfirmInput.value = '';
        updateAiVaultUiState();
        refreshAiHeaderButtonState();
        showToast('Gemini key removed', 'removed');
      });
    }

    // Unlock modal -- PIN entry to decrypt a saved vault for this session.
    if (aiUnlockModal) {
      btnCloseAiUnlock?.addEventListener('click', closeAiUnlockModal);
      aiUnlockModal.addEventListener('click', (e) => {
        if (e.target === aiUnlockModal) closeAiUnlockModal();
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !aiUnlockModal.classList.contains('hidden')) closeAiUnlockModal();
      });
      aiUnlockPinInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') btnAiUnlockSubmit?.click();
      });

      btnAiUnlockSubmit?.addEventListener('click', async () => {
        const pin = aiUnlockPinInput?.value || '';
        if (!pin) {
          if (aiUnlockErrorEl) aiUnlockErrorEl.textContent = 'Enter your vault PIN.';
          return;
        }
        btnAiUnlockSubmit.disabled = true;
        try {
          setUnlockedGeminiKey(await unlockGeminiVault(pin));
          const callback = pendingUnlockCallback;
          closeAiUnlockModal();
          if (callback) callback();
        } catch (err) {
          if (aiUnlockErrorEl) aiUnlockErrorEl.textContent = err?.message || 'Incorrect PIN.';
        } finally {
          btnAiUnlockSubmit.disabled = false;
        }
      });

      btnAiUnlockForget?.addEventListener('click', () => {
        if (!confirm("This permanently deletes your saved encrypted API key. You'll need to paste it again in AI Setup. Continue?")) return;
        clearGeminiVault();
        localStorage.removeItem(AI_GEMINI_KEY_STORAGE);
        setUnlockedGeminiKey(null);
        closeAiUnlockModal();
        updateAiVaultUiState();
        refreshAiHeaderButtonState();
      });
    }

    // In-quiz "Explain this question" button -- now the same
    // wireAiExplainButton() plumbing as Trap Spotter and Concept Guides
    // below, so all three get identical caching, formatting, and unlock/
    // no-key handling from one implementation instead of three.
    quizAiExplainHandle = wireAiExplainButton({
      btn: btnAiExplain,
      responseEl: aiExplainResponseEl,
      responseBodyEl: aiExplainResponseBodyEl,
      closeBtn: btnAiExplainClose,
      buildPrompt: () => currentAiExplainQuestion ? buildAiExplainPrompt(currentAiExplainQuestion) : null,
      getCacheKey: () => currentAiExplainQuestion ? `quiz:${currentAiExplainQuestion.id}` : null
    });

    // "Deep dive this concept" -- jumps to the AI Deep Dive chat instead of
    // answering in place. Separate button, separate job (see
    // buildQuizConceptSeed() / jumpToAiDeepDive()).
    btnAiDeepdiveLink?.addEventListener('click', () => {
      if (!currentAiExplainQuestion) return;
      jumpToAiDeepDive(buildQuizConceptSeed(currentAiExplainQuestion), currentAiExplainQuestion.domain);
    });

    // Same feature, reused on Trap Spotter and Concept Guides.
    trapAiExplainHandle = wireAiExplainButton({
      btn: btnTrapAiExplain,
      responseEl: trapAiExplainResponseEl,
      responseBodyEl: trapAiExplainResponseBodyEl,
      closeBtn: btnTrapAiExplainClose,
      buildPrompt: () => {
        if (!filteredTraps || filteredTraps.length === 0) return null;
        return buildTrapAiExplainPrompt(filteredTraps[currentTrapIndex]);
      },
      getCacheKey: () => (filteredTraps && filteredTraps.length > 0) ? `trap:${filteredTraps[currentTrapIndex].id}` : null
    });

    btnTrapAiDeepdiveLink?.addEventListener('click', () => {
      if (!filteredTraps || filteredTraps.length === 0) return;
      const trap = filteredTraps[currentTrapIndex];
      jumpToAiDeepDive(buildTrapConceptSeed(trap), trap.domain);
    });

    guideAiExplainHandle = wireAiExplainButton({
      btn: btnGuideAiExplain,
      responseEl: guideAiExplainResponseEl,
      responseBodyEl: guideAiExplainResponseBodyEl,
      closeBtn: btnGuideAiExplainClose,
      buildPrompt: () => {
        const activeItem = getActiveGuideItem();
        if (!activeItem) return null;
        const el = document.getElementById(activeItem.dataset.guide);
        if (!el) return null;
        const title = activeItem.textContent.trim();
        const body = (el.textContent || '').replace(/\s+/g, ' ').trim();
        return buildGuideAiExplainPrompt(title, body);
      },
      getCacheKey: () => {
        const activeItem = getActiveGuideItem();
        return activeItem ? `guide:${activeItem.dataset.guide}` : null;
      }
    });

    // Reflect whatever key state was left over from a previous session
    // (an existing vault always starts locked on a fresh page load).
    refreshAiHeaderButtonState();
  }

  // AI Deep Dive -- freeform tutor chat tab. Separate init function (rather
  // than folded into initAiExplain/wireAiExplainButton) since this is a
  // multi-turn conversation with its own history state, not a single
  // "ask once about the thing on screen" button.
  function initAiTutor() {
    if (!aiTutorChatEl) return;

    function getAiTutorDomainTitle() {
      const val = aiTutorDomainSelect?.value;
      if (!val || val === 'all') return null;
      return getDomainTitle(parseInt(val, 10));
    }

    function scrollAiTutorChatToBottom() {
      aiTutorChatEl.scrollTop = aiTutorChatEl.scrollHeight;
    }

    function appendAiTutorMessage(role, text, variant) {
      if (aiTutorEmptyEl) aiTutorEmptyEl.hidden = true;
      if (btnAiTutorClear) btnAiTutorClear.hidden = false;
      const msg = document.createElement('div');
      msg.className = `ai-tutor-msg ${role === 'user' ? 'student' : 'tutor'}`;
      if (variant) msg.classList.add(variant);
      const bubble = document.createElement('div');
      bubble.className = 'ai-tutor-msg-bubble';
      bubble.textContent = text;
      msg.appendChild(bubble);
      aiTutorChatEl.appendChild(msg);
      scrollAiTutorChatToBottom();
      return msg;
    }

    // Rehydrate whatever conversation was persisted to
    // STORAGE_KEYS.aiTutorHistory (loaded into aiTutorHistory back in
    // loadData()) -- a reload no longer wipes out the tutor thread, matching
    // the same "don't make someone re-ask what they already asked" idea
    // behind the AI response cache used by Quiz/Trap Spotter/Guides.
    if (aiTutorHistory.length > 0) {
      aiTutorHistory.forEach(turn => {
        const text = turn?.parts?.[0]?.text || '';
        if (text) appendAiTutorMessage(turn.role === 'user' ? 'user' : 'model', text);
      });
    }

    async function sendAiTutorMessage(text) {
      const trimmed = (text || '').trim();
      if (!trimmed) return;

      const apiKey = getGeminiApiKey();
      if (!apiKey) {
        if (hasGeminiVault()) {
          openAiUnlockModal(() => {
            refreshAiHeaderButtonState();
            sendAiTutorMessage(trimmed);
          });
          return;
        }
        showToast('Add your Gemini API key in AI Setup first');
        openAiSettingsModal();
        return;
      }

      if (aiTutorInput) aiTutorInput.value = '';
      appendAiTutorMessage('user', trimmed);

      const thinkingMsg = appendAiTutorMessage('model', 'Thinking...', 'thinking');
      if (btnAiTutorSend) btnAiTutorSend.disabled = true;

      try {
        const systemPrompt = buildAiTutorSystemPrompt(getAiTutorDomainTitle());
        const reply = await callGeminiChatAPI(apiKey, getGeminiModel(), systemPrompt, aiTutorHistory, trimmed);
        thinkingMsg.remove();
        appendAiTutorMessage('model', reply);
        // Only committed to history on success -- a failed turn shouldn't
        // pollute the conversation Gemini sees on the next message.
        aiTutorHistory.push({ role: 'user', parts: [{ text: trimmed }] });
        aiTutorHistory.push({ role: 'model', parts: [{ text: reply }] });
        if (aiTutorHistory.length > AI_TUTOR_HISTORY_MAX_TURNS) {
          aiTutorHistory = aiTutorHistory.slice(-AI_TUTOR_HISTORY_MAX_TURNS);
        }
        saveJson(STORAGE_KEYS.aiTutorHistory, aiTutorHistory);
      } catch (err) {
        thinkingMsg.remove();
        appendAiTutorMessage('model', err?.message || 'Something went wrong asking Gemini.', 'error');
      } finally {
        if (btnAiTutorSend) btnAiTutorSend.disabled = false;
      }
    }

    btnAiTutorSend?.addEventListener('click', () => sendAiTutorMessage(aiTutorInput?.value));

    aiTutorInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendAiTutorMessage(aiTutorInput.value);
      }
    });

    aiTutorSuggestionChips.forEach(chip => {
      chip.addEventListener('click', () => {
        sendAiTutorMessage(chip.dataset.prompt || chip.textContent);
      });
    });

    btnAiTutorClear?.addEventListener('click', () => {
      aiTutorHistory = [];
      saveJson(STORAGE_KEYS.aiTutorHistory, aiTutorHistory);
      aiTutorChatEl.querySelectorAll('.ai-tutor-msg').forEach(el => el.remove());
      if (aiTutorEmptyEl) aiTutorEmptyEl.hidden = false;
      btnAiTutorClear.hidden = true;
      if (aiTutorInput) aiTutorInput.value = '';
    });

    // Exposed so the Quiz/Trap Spotter "Deep dive this concept" pills can
    // hand this chat a seeded message via jumpToAiDeepDive() below, without
    // needing their own copy of the send/key/vault logic.
    aiTutorSendHandle = sendAiTutorMessage;
  }

  // Jumps from a static "explain this item" panel (Quiz / Trap Spotter)
  // into the AI Deep Dive chat, pre-seeded with a question about the
  // underlying concept rather than the specific item on screen -- a
  // genuinely different job from the in-place explain buttons: one-shot
  // answer vs. an open-ended thread you can keep pushing on.
  function jumpToAiDeepDive(seedMessage, domainId) {
    switchToTab('tab-ai-deepdive');
    if (aiTutorDomainSelect && domainId != null) {
      aiTutorDomainSelect.value = String(domainId);
    }
    if (aiTutorSendHandle) aiTutorSendHandle(seedMessage);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function getDomainTitle(num) {
    const domains = (examConfig || FALLBACK_EXAM_CONFIG).domains || [];
    const match = domains.find(d => d.id === num);
    return match ? match.title : 'Unknown Domain';
  }

  // Short exam name ("CISM", "SecurityX") and full certification name, read
  // off the active exam's manifest entry. Every AI system/user prompt below
  // used to hardcode "CISM"/"ISACA CISM" -- these two helpers are what makes
  // that text follow whichever exam is actually active instead.
  function getExamName() {
    return (examConfig || FALLBACK_EXAM_CONFIG).name || 'CISM';
  }

  function getExamFullName() {
    const cfg = examConfig || FALLBACK_EXAM_CONFIG;
    return cfg.full_name || cfg.name || 'CISM';
  }

  // Lightweight toast notifications for quick actions (bookmarking, etc.)
  // that otherwise have no feedback beyond a subtle icon-state change.
  const toastContainerEl = document.getElementById('toast-container');
  function showToast(message, variant) {
    if (!toastContainerEl) return;
    const toast = document.createElement('div');
    toast.className = 'toast';
    if (variant === 'removed') toast.classList.add('toast-removed');
    toast.textContent = message;
    toastContainerEl.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-visible'));
    setTimeout(() => {
      toast.classList.remove('toast-visible');
      setTimeout(() => toast.remove(), 300);
    }, 2600);
  }

  // ==========================================
  // TRAP SPOTTER DRILL
  // ==========================================
  // Flip-card drill over the distractors[] library: front shows a plausible-
  // sounding wrong claim (trap_statement), back reveals why it fails and the
  // correct governing principle. Domain-filterable, same flip interaction as
  // the Flashcards console.

  function initTrapSpotter() {
    if (!trapCardEl) return; // tab not present in this build

    filterTraps();

    trapCardEl.addEventListener('click', () => {
      trapCardEl.classList.toggle('flipped');
    });

    if (trapDomainSelect) {
      trapDomainSelect.addEventListener('change', () => {
        filterTraps();
      });
    }

    if (btnPrevTrap) {
      btnPrevTrap.addEventListener('click', () => {
        if (currentTrapIndex > 0) {
          currentTrapIndex--;
          renderTrapCard();
        }
      });
    }

    if (btnNextTrap) {
      btnNextTrap.addEventListener('click', () => {
        if (currentTrapIndex < filteredTraps.length - 1) {
          currentTrapIndex++;
          renderTrapCard();
        }
      });
    }
  }

  function filterTraps() {
    const domainVal = trapDomainSelect ? trapDomainSelect.value : 'all';
    if (domainVal === 'all') {
      filteredTraps = distractors;
    } else {
      const dNum = parseInt(domainVal);
      filteredTraps = distractors.filter(d => d.domain === dNum);
    }
    currentTrapIndex = 0;
    renderTrapCard();
  }

  function renderTrapCard() {
    if (!trapCardEl) return;
    trapCardEl.classList.remove('flipped');
    trapAiExplainHandle?.reset();
    trapAiExplainHandle?.showCachedIfAny();

    if (filteredTraps.length === 0) {
      trapDomainTag.textContent = 'NONE';
      trapStatementEl.textContent = 'No trap statements found for this domain.';
      trapWhyFailsEl.textContent = '';
      trapCorrectPrincipleEl.textContent = '';
      trapCounterEl.textContent = '0 / 0';
      btnPrevTrap.disabled = true;
      btnNextTrap.disabled = true;
      return;
    }

    const trap = filteredTraps[currentTrapIndex];
    trapDomainTag.textContent = `Domain ${trap.domain}${trap.knowledge_statement ? ' · ' + trap.knowledge_statement : ''}`;
    trapStatementEl.textContent = trap.trap_statement;
    trapWhyFailsEl.textContent = trap.why_it_fails;
    trapCorrectPrincipleEl.textContent = trap.correct_principle;
    trapCounterEl.textContent = `${currentTrapIndex + 1} / ${filteredTraps.length}`;

    btnPrevTrap.disabled = currentTrapIndex === 0;
    btnNextTrap.disabled = currentTrapIndex === filteredTraps.length - 1;
  }

  // ==========================================
  // TIMED MOCK EXAM CONSOLE
  // ==========================================
  
  // Mock Exam mode -- Quick Practice (examConfig.mock_exam) or Full-Length
  // (examConfig.mock_exam_full, falling back to the quick config for any
  // exam that hasn't defined a full-length one yet).
  function getMockConfig(mode) {
    const cfg = examConfig || FALLBACK_EXAM_CONFIG;
    if (mode === 'full') {
      return cfg.mock_exam_full || cfg.mock_exam || FALLBACK_EXAM_CONFIG.mock_exam;
    }
    return cfg.mock_exam || FALLBACK_EXAM_CONFIG.mock_exam;
  }

  function updateMockSpecsDisplay() {
    const cfg = getMockConfig(selectedMockMode);
    if (mockSpecQuestionsEl) mockSpecQuestionsEl.textContent = `${cfg.question_count} Questions`;
    if (mockSpecTimeEl) {
      const totalMinutes = Math.round(cfg.time_limit_seconds / 60);
      if (totalMinutes >= 60) {
        const hrs = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;
        mockSpecTimeEl.textContent = mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
      } else {
        mockSpecTimeEl.textContent = `${totalMinutes} Minutes`;
      }
    }
    if (mockSpecPassingEl) mockSpecPassingEl.textContent = `${cfg.passing_threshold}% Pass`;
  }

  mockModeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      selectedMockMode = btn.dataset.mode;
      mockModeButtons.forEach(b => b.classList.toggle('active', b === btn));
      updateMockSpecsDisplay();
    });
  });
  updateMockSpecsDisplay();

  // MM:SS for anything under an hour, H:MM:SS once a full-length exam's
  // multi-hour timer needs it.
  function formatMockTime(totalSeconds) {
    const s = Math.max(0, totalSeconds);
    const hrs = Math.floor(s / 3600);
    const mins = Math.floor((s % 3600) / 60);
    const secs = s % 60;
    return hrs > 0
      ? `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
      : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  btnStartMock.addEventListener('click', () => {
    if (questions.length === 0) {
      alert('Cannot start exam: Question bank is empty!');
      return;
    }
    startMockExam();
  });

  function startMockExam() {
    mockSetup.style.display = 'none';
    mockResults.style.display = 'none';
    mockActive.style.display = 'block';

    const mockCfg = getMockConfig(selectedMockMode);

    // 1. Randomize and extract N questions (or all if less than N) per exam config
    mockQuestions = [...questions].sort(() => 0.5 - Math.random()).slice(0, mockCfg.question_count);
    mockAnswers = {};
    mockCurrentIndex = 0;
    mockTimeRemaining = mockCfg.time_limit_seconds;
    mockSecondsElapsed = 0;
    mockTimerEl.textContent = formatMockTime(mockTimeRemaining);

    // Start timer clock
    clearInterval(mockTimerInterval);
    mockTimerInterval = setInterval(() => {
      mockTimeRemaining--;
      mockSecondsElapsed++;
      mockTimerEl.textContent = formatMockTime(mockTimeRemaining);

      if (mockTimeRemaining <= 0) {
        clearInterval(mockTimerInterval);
        submitMockExam();
      }
    }, 1000);

    renderMockQuestion();
  }

  function renderMockQuestion() {
    const q = mockQuestions[mockCurrentIndex];
    mockProgressEl.textContent = `Question ${mockCurrentIndex + 1} of ${mockQuestions.length}`;

    // Question
    mockQuestionEl.textContent = q.question;

    // Bookmarked flag checking
    const isBookmarked = isItemBookmarked('question', q.id);
    btnMockFlag.textContent = isBookmarked ? '★ Flagged' : 'Flag Question';
    btnMockFlag.className = `btn-hud ${isBookmarked ? 'btn-warn active' : 'btn-warn'}`;

    // Options rendering -- display order/labels are shuffled per question
    // (getDisplayOptions), but opt.key stays the ORIGINAL letter so
    // mockAnswers[] storage and grading are unaffected by the shuffle.
    mockOptionsList.innerHTML = '';
    const options = getDisplayOptions(q);

    const currentSelected = mockAnswers[mockCurrentIndex];

    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      if (currentSelected === opt.key) {
        btn.classList.add('correct'); // Highlight selection
      }

      const letterSpan = document.createElement('span');
      letterSpan.className = 'option-letter';
      letterSpan.textContent = opt.displayLetter;

      const textSpan = document.createElement('span');
      textSpan.textContent = opt.text;

      btn.appendChild(letterSpan);
      btn.appendChild(textSpan);

      btn.addEventListener('click', () => {
        mockAnswers[mockCurrentIndex] = opt.key;
        renderMockQuestion(); // refresh highlight selection
      });

      mockOptionsList.appendChild(btn);
    });

    btnMockPrev.disabled = mockCurrentIndex === 0;
    updateMockFlagNav();

    // Toggle Next / Submit button
    if (mockCurrentIndex === mockQuestions.length - 1) {
      btnMockNext.textContent = 'FINISH EXAM';
      btnMockNext.className = 'btn-hud btn-success'; // green final button
      btnMockNext.style.borderColor = 'var(--accent-green)';
    } else {
      btnMockNext.textContent = 'Next ▶';
      btnMockNext.className = 'btn-hud';
      btnMockNext.style.borderColor = '';
    }
  }

  // Next / Finish exam trigger
  btnMockNext.addEventListener('click', () => {
    if (mockCurrentIndex < mockQuestions.length - 1) {
      mockCurrentIndex++;
      renderMockQuestion();
    } else {
      // finish exam confirmation
      if (confirm('Are you sure you want to submit your exam answers?')) {
        clearInterval(mockTimerInterval);
        submitMockExam();
      }
    }
  });

  btnMockPrev.addEventListener('click', () => {
    if (mockCurrentIndex > 0) {
      mockCurrentIndex--;
      renderMockQuestion();
    }
  });

  // Flag-jump navigation -- jumps directly to the nearest flagged question in
  // either direction, so a flagged item can be revisited without stepping
  // through every question in between. The flag mechanism itself reuses the
  // shared bookmarks array (see the flag toggle handler below).
  function getFlaggedMockIndexes() {
    return mockQuestions
      .map((q, idx) => ({ idx, flagged: isItemBookmarked('question', q.id) }))
      .filter(x => x.flagged)
      .map(x => x.idx);
  }

  function updateMockFlagNav() {
    if (!btnMockFlagPrev || !btnMockFlagNext) return;
    const flaggedIdxs = getFlaggedMockIndexes();
    btnMockFlagPrev.disabled = !flaggedIdxs.some(i => i < mockCurrentIndex);
    btnMockFlagNext.disabled = !flaggedIdxs.some(i => i > mockCurrentIndex);
  }

  if (btnMockFlagPrev) {
    btnMockFlagPrev.addEventListener('click', () => {
      const priorFlagged = getFlaggedMockIndexes().filter(i => i < mockCurrentIndex);
      if (priorFlagged.length === 0) return;
      mockCurrentIndex = priorFlagged[priorFlagged.length - 1];
      renderMockQuestion();
    });
  }

  if (btnMockFlagNext) {
    btnMockFlagNext.addEventListener('click', () => {
      const upcomingFlagged = getFlaggedMockIndexes().filter(i => i > mockCurrentIndex);
      if (upcomingFlagged.length === 0) return;
      mockCurrentIndex = upcomingFlagged[0];
      renderMockQuestion();
    });
  }

  // Mock flagging toggle
  btnMockFlag.addEventListener('click', () => {
    const q = mockQuestions[mockCurrentIndex];
    const isBookmarked = isItemBookmarked('question', q.id);

    if (!isBookmarked) {
      bookmarks.push({ item_type: 'question', item_id: q.id });
    } else {
      bookmarks = bookmarks.filter(b => !(b.item_type === 'question' && b.item_id === q.id));
    }

    saveJson(STORAGE_KEYS.bookmarks, bookmarks);
    renderMockQuestion();
    updateDashboardStats();
  });

  function submitMockExam() {
    mockActive.style.display = 'none';

    // Calculate score, per-domain breakdown, and update personal mistake
    // history -- all from a single pass over the attempted questions.
    let correctCount = 0;
    const domainBreakdown = {};
    // Aggregated by ISACA knowledge statement, not kept per-question -- a
    // Full-Length exam can miss dozens of questions clustered in a handful
    // of KS codes, and the post-exam AI training plan only needs the
    // pattern (which KS codes, how often, why), not every individual card.
    const missedByKs = {};
    mockQuestions.forEach((q, idx) => {
      const wasAnswered = mockAnswers[idx] !== undefined;
      const isCorrect = wasAnswered && mockAnswers[idx] === q.correct_option;
      if (isCorrect) correctCount++;

      if (!domainBreakdown[q.domain]) {
        domainBreakdown[q.domain] = { correct: 0, answered: 0 };
      }
      if (wasAnswered) {
        domainBreakdown[q.domain].answered++;
        if (isCorrect) domainBreakdown[q.domain].correct++;
        recordQuestionHistory(q.id, isCorrect);
      }

      if (!isCorrect) {
        const ks = q.knowledge_statement || `Domain ${q.domain} (untagged)`;
        if (!missedByKs[ks]) {
          missedByKs[ks] = {
            ks,
            ksTitle: q.knowledge_statement_title || '',
            domain: q.domain,
            domainTitle: getDomainTitle(q.domain),
            count: 0,
            examples: []
          };
        }
        missedByKs[ks].count++;
        // Cap at 2 representative examples per KS code -- enough for Gemini
        // to see the pattern without the prompt ballooning on a bad run.
        if (missedByKs[ks].examples.length < 2) {
          const pickedKey = wasAnswered ? String(mockAnswers[idx]).toLowerCase() : null;
          const correctKey = (q.correct_option || '').toLowerCase();
          missedByKs[ks].examples.push({
            question: q.question,
            pickedWrong: pickedKey ? (q[`option_${pickedKey}`] || '') : '(left unanswered)',
            pickedWrongRationale: pickedKey ? (q[`rationale_${pickedKey}`] || '') : '',
            correctAnswer: q[`option_${correctKey}`] || '',
            correctRationale: q[`rationale_${correctKey}`] || q.explanation || ''
          });
        }
      }
    });

    const totalCount = mockQuestions.length;
    const scorePct = totalCount > 0 ? (correctCount / totalCount) * 100 : 0;

    lastMockDiagnostics = {
      mode: selectedMockMode,
      scorePct,
      correctCount,
      totalCount,
      missedByKs: Object.values(missedByKs).sort((a, b) => b.count - a.count)
    };
    const passingThreshold = ((examConfig || FALLBACK_EXAM_CONFIG).mock_exam || FALLBACK_EXAM_CONFIG.mock_exam).passing_threshold;
    const passed = scorePct >= passingThreshold;

    const savedAttempt = {
      id: nextLocalId(attempts),
      score: scorePct,
      correct_count: correctCount,
      total_count: totalCount,
      duration_seconds: mockSecondsElapsed,
      created_at: new Date().toISOString(),
      domainBreakdown
    };
    attempts.unshift(savedAttempt);
    saveJson(STORAGE_KEYS.attempts, attempts);
    // Same object reference as the array entry above, so writing a
    // generated training plan onto it later (see runTrainingPlanRequest())
    // and re-saving STORAGE_KEYS.attempts persists it correctly.
    lastMockDiagnostics.attemptRecord = savedAttempt;

    // Render results
    resultsPctEl.textContent = `${Math.round(scorePct)}%`;
    resultsStatusEl.textContent = passed ? 'PASSED' : 'FAILED';
    resultsStatusEl.className = `results-label ${passed ? 'pass' : 'fail'}`;

    resultsCorrectEl.textContent = `${correctCount} / ${totalCount}`;
    resultsDurationEl.textContent = `${Math.floor(mockSecondsElapsed / 60)}m ${mockSecondsElapsed % 60}s`;

    if (passed) {
      resultsVerdictEl.textContent = 'ISACA Governance standard achieved. Operational security readiness verified!';
      resultsPctEl.style.color = 'var(--accent-green)';
    } else {
      resultsVerdictEl.textContent = 'Passing ratio not achieved. Audit and review recommended before retesting.';
      resultsPctEl.style.color = 'var(--accent-red)';
    }

    renderResultsDomainBreakdown(domainBreakdown);

    const hasMisses = correctCount < totalCount;
    if (btnTrainingPlan) {
      btnTrainingPlan.hidden = !hasMisses;
      btnTrainingPlan.disabled = false;
      btnTrainingPlan.textContent = '✨ Build My Training Plan';
    }
    if (resultsPerfectNoteEl) resultsPerfectNoteEl.hidden = hasMisses;

    mockResults.style.display = 'block';
    updateDashboardStats();
  }

  // Per-domain correct/answered breakdown for a single mock attempt, so a
  // weak domain shows up immediately on the results screen instead of only
  // in the aggregate dashboard mastery grid.
  function renderResultsDomainBreakdown(domainBreakdown) {
    if (!resultsDomainBreakdownEl) return;
    resultsDomainBreakdownEl.innerHTML = '';

    const domainList = (examConfig || FALLBACK_EXAM_CONFIG).domains || [];
    domainList.forEach(d => {
      const stats = domainBreakdown[d.id];
      if (!stats || stats.answered === 0) return; // domain not covered by this attempt's sample

      const pct = Math.round((stats.correct / stats.answered) * 100);
      const tier = pct >= 80 ? 'high' : pct >= 60 ? 'mid' : 'low';

      const item = document.createElement('div');
      item.className = 'results-domain-breakdown-item';
      item.innerHTML = `
        <span class="results-domain-breakdown-title">Domain ${d.id}: ${escapeHtml(d.title || '')}</span>
        <span class="results-domain-breakdown-score font-mono ${tier}">${pct}% (${stats.correct}/${stats.answered})</span>`;
      resultsDomainBreakdownEl.appendChild(item);
    });
  }

  btnMockReset.addEventListener('click', () => {
    mockResults.style.display = 'none';
    mockSetup.style.display = 'block';
  });

  // ==========================================
  // POST-EXAM AI TRAINING PLAN
  // ==========================================
  // Fourth consumer of the same BYOK Gemini pipeline as "Explain this
  // question," Trap Spotter, and the AI Tutor -- reuses the exact
  // key-check/unlock/call-Gemini flow, just with its own prompt (built from
  // lastMockDiagnostics, captured above in submitMockExam()) and its own
  // render tail so it can offer copy/print actions the shared
  // wireAiExplainButton() helper doesn't need for its simpler callers.

  // Guides 14-20 have a confirmed 1:1 KS mapping already (added alongside
  // their KS tagging in the same pass -- see the content-expansion plan
  // doc). The 8 entries below extend that to guides among the original 13
  // -- found by cross-checking each guide's actual topic against the live
  // `data/cism_seed.json` flashcard/question terms per KS code (not
  // guessed from titles alone), the same grounding method already used
  // elsewhere in this project's own gap-analysis work. Only added where a
  // guide's content is a clean, confident match to one specific KS code.
  // Several of the original 13 were deliberately left out: their topic
  // either spans multiple KS codes with no single clean anchor (BIA
  // Recovery Timelines' RTO/RPO/MTO/WRT content, for instance, touches
  // 4A2/4A3/4A4/4B5 at once), overlaps a KS code already claimed by a more
  // specific guide above (Risk Posture Levels vs. 2B3, already guide 17;
  // Quantitative Risk Formulas vs. 2A3, already guide 14), or is a
  // cross-cutting meta-guide not tied to any one KS at all (Exam-Day
  // Decision Engine). For all of those, same as before, the prompt hands
  // Gemini the full, live guide title list (queried from the DOM, same "no
  // hardcoded guide list" approach the Concept Guides tab itself uses) and
  // lets it match by topic instead of guessing a mapping here.
  // CISM-specific: keyed by real ISACA Knowledge Statement codes, which only
  // CISM's question data carries (see missedByKs's `q.knowledge_statement ||
  // 'Domain N (untagged)'` fallback above). For any other exam, item.ks is
  // that fallback string, so the lookup below simply misses and guideHint
  // stays empty -- no code changes needed there, this map just never
  // applies until an equivalent KS-style breakdown exists for that exam.
  const KS_TO_GUIDE_TITLE = {
    '2A3': 'Concept Guide 14: Risk Assessment Methodology',
    '2A2': 'Concept Guide 15: Vulnerability & Control Deficiency',
    '2B1': 'Concept Guide 16: Risk Treatment Options',
    '2B3': 'Concept Guide 17: Risk Monitoring & Reporting',
    '3A1': 'Concept Guide 18: Program Resource Decisions',
    '3A2': 'Concept Guide 19: Asset Identification & Classification',
    '3B5': 'Concept Guide 20: Third-Party & External Services',
    '4A2': 'Concept Guide 1: BIA Recovery Timelines',
    '4A1': 'Concept Guide 3: Incident Response Stages',
    '3B1': 'Concept Guide 4: Security Control Matrix',
    '2B2': 'Concept Guide 5: Governance & Risk Owner',
    '1A3': 'Concept Guide 7: Legal Liability & RACI',
    '1B2': 'Concept Guide 8: Documentation Hierarchy',
    '1B3': 'Concept Guide 9: Security Economics',
    '4A5': 'Concept Guide 12: Incident Severity Matrix'
  };

  // Only the active exam's own guides -- so the Training Plan's guide
  // recommendations for a SecurityX/CISSP session never suggest a CISM
  // guide title just because it happens to also be in the DOM.
  function getAllGuideTitles() {
    return Array.from(document.querySelectorAll('.guide-menu-item'))
      .filter(isGuideForActiveExam)
      .map(el => el.textContent.trim());
  }

  // One example line per missed question, cited in the prompt below. Mock
  // Exam always has a definite wrong pick (ex.pickedWrong is set, even for
  // "(left unanswered)"). Quiz Mistakes usually does too (see
  // buildQuizMistakesDiagnostics()), except the narrow case where the most
  // recent attempt on an still-open mistake was actually correct -- there's
  // no wrong pick to show, so this degrades to just the correct-answer
  // rationale instead of asserting a pick that isn't on record.
  function formatMissExample(ex) {
    return ex.pickedWrong
      ? `  - Missed: "${ex.question}" -- picked "${ex.pickedWrong}" (${ex.pickedWrongRationale}); correct was "${ex.correctAnswer}" (${ex.correctRationale})`
      : `  - Missed: "${ex.question}" -- correct answer: "${ex.correctAnswer}" (${ex.correctRationale})`;
  }

  function buildTrainingPlanPrompt(diag) {
    const guideTitles = getAllGuideTitles();

    const ksLines = diag.missedByKs.map(item => {
      const guideHint = KS_TO_GUIDE_TITLE[item.ks] ? ` (maps directly to ${KS_TO_GUIDE_TITLE[item.ks]})` : '';
      const exampleLines = item.examples.map(formatMissExample).join('\n');
      // item.ks is a real ISACA Knowledge Statement code only when the
      // question data actually carries one (CISM today); other exams fall
      // back to a plain "Domain N (untagged)" grouping key (see the
      // missedByKs builders above), so label it accordingly instead of
      // always saying "Knowledge Statement" for content that has none.
      const areaLabel = item.ksTitle
        ? `Knowledge Statement ${item.ks} -- ${item.ksTitle} (Domain ${item.domain}: ${item.domainTitle})`
        : `Domain ${item.domain}: ${item.domainTitle}`;
      return `${areaLabel}${guideHint} -- missed ${item.count} time(s):\n${exampleLines}`;
    }).join('\n\n');

    const systemPrompt = `You are an expert ${getExamFullName()} exam tutor building a personalized training plan. ` +
      'This is meant to be a comprehensive training document, not a short summary -- cover every knowledge area ' +
      'listed below, one entry per knowledge area, never consolidating multiple listed entries into one. Each ' +
      'knowledge area below is already labeled exactly as it should appear in your plan -- either a specific ' +
      'Knowledge Statement code and title (e.g. "Knowledge Statement 2B1 -- <title>") or, for exams whose content ' +
      "isn't broken down that granularly, a domain-level label (e.g. \"Domain 2: <title>\") -- use that exact label " +
      'verbatim, never invent, reword, or further consolidate it, and stay consistent ' +
      'if you reference that knowledge area again later in the plan. For each knowledge area, first state the ' +
      'correct rule or decision framework in one or two plain sentences, then explain the pattern behind the ' +
      'misses (not a rehash of the individual questions), so the student actually learns the concept rather than ' +
      'just being told what to go read. Plain text with short paragraphs or a few dashes for lists (no markdown ' +
      'headers, no asterisk bullets). Reference a Concept Guide by its exact title only when you are confident it ' +
      'covers the topic, and only from the list provided -- never invent a guide that is not in that list. ' +
      'Always end with a section titled exactly "Suggested next 3 study actions:" containing three short, ' +
      'concrete, ordered next steps.';

    // Mock Exam has a single scored attempt to open with; Quiz Mistakes has
    // no attempt at all -- just a live snapshot of what's currently flagged
    // by "My Mistakes" -- so the two sources need different opening framing.
    const introLine = diag.source === 'quiz'
      ? `The student has been using Certforge's practice quiz and currently has ${diag.mistakeCount} open mistake${diag.mistakeCount === 1 ? '' : 's'} across ${diag.missedByKs.length} knowledge area${diag.missedByKs.length === 1 ? '' : 's'} (a question counts as an "open mistake" once missed and not yet answered correctly twice in a row since).`
      : `The student just finished a ${diag.mode === 'full' ? 'Full-Length' : 'Quick Practice'} ${getExamName()} mock exam: ${diag.correctCount}/${diag.totalCount} correct (${Math.round(diag.scorePct)}%).`;

    const userPrompt = `${introLine}

Available Concept Guides in this app (reference by exact title only, and only when relevant):
${guideTitles.join('; ')}

What they missed, grouped by ISACA Knowledge Statement, most-missed first:

${ksLines}

Build a comprehensive, prioritized training plan covering every knowledge area listed above -- do not skip any ` +
      `and do not merge multiple knowledge areas into one domain-level entry. Order them by a combination of miss ` +
      `frequency and how heavily that domain is weighted on the real exam, most urgent first. For each: state the ` +
      `correct rule or decision framework in one or two plain sentences, then briefly explain the underlying ` +
      `pattern behind the misses (not a rehash of the individual questions above), then point to the most relevant ` +
      `Concept Guide title if one clearly applies. End with the "Suggested next 3 study actions:" section as instructed.`;

    return { systemPrompt, userPrompt };
  }

  // Builds the same missedByKs shape submitMockExam() does, but from
  // persistent cross-session data instead of one exam's mockQuestions/
  // mockAnswers: every question currently flagged by isPersonalMistake()
  // (the exact same definition the "My Mistakes" quiz toggle already uses),
  // cross-referenced against the full question bank for domain/KS/rationale.
  // quizAnsweredStates[q.id] (persisted to localStorage) holds the most
  // recent option picked for that question -- when it's still the wrong
  // one, that's the same "picked X, here's why" detail the mock version
  // gets from mockAnswers; when the most recent pick was already correct
  // (an open mistake with streak === 1, one more right answer from
  // clearing), there's no wrong pick on record and the example falls back
  // to the correct-answer rationale alone (see formatMissExample()).
  function buildQuizMistakesDiagnostics() {
    const missedByKs = {};
    let mistakeCount = 0;

    questions.forEach(q => {
      if (!isPersonalMistake(q.id)) return;
      mistakeCount++;

      const ks = q.knowledge_statement || `Domain ${q.domain} (untagged)`;
      if (!missedByKs[ks]) {
        missedByKs[ks] = {
          ks,
          ksTitle: q.knowledge_statement_title || '',
          domain: q.domain,
          domainTitle: getDomainTitle(q.domain),
          count: 0,
          examples: []
        };
      }
      missedByKs[ks].count++;

      if (missedByKs[ks].examples.length < 2) {
        const savedSelected = quizAnsweredStates[q.id];
        const correctKey = (q.correct_option || '').toLowerCase();
        const pickedKey = (savedSelected && savedSelected !== q.correct_option) ? String(savedSelected).toLowerCase() : null;
        missedByKs[ks].examples.push({
          question: q.question,
          pickedWrong: pickedKey ? (q[`option_${pickedKey}`] || '') : null,
          pickedWrongRationale: pickedKey ? (q[`rationale_${pickedKey}`] || '') : '',
          correctAnswer: q[`option_${correctKey}`] || '',
          correctRationale: q[`rationale_${correctKey}`] || q.explanation || ''
        });
      }
    });

    return {
      source: 'quiz',
      mistakeCount,
      missedByKs: Object.values(missedByKs).sort((a, b) => b.count - a.count)
    };
  }

  // Renders a plan (cached or freshly generated) using the same structured
  // formatting as Quiz/Trap Spotter/Guides -- see buildAiResponseHtml() --
  // splitting out the "Suggested next 3 study actions:" section the system
  // prompt always ends with into its own callout, same trick as "How to
  // remember this:" elsewhere.
  function renderTrainingPlan(text, { cached, model, ts }) {
    lastTrainingPlanText = text;
    if (trainingPlanResponseBodyEl) {
      trainingPlanResponseBodyEl.innerHTML = buildAiResponseHtml(text, { cached, model, ts }, {
        calloutMarker: 'Suggested next 3 study actions:',
        calloutLabel: '📋 Suggested next 3 study actions',
        disclaimer: `AI-generated — cross-check against the referenced Concept Guides and your official ${getExamName()} materials.`
      });
    }
    trainingPlanResponseEl?.classList.remove('error');
    if (trainingPlanActionsEl) trainingPlanActionsEl.hidden = false;
    if (btnTrainingPlanRetry) {
      btnTrainingPlanRetry.hidden = false;
      btnTrainingPlanRetry.textContent = '🔄 Regenerate';
    }
  }

  // forceRefresh=true (the Regenerate button) always calls Gemini. Otherwise,
  // a plan already saved on this attempt's record (attemptRecord.trainingPlan
  // -- written below on success) is shown instantly with no network call,
  // the same "don't make someone re-spend a lookup" idea as the AI response
  // cache used by Quiz/Trap Spotter/Guides. A Full-Length exam's plan is the
  // most expensive of the four AI features to regenerate, so this matters
  // most exactly where it's most expensive.
  async function runTrainingPlanRequest(forceRefresh) {
    if (!activeTrainingPlanDiag || activeTrainingPlanDiag.missedByKs.length === 0) return;
    if (!trainingPlanResponseBodyEl) return;

    const attemptRecord = activeTrainingPlanDiag.attemptRecord;
    if (!forceRefresh && attemptRecord?.trainingPlan) {
      renderTrainingPlan(attemptRecord.trainingPlan.text, {
        cached: true,
        model: attemptRecord.trainingPlan.model,
        ts: attemptRecord.trainingPlan.ts
      });
      return;
    }

    trainingPlanResponseBodyEl.textContent = 'Analyzing your results...';
    trainingPlanResponseEl?.classList.remove('error');
    if (trainingPlanActionsEl) trainingPlanActionsEl.hidden = true;
    if (btnTrainingPlanRetry) btnTrainingPlanRetry.hidden = true;
    if (trainingPlanStatusEl) trainingPlanStatusEl.textContent = '';

    try {
      const model = getGeminiModel();
      const { systemPrompt, userPrompt } = buildTrainingPlanPrompt(activeTrainingPlanDiag);
      const text = await callGeminiAPI(getGeminiApiKey(), model, systemPrompt, userPrompt);
      const ts = Date.now();
      renderTrainingPlan(text, { cached: false, model, ts });
      if (attemptRecord) {
        attemptRecord.trainingPlan = { text, model, ts };
        saveJson(STORAGE_KEYS.attempts, attempts);
      }
    } catch (err) {
      const message = err && err.message === 'NO_KEY'
        ? 'Add your Gemini API key in AI Setup first.'
        : (err?.message || 'Something went wrong asking Gemini.');
      trainingPlanResponseBodyEl.textContent = message;
      trainingPlanResponseEl?.classList.add('error');
      if (trainingPlanActionsEl) trainingPlanActionsEl.hidden = false;
      if (btnTrainingPlanRetry) {
        btnTrainingPlanRetry.hidden = false;
        btnTrainingPlanRetry.textContent = '🔁 Try again';
      }
    }
  }

  function openTrainingPlanModal(diag) {
    if (!trainingPlanModal || !diag) return;
    activeTrainingPlanDiag = diag;
    if (trainingPlanModalIntroEl) {
      trainingPlanModalIntroEl.textContent = diag.source === 'quiz'
        ? "Built from your open Practice Quiz mistakes, prioritized by ISACA knowledge area — powered by the same Gemini connection as the rest of Certforge's AI features."
        : "Built from what you missed on this attempt, prioritized by ISACA knowledge area — powered by the same Gemini connection as the rest of Certforge's AI features.";
    }
    trainingPlanModal.style.display = 'flex';
    trainingPlanModal.classList.remove('hidden');
    trainingPlanModal.setAttribute('aria-hidden', 'false');
    runTrainingPlanRequest(false);
  }

  function closeTrainingPlanModal() {
    if (!trainingPlanModal) return;
    trainingPlanModal.style.display = 'none';
    trainingPlanModal.classList.add('hidden');
    trainingPlanModal.setAttribute('aria-hidden', 'true');
  }

  if (btnTrainingPlan) {
    btnTrainingPlan.addEventListener('click', () => {
      if (getGeminiApiKey()) {
        openTrainingPlanModal(lastMockDiagnostics);
        return;
      }
      if (hasGeminiVault()) {
        openAiUnlockModal(() => {
          refreshAiHeaderButtonState();
          openTrainingPlanModal(lastMockDiagnostics);
        });
        return;
      }
      showToast('Add your Gemini API key in AI Setup first');
      openAiSettingsModal();
    });
  }

  // Practice Quiz's entry point into the same modal/prompt/render pipeline
  // as Mock Exam's -- see buildQuizMistakesDiagnostics(). Unlike Mock Exam,
  // there's no "session just ended" moment to hang a button off of, so this
  // one is just always there next to "My Mistakes" and builds a fresh
  // snapshot at click time.
  if (btnQuizTrainingPlan) {
    btnQuizTrainingPlan.addEventListener('click', () => {
      const diag = buildQuizMistakesDiagnostics();
      if (diag.missedByKs.length === 0) {
        showToast('No open mistakes right now — nice work!');
        return;
      }
      if (getGeminiApiKey()) {
        openTrainingPlanModal(diag);
        return;
      }
      if (hasGeminiVault()) {
        openAiUnlockModal(() => {
          refreshAiHeaderButtonState();
          openTrainingPlanModal(diag);
        });
        return;
      }
      showToast('Add your Gemini API key in AI Setup first');
      openAiSettingsModal();
    });
  }

  btnCloseTrainingPlan?.addEventListener('click', closeTrainingPlanModal);
  trainingPlanModal?.addEventListener('click', (e) => {
    if (e.target === trainingPlanModal) closeTrainingPlanModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && trainingPlanModal && !trainingPlanModal.classList.contains('hidden')) {
      closeTrainingPlanModal();
    }
  });
  btnTrainingPlanRetry?.addEventListener('click', () => runTrainingPlanRequest(true));

  btnTrainingPlanCopy?.addEventListener('click', async () => {
    if (!trainingPlanStatusEl) return;
    try {
      await navigator.clipboard.writeText(lastTrainingPlanText || trainingPlanResponseBodyEl?.textContent || '');
      trainingPlanStatusEl.textContent = 'Copied to clipboard.';
    } catch {
      trainingPlanStatusEl.textContent = 'Could not copy -- select the text and copy manually.';
    }
    setTimeout(() => { trainingPlanStatusEl.textContent = ''; }, 2500);
  });

  btnTrainingPlanPrint?.addEventListener('click', () => {
    window.print();
  });

  // "Drill these now" -- closes the loop the plan itself can't: jumps
  // straight into Quiz, pre-filtered to the single weakest domain
  // (missedByKs is already sorted most-missed-first in submitMockExam())
  // with "My Mistakes" on, instead of leaving the student to go set those
  // filters up by hand after reading the plan.
  btnTrainingPlanDrill?.addEventListener('click', () => {
    const topMiss = activeTrainingPlanDiag?.missedByKs?.[0];
    if (!topMiss) return;
    closeTrainingPlanModal();
    switchToTab('tab-quiz');
    if (quizDomainSelect) quizDomainSelect.value = String(topMiss.domain);
    if (quizWeakSpotToggle) {
      quizWeakSpotToggle.checked = false;
      quizWeakSpotToggle.closest('.weak-spot-toggle')?.classList.remove('checked');
    }
    if (quizShowAllToggle) {
      quizShowAllToggle.checked = false;
      quizShowAllToggle.closest('.weak-spot-toggle')?.classList.remove('checked');
    }
    if (quizMistakesToggle) {
      quizMistakesToggle.checked = true;
      quizMistakesToggle.closest('.weak-spot-toggle')?.classList.add('checked');
    }
    filterQuizQuestions();
    showToast(`Drilling Domain ${topMiss.domain}: ${topMiss.domainTitle} — your mistakes only`);
  });

  // ==========================================
  // DECK CURATOR (MANAGER FORMS)
  // ==========================================
  
  // Custom Flashcard commit
  formAddFlashcard.addEventListener('submit', (e) => {
    e.preventDefault();
    flashcardStatus.textContent = '';

    const term = formAddFlashcard.querySelector('[name="term"]').value.trim();
    const definition = formAddFlashcard.querySelector('[name="definition"]').value.trim();
    const domain = parseInt(formAddFlashcard.querySelector('[name="domain"]').value);
    const whyItMatters = formAddFlashcard.querySelector('[name="why_it_matters"]').value.trim();
    const commonTrap = formAddFlashcard.querySelector('[name="common_trap"]').value.trim();
    const weakSpot = formAddFlashcard.querySelector('[name="weak_spot"]').checked;

    const savedCard = {
      id: nextLocalId(flashcards),
      term,
      definition,
      domain,
      source: 'original'
    };
    if (whyItMatters) savedCard.why_it_matters = whyItMatters;
    if (commonTrap) savedCard.common_trap = commonTrap;
    if (weakSpot) savedCard.weak_spot = true;

    flashcards.push(savedCard);
    saveJson(STORAGE_KEYS.flashcards, flashcards);

    flashcardStatus.className = 'form-status success';
    flashcardStatus.textContent = '✅ Flashcard saved locally.';

    formAddFlashcard.reset();
    filterFlashcards();
    updateDashboardStats();
  });

  // Custom Question commit
  formAddQuestion.addEventListener('submit', (e) => {
    e.preventDefault();
    questionStatus.textContent = '';

    const question = formAddQuestion.querySelector('[name="question"]').value.trim();
    const option_a = formAddQuestion.querySelector('[name="option_a"]').value.trim();
    const option_b = formAddQuestion.querySelector('[name="option_b"]').value.trim();
    const option_c = formAddQuestion.querySelector('[name="option_c"]').value.trim();
    const option_d = formAddQuestion.querySelector('[name="option_d"]').value.trim();
    const correct_option = formAddQuestion.querySelector('[name="correct_option"]').value;
    const domain = parseInt(formAddQuestion.querySelector('[name="domain"]').value);
    const explanation = formAddQuestion.querySelector('[name="explanation"]').value.trim();
    const rationale_a = formAddQuestion.querySelector('[name="rationale_a"]').value.trim();
    const rationale_b = formAddQuestion.querySelector('[name="rationale_b"]').value.trim();
    const rationale_c = formAddQuestion.querySelector('[name="rationale_c"]').value.trim();
    const rationale_d = formAddQuestion.querySelector('[name="rationale_d"]').value.trim();
    const weakSpot = formAddQuestion.querySelector('[name="weak_spot"]').checked;

    const savedQ = {
      id: nextLocalId(questions),
      question,
      option_a,
      option_b,
      option_c,
      option_d,
      correct_option,
      explanation,
      domain,
      source: 'original'
    };
    // Per-choice rationale is optional -- only attach it when all four are filled in,
    // so the quiz's rationale breakdown either shows fully or falls back cleanly.
    if (rationale_a && rationale_b && rationale_c && rationale_d) {
      savedQ.rationale_a = rationale_a;
      savedQ.rationale_b = rationale_b;
      savedQ.rationale_c = rationale_c;
      savedQ.rationale_d = rationale_d;
    }
    if (weakSpot) savedQ.weak_spot = true;
    questions.push(savedQ);
    saveJson(STORAGE_KEYS.questions, questions);

    questionStatus.className = 'form-status success';
    questionStatus.textContent = '✅ Question saved locally.';

    formAddQuestion.reset();
    filterQuizQuestions();
    updateDashboardStats();
  });

  const localResetSelect = document.getElementById('local-reset-select');

  if (btnResetLocalData) {
    btnResetLocalData.addEventListener('click', () => {
      const examLabel = (examConfig || FALLBACK_EXAM_CONFIG).name || 'exam';
      const domainList = (examConfig || FALLBACK_EXAM_CONFIG).domains || [];
      const selection = localResetSelect ? localResetSelect.value : 'all';

      let confirmMsg;
      let successMsg;
      let action;

      if (selection === 'domain:all') {
        confirmMsg = `This will reset mastery progress (answered/correct counts and question history) for ALL ${examLabel} domains. Bookmarks, mock exam history, and custom Curator content are kept. Continue?`;
        successMsg = 'All domain mastery progress reset. Reloading...';
        action = () => domainList.forEach(d => resetDomainProgress(d.id));
      } else if (selection.startsWith('domain:')) {
        const domainId = selection.slice('domain:'.length);
        const domain = domainList.find(d => String(d.id) === domainId);
        const domainName = domain ? `Domain ${domain.id}: ${domain.title}` : `Domain ${domainId}`;
        confirmMsg = `This will reset mastery progress for ${domainName} only. Other domains, bookmarks, and history are kept. Continue?`;
        successMsg = `${domainName} progress reset. Reloading...`;
        action = () => resetDomainProgress(domainId);
      } else if (selection === 'flashcardMastery') {
        confirmMsg = `This will reset flashcard mastery levels for all ${examLabel} flashcards. Continue?`;
        successMsg = 'Flashcard progress reset. Reloading...';
        action = () => {
          flashcardMastery = {};
          saveJson(STORAGE_KEYS.flashcardMastery, flashcardMastery);
        };
      } else if (selection === 'guideMastery') {
        confirmMsg = 'This will reset your Concept Guide mastery tracking. Continue?';
        successMsg = 'Concept guide progress reset. Reloading...';
        action = () => {
          guideMastery = {};
          saveJson(STORAGE_KEYS.guideMastery, guideMastery);
        };
      } else if (selection === 'bookmarks') {
        confirmMsg = 'This will clear all bookmarked/flagged questions and flashcards. Continue?';
        successMsg = 'Bookmarks cleared. Reloading...';
        action = () => {
          bookmarks = [];
          saveJson(STORAGE_KEYS.bookmarks, bookmarks);
        };
      } else if (selection === 'attempts') {
        confirmMsg = 'This will erase your mock exam attempt history. Continue?';
        successMsg = 'Mock exam history reset. Reloading...';
        action = () => {
          attempts = [];
          saveJson(STORAGE_KEYS.attempts, attempts);
        };
      } else if (selection === 'customContent') {
        confirmMsg = 'This will remove all questions and flashcards you added yourself via the Deck Curator. Seed content is kept. Continue?';
        successMsg = 'Custom Curator entries removed. Reloading...';
        action = () => {
          questions = questions.filter(q => q.seed === true);
          flashcards = flashcards.filter(c => c.seed === true);
          saveJson(STORAGE_KEYS.questions, questions);
          saveJson(STORAGE_KEYS.flashcards, flashcards);
        };
      } else {
        // 'all' (and any unrecognized value) falls back to the original full reset.
        confirmMsg = `This will erase all local ${examLabel} progress, bookmarks, attempts, quiz history, and custom deck entries for this browser. Continue?`;
        successMsg = `Local ${examLabel} data reset complete. Reloading...`;
        action = () => {
          Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
          LEGACY_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
          Object.values(LEGACY_FLAT_KEYS).forEach(key => localStorage.removeItem(key));
        };
      }

      const proceed = confirm(confirmMsg);
      if (!proceed) {
        return;
      }

      action();

      if (localResetStatus) {
        localResetStatus.className = 'form-status success';
        localResetStatus.textContent = successMsg;
      }

      setTimeout(() => {
        window.location.reload();
      }, 250);
    });
  }

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

  // Concept Guide Diagram Enlarge Modal -- the inline SVG diagrams in the
  // guide viewer are too small to read at their normal card size, so
  // clicking one clones its markup into a large centered modal.
  const guideGraphicModal = document.getElementById('guide-graphic-modal');
  const guideGraphicModalBody = document.getElementById('guide-graphic-modal-body');
  const btnCloseGuideGraphic = document.getElementById('btn-close-guide-graphic');

  if (guideGraphicModal && guideGraphicModalBody) {
    const openGuideGraphicModal = (svgEl) => {
      guideGraphicModalBody.innerHTML = '';
      guideGraphicModalBody.appendChild(svgEl.cloneNode(true));
      guideGraphicModal.style.display = 'flex';
      guideGraphicModal.classList.remove('hidden');
      guideGraphicModal.setAttribute('aria-hidden', 'false');
    };
    const closeGuideGraphicModal = () => {
      guideGraphicModal.style.display = 'none';
      guideGraphicModal.classList.add('hidden');
      guideGraphicModal.setAttribute('aria-hidden', 'true');
      guideGraphicModalBody.innerHTML = '';
    };

    document.querySelectorAll('.guide-graphic').forEach((graphic) => {
      graphic.setAttribute('tabindex', '0');
      graphic.setAttribute('role', 'button');
      graphic.setAttribute('aria-label', 'Enlarge diagram');
      graphic.addEventListener('click', () => {
        const svgEl = graphic.querySelector('svg');
        if (svgEl) openGuideGraphicModal(svgEl);
      });
      graphic.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const svgEl = graphic.querySelector('svg');
          if (svgEl) openGuideGraphicModal(svgEl);
        }
      });
    });

    if (btnCloseGuideGraphic) btnCloseGuideGraphic.addEventListener('click', closeGuideGraphicModal);
    guideGraphicModal.addEventListener('click', (e) => {
      if (e.target === guideGraphicModal) closeGuideGraphicModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !guideGraphicModal.classList.contains('hidden')) {
        closeGuideGraphicModal();
      }
    });
  }

  // ==========================================
  // GLOBAL KEYWORD SEARCH
  // ==========================================
  // One flat index built once content loads (see buildSearchIndex(), called
  // at the end of loadData()), covering flashcards, quiz questions, trap
  // statements, and the guide articles already sitting in the DOM. Mock Exam
  // is intentionally excluded -- jumping mid-timed-test doesn't make sense,
  // and mock questions are drawn from the same bank quiz search already
  // covers.

  const searchWidgetEl = document.getElementById('search-widget');
  const searchToggleBtn = document.getElementById('btn-search-toggle');
  const searchInputEl = document.getElementById('search-input');
  const searchResultsEl = document.getElementById('search-results');

  let searchIndex = [];
  let searchActiveIndex = -1;
  let searchDebounceTimer = null;

  function buildSearchIndex() {
    const index = [];

    flashcards.forEach(card => {
      const body = [card.term, card.definition, card.why_it_matters, card.common_trap].filter(Boolean).join(' ');
      index.push({
        type: 'flashcard',
        typeLabel: 'Flashcard',
        ref: card,
        domain: card.domain,
        body,
        normBody: body.toLowerCase(),
        normTitle: (card.term || '').toLowerCase(),
      });
    });

    questions.forEach(q => {
      const body = [q.question, q.option_a, q.option_b, q.option_c, q.option_d, q.explanation].filter(Boolean).join(' ');
      index.push({
        type: 'quiz',
        typeLabel: 'Quiz',
        ref: q,
        domain: q.domain,
        body,
        normBody: body.toLowerCase(),
        normTitle: (q.question || '').toLowerCase(),
      });
    });

    distractors.forEach(trap => {
      const body = [trap.trap_statement, trap.why_it_fails, trap.correct_principle].filter(Boolean).join(' ');
      index.push({
        type: 'trap',
        typeLabel: 'Trap Spotter',
        ref: trap,
        domain: trap.domain,
        body,
        normBody: body.toLowerCase(),
        normTitle: (trap.trap_statement || '').toLowerCase(),
      });
    });

    // Only index guides belonging to the active exam -- otherwise a
    // SecurityX/CISSP session's global search would surface CISM guide
    // content just because it's still sitting in the same DOM.
    Array.from(guideDetails).filter(isGuideForActiveExam).forEach(article => {
      const menuItem = Array.from(guideMenuItems).find(mi => mi.dataset.guide === article.id);
      const title = menuItem ? menuItem.textContent.trim() : article.id;
      const body = (article.textContent || '').replace(/\s+/g, ' ').trim();
      index.push({
        type: 'guide',
        typeLabel: 'Guide',
        ref: article.id,
        domain: null,
        body,
        normBody: body.toLowerCase(),
        normTitle: title.toLowerCase(),
      });
    });

    searchIndex = index;
  }

  // Simple multi-term AND match over ~600 items -- fast enough to run on
  // every keystroke without an index library. Title hits (term/question/trap
  // statement itself) rank above hits buried only in the body text.
  function runSearch(query) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (terms.length === 0) return [];

    const matches = [];
    searchIndex.forEach(entry => {
      const allMatch = terms.every(term => entry.normBody.includes(term));
      if (!allMatch) return;
      const titleHit = terms.some(term => entry.normTitle.includes(term));
      matches.push({ entry, titleHit });
    });

    matches.sort((a, b) => {
      if (a.titleHit !== b.titleHit) return a.titleHit ? -1 : 1;
      return a.entry.body.length - b.entry.body.length;
    });

    return matches.slice(0, 20).map(m => m.entry);
  }

  // Pulls a short window of text around the first matched term so a long
  // guide/quiz body doesn't just show its opening sentence when the actual
  // hit is buried further in, then wraps every matched term in <mark>.
  function highlightSnippet(entry, terms) {
    const source = entry.body;
    const lowerSource = entry.normBody;
    let matchAt = -1;
    terms.forEach(term => {
      const idx = lowerSource.indexOf(term);
      if (idx !== -1 && (matchAt === -1 || idx < matchAt)) matchAt = idx;
    });
    const anchor = matchAt === -1 ? 0 : matchAt;
    const start = Math.max(0, anchor - 60);
    const end = Math.min(source.length, anchor + 140);
    let snippet = source.slice(start, end);
    if (start > 0) snippet = '…' + snippet;
    if (end < source.length) snippet += '…';

    let safe = escapeHtml(snippet);
    terms.forEach(term => {
      if (!term) return;
      const re = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      safe = safe.replace(re, '<mark>$1</mark>');
    });
    return safe;
  }

  function renderSearchResults(query) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const results = runSearch(query);
    searchActiveIndex = -1;

    if (results.length === 0) {
      // A dead end otherwise -- the AI Tutor conversation persists across
      // reloads now, so bridging a zero-result search into it is a much
      // lower-risk offer than it would've been before (nothing gets lost by
      // leaving the search box for the tutor tab).
      searchResultsEl.innerHTML = `
        <div class="search-empty-state">No matches found.</div>
        <button type="button" class="search-ask-tutor-btn" id="search-ask-tutor-btn">💬 Ask the AI Tutor about "${escapeHtml(query)}" instead</button>
      `;
      searchResultsEl.hidden = false;
      searchResultsEl._currentResults = [];
      document.getElementById('search-ask-tutor-btn')?.addEventListener('click', () => {
        const askedQuery = query;
        collapseSearch();
        jumpToAiDeepDive(`Can you explain "${askedQuery}" in the context of the ${getExamName()} exam?`, null);
      });
      return;
    }

    searchResultsEl.innerHTML = results.map((entry, i) => {
      const domainLabel = entry.domain ? `Domain ${entry.domain}` : '';
      return `
        <div class="search-result-item" data-index="${i}" role="option">
          <div class="search-result-meta">
            <span>${entry.typeLabel}</span>
            ${domainLabel ? `<span class="search-result-domain">· ${escapeHtml(domainLabel)}</span>` : ''}
          </div>
          <div class="search-result-snippet">${highlightSnippet(entry, terms)}</div>
        </div>`;
    }).join('');

    searchResultsEl.hidden = false;
    searchResultsEl._currentResults = results;
    searchResultsEl.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        jumpToSearchResult(results[parseInt(item.dataset.index, 10)]);
      });
    });
  }

  function setSearchActiveResult(newIndex) {
    const items = searchResultsEl.querySelectorAll('.search-result-item');
    if (items.length === 0) return;
    items.forEach(item => item.classList.remove('active'));
    searchActiveIndex = ((newIndex % items.length) + items.length) % items.length;
    const activeItem = items[searchActiveIndex];
    activeItem.classList.add('active');
    activeItem.scrollIntoView({ block: 'nearest' });
  }

  function collapseSearch() {
    searchWidgetEl.classList.remove('expanded');
    searchToggleBtn.setAttribute('aria-expanded', 'false');
    searchInputEl.setAttribute('aria-expanded', 'false');
    searchResultsEl.hidden = true;
    searchResultsEl.innerHTML = '';
    searchResultsEl._currentResults = [];
    searchInputEl.value = '';
    searchActiveIndex = -1;
  }

  function expandSearch() {
    searchWidgetEl.classList.add('expanded');
    searchToggleBtn.setAttribute('aria-expanded', 'true');
    searchInputEl.setAttribute('aria-expanded', 'true');
    searchInputEl.focus();
  }

  function switchToTab(tabTargetId) {
    const targetBtn = Array.from(tabButtons).find(b => b.dataset.target === tabTargetId);
    if (targetBtn) targetBtn.click();
  }

  function jumpToSearchResult(entry) {
    if (!entry) return;

    if (entry.type === 'flashcard') {
      switchToTab('tab-flashcards');
      if (flashcardDomainSelect) flashcardDomainSelect.value = 'all';
      if (flashcardWeakSpotToggle) flashcardWeakSpotToggle.checked = false;
      if (flashcardUnlearnedToggle) flashcardUnlearnedToggle.checked = false;
      filterFlashcards();
      const idx = filteredCards.indexOf(entry.ref);
      if (idx !== -1) {
        currentCardIndex = idx;
        renderFlashcard();
      }
    } else if (entry.type === 'quiz') {
      switchToTab('tab-quiz');
      if (quizDomainSelect) quizDomainSelect.value = 'all';
      if (quizWeakSpotToggle) quizWeakSpotToggle.checked = false;
      if (quizMistakesToggle) quizMistakesToggle.checked = false;
      if (quizShowAllToggle) quizShowAllToggle.checked = true;
      filterQuizQuestions();
      const idx = filteredQuestions.indexOf(entry.ref);
      if (idx !== -1) {
        currentQuizIndex = idx;
        renderQuizQuestion();
      }
    } else if (entry.type === 'trap') {
      switchToTab('tab-trapspotter');
      if (trapDomainSelect) trapDomainSelect.value = 'all';
      filterTraps();
      const idx = filteredTraps.indexOf(entry.ref);
      if (idx !== -1) {
        currentTrapIndex = idx;
        renderTrapCard();
      }
    } else if (entry.type === 'guide') {
      switchToTab('tab-guides');
      if (guideFocusShakyToggle && guideFocusShakyToggle.checked) {
        guideFocusShakyToggle.checked = false;
        guideFocusShakyToggle.dispatchEvent(new Event('change'));
      }
      const menuItem = Array.from(guideMenuItems).find(mi => mi.dataset.guide === entry.ref);
      if (menuItem) {
        menuItem.click();
        menuItem.scrollIntoView({ block: 'nearest' });
      }
    }

    collapseSearch();
  }

  function initSearch() {
    if (!searchWidgetEl || !searchToggleBtn || !searchInputEl || !searchResultsEl) return;

    searchToggleBtn.addEventListener('click', () => {
      if (searchWidgetEl.classList.contains('expanded')) {
        collapseSearch();
      } else {
        expandSearch();
      }
    });

    searchInputEl.addEventListener('input', () => {
      clearTimeout(searchDebounceTimer);
      const query = searchInputEl.value.trim();
      searchDebounceTimer = setTimeout(() => {
        if (query.length === 0) {
          searchResultsEl.hidden = true;
          searchResultsEl.innerHTML = '';
          searchResultsEl._currentResults = [];
          return;
        }
        if (query.length < 2) {
          searchResultsEl.hidden = false;
          searchResultsEl.innerHTML = '<div class="search-empty-state">Keep typing… (2+ characters)</div>';
          searchResultsEl._currentResults = [];
          return;
        }
        renderSearchResults(query);
      }, 150);
    });

    searchInputEl.addEventListener('keydown', (e) => {
      const items = searchResultsEl.querySelectorAll('.search-result-item');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (items.length) setSearchActiveResult(searchActiveIndex + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (items.length) setSearchActiveResult(searchActiveIndex - 1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const results = searchResultsEl._currentResults || [];
        if (searchActiveIndex >= 0 && results[searchActiveIndex]) {
          jumpToSearchResult(results[searchActiveIndex]);
        } else if (results.length === 1) {
          jumpToSearchResult(results[0]);
        }
      } else if (e.key === 'Escape') {
        collapseSearch();
      }
    });

    document.addEventListener('click', (e) => {
      if (searchWidgetEl.classList.contains('expanded') && !searchWidgetEl.contains(e.target)) {
        collapseSearch();
      }
    });
  }

  initSearch();

  // Load database content on boot. The loading overlay is hidden in a
  // finally block so a genuine error mid-load still reveals the app (with
  // whatever partial state exists) instead of leaving the spinner stuck
  // forever -- a broken app is at least debuggable, a blank spinner isn't.
  const appLoadingOverlay = document.getElementById('app-loading');
  loadData()
    .catch(e => console.error('[SYSTEM] loadData() failed:', e))
    .finally(() => {
      if (appLoadingOverlay) appLoadingOverlay.classList.add('app-loaded');
    });
});

