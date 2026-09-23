// Concept Guides sidebar, Leitner confidence tracking, and objective weak-point flagging

import {
  STORAGE_KEYS,
  ACTIVE_EXAM_ID,
  MASTERY_LEVEL_LABELS,
  MASTERY_LEVEL_CLASSES
} from './config.js';

import { saveJson } from './storage.js';
import { guideMastery, questions } from './state.js';
import { isPersonalMistake } from './quiz.js';

const guideMenuItems = document.querySelectorAll('.guide-menu-item');
const guideDetails = document.querySelectorAll('.guide-detail');
const guideFocusShakyToggle = document.getElementById('guide-focus-shaky-toggle');
const guideMasteryBadgeEl = document.getElementById('guide-mastery-badge');
const btnGuideStillShaky = document.getElementById('btn-guide-still-shaky');
const btnGuideSolid = document.getElementById('btn-guide-solid');
const guideConfidenceBarEl = document.getElementById('guide-confidence-bar');
const guideMenuEmptyEl = document.getElementById('guide-menu-empty');
const guideViewerEmptyEl = document.getElementById('guide-viewer-empty');
const guideWeaknessBannerEl = document.getElementById('guide-weakness-banner');

export const WEAK_POINT_MIN_SAMPLE = 4;
export const WEAK_POINT_RATE = 0.5;

export const KS_TO_GUIDE_TITLE = {
  '2A3': 'Concept Guide 14: Risk Assessment Methodology',
  '2A2': 'Concept Guide 15: Vulnerability & Control Deficiency',
  '2B1': 'Concept Guide 16: Risk Treatment Options',
  '2B3': 'Concept Guide 17: Risk Monitoring & Reporting',
  '3A1': 'Concept Guide 18: Program Resource Decisions',
  '3A2': 'Concept Guide 19: Asset Identification & Classification',
  '3B5': 'Concept Guide 20: Third-Party & External Services',
  '4A2': 'Concept Guide 1: BIA Recovery Timelines',
  '4A1': 'Concept Guide 3: Incident Response Stages',
  '3B1': 'Concept Guide 4: Security Control Matrix',
  '2B2': 'Concept Guide 5: Governance & Risk Owner',
  '1A3': 'Concept Guide 7: Legal Liability & RACI',
  '1B2': 'Concept Guide 8: Documentation Hierarchy',
  '1B3': 'Concept Guide 9: Security Economics',
  '4A5': 'Concept Guide 12: Incident Severity Matrix',
  '3A5': 'Concept Guide 21: Program Metrics & Reporting',
  '3B6': 'Concept Guide 21: Program Metrics & Reporting',
  '4A6': 'Concept Guide 22: IR Testing & Metrics',
  '4A4': 'Concept Guide 23: DR Site Selection & Backup Strategy',
  '4A3': 'Concept Guide 23: DR Site Selection & Backup Strategy'
};

export let guideKsMap = {};

export function buildGuideKsMap() {
  const map = {};
  const cismItems = Array.from(guideMenuItems).filter(mi => mi.dataset.exam === 'cism');
  Object.entries(KS_TO_GUIDE_TITLE).forEach(([ks, label]) => {
    const numMatch = label.match(/^Concept Guide (\d+):/);
    if (!numMatch) return;
    const item = cismItems.find(mi => mi.textContent.trim().startsWith(`${numMatch[1]}. `));
    if (!item) return;
    const guideId = item.dataset.guide;
    if (!map[guideId]) map[guideId] = [];
    map[guideId].push(ks);
  });
  return map;
}

export function getAllGuideTitles() {
  return Array.from(document.querySelectorAll('.guide-menu-item'))
    .filter(isGuideForActiveExam)
    .map(el => el.textContent.trim());
}

export function getGuideMasteryLevel(guideId) {
  const entry = guideMastery[guideId];
  return entry ? entry.level : 0;
}

