// Global keyword search indexer, snippet highlighter, and tab auto-jumper

import { ICON_CHAT, escapeHtml } from './config.js';

import {
  flashcards,
  questions,
  distractors,
  currentCardIndex,
  setCurrentCardIndex,
  filteredCards,
  currentQuizIndex,
  setCurrentQuizIndex,
  filteredQuestions,
  currentTrapIndex,
  setCurrentTrapIndex,
  filteredTraps,
  getExamName
} from './state.js';

import { filterFlashcards, renderFlashcard } from './flashcards.js';
import { filterQuizQuestions, renderQuizQuestion } from './quiz.js';
import { filterTraps, renderTrapCard } from './trapspotter.js';
import { isGuideForActiveExam } from './guides.js';

const searchWidgetEl = document.getElementById('search-widget');
const searchToggleBtn = document.getElementById('btn-search-toggle');
const searchInputEl = document.getElementById('search-input');
const searchResultsEl = document.getElementById('search-results');

export let searchIndex = [];
export let searchActiveIndex = -1;
export let searchDebounceTimer = null;

export function buildSearchIndex() {
  const index = [];
  const guideDetails = document.querySelectorAll('.guide-detail');
  const guideMenuItems = document.querySelectorAll('.guide-menu-item');

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

export function runSearch(query) {
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

export function highlightSnippet(entry, terms) {
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

export function renderSearchResults(query, { jumpToAiDeepDive } = {}) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const results = runSearch(query);
  searchActiveIndex = -1;

  if (results.length === 0) {
    searchResultsEl.innerHTML = `
      <div class="search-empty-state">No matches found.</div>
      <button type="button" class="search-ask-tutor-btn" id="search-ask-tutor-btn">${ICON_CHAT} Ask the AI Tutor about "${escapeHtml(query)}" instead</button>
    `;
    searchResultsEl.hidden = false;
    searchResultsEl._currentResults = [];
    document.getElementById('search-ask-tutor-btn')?.addEventListener('click', () => {
      const askedQuery = query;
      collapseSearch();
      if (jumpToAiDeepDive) {
        jumpToAiDeepDive(`Can you explain "${askedQuery}" in the context of the ${getExamName()} exam?`, null);
      }
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

export function setSearchActiveResult(newIndex) {
  const items = searchResultsEl.querySelectorAll('.search-result-item');
  if (items.length === 0) return;
  items.forEach(item => item.classList.remove('active'));
  searchActiveIndex = ((newIndex % items.length) + items.length) % items.length;
  const activeItem = items[searchActiveIndex];
  activeItem.classList.add('active');
  activeItem.scrollIntoView({ block: 'nearest' });
}

export function collapseSearch() {
  if (!searchWidgetEl) return;
  searchWidgetEl.classList.remove('expanded');
  if (searchToggleBtn) searchToggleBtn.setAttribute('aria-expanded', 'false');
  if (searchInputEl) {
    searchInputEl.setAttribute('aria-expanded', 'false');
    searchInputEl.value = '';
  }
  if (searchResultsEl) {
    searchResultsEl.hidden = true;
    searchResultsEl.innerHTML = '';
    searchResultsEl._currentResults = [];
  }
  searchActiveIndex = -1;
}

export function expandSearch() {
  if (!searchWidgetEl) return;
  searchWidgetEl.classList.add('expanded');
  if (searchToggleBtn) searchToggleBtn.setAttribute('aria-expanded', 'true');
  if (searchInputEl) {
    searchInputEl.setAttribute('aria-expanded', 'true');
    searchInputEl.focus();
  }
}

export function switchToTab(tabTargetId) {
  const tabButtons = document.querySelectorAll('.tab-btn');
  const targetBtn = Array.from(tabButtons).find(b => b.dataset.target === tabTargetId);
  if (targetBtn) targetBtn.click();
}

export function jumpToSearchResult(entry) {
  if (!entry) return;

  const flashcardDomainSelect = document.getElementById('flashcard-domain-select');
  const flashcardWeakSpotToggle = document.getElementById('flashcard-weak-spot-toggle');
  const flashcardUnlearnedToggle = document.getElementById('flashcard-unlearned-toggle');
  const quizDomainSelect = document.getElementById('quiz-domain-select');
  const quizWeakSpotToggle = document.getElementById('quiz-weak-spot-toggle');
  const quizMistakesToggle = document.getElementById('quiz-mistakes-toggle');
  const quizShowAllToggle = document.getElementById('quiz-show-all-toggle');
  const trapDomainSelect = document.getElementById('trap-domain-select');
  const guideFocusShakyToggle = document.getElementById('guide-focus-shaky-toggle');
  const guideMenuItems = document.querySelectorAll('.guide-menu-item');

  if (entry.type === 'flashcard') {
    switchToTab('tab-flashcards');
    if (flashcardDomainSelect) flashcardDomainSelect.value = 'all';
    if (flashcardWeakSpotToggle) flashcardWeakSpotToggle.checked = false;
    if (flashcardUnlearnedToggle) flashcardUnlearnedToggle.checked = false;
    filterFlashcards();
    const idx = filteredCards.indexOf(entry.ref);
    if (idx !== -1) {
      setCurrentCardIndex(idx);
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
      setCurrentQuizIndex(idx);
      renderQuizQuestion();
    }
  } else if (entry.type === 'trap') {
    switchToTab('tab-trapspotter');
    if (trapDomainSelect) trapDomainSelect.value = 'all';
    filterTraps();
    const idx = filteredTraps.indexOf(entry.ref);
    if (idx !== -1) {
      setCurrentTrapIndex(idx);
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

export function initSearch({ jumpToAiDeepDive } = {}) {
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
      renderSearchResults(query, { jumpToAiDeepDive });
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
