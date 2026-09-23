// Deck Curator manager forms (custom questions/flashcards & data reset handlers)

import { STORAGE_KEYS, LEGACY_STORAGE_KEYS, LEGACY_FLAT_KEYS, ACTIVE_EXAM_ID, FALLBACK_EXAM_CONFIG } from './config.js';
import { saveJson, nextLocalId, resetDomainProgress } from './storage.js';
import {
  flashcards,
  questions,
  setQuestions,
  setFlashcards,
  flashcardMastery,
  setFlashcardMastery,
  guideMastery,
  setGuideMastery,
  bookmarks,
  setBookmarks,
  attempts,
  setAttempts,
  getActiveExamConfig
} from './state.js';

import { updateDashboardStats } from './dashboard.js';
import { filterFlashcards } from './flashcards.js';
import { filterQuizQuestions } from './quiz.js';

const formAddFlashcard = document.getElementById('form-add-flashcard');
const formAddQuestion = document.getElementById('form-add-question');
const flashcardStatus = document.getElementById('flashcard-form-status');
const questionStatus = document.getElementById('question-form-status');
const btnResetLocalData = document.getElementById('btn-reset-local-data');
const localResetStatus = document.getElementById('local-reset-status');
const localResetSelect = document.getElementById('local-reset-select');

export function initCurator() {
  if (formAddFlashcard) {
    formAddFlashcard.addEventListener('submit', (e) => {
      e.preventDefault();
      if (flashcardStatus) flashcardStatus.textContent = '';

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

      if (flashcardStatus) {
        flashcardStatus.className = 'form-status success';
        flashcardStatus.textContent = '✅ Flashcard saved locally.';
      }

      formAddFlashcard.reset();
      filterFlashcards();
      updateDashboardStats();
    });
  }

  if (formAddQuestion) {
    formAddQuestion.addEventListener('submit', (e) => {
      e.preventDefault();
      if (questionStatus) questionStatus.textContent = '';

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
      if (rationale_a && rationale_b && rationale_c && rationale_d) {
        savedQ.rationale_a = rationale_a;
        savedQ.rationale_b = rationale_b;
        savedQ.rationale_c = rationale_c;
        savedQ.rationale_d = rationale_d;
      }
      if (weakSpot) savedQ.weak_spot = true;
      questions.push(savedQ);
      saveJson(STORAGE_KEYS.questions, questions);

      if (questionStatus) {
        questionStatus.className = 'form-status success';
        questionStatus.textContent = '✅ Question saved locally.';
      }

      formAddQuestion.reset();
      filterQuizQuestions();
      updateDashboardStats();
    });
  }

  if (btnResetLocalData) {
    btnResetLocalData.addEventListener('click', () => {
      const examLabel = getActiveExamConfig().name || 'exam';
      const domainList = getActiveExamConfig().domains || [];
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
          setFlashcardMastery({});
          saveJson(STORAGE_KEYS.flashcardMastery, flashcardMastery);
        };
      } else if (selection === 'guideMastery') {
        confirmMsg = 'This will reset your Concept Guide mastery tracking. Continue?';
        successMsg = 'Concept guide progress reset. Reloading...';
        action = () => {
          setGuideMastery({});
          saveJson(STORAGE_KEYS.guideMastery, guideMastery);
        };
      } else if (selection === 'bookmarks') {
        confirmMsg = 'This will clear all bookmarked/flagged questions and flashcards. Continue?';
        successMsg = 'Bookmarks cleared. Reloading...';
        action = () => {
          setBookmarks([]);
          saveJson(STORAGE_KEYS.bookmarks, bookmarks);
        };
      } else if (selection === 'attempts') {
        confirmMsg = 'This will erase your mock exam attempt history. Continue?';
        successMsg = 'Mock exam history reset. Reloading...';
        action = () => {
          setAttempts([]);
          saveJson(STORAGE_KEYS.attempts, attempts);
        };
      } else if (selection === 'customContent') {
        confirmMsg = 'This will remove all questions and flashcards you added yourself via the Deck Curator. Seed content is kept. Continue?';
        successMsg = 'Custom Curator entries removed. Reloading...';
        action = () => {
          setQuestions(questions.filter(q => q.seed === true));
          setFlashcards(flashcards.filter(c => c.seed === true));
          saveJson(STORAGE_KEYS.questions, questions);
          saveJson(STORAGE_KEYS.flashcards, flashcards);
        };
      } else {
        confirmMsg = `This will erase all local ${examLabel} progress, bookmarks, attempts, quiz history, and custom deck entries for this browser. Continue?`;
        successMsg = `Local ${examLabel} data reset complete. Reloading...`;
        action = () => {
          Object.values(STORAGE_KEYS).forEach(key => localStorage.removeItem(key));
          if (ACTIVE_EXAM_ID === 'cism') {
            LEGACY_STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
            Object.values(LEGACY_FLAT_KEYS).forEach(key => localStorage.removeItem(key));
          }
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
}
