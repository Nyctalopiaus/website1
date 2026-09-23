// AI Deep Dive freeform tutor chat console

import {
  STORAGE_KEYS,
  AI_TUTOR_HISTORY_MAX_TURNS
} from './config.js';

import { saveJson } from './storage.js';

import {
  aiTutorHistory,
  setAiTutorHistory,
  setAiTutorSendHandle,
  getDomainTitle,
  getExamName,
  getExamFullName
} from './state.js';

import {
  getGeminiApiKey,
  getGeminiModel,
  hasGeminiVault
} from './vault.js';

import {
  callGeminiChatAPI,
  buildAiTutorSystemPrompt
} from './ai.js';

const aiTutorDomainSelect = document.getElementById('ai-tutor-domain-select');
const aiTutorChatEl = document.getElementById('ai-tutor-chat');
const aiTutorEmptyEl = document.getElementById('ai-tutor-empty');
const aiTutorInput = document.getElementById('ai-tutor-input');
const btnAiTutorSend = document.getElementById('btn-ai-tutor-send');
const btnAiTutorClear = document.getElementById('btn-ai-tutor-clear');
const aiTutorSuggestionChips = document.querySelectorAll('.ai-tutor-suggestion-chip');

export function initAiTutor({ openAiUnlockModal, refreshAiHeaderButtonState, showToast, openAiSettingsModal } = {}) {
  if (!aiTutorChatEl) return;

  function getAiTutorDomainTitle() {
    const val = aiTutorDomainSelect?.value;
    if (!val || val === 'all') return null;
    return getDomainTitle(parseInt(val, 10));
  }

  function scrollAiTutorChatToBottom() {
    aiTutorChatEl.scrollTop = aiTutorChatEl.scrollHeight;
  }

  function appendAiTutorMessage(role, text, variant) {
    if (aiTutorEmptyEl) aiTutorEmptyEl.hidden = true;
    if (btnAiTutorClear) btnAiTutorClear.hidden = false;
    const msg = document.createElement('div');
    msg.className = `ai-tutor-msg ${role === 'user' ? 'student' : 'tutor'}`;
    if (variant) msg.classList.add(variant);
    const bubble = document.createElement('div');
    bubble.className = 'ai-tutor-msg-bubble';
    bubble.textContent = text;
    msg.appendChild(bubble);
    aiTutorChatEl.appendChild(msg);
    scrollAiTutorChatToBottom();
    return msg;
  }

  if (aiTutorHistory.length > 0) {
    aiTutorHistory.forEach(turn => {
      const text = turn?.parts?.[0]?.text || '';
      if (text) appendAiTutorMessage(turn.role === 'user' ? 'user' : 'model', text);
    });
  }

  async function sendAiTutorMessage(text) {
    const trimmed = (text || '').trim();
    if (!trimmed) return;

    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      if (hasGeminiVault()) {
        if (openAiUnlockModal) {
          openAiUnlockModal(() => {
            if (refreshAiHeaderButtonState) refreshAiHeaderButtonState();
            sendAiTutorMessage(trimmed);
          });
        }
        return;
      }
      if (showToast) showToast('Add your Gemini API key in AI Setup first');
      if (openAiSettingsModal) openAiSettingsModal();
      return;
    }

    if (aiTutorInput) aiTutorInput.value = '';
    appendAiTutorMessage('user', trimmed);

    const thinkingMsg = appendAiTutorMessage('model', 'Thinking...', 'thinking');
    if (btnAiTutorSend) btnAiTutorSend.disabled = true;

    try {
      const systemPrompt = buildAiTutorSystemPrompt(getAiTutorDomainTitle());
      const reply = await callGeminiChatAPI(apiKey, getGeminiModel(), systemPrompt, aiTutorHistory, trimmed);
      thinkingMsg.remove();
      appendAiTutorMessage('model', reply);
      aiTutorHistory.push({ role: 'user', parts: [{ text: trimmed }] });
      aiTutorHistory.push({ role: 'model', parts: [{ text: reply }] });
      if (aiTutorHistory.length > AI_TUTOR_HISTORY_MAX_TURNS) {
        setAiTutorHistory(aiTutorHistory.slice(-AI_TUTOR_HISTORY_MAX_TURNS));
      }
      saveJson(STORAGE_KEYS.aiTutorHistory, aiTutorHistory);
    } catch (err) {
      thinkingMsg.remove();
      const errMsg = appendAiTutorMessage('model', err?.message || 'Something went wrong asking Gemini.', 'error');
      const errBubble = errMsg.querySelector('.ai-tutor-msg-bubble');
      if (errBubble) {
        const retryBtn = document.createElement('button');
        retryBtn.type = 'button';
        retryBtn.className = 'ai-tutor-retry-btn';
        retryBtn.textContent = '🔄 Retry';
        retryBtn.addEventListener('click', () => {
          errMsg.remove();
          sendAiTutorMessage(trimmed);
        });
        errBubble.appendChild(retryBtn);
      }
    } finally {
      if (btnAiTutorSend) btnAiTutorSend.disabled = false;
    }
  }

  if (btnAiTutorSend) {
    btnAiTutorSend.addEventListener('click', () => sendAiTutorMessage(aiTutorInput?.value));
  }

  if (aiTutorInput) {
    aiTutorInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendAiTutorMessage(aiTutorInput.value);
      }
    });
  }

  aiTutorSuggestionChips.forEach(chip => {
    chip.addEventListener('click', () => {
      sendAiTutorMessage(chip.dataset.prompt || chip.textContent);
    });
  });

  if (btnAiTutorClear) {
    btnAiTutorClear.addEventListener('click', () => {
      setAiTutorHistory([]);
      saveJson(STORAGE_KEYS.aiTutorHistory, aiTutorHistory);
      aiTutorChatEl.querySelectorAll('.ai-tutor-msg').forEach(el => el.remove());
      if (aiTutorEmptyEl) aiTutorEmptyEl.hidden = false;
      btnAiTutorClear.hidden = true;
      if (aiTutorInput) aiTutorInput.value = '';
    });
  }

  setAiTutorSendHandle(sendAiTutorMessage);
}

export function jumpToAiDeepDive(seedMessage, domainId, { switchToTab } = {}) {
  if (switchToTab) switchToTab('tab-ai-deepdive');
  if (aiTutorDomainSelect && domainId != null) {
    aiTutorDomainSelect.value = String(domainId);
  }
  const sendHandle = window.__aiTutorSendHandle;
  if (sendHandle) sendHandle(seedMessage);
}
