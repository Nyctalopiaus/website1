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

  // State Variables
  let questions = [];
  let flashcards = [];
  let bookmarks = [];
  let attempts = [];

  let currentCardIndex = 0;
  let currentQuizIndex = 0;
  let filteredCards = [];

  // Quiz answered states for current session
  let quizAnsweredStates = {}; // question_id -> selected_option

  // Local Performance Stats
  const STORAGE_PERF_KEY = 'cism_performance_v1';
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
  
  // Header clock ticker
  setInterval(() => {
    const d = new Date();
    document.getElementById('system-time').textContent = d.toTimeString().split(' ')[0] + ' // ONLINE';
  }, 1000);

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

  // Load performance data from storage
  const savedPerf = localStorage.getItem(STORAGE_PERF_KEY);
  if (savedPerf) {
    try {
      perfData = JSON.parse(savedPerf);
    } catch (e) {
      console.error('[SYSTEM] Failed to load local stats:', e);
    }
  }

  // ==========================================
  // API FETCH & ENGINE ACTIONS
  // ==========================================
  
  async function loadData() {
    try {
      // 1. Fetch questions
      const qRes = await fetch('/api/cism/questions');
      if (qRes.ok) questions = await qRes.json();

      // 2. Fetch flashcards
      const fRes = await fetch('/api/cism/flashcards');
      if (fRes.ok) flashcards = await fRes.json();

      // 3. Fetch bookmarks
      const bRes = await fetch('/api/cism/bookmarks');
      if (bRes.ok) bookmarks = await bRes.json();

      // 4. Fetch attempts
      const aRes = await fetch('/api/cism/attempts');
      if (aRes.ok) attempts = await aRes.json();

      // Setup and render
      initFlashcards();
      initQuiz();
      updateDashboardStats();
    } catch (e) {
      console.error('[SYSTEM] Database fetch error:', e);
    }
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
    localStorage.setItem(STORAGE_PERF_KEY, JSON.stringify(perfData));
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
    btnQuizBookmark.addEventListener('click', async () => {
      if (questions.length === 0) return;
      const q = questions[currentQuizIndex];
      const isBookmarked = isItemBookmarked('question', q.id);

      try {
        const res = await fetch('/api/cism/bookmarks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            item_type: 'question',
            item_id: q.id,
            bookmarked: !isBookmarked
          })
        });

        if (res.ok) {
          const result = await res.json();
          if (result.bookmarked) {
            bookmarks.push({ item_type: 'question', item_id: q.id });
            btnQuizBookmark.classList.add('active');
          } else {
            bookmarks = bookmarks.filter(b => !(b.item_type === 'question' && b.item_id === q.id));
            btnQuizBookmark.classList.remove('active');
          }
          updateDashboardStats();
        }
      } catch (e) {
        console.error('[ERROR] Failed to toggle bookmark:', e);
      }
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
  btnMockFlag.addEventListener('click', async () => {
    const q = mockQuestions[mockCurrentIndex];
    const isBookmarked = isItemBookmarked('question', q.id);

    try {
      const res = await fetch('/api/cism/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item_type: 'question',
          item_id: q.id,
          bookmarked: !isBookmarked
        })
      });

      if (res.ok) {
        const result = await res.json();
        if (result.bookmarked) {
          bookmarks.push({ item_type: 'question', item_id: q.id });
        } else {
          bookmarks = bookmarks.filter(b => !(b.item_type === 'question' && b.item_id === q.id));
        }
        renderMockQuestion();
        updateDashboardStats();
      }
    } catch (e) {
      console.error('[ERROR] Failed to flag mock question:', e);
    }
  });

  async function submitMockExam() {
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

    // Save attempt to database via API
    try {
      const res = await fetch('/api/cism/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          score: scorePct,
          correct_count: correctCount,
          total_count: totalCount,
          duration_seconds: mockSecondsElapsed
        })
      });
      if (res.ok) {
        const savedAttempt = await res.json();
        attempts.unshift(savedAttempt); // add to top
      }
    } catch (e) {
      console.error('[ERROR] Failed to save exam score:', e);
    }

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
  formAddFlashcard.addEventListener('submit', async (e) => {
    e.preventDefault();
    flashcardStatus.textContent = '';

    const term = formAddFlashcard.querySelector('[name="term"]').value.trim();
    const definition = formAddFlashcard.querySelector('[name="definition"]').value.trim();
    const domain = parseInt(formAddFlashcard.querySelector('[name="domain"]').value);

    try {
      const res = await fetch('/api/cism/flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term, definition, domain })
      });

      if (res.ok) {
        const savedCard = await res.json();
        flashcards.push(savedCard);
        
        flashcardStatus.className = 'form-status success';
        flashcardStatus.textContent = '✅ Flashcard committed to database!';
        
        // Reset form
        formAddFlashcard.reset();
        filterFlashcards();
        updateDashboardStats();
      } else {
        throw new Error('Failed to save');
      }
    } catch (err) {
      flashcardStatus.className = 'form-status error';
      flashcardStatus.textContent = '❌ Failed to write card to server.';
    }
  });

  // Custom Question commit
  formAddQuestion.addEventListener('submit', async (e) => {
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

    try {
      const res = await fetch('/api/cism/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question, option_a, option_b, option_c, option_d,
          correct_option, explanation, domain
        })
      });

      if (res.ok) {
        const savedQ = await res.json();
        questions.push(savedQ);

        questionStatus.className = 'form-status success';
        questionStatus.textContent = '✅ Question committed to database!';

        // Reset form
        formAddQuestion.reset();
        initQuiz();
        updateDashboardStats();
      } else {
        throw new Error('Failed to save');
      }
    } catch (err) {
      questionStatus.className = 'form-status error';
      questionStatus.textContent = '❌ Failed to write question to server.';
    }
  });

  // Load database content on boot
  loadData();
});
