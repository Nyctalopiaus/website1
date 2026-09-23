// Timed Mock Exam engine: Quick practice & curated Full-Length exams

import {
  ICON_SPARKLE,
  ICON_CHAT,
  ICON_STAR,
  STORAGE_KEYS,
  FALLBACK_EXAM_CONFIG,
  escapeHtml
} from './config.js';

import { saveJson, nextLocalId } from './storage.js';

import {
  getActiveExamConfig,
  getExamName,
  getDomainTitle,
  questions,
  pbqs,
  bookmarks,
  setBookmarks,
  attempts,
  selectedMockMode,
  selectedFullMockIndex,
  setSelectedFullMockIndex,
  mockQuestions,
  setMockQuestions,
  mockAnswers,
  setMockAnswers,
  mockPbqs,
  setMockPbqs,
  mockPbqAnswers,
  setMockPbqAnswers,
  mockPbqGradedResults,
  setMockPbqGradedResults,
  mockCurrentIndex,
  setMockCurrentIndex,
  mockTimeRemaining,
  setMockTimeRemaining,
  mockTimerInterval,
  setMockTimerInterval,
  mockSecondsElapsed,
  setMockSecondsElapsed,
  activeMockCfg,
  setActiveMockCfg,
  setLastMockDiagnostics,
  currentPbqUserAnswers,
  setCurrentPbqUserAnswers,
  currentPbqTokenPlacement,
  setCurrentPbqTokenPlacement
} from './state.js';

import { updateDashboardStats } from './dashboard.js';
import { getDisplayOptions, recordQuestionHistory, isItemBookmarked, filterQuizQuestions, scrollQuizToTop } from './quiz.js';
import { gradePbq, applyPbqScoreBadge, renderPbqLayout } from './pbqLab.js';
import { switchToTab } from './search.js';

const mockSetup = document.getElementById('mock-setup');
const mockActive = document.getElementById('mock-active');
const mockResults = document.getElementById('mock-results');
const btnStartMock = document.getElementById('btn-start-mock');
const mockModeButtons = document.querySelectorAll('.mock-mode-btn');
const mockFullMockSelectWrap = document.getElementById('mock-fullmock-select');
const mockFullMockPicker = document.getElementById('mock-fullmock-picker');
const mockSpecQuestionsEl = document.getElementById('mock-spec-questions');
const mockSpecTimeEl = document.getElementById('mock-spec-time');
const mockSpecPassingEl = document.getElementById('mock-spec-passing');
const mockProgressEl = document.getElementById('mock-progress');
const mockTimerEl = document.getElementById('mock-timer');
const mockQuestionEl = document.getElementById('mock-question');
const mockOptionsList = document.querySelector('#mock-active .quiz-options');
const mockBodyEl = document.getElementById('mock-body');
const mockFlagGroupEl = document.getElementById('mock-flag-group');
const mockPbqBodyEl = document.getElementById('mock-pbq-body');
const mockPbqTitleEl = document.getElementById('mock-pbq-title');
const mockPbqDomainTagEl = document.getElementById('mock-pbq-domain-tag');
const mockPbqScenarioContextEl = document.getElementById('mock-pbq-scenario-context');
const mockPbqFieldsContainerEl = document.getElementById('mock-pbq-fields-container');
const btnMockPrev = document.getElementById('btn-mock-prev');
const btnMockNext = document.getElementById('btn-mock-next');
const btnMockFlag = document.getElementById('btn-mock-flag');
const btnMockFlagPrev = document.getElementById('btn-mock-flag-prev');
const btnMockFlagNext = document.getElementById('btn-mock-flag-next');
const resultsDomainBreakdownEl = document.getElementById('results-domain-breakdown');
const mockPbqReviewEl = document.getElementById('mock-pbq-review');
const mockPbqReviewListEl = document.getElementById('mock-pbq-review-list');
const mockMcqReviewEl = document.getElementById('mock-mcq-review');
const mockMcqReviewListEl = document.getElementById('mock-mcq-review-list');
const btnReviewMistakesQuiz = document.getElementById('btn-review-mistakes-quiz');
const resultsPctEl = document.getElementById('results-pct');
const resultsStatusEl = document.getElementById('results-status');
const resultsCorrectEl = document.getElementById('results-correct');
const resultsDurationEl = document.getElementById('results-duration');
const resultsVerdictEl = document.getElementById('results-verdict');
const btnMockReset = document.getElementById('btn-mock-reset');
const resultsPerfectNoteEl = document.getElementById('results-perfect-note');
const btnTrainingPlan = document.getElementById('btn-training-plan');

