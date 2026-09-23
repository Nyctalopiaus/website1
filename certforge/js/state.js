// Centralized application runtime state store

import { FALLBACK_EXAM_CONFIG } from './config.js';

export let examManifest = null;
export function setExamManifest(val) { examManifest = val; }

export let examConfig = null;
export function setExamConfig(val) { examConfig = val; }

export function getActiveExamConfig() {
  return examConfig || FALLBACK_EXAM_CONFIG;
}

export function getExamName() {
  return getActiveExamConfig().name || 'CISM';
}

export function getExamFullName() {
  const cfg = getActiveExamConfig();
  return cfg.full_name || cfg.name || 'CISM';
}

export function getDomainTitle(num) {
  const domains = getActiveExamConfig().domains || [];
  const match = domains.find(d => d.id === num);
  return match ? match.title : 'Unknown Domain';
}

export let questions = [];
export function setQuestions(val) { questions = val; }

export let flashcards = [];
export function setFlashcards(val) { flashcards = val; }

export let distractors = [];
export function setDistractors(val) { distractors = val; }

export let bookmarks = [];
export function setBookmarks(val) { bookmarks = val; }

export let attempts = [];
export function setAttempts(val) { attempts = val; }

export let quizAnsweredStates = {};
export function setQuizAnsweredStates(val) { quizAnsweredStates = val; }

export let questionHistory = {};
export function setQuestionHistory(val) { questionHistory = val; }

export let pendingQuizSelection = null;
export function setPendingQuizSelection(val) { pendingQuizSelection = val; }

export let flashcardMastery = {};
export function setFlashcardMastery(val) { flashcardMastery = val; }

export let guideMastery = {};
export function setGuideMastery(val) { guideMastery = val; }

export let pbqs = [];
export function setPbqs(val) { pbqs = val; }

export let filteredPbqs = [];
export function setFilteredPbqs(val) { filteredPbqs = val; }

export let currentPbqIndex = 0;
export function setCurrentPbqIndex(val) { currentPbqIndex = val; }

export let currentPbqUserAnswers = {};
export function setCurrentPbqUserAnswers(val) { currentPbqUserAnswers = val; }

export let currentPbqTokenPlacement = {};
export function setCurrentPbqTokenPlacement(val) { currentPbqTokenPlacement = val; }

export let pbqAttemptState = {};
export function setPbqAttemptState(val) { pbqAttemptState = val; }

export let selectedMockMode = 'quick';
export function setSelectedMockMode(val) { selectedMockMode = val; }

export let selectedFullMockIndex = 0;
export function setSelectedFullMockIndex(val) { selectedFullMockIndex = val; }

export let mockQuestions = [];
export function setMockQuestions(val) { mockQuestions = val; }

export let mockAnswers = {};
export function setMockAnswers(val) { mockAnswers = val; }

export let mockPbqs = [];
export function setMockPbqs(val) { mockPbqs = val; }

export let mockPbqAnswers = {};
export function setMockPbqAnswers(val) { mockPbqAnswers = val; }

export let mockPbqGradedResults = {};
export function setMockPbqGradedResults(val) { mockPbqGradedResults = val; }

export let mockCurrentIndex = 0;
export function setMockCurrentIndex(val) { mockCurrentIndex = val; }

export let mockTimeRemaining = 900;
export function setMockTimeRemaining(val) { mockTimeRemaining = val; }

export let mockTimerInterval = null;
export function setMockTimerInterval(val) { mockTimerInterval = val; }

export let mockSecondsElapsed = 0;
export function setMockSecondsElapsed(val) { mockSecondsElapsed = val; }

export let activeMockCfg = null;
export function setActiveMockCfg(val) { activeMockCfg = val; }

export let lastMockDiagnostics = null;
export function setLastMockDiagnostics(val) { lastMockDiagnostics = val; }

export let activeTrainingPlanDiag = null;
export function setActiveTrainingPlanDiag(val) { activeTrainingPlanDiag = val; }

export let lastTrainingPlanText = '';
export function setLastTrainingPlanText(val) { lastTrainingPlanText = val; }

export let lastTrainingPlanJson = null;
export function setLastTrainingPlanJson(val) { lastTrainingPlanJson = val; }

export let currentCardIndex = 0;
export function setCurrentCardIndex(val) { currentCardIndex = val; }

export let filteredCards = [];
export function setFilteredCards(val) { filteredCards = val; }

export let currentQuizIndex = 0;
export function setCurrentQuizIndex(val) { currentQuizIndex = val; }

export let filteredQuestions = [];
export function setFilteredQuestions(val) { filteredQuestions = val; }

export let currentTrapIndex = 0;
export function setCurrentTrapIndex(val) { currentTrapIndex = val; }

export let filteredTraps = [];
export function setFilteredTraps(val) { filteredTraps = val; }

export let currentAiExplainQuestion = null;
export function setCurrentAiExplainQuestion(val) { currentAiExplainQuestion = val; }

export let aiTutorHistory = [];
export function setAiTutorHistory(val) { aiTutorHistory = val; }

export let aiTutorSendHandle = null;
export function setAiTutorSendHandle(val) { aiTutorSendHandle = val; }

export let perfData = {
  answered: 0,
  correct: 0,
  domains: {}
};
export function setPerfData(val) { perfData = val; }

export function getDomainPerf(domainId) {
  if (!perfData.domains[domainId]) {
    perfData.domains[domainId] = { answered: 0, correct: 0 };
  }
  return perfData.domains[domainId];
}

export function resetPerfDataState() {
  perfData = {
    answered: 0,
    correct: 0,
    domains: {}
  };
}
