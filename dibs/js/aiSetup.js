/**
 * AI Setup: the user-menu modal for managing the Gemini key and model.
 *
 * The key is the PIN-encrypted one shared with certforge (see geminiAnalysis.js), so anything
 * done here - saving, replacing, removing - applies to certforge in this browser as well.
 */
import { showToast } from './toast.js';
import {
    getGeminiKeyInfo, getGeminiModel, setGeminiModel, unlockGeminiVault, saveGeminiVault, lockGeminiKey, removeGeminiKey,
    GEMINI_DEFAULT_MODEL, GEMINI_MODEL_SUGGESTIONS, GEMINI_MIN_PIN_LENGTH
} from './geminiAnalysis.js';

const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fieldValue = id => (document.getElementById(id) || {}).value || '';

function statusHtml(info) {
    const tone = (color, icon, text) =>
        `<div style="display:flex; align-items:center; gap:0.5rem; padding:0.7rem 0.85rem; border:1px solid var(--border-color); border-radius:var(--radius-sm); background:var(--bg-input); font-size:0.85rem; color:${color};"><i data-lucide="${icon}"></i><span>${text}</span></div>`;
    if (info.state === 'none') return tone('var(--text-muted)', 'key-round', 'No Gemini key is saved in this browser yet.');
    if (info.state === 'locked') return tone('var(--accent-gold)', 'lock', 'A Gemini key is saved and locked. Enter your PIN to use it in this tab.');
    if (!info.hasVault) return tone('var(--accent-gold)', 'shield-alert', 'A Gemini key is saved without encryption. Save it again below with a PIN to encrypt it.');
    return tone('var(--accent-emerald)', 'lock-open', 'Your Gemini key is saved (encrypted) and unlocked for this tab.');
}

function render() {
    const body = document.getElementById('ai-setup-body');
    if (!body) return;
    const info = getGeminiKeyInfo();
    const hasKey = info.state !== 'none';

    const unlockBlock = info.state === 'locked' ? `
        <div style="display:flex; gap:0.6rem; align-items:flex-end; flex-wrap:wrap;">
            <div style="flex:1; min-width:180px;">
                <label class="filter-label" for="ai-setup-unlock-pin">Vault PIN</label>
                <input type="password" id="ai-setup-unlock-pin" class="input-text" autocomplete="off" style="width:100%; height:40px;">
            </div>
            <button type="button" class="btn btn-primary" data-ai-setup="unlock"><i data-lucide="lock-open"></i> Unlock</button>
        </div>` : '';

    const keyActions = hasKey ? `
        <div style="display:flex; gap:0.6rem; flex-wrap:wrap;">
            ${info.state === 'ready' && info.hasVault ? `<button type="button" class="btn btn-secondary" data-ai-setup="lock"><i data-lucide="lock"></i> Lock Now</button>` : ''}
            <button type="button" class="btn btn-secondary" style="color:var(--accent-red);" data-ai-setup="remove"><i data-lucide="trash-2"></i> Remove Key</button>
        </div>` : '';

    body.innerHTML = `
        ${statusHtml(info)}
        ${unlockBlock}
        ${keyActions}

        <div style="border-top:1px solid var(--border-color); padding-top:1rem; display:flex; flex-direction:column; gap:0.8rem;">
            <div style="font-weight:700; font-size:0.95rem; color:var(--text-primary);">${hasKey ? 'Replace the key' : 'Add your key'}</div>
            <div>
                <label class="filter-label" for="ai-setup-key">Gemini API key</label>
                <input type="password" id="ai-setup-key" class="input-text" autocomplete="off" placeholder="Paste your key from Google AI Studio" style="width:100%; height:40px;">
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.8rem;">
                <div>
                    <label class="filter-label" for="ai-setup-pin">Vault PIN (${GEMINI_MIN_PIN_LENGTH}+ characters)</label>
                    <input type="password" id="ai-setup-pin" class="input-text" autocomplete="new-password" style="width:100%; height:40px;">
                </div>
                <div>
                    <label class="filter-label" for="ai-setup-pin-confirm">Confirm PIN</label>
                    <input type="password" id="ai-setup-pin-confirm" class="input-text" autocomplete="new-password" style="width:100%; height:40px;">
                </div>
            </div>
            <div><button type="button" class="btn btn-primary" data-ai-setup="save-key"><i data-lucide="save"></i> ${hasKey ? 'Replace Key' : 'Save Key'}</button></div>
        </div>

        <div style="border-top:1px solid var(--border-color); padding-top:1rem; display:flex; gap:0.6rem; align-items:flex-end; flex-wrap:wrap;">
            <div style="flex:1; min-width:180px;">
                <label class="filter-label" for="ai-setup-model">Model</label>
                <input type="text" id="ai-setup-model" class="input-text" autocomplete="off" list="ai-setup-model-list" value="${esc(getGeminiModel())}" placeholder="${esc(GEMINI_DEFAULT_MODEL)}" style="width:100%; height:40px;">
                <datalist id="ai-setup-model-list">${GEMINI_MODEL_SUGGESTIONS.map(m => `<option value="${esc(m)}"></option>`).join('')}</datalist>
            </div>
            <button type="button" class="btn btn-secondary" data-ai-setup="save-model">Save Model</button>
        </div>

        <p style="color:var(--text-muted); font-size:0.78rem; margin:0;">
            The key is encrypted with your PIN and stored only in this browser; it is never sent to the Dibs server.
            certforge uses the same saved key, so key changes here apply there too; the model is for Dibs only. Unlocking lasts until you close the tab.
            Live lookups (price history, prior sale price) need a key from a Google project with billing turned on; on a free-tier key the analysis is written from Dibs data alone.
        </p>`;
    if (window.lucide) window.lucide.createIcons();
}

