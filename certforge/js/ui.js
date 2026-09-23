// Toast notifications, focus traps, header dropdowns, and modal dialog controllers

import { STORAGE_KEYS, AI_GEMINI_KEY_STORAGE, AI_GEMINI_MODEL_STORAGE } from './config.js';
import { getGeminiApiKey, getGeminiModel, hasGeminiVault, clearGeminiVault, setUnlockedGeminiKey, unlockedGeminiKey, createGeminiVault, unlockGeminiVault } from './vault.js';
import { callGeminiAPI } from './ai.js';
import { exportUserDataJson, importUserDataJson } from './storage.js';

const toastContainerEl = document.getElementById('toast-container');
export function showToast(message, variant) {
  if (!toastContainerEl) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  if (variant === 'removed') toast.classList.add('toast-removed');
  toast.textContent = message;
  toastContainerEl.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('toast-visible'));
  setTimeout(() => {
    toast.classList.remove('toast-visible');
    setTimeout(() => toast.remove(), 300);
  }, 2600);
}

export function attachModalFocusTrap(modalEl) {
  const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
  let lastFocused = null;

  function getFocusable() {
    return Array.from(modalEl.querySelectorAll(FOCUSABLE)).filter((el) => el.offsetParent !== null);
  }

  function onKeydown(e) {
    if (e.key !== 'Tab') return;
    const focusable = getFocusable();
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  new MutationObserver(() => {
    const isOpen = modalEl.getAttribute('aria-hidden') === 'false';
    if (isOpen) {
      lastFocused = document.activeElement;
      modalEl.addEventListener('keydown', onKeydown);
      const focusable = getFocusable();
      setTimeout(() => { (focusable[0] || modalEl).focus(); }, 0);
    } else {
      modalEl.removeEventListener('keydown', onKeydown);
      if (lastFocused && typeof lastFocused.focus === 'function') lastFocused.focus();
      lastFocused = null;
    }
  }).observe(modalEl, { attributes: true, attributeFilter: ['aria-hidden'] });
}

export function initUiModals() {
  document.querySelectorAll('.modal-overlay').forEach(attachModalFocusTrap);

  // Tab buttons
  const tabButtons = document.querySelectorAll('.tab-btn');
  const tabPanes = document.querySelectorAll('.tab-pane');
  tabButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      tabButtons.forEach(b => b.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const target = btn.dataset.target;
      const targetPane = document.getElementById(target);
      if (targetPane) targetPane.classList.add('active');
      localStorage.setItem(STORAGE_KEYS.lastTab, target);
    });
  });

  const savedTab = localStorage.getItem(STORAGE_KEYS.lastTab);
  if (savedTab) {
    const savedTabBtn = Array.from(tabButtons).find(b => b.dataset.target === savedTab);
    if (savedTabBtn) savedTabBtn.click();
  }

  // Quick Start Modal
  const btnOpenQuickstart = document.getElementById('btn-open-quickstart');
  const quickstartModal = document.getElementById('quickstart-modal');
  const btnCloseQuickstart = document.getElementById('btn-close-quickstart');

  if (btnOpenQuickstart && quickstartModal) {
    const openQsModal = () => {
      quickstartModal.style.display = 'flex';
      quickstartModal.classList.remove('hidden');
      quickstartModal.setAttribute('aria-hidden', 'false');
    };
    const closeQsModal = () => {
      quickstartModal.style.display = 'none';
      quickstartModal.classList.add('hidden');
      quickstartModal.setAttribute('aria-hidden', 'true');
    };

    btnOpenQuickstart.addEventListener('click', openQsModal);
    if (btnCloseQuickstart) btnCloseQuickstart.addEventListener('click', closeQsModal);
    quickstartModal.addEventListener('click', (e) => {
      if (e.target === quickstartModal) closeQsModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !quickstartModal.classList.contains('hidden')) {
        closeQsModal();
      }
    });
  }

  // Features Modal
  const btnOpenFeatures = document.getElementById('btn-open-features');
  const featuresModal = document.getElementById('features-modal');
  const btnCloseFeatures = document.getElementById('btn-close-features');

  if (btnOpenFeatures && featuresModal) {
    const openFeaturesModal = () => {
      featuresModal.style.display = 'flex';
      featuresModal.classList.remove('hidden');
      featuresModal.setAttribute('aria-hidden', 'false');
    };
    const closeFeaturesModal = () => {
      featuresModal.style.display = 'none';
      featuresModal.classList.add('hidden');
      featuresModal.setAttribute('aria-hidden', 'true');
    };

    btnOpenFeatures.addEventListener('click', openFeaturesModal);
    if (btnCloseFeatures) btnCloseFeatures.addEventListener('click', closeFeaturesModal);
    featuresModal.addEventListener('click', (e) => {
      if (e.target === featuresModal) closeFeaturesModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !featuresModal.classList.contains('hidden')) {
        closeFeaturesModal();
      }
    });
  }

  initKeyboardShortcuts();
  initBackupExportUi();
  initZenMode();

  // Concept Guide Graphic Enlarge Modal
  const guideGraphicModal = document.getElementById('guide-graphic-modal');
  const guideGraphicModalBody = document.getElementById('guide-graphic-modal-body');
  const btnCloseGuideGraphic = document.getElementById('btn-close-guide-graphic');

  if (guideGraphicModal && guideGraphicModalBody) {
    const openGuideGraphicModal = (svgEl) => {
      guideGraphicModalBody.innerHTML = '';
      guideGraphicModalBody.appendChild(svgEl.cloneNode(true));
      guideGraphicModal.style.display = 'flex';
      guideGraphicModal.classList.remove('hidden');
      guideGraphicModal.setAttribute('aria-hidden', 'false');
    };
    const closeGuideGraphicModal = () => {
      guideGraphicModal.style.display = 'none';
      guideGraphicModal.classList.add('hidden');
      guideGraphicModal.setAttribute('aria-hidden', 'true');
      guideGraphicModalBody.innerHTML = '';
    };

    document.querySelectorAll('.guide-graphic').forEach((graphic) => {
      graphic.setAttribute('tabindex', '0');
      graphic.setAttribute('role', 'button');
      graphic.setAttribute('aria-label', 'Enlarge diagram');
      graphic.addEventListener('click', () => {
        const svgEl = graphic.querySelector('svg');
        if (svgEl) openGuideGraphicModal(svgEl);
      });
      graphic.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const svgEl = graphic.querySelector('svg');
          if (svgEl) openGuideGraphicModal(svgEl);
        }
      });
    });

    if (btnCloseGuideGraphic) btnCloseGuideGraphic.addEventListener('click', closeGuideGraphicModal);
    guideGraphicModal.addEventListener('click', (e) => {
      if (e.target === guideGraphicModal) closeGuideGraphicModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !guideGraphicModal.classList.contains('hidden')) {
        closeGuideGraphicModal();
      }
    });
  }

  // Header Dropdown Settings Menu
  const headerMenuEl = document.getElementById('header-settings-menu');
  const headerMenuToggleBtn = document.getElementById('btn-header-settings-toggle');
  const headerMenuPanelEl = document.getElementById('header-settings-panel');
  const headerMenuBackdropEl = document.getElementById('header-menu-backdrop');
  const headerMenuStatusDotEl = document.getElementById('header-menu-status-dot');
  const aiStatusDotSourceEl = document.getElementById('ai-status-dot');

  function collapseHeaderMenu() {
    if (!headerMenuEl) return;
    headerMenuEl.classList.remove('expanded');
    if (headerMenuPanelEl) headerMenuPanelEl.hidden = true;
    if (headerMenuToggleBtn) headerMenuToggleBtn.setAttribute('aria-expanded', 'false');
  }

  function expandHeaderMenu() {
    if (!headerMenuEl) return;
    headerMenuEl.classList.add('expanded');
    if (headerMenuPanelEl) headerMenuPanelEl.hidden = false;
    if (headerMenuToggleBtn) headerMenuToggleBtn.setAttribute('aria-expanded', 'true');
  }

  if (headerMenuEl && headerMenuToggleBtn && headerMenuPanelEl) {
    headerMenuToggleBtn.addEventListener('click', () => {
      if (headerMenuEl.classList.contains('expanded')) {
        collapseHeaderMenu();
      } else {
        expandHeaderMenu();
      }
    });

    document.addEventListener('click', (e) => {
      if (headerMenuEl.classList.contains('expanded') && !headerMenuEl.contains(e.target)) {
        collapseHeaderMenu();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && headerMenuEl.classList.contains('expanded')) {
        collapseHeaderMenu();
      }
    });

    headerMenuPanelEl.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => collapseHeaderMenu());
    });

    if (headerMenuBackdropEl) {
      headerMenuBackdropEl.addEventListener('click', () => collapseHeaderMenu());
    }
  }

  if (aiStatusDotSourceEl && headerMenuStatusDotEl) {
    const syncHeaderMenuDot = () => {
      headerMenuStatusDotEl.hidden = aiStatusDotSourceEl.hidden;
    };
    syncHeaderMenuDot();
    new MutationObserver(syncHeaderMenuDot).observe(aiStatusDotSourceEl, { attributes: true, attributeFilter: ['hidden'] });
  }
}

