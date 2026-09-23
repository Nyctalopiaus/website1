// AI Training Plan generator, JSON schema parser, and PDF print builder

import {
  ICON_SPARKLE,
  ICON_REFRESH,
  STORAGE_KEYS,
  TERMINOLOGY_GUARDRAIL,
  escapeHtml
} from './config.js';

import { saveJson } from './storage.js';

import {
  questions,
  quizAnsweredStates,
  attempts,
  lastMockDiagnostics,
  activeTrainingPlanDiag,
  setActiveTrainingPlanDiag,
  setLastTrainingPlanText,
  setLastTrainingPlanJson,
  lastTrainingPlanJson,
  lastTrainingPlanText,
  getDomainTitle,
  getExamName,
  getExamFullName
} from './state.js';

import { isPersonalMistake } from './quiz.js';
import { getGeminiApiKey, getGeminiModel, hasGeminiVault } from './vault.js';
import { callGeminiJsonAPI, buildAiResponseHtml } from './ai.js';
import { KS_TO_GUIDE_TITLE, getAllGuideTitles, guideKsMap } from './guides.js';

const trainingPlanGenerateRowEl = document.getElementById('training-plan-generate-row');
const btnTrainingPlanGenerate = document.getElementById('btn-training-plan-generate');
const trainingPlanModal = document.getElementById('training-plan-modal');
const btnCloseTrainingPlan = document.getElementById('btn-close-training-plan');
const trainingPlanResponseEl = document.getElementById('training-plan-response');
const trainingPlanResponseBodyEl = document.getElementById('training-plan-response-body');
const trainingPlanActionsEl = document.getElementById('training-plan-actions');
const btnTrainingPlanCopy = document.getElementById('btn-training-plan-copy');
const btnTrainingPlanPrint = document.getElementById('btn-training-plan-print');
const btnTrainingPlanRetry = document.getElementById('btn-training-plan-retry');
const btnTrainingPlanDrill = document.getElementById('btn-training-plan-drill');
const trainingPlanStatusEl = document.getElementById('training-plan-status');
const trainingPlanModalIntroEl = document.getElementById('training-plan-modal-intro');
const btnQuizTrainingPlan = document.getElementById('btn-quiz-training-plan');

export const TRAINING_PLAN_PDF_SCHEMA = {
  type: 'OBJECT',
  properties: {
    sections: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          area: { type: 'STRING' },
          concept: { type: 'STRING' },
          missBreakdown: { type: 'STRING' },
          mnemonic: { type: 'STRING' },
          guide: { type: 'STRING', nullable: true },
          diagram: {
            type: 'OBJECT',
            nullable: true,
            properties: {
              type: { type: 'STRING', enum: ['flow', 'comparison', 'hierarchy'] },
              title: { type: 'STRING' },
              steps: {
                type: 'ARRAY',
                nullable: true,
                items: {
                  type: 'OBJECT',
                  properties: { label: { type: 'STRING' }, note: { type: 'STRING', nullable: true } },
                  required: ['label']
                }
              },
              levels: {
                type: 'ARRAY',
                nullable: true,
                items: {
                  type: 'OBJECT',
                  properties: { label: { type: 'STRING' }, note: { type: 'STRING', nullable: true } },
                  required: ['label']
                }
              },
              columns: { type: 'ARRAY', nullable: true, items: { type: 'STRING' } },
              rows: {
                type: 'ARRAY',
                nullable: true,
                items: {
                  type: 'OBJECT',
                  properties: { label: { type: 'STRING' }, values: { type: 'ARRAY', items: { type: 'STRING' } } },
                  required: ['label', 'values']
                }
              }
            },
            required: ['type', 'title']
          }
        },
        required: ['area', 'concept', 'missBreakdown', 'mnemonic']
      }
    },
    nextActions: { type: 'ARRAY', items: { type: 'STRING' } }
  },
  required: ['sections', 'nextActions']
};

export function formatMissExample(ex) {
  return ex.pickedWrong
    ? `  - Missed: "${ex.question}" -- picked "${ex.pickedWrong}" (${ex.pickedWrongRationale}); correct was "${ex.correctAnswer}" (${ex.correctRationale})`
    : `  - Missed: "${ex.question}" -- correct answer: "${ex.correctAnswer}" (${ex.correctRationale})`;
}