export function setGuideAssessment(guideId, gotIt) {
  const entry = guideMastery[guideId] || { level: 0, timesReviewed: 0, lastReviewedAt: null };
  entry.timesReviewed++;
  entry.lastReviewedAt = new Date().toISOString();
  entry.level = gotIt ? Math.min(entry.level + 1, 2) : 0;
  guideMastery[guideId] = entry;
  saveJson(STORAGE_KEYS.guideMastery, guideMastery);
}

export function isGuideForActiveExam(item) {
  return !item.dataset.exam || item.dataset.exam === ACTIVE_EXAM_ID;
}

export function getActiveGuideItem() {
  return Array.from(guideMenuItems).find(mi => mi.classList.contains('active')) ||
    Array.from(guideMenuItems).find(isGuideForActiveExam);
}

export function refreshGuideMenuItemDot(item) {
  let dot = item.querySelector('.guide-mastery-dot');
  if (!dot) {
    dot = document.createElement('span');
    dot.className = 'guide-mastery-dot';
    item.appendChild(dot);
  }
  const guideId = item.dataset.guide;
  const level = getGuideMasteryLevel(guideId);
  const entry = guideMastery[guideId];
  dot.className = `guide-mastery-dot ${MASTERY_LEVEL_CLASSES[level]}${entry ? ' reviewed' : ''}`;
  dot.title = entry
    ? `${MASTERY_LEVEL_LABELS[level]} -- reviewed ${entry.timesReviewed}x, last on ${new Date(entry.lastReviewedAt).toLocaleDateString()}`
    : 'Not yet reviewed';
}

export function refreshAllGuideDots() {
  guideMenuItems.forEach(refreshGuideMenuItemDot);
}

export function filterGuideMenu() {
  const focusShaky = guideFocusShakyToggle && guideFocusShakyToggle.checked;
  let anyVisible = false;
  let examHasAnyGuides = false;
  guideMenuItems.forEach(item => {
    const examMatch = isGuideForActiveExam(item);
    if (examMatch) examHasAnyGuides = true;
    const level = getGuideMasteryLevel(item.dataset.guide);
    item.hidden = !examMatch || (focusShaky && level >= 2);
    if (!item.hidden) anyVisible = true;
  });

  if (guideMenuEmptyEl) {
    guideMenuEmptyEl.hidden = anyVisible;
    if (!anyVisible) {
      guideMenuEmptyEl.textContent = examHasAnyGuides
        ? 'Every guide for this exam is marked Solid -- turn off "Focus on Shaky" to see them all.'
        : 'No concept guides for this exam yet -- check back as new content lands.';
    }
  }

  if (!anyVisible) {
    guideMenuItems.forEach(mi => mi.classList.remove('active'));
    guideDetails.forEach(detail => detail.classList.remove('active'));
    if (guideViewerEmptyEl) guideViewerEmptyEl.hidden = false;
    if (guideConfidenceBarEl) guideConfidenceBarEl.hidden = true;
    return;
  }

  if (guideViewerEmptyEl) guideViewerEmptyEl.hidden = true;
  if (guideConfidenceBarEl) guideConfidenceBarEl.hidden = false;

  const activeItem = Array.from(guideMenuItems).find(mi => mi.classList.contains('active'));
  if (!activeItem || activeItem.hidden) {
    const firstVisible = Array.from(guideMenuItems).find(mi => !mi.hidden);
    if (firstVisible) firstVisible.click();
  }
}

export function updateGuideConfidenceBar() {
  if (!guideMasteryBadgeEl) return;
  const activeItem = getActiveGuideItem();
  if (!activeItem) return;
  const level = getGuideMasteryLevel(activeItem.dataset.guide);
  guideMasteryBadgeEl.textContent = MASTERY_LEVEL_LABELS[level];
  guideMasteryBadgeEl.className = `mastery-badge ${MASTERY_LEVEL_CLASSES[level]}`;
}

