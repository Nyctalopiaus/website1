// LocalStorage access, seed data loading, manifest fetching, and data resetting

import {
  ACTIVE_EXAM_ID,
  FALLBACK_EXAM_CONFIG,
  EXAM_MANIFEST_CACHE_KEY,
  STORAGE_KEYS,
  LEGACY_FLAT_KEYS,
  PRE_TAGGING_SEED_COUNTS
} from './config.js';

import {
  setExamManifest,
  setExamConfig,
  getActiveExamConfig,
  perfData,
  setPerfData,
  resetPerfDataState,
  questions,
  questionHistory,
  quizAnsweredStates
} from './state.js';

export const loadJson = (key, fallback) => {
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

export const saveJson = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
};

export const ensureNumericIds = items => {
  if (!Array.isArray(items)) {
    return [];
  }
  return items.map((item, idx) => {
    const candidate = Number(item?.id);
    const id = Number.isFinite(candidate) && candidate > 0 ? candidate : idx + 1;
    return { ...item, id };
  });
};

export const nextLocalId = items => {
  if (!Array.isArray(items) || items.length === 0) {
    return 1;
  }
  return items.reduce((maxId, item) => {
    const value = Number(item?.id);
    return Number.isFinite(value) && value > maxId ? value : maxId;
  }, 0) + 1;
};

export function tagUntaggedLegacyItems(items, originalSeedCount) {
  return items.map(item => {
    if (item.seed === true || item.seed === false) return item;
    return { ...item, seed: Number(item.id) <= originalSeedCount };
  });
}

