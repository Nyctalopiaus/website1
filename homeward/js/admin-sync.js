/**
 * Homeward Admin DB Sync & Data Quality Audit Module
 * Manages admin authentication, preview audit of local DB records,
 * detailed audit logging, and non-destructive merge into production DB.
 */
class AdminSyncManager {
  constructor() {
    this.csrfToken = '';
    this.cleanRecords = [];
    this.skippedRecords = [];
    this.init();
  }

  isPrivateNetwork() {
    if (window.propertyLinks && window.propertyLinks.isPrivateNetwork) {
      return window.propertyLinks.isPrivateNetwork();
    }
    const host = window.location.hostname;
    return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
  }

  getTargetUrl() {
    const select = document.getElementById('admin-sync-target-select');
    const target = select ? select.value : 'prod';
    if (target === 'local') {
      return '/backend/sync-db.php';
    }
    return 'https://nycto.ninja/backend/sync-db.php';
  }

  init() {
    if (!this.isPrivateNetwork()) return;

    const btnSync = document.getElementById('btn-admin-sync');
    if (btnSync) {
      btnSync.classList.remove('hidden');
      btnSync.classList.add('flex');
      btnSync.addEventListener('click', () => this.openModal());
    }

    const btnClose = document.getElementById('btn-close-admin-sync-modal');
    if (btnClose) {
      btnClose.addEventListener('click', () => this.closeModal());
    }

    const btnLogin = document.getElementById('btn-admin-sync-login');
    if (btnLogin) {
      btnLogin.addEventListener('click', () => this.handleLogin());
    }

    const passwordInput = document.getElementById('admin-sync-password-input');
    if (passwordInput) {
      passwordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.handleLogin();
      });
    }

    const btnLogout = document.getElementById('btn-admin-logout');
    if (btnLogout) {
      btnLogout.addEventListener('click', () => this.handleLogout());
    }

    const btnHeaderLogout = document.getElementById('btn-header-admin-logout');
    if (btnHeaderLogout) {
      btnHeaderLogout.addEventListener('click', () => this.handleLogout());
    }

    const btnExecute = document.getElementById('btn-execute-merge-sync');
    if (btnExecute) {
      btnExecute.addEventListener('click', () => this.handleExecuteMerge());
    }

    const btnLogs = document.getElementById('btn-toggle-sync-logs');
    if (btnLogs) {
      btnLogs.addEventListener('click', () => this.toggleSyncLogs());
    }

    const btnRefreshLogs = document.getElementById('btn-refresh-sync-logs');
    if (btnRefreshLogs) {
      btnRefreshLogs.addEventListener('click', () => this.loadSyncLogs());
    }

    const targetSelect = document.getElementById('admin-sync-target-select');
    if (targetSelect) {
      targetSelect.addEventListener('change', () => this.checkStatus());
    }
  }

  async openModal() {
    const modal = document.getElementById('modal-admin-sync');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');

    await this.checkStatus();
  }

  closeModal() {
    const modal = document.getElementById('modal-admin-sync');
    if (modal) {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
    }
  }

  async checkStatus() {
    try {
      const targetUrl = this.getTargetUrl();
      const resp = await fetch(`${targetUrl}?action=status`, { credentials: 'include' });
      if (resp.ok) {
        const data = await resp.json();
        this.csrfToken = data.csrfToken || '';
        if (data.authenticated) {
          this.showAuditSection();
          await this.loadAuditPreview();
        } else {
          this.showLoginSection();
        }
      }
    } catch (e) {
      console.warn('Sync status check failed:', e);
      this.showLoginSection();
    }
  }

  showLoginSection() {
    document.getElementById('admin-sync-login-section')?.classList.remove('hidden');
    document.getElementById('admin-sync-audit-section')?.classList.add('hidden');
    const errBox = document.getElementById('admin-sync-login-error');
    if (errBox) errBox.classList.add('hidden');
    const headerLogout = document.getElementById('btn-header-admin-logout');
    if (headerLogout) {
      headerLogout.classList.add('hidden');
      headerLogout.classList.remove('flex');
    }
  }

  showAuditSection() {
    document.getElementById('admin-sync-login-section')?.classList.add('hidden');
    document.getElementById('admin-sync-audit-section')?.classList.remove('hidden');
    const headerLogout = document.getElementById('btn-header-admin-logout');
    if (headerLogout) {
      headerLogout.classList.remove('hidden');
      headerLogout.classList.add('flex');
    }
  }

  async handleLogin() {
    const pwdInput = document.getElementById('admin-sync-password-input');
    const errBox = document.getElementById('admin-sync-login-error');
    const password = pwdInput ? pwdInput.value : '';

    if (!password) {
      if (errBox) {
        errBox.textContent = 'Please enter password.';
        errBox.classList.remove('hidden');
      }
      return;
    }

    try {
      const targetUrl = this.getTargetUrl();
      const resp = await fetch(targetUrl, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', password })
      });

      const data = await resp.json();
      if (resp.ok && data.success) {
        if (pwdInput) pwdInput.value = '';
        if (errBox) errBox.classList.add('hidden');
        this.csrfToken = data.csrfToken || '';
        this.showAuditSection();
        await this.loadAuditPreview();
      } else {
        if (errBox) {
          errBox.textContent = data.error || 'Authentication failed.';
          errBox.classList.remove('hidden');
        }
      }
    } catch (e) {
      if (errBox) {
        errBox.textContent = 'Network or server error during login.';
        errBox.classList.remove('hidden');
      }
    }
  }

  async handleLogout() {
    try {
      const targetUrl = this.getTargetUrl();
      await fetch(`${targetUrl}?action=logout`, { credentials: 'include' });
    } catch (e) {}
    if (window.propertyLinks) {
      window.propertyLinks._isAdminAuthenticated = false;
      if (window.propertyLinks.getFetchMode() === 'dev') {
        localStorage.setItem('homeward_fetch_mode', 'prod');
        const btnFetch = document.getElementById('btn-fetch-mode-toggle');
        if (btnFetch) {
          btnFetch.textContent = '☁️ Prod (Scrape.do)';
          btnFetch.className = 'font-bold text-[11px] px-2 py-0.5 rounded transition-all bg-sky-500/20 text-sky-300 border border-sky-500/40 hover:bg-sky-500/30';
        }
      }
    }
    this.showLoginSection();
    this.closeModal();
    if (window.propertyLinks && typeof window.propertyLinks._showToast === 'function') {
      window.propertyLinks._showToast('Logged out of Admin Session');
    }
  }

  _normalizeKey(input) {
    if (!input) return '';
    return String(input)
      .toLowerCase()
      .trim()
      .replace(/^https?:\/\/(www\.)?redfin\.com\//i, '')
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  _extractRedfinId(text) {
    if (!text) return '';
    const m = String(text).match(/\/home\/(\d+)/i);
    return m ? m[1] : '';
  }

  _extractHouseAndStreet(text) {
    if (!text) return '';
    let s = String(text).toLowerCase();
    if (s.includes('redfin.com')) {
      if (window.homewardApp && typeof window.homewardApp.parseRedfinUrlToAddress === 'function') {
        s = window.homewardApp.parseRedfinUrlToAddress(s);
      }
    }
    s = s.replace(/\bstreet\b/g, 'st')
         .replace(/\broad\b/g, 'rd')
         .replace(/\bplace\b/g, 'pl')
         .replace(/\bcourt\b/g, 'ct')
         .replace(/\bavenue\b/g, 'ave')
         .replace(/\bdrive\b/g, 'dr')
         .replace(/\blane\b/g, 'ln')
         .replace(/\bcircle\b/g, 'cir')
         .replace(/\bboulevard\b/g, 'blvd')
         .replace(/\b(north|south|east|west|n|s|e|w)\b/g, '');

    const m = s.match(/(\d+[a-z]?)\s+([a-z0-9\s]+)/);
    if (m) {
      const house = m[1];
      const street = m[2].trim().split(/\s+/).slice(0, 2).join('');
      return `${house}${street}`;
    }
    return s.replace(/[^a-z0-9]/g, '');
  }

  _normalizeAddress(text) {
    if (!text) return '';
    let s = String(text);
    if (s.includes('redfin.com')) {
      if (window.homewardApp && typeof window.homewardApp.parseRedfinUrlToAddress === 'function') {
        s = window.homewardApp.parseRedfinUrlToAddress(s);
      }
    }
    return s.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  _findMatchingRecordKey(recordsMap, itemInput, itemData) {
    const rId = this._extractRedfinId(itemInput) || this._extractRedfinId(itemData ? (itemData.url || itemData.redfinUrl) : '');
    const houseKey = this._extractHouseAndStreet(itemData ? itemData.address : itemInput);
    const nAddr = this._normalizeAddress(itemData ? itemData.address : itemInput);

    for (const [k, v] of Object.entries(recordsMap)) {
      const existingRid = v.redfin_id || this._extractRedfinId(v.url) || this._extractRedfinId(v.cache_key);
      const existingHouseKey = this._extractHouseAndStreet(v.address);
      const existingNaddr = this._normalizeAddress(v.address);

      if (rId && existingRid && rId === existingRid) return k;
      if (houseKey && existingHouseKey && houseKey === existingHouseKey) return k;
      if (nAddr && existingNaddr && nAddr === existingNaddr) return k;
    }
    return null;
  }

  _cleanNum(v) {
    if (v === undefined || v === null || v === '' || v === 0 || v === '0') return null;
    const cleaned = String(v).replace(/[^0-9.]/g, '');
    if (!cleaned) return null;
    const num = parseFloat(cleaned);
    return isNaN(num) || num <= 0 ? null : num;
  }

  async getLocalMergedRecords() {
    let records = [];
    try {
      const localResp = await fetch('/backend/sync-db.php?action=preview_sync');
      if (localResp.ok) {
        const localData = await localResp.json();
        records = localData.cleanRecords || localData.records || [];
      }
    } catch (e) {
      console.warn('Could not fetch local SQLite DB records:', e);
    }

    const recordsMap = {};
    records.forEach(r => {
      const key = r.cache_key || (r.address ? this._normalizeKey(r.address) : '');
      if (key) recordsMap[key] = { ...r };
    });

    // Merge in LocalStorage property cache updates & active tour stop updates
    try {
      const hasVal = (v) => v !== undefined && v !== null && v !== '' && v !== 0 && v !== '0';

      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('homeward_prop_cache_')) {
          try {
            const item = JSON.parse(localStorage.getItem(k));
            if (item && item.data && (item.input || item.data.address)) {
              const inputStr = item.input || item.data.address || '';
              const data = item.data;

              // Find if this item matches an existing DB record by Redfin ID or address
              const matchedKey = this._findMatchingRecordKey(recordsMap, inputStr, data);
              const targetKey = matchedKey || item.key || this._normalizeKey(inputStr);
              const existing = recordsMap[targetKey] || {};

              // Parse address cleanly if input is a Redfin URL
              let cleanAddr = data.address || existing.address || '';
              if ((!cleanAddr || cleanAddr.includes('redfin.com')) && inputStr.includes('redfin.com')) {
                if (window.homewardApp && typeof window.homewardApp.parseRedfinUrlToAddress === 'function') {
                  cleanAddr = window.homewardApp.parseRedfinUrlToAddress(inputStr);
                }
              }

              let effectiveUrl = hasVal(data.redfinUrl) ? data.redfinUrl : (hasVal(data.url) ? data.url : (hasVal(existing.url) ? existing.url : ''));
              if (!effectiveUrl && inputStr.includes('redfin.com')) effectiveUrl = inputStr;
              if (!effectiveUrl && window.propertyLinks && typeof window.propertyLinks.getRedfinUrl === 'function') {
                const generated = window.propertyLinks.getRedfinUrl(cleanAddr || inputStr);
                if (generated && generated.includes('redfin.com')) effectiveUrl = generated;
              }

              const merged = {
                ...existing,
                cache_key: targetKey,
                redfin_id: existing.redfin_id || this._extractRedfinId(inputStr) || this._extractRedfinId(data.url || data.redfinUrl),
                address: cleanAddr || existing.address || inputStr,
                url: effectiveUrl,
                price: this._cleanNum(data.price) || this._cleanNum(existing.price),
                sqft: this._cleanNum(data.sqft) || this._cleanNum(existing.sqft),
                lot_sqft: this._cleanNum(data.lotSize || data.lotSqFt) || this._cleanNum(existing.lot_sqft),
                hoa_fee: this._cleanNum(data.hoaNotes || data.hoaFee) || this._cleanNum(existing.hoa_fee),
                photo_url: hasVal(data.photoUrl) ? data.photoUrl : (hasVal(existing.photo_url) ? existing.photo_url : null),
                year_built: this._cleanNum(data.yearBuilt) || this._cleanNum(existing.year_built),
                created_at: existing.created_at || Math.floor(Date.now() / 1000)
              };

              // Only update existing matched records or insert new items that have valid price or sqft
              if (matchedKey || hasVal(merged.price) || hasVal(merged.sqft)) {
                recordsMap[targetKey] = merged;
              }
            }
          } catch (err) {}
        }
      }

      // Also merge active tour stops if present
      if (window.homewardApp && window.homewardApp.currentTour && Array.isArray(window.homewardApp.currentTour.stops)) {
        window.homewardApp.currentTour.stops.forEach(stop => {
          if (stop.address) {
            const inputStr = stop.address;
            const matchedKey = this._findMatchingRecordKey(recordsMap, inputStr, stop);
            const targetKey = matchedKey || this._normalizeKey(inputStr);
            const existing = recordsMap[targetKey] || {};

            let cleanAddr = stop.address || existing.address || '';
            if (cleanAddr.includes('redfin.com')) {
              if (window.homewardApp && typeof window.homewardApp.parseRedfinUrlToAddress === 'function') {
                cleanAddr = window.homewardApp.parseRedfinUrlToAddress(cleanAddr);
              }
            }

            let effectiveUrl = hasVal(stop.redfinUrl) ? stop.redfinUrl : (hasVal(existing.url) ? existing.url : '');
            if (!effectiveUrl && inputStr.includes('redfin.com')) effectiveUrl = inputStr;
            if (!effectiveUrl && window.propertyLinks && typeof window.propertyLinks.getRedfinUrl === 'function') {
              const generated = window.propertyLinks.getRedfinUrl(cleanAddr || inputStr);
              if (generated && generated.includes('redfin.com')) effectiveUrl = generated;
            }

            const merged = {
              ...existing,
              cache_key: targetKey,
              redfin_id: existing.redfin_id || this._extractRedfinId(stop.redfinUrl) || this._extractRedfinId(inputStr),
              address: cleanAddr || existing.address,
              url: effectiveUrl,
              price: this._cleanNum(stop.price) || this._cleanNum(existing.price),
              sqft: this._cleanNum(stop.sqft) || this._cleanNum(existing.sqft),
              lot_sqft: this._cleanNum(stop.lotSize) || this._cleanNum(existing.lot_sqft),
              hoa_fee: this._cleanNum(stop.hoaNotes) || this._cleanNum(existing.hoa_fee),
              photo_url: hasVal(stop.photoUrl) ? stop.photoUrl : (hasVal(existing.photo_url) ? existing.photo_url : null),
              year_built: this._cleanNum(stop.yearBuilt) || this._cleanNum(existing.year_built),
              created_at: existing.created_at || Math.floor(Date.now() / 1000)
            };

            // Only update existing matched records or insert new items that have valid price or sqft
            if (matchedKey || hasVal(merged.price) || hasVal(merged.sqft)) {
              recordsMap[targetKey] = merged;
            }
          }
        });
      }
    } catch (err) {
      console.warn('LocalStorage overlay merge error:', err);
    }

    return Object.values(recordsMap);
  }

  async loadAuditPreview() {
    const totalEl = document.getElementById('audit-stat-total');
    const cleanEl = document.getElementById('audit-stat-clean');
    const skippedEl = document.getElementById('audit-stat-skipped');
    const skippedList = document.getElementById('audit-skipped-list');
    const skippedContainer = document.getElementById('audit-skipped-details');

    if (totalEl) totalEl.textContent = '...';
    if (cleanEl) cleanEl.textContent = '...';
    if (skippedEl) skippedEl.textContent = '...';

    try {
      // Collect local DB + UI/LocalStorage records to audit
      const localRecords = await this.getLocalMergedRecords();

      // Send local records to target endpoint for Data Quality Audit
      const targetUrl = this.getTargetUrl();
      const resp = await fetch(targetUrl, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': this.csrfToken
        },
        body: JSON.stringify({
          action: 'preview_sync',
          csrf_token: this.csrfToken,
          records: localRecords
        })
      });

      if (resp.ok) {
        const data = await resp.json();
        this.cleanRecords = data.cleanRecords || [];
        this.skippedRecords = data.skippedRecords || [];

        if (totalEl) totalEl.textContent = data.totalScanned || 0;
        if (cleanEl) cleanEl.textContent = data.cleanCount || 0;
        if (skippedEl) skippedEl.textContent = data.skippedCount || 0;

        if (this.skippedRecords.length > 0 && skippedList && skippedContainer) {
          skippedContainer.classList.remove('hidden');
          skippedList.innerHTML = this.skippedRecords.map(item => `
            <div class="p-1.5 bg-rose-950/40 border border-rose-900/50 rounded text-rose-300">
              <span class="font-bold text-slate-200">${item.address || item.cache_key}</span>:
              <span class="text-rose-400">${item.reasons.join(', ')}</span>
            </div>
          `).join('');
        } else if (skippedContainer) {
          skippedContainer.classList.add('hidden');
        }
      } else {
        const errData = await resp.json().catch(() => null);
        console.warn('Audit preview failed:', resp.status, errData);
      }
    } catch (e) {
      console.warn('Failed to load audit preview:', e);
    }
  }

  async toggleSyncLogs() {
    const logSection = document.getElementById('admin-sync-log-section');
    if (!logSection) return;
    const isHidden = logSection.classList.contains('hidden');
    if (isHidden) {
      logSection.classList.remove('hidden');
      await this.loadSyncLogs();
    } else {
      logSection.classList.add('hidden');
    }
  }

  async loadSyncLogs() {
    const logContent = document.getElementById('admin-sync-log-content');
    if (logContent) logContent.textContent = '⏳ Loading merge audit history...';

    try {
      const targetUrl = this.getTargetUrl();
      const resp = await fetch(`${targetUrl}?action=get_sync_logs`, { credentials: 'include' });
      if (resp.ok) {
        const data = await resp.json();
        if (logContent) {
          logContent.textContent = data.log || 'No merge audit logs recorded yet.';
          logContent.scrollTop = logContent.scrollHeight;
        }
      } else {
        if (logContent) logContent.textContent = `Unable to fetch log (HTTP ${resp.status}).`;
      }
    } catch (e) {
      if (logContent) logContent.textContent = `Log fetch error: ${e.message || e}`;
    }
  }

  formatSyncTimestamp(serverTimeStr) {
    if (!serverTimeStr) return new Date().toLocaleString();
    try {
      const d = new Date(serverTimeStr);
      if (!isNaN(d.getTime())) {
        return d.toLocaleString(undefined, {
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: true,
          timeZoneName: 'short'
        });
      }
    } catch (e) {}
    return new Date().toLocaleString();
  }

  async handleExecuteMerge() {
    const resultBox = document.getElementById('admin-sync-result');
    const btnExecute = document.getElementById('btn-execute-merge-sync');

    if (btnExecute) {
      btnExecute.disabled = true;
      btnExecute.textContent = '⏳ Executing 2-Way Bidirectional Sync...';
    }

    try {
      const targetUrl = this.getTargetUrl();
      const isRemoteTarget = targetUrl.includes('nycto.ninja');

      // PHASE 1: Push clean local records to Target Server (e.g. Production)
      const pushResp = await fetch(targetUrl, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': this.csrfToken
        },
        body: JSON.stringify({
          action: 'execute_sync',
          csrf_token: this.csrfToken,
          records: this.cleanRecords
        })
      });

      const pushText = await pushResp.text();
      let pushData = null;
      try { pushData = JSON.parse(pushText); } catch (pErr) {}

      if (!pushResp.ok || !pushData || !pushData.success) {
        const errMsg = (pushData && pushData.error) ? pushData.error : (pushText ? pushText.substring(0, 300) : `HTTP ${pushResp.status}`);
        if (resultBox) {
          resultBox.className = 'text-xs p-3 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/40';
          resultBox.innerHTML = `❌ <strong>Push Sync Failed:</strong> ${errMsg}`;
          resultBox.classList.remove('hidden');
        }
        return;
      }

      // Also persist clean records (including UI edits) to Local SQLite DB
      if (isRemoteTarget && this.cleanRecords && this.cleanRecords.length > 0) {
        try {
          await fetch('/backend/sync-db.php', {
            method: 'POST',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'execute_sync', records: this.cleanRecords })
          });
        } catch (localUpdateErr) {
          console.warn('Local SQLite update warning:', localUpdateErr);
        }
      }

      let pulledCount = 0;
      let pulledInserted = 0;
      let pulledUpdated = 0;
      let pulledUnchanged = 0;

      // PHASE 2: If targeting Production, pull Production records down to Local DB
      if (isRemoteTarget && pushData.targetRecords && pushData.targetRecords.length > 0) {
        try {
          const pullResp = await fetch('/backend/sync-db.php', {
            method: 'POST',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              action: 'execute_sync',
              records: pushData.targetRecords
            })
          });
          if (pullResp.ok) {
            const pullData = await pullResp.json();
            pulledCount = pullData.mergedCount || 0;
            pulledInserted = pullData.insertedCount !== undefined ? pullData.insertedCount : 0;
            pulledUpdated = pullData.updatedCount !== undefined ? pullData.updatedCount : 0;
            pulledUnchanged = pullData.unchangedCount !== undefined ? pullData.unchangedCount : 0;
          }
        } catch (pullErr) {
          console.warn('Pull phase warning:', pullErr);
        }
      }

      const targetLabel = isRemoteTarget ? 'Production (nycto.ninja)' : 'Local Server';
      const syncTimestamp = this.formatSyncTimestamp(pushData.timestamp);

      const pushInserted = pushData.insertedCount !== undefined ? pushData.insertedCount : 0;
      const pushUpdated = pushData.updatedCount !== undefined ? pushData.updatedCount : 0;
      const pushUnchanged = pushData.unchangedCount !== undefined ? pushData.unchangedCount : 0;

      let pushDetailStr = '';
      if (pushData.mergedCount === 0) {
        pushDetailStr = 'Merged <strong>0</strong> clean records';
      } else {
        const parts = [];
        parts.push(`<strong>${pushInserted}</strong> new inserted`);
        if (pushUpdated > 0) {
          parts.push(`<strong>${pushUpdated}</strong> updated with missing fields/data`);
        } else {
          parts.push(`<strong>0</strong> updated`);
        }
        if (pushUnchanged > 0) {
          parts.push(`<strong>${pushUnchanged}</strong> unchanged`);
        }
        pushDetailStr = `Merged <strong>${pushData.mergedCount}</strong> clean records (${parts.join(', ')})`;
      }

      let pullDetailStr = '';
      if (pulledCount === 0) {
        pullDetailStr = 'Merged <strong>0</strong> production records into local cache.';
      } else {
        const pullParts = [];
        pullParts.push(`<strong>${pulledInserted}</strong> new pulled`);
        if (pulledUpdated > 0) {
          pullParts.push(`<strong>${pulledUpdated}</strong> updated existing`);
        }
        if (pulledUnchanged > 0) {
          pullParts.push(`<strong>${pulledUnchanged}</strong> already up to date`);
        } else if (pulledInserted === 0 && pulledUpdated === 0) {
          pullParts.push(`<strong>${pulledCount}</strong> already up to date`);
        }
        pullDetailStr = `Merged <strong>${pulledCount}</strong> production records into local cache (${pullParts.join(', ')}).`;
      }

      if (resultBox) {
        resultBox.className = 'text-xs p-3 rounded-lg bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 space-y-1';
        resultBox.innerHTML = `
          <div>✅ <strong>2-Way Bidirectional Sync Complete!</strong></div>
          <div class="text-[11px] text-emerald-200">
            • <strong>Pushed to ${targetLabel}:</strong> ${pushDetailStr} (${pushData.rejectedCount} test records rejected).<br>
            ${isRemoteTarget ? `• <strong>Pulled to Local DB:</strong> ${pullDetailStr}` : ''}
          </div>
          <div class="text-[11px] opacity-80 pt-1 border-t border-emerald-500/30 font-mono">🕒 <strong>Sync Timestamp:</strong> ${syncTimestamp}</div>
        `;
        resultBox.classList.remove('hidden');
      }

      if (window.propertyLinks && window.propertyLinks._showToast) {
        const toastPushText = pushUpdated > 0 ? `Pushed ${pushData.mergedCount} (${pushInserted} new, ${pushUpdated} updated)` : `Pushed ${pushData.mergedCount} (${pushInserted} new)`;
        const toastPullText = pulledUpdated > 0 ? `Pulled ${pulledCount} (${pulledInserted} new, ${pulledUpdated} updated)` : `Pulled ${pulledCount}`;
        window.propertyLinks._showToast(`2-Way Sync Complete! ${toastPushText} & ${toastPullText}.`);
      }

      // Refresh audit preview and logs
      await this.loadAuditPreview();
      await this.loadSyncLogs();

    } catch (e) {
      if (resultBox) {
        resultBox.className = 'text-xs p-3 rounded-lg bg-rose-500/20 text-rose-300 border border-rose-500/40';
        resultBox.innerHTML = `❌ <strong>Network Error:</strong> ${e.message || e}`;
        resultBox.classList.remove('hidden');
      }
    } finally {
      if (btnExecute) {
        btnExecute.disabled = false;
        btnExecute.textContent = '🔄 Execute 2-Way Bidirectional Sync';
      }
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.adminSyncManager = new AdminSyncManager();
});
