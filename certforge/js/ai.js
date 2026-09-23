// Gemini API integrations, response caching, prompt construction & AI button wiring

import {
  ICON_SPARKLE,
  STORAGE_KEYS,
  TERMINOLOGY_GUARDRAIL,
  escapeHtml
} from './config.js';

import {
  loadJson,
  saveJson
} from './storage.js';

import {
  getActiveExamConfig,
  getExamName,
  getExamFullName,
  getDomainTitle
} from './state.js';

import {
  getGeminiApiKey,
  getGeminiModel,
  hasGeminiVault,
  unlockedGeminiKey
} from './vault.js';

import { getDisplayOptions } from './quiz.js';
import { formatMissExample } from './trainingPlan.js';

export function loadAiCacheStore() {
  const store = loadJson(STORAGE_KEYS.aiCache, null);
  if (!store || typeof store.entries !== 'object' || store.entries === null) {
    return { entries: {} };
  }
  return store;
}

export function getCachedAiResponse(cacheKey) {
  if (!cacheKey) return null;
  const currentSeedVersion = Number(getActiveExamConfig()?.seed_version || 1);
  const entry = loadAiCacheStore().entries[cacheKey];
  if (!entry || entry.seedVersion !== currentSeedVersion) return null;
  return entry;
}

export function setCachedAiResponse(cacheKey, text, model) {
  if (!cacheKey) return;
  const currentSeedVersion = Number(getActiveExamConfig()?.seed_version || 1);
  const store = loadAiCacheStore();
  store.entries[cacheKey] = { text, model, ts: Date.now(), seedVersion: currentSeedVersion };
  try {
    saveJson(STORAGE_KEYS.aiCache, store);
  } catch (e) {
    console.warn('[SYSTEM] AI cache write failed (likely full). Trimming oldest entries and retrying.', e);
    const keys = Object.keys(store.entries).sort((a, b) => (store.entries[a].ts || 0) - (store.entries[b].ts || 0));
    const dropCount = Math.ceil(keys.length * 0.2) || 1;
    keys.slice(0, dropCount).forEach(k => delete store.entries[k]);
    try {
      saveJson(STORAGE_KEYS.aiCache, store);
    } catch (e2) {
      console.warn('[SYSTEM] AI cache still full after trimming; this response will not be cached.', e2);
    }
  }
}

export function formatRelativeTime(ts) {
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  const months = Math.round(days / 30);
  return `${months} month${months === 1 ? '' : 's'} ago`;
}

export function buildAiResponseHtml(text, { cached, model, ts }, { calloutMarker, calloutLabel, disclaimer } = {}) {
  const metaLine = cached
    ? `🕓 Cached · asked ${formatRelativeTime(ts)} · ${escapeHtml(model || 'Gemini')}`
    : `${ICON_SPARKLE} Fresh answer · just now · ${escapeHtml(model || 'Gemini')}`;

  const markerIndex = calloutMarker ? text.indexOf(calloutMarker) : -1;
  const mainText = markerIndex === -1 ? text.trim() : text.slice(0, markerIndex).trim();
  const callout = markerIndex === -1 ? '' : text.slice(markerIndex + calloutMarker.length).trim();

  let html = `<div class="ai-response-meta">${metaLine}</div>`;
  html += `<div class="ai-response-text">${escapeHtml(mainText)}</div>`;
  if (callout) {
    html += `<div class="ai-response-hook"><span class="ai-response-hook-label">${escapeHtml(calloutLabel || '')}</span>${escapeHtml(callout)}</div>`;
  }
  html += `<div class="ai-response-disclaimer">${escapeHtml(disclaimer || `AI-generated — cross-check against the rationale above and your official ${getExamName()} materials.`)}</div>`;
  return html;
}