export function buildTrainingPlanAreaLabel(item) {
  return item.ksTitle
    ? `Knowledge Statement ${item.ks} -- ${item.ksTitle} (Domain ${item.domain}: ${item.domainTitle})`
    : `Domain ${item.domain}: ${item.domainTitle}`;
}

export function buildTrainingPlanKsLines(diag) {
  return diag.missedByKs.map(item => {
    const guideHint = KS_TO_GUIDE_TITLE[item.ks] ? ` (maps directly to ${KS_TO_GUIDE_TITLE[item.ks]})` : '';
    const exampleLines = item.examples.map(formatMissExample).join('\n');
    const areaLabel = buildTrainingPlanAreaLabel(item);
    return `${areaLabel}${guideHint} -- missed ${item.count} time(s):\n${exampleLines}`;
  }).join('\n\n');
}

export function applyTrainingPlanGuidePointers(plan, diag) {
  if (!plan || !Array.isArray(plan.sections) || !diag) return plan;
  const infoByArea = {};
  diag.missedByKs.forEach(item => {
    infoByArea[buildTrainingPlanAreaLabel(item)] = {
      mapped: KS_TO_GUIDE_TITLE[item.ks],
      topic: item.ksTitle || item.domainTitle
    };
  });
  plan.sections.forEach(s => {
    const info = infoByArea[s.area];
    if (!info) return;
    if (info.mapped) {
      s.guide = info.mapped;
    } else if (!s.guide) {
      s.guide = `AI Deep Dive about ${info.topic}`;
    }
  });
  return plan;
}

export function buildTrainingPlanPdfPrompt(diag) {
  const guideTitles = getAllGuideTitles();
  const ksLines = buildTrainingPlanKsLines(diag);

  const introLine = diag.source === 'quiz'
    ? `The student has been using Certforge's practice quiz and currently has ${diag.mistakeCount} open mistake${diag.mistakeCount === 1 ? '' : 's'} across ${diag.missedByKs.length} knowledge area${diag.missedByKs.length === 1 ? '' : 's'} (a question counts as an "open mistake" once missed and not yet answered correctly twice in a row since).`
    : `The student just finished a ${diag.mode === 'full' ? 'Full-Length' : 'Quick Practice'} ${getExamName()} mock exam: ${diag.correctCount}/${diag.totalCount} correct (${Math.round(diag.scorePct)}%).`;

  const systemPrompt = `You are an expert ${getExamFullName()} exam tutor building a printed PDF training document ` +
    '(not a chat reply -- the student will read this later as a standalone document, so it needs its own full ' +
    'structure). Return one entry per knowledge area listed below, covering every one, never skipping or merging ' +
    'entries. Each knowledge area is already labeled exactly as it should appear -- use that exact label verbatim ' +
    'as the "area" field. For each entry: "concept" is the full deep-dive -- the correct rule or decision ' +
    `framework, connected to related ${getExamName()} concepts, how exam questions commonly frame or trap around ` +
    'this topic in general, and a realistic scenario, written as flowing prose paragraphs (not a rehash of the ' +
    'listed questions). "missBreakdown" separately addresses the student\'s specific missed questions listed for ' +
    'that knowledge area, naming the exact distinction or trap each one falls into. "mnemonic" is one short ' +
    'memory hook for that topic. "guide" is the exact title of the most relevant Concept Guide from the list ' +
    'below if one clearly applies, otherwise omit it -- never invent a title not in that list. Every entry should ' +
    'be long and thorough, covering both the general concept and the specific misses in full -- do not shorten ' +
    'any entry to keep the document brief.\n\n' +
    'For "diagram": include one only when it would genuinely help the student understand this specific topic ' +
    'faster than prose alone -- most entries won\'t need one, and a diagram forced onto a topic that doesn\'t ' +
    'suit it is worse than no diagram. Choose exactly one of three types when you do: "flow" for an ordered ' +
    'sequence of stages or a step-by-step process (e.g. incident response phases, a decision sequence) using ' +
    '"steps"; "hierarchy" for a ranked or nested structure (e.g. policy > standard > procedure, a chain of ' +
    'authority) using "levels", top level first; "comparison" for contrasting two or more things across shared ' +
    'attributes (e.g. RTO vs RPO, hot vs warm vs cold site) using "columns" (the things being compared) and ' +
    '"rows" (the attributes, each with one value per column, same order as "columns"). Keep any diagram\'s own ' +
    'text short -- it is a visual aid, not another place to write paragraphs.\n\n' +
    'Plain text in every prose field (no markdown headers, no asterisk bullets). Finish with "nextActions": ' +
    `exactly three short, concrete, ordered next steps for the student.\n\n${TERMINOLOGY_GUARDRAIL}`;

  const userPrompt = `${introLine}

Available Concept Guides in this app (reference by exact title only, and only when relevant):
${guideTitles.join('; ')}

What they missed, grouped by ISACA Knowledge Statement, most-missed first:

${ksLines}

Build the full PDF training document as instructed: one thorough entry per knowledge area listed above, most ` +
    `urgent first (combining miss frequency with how heavily that domain is weighted on the real exam), each ` +
    `with a diagram only where one genuinely helps. Finish with the three "nextActions".`;

  return { systemPrompt, userPrompt };
}

