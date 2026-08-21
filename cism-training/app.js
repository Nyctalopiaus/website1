document.addEventListener('DOMContentLoaded', () => {
  // Navigation Tabs
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');

  // Stats Elements
  const statAnsweredEl = document.getElementById('stat-answered');
  const statAccuracyEl = document.getElementById('stat-accuracy');
  const statFlaggedEl = document.getElementById('stat-flagged');
  const statPassedEl = document.getElementById('stat-passed');

  // Circle bars
  const domainBars = {
    1: document.getElementById('domain-bar-1'),
    2: document.getElementById('domain-bar-2'),
    3: document.getElementById('domain-bar-3'),
    4: document.getElementById('domain-bar-4')
  };
  const domainPcts = {
    1: document.getElementById('domain-pct-1'),
    2: document.getElementById('domain-pct-2'),
    3: document.getElementById('domain-pct-3'),
    4: document.getElementById('domain-pct-4')
  };

  // Flashcards Elements
  const flashcardEl = document.getElementById('cism-card');
  const cardDomainTag = document.getElementById('card-domain-tag');
  const cardTermEl = document.getElementById('card-term');
  const cardDefinitionEl = document.getElementById('card-definition');
  const cardCounterEl = document.getElementById('card-counter');
  const flashcardDomainSelect = document.getElementById('flashcard-domain-select');
  const btnPrevCard = document.getElementById('btn-prev-card');
  const btnNextCard = document.getElementById('btn-next-card');

  // Quiz Elements
  const quizDomainTag = document.getElementById('quiz-domain-tag');
  const quizQuestionEl = document.getElementById('quiz-question');
  const quizOptionsList = document.getElementById('quiz-options-list');
  const quizExplanationContainer = document.getElementById('quiz-explanation-container');
  const explanationStatusEl = document.getElementById('explanation-status');
  const explanationTextEl = document.getElementById('explanation-text');
  const quizCounterEl = document.getElementById('quiz-counter');
  const btnPrevQuiz = document.getElementById('btn-prev-quiz');
  const btnNextQuiz = document.getElementById('btn-next-quiz');
  const btnQuizBookmark = document.getElementById('btn-quiz-bookmark');

  // Mock Elements
  const mockSetup = document.getElementById('mock-setup');
  const mockActive = document.getElementById('mock-active');
  const mockResults = document.getElementById('mock-results');
  const btnStartMock = document.getElementById('btn-start-mock');
  const mockProgressEl = document.getElementById('mock-progress');
  const mockTimerEl = document.getElementById('mock-timer');
  const mockQuestionEl = document.getElementById('mock-question');
  const mockOptionsList = document.querySelector('#mock-active .quiz-options');
  const btnMockPrev = document.getElementById('btn-mock-prev');
  const btnMockNext = document.getElementById('btn-mock-next');
  const btnMockFlag = document.getElementById('btn-mock-flag');
  const resultsPctEl = document.getElementById('results-pct');
  const resultsStatusEl = document.getElementById('results-status');
  const resultsCorrectEl = document.getElementById('results-correct');
  const resultsDurationEl = document.getElementById('results-duration');
  const resultsVerdictEl = document.getElementById('results-verdict');
  const btnMockReset = document.getElementById('btn-mock-reset');

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
  let bookmarks = [];
  let attempts = [];

  let currentCardIndex = 0;
  let currentQuizIndex = 0;
  let filteredCards = [];

  // Quiz answered states persisted locally
  let quizAnsweredStates = {}; // question_id -> selected_option

  // Local Storage Keys
  const STORAGE_KEYS = {
    perf: 'cism_performance_v2',
    questions: 'cism_questions_v1',
    flashcards: 'cism_flashcards_v1',
    bookmarks: 'cism_bookmarks_v1',
    attempts: 'cism_attempts_v1',
    quizAnswered: 'cism_quiz_answer_state_v1',
    seedInitialized: 'cism_seed_initialized_v1'
  };

  const LEGACY_STORAGE_KEYS = ['cism_performance_v1', 'cism_user'];

  let perfData = {
    answered: 0,
    correct: 0,
    domains: {
      1: { answered: 0, correct: 0 },
      2: { answered: 0, correct: 0 },
      3: { answered: 0, correct: 0 },
      4: { answered: 0, correct: 0 }
    }
  };

  // Migration of legacy performance data key.
  const legacyPerf = localStorage.getItem('cism_performance_v1');
  if (legacyPerf && !localStorage.getItem(STORAGE_KEYS.perf)) {
    localStorage.setItem(STORAGE_KEYS.perf, legacyPerf);
    localStorage.removeItem('cism_performance_v1');
  }

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

  async function ensureSeedData() {
    const alreadyInitialized = localStorage.getItem(STORAGE_KEYS.seedInitialized) === '1';
    const existingQuestions = ensureNumericIds(loadJson(STORAGE_KEYS.questions, []));
    const existingFlashcards = ensureNumericIds(loadJson(STORAGE_KEYS.flashcards, []));

    if (existingQuestions.length > 0 || existingFlashcards.length > 0) {
      if (existingQuestions.length > 0) {
        saveJson(STORAGE_KEYS.questions, existingQuestions);
      }
      if (existingFlashcards.length > 0) {
        saveJson(STORAGE_KEYS.flashcards, existingFlashcards);
      }
      return;
    }

    if (alreadyInitialized) {
      return;
    }

    try {
      const response = await fetch('data/cism_seed.json', { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Seed fetch failed with HTTP ${response.status}`);
      }

      const seedData = await response.json();
      const seededQuestions = ensureNumericIds(seedData?.questions ?? []);
      const seededFlashcards = ensureNumericIds(seedData?.flashcards ?? []);

      saveJson(STORAGE_KEYS.questions, seededQuestions);
      saveJson(STORAGE_KEYS.flashcards, seededFlashcards);
      saveJson(STORAGE_KEYS.bookmarks, []);
      saveJson(STORAGE_KEYS.attempts, []);
      saveJson(STORAGE_KEYS.quizAnswered, {});
      localStorage.setItem(STORAGE_KEYS.seedInitialized, '1');
    } catch (e) {
      console.warn('[SYSTEM] Seed file unavailable. Starting with empty local datasets.', e);
      saveJson(STORAGE_KEYS.questions, []);
      saveJson(STORAGE_KEYS.flashcards, []);
      saveJson(STORAGE_KEYS.bookmarks, []);
      saveJson(STORAGE_KEYS.attempts, []);
      saveJson(STORAGE_KEYS.quizAnswered, {});
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
      domains: {
        1: { answered: 0, correct: 0 },
        2: { answered: 0, correct: 0 },
        3: { answered: 0, correct: 0 },
        4: { answered: 0, correct: 0 }
      }
    };
  }

  function saveUserStats() {
    saveJson(STORAGE_KEYS.perf, perfData);
  }

  // Mock Exam Variables
  let mockQuestions = [];
  let mockAnswers = {}; // mock_question_index -> selected_option
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
    });
  });

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
    });
  });

  // Initial stats load
  loadUserStats();

  // ==========================================
  // Local Data Loaders
  // ==========================================
  
  async function loadData() {
    await ensureSeedData();

    questions = ensureNumericIds(loadJson(STORAGE_KEYS.questions, []));
    flashcards = ensureNumericIds(loadJson(STORAGE_KEYS.flashcards, []));
    bookmarks = loadJson(STORAGE_KEYS.bookmarks, []);
    attempts = loadJson(STORAGE_KEYS.attempts, []);
    quizAnsweredStates = loadJson(STORAGE_KEYS.quizAnswered, {});

    initFlashcards();
    initQuiz();
    updateDashboardStats();
  }

  function updateDashboardStats() {
    // Answered & accuracy
    statAnsweredEl.textContent = perfData.answered;
    const accuracy = perfData.answered > 0 ? Math.round((perfData.correct / perfData.answered) * 100) : 0;
    statAccuracyEl.textContent = `${accuracy}%`;

    // Flagged count
    statFlaggedEl.textContent = bookmarks.length;

    // Mock Exams Passed (score >= 70%)
    const passedCount = attempts.filter(a => a.score >= 70).length;
    statPassedEl.textContent = passedCount;

    // Domain Mastery Progress Circles
    for (let d = 1; d <= 4; d++) {
      const dData = perfData.domains[d];
      const dPct = dData.answered > 0 ? Math.round((dData.correct / dData.answered) * 100) : 0;
      
      // Update text
      domainPcts[d].textContent = `${dPct}%`;
      
      // Draw circular svg offset
      const offset = CIRCUMFERENCE - (dPct / 100) * CIRCUMFERENCE;
      domainBars[d].style.strokeDashoffset = offset;
    }
  }

  function savePerformance() {
    saveUserStats();
    updateDashboardStats();
  }

  // ==========================================
  // FLASHCARDS CONSOLE
  // ==========================================
  
  function initFlashcards() {
    filterFlashcards();
    
    // Card flipping listener
    flashcardEl.addEventListener('click', () => {
      flashcardEl.classList.toggle('flipped');
    });

    // Domain filter changes
    flashcardDomainSelect.addEventListener('change', () => {
      filterFlashcards();
    });

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
    if (domainVal === 'all') {
      filteredCards = flashcards;
    } else {
      const dNum = parseInt(domainVal);
      filteredCards = flashcards.filter(c => c.domain === dNum);
    }
    
    currentCardIndex = 0;
    renderFlashcard();
  }

  function renderFlashcard() {
    flashcardEl.classList.remove('flipped'); // reset orientation
    
    if (filteredCards.length === 0) {
      cardDomainTag.textContent = 'NONE';
      cardTermEl.textContent = 'No Flashcards Found';
      cardDefinitionEl.textContent = 'Please insert custom flashcards via the Curator panel.';
      cardCounterEl.textContent = '0 / 0';
      btnPrevCard.disabled = true;
      btnNextCard.disabled = true;
      return;
    }

    const card = filteredCards[currentCardIndex];
    cardDomainTag.textContent = `Domain ${card.domain}`;
    cardTermEl.textContent = card.term;
    cardDefinitionEl.textContent = card.definition;
    cardCounterEl.textContent = `${currentCardIndex + 1} / ${filteredCards.length}`;

    btnPrevCard.disabled = currentCardIndex === 0;
    btnNextCard.disabled = currentCardIndex === filteredCards.length - 1;
  }

  // ==========================================
  // PRACTICE QUIZ CONSOLE
  // ==========================================
  
  function initQuiz() {
    currentQuizIndex = 0;
    renderQuizQuestion();

    btnPrevQuiz.addEventListener('click', () => {
      if (currentQuizIndex > 0) {
        currentQuizIndex--;
        renderQuizQuestion();
      }
    });

    btnNextQuiz.addEventListener('click', () => {
      if (currentQuizIndex < questions.length - 1) {
        currentQuizIndex++;
        renderQuizQuestion();
      }
    });

    // Bookmark Toggle
    btnQuizBookmark.addEventListener('click', () => {
      if (questions.length === 0) return;
      const q = questions[currentQuizIndex];
      const isBookmarked = isItemBookmarked('question', q.id);

      if (!isBookmarked) {
        bookmarks.push({ item_type: 'question', item_id: q.id });
        btnQuizBookmark.classList.add('active');
      } else {
        bookmarks = bookmarks.filter(b => !(b.item_type === 'question' && b.item_id === q.id));
        btnQuizBookmark.classList.remove('active');
      }

      saveJson(STORAGE_KEYS.bookmarks, bookmarks);
      updateDashboardStats();
    });
  }

  function isItemBookmarked(type, id) {
    return bookmarks.some(b => b.item_type === type && b.item_id === id);
  }

  function renderQuizQuestion() {
    quizExplanationContainer.style.display = 'none'; // hide previous explanation

    if (questions.length === 0) {
      quizDomainTag.textContent = 'NONE';
      quizQuestionEl.textContent = 'No practice questions found. Insert custom questions via Curator panel.';
      quizOptionsList.innerHTML = '';
      quizCounterEl.textContent = '0 / 0';
      btnPrevQuiz.disabled = true;
      btnNextQuiz.disabled = true;
      btnQuizBookmark.classList.remove('active');
      return;
    }

    const q = questions[currentQuizIndex];
    quizDomainTag.textContent = `Domain ${q.domain}: ${getDomainTitle(q.domain)}`;
    quizQuestionEl.textContent = q.question;
    quizCounterEl.textContent = `${currentQuizIndex + 1} / ${questions.length}`;

    // Bookmark active checking
    if (isItemBookmarked('question', q.id)) {
      btnQuizBookmark.classList.add('active');
    } else {
      btnQuizBookmark.classList.remove('active');
    }

    // Render Options
    quizOptionsList.innerHTML = '';
    const options = [
      { key: 'A', text: q.option_a },
      { key: 'B', text: q.option_b },
      { key: 'C', text: q.option_c },
      { key: 'D', text: q.option_d }
    ];

    const hasAnswered = quizAnsweredStates.hasOwnProperty(q.id);
    const savedSelected = quizAnsweredStates[q.id];

    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      btn.dataset.key = opt.key;

      const letterSpan = document.createElement('span');
      letterSpan.className = 'option-letter';
      letterSpan.textContent = opt.key;

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
        // Active click listener
        btn.addEventListener('click', () => handleQuizSelection(q, opt.key));
      }

      quizOptionsList.appendChild(btn);
    });

    // Reveal explanation if already answered
    if (hasAnswered) {
      revealQuizExplanation(q, savedSelected === q.correct_option);
    }

    btnPrevQuiz.disabled = currentQuizIndex === 0;
    btnNextQuiz.disabled = currentQuizIndex === questions.length - 1;
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
    perfData.domains[dom].answered++;
    if (isCorrect) perfData.domains[dom].correct++;

    savePerformance();

    // Re-render choices to lock them and highlight answers
    renderQuizQuestion();
  }

  function revealQuizExplanation(q, isCorrect) {
    explanationStatusEl.textContent = isCorrect ? 'CORRECT // MASTERED' : 'INCORRECT // RATIONALE';
    quizExplanationContainer.className = `quiz-explanation-box ${isCorrect ? 'correct' : 'incorrect'}`;
    explanationTextEl.textContent = q.explanation;
    quizExplanationContainer.style.display = 'block';
  }

  function getDomainTitle(num) {
    const titles = {
      1: 'Information Security Governance',
      2: 'Information Risk Management',
      3: 'Information Security Program Development & Management',
      4: 'Information Security Incident Management'
    };
    return titles[num] || 'Unknown Domain';
  }

  // ==========================================
  // TIMED MOCK EXAM CONSOLE
  // ==========================================
  
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

    // 1. Randomize and extract 10 questions (or all if less than 10)
    mockQuestions = [...questions].sort(() => 0.5 - Math.random()).slice(0, 10);
    mockAnswers = {};
    mockCurrentIndex = 0;
    mockTimeRemaining = 900; // 15 mins
    mockSecondsElapsed = 0;

    // Start timer clock
    clearInterval(mockTimerInterval);
    mockTimerInterval = setInterval(() => {
      mockTimeRemaining--;
      mockSecondsElapsed++;
      
      const mins = Math.floor(mockTimeRemaining / 60);
      const secs = mockTimeRemaining % 60;
      mockTimerEl.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

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

    // Options rendering
    mockOptionsList.innerHTML = '';
    const options = [
      { key: 'A', text: q.option_a },
      { key: 'B', text: q.option_b },
      { key: 'C', text: q.option_c },
      { key: 'D', text: q.option_d }
    ];

    const currentSelected = mockAnswers[mockCurrentIndex];

    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      if (currentSelected === opt.key) {
        btn.classList.add('correct'); // Highlight selection
      }

      const letterSpan = document.createElement('span');
      letterSpan.className = 'option-letter';
      letterSpan.textContent = opt.key;

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

    // Calculate score
    let correctCount = 0;
    mockQuestions.forEach((q, idx) => {
      if (mockAnswers[idx] === q.correct_option) {
        correctCount++;
      }
    });

    const totalCount = mockQuestions.length;
    const scorePct = totalCount > 0 ? (correctCount / totalCount) * 100 : 0;
    const passed = scorePct >= 70; // 70% threshold

    const savedAttempt = {
      id: nextLocalId(attempts),
      score: scorePct,
      correct_count: correctCount,
      total_count: totalCount,
      duration_seconds: mockSecondsElapsed,
      created_at: new Date().toISOString()
    };
    attempts.unshift(savedAttempt);
    saveJson(STORAGE_KEYS.attempts, attempts);

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

    mockResults.style.display = 'block';
    updateDashboardStats();
  }

  btnMockReset.addEventListener('click', () => {
    mockResults.style.display = 'none';
    mockSetup.style.display = 'block';
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

    const savedCard = {
      id: nextLocalId(flashcards),
      term,
      definition,
      domain
    };

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

    const savedQ = {
      id: nextLocalId(questions),
      question,
      option_a,
      option_b,
      option_c,
      option_d,
      correct_option,
      explanation,
      domain
    };
    questions.push(savedQ);
    saveJson(STORAGE_KEYS.questions, questions);

    questionStatus.className = 'form-status success';
    questionStatus.textContent = '✅ Question saved locally.';

    formAddQuestion.reset();
    renderQuizQuestion();
    updateDashboardStats();
  });

  if (btnResetLocalData) {
    btnResetLocalData.addEventListener('click', () => {
      const proceed = confirm('This will erase all local CISM progress, bookmarks, attempts, quiz history, and custom deck entries for this browser. Continue?');
      if (!proceed) {
        return;
      }

      Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
      LEGACY_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));

      if (localResetStatus) {
        localResetStatus.className = 'form-status success';
        localResetStatus.textContent = 'Local CISM data reset complete. Reloading...';
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

  // Load database content on boot
  loadData();
});