export function initAiSettingsUi() {
  const btnOpenAiSettings = document.getElementById('btn-open-ai-settings');
  const aiSettingsModal = document.getElementById('ai-settings-modal');
  const btnCloseAiSettings = document.getElementById('btn-close-ai-settings');
  const aiGeminiKeyInput = document.getElementById('ai-gemini-key-input');
  const aiGeminiKeyLabelEl = document.getElementById('ai-gemini-key-label');
  const aiGeminiModelInput = document.getElementById('ai-gemini-model-input');
  const btnSaveAiSettings = document.getElementById('btn-save-ai-settings');
  const btnClearAiSettings = document.getElementById('btn-clear-ai-settings');
  const aiSettingsStatusEl = document.getElementById('ai-settings-status');
  const btnTestAiSettings = document.getElementById('btn-test-ai-settings');
  const aiUnlockInlineRow = document.getElementById('ai-unlock-inline-row');
  const btnUnlockAiSettings = document.getElementById('btn-unlock-ai-settings');
  const btnOpenAiSettingsLabelEl = document.getElementById('btn-open-ai-settings-label');
  const aiStatusDotEl = document.getElementById('ai-status-dot');
  const aiVaultPinInput = document.getElementById('ai-vault-pin-input');
  const aiVaultPinConfirmRow = document.getElementById('ai-vault-pin-confirm-row');
  const aiVaultPinConfirmInput = document.getElementById('ai-vault-pin-confirm-input');
  const aiUnlockModal = document.getElementById('ai-unlock-modal');
  const btnCloseAiUnlock = document.getElementById('btn-close-ai-unlock');
  const aiUnlockPinInput = document.getElementById('ai-unlock-pin-input');
  const aiUnlockErrorEl = document.getElementById('ai-unlock-error');
  const btnAiUnlockSubmit = document.getElementById('btn-ai-unlock-submit');
  const btnAiUnlockForget = document.getElementById('btn-ai-unlock-forget');

  let pendingUnlockCallback = null;

  function setAiSettingsStatus(text, variant) {
    if (!aiSettingsStatusEl) return;
    aiSettingsStatusEl.textContent = text;
    aiSettingsStatusEl.className = 'ai-settings-status' + (variant ? ` ${variant}` : '');
  }

  function updateAiVaultUiState() {
    const vaultExists = hasGeminiVault();
    const locked = vaultExists && !unlockedGeminiKey;

    if (aiUnlockInlineRow) aiUnlockInlineRow.hidden = !locked;
    if (aiVaultPinConfirmRow) aiVaultPinConfirmRow.style.display = vaultExists ? 'none' : '';
    if (aiGeminiKeyLabelEl) {
      aiGeminiKeyLabelEl.textContent = vaultExists ? 'Replace Gemini API Key' : 'Gemini API Key';
    }
    if (aiGeminiKeyInput) {
      aiGeminiKeyInput.placeholder = vaultExists
        ? 'Leave blank to keep your saved key'
        : 'Paste your Gemini API key';
    }

    if (locked) {
      setAiSettingsStatus('Your Gemini key is encrypted and locked for this session. Click "Unlock Saved Key" above to use it, or paste a new key + PIN below to replace it.');
    } else if (vaultExists) {
      setAiSettingsStatus('Your Gemini key is encrypted on this device and unlocked for this session. Leave the key field blank to keep it, or paste a new one to replace it.');
    } else if (localStorage.getItem(AI_GEMINI_KEY_STORAGE)) {
      setAiSettingsStatus('A Gemini key is saved on this device in plain text. Set a PIN below and save to encrypt it.');
    } else {
      setAiSettingsStatus('No key saved yet -- explanations are off until you add one.');
    }
  }

  function refreshAiHeaderButtonState() {
    const locked = hasGeminiVault() && !unlockedGeminiKey;
    const active = Boolean(getGeminiApiKey());

    let label = 'AI Setup';
    let title = 'Configure AI-powered deeper explanations (Google Gemini)';
    if (locked) {
      label = 'Unlock AI';
      title = 'Your Gemini key is encrypted -- click to unlock it for this session';
    } else if (active) {
      label = 'Gemini Active';
      title = 'Gemini explanations are active -- click to manage your key';
    }

    if (btnOpenAiSettingsLabelEl) btnOpenAiSettingsLabelEl.textContent = label;
    if (aiStatusDotEl) aiStatusDotEl.hidden = !active;
    if (btnOpenAiSettings) btnOpenAiSettings.title = title;
  }

  function openAiSettingsModal() {
    if (!aiSettingsModal) return;
    if (aiGeminiModelInput) aiGeminiModelInput.value = localStorage.getItem(AI_GEMINI_MODEL_STORAGE) || '';
    if (aiGeminiKeyInput) aiGeminiKeyInput.value = '';
    if (aiVaultPinInput) aiVaultPinInput.value = '';
    if (aiVaultPinConfirmInput) aiVaultPinConfirmInput.value = '';
    updateAiVaultUiState();
    aiSettingsModal.style.display = 'flex';
    aiSettingsModal.classList.remove('hidden');
    aiSettingsModal.setAttribute('aria-hidden', 'false');
  }

  function closeAiSettingsModal() {
    if (!aiSettingsModal) return;
    aiSettingsModal.style.display = 'none';
    aiSettingsModal.classList.add('hidden');
    aiSettingsModal.setAttribute('aria-hidden', 'true');
  }

  function openAiUnlockModal(onSuccess) {
    if (!aiUnlockModal) return;
    pendingUnlockCallback = onSuccess || null;
    if (aiUnlockPinInput) aiUnlockPinInput.value = '';
    if (aiUnlockErrorEl) aiUnlockErrorEl.textContent = '';
    aiUnlockModal.style.display = 'flex';
    aiUnlockModal.classList.remove('hidden');
    aiUnlockModal.setAttribute('aria-hidden', 'false');
    aiUnlockPinInput?.focus();
  }

  function closeAiUnlockModal() {
    if (!aiUnlockModal) return;
    aiUnlockModal.style.display = 'none';
    aiUnlockModal.classList.add('hidden');
    aiUnlockModal.setAttribute('aria-hidden', 'true');
    pendingUnlockCallback = null;
  }

  if (btnOpenAiSettings && aiSettingsModal) {
    btnOpenAiSettings.addEventListener('click', () => {
      if (hasGeminiVault() && !unlockedGeminiKey) {
        openAiUnlockModal(() => {
          updateAiVaultUiState();
          refreshAiHeaderButtonState();
          showToast('Gemini key unlocked');
        });
        return;
      }
      openAiSettingsModal();
    });
    if (btnCloseAiSettings) btnCloseAiSettings.addEventListener('click', closeAiSettingsModal);
    aiSettingsModal.addEventListener('click', (e) => {
      if (e.target === aiSettingsModal) closeAiSettingsModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !aiSettingsModal.classList.contains('hidden')) closeAiSettingsModal();
    });

    if (btnSaveAiSettings) {
      btnSaveAiSettings.addEventListener('click', async () => {
        const key = aiGeminiKeyInput?.value.trim();
        const model = aiGeminiModelInput?.value.trim();
        const pin = aiVaultPinInput?.value || '';
        const pinConfirm = aiVaultPinConfirmInput?.value || '';
        const vaultExists = hasGeminiVault();

        if (model) localStorage.setItem(AI_GEMINI_MODEL_STORAGE, model);
        else localStorage.removeItem(AI_GEMINI_MODEL_STORAGE);

        if (!key) {
          setAiSettingsStatus('Settings saved.', 'success');
          showToast('Settings saved');
          return;
        }

        if (!pin || pin.length < 4) {
          setAiSettingsStatus('Enter a vault PIN of at least 4 characters to encrypt this key before saving.', 'error');
          return;
        }
        if (!vaultExists && pin !== pinConfirm) {
          setAiSettingsStatus('PINs do not match.', 'error');
          return;
        }

        btnSaveAiSettings.disabled = true;
        try {
          await createGeminiVault(pin, key);
          localStorage.removeItem(AI_GEMINI_KEY_STORAGE);
          setUnlockedGeminiKey(key);
          if (aiGeminiKeyInput) aiGeminiKeyInput.value = '';
          if (aiVaultPinInput) aiVaultPinInput.value = '';
          if (aiVaultPinConfirmInput) aiVaultPinConfirmInput.value = '';
          updateAiVaultUiState();
          refreshAiHeaderButtonState();
          setAiSettingsStatus('Saved and encrypted. Gemini explanations and AI Deep Dive are now active.', 'success');
          showToast('Gemini key saved');
        } catch (err) {
          setAiSettingsStatus(`Could not encrypt key: ${err?.message || err}`, 'error');
        } finally {
          btnSaveAiSettings.disabled = false;
        }
      });
    }

    if (btnUnlockAiSettings) {
      btnUnlockAiSettings.addEventListener('click', () => {
        openAiUnlockModal(() => {
          updateAiVaultUiState();
          refreshAiHeaderButtonState();
          setAiSettingsStatus('Key unlocked for this session.', 'success');
        });
      });
    }

    const performAiKeyTest = async () => {
      const typedKey = aiGeminiKeyInput?.value.trim();
      const model = aiGeminiModelInput?.value.trim() || getGeminiModel();
      const keyToTest = typedKey || getGeminiApiKey();

      if (!keyToTest) {
        setAiSettingsStatus('Paste a key to test first.', 'error');
        return;
      }

      if (btnTestAiSettings) btnTestAiSettings.disabled = true;
      const prevLabel = btnTestAiSettings ? btnTestAiSettings.textContent : 'Test Connection';
      if (btnTestAiSettings) btnTestAiSettings.textContent = 'Testing...';
      try {
        await callGeminiAPI(keyToTest, model, 'You are a connection test.', 'Reply with exactly: Connection OK');
        setAiSettingsStatus('Connected successfully to Gemini.', 'success');
      } catch (err) {
        setAiSettingsStatus(`Connection test failed: ${err?.message || err}`, 'error');
      } finally {
        if (btnTestAiSettings) {
          btnTestAiSettings.disabled = false;
          btnTestAiSettings.textContent = prevLabel;
        }
      }
    };

    if (btnTestAiSettings) {
      btnTestAiSettings.addEventListener('click', () => {
        const typedKey = aiGeminiKeyInput?.value.trim();
        if (!typedKey && !getGeminiApiKey() && hasGeminiVault()) {
          openAiUnlockModal(() => {
            updateAiVaultUiState();
            refreshAiHeaderButtonState();
            performAiKeyTest();
          });
          return;
        }
        performAiKeyTest();
      });
    }

    if (btnClearAiSettings) {
      btnClearAiSettings.addEventListener('click', () => {
        if (!hasGeminiVault() && !localStorage.getItem(AI_GEMINI_KEY_STORAGE)) return;
        if (!confirm('This permanently deletes the saved API key on this device. Continue?')) return;
        clearGeminiVault();
        localStorage.removeItem(AI_GEMINI_KEY_STORAGE);
        setUnlockedGeminiKey(null);
        if (aiGeminiKeyInput) aiGeminiKeyInput.value = '';
        if (aiVaultPinInput) aiVaultPinInput.value = '';
        if (aiVaultPinConfirmInput) aiVaultPinConfirmInput.value = '';
        updateAiVaultUiState();
        refreshAiHeaderButtonState();
        showToast('Gemini key removed', 'removed');
      });
    }
  }

  if (aiUnlockModal) {
    if (btnCloseAiUnlock) btnCloseAiUnlock.addEventListener('click', closeAiUnlockModal);
    aiUnlockModal.addEventListener('click', (e) => {
      if (e.target === aiUnlockModal) closeAiUnlockModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !aiUnlockModal.classList.contains('hidden')) closeAiUnlockModal();
    });
    if (aiUnlockPinInput) {
      aiUnlockPinInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && btnAiUnlockSubmit) btnAiUnlockSubmit.click();
      });
    }

    if (btnAiUnlockSubmit) {
      btnAiUnlockSubmit.addEventListener('click', async () => {
        const pin = aiUnlockPinInput?.value || '';
        if (!pin) {
          if (aiUnlockErrorEl) aiUnlockErrorEl.textContent = 'Enter your vault PIN.';
          return;
        }
        btnAiUnlockSubmit.disabled = true;
        try {
          setUnlockedGeminiKey(await unlockGeminiVault(pin));
          const callback = pendingUnlockCallback;
          closeAiUnlockModal();
          if (callback) callback();
        } catch (err) {
          if (aiUnlockErrorEl) aiUnlockErrorEl.textContent = err?.message || 'Incorrect PIN.';
        } finally {
          btnAiUnlockSubmit.disabled = false;
        }
      });
    }

    if (btnAiUnlockForget) {
      btnAiUnlockForget.addEventListener('click', () => {
        if (!confirm("This permanently deletes your saved encrypted API key. You'll need to paste it again in AI Setup. Continue?")) return;
        clearGeminiVault();
        localStorage.removeItem(AI_GEMINI_KEY_STORAGE);
        setUnlockedGeminiKey(null);
        closeAiUnlockModal();
        updateAiVaultUiState();
        refreshAiHeaderButtonState();
      });
    }
  }

  refreshAiHeaderButtonState();

  return { openAiUnlockModal, refreshAiHeaderButtonState, openAiSettingsModal };
}