export function migrateLegacyFlatKeysToNamespaced() {
  if (ACTIVE_EXAM_ID !== 'cism') return;
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

export async function loadExamManifest() {
  try {
    const response = await fetch('data/exams_manifest.json', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Manifest fetch failed with HTTP ${response.status}`);
    }
    const examManifest = await response.json();
    setExamManifest(examManifest);
    const config = (examManifest.exams || []).find(e => e.id === ACTIVE_EXAM_ID) || FALLBACK_EXAM_CONFIG;
    setExamConfig(config);
    try {
      localStorage.setItem(EXAM_MANIFEST_CACHE_KEY, JSON.stringify(examManifest));
    } catch (cacheErr) {
      console.warn('[SYSTEM] Could not cache exam manifest for offline fallback.', cacheErr);
    }
  } catch (e) {
    let cachedManifest = null;
    try {
      const raw = localStorage.getItem(EXAM_MANIFEST_CACHE_KEY);
      cachedManifest = raw ? JSON.parse(raw) : null;
    } catch (parseErr) {
      cachedManifest = null;
    }
    const cachedConfig = cachedManifest && (cachedManifest.exams || []).find(ex => ex.id === ACTIVE_EXAM_ID);

    if (cachedConfig) {
      console.warn('[SYSTEM] Exam manifest unavailable this load. Using last-known-good manifest data.', e);
      setExamManifest(cachedManifest);
      setExamConfig(cachedConfig);
    } else {
      console.warn('[SYSTEM] Exam manifest unavailable and no cached copy exists. Falling back to built-in CISM config.', e);
      setExamManifest({ exams: [FALLBACK_EXAM_CONFIG] });
      setExamConfig(FALLBACK_EXAM_CONFIG);
    }
  }
}

export async function ensureSeedData() {
  const storedSeedVersion = Number(localStorage.getItem(STORAGE_KEYS.seedVersion) || 0);
  const activeCfg = getActiveExamConfig();
  const manifestSeedVersion = Number(activeCfg?.seed_version || 1);
  const needsSeedUpgrade = manifestSeedVersion > storedSeedVersion;
  const alreadyInitialized = localStorage.getItem(STORAGE_KEYS.seedInitialized) === '1';

  if (alreadyInitialized && !needsSeedUpgrade) {
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
    const seedFile = activeCfg?.seed_file || FALLBACK_EXAM_CONFIG.seed_file;
    const response = await fetch(seedFile, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Seed fetch failed with HTTP ${response.status}`);
    }

    const seedData = await response.json();
    const freshSeedQuestions = (seedData?.questions ?? []).map(q => ({ ...q, seed: true }));
    const freshSeedFlashcards = (seedData?.flashcards ?? []).map(c => ({ ...c, seed: true }));
    const freshSeedDistractors = seedData?.distractors ?? [];

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

export async function ensurePbqData() {
  const activeCfg = getActiveExamConfig();
  const pbqFile = activeCfg?.pbq_file;
  if (!pbqFile) {
    saveJson(STORAGE_KEYS.pbqs, []);
    return;
  }

  const storedPbqVersion = Number(localStorage.getItem(STORAGE_KEYS.pbqVersion) || 0);
  const manifestPbqVersion = Number(activeCfg?.pbq_version || 1);
  const alreadyInitialized = localStorage.getItem(STORAGE_KEYS.pbqInitialized) === '1';

  if (alreadyInitialized && manifestPbqVersion <= storedPbqVersion) {
    return;
  }

  try {
    const response = await fetch(pbqFile, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`PBQ fetch failed with HTTP ${response.status}`);
    }
    const pbqData = await response.json();
    saveJson(STORAGE_KEYS.pbqs, pbqData?.pbqs ?? []);
    localStorage.setItem(STORAGE_KEYS.pbqInitialized, '1');
    localStorage.setItem(STORAGE_KEYS.pbqVersion, String(manifestPbqVersion));
  } catch (e) {
    if (!alreadyInitialized) {
      console.warn('[SYSTEM] PBQ file unavailable. Starting with an empty PBQ Lab.', e);
      saveJson(STORAGE_KEYS.pbqs, []);
      localStorage.setItem(STORAGE_KEYS.pbqInitialized, '1');
    } else {
      console.warn('[SYSTEM] PBQ upgrade unavailable this load. Keeping existing local PBQ data.', e);
    }
  }
}

export function loadUserStats() {
  const legacyPerf = localStorage.getItem('cism_performance_v1');
  if (legacyPerf && !localStorage.getItem(LEGACY_FLAT_KEYS.perf)) {
    localStorage.setItem(LEGACY_FLAT_KEYS.perf, legacyPerf);
    localStorage.removeItem('cism_performance_v1');
  }
  migrateLegacyFlatKeysToNamespaced();

  const savedPerf = loadJson(STORAGE_KEYS.perf, null);
  if (savedPerf) {
    setPerfData(savedPerf);
  } else {
    resetPerfDataState();
  }
}

export function saveUserStats() {
  saveJson(STORAGE_KEYS.perf, perfData);
}

export function updateStudyStreak() {
  const todayStr = new Date().toISOString().split('T')[0];
  const lastDate = localStorage.getItem(STORAGE_KEYS.lastStudyDate);
  let streak = parseInt(localStorage.getItem(STORAGE_KEYS.studyStreak) || '0', 10);

  if (!lastDate) {
    streak = 1;
  } else if (lastDate === todayStr) {
    // Already counted today
    return streak;
  } else {
    const last = new Date(lastDate);
    const today = new Date(todayStr);
    const diffDays = Math.round((today - last) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) {
      streak += 1;
    } else {
      streak = 1;
    }
  }

  localStorage.setItem(STORAGE_KEYS.lastStudyDate, todayStr);
  localStorage.setItem(STORAGE_KEYS.studyStreak, String(streak));
  return streak;
}

export function getStudyStreak() {
  return parseInt(localStorage.getItem(STORAGE_KEYS.studyStreak) || '0', 10);
}

export function exportUserDataJson() {
  const exportData = {
    version: 1,
    exportedAt: new Date().toISOString(),
    keys: {}
  };
  Object.entries(STORAGE_KEYS).forEach(([name, key]) => {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      try {
        exportData.keys[key] = JSON.parse(raw);
      } catch {
        exportData.keys[key] = raw;
      }
    }
  });
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(exportData, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', `certforge_backup_${new Date().toISOString().split('T')[0]}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

export function importUserDataJson(parsed) {
  if (!parsed || !parsed.keys) {
    throw new Error('Invalid backup file format.');
  }
  Object.entries(parsed.keys).forEach(([key, val]) => {
    if (typeof val === 'object') {
      localStorage.setItem(key, JSON.stringify(val));
    } else {
      localStorage.setItem(key, String(val));
    }
  });
}

export function resetDomainProgress(domainId) {
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