export function buildAiExplainPrompt(q) {
  const domainTitle = getDomainTitle(q.domain);
  const displayOptions = getDisplayOptions(q);
  const optionLines = displayOptions
    .filter(opt => opt.text)
    .map(opt => `${opt.displayLetter}) ${opt.text}${opt.key === q.correct_option ? '  [CORRECT]' : ''}`)
    .join('\n');
  const existingRationale = displayOptions
    .filter(opt => opt.rationale)
    .map(opt => `${opt.displayLetter}: ${opt.rationale}`)
    .join('\n') || (q.explanation || '');

  const systemPrompt = `You are an expert ${getExamFullName()} exam tutor helping a student who already answered a practice ` +
    "question and has read the standard rationale. Do not just repeat what they've already seen -- add genuine " +
    'depth. Be concise and direct, plain text with short paragraphs or a few dashes for lists (no markdown headers, ' +
    'no asterisk bullets). Always end with a section titled exactly "How to remember this:" containing one short, ' +
    `memorable mnemonic, analogy, or memory hook the student can recall under exam pressure for this specific concept. ${TERMINOLOGY_GUARDRAIL}`;

  const userPrompt = `Domain ${q.domain}: ${domainTitle}

Question: ${q.question}

Options:
${optionLines}

Rationale already shown to the student:
${existingRationale}

Give the student a deeper explanation: the underlying ${getExamName()} principle this question is really testing, why the ` +
    `correct answer reflects it, and why the wrong options are tempting traps (briefly -- don't just restate the ` +
    `rationale above). Then end with the "How to remember this:" memory aid as instructed.`;

  return { systemPrompt, userPrompt };
}

export function buildTrapAiExplainPrompt(trap) {
  const domainTitle = getDomainTitle(trap.domain);

  const systemPrompt = `You are an expert ${getExamFullName()} exam tutor. The student is running a "trap statement" drill: ` +
    'a plausible-sounding wrong claim, followed by why it fails and the correct governing principle, both of which ' +
    "they have already read. Do not just repeat what they've already seen -- add genuine depth. Be concise and " +
    'direct, plain text with short paragraphs or a few dashes for lists (no markdown headers, no asterisk bullets). ' +
    'Always end with a section titled exactly "How to remember this:" containing one short, memorable mnemonic, ' +
    `analogy, or memory hook for this specific trap. ${TERMINOLOGY_GUARDRAIL}`;

  const userPrompt = `Domain ${trap.domain}: ${domainTitle}${trap.knowledge_statement ? ' -- ' + trap.knowledge_statement : ''}

Trap statement (plausible-sounding wrong claim): ${trap.trap_statement}

Why it fails (already shown to the student): ${trap.why_it_fails}

Correct governing principle (already shown to the student): ${trap.correct_principle}

Give the student a deeper explanation: the broader ${getExamName()} principle this trap is really testing, why the exam ` +
    `writers favor this specific style of trap, and a realistic scenario where someone would be tempted to fall for ` +
    `it. Then end with the "How to remember this:" memory aid as instructed.`;

  return { systemPrompt, userPrompt };
}

