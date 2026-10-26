/**
 * Haven — Mindful Monthly Budgeting for Beginners
 * Module: Storage & State Management
 * 100% Client-Side LocalStorage with Defensive Validation & JSON Portability
 */

(function () {
  'use strict';

  window.Haven = window.Haven || {};

  const STORAGE_KEY = 'haven_budget_data_v2';

  const EMPTY_STATE = {
    grossMonthly: 0,
    withholdingPct: 22,
    netMonthly: 0,
    payFrequency: 'monthly',
    items: [],
    filterTier: 'all',
    customCategories: []
  };

  // Live state
  let state = JSON.parse(JSON.stringify(EMPTY_STATE));

  // Defensive Data Validation and Sanitization for Imported Backups & State
  function sanitizeImportData(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      throw new Error('Backup data must be a valid JSON object.');
    }

    const sanitized = {
      grossMonthly: Math.max(0, Math.min(10000000, Number(raw.grossMonthly) || 0)),
      withholdingPct: Math.max(0, Math.min(100, Number(raw.withholdingPct) || 22)),
      netMonthly: Math.max(0, Math.min(10000000, Number(raw.netMonthly) || 0)),
      payFrequency: ['monthly', 'bi-weekly', 'semi-monthly', 'weekly'].includes(raw.payFrequency) ? raw.payFrequency : 'monthly',
      filterTier: 'all',
      items: [],
      customCategories: []
    };

    // Sanitize items array (max 200 items to prevent storage exhaustion or DoS)
    if (Array.isArray(raw.items)) {
      const rawItems = raw.items.slice(0, 200);
      sanitized.items = rawItems.map((item, idx) => {
        if (!item || typeof item !== 'object') return null;
        const itemId = typeof item.id === 'string' && item.id.length > 0 ? item.id.slice(0, 50) : ('item_' + Date.now() + '_' + idx);
        return {
          id: itemId,
          name: String(item.name || '').trim().slice(0, 80),
          categoryId: String(item.categoryId || 'misc_buffer').trim().slice(0, 50),
          tier: ['needs', 'wants', 'savings'].includes(item.tier) ? item.tier : 'needs',
          amount: Math.max(0, Math.min(10000000, Math.round(Number(item.amount) || 0))),
          paycheck: ['all', 'p1', 'p2'].includes(item.paycheck) ? item.paycheck : 'all',
          goalAmount: Math.max(0, Math.min(10000000, Math.round(Number(item.goalAmount) || 0)))
        };
      }).filter(Boolean);
    }

    // Sanitize custom categories array (max 50 categories)
    if (Array.isArray(raw.customCategories)) {
      const rawCustoms = raw.customCategories.slice(0, 50);
      sanitized.customCategories = rawCustoms.map((cat, idx) => {
        if (!cat || typeof cat !== 'object') return null;
        const name = String(cat.name || '').trim().slice(0, 45);
        if (!name) return null;
        return {
          id: 'cat_custom_' + Date.now() + '_' + idx,
          name: name,
          group: String(cat.group || 'Personal & Family').trim().slice(0, 40),
          tier: ['needs', 'wants', 'savings'].includes(cat.tier) ? cat.tier : 'needs',
          icon: Haven.sanitizeIcon ? Haven.sanitizeIcon(cat.icon) : 'tag',
          isCustom: true
        };
      }).filter(Boolean);
    }

    return sanitized;
  }

  // Load state from browser localStorage
  function loadState() {
    try {
      localStorage.removeItem('haven_budget_data_v1');
    } catch (e) {}

    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        state = sanitizeImportData(parsed);
        Haven.state = state;
        return state;
      }
    } catch (e) {
      console.warn('LocalStorage load failed, starting with clean state.', e);
    }
    state = JSON.parse(JSON.stringify(EMPTY_STATE));
    Haven.state = state;
    return state;
  }

  // Save state to browser localStorage
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(Haven.state));
    } catch (e) {
      console.error('LocalStorage save failed:', e);
    }
  }

  // Reset state to empty
  function clearState(keepCategories = true) {
    const existingCats = keepCategories ? (Haven.state.customCategories || []) : [];
    Haven.state = JSON.parse(JSON.stringify(EMPTY_STATE));
    Haven.state.customCategories = existingCats;
    saveState();
  }

  // Export JSON Backup file
  function exportBackup() {
    const exportData = {
      version: '1.0',
      appName: 'Haven Budget',
      exportedAt: new Date().toISOString(),
      data: Haven.state
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const dateStr = new Date().toISOString().split('T')[0];
    a.href = url;
    a.download = `haven-budget-backup-${dateStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Import JSON Backup file
  function importBackup(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error('No file selected.'));
      if (file.size > 1024 * 1024) {
        return reject(new Error('File too large (maximum 1 MB allowed).'));
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target.result);
          if (parsed && typeof parsed.data === 'object' && Array.isArray(parsed.data.items)) {
            Haven.state = sanitizeImportData(parsed.data);
            saveState();
            resolve(Haven.state);
          } else {
            reject(new Error('Invalid Haven backup file format.'));
          }
        } catch (err) {
          reject(new Error(err.message || 'Corrupted file'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsText(file);
    });
  }

  // Expose Storage Module
  Haven.STORAGE_KEY = STORAGE_KEY;
  Haven.EMPTY_STATE = EMPTY_STATE;
  Haven.state = state;
  Haven.sanitizeImportData = sanitizeImportData;
  Haven.loadState = loadState;
  Haven.saveState = saveState;
  Haven.clearState = clearState;
  Haven.exportBackup = exportBackup;
  Haven.importBackup = importBackup;
})();
