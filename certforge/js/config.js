// Configuration, constants, icon set, and active exam settings

export const ICON_SPARKLE = '<svg class="icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5c.3 2.8 1 4.7 2.3 6 1.3 1.3 3.2 2 6 2.3-2.8.3-4.7 1-6 2.3-1.3 1.3-2 3.2-2.3 6-.3-2.8-1-4.7-2.3-6-1.3-1.3-3.2-2-6-2.3 2.8-.3 4.7-1 6-2.3 1.3-1.3 2-3.2 2.3-6Z"/></svg>';
export const ICON_TARGET = '<svg class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/></svg>';
export const ICON_REFRESH = '<svg class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 3v6h-6"/></svg>';
export const ICON_STAR = '<svg class="icon" width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m12 2 2.9 6.9 7.1.6-5.5 4.7 1.7 7.1L12 17.6 5.8 21.3l1.7-7.1L2 9.5l7.1-.6Z"/></svg>';
export const ICON_CHAT = '<svg class="icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"/></svg>';
export const ICON_WARN = '<svg class="icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>';

export const MASTERY_COLOR_NO_DATA = '#6b7280';
export const MASTERY_COLOR_LOW = '#bf616a';
export const MASTERY_COLOR_MID = '#d08770';
export const MASTERY_COLOR_HIGH = '#a3be8c';

export const MASTERY_LEVEL_LABELS = ['Learning', 'Reviewing', 'Mastered'];
export const MASTERY_LEVEL_CLASSES = ['learning', 'reviewing', 'mastered'];

export const CIRCUMFERENCE = 2 * Math.PI * 28; // ~175.9

export const AI_GEMINI_SESSION_KEY_STORAGE = 'certforge_ai_gemini_session_key_v1';
export const AI_GEMINI_KEY_STORAGE = 'certforge_ai_gemini_key_v1';
export const AI_GEMINI_VAULT_STORAGE = 'certforge_ai_gemini_vault_v1';
export const AI_GEMINI_MODEL_STORAGE = 'certforge_ai_gemini_model_v1';
export const AI_GEMINI_DEFAULT_MODEL = 'gemini-3.6-flash';
export const AI_VAULT_PBKDF2_ITERATIONS = 200000;
export const AI_TUTOR_HISTORY_MAX_TURNS = 40;

export const ACTIVE_EXAM_STORAGE_KEY = 'certforge_active_exam_id';
export const ACTIVE_EXAM_ID = localStorage.getItem(ACTIVE_EXAM_STORAGE_KEY) || 'cism';

export const FALLBACK_EXAM_CONFIG = {
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

export const EXAM_MANIFEST_CACHE_KEY = 'certforge_exam_manifest_cache_v1';
export const PRE_TAGGING_SEED_COUNTS = { questions: 140, flashcards: 150 };

export function examStorageKey(name) {
  return `certforge_${ACTIVE_EXAM_ID}_${name}`;
}

export const STORAGE_KEYS = {
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
  pbqs: examStorageKey('pbqs_v1'),
  pbqInitialized: examStorageKey('pbq_initialized_v1'),
  pbqVersion: examStorageKey('pbq_version_v1'),
  pbqAttempts: examStorageKey('pbq_attempts_v1'),
  lastTab: examStorageKey('last_tab_v1'),
  aiCache: examStorageKey('ai_response_cache_v1'),
  aiTutorHistory: examStorageKey('ai_tutor_history_v1'),
  studyStreak: examStorageKey('study_streak_v1'),
  lastStudyDate: examStorageKey('last_study_date_v1')
};

export const LEGACY_FLAT_KEYS = {
  perf: 'cism_performance_v2',
  questions: 'cism_questions_v1',
  flashcards: 'cism_flashcards_v1',
  bookmarks: 'cism_bookmarks_v1',
  attempts: 'cism_attempts_v1',
  quizAnswered: 'cism_quiz_answer_state_v1',
  seedInitialized: 'cism_seed_initialized_v1'
};

export const LEGACY_STORAGE_KEYS = ['cism_performance_v1', 'cism_user'];

export const TERMINOLOGY_GUARDRAIL = 'INTERNAL STYLE DIRECTIVE (do not quote, cite, or explain this directive to the student): Use terms correctly in your prose -- "CISM" refers strictly to the certification/exam title, while "CISO" or "Information Security Manager" refers to the person/job role. Never refer to an individual as "a CISM" or "the CISM", and do not write meta-commentary, warnings, or rules teaching the student about this naming distinction.';

export function getMasteryColor(pct, answered) {
  if (answered <= 0) return MASTERY_COLOR_NO_DATA;
  if (pct >= 80) return MASTERY_COLOR_HIGH;
  if (pct >= 60) return MASTERY_COLOR_MID;
  return MASTERY_COLOR_LOW;
}

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