export function buildGuideAiExplainPrompt(title, bodyText, missExamples) {
  const hasMisses = Array.isArray(missExamples) && missExamples.length > 0;
  const missBlock = hasMisses
    ? missExamples.map(group =>
        `${group.ks}${group.ksTitle ? ` -- ${group.ksTitle}` : ''}:\n` +
        group.examples.map(formatMissExample).join('\n')
      ).join('\n\n')
    : '';

  const systemPrompt = (hasMisses
    ? `You are an expert ${getExamFullName()} exam tutor. The student is reading a concept guide reference page ` +
      '(shown in full below) for a topic they are currently missing exam questions on. Give the same full, wide-' +
      `ranging deep dive you would for any guide -- do not just repeat the guide content back, add genuine depth: ` +
      `connect it to related ${getExamName()} concepts, explain how exam questions commonly frame or trap around ` +
      'this topic in general, and give a realistic scenario. Then, ALSO, separately and in addition to that -- ' +
      'not instead of it -- the student\'s own missed questions in this guide\'s territory are shown below (what ' +
      'they picked and why it was wrong): address each one individually, naming the specific distinction or trap ' +
      'it falls into and how to recognize it next time. Covering both the general deep dive and every specific ' +
      'miss below means this response should end up noticeably longer and more thorough than a standard one-' +
      'scenario deep dive -- do not compress, summarize away, or skip either part to keep it short. Be concise ' +
      'and direct within each part, plain text with short paragraphs or a few dashes for lists (no markdown ' +
      'headers, no asterisk bullets). Always end with a section titled exactly "How to remember this:" ' +
      'containing one short, memorable mnemonic, analogy, or memory hook for this topic.'
    : `You are an expert ${getExamFullName()} exam tutor. The student is reading a concept guide reference ` +
      'page (shown in full below) and wants to go deeper. Do not just repeat the guide content back -- add genuine ' +
      `depth: connect it to related ${getExamName()} concepts, explain how exam questions commonly frame or trap around this ` +
      'topic, and give one realistic scenario. Be concise and direct, plain text with short paragraphs or a few ' +
      'dashes for lists (no markdown headers, no asterisk bullets). Always end with a section titled exactly "How to ' +
      'remember this:" containing one short, memorable mnemonic, analogy, or memory hook for this topic.') + ` ${TERMINOLOGY_GUARDRAIL}`;

  const userPrompt = hasMisses
    ? `Concept guide: ${title}

Full guide content already shown to the student:
${bodyText}

The student's actual missed questions tied to this guide:
${missBlock}

Give the student the full deeper explanation building on this guide, same as always: connect it to related ` +
      `${getExamName()} concepts, explain how exam questions commonly frame or trap around this topic in general, ` +
      'and give a realistic scenario. Then, in addition, go through each of the specific missed questions above ' +
      'individually and name what they got confused there. Cover both parts fully -- this should be longer than ' +
      'a typical deep dive, not shorter. Then end with the "How to remember this:" memory aid as instructed.'
    : `Concept guide: ${title}

Full guide content already shown to the student:
${bodyText}

Give the student a deeper explanation building on this guide: connect it to related ${getExamName()} concepts, explain how ` +
      `exam questions commonly frame or trap around this topic, and give one realistic scenario. Then end with ` +
      `the "How to remember this:" memory aid as instructed.`;

  return { systemPrompt, userPrompt };
}

export function buildGuideAiExhaustivePrompt(title, bodyText, missExamples) {
  const hasMisses = Array.isArray(missExamples) && missExamples.length > 0;
  const missBlock = hasMisses
    ? missExamples.map(group =>
        `${group.ks}${group.ksTitle ? ` -- ${group.ksTitle}` : ''}:\n` +
        group.examples.map(formatMissExample).join('\n')
      ).join('\n\n')
    : '';

  const systemPrompt = `You are an expert ${getExamFullName()} exam master tutor providing an exhaustive, ultra-deep-dive breakdown on a concept guide. ` +
    'Do not hold back -- provide an in-depth, authoritative, highly structured master breakdown covering all technical, mathematical, and strategic aspects of this topic. ' +
    'Organize your response cleanly with short plain text paragraphs and bullet lists (no markdown headers, no asterisk bullets). ' +
    'You MUST include the following 6 core sections in your response:\n' +
    '1. Acronym & Terminology Deconstruction: Expand all related acronyms, explain naming etymologies, and clarify subtle term distinctions that trap students.\n' +
    '2. Mathematical Foundations & Worked Calculations: Show exact formulas (e.g. SLE, ALE, ROSI, RPO/RTO metrics, key lengths, probability) with a step-by-step numerical example.\n' +
    '3. Intersecting Concepts & Dependencies: Detail upstream requirements (what must be in place first), downstream failure cascades (what breaks if this fails), and comparative trade-offs.\n' +
    '4. Exam Traps & Mindset Distinctions: Explain how exam writers test this ("First" vs "Most Important", Managerial/Governance vs Technical operator lenses, and common distractor traps).\n' +
    '5. Real-World Architecture & Framework Alignment: Walk through a practical enterprise scenario and map this concept to NIST SP 800-53, ISO 27001, GDPR, or PCI-DSS where applicable.\n' +
    '6. Decision Flowchart / Exam Rules: Give bulleted "If/Then" decision rules for exam day.' +
    (hasMisses ? ' Also, address each of the student\'s missed questions listed below individually.' : '') +
    ` Always end with a section titled exactly "How to remember this:" containing one short, memorable mnemonic or analogy. ${TERMINOLOGY_GUARDRAIL}`;

  const userPrompt = `Concept guide: ${title}

Full guide content already shown to the student:
${bodyText}
` + (hasMisses ? `\nThe student's actual missed questions tied to this guide:\n${missBlock}\n` : '') +
`Provide the complete exhaustive deep dive covering all 6 master sections above, with full depth, math, acronyms, and exam trap analysis, ending with the "How to remember this:" memory aid as instructed.`;

  return { systemPrompt, userPrompt };
}