export function trainingPlanJsonToText(plan) {
  const sections = (plan?.sections || []).map(s => {
    const parts = [s.area || ''];
    if (s.concept) parts.push(s.concept);
    if (s.missBreakdown) parts.push(`Where this tripped you up: ${s.missBreakdown}`);
    if (s.guide) parts.push(`See: ${s.guide}`);
    if (s.mnemonic) parts.push(`How to remember this: ${s.mnemonic}`);
    return parts.join('\n\n');
  }).join('\n\n---\n\n');
  const actions = (plan?.nextActions || []).map((a, i) => `${i + 1}. ${a}`).join('\n');
  return `${sections}\n\nSuggested next 3 study actions:\n${actions}`;
}

export function renderDiagram(diagram) {
  if (!diagram || !diagram.type) return '';
  const title = diagram.title ? `<div class="pdf-diagram-title">${escapeHtml(diagram.title)}</div>` : '';
  let body = '';
  if (diagram.type === 'flow' && Array.isArray(diagram.steps) && diagram.steps.length) {
    body = `<div class="pdf-diagram-flow">${diagram.steps.map((step, i) => `
      <div class="pdf-flow-step">
        <div class="pdf-flow-step-label">${escapeHtml(step.label || '')}</div>
        ${step.note ? `<div class="pdf-flow-step-note">${escapeHtml(step.note)}</div>` : ''}
      </div>${i < diagram.steps.length - 1 ? '<div class="pdf-flow-arrow">&#8594;</div>' : ''}`).join('')}</div>`;
  } else if (diagram.type === 'hierarchy' && Array.isArray(diagram.levels) && diagram.levels.length) {
    body = `<div class="pdf-diagram-hierarchy">${diagram.levels.map((lvl, i) => `
      <div class="pdf-hierarchy-level" style="width:${Math.max(40, 100 - i * 12)}%">
        <div class="pdf-hierarchy-label">${escapeHtml(lvl.label || '')}</div>
        ${lvl.note ? `<div class="pdf-hierarchy-note">${escapeHtml(lvl.note)}</div>` : ''}
      </div>${i < diagram.levels.length - 1 ? '<div class="pdf-hierarchy-arrow">&#8595;</div>' : ''}`).join('')}</div>`;
  } else if (diagram.type === 'comparison' && Array.isArray(diagram.columns) && Array.isArray(diagram.rows) && diagram.rows.length) {
    const head = `<tr><th></th>${diagram.columns.map(c => `<th>${escapeHtml(c)}</th>`).join('')}</tr>`;
    const rows = diagram.rows.map(row => `<tr><th>${escapeHtml(row.label || '')}</th>${(row.values || []).map(v => `<td>${escapeHtml(v)}</td>`).join('')}</tr>`).join('');
    body = `<table class="pdf-diagram-table">${head}${rows}</table>`;
  }
  if (!body) return '';
  return `<div class="pdf-diagram pdf-diagram-${escapeHtml(diagram.type)}">${title}${body}</div>`;
}