function initZenMode() {
  const btnZen = document.getElementById('btn-zen-mode');
  if (btnZen) {
    btnZen.addEventListener('click', () => {
      document.body.classList.toggle('zen-mode');
      btnZen.classList.toggle('active', document.body.classList.contains('zen-mode'));
      showToast(document.body.classList.contains('zen-mode') ? 'Focus Mode Enabled 👁️' : 'Focus Mode Disabled');
    });
  }
}

function initBackupExportUi() {
  const btnExport = document.getElementById('btn-export-data');
  const btnImport = document.getElementById('btn-import-data');
  const importFileInput = document.getElementById('import-data-file');

  if (btnExport) {
    btnExport.addEventListener('click', () => {
      try {
        exportUserDataJson();
        showToast('Progress backup downloaded (JSON)!');
      } catch (err) {
        showToast('Export failed: ' + err.message, 'removed');
      }
    });
  }

  if (btnImport && importFileInput) {
    btnImport.addEventListener('click', () => importFileInput.click());
    importFileInput.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const parsed = JSON.parse(evt.target.result);
          importUserDataJson(parsed);
          showToast('Data imported successfully! Reloading...');
          setTimeout(() => location.reload(), 1000);
        } catch (err) {
          showToast('Import error: ' + err.message, 'removed');
        }
      };
      reader.readAsText(file);
    });
  }
}