export async function callGeminiAPI(apiKey, model, systemPrompt, userPrompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
        generationConfig: { maxOutputTokens: 65536 }
      })
    });
  } catch (err) {
    const detail = err?.message || String(err);
    throw new Error(`Could not reach the Gemini API: ${detail}. If this mentions "Content Security Policy", the site's connect-src allowlist needs generativelanguage.googleapis.com added (and deployed). Otherwise check for an ad blocker/privacy extension or your network connection.`);
  }

  if (!response.ok) {
    let msg = `Gemini API error (${response.status})`;
    try {
      const errData = await response.json();
      if (errData.error?.message) msg = errData.error.message;
    } catch (_) { /* use default msg */ }
    throw new Error(msg);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned an empty response. Try again.');
  return candidate?.finishReason === 'MAX_TOKENS'
    ? `${text}\n\n[Response was cut off before finishing -- click Regenerate to try again.]`
    : text;
}

export async function callGeminiJsonAPI(apiKey, model, systemPrompt, userPrompt, responseSchema) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
        generationConfig: {
          maxOutputTokens: 65536,
          responseMimeType: 'application/json',
          responseSchema
        }
      })
    });
  } catch (err) {
    const detail = err?.message || String(err);
    throw new Error(`Could not reach the Gemini API: ${detail}. If this mentions "Content Security Policy", the site's connect-src allowlist needs generativelanguage.googleapis.com added (and deployed). Otherwise check for an ad blocker/privacy extension or your network connection.`);
  }

  if (!response.ok) {
    let msg = `Gemini API error (${response.status})`;
    try {
      const errData = await response.json();
      if (errData.error?.message) msg = errData.error.message;
    } catch (_) { /* use default msg */ }
    throw new Error(msg);
  }

  const data = await response.json();
  const candidate = data.candidates?.[0];
  const text = candidate?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned an empty response. Try again.');
  if (candidate?.finishReason === 'MAX_TOKENS') {
    throw new Error('The PDF plan was too long and got cut off before finishing. Click again to retry.');
  }
  try {
    return JSON.parse(text);
  } catch (err) {
    throw new Error('Gemini returned data in an unexpected format for the PDF. Click again to retry.');
  }
}

export async function callGeminiChatAPI(apiKey, model, systemPrompt, historyTurns, newMessage) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const contents = [...historyTurns, { role: 'user', parts: [{ text: newMessage }] }];

  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents
      })
    });
  } catch (err) {
    const detail = err?.message || String(err);
    throw new Error(`Could not reach the Gemini API: ${detail}. If this mentions "Content Security Policy", the site's connect-src allowlist needs generativelanguage.googleapis.com added (and deployed). Otherwise check for an ad blocker/privacy extension or your network connection.`);
  }

  if (!response.ok) {
    let msg = `Gemini API error (${response.status})`;
    try {
      const errData = await response.json();
      if (errData.error?.message) msg = errData.error.message;
    } catch (_) { /* use default msg */ }
    throw new Error(msg);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini returned an empty response. Try again.');
  return text;
}