export function buildTrainingPlanPdfHtml(plan, diag) {
  const examTitle = escapeHtml(getExamFullName());
  const dateStr = new Date().toLocaleDateString();
  const headerLine = diag.source === 'quiz'
    ? `${diag.mistakeCount} open mistake${diag.mistakeCount === 1 ? '' : 's'} across ${diag.missedByKs.length} knowledge area${diag.missedByKs.length === 1 ? '' : 's'}`
    : `${diag.mode === 'full' ? 'Full-Length' : 'Quick Practice'} mock exam -- ${diag.correctCount}/${diag.totalCount} correct (${Math.round(diag.scorePct)}%)`;

  const sections = (plan.sections || []).map((s, i) => `
    <section class="pdf-section">
      <h2>${i + 1}. ${escapeHtml(s.area || '')}</h2>
      <div class="pdf-concept">${escapeHtml(s.concept || '').replace(/\n+/g, '</p><p>')}</div>
      ${renderDiagram(s.diagram)}
      <div class="pdf-miss-breakdown"><strong>Where this tripped you up:</strong><p>${escapeHtml(s.missBreakdown || '').replace(/\n+/g, '</p><p>')}</p></div>
      ${s.guide ? `<div class="pdf-guide-pointer">See: ${escapeHtml(s.guide)}</div>` : ''}
      ${s.mnemonic ? `<div class="pdf-mnemonic">How to remember this: ${escapeHtml(s.mnemonic)}</div>` : ''}
    </section>`).join('\n');

  const actions = (plan.nextActions || []).map(a => `<li>${escapeHtml(a)}</li>`).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${examTitle} Training Plan</title><style>
    body { font-family: Georgia, 'Times New Roman', serif; color: #111; background: #fff; max-width: 800px; margin: 0 auto; padding: 24px; line-height: 1.5; }
    header.pdf-header { border-bottom: 3px solid #222; margin-bottom: 24px; padding-bottom: 12px; }
    header.pdf-header h1 { margin: 0 0 4px; font-size: 1.6em; }
    .pdf-meta { color: #555; font-size: 0.9em; }
    .pdf-section { margin-bottom: 28px; }
    .pdf-section h2 { font-size: 1.15em; border-bottom: 1px solid #ccc; padding-bottom: 4px; page-break-after: avoid; }
    .pdf-concept p, .pdf-miss-breakdown p { margin: 0.5em 0; }
    .pdf-miss-breakdown { background: #f6f6f2; border-left: 3px solid #999; padding: 8px 12px; margin: 12px 0; }
    .pdf-guide-pointer { font-style: italic; color: #444; margin: 6px 0; }
    .pdf-mnemonic { background: #fff8e6; border: 1px solid #e6d38a; padding: 8px 12px; margin-top: 10px; font-size: 0.95em; }
    .pdf-diagram { page-break-inside: avoid; margin: 14px 0; padding: 10px; border: 1px solid #ccc; background: #fafafa; }
    .pdf-diagram-title { font-weight: bold; margin-bottom: 8px; font-size: 0.9em; }
    .pdf-diagram-flow { display: flex; flex-wrap: wrap; align-items: center; gap: 4px; }
    .pdf-flow-step { border: 1px solid #888; border-radius: 4px; padding: 6px 10px; min-width: 100px; text-align: center; background: #fff; }
    .pdf-flow-step-label { font-weight: bold; font-size: 0.85em; }
    .pdf-flow-step-note { font-size: 0.78em; color: #555; margin-top: 2px; }
    .pdf-flow-arrow { font-size: 1.2em; color: #888; padding: 0 2px; }
    .pdf-diagram-hierarchy { display: flex; flex-direction: column; align-items: center; }
    .pdf-hierarchy-level { border: 1px solid #888; border-radius: 4px; padding: 6px 10px; text-align: center; background: #fff; margin: 0 auto; }
    .pdf-hierarchy-label { font-weight: bold; font-size: 0.85em; }
    .pdf-hierarchy-note { font-size: 0.78em; color: #555; }
    .pdf-hierarchy-arrow { font-size: 1.1em; color: #888; }
    table.pdf-diagram-table { border-collapse: collapse; width: 100%; font-size: 0.85em; }
    table.pdf-diagram-table th, table.pdf-diagram-table td { border: 1px solid #ccc; padding: 5px 8px; text-align: left; }
    table.pdf-diagram-table th { background: #eee; }
    .pdf-actions { page-break-inside: avoid; border-top: 2px solid #222; padding-top: 12px; margin-top: 24px; }
    .pdf-footer { color: #777; font-size: 0.8em; margin-top: 24px; border-top: 1px solid #ccc; padding-top: 8px; }
    @media print { body { padding: 0; } }
  </style></head>
  <body>
    <header class="pdf-header">
      <h1>${examTitle} Training Plan</h1>
      <div class="pdf-meta">${escapeHtml(headerLine)} &middot; ${dateStr}</div>
    </header>
    ${sections}
    <section class="pdf-actions">
      <h2>Suggested Next Steps</h2>
      <ol>${actions}</ol>
    </section>
    <div class="pdf-footer">AI-generated — cross-check against the referenced Concept Guides and your official ${escapeHtml(getExamName())} materials.</div>
  </body></html>`;
}

export function openTrainingPlanPdfWindow(html, showToast) {
  const win = window.open('', '_blank');
  if (!win) {
    if (showToast) showToast('Could not open the PDF -- check your browser\'s popup blocker for this site.');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  let printed = false;
  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    win.focus();
    win.print();
  };
  win.addEventListener('load', triggerPrint);
  setTimeout(triggerPrint, 400);
}

export function buildQuizMistakesDiagnostics() {
  const missedByKs = {};
  let mistakeCount = 0;

  questions.forEach(q => {
    if (!isPersonalMistake(q.id)) return;
    mistakeCount++;

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
      const savedSelected = quizAnsweredStates[q.id];
      const correctKey = (q.correct_option || '').toLowerCase();
      const pickedKey = (savedSelected && savedSelected !== q.correct_option) ? String(savedSelected).toLowerCase() : null;
      missedByKs[ks].examples.push({
        question: q.question,
        pickedWrong: pickedKey ? (q[`option_${pickedKey}`] || '') : null,
        pickedWrongRationale: pickedKey ? (q[`rationale_${pickedKey}`] || '') : '',
        correctAnswer: q[`option_${correctKey}`] || '',
        correctRationale: q[`rationale_${correctKey}`] || q.explanation || ''
      });
    }
  });

  return {
    source: 'quiz',
    mistakeCount,
    missedByKs: Object.values(missedByKs).sort((a, b) => b.count - a.count)
  };
}

export function buildGuideMissExamples(guideId) {
  const ksList = guideKsMap[guideId];
  if (!ksList || !ksList.length) return [];

  const byKs = {};
  questions.forEach(q => {
    if (!ksList.includes(q.knowledge_statement)) return;
    if (!isPersonalMistake(q.id)) return;

    const ks = q.knowledge_statement;
    if (!byKs[ks]) {
      byKs[ks] = { ks, ksTitle: q.knowledge_statement_title || '', examples: [] };
    }
    if (byKs[ks].examples.length >= 2) return;

    const savedSelected = quizAnsweredStates[q.id];
    const correctKey = (q.correct_option || '').toLowerCase();
    const pickedKey = (savedSelected && savedSelected !== q.correct_option) ? String(savedSelected).toLowerCase() : null;
    byKs[ks].examples.push({
      question: q.question,
      pickedWrong: pickedKey ? (q[`option_${pickedKey}`] || '') : null,
      pickedWrongRationale: pickedKey ? (q[`rationale_${pickedKey}`] || '') : '',
      correctAnswer: q[`option_${correctKey}`] || '',
      correctRationale: q[`rationale_${correctKey}`] || q.explanation || ''
    });
  });

  return Object.values(byKs);
}

export function renderTrainingPlan(plan, { cached, model, ts }) {
  applyTrainingPlanGuidePointers(plan, activeTrainingPlanDiag);
  setLastTrainingPlanJson(plan);
  const text = trainingPlanJsonToText(plan);
  setLastTrainingPlanText(text);
  if (trainingPlanResponseBodyEl) {
    trainingPlanResponseBodyEl.innerHTML = buildAiResponseHtml(text, { cached, model, ts }, {
      calloutMarker: 'Suggested next 3 study actions:',
      calloutLabel: '📋 Suggested next 3 study actions',
      disclaimer: `AI-generated — cross-check against the referenced Concept Guides and your official ${getExamName()} materials.`
    });
  }
  if (trainingPlanResponseEl) trainingPlanResponseEl.classList.remove('error');
  if (trainingPlanActionsEl) trainingPlanActionsEl.hidden = false;
  if (btnTrainingPlanRetry) {
    btnTrainingPlanRetry.hidden = false;
    btnTrainingPlanRetry.innerHTML = ICON_REFRESH + ' Regenerate';
  }
}

export async function runTrainingPlanRequest(forceRefresh) {
  if (!activeTrainingPlanDiag || activeTrainingPlanDiag.missedByKs.length === 0) return;
  if (!trainingPlanResponseBodyEl) return;

  const attemptRecord = activeTrainingPlanDiag.attemptRecord;
  if (!forceRefresh && attemptRecord?.trainingPlan?.plan) {
    renderTrainingPlan(attemptRecord.trainingPlan.plan, {
      cached: true,
      model: attemptRecord.trainingPlan.model,
      ts: attemptRecord.trainingPlan.ts
    });
    return;
  }

  trainingPlanResponseBodyEl.textContent = 'Analyzing your results...';
  if (trainingPlanResponseEl) trainingPlanResponseEl.classList.remove('error');
  if (trainingPlanActionsEl) trainingPlanActionsEl.hidden = true;
  if (btnTrainingPlanRetry) btnTrainingPlanRetry.hidden = true;
  if (trainingPlanStatusEl) trainingPlanStatusEl.textContent = '';

  try {
    const model = getGeminiModel();
    const { systemPrompt, userPrompt } = buildTrainingPlanPdfPrompt(activeTrainingPlanDiag);
    const plan = await callGeminiJsonAPI(getGeminiApiKey(), model, systemPrompt, userPrompt, TRAINING_PLAN_PDF_SCHEMA);
    const ts = Date.now();
    renderTrainingPlan(plan, { cached: false, model, ts });
    if (attemptRecord) {
      attemptRecord.trainingPlan = { plan, model, ts };
      saveJson(STORAGE_KEYS.attempts, attempts);
    }
  } catch (err) {
    const message = err && err.message === 'NO_KEY'
      ? 'Add your Gemini API key in AI Setup first.'
      : (err?.message || 'Something went wrong asking Gemini.');
    trainingPlanResponseBodyEl.textContent = message;
    if (trainingPlanResponseEl) trainingPlanResponseEl.classList.add('error');
    if (trainingPlanActionsEl) trainingPlanActionsEl.hidden = false;
    if (btnTrainingPlanRetry) {
      btnTrainingPlanRetry.hidden = false;
      btnTrainingPlanRetry.innerHTML = ICON_REFRESH + ' Try again';
    }
  }
}

export function openTrainingPlanModal(diag) {
  if (!trainingPlanModal || !diag) return;
  setActiveTrainingPlanDiag(diag);
  if (trainingPlanModalIntroEl) {
    trainingPlanModalIntroEl.textContent = diag.source === 'quiz'
      ? "Built from your open Practice Quiz mistakes, prioritized by ISACA knowledge area — powered by the same Gemini connection as the rest of Certforge's AI features."
      : "Built from what you missed on this attempt, prioritized by ISACA knowledge area — powered by the same Gemini connection as the rest of Certforge's AI features.";
  }
  trainingPlanModal.style.display = 'flex';
  trainingPlanModal.classList.remove('hidden');
  trainingPlanModal.setAttribute('aria-hidden', 'false');
  const hasCachedPlan = !!diag.attemptRecord?.trainingPlan?.plan;
  if (trainingPlanGenerateRowEl) trainingPlanGenerateRowEl.hidden = hasCachedPlan;
  if (trainingPlanResponseEl) trainingPlanResponseEl.hidden = !hasCachedPlan;
  if (hasCachedPlan) {
    runTrainingPlanRequest(false);
  } else if (trainingPlanActionsEl) {
    trainingPlanActionsEl.hidden = true;
  }
}

export function closeTrainingPlanModal() {
  if (!trainingPlanModal) return;
  trainingPlanModal.style.display = 'none';
  trainingPlanModal.classList.add('hidden');
  trainingPlanModal.setAttribute('aria-hidden', 'true');
}

export function initTrainingPlan({ openAiUnlockModal, refreshAiHeaderButtonState, showToast, openAiSettingsModal, switchToTab, quizDomainSelect, quizWeakSpotToggle, quizShowAllToggle, quizMistakesToggle, filterQuizQuestions } = {}) {
  const btnTrainingPlan = document.getElementById('btn-training-plan');
  if (btnTrainingPlan) {
    btnTrainingPlan.addEventListener('click', () => {
      if (getGeminiApiKey()) {
        openTrainingPlanModal(lastMockDiagnostics);
        return;
      }
      if (hasGeminiVault()) {
        if (openAiUnlockModal) {
          openAiUnlockModal(() => {
            if (refreshAiHeaderButtonState) refreshAiHeaderButtonState();
            openTrainingPlanModal(lastMockDiagnostics);
          });
        }
        return;
      }
      if (showToast) showToast('Add your Gemini API key in AI Setup first');
      if (openAiSettingsModal) openAiSettingsModal();
    });
  }

  if (btnQuizTrainingPlan) {
    btnQuizTrainingPlan.addEventListener('click', () => {
      const diag = buildQuizMistakesDiagnostics();
      if (diag.missedByKs.length === 0) {
        if (showToast) showToast('No open mistakes right now — nice work!');
        return;
      }
      if (getGeminiApiKey()) {
        openTrainingPlanModal(diag);
        return;
      }
      if (hasGeminiVault()) {
        if (openAiUnlockModal) {
          openAiUnlockModal(() => {
            if (refreshAiHeaderButtonState) refreshAiHeaderButtonState();
            openTrainingPlanModal(diag);
          });
        }
        return;
      }
      if (showToast) showToast('Add your Gemini API key in AI Setup first');
      if (openAiSettingsModal) openAiSettingsModal();
    });
  }

  if (btnCloseTrainingPlan) btnCloseTrainingPlan.addEventListener('click', closeTrainingPlanModal);
  if (trainingPlanModal) {
    trainingPlanModal.addEventListener('click', (e) => {
      if (e.target === trainingPlanModal) closeTrainingPlanModal();
    });
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && trainingPlanModal && !trainingPlanModal.classList.contains('hidden')) {
      closeTrainingPlanModal();
    }
  });

  if (btnTrainingPlanGenerate) {
    btnTrainingPlanGenerate.addEventListener('click', () => {
      if (trainingPlanGenerateRowEl) trainingPlanGenerateRowEl.hidden = true;
      if (trainingPlanResponseEl) trainingPlanResponseEl.hidden = false;
      runTrainingPlanRequest(false);
    });
  }

  if (btnTrainingPlanRetry) btnTrainingPlanRetry.addEventListener('click', () => runTrainingPlanRequest(true));

  if (btnTrainingPlanCopy) {
    btnTrainingPlanCopy.addEventListener('click', async () => {
      if (!trainingPlanStatusEl) return;
      try {
        await navigator.clipboard.writeText(lastTrainingPlanText || trainingPlanResponseBodyEl?.textContent || '');
        trainingPlanStatusEl.textContent = 'Copied to clipboard.';
      } catch {
        trainingPlanStatusEl.textContent = 'Could not copy -- select the text and copy manually.';
      }
      setTimeout(() => { trainingPlanStatusEl.textContent = ''; }, 2500);
    });
  }

  if (btnTrainingPlanPrint) {
    btnTrainingPlanPrint.addEventListener('click', () => {
      if (!lastTrainingPlanJson || !activeTrainingPlanDiag) {
        if (showToast) showToast('Wait for the plan to finish loading first.');
        return;
      }
      openTrainingPlanPdfWindow(buildTrainingPlanPdfHtml(lastTrainingPlanJson, activeTrainingPlanDiag), showToast);
    });
  }

  if (btnTrainingPlanDrill) {
    btnTrainingPlanDrill.addEventListener('click', () => {
      const topMiss = activeTrainingPlanDiag?.missedByKs?.[0];
      if (!topMiss) return;
      closeTrainingPlanModal();
      if (switchToTab) switchToTab('tab-quiz');
      if (quizDomainSelect) quizDomainSelect.value = String(topMiss.domain);
      if (quizWeakSpotToggle) {
        quizWeakSpotToggle.checked = false;
        quizWeakSpotToggle.closest('.weak-spot-toggle')?.classList.remove('checked');
      }
      if (quizShowAllToggle) {
        quizShowAllToggle.checked = false;
        quizShowAllToggle.closest('.weak-spot-toggle')?.classList.remove('checked');
      }
      if (quizMistakesToggle) {
        quizMistakesToggle.checked = true;
        quizMistakesToggle.closest('.weak-spot-toggle')?.classList.add('checked');
      }
      if (filterQuizQuestions) filterQuizQuestions();
      if (showToast) showToast(`Drilling Domain ${topMiss.domain}: ${topMiss.domainTitle} — your mistakes only`);
    });
  }
}