function initKeyboardShortcuts() {
  const shortcutsModal = document.getElementById('shortcuts-modal');
  const btnOpenShortcuts = document.getElementById('btn-open-shortcuts');
  const btnCloseShortcuts = document.getElementById('btn-close-shortcuts');

  const openShortcutsModal = () => {
    if (!shortcutsModal) return;
    shortcutsModal.style.display = 'flex';
    shortcutsModal.classList.remove('hidden');
    shortcutsModal.setAttribute('aria-hidden', 'false');
  };

  const closeShortcutsModal = () => {
    if (!shortcutsModal) return;
    shortcutsModal.style.display = 'none';
    shortcutsModal.classList.add('hidden');
    shortcutsModal.setAttribute('aria-hidden', 'true');
  };

  if (btnOpenShortcuts) btnOpenShortcuts.addEventListener('click', openShortcutsModal);
  if (btnCloseShortcuts) btnCloseShortcuts.addEventListener('click', closeShortcutsModal);

  if (shortcutsModal) {
    shortcutsModal.addEventListener('click', (e) => {
      if (e.target === shortcutsModal) closeShortcutsModal();
    });
  }

  document.addEventListener('keydown', (e) => {
    const activeEl = document.activeElement;
    const isEditing = activeEl && (
      activeEl.tagName === 'INPUT' ||
      activeEl.tagName === 'TEXTAREA' ||
      activeEl.tagName === 'SELECT' ||
      activeEl.isContentEditable
    );

    if (e.key === 'Escape') {
      if (shortcutsModal && !shortcutsModal.classList.contains('hidden')) {
        closeShortcutsModal();
        return;
      }
    }

    if (isEditing) return;

    if (e.key === '?' || (e.shiftKey && e.key === '/')) {
      e.preventDefault();
      if (shortcutsModal && !shortcutsModal.classList.contains('hidden')) {
        closeShortcutsModal();
      } else {
        openShortcutsModal();
      }
      return;
    }

    if (e.key === '/') {
      const searchInput = document.getElementById('search-input');
      if (searchInput) {
        e.preventDefault();
        searchInput.focus();
      }
      return;
    }

    if (e.key === 'z' || e.key === 'Z') {
      e.preventDefault();
      const btnZen = document.getElementById('btn-zen-mode');
      document.body.classList.toggle('zen-mode');
      if (btnZen) btnZen.classList.toggle('active', document.body.classList.contains('zen-mode'));
      showToast(document.body.classList.contains('zen-mode') ? 'Focus Mode Enabled 👁️' : 'Focus Mode Disabled');
      return;
    }

    const activePane = document.querySelector('.tab-pane.active');
    if (!activePane) return;

    // Flashcards Tab shortcuts
    if (activePane.id === 'tab-flashcards') {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        const card = document.getElementById('cism-card');
        card?.click();
      } else if (e.key === 'ArrowRight' || e.key === 'j' || e.key === 'J') {
        e.preventDefault();
        document.getElementById('btn-next-card')?.click();
      } else if (e.key === 'ArrowLeft' || e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        document.getElementById('btn-prev-card')?.click();
      } else if (e.key === '1') {
        document.getElementById('btn-card-got-it')?.click();
      } else if (e.key === '2') {
        document.getElementById('btn-card-still-learning')?.click();
      }
    }
    // Practice Quiz Tab shortcuts
    else if (activePane.id === 'tab-quiz') {
      const options = document.querySelectorAll('#quiz-options-list .option-btn');
      if (['1', 'a', 'A'].includes(e.key) && options[0]) {
        options[0].click();
      } else if (['2', 'b', 'B'].includes(e.key) && options[1]) {
        options[1].click();
      } else if (['3', 'c', 'C'].includes(e.key) && options[2]) {
        options[2].click();
      } else if (['4', 'd', 'D'].includes(e.key) && options[3]) {
        options[3].click();
      } else if (e.key === 'Enter') {
        const submitBtn = document.getElementById('quiz-submit-btn');
        if (submitBtn && submitBtn.offsetParent !== null && !submitBtn.hidden) {
          submitBtn.click();
        } else {
          document.getElementById('btn-next-quiz')?.click();
        }
      } else if (e.key === 'ArrowRight') {
        document.getElementById('btn-next-quiz')?.click();
      } else if (e.key === 'ArrowLeft') {
        document.getElementById('btn-prev-quiz')?.click();
      } else if (e.key === 'b' || e.key === 'B') {
        document.getElementById('btn-quiz-bookmark')?.click();
      }
    }
  });
}