async function handleAction(action) {
    try {
        if (action === 'unlock') {
            const pin = fieldValue('ai-setup-unlock-pin');
            if (!pin) throw new Error('Enter your vault PIN.');
            await unlockGeminiVault(pin);
            showToast('Gemini key unlocked', 'success');
        } else if (action === 'lock') {
            lockGeminiKey();
            showToast('Gemini key locked', 'success');
        } else if (action === 'remove') {
            if (!confirm('Remove the saved Gemini key from this browser? certforge will lose it too.')) return;
            removeGeminiKey();
            showToast('Gemini key removed', 'success');
        } else if (action === 'save-key') {
            const apiKey = fieldValue('ai-setup-key').trim();
            const pin = fieldValue('ai-setup-pin');
            if (!apiKey) throw new Error('Paste your Gemini API key.');
            if (pin.length < GEMINI_MIN_PIN_LENGTH) throw new Error(`Choose a PIN of at least ${GEMINI_MIN_PIN_LENGTH} characters.`);
            if (pin !== fieldValue('ai-setup-pin-confirm')) throw new Error('The two PINs do not match.');
            await saveGeminiVault(pin, apiKey);
            showToast('Gemini key saved', 'success');
        } else if (action === 'save-model') {
            setGeminiModel(fieldValue('ai-setup-model'));
            showToast(`Model set to ${getGeminiModel()}`, 'success');
        } else {
            return;
        }
    } catch (error) {
        showToast(error.message || 'Could not update AI setup', 'error');
        return;
    }
    render();
}

function openAiSetupModal() {
    const modal = document.getElementById('modal-ai-setup');
    if (!modal) return;
    const userMenu = document.getElementById('user-dropdown-menu');
    if (userMenu) userMenu.classList.remove('open');
    render();
    modal.classList.add('active');
}

function closeAiSetupModal() {
    const modal = document.getElementById('modal-ai-setup');
    if (modal) modal.classList.remove('active');
}

window.openAiSetupModal = openAiSetupModal;

document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest('#btn-user-ai-setup')) { openAiSetupModal(); return; }
    if (target.closest('#modal-ai-setup-close') || target.id === 'modal-ai-setup') { closeAiSetupModal(); return; }
    const actionEl = target.closest('[data-ai-setup]');
    if (actionEl && actionEl.closest('#modal-ai-setup')) handleAction(actionEl.dataset.aiSetup);
});

document.addEventListener('keydown', event => {
    if (event.key === 'Enter' && event.target && event.target.id === 'ai-setup-unlock-pin') {
        event.preventDefault();
        handleAction('unlock');
    }
});