export function getMockConfig(mode) {
  const cfg = getActiveExamConfig();
  if (mode === 'full') {
    if (Array.isArray(cfg.full_mock_exams) && cfg.full_mock_exams.length > 0) {
      return cfg.full_mock_exams[selectedFullMockIndex] || cfg.full_mock_exams[0];
    }
    return cfg.mock_exam_full || cfg.mock_exam || FALLBACK_EXAM_CONFIG.mock_exam;
  }
  return cfg.mock_exam || FALLBACK_EXAM_CONFIG.mock_exam;
}

export function getMockConfigItemCount(cfg) {
  if (Number.isFinite(cfg.question_count)) return cfg.question_count;
  const q = Array.isArray(cfg.question_source_ids) ? cfg.question_source_ids.length : 0;
  const p = Array.isArray(cfg.pbq_ids) ? cfg.pbq_ids.length : 0;
  return q + p;
}

export function updateFullMockSelectorVisibility() {
  if (!mockFullMockSelectWrap) return;
  const cfg = getActiveExamConfig();
  const hasNamed = Array.isArray(cfg.full_mock_exams) && cfg.full_mock_exams.length > 0;
  mockFullMockSelectWrap.style.display = (selectedMockMode === 'full' && hasNamed) ? 'flex' : 'none';
}

export function populateFullMockPicker() {
  if (!mockFullMockPicker) return;
  const cfg = getActiveExamConfig();
  const list = Array.isArray(cfg.full_mock_exams) ? cfg.full_mock_exams : [];
  mockFullMockPicker.innerHTML = '';
  list.forEach((m, idx) => {
    const opt = document.createElement('option');
    opt.value = String(idx);
    opt.textContent = m.name || `Full Mock ${idx + 1}`;
    mockFullMockPicker.appendChild(opt);
  });
  setSelectedFullMockIndex(0);
  if (list.length > 0) mockFullMockPicker.value = '0';
}