export function handleGuideAssessment(gotIt) {
  const activeItem = getActiveGuideItem();
  if (!activeItem) return;
  setGuideAssessment(activeItem.dataset.guide, gotIt);
  refreshGuideMenuItemDot(activeItem);
  updateGuideConfidenceBar();
  if (guideFocusShakyToggle && guideFocusShakyToggle.checked) {
    filterGuideMenu();
  }
}

export function getGuideWeakness(guideId) {
  const ksList = guideKsMap[guideId];
  if (!ksList || !ksList.length) return null;
  let missed = 0, total = 0;
  questions.forEach(q => {
    if (!ksList.includes(q.knowledge_statement)) return;
    total++;
    if (isPersonalMistake(q.id)) missed++;
  });
  if (total < WEAK_POINT_MIN_SAMPLE) return null;
  const rate = missed / total;
  return { missed, total, rate, isWeak: rate >= WEAK_POINT_RATE };
}

export function refreshGuideMenuItemFlag(item) {
  let flag = item.querySelector('.guide-weak-flag');
  const weakness = getGuideWeakness(item.dataset.guide);
  if (weakness && weakness.isWeak) {
    if (!flag) {
      flag = document.createElement('span');
      flag.className = 'guide-weak-flag';
      flag.textContent = '⚠';
      item.appendChild(flag);
    }
    flag.title = `Weak point -- still missing ${weakness.missed}/${weakness.total} (${Math.round(weakness.rate * 100)}%) of the questions tied to this guide`;
  } else if (flag) {
    flag.remove();
  }
}

export function refreshAllGuideWeakFlags() {
  guideMenuItems.forEach(refreshGuideMenuItemFlag);
}

export function updateGuideWeaknessBanner() {
  if (!guideWeaknessBannerEl) return;
  const activeItem = getActiveGuideItem();
  const weakness = activeItem ? getGuideWeakness(activeItem.dataset.guide) : null;
  if (weakness && weakness.isWeak) {
    guideWeaknessBannerEl.hidden = false;
    guideWeaknessBannerEl.textContent =
      `⚠ Weak point -- you're still missing ${weakness.missed} of ${weakness.total} (${Math.round(weakness.rate * 100)}%) questions tied to this guide. Worth studying this one in depth before the exam.`;
  } else {
    guideWeaknessBannerEl.hidden = true;
  }
}

export function initGuides({ guideAiExplainHandle, guideAiUltraDeepdiveHandle } = {}) {
  guideKsMap = buildGuideKsMap();
  refreshAllGuideDots();
  refreshAllGuideWeakFlags();
  filterGuideMenu();
  updateGuideConfidenceBar();
  updateGuideWeaknessBanner();

  guideMenuItems.forEach(item => {
    item.addEventListener('click', () => {
      guideMenuItems.forEach(mi => mi.classList.remove('active'));
      item.classList.add('active');

      guideDetails.forEach(detail => detail.classList.remove('active'));
      const targetGuideId = item.dataset.guide;
      const targetGuideEl = document.getElementById(targetGuideId);
      if (targetGuideEl) {
        targetGuideEl.classList.add('active');
      }
      updateGuideConfidenceBar();
      updateGuideWeaknessBanner();
      if (guideAiExplainHandle) guideAiExplainHandle.reset();
      if (guideAiUltraDeepdiveHandle) guideAiUltraDeepdiveHandle.reset();
      if (!guideAiUltraDeepdiveHandle?.showCachedIfAny()) {
        if (guideAiExplainHandle) guideAiExplainHandle.showCachedIfAny();
      }
    });
  });

  if (guideFocusShakyToggle) {
    guideFocusShakyToggle.addEventListener('change', () => {
      guideFocusShakyToggle.closest('.weak-spot-toggle')?.classList.toggle('checked', guideFocusShakyToggle.checked);
      filterGuideMenu();
    });
  }

  if (btnGuideStillShaky) {
    btnGuideStillShaky.addEventListener('click', () => handleGuideAssessment(false));
  }
  if (btnGuideSolid) {
    btnGuideSolid.addEventListener('click', () => handleGuideAssessment(true));
  }
}
