// Practice Quiz console, option shuffling, and personal mistake tracking

import {
  ICON_WARN,
  STORAGE_KEYS,
  escapeHtml
} from './config.js';

import { saveJson } from './storage.js';
import { saveUserStats } from './storage.js';

import {
  questions,
  bookmarks,
  setBookmarks,
  quizAnsweredStates,
  questionHistory,
  pendingQuizSelection,
  setPendingQuizSelection,
  currentQuizIndex,
  setCurrentQuizIndex,
  filteredQuestions,
  setFilteredQuestions,
  setCurrentAiExplainQuestion,
  getDomainTitle,
  perfData
} from './state.js';

import { updateDashboardStats } from './dashboard.js';

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
const btnRetestMistakes = document.getElementById('btn-retest-mistakes');

export const questionOptionOrder = new Map();

export function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function getOptionOrder(q) {
  if (!questionOptionOrder.has(q.id)) {
    questionOptionOrder.set(q.id, shuffleArray(['A', 'B', 'C', 'D']));
  }
  return questionOptionOrder.get(q.id);
}

export function getDisplayOptions(q) {
  const displayLetters = ['A', 'B', 'C', 'D'];
  return getOptionOrder(q).map((originalKey, idx) => ({
    key: originalKey,
    displayLetter: displayLetters[idx],
    text: q[`option_${originalKey.toLowerCase()}`],
    rationale: q[`rationale_${originalKey.toLowerCase()}`]
  }));
}

export function recordQuestionHistory(questionId, isCorrect, refreshGuideFlagsCb) {
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
  if (refreshGuideFlagsCb) refreshGuideFlagsCb();
}

export function isPersonalMistake(questionId) {
  const entry = questionHistory[questionId];
  return !!entry && entry.incorrect > 0 && entry.streak < 2;
}

export function isItemBookmarked(type, id) {
  return bookmarks.some(b => b.item_type === type && b.item_id === id);
}

