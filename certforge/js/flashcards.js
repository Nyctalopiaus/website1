// Flashcards console & Leitner spaced repetition mastery

import {
  ICON_WARN,
  STORAGE_KEYS,
  MASTERY_LEVEL_LABELS,
  MASTERY_LEVEL_CLASSES
} from './config.js';

import { saveJson } from './storage.js';

import {
  flashcards,
  flashcardMastery,
  currentCardIndex,
  setCurrentCardIndex,
  filteredCards,
  setFilteredCards
} from './state.js';

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

export function getMasteryLevel(cardId) {
  const entry = flashcardMastery[cardId];
  return entry ? entry.level : 0;
}

export function setCardAssessment(cardId, gotIt) {
  const entry = flashcardMastery[cardId] || { level: 0, timesReviewed: 0, lastReviewedAt: null };
  entry.timesReviewed++;
  entry.lastReviewedAt = new Date().toISOString();
  entry.level = gotIt ? Math.min(entry.level + 1, 2) : 0;
  flashcardMastery[cardId] = entry;
  saveJson(STORAGE_KEYS.flashcardMastery, flashcardMastery);
}

export function filterFlashcards() {
  const domainVal = flashcardDomainSelect ? flashcardDomainSelect.value : 'all';
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
  setFilteredCards(pool);
  setCurrentCardIndex(0);
  renderFlashcard();
}

export function handleCardAssessment(gotIt) {
  if (filteredCards.length === 0) return;
  const card = filteredCards[currentCardIndex];
  setCardAssessment(card.id, gotIt);

  if (flashcardUnlearnedToggle && flashcardUnlearnedToggle.checked) {
    filterFlashcards();
    return;
  }

  if (currentCardIndex < filteredCards.length - 1) {
    setCurrentCardIndex(currentCardIndex + 1);
  }
  renderFlashcard();
}

export function renderFlashcard() {
  if (!flashcardEl) return;
  flashcardEl.classList.remove('flipped');
  if (flashcardAssessmentEl) flashcardAssessmentEl.hidden = true;
  flashcardEl.querySelectorAll('.card-face').forEach(face => {
    face.scrollTop = 0;
  });
  flashcardEl.scrollTop = 0;

  if (filteredCards.length === 0) {
    const weakOnly = flashcardWeakSpotToggle && flashcardWeakSpotToggle.checked;
    const unlearnedOnly = flashcardUnlearnedToggle && flashcardUnlearnedToggle.checked;
    if (cardDomainTag) cardDomainTag.textContent = 'NONE';
    if (cardTermEl) cardTermEl.textContent = 'No Flashcards Found';
    if (cardDefinitionEl) {
      cardDefinitionEl.textContent = unlearnedOnly
        ? "Every card in this domain is marked Mastered. Turn off Focus on Unlearned to review them anyway."
        : weakOnly
        ? 'No weak-spot flashcards in this domain. Try a different domain or turn off Weak Spots Only.'
        : 'Please insert custom flashcards via the Curator panel.';
    }
    if (cardCounterEl) cardCounterEl.textContent = '0 / 0';
    if (cardMasteryBadgeEl) cardMasteryBadgeEl.hidden = true;
    if (btnPrevCard) btnPrevCard.disabled = true;
    if (btnNextCard) btnNextCard.disabled = true;
    return;
  }

  const card = filteredCards[currentCardIndex];
  if (cardDomainTag) {
    cardDomainTag.innerHTML = card.weak_spot ? `Domain ${card.domain} · ${ICON_WARN} Weak Spot` : `Domain ${card.domain}`;
  }
  if (cardTermEl) cardTermEl.textContent = card.term;
  if (cardDefinitionEl) cardDefinitionEl.textContent = card.definition;
  if (cardCounterEl) cardCounterEl.textContent = `${currentCardIndex + 1} / ${filteredCards.length}`;

  if (cardMasteryBadgeEl) {
    cardMasteryBadgeEl.hidden = false;
    const level = getMasteryLevel(card.id);
    cardMasteryBadgeEl.textContent = MASTERY_LEVEL_LABELS[level];
    cardMasteryBadgeEl.className = `mastery-badge ${MASTERY_LEVEL_CLASSES[level]}`;
  }

  if (cardWhyMattersBlock && cardWhyMattersEl) {
    if (card.why_it_matters) {
      cardWhyMattersEl.textContent = card.why_it_matters;
      cardWhyMattersBlock.hidden = false;
    } else {
      cardWhyMattersBlock.hidden = true;
    }
  }

  if (cardCommonTrapBlock && cardCommonTrapEl) {
    if (card.common_trap) {
      cardCommonTrapEl.textContent = card.common_trap;
      cardCommonTrapBlock.hidden = false;
    } else {
      cardCommonTrapBlock.hidden = true;
    }
  }

  if (btnPrevCard) btnPrevCard.disabled = currentCardIndex === 0;
  if (btnNextCard) btnNextCard.disabled = currentCardIndex === filteredCards.length - 1;
}

export function initFlashcards() {
  if (!flashcardEl) return;
  filterFlashcards();

  flashcardEl.addEventListener('click', () => {
    const nowFlipped = flashcardEl.classList.toggle('flipped');
    if (flashcardAssessmentEl) flashcardAssessmentEl.hidden = !nowFlipped;
  });

  if (flashcardDomainSelect) {
    flashcardDomainSelect.addEventListener('change', filterFlashcards);
  }

  if (flashcardWeakSpotToggle) {
    flashcardWeakSpotToggle.addEventListener('change', () => {
      flashcardWeakSpotToggle.closest('.weak-spot-toggle')?.classList.toggle('checked', flashcardWeakSpotToggle.checked);
      filterFlashcards();
    });
  }

  if (flashcardUnlearnedToggle) {
    flashcardUnlearnedToggle.addEventListener('change', () => {
      flashcardUnlearnedToggle.closest('.weak-spot-toggle')?.classList.toggle('checked', flashcardUnlearnedToggle.checked);
      filterFlashcards();
    });
  }

  if (btnCardStillLearning) {
    btnCardStillLearning.addEventListener('click', () => handleCardAssessment(false));
  }
  if (btnCardGotIt) {
    btnCardGotIt.addEventListener('click', () => handleCardAssessment(true));
  }

  if (btnPrevCard) {
    btnPrevCard.addEventListener('click', () => {
      if (currentCardIndex > 0) {
        setCurrentCardIndex(currentCardIndex - 1);
        renderFlashcard();
      }
    });
  }

  if (btnNextCard) {
    btnNextCard.addEventListener('click', () => {
      if (currentCardIndex < filteredCards.length - 1) {
        setCurrentCardIndex(currentCardIndex + 1);
        renderFlashcard();
      }
    });
  }
}