export function buildAiTutorSystemPrompt(domainTitle) {
  const domainNote = domainTitle
    ? ` The student has flagged this conversation as focused on Domain: ${domainTitle} -- lean on that context when it's relevant, but still answer directly if they drift to something else.`
    : '';
  return `You are an expert ${getExamFullName()} exam tutor having an open-ended conversation with a student who is stuck on ` +
    'a specific topic. Answer what they actually asked -- don\'t pad with unrelated background. Be concise and ' +
    'direct, plain text with short paragraphs or a few dashes for lists (no markdown headers, no asterisk ' +
    'bullets). When you give a substantive explanation of a concept (not for short follow-up or clarifying ' +
    'exchanges), end that reply with a section titled exactly "How to remember this:" containing one short, ' +
    `memorable mnemonic, analogy, or memory hook the student can recall under exam pressure.${domainNote} ${TERMINOLOGY_GUARDRAIL}`;
}

export function wireAiExplainButton({ btn, responseEl, responseBodyEl, closeBtn, buildPrompt, getCacheKey, onRender, onReset, openAiUnlockModal, refreshAiHeaderButtonState, showToast, openAiSettingsModal }) {
  if (!btn) return { reset() {}, showCachedIfAny() { return false; } };
  const idleLabel = btn.textContent;

  function renderResponse(text, { cached, model, ts }) {
    const html = buildAiResponseHtml(text, { cached, model, ts }, {
      calloutMarker: 'How to remember this:',
      calloutLabel: '🧠 How to remember this'
    });

    if (responseBodyEl) responseBodyEl.innerHTML = html;
    if (responseEl) {
      responseEl.hidden = false;
      responseEl.classList.remove('error');
    }
    btn.textContent = '🔄 Ask again';
    if (onRender) onRender({ text, cached, model, ts });
  }

  function showCachedIfAny() {
    const key = getCacheKey ? getCacheKey() : null;
    const cached = key ? getCachedAiResponse(key) : null;
    if (!cached) return false;
    renderResponse(cached.text, { cached: true, model: cached.model, ts: cached.ts });
    return true;
  }

  async function runAsk() {
    const promptData = buildPrompt();
    if (!promptData) return;
    btn.disabled = true;
    btn.classList.add('loading');
    btn.textContent = 'Asking Gemini...';
    try {
      const model = getGeminiModel();
      const text = await callGeminiAPI(getGeminiApiKey(), model, promptData.systemPrompt, promptData.userPrompt);
      renderResponse(text, { cached: false, model, ts: Date.now() });
      const key = getCacheKey ? getCacheKey() : null;
      if (key) setCachedAiResponse(key, text, model);
    } catch (err) {
      const message = err?.message || 'Something went wrong asking Gemini.';
      if (responseBodyEl) responseBodyEl.textContent = message;
      if (responseEl) {
        responseEl.hidden = false;
        responseEl.classList.add('error');
      }
      btn.textContent = idleLabel;
    } finally {
      btn.disabled = false;
      btn.classList.remove('loading');
    }
  }

  btn.addEventListener('click', () => {
    if (getGeminiApiKey()) {
      runAsk();
      return;
    }
    if (hasGeminiVault()) {
      if (openAiUnlockModal) {
        openAiUnlockModal(() => {
          if (refreshAiHeaderButtonState) refreshAiHeaderButtonState();
          runAsk();
        });
      }
      return;
    }
    if (showToast) showToast('Add your Gemini API key in AI Setup first');
    if (openAiSettingsModal) openAiSettingsModal();
  });

  closeBtn?.addEventListener('click', () => {
    if (responseEl) responseEl.hidden = true;
  });

  return {
    reset() {
      if (responseEl) {
        responseEl.hidden = true;
        responseEl.classList.remove('error');
      }
      if (responseBodyEl) responseBodyEl.innerHTML = '';
      btn.disabled = false;
      btn.classList.remove('loading');
      btn.textContent = idleLabel;
      if (onReset) onReset();
    },
    showCachedIfAny
  };
}