export function scrollQuizToTop() {
  const target = document.querySelector('#tab-quiz .quiz-header') || quizQuestionEl;
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function filterQuizQuestions() {
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
  if (!(quizShowAllToggle && quizShowAllToggle.checked)) {
    pool = pool.filter(q => !quizAnsweredStates.hasOwnProperty(q.id));
  }
  setFilteredQuestions(domainVal === 'all' ? shuffleArray(pool) : pool);
  setCurrentQuizIndex(0);
  renderQuizQuestion();
}

export function renderQuizQuestion({ quizAiExplainHandle, resetAiExplainPanel } = {}) {
  if (!quizQuestionEl) return;
  if (quizExplanationContainer) quizExplanationContainer.style.display = 'none';
  if (resetAiExplainPanel) resetAiExplainPanel();

  setPendingQuizSelection(null);
  if (quizSubmitRowEl) quizSubmitRowEl.hidden = true;

  if (filteredQuestions.length === 0) {
    const weakOnly = quizWeakSpotToggle && quizWeakSpotToggle.checked;
    const mistakesOnly = quizMistakesToggle && quizMistakesToggle.checked;
    const showAll = quizShowAllToggle && quizShowAllToggle.checked;
    if (quizDomainTag) quizDomainTag.textContent = 'NONE';
    quizQuestionEl.textContent = mistakesOnly
      ? "No open mistakes right now -- you've answered every previously-missed question correctly twice in a row since. Turn off My Mistakes to see the full bank."
      : weakOnly
      ? 'No weak-spot questions found. Turn off Weak Spots Only to see the full bank.'
      : !showAll && questions.length > 0
      ? "You've answered every question in this pool! Turn on Show All Questions to review them."
      : 'No practice questions found. Insert custom questions via Curator panel.';
    if (quizOptionsList) quizOptionsList.innerHTML = '';
    if (quizCounterEl) quizCounterEl.textContent = '0 / 0';
    if (btnPrevQuiz) btnPrevQuiz.disabled = true;
    if (btnNextQuiz) btnNextQuiz.disabled = true;
    if (btnQuizBookmark) btnQuizBookmark.classList.remove('active');
    return;
  }

  const q = filteredQuestions[currentQuizIndex];
  if (quizDomainTag) {
    quizDomainTag.innerHTML = q.weak_spot
      ? `Domain ${q.domain}: ${getDomainTitle(q.domain)} · ${ICON_WARN} Weak Spot`
      : `Domain ${q.domain}: ${getDomainTitle(q.domain)}`;
  }
  quizQuestionEl.textContent = q.question;
  if (quizCounterEl) quizCounterEl.textContent = `${currentQuizIndex + 1} / ${filteredQuestions.length}`;

  if (btnQuizBookmark) {
    if (isItemBookmarked('question', q.id)) {
      btnQuizBookmark.classList.add('active');
    } else {
      btnQuizBookmark.classList.remove('active');
    }
  }

  if (quizOptionsList) {
    quizOptionsList.innerHTML = '';
    const options = getDisplayOptions(q);
    const hasAnswered = quizAnsweredStates.hasOwnProperty(q.id);
    const savedSelected = quizAnsweredStates[q.id];

    const eliminatedSet = window.__eliminatedOptionsMap?.get(q.id) || new Set();

    options.forEach(opt => {
      const btn = document.createElement('button');
      btn.className = 'option-btn quiz-option';
      if (eliminatedSet.has(opt.key)) {
        btn.classList.add('option-eliminated');
      }
      btn.dataset.key = opt.key;

      const letterSpan = document.createElement('span');
      letterSpan.className = 'option-letter';
      letterSpan.textContent = opt.displayLetter;

      const textSpan = document.createElement('span');
      textSpan.className = 'option-text';
      textSpan.textContent = opt.text;

      const elimBtn = document.createElement('button');
      elimBtn.type = 'button';
      elimBtn.className = 'btn-option-eliminate';
      elimBtn.title = 'Strike-through / Eliminate option';
      elimBtn.textContent = '✕';
      if (eliminatedSet.has(opt.key)) elimBtn.classList.add('active');

      elimBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!window.__eliminatedOptionsMap) window.__eliminatedOptionsMap = new Map();
        let set = window.__eliminatedOptionsMap.get(q.id);
        if (!set) {
          set = new Set();
          window.__eliminatedOptionsMap.set(q.id, set);
        }
        if (set.has(opt.key)) {
          set.delete(opt.key);
          btn.classList.remove('option-eliminated');
          elimBtn.classList.remove('active');
        } else {
          set.add(opt.key);
          btn.classList.add('option-eliminated');
          elimBtn.classList.add('active');
        }
      });

      btn.appendChild(letterSpan);
      btn.appendChild(textSpan);
      btn.appendChild(elimBtn);

      if (hasAnswered) {
        btn.classList.add('disabled');
        if (opt.key === q.correct_option) {
          btn.classList.add('correct');
        } else if (opt.key === savedSelected) {
          btn.classList.add('incorrect');
        }
      } else {
        btn.addEventListener('click', () => {
          setPendingQuizSelection({ question: q, selectedOption: opt.key });
          Array.from(quizOptionsList.children).forEach(otherBtn => otherBtn.classList.remove('pending-selected'));
          btn.classList.add('pending-selected');
          if (quizSubmitRowEl) quizSubmitRowEl.hidden = false;
        });
      }

      quizOptionsList.appendChild(btn);
    });

    if (hasAnswered) {
      revealQuizExplanation(q, savedSelected === q.correct_option, savedSelected, { quizAiExplainHandle });
    }
  }

  if (btnPrevQuiz) btnPrevQuiz.disabled = currentQuizIndex === 0;
  if (btnNextQuiz) btnNextQuiz.disabled = currentQuizIndex === filteredQuestions.length - 1;
}

export function handleQuizSelection(questionObj, selectedOption, refreshGuideFlagsCb) {
  quizAnsweredStates[questionObj.id] = selectedOption;
  saveJson(STORAGE_KEYS.quizAnswered, quizAnsweredStates);

  const isCorrect = selectedOption === questionObj.correct_option;

  perfData.answered++;
  if (isCorrect) perfData.correct++;

  const dom = questionObj.domain;
  if (!perfData.domains[dom]) {
    perfData.domains[dom] = { answered: 0, correct: 0 };
  }
  perfData.domains[dom].answered++;
  if (isCorrect) perfData.domains[dom].correct++;

  recordQuestionHistory(questionObj.id, isCorrect, refreshGuideFlagsCb);

  saveUserStats();
  updateDashboardStats();
  renderQuizQuestion();
}

