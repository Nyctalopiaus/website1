/**
 * Homeward Local Database Inspector Module
 * Allows dev users to view, search, inspect, delete, and clean records in property_cache.db.
 */
function openLocalDbModal() {
  const modal = document.getElementById('modal-local-db');
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    if (window.localDbViewer) {
      window.localDbViewer.loadRecords();
    }
  }
}

function closeLocalDbModal() {
  const modal = document.getElementById('modal-local-db');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

class LocalDbViewer {
  constructor() {
    this.allRecords = [];
    this.init();
  }

  isPrivateNetwork() {
    if (window.propertyLinks && typeof window.propertyLinks.isPrivateNetwork === 'function') {
      return window.propertyLinks.isPrivateNetwork();
    }
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local') || host.endsWith('.lan')) return true;
    if (/^10\./.test(host) || /^192\.168\./.test(host)) return true;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return true;
    return false;
  }

  init() {
    if (!this.isPrivateNetwork()) return;

    const btnView = document.getElementById('btn-view-local-db');
    if (btnView) {
      btnView.classList.remove('hidden');
      btnView.classList.add('flex');
    }

    const btnClose = document.getElementById('btn-close-local-db-modal');
    if (btnClose) {
      btnClose.addEventListener('click', () => closeLocalDbModal());
    }

    const btnRefresh = document.getElementById('btn-refresh-local-db');
    if (btnRefresh) {
      btnRefresh.addEventListener('click', () => this.loadRecords());
    }

    const btnClearStubs = document.getElementById('btn-clear-test-stubs');
    if (btnClearStubs) {
      btnClearStubs.addEventListener('click', () => this.clearTestStubs());
    }

    const searchInput = document.getElementById('local-db-search');
    if (searchInput) {
      searchInput.addEventListener('input', () => this.filterAndRender());
    }
  }

  async openModal() {
    openLocalDbModal();
  }

  closeModal() {
    closeLocalDbModal();
  }

  getMissingFields(row) {
    const missing = [];
    if (!row.price || Number(row.price) <= 0) missing.push('Price');
    if (row.beds === null || row.beds === undefined || row.beds === '') missing.push('Beds');
    if (row.baths === null || row.baths === undefined || row.baths === '') missing.push('Baths');
    if (row.sqft === null || row.sqft === undefined || row.sqft === '') missing.push('SqFt');
    if (row.year_built === null || row.year_built === undefined || row.year_built === '') missing.push('Year Built');
    if (!row.photo_url || row.photo_url.trim() === '') missing.push('Photo');
    return missing;
  }

  async loadRecords() {
    const tableBody = document.getElementById('local-db-table-body');
    const statusBar = document.getElementById('local-db-status-bar');
    if (tableBody) {
      tableBody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-slate-400">⏳ Loading local database records...</td></tr>`;
    }

    try {
      const resp = await fetch('/backend/sync-db.php?action=get_local_db_records');
      if (resp.ok) {
        const data = await resp.json();
        this.allRecords = data.records || [];

        const incompleteCount = this.allRecords.filter(r => !r.isValid || this.getMissingFields(r).length > 0).length;
        const badge = document.getElementById('local-db-badge');
        if (badge) {
          badge.textContent = incompleteCount > 0
            ? `${this.allRecords.length} Records (${incompleteCount} Incomplete)`
            : `${this.allRecords.length} Records`;
        }
        if (statusBar) statusBar.textContent = `Total Disk Size: ${data.fileSizeFormatted || 'Unknown'}`;

        this.filterAndRender();
      } else {
        if (tableBody) {
          tableBody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-rose-400">❌ Failed to load local DB records (HTTP ${resp.status}).</td></tr>`;
        }
      }
    } catch (e) {
      if (tableBody) {
        tableBody.innerHTML = `<tr><td colspan="7" class="p-6 text-center text-rose-400">❌ Network error loading local DB.</td></tr>`;
      }
    }
  }

  filterAndRender() {
    const searchInput = document.getElementById('local-db-search');
    const query = searchInput ? searchInput.value.toLowerCase().trim() : '';
    const tableBody = document.getElementById('local-db-table-body');
    const emptyMsg = document.getElementById('local-db-empty-msg');
    if (!tableBody) return;

    const filtered = this.allRecords.filter(row => {
      if (!query) return true;
      const addr = (row.address || '').toLowerCase();
      const key = (row.cache_key || '').toLowerCase();
      const url = (row.url || '').toLowerCase();
      return addr.includes(query) || key.includes(query) || url.includes(query);
    });

    if (filtered.length === 0) {
      tableBody.innerHTML = '';
      if (emptyMsg) emptyMsg.classList.remove('hidden');
      return;
    }

    if (emptyMsg) emptyMsg.classList.add('hidden');

    tableBody.innerHTML = filtered.map(row => {
      const priceStr = row.price ? `$${Number(row.price).toLocaleString()}` : '<span class="text-rose-400 font-semibold">No Price</span>';
      const bedsBaths = (row.beds || row.baths) ? `${row.beds || 0}b / ${row.baths || 0}b` : '<span class="text-slate-500">-</span>';
      const sqftStr = row.sqft ? `${Number(row.sqft).toLocaleString()} sqft` : '<span class="text-slate-500">-</span>';
      const yearStr = row.year_built || '<span class="text-slate-500">-</span>';

      const cachedDate = row.created_at ? new Date(row.created_at * 1000).toLocaleDateString(undefined, {
        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
      }) : 'Unknown';

      const missingFields = this.getMissingFields(row);
      let statusBadge = '';
      if (!row.isValid) {
        statusBadge = `<span class="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 text-[10px] font-semibold border border-rose-500/40" title="${(row.reasons || []).join(', ')}">⚠️ Test Stub / Invalid</span>`;
      } else if (missingFields.length > 0) {
        statusBadge = `<span class="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-semibold border border-amber-500/40" title="Missing fields: ${missingFields.join(', ')}">⚠️ Missing: ${missingFields.join(', ')}</span>`;
      } else {
        statusBadge = `<span class="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-semibold border border-emerald-500/40">✓ Complete</span>`;
      }

      const isMissing = missingFields.length > 0 || !row.isValid;
      const refreshBtnClass = isMissing
        ? 'bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-300 font-bold'
        : 'bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300';

      return `
        <tr class="hover:bg-slate-900/60 transition-all">
          <td class="p-3 font-sans">
            <div class="font-bold text-slate-200">${row.address || 'Unknown Address'} ${statusBadge}</div>
            <div class="text-[10px] text-slate-400 font-mono truncate max-w-xs">${row.cache_key}</div>
          </td>
          <td class="p-3 text-slate-200 font-semibold font-sans">${priceStr}</td>
          <td class="p-3 text-slate-300 font-sans">${bedsBaths}</td>
          <td class="p-3 text-slate-300 font-sans">${sqftStr}</td>
          <td class="p-3 text-slate-300 font-sans">${yearStr}</td>
          <td class="p-3 text-slate-400 text-[11px] font-sans">${cachedDate}</td>
          <td class="p-3 text-right">
            <div class="flex items-center justify-end gap-1.5">
              ${row.url ? `<button onclick="window.localDbViewer.refreshRecord('${(row.url || '').replace(/'/g, "\\'")}', this)" class="px-2 py-1 rounded ${refreshBtnClass} text-[11px] transition-all flex items-center gap-1" title="Re-fetch & parse live Redfin listing to populate missing fields">🔄 Refresh Data</button>` : ''}
              ${row.url ? `<button onclick="window.localDbViewer.copyUrl('${(row.url || '').replace(/'/g, "\\'")}', this)" class="px-2 py-1 rounded bg-sky-950/60 hover:bg-sky-900 border border-sky-800/60 text-sky-300 text-[11px] font-medium transition-all flex items-center gap-1" title="Copy Redfin URL & Auto-fill Scouting Input">📋 Copy URL</button>` : ''}
              ${row.url ? `<a href="${row.url}" target="_blank" class="p-1 px-1.5 rounded bg-slate-800 hover:bg-slate-700 text-sky-400 text-[11px]" title="Open Redfin Listing">🔗</a>` : ''}
              <button onclick="window.localDbViewer.deleteRecord('${(row.cache_key || '').replace(/'/g, "\\'")}')" class="p-1 px-1.5 rounded bg-rose-950/50 hover:bg-rose-900 text-rose-300 text-[11px]" title="Delete Record">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  async refreshRecord(url, btnEl) {
    if (!url) {
      alert('Cannot refresh: Record has no Redfin URL.');
      return;
    }

    if (btnEl) {
      btnEl.disabled = true;
      btnEl.innerHTML = '⏳ Scraping...';
    }

    try {
      const devParam = this.isPrivateNetwork() ? '&mode=dev' : '';
      const lookupUrl = `/backend/property-lookup.php?url=${encodeURIComponent(url)}&force=1${devParam}`;

      const resp = await fetch(lookupUrl);
      const data = await resp.json();

      if (resp.ok && !data.error) {
        if (window.storageManager) {
          if (data.address) {
            const k1 = window.storageManager._normalizeCacheKey(data.address);
            if (k1) localStorage.removeItem(`homeward_prop_cache_${k1}`);
          }
          if (url) {
            const k2 = window.storageManager._normalizeCacheKey(url);
            if (k2) localStorage.removeItem(`homeward_prop_cache_${k2}`);
          }
        }
        if (window.propertyLinks && typeof window.propertyLinks._showToast === 'function') {
          window.propertyLinks._showToast(`Refreshed ${data.address || 'property'}! Updated local DB cache.`);
        }
        await this.loadRecords();
      } else {
        const errMsg = data.error || `HTTP ${resp.status}`;
        alert(`Property refresh failed: ${errMsg}`);
      }
    } catch (e) {
      alert(`Network error during refresh: ${e.message || e}`);
    } finally {
      if (btnEl) {
        btnEl.disabled = false;
        btnEl.innerHTML = '🔄 Refresh Data';
      }
    }
  }

  async copyUrl(url, btnEl) {
    if (!url) return;

    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = url;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }

      // Auto-fill into scouting site entry input if present
      const addInput = document.getElementById('input-add-address');
      if (addInput) {
        addInput.value = url;
        addInput.focus();
      }

      // Visual feedback on button
      if (btnEl) {
        const origContent = btnEl.innerHTML;
        btnEl.innerHTML = '✓ Copied!';
        btnEl.classList.remove('bg-sky-950/60', 'text-sky-300', 'border-sky-800/60');
        btnEl.classList.add('bg-emerald-950/80', 'text-emerald-300', 'border-emerald-700');
        setTimeout(() => {
          btnEl.innerHTML = origContent;
          btnEl.classList.remove('bg-emerald-950/80', 'text-emerald-300', 'border-emerald-700');
          btnEl.classList.add('bg-sky-950/60', 'text-sky-300', 'border-sky-800/60');
        }, 2000);
      }

      if (window.propertyLinks && typeof window.propertyLinks._showToast === 'function') {
        window.propertyLinks._showToast('Copied Redfin URL to clipboard & auto-filled Scouting input!');
      }
    } catch (e) {
      console.warn('Copy Redfin URL failed:', e);
    }
  }

  async deleteRecord(cacheKey) {
    if (!confirm('Are you sure you want to delete this record from local property_cache.db?')) return;
    try {
      const resp = await fetch('/backend/sync-db.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete_local_db_record', cache_key: cacheKey })
      });
      if (resp.ok) {
        await this.loadRecords();
        if (window.propertyLinks && window.propertyLinks._showToast) {
          window.propertyLinks._showToast('Deleted record from local DB');
        }
      }
    } catch (e) {
      console.warn('Delete failed:', e);
    }
  }

  async clearTestStubs() {
    if (!confirm('Clear all incomplete / test stub records from local property_cache.db?')) return;
    try {
      const resp = await fetch('/backend/sync-db.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear_test_stubs' })
      });
      if (resp.ok) {
        const data = await resp.json();
        await this.loadRecords();
        if (window.propertyLinks && window.propertyLinks._showToast) {
          window.propertyLinks._showToast(`Cleared ${data.deletedCount || 0} test stubs from local DB`);
        }
      }
    } catch (e) {
      console.warn('Clear test stubs failed:', e);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.localDbViewer = new LocalDbViewer();
});