export function updateMockSpecsDisplay() {
  const cfg = getMockConfig(selectedMockMode);
  const totalItems = getMockConfigItemCount(cfg);
  if (mockSpecQuestionsEl) {
    mockSpecQuestionsEl.textContent = Array.isArray(cfg.pbq_ids) && cfg.pbq_ids.length > 0
      ? `${(cfg.question_source_ids || []).length} MCQ + ${cfg.pbq_ids.length} PBQ`
      : `${totalItems} Questions`;
  }
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

export function formatMockTime(totalSeconds) {
  const s = Math.max(0, totalSeconds);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  return hrs > 0
    ? `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function totalMockItemCount() {
  return mockQuestions.length + mockPbqs.length;
}

export function isMockIndexPbq(idx) {
  return mockPbqs.length > 0 && idx >= mockQuestions.length;
}

export function currentMockPbq() {
  if (mockPbqs.length === 0) return null;
  const pbqIdx = mockCurrentIndex - mockQuestions.length;
  return pbqIdx >= 0 ? mockPbqs[pbqIdx] : null;
}

export function captureCurrentMockPbqDraft() {
  if (!isMockIndexPbq(mockCurrentIndex)) return;
  const pbq = currentMockPbq();
  if (!pbq) return;
  mockPbqAnswers[pbq.pbq_id] = {
    userAnswers: { ...currentPbqUserAnswers },
    tokenPlacement: { ...currentPbqTokenPlacement }
  };
}

export function renderMockPbqItem() {
  const pbq = currentMockPbq();
  if (!pbq) return;

  const draft = mockPbqAnswers[pbq.pbq_id];
  setCurrentPbqUserAnswers(draft ? { ...draft.userAnswers } : {});
  setCurrentPbqTokenPlacement(draft ? { ...draft.tokenPlacement } : {});

  if (mockPbqTitleEl) mockPbqTitleEl.textContent = pbq.title;
  if (mockPbqDomainTagEl) {
    mockPbqDomainTagEl.textContent = `Domain ${pbq.domain}: ${getDomainTitle(pbq.domain)} — Section ${pbq.section_number}: ${pbq.section_title}`;
  }
  if (mockPbqScenarioContextEl) mockPbqScenarioContextEl.textContent = pbq.scenario_context;

  if (mockPbqFieldsContainerEl) {
    renderPbqLayout(pbq, false, null, null, mockPbqFieldsContainerEl);
  }
}

export function renderMockQuestion() {
  const q = mockQuestions[mockCurrentIndex];
  if (!q) return;
  if (mockProgressEl) mockProgressEl.textContent = `Question ${mockCurrentIndex + 1} of ${mockQuestions.length}`;
  if (mockQuestionEl) mockQuestionEl.textContent = q.question;

  const isBookmarked = isItemBookmarked('question', q.id);
  if (btnMockFlag) {
    btnMockFlag.innerHTML = isBookmarked ? (ICON_STAR + ' Flagged') : 'Flag Question';
    btnMockFlag.className = `btn-hud ${isBookmarked ? 'btn-warn active' : 'btn-warn'}`;
  }

  if (mockOptionsList) {
    mockOptionsList.innerHTML = '';
    const options = getDisplayOptions(q);
    const currentSelected = mockAnswers[mockCurrentIndex];

    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'option-btn';
      if (currentSelected === opt.key) {
        btn.classList.add('correct');
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
        renderMockQuestion();
      });

      mockOptionsList.appendChild(btn);
    });
  }

  if (btnMockPrev) btnMockPrev.disabled = mockCurrentIndex === 0;
  updateMockFlagNav();

  if (btnMockNext) {
    if (mockCurrentIndex === mockQuestions.length - 1) {
      btnMockNext.textContent = 'FINISH EXAM';
      btnMockNext.className = 'btn-hud btn-success';
      btnMockNext.style.borderColor = 'var(--accent-green)';
    } else {
      btnMockNext.textContent = 'Next ▶';
      btnMockNext.className = 'btn-hud';
      btnMockNext.style.borderColor = '';
    }
  }
}

export function renderMockCurrentItem() {
  const onPbq = isMockIndexPbq(mockCurrentIndex);

  if (mockBodyEl) mockBodyEl.hidden = onPbq;
  if (mockPbqBodyEl) mockPbqBodyEl.hidden = !onPbq;
  if (mockFlagGroupEl) mockFlagGroupEl.hidden = onPbq;

  if (onPbq) {
    renderMockPbqItem();
  } else {
    renderMockQuestion();
  }

  if (mockPbqs.length > 0) {
    const total = totalMockItemCount();
    if (mockProgressEl) mockProgressEl.textContent = `Item ${mockCurrentIndex + 1} of ${total}`;
    if (btnMockPrev) btnMockPrev.disabled = mockCurrentIndex === 0;
    if (btnMockNext) {
      if (mockCurrentIndex === total - 1) {
        btnMockNext.textContent = 'FINISH EXAM';
        btnMockNext.className = 'btn-hud btn-success';
        btnMockNext.style.borderColor = 'var(--accent-green)';
      } else {
        btnMockNext.textContent = 'Next ▶';
        btnMockNext.className = 'btn-hud';
        btnMockNext.style.borderColor = '';
      }
    }
    if (onPbq) {
      if (btnMockFlagPrev) btnMockFlagPrev.disabled = true;
      if (btnMockFlagNext) btnMockFlagNext.disabled = true;
    } else {
      updateMockFlagNav();
    }
  }
}

export function getFlaggedMockIndexes() {
  return mockQuestions
    .map((q, idx) => ({ idx, flagged: isItemBookmarked('question', q.id) }))
    .filter(x => x.flagged)
    .map(x => x.idx);
}

export function updateMockFlagNav() {
  if (!btnMockFlagPrev || !btnMockFlagNext) return;
  const flaggedIdxs = getFlaggedMockIndexes();
  btnMockFlagPrev.disabled = !flaggedIdxs.some(i => i < mockCurrentIndex);
  btnMockFlagNext.disabled = !flaggedIdxs.some(i => i > mockCurrentIndex);
}

export function startMockExam() {
  if (mockSetup) mockSetup.style.display = 'none';
  if (mockResults) mockResults.style.display = 'none';
  if (mockActive) mockActive.style.display = 'block';

  const mockCfg = getMockConfig(selectedMockMode);
  setActiveMockCfg(mockCfg);

  if (Array.isArray(mockCfg.question_source_ids) && mockCfg.question_source_ids.length > 0) {
    setMockQuestions(
      mockCfg.question_source_ids
        .map(sid => questions.find(q => q.source_id === sid))
        .filter(Boolean)
    );
    setMockPbqs(
      (mockCfg.pbq_ids || [])
        .map(pid => pbqs.find(p => p.pbq_id === pid))
        .filter(Boolean)
    );
  } else {
    setMockQuestions([...questions].sort(() => 0.5 - Math.random()).slice(0, mockCfg.question_count));
    setMockPbqs([]);
  }

  setMockAnswers({});
  setMockPbqAnswers({});
  setMockPbqGradedResults({});
  setMockCurrentIndex(0);
  setMockTimeRemaining(mockCfg.time_limit_seconds);
  setMockSecondsElapsed(0);
  if (mockTimerEl) mockTimerEl.textContent = formatMockTime(mockTimeRemaining);

  if (mockTimerInterval) clearInterval(mockTimerInterval);
  setMockTimerInterval(setInterval(() => {
    setMockTimeRemaining(mockTimeRemaining - 1);
    setMockSecondsElapsed(mockSecondsElapsed + 1);
    if (mockTimerEl) mockTimerEl.textContent = formatMockTime(mockTimeRemaining);

    if (mockTimeRemaining <= 0) {
      clearInterval(mockTimerInterval);
      submitMockExam();
    }
  }, 1000));

  renderMockCurrentItem();
}

export function submitMockExam() {
  if (mockActive) mockActive.style.display = 'none';
  captureCurrentMockPbqDraft();

  let correctCount = 0;
  const domainBreakdown = {};
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

  let pbqPointsSum = 0;
  setMockPbqGradedResults({});
  mockPbqs.forEach(pbq => {
    const draft = mockPbqAnswers[pbq.pbq_id] || { userAnswers: {}, tokenPlacement: {} };
    const graded = gradePbq(pbq, draft.userAnswers, draft.tokenPlacement);
    mockPbqGradedResults[pbq.pbq_id] = graded;
    pbqPointsSum += graded.scorePct / 100;

    if (!domainBreakdown[pbq.domain]) {
      domainBreakdown[pbq.domain] = { correct: 0, answered: 0 };
    }
    domainBreakdown[pbq.domain].answered += 1;
    domainBreakdown[pbq.domain].correct += graded.scorePct / 100;
  });

  const totalCount = mockQuestions.length + mockPbqs.length;
  const combinedPoints = correctCount + pbqPointsSum;
  const scorePct = totalCount > 0 ? (combinedPoints / totalCount) * 100 : 0;

  const diag = {
    mode: selectedMockMode,
    scorePct,
    correctCount,
    totalCount,
    missedByKs: Object.values(missedByKs).sort((a, b) => b.count - a.count)
  };

  const passingThreshold = Number.isFinite(activeMockCfg?.passing_threshold)
    ? activeMockCfg.passing_threshold
    : (getActiveExamConfig().mock_exam || FALLBACK_EXAM_CONFIG.mock_exam).passing_threshold;
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
  diag.attemptRecord = savedAttempt;
  setLastMockDiagnostics(diag);

  if (resultsPctEl) resultsPctEl.textContent = `${Math.round(scorePct)}%`;
  if (resultsStatusEl) {
    resultsStatusEl.textContent = passed ? 'PASSED' : 'FAILED';
    resultsStatusEl.className = `results-label ${passed ? 'pass' : 'fail'}`;
  }

  if (resultsCorrectEl) {
    resultsCorrectEl.textContent = mockPbqs.length > 0
      ? `${combinedPoints.toFixed(1)} / ${totalCount}`
      : `${correctCount} / ${totalCount}`;
  }
  if (resultsDurationEl) {
    resultsDurationEl.textContent = `${Math.floor(mockSecondsElapsed / 60)}m ${mockSecondsElapsed % 60}s`;
  }

  if (resultsVerdictEl) {
    if (passed) {
      resultsVerdictEl.textContent = 'ISACA Governance standard achieved. Operational security readiness verified!';
      if (resultsPctEl) resultsPctEl.style.color = 'var(--accent-green)';
    } else {
      resultsVerdictEl.textContent = 'Passing ratio not achieved. Audit and review recommended before retesting.';
      if (resultsPctEl) resultsPctEl.style.color = 'var(--accent-red)';
    }
  }

  renderResultsDomainBreakdown(domainBreakdown);
  renderMockPbqReview();
  renderMockMcqReview(mockQuestions, mockAnswers);

  const hasMisses = combinedPoints < totalCount;
  if (btnTrainingPlan) {
    btnTrainingPlan.hidden = !hasMisses;
    btnTrainingPlan.disabled = false;
    btnTrainingPlan.innerHTML = ICON_SPARKLE + ' Build My Training Plan';
  }
  if (resultsPerfectNoteEl) resultsPerfectNoteEl.hidden = hasMisses;

  if (mockResults) mockResults.style.display = 'block';
  updateDashboardStats();
}

export function renderResultsDomainBreakdown(domainBreakdown) {
  if (!resultsDomainBreakdownEl) return;
  resultsDomainBreakdownEl.innerHTML = '';

  const domainList = getActiveExamConfig().domains || [];
  domainList.forEach(d => {
    const stats = domainBreakdown[d.id];
    if (!stats || stats.answered === 0) return;

    const pct = Math.round((stats.correct / stats.answered) * 100);
    const tier = pct >= 80 ? 'high' : pct >= 60 ? 'mid' : 'low';
    const correctDisplay = Number.isInteger(stats.correct) ? stats.correct : stats.correct.toFixed(1);

    const item = document.createElement('div');
    item.className = 'results-domain-breakdown-item';
    item.innerHTML = `
      <span class="results-domain-breakdown-title">Domain ${d.id}: ${escapeHtml(d.title || '')}</span>
      <span class="results-domain-breakdown-score font-mono ${tier}">${pct}% (${correctDisplay}/${stats.answered})</span>`;
    resultsDomainBreakdownEl.appendChild(item);
  });
}

export function renderMockMcqReview(questions, answers) {
  if (!mockMcqReviewEl || !mockMcqReviewListEl) return;

  const missedList = [];
  questions.forEach((q, idx) => {
    const wasAnswered = answers[idx] !== undefined;
    const isCorrect = wasAnswered && answers[idx] === q.correct_option;
    if (!isCorrect) {
      missedList.push({
        q,
        indexInMock: idx + 1,
        picked: wasAnswered ? answers[idx] : null
      });
    }
  });

  if (btnReviewMistakesQuiz) {
    btnReviewMistakesQuiz.hidden = missedList.length === 0;
  }

  if (missedList.length === 0) {
    mockMcqReviewEl.hidden = true;
    mockMcqReviewListEl.innerHTML = '';
    return;
  }

  mockMcqReviewEl.hidden = false;
  mockMcqReviewListEl.innerHTML = '';

  missedList.forEach(item => {
    const { q, indexInMock, picked } = item;
    const card = document.createElement('div');
    card.className = 'mock-mcq-item';

    const head = document.createElement('div');
    head.className = 'mock-mcq-head';

    const qNum = document.createElement('span');
    qNum.className = 'mock-mcq-qnum';
    qNum.textContent = `Question ${indexInMock}`;

    const domBadge = document.createElement('span');
    domBadge.className = 'mock-mcq-domain';
    domBadge.textContent = `Domain ${q.domain}: ${getDomainTitle(q.domain)}`;

    head.appendChild(qNum);
    head.appendChild(domBadge);
    card.appendChild(head);

    const qText = document.createElement('p');
    qText.className = 'mock-mcq-question-text';
    qText.textContent = q.question;
    card.appendChild(qText);

    const optsList = document.createElement('div');
    optsList.className = 'quiz-options';

    const displayOptions = getDisplayOptions(q);
    displayOptions.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'option-btn disabled';
      if (opt.key === q.correct_option) {
        btn.classList.add('correct');
      } else if (opt.key === picked) {
        btn.classList.add('incorrect');
      }

      const letterSpan = document.createElement('span');
      letterSpan.className = 'option-letter';
      letterSpan.textContent = opt.displayLetter;

      const textSpan = document.createElement('span');
      textSpan.textContent = opt.text;

      btn.appendChild(letterSpan);
      btn.appendChild(textSpan);
      optsList.appendChild(btn);
    });
    card.appendChild(optsList);

    const ratBox = document.createElement('div');
    ratBox.className = 'quiz-explanation-box incorrect';
    ratBox.style.display = 'block';

    const ratStatus = document.createElement('h4');
    ratStatus.textContent = picked ? 'INCORRECT // RATIONALE' : 'UNANSWERED // RATIONALE';
    ratBox.appendChild(ratStatus);

    const hasPerChoiceRationale = ['a', 'b', 'c', 'd'].every(k => !!q[`rationale_${k}`]);
    if (hasPerChoiceRationale) {
      const breakdown = document.createElement('div');
      breakdown.className = 'rationale-breakdown';

      displayOptions.forEach(opt => {
        const row = document.createElement('div');
        const isRowCorrect = opt.key === q.correct_option;
        const isRowSelected = opt.key === picked;
        row.className = 'rationale-row' + (isRowCorrect ? ' correct' : (isRowSelected ? ' incorrect' : ''));

        const rowHead = document.createElement('div');
        rowHead.className = 'rationale-row-head';
        rowHead.innerHTML = `<span class="rationale-letter">${opt.displayLetter}</span><span class="rationale-opt-text">${escapeHtml(opt.text || '')}</span>`;

        const rowBody = document.createElement('p');
        rowBody.className = 'rationale-row-body';
        rowBody.textContent = opt.rationale || '';

        row.appendChild(rowHead);
        row.appendChild(rowBody);
        breakdown.appendChild(row);
      });
      ratBox.appendChild(breakdown);
    } else {
      const expText = document.createElement('p');
      expText.textContent = q.explanation || 'No rationale available.';
      ratBox.appendChild(expText);
    }

    card.appendChild(ratBox);
    mockMcqReviewListEl.appendChild(card);
  });
}

export function renderMockPbqReview() {
  if (!mockPbqReviewEl || !mockPbqReviewListEl) return;
  if (mockPbqs.length === 0) {
    mockPbqReviewEl.hidden = true;
    mockPbqReviewListEl.innerHTML = '';
    return;
  }

  mockPbqReviewEl.hidden = false;
  mockPbqReviewListEl.innerHTML = '';

  mockPbqs.forEach(pbq => {
    const graded = mockPbqGradedResults[pbq.pbq_id] || { results: {}, correctCount: 0, totalCount: 0, scorePct: 0 };
    const draft = mockPbqAnswers[pbq.pbq_id] || { userAnswers: {}, tokenPlacement: {} };

    const item = document.createElement('div');
    item.className = 'pbq-content';
    item.style.marginTop = '20px';
    item.style.paddingTop = '20px';
    item.style.borderTop = '1px solid var(--border-color, rgba(255,255,255,0.1))';

    const head = document.createElement('div');
    head.className = 'pbq-scenario-head';
    const titleEl = document.createElement('h4');
    titleEl.className = 'pbq-title';
    titleEl.textContent = pbq.title;
    const domTag = document.createElement('span');
    domTag.className = 'pbq-domain-tag';
    domTag.textContent = `Domain ${pbq.domain}: ${getDomainTitle(pbq.domain)}`;
    const scoreBadge = document.createElement('span');
    scoreBadge.className = 'pbq-score-badge';
    head.appendChild(titleEl);
    head.appendChild(domTag);
    head.appendChild(scoreBadge);
    item.appendChild(head);
    applyPbqScoreBadge(scoreBadge, graded.scorePct);

    const ctx = document.createElement('p');
    ctx.className = 'pbq-scenario-context';
    ctx.textContent = pbq.scenario_context;
    item.appendChild(ctx);

    const fieldsContainer = document.createElement('div');
    fieldsContainer.className = 'pbq-fields-container';
    item.appendChild(fieldsContainer);

    const answersForRender = { ...draft.userAnswers, __tokenPlacement: draft.tokenPlacement };
    renderPbqLayout(pbq, true, answersForRender, graded.results, fieldsContainer);

    const rationaleBox = document.createElement('div');
    rationaleBox.className = `quiz-explanation-box ${graded.scorePct >= 80 ? 'correct' : 'incorrect'}`;
    const rHeader = document.createElement('h4');
    rHeader.textContent = `SCORE: ${graded.correctCount} / ${graded.totalCount} FIELDS CORRECT`;
    const rText = document.createElement('p');
    rText.textContent = pbq.rationale;
    rationaleBox.appendChild(rHeader);
    rationaleBox.appendChild(rText);
    item.appendChild(rationaleBox);

    mockPbqReviewListEl.appendChild(item);
  });
}

export function initMockExam() {
  if (!btnStartMock) return;

  mockModeButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      setSelectedMockMode(btn.dataset.mode);
      mockModeButtons.forEach(b => b.classList.toggle('active', b === btn));
      updateFullMockSelectorVisibility();
      updateMockSpecsDisplay();
    });
  });

  if (mockFullMockPicker) {
    mockFullMockPicker.addEventListener('change', () => {
      setSelectedFullMockIndex(Number(mockFullMockPicker.value) || 0);
      updateMockSpecsDisplay();
    });
  }

  btnStartMock.addEventListener('click', () => {
    if (questions.length === 0) {
      alert('Cannot start exam: Question bank is empty!');
      return;
    }
    startMockExam();
  });

  btnMockNext?.addEventListener('click', () => {
    const total = totalMockItemCount();
    if (mockCurrentIndex < total - 1) {
      captureCurrentMockPbqDraft();
      setMockCurrentIndex(mockCurrentIndex + 1);
      renderMockCurrentItem();
    } else {
      if (confirm('Are you sure you want to submit your exam answers?')) {
        if (mockTimerInterval) clearInterval(mockTimerInterval);
        submitMockExam();
      }
    }
  });

  btnMockPrev?.addEventListener('click', () => {
    if (mockCurrentIndex > 0) {
      captureCurrentMockPbqDraft();
      setMockCurrentIndex(mockCurrentIndex - 1);
      renderMockCurrentItem();
    }
  });

  if (btnMockFlagPrev) {
    btnMockFlagPrev.addEventListener('click', () => {
      const priorFlagged = getFlaggedMockIndexes().filter(i => i < mockCurrentIndex);
      if (priorFlagged.length === 0) return;
      captureCurrentMockPbqDraft();
      setMockCurrentIndex(priorFlagged[priorFlagged.length - 1]);
      renderMockCurrentItem();
    });
  }

  if (btnMockFlagNext) {
    btnMockFlagNext.addEventListener('click', () => {
      const upcomingFlagged = getFlaggedMockIndexes().filter(i => i > mockCurrentIndex);
      if (upcomingFlagged.length === 0) return;
      captureCurrentMockPbqDraft();
      setMockCurrentIndex(upcomingFlagged[0]);
      renderMockCurrentItem();
    });
  }

  btnMockFlag?.addEventListener('click', () => {
    if (isMockIndexPbq(mockCurrentIndex)) return;
    const q = mockQuestions[mockCurrentIndex];
    const isBookmarked = isItemBookmarked('question', q.id);

    if (!isBookmarked) {
      bookmarks.push({ item_type: 'question', item_id: q.id });
    } else {
      setBookmarks(bookmarks.filter(b => !(b.item_type === 'question' && b.item_id === q.id)));
    }

    saveJson(STORAGE_KEYS.bookmarks, bookmarks);
    renderMockQuestion();
    updateDashboardStats();
  });

  btnMockReset?.addEventListener('click', () => {
    if (mockResults) mockResults.style.display = 'none';
    if (mockSetup) mockSetup.style.display = 'block';
  });

  if (btnReviewMistakesQuiz) {
    btnReviewMistakesQuiz.addEventListener('click', () => {
      switchToTab('tab-quiz');
      const quizMistakesToggle = document.getElementById('quiz-mistakes-toggle');
      if (quizMistakesToggle) {
        quizMistakesToggle.checked = true;
        quizMistakesToggle.closest('.weak-spot-toggle')?.classList.add('checked');
      }
      const quizWeakSpotToggle = document.getElementById('quiz-weak-spot-toggle');
      if (quizWeakSpotToggle && quizWeakSpotToggle.checked) {
        quizWeakSpotToggle.checked = false;
        quizWeakSpotToggle.closest('.weak-spot-toggle')?.classList.remove('checked');
      }
      const quizDomainSelect = document.getElementById('quiz-domain-select');
      if (quizDomainSelect) quizDomainSelect.value = 'all';

      filterQuizQuestions();
      scrollQuizToTop();
    });
  }

  updateMockSpecsDisplay();
}