export function revealQuizExplanation(q, isCorrect, selectedOption, { quizAiExplainHandle } = {}) {
  setCurrentAiExplainQuestion(q);
  quizAiExplainHandle?.showCachedIfAny();

  if (explanationStatusEl) explanationStatusEl.textContent = isCorrect ? 'CORRECT // MASTERED' : 'INCORRECT // RATIONALE';
  if (quizExplanationContainer) {
    quizExplanationContainer.className = `quiz-explanation-box ${isCorrect ? 'correct' : 'incorrect'}`;
  }

  const hasPerChoiceRationale = ['a', 'b', 'c', 'd'].every(k => !!q[`rationale_${k}`]);

  if (hasPerChoiceRationale && rationaleBreakdownEl) {
    if (explanationTextEl) explanationTextEl.style.display = 'none';
    rationaleBreakdownEl.innerHTML = '';

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
  } else if (explanationTextEl) {
    explanationTextEl.style.display = '';
    explanationTextEl.textContent = q.explanation || '';
    if (rationaleBreakdownEl) rationaleBreakdownEl.innerHTML = '';
  }

  if (quizExplanationContainer) quizExplanationContainer.style.display = 'block';
}

export function initQuiz({ showToast, refreshGuideFlagsCb, quizAiExplainHandle, resetAiExplainPanel } = {}) {
  if (!quizQuestionEl) return;
  filterQuizQuestions();

  if (quizDomainSelect) {
    quizDomainSelect.addEventListener('change', filterQuizQuestions);
  }

  if (btnPrevQuiz) {
    btnPrevQuiz.addEventListener('click', () => {
      if (currentQuizIndex > 0) {
        setCurrentQuizIndex(currentQuizIndex - 1);
        renderQuizQuestion({ quizAiExplainHandle, resetAiExplainPanel });
        scrollQuizToTop();
      }
    });
  }

  if (btnNextQuiz) {
    btnNextQuiz.addEventListener('click', () => {
      if (currentQuizIndex < filteredQuestions.length - 1) {
        setCurrentQuizIndex(currentQuizIndex + 1);
        renderQuizQuestion({ quizAiExplainHandle, resetAiExplainPanel });
        scrollQuizToTop();
      }
    });
  }

  if (quizWeakSpotToggle) {
    quizWeakSpotToggle.addEventListener('change', () => {
      quizWeakSpotToggle.closest('.weak-spot-toggle')?.classList.toggle('checked', quizWeakSpotToggle.checked);
      filterQuizQuestions();
    });
  }

  if (quizMistakesToggle) {
    quizMistakesToggle.addEventListener('change', () => {
      quizMistakesToggle.closest('.weak-spot-toggle')?.classList.toggle('checked', quizMistakesToggle.checked);
      filterQuizQuestions();
    });
  }

  if (btnRetestMistakes) {
    btnRetestMistakes.addEventListener('click', () => {
      const mistakeIds = questions.filter(q => isPersonalMistake(q.id)).map(q => q.id);
      if (mistakeIds.length === 0) {
        if (showToast) showToast('No open mistakes right now — nice work!');
        return;
      }
      mistakeIds.forEach(qid => delete quizAnsweredStates[qid]);
      saveJson(STORAGE_KEYS.quizAnswered, quizAnsweredStates);

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
      if (showToast) showToast(`Retesting ${mistakeIds.length} mistake${mistakeIds.length === 1 ? '' : 's'}`);
    });
  }

  if (quizShowAllToggle) {
    quizShowAllToggle.addEventListener('change', () => {
      quizShowAllToggle.closest('.weak-spot-toggle')?.classList.toggle('checked', quizShowAllToggle.checked);
      filterQuizQuestions();
    });
  }

  if (quizSubmitBtnEl) {
    quizSubmitBtnEl.addEventListener('click', () => {
      if (!pendingQuizSelection) return;
      const { question, selectedOption } = pendingQuizSelection;
      setPendingQuizSelection(null);
      if (quizSubmitRowEl) quizSubmitRowEl.hidden = true;
      handleQuizSelection(question, selectedOption, refreshGuideFlagsCb);
    });
  }

  if (btnQuizBookmark) {
    btnQuizBookmark.addEventListener('click', () => {
      if (filteredQuestions.length === 0) return;
      const q = filteredQuestions[currentQuizIndex];
      const isBookmarked = isItemBookmarked('question', q.id);

      if (!isBookmarked) {
        bookmarks.push({ item_type: 'question', item_id: q.id });
        btnQuizBookmark.classList.add('active');
        if (showToast) showToast('Bookmarked for review');
      } else {
        setBookmarks(bookmarks.filter(b => !(b.item_type === 'question' && b.item_id === q.id)));
        btnQuizBookmark.classList.remove('active');
        if (showToast) showToast('Bookmark removed', 'removed');
      }

      saveJson(STORAGE_KEYS.bookmarks, bookmarks);
      updateDashboardStats();
    });
  }
}
