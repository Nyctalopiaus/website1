/**
 * BuildRoute Property Links & Media Utility
 * Generates direct Redfin, Zillow, and Street View search URLs,
 * and manages photo attachment & URL handling.
 */
class PropertyLinks {
  constructor() {
    this._initRedfinCopyDelegate();
    const initFn = () => {
      this.initDevToolsDropdown();
      this.initFetchModeToggle();
      this.initBookmarkletLinks();
    };
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initFn);
    } else {
      initFn();
    }
  }

  initBookmarkletLinks() {
    const BOOKMARKLET_CODE = `javascript:(function(){var u=window.location.href,s=['redfin.com','zillow.com','realtor.com','homes.com','trulia.com'];if(!s.some(function(d){return u.includes(d);}))return alert('Please run this bookmarklet while viewing a property listing on Redfin, Zillow, Realtor.com, or Homes.com.');try{if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(u);}else{var c=document.createElement('textarea');c.value=u;document.body.appendChild(c);c.select();document.execCommand('copy');c.remove();}}catch(e){}function b64(str){return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,function(m,p1){return String.fromCharCode('0x'+p1);}));}var w=window.open('about:blank','nycto_import','width=460,height=340,resizable=yes,scrollbars=no');var f=document.createElement('form');f.method='POST';f.action='https://nycto.ninja/backend/import-property.php';f.target='nycto_import';var iU=document.createElement('input');iU.type='hidden';iU.name='url';iU.value=u;f.appendChild(iU);var iH=document.createElement('input');iH.type='hidden';iH.name='html';iH.value=b64(document.documentElement.outerHTML);f.appendChild(iH);document.body.appendChild(f);f.submit();setTimeout(function(){f.remove();},1000);})();`;

    ['bookmarklet-link', 'header-bookmarklet-link'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.href = BOOKMARKLET_CODE;
    });

    const codeText = document.getElementById('bookmarklet-code-text');
    if (codeText) codeText.value = BOOKMARKLET_CODE;
  }

  // Redfin Direct Listing URL (if one has been saved) or Redfin's own
  // homepage as a fallback for a manual search.
  //
  // Why not a direct search-by-address URL: Redfin has no public URL
  // format for that. Their search bar is entirely JS-driven — typing an
  // address calls a private, session-gated endpoint
  // (stingray/do/location-autocomplete) that has no CORS headers (blocked
  // from any other site's JS) and is blocked outright for non-browser
  // requests by their bot protection (confirmed: returns 403 outside a
  // real browser session). There's also no query-string/prefill hook on
  // redfin.com's homepage to pass an address in via a plain link. So an
  // external link can only land straight on the correct listing if we
  // already know Redfin's internal listing URL.
  //
  // Given that, this opens Redfin itself (never Google) and pairs it with
  // copyAddressForRedfin()/the data-redfin-copy-address delegate below, so
  // the address is on the clipboard ready to paste into Redfin's search
  // bar — that resolves to the exact listing in one paste + enter.
  getRedfinUrl(addressOrUrl) {
    if (!addressOrUrl) return '#';
    const trimmed = addressOrUrl.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }

    const parts = trimmed.split(',').map(p => p.trim());
    if (parts.length >= 3) {
      const street = parts[0].replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      const city = parts[1].replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');

      let stateCode = 'CO';
      const stateMatch = parts[2].match(/\b([A-Za-z]{2})\b/);
      const statePart = parts[2].toLowerCase();
      if (stateMatch && !['co', 'us', 'st'].includes(stateMatch[1].toLowerCase())) {
        stateCode = stateMatch[1].toUpperCase();
      } else if (statePart.includes('texas') || statePart === 'tx') stateCode = 'TX';
      else if (statePart.includes('california') || statePart === 'ca') stateCode = 'CA';
      else if (statePart.includes('florida') || statePart === 'fl') stateCode = 'FL';
      else if (parts[2].trim().length === 2) stateCode = parts[2].trim().toUpperCase();

      let zipPart = parts[3] ? parts[3].replace(/[^0-9]/g, '') : '';
      if (!zipPart && parts[2].match(/\d{5}/)) zipPart = parts[2].match(/\d{5}/)[0];

      return `https://www.redfin.com/${stateCode}/${city}/${street}${zipPart ? '-' + zipPart : ''}`;
    }

    return `https://www.redfin.com/search#query=${encodeURIComponent(trimmed)}`;
  }

  // True when getRedfinUrl() had to fall back to the Redfin homepage
  // (i.e. no saved direct listing URL for this stop), meaning the caller
  // should offer to copy the address to the clipboard.
  needsRedfinAddressCopy(addressOrUrl) {
    if (!addressOrUrl) return false;
    const trimmed = addressOrUrl.trim();
    return !(trimmed.startsWith('http://') || trimmed.startsWith('https://'));
  }

  // Returns an HTML attribute (or '') to splice into a Redfin <a> tag.
  // When present, clicking the link copies the address via the delegated
  // listener set up in the constructor.
  getRedfinCopyAttr(addressOrUrl) {
    if (!this.needsRedfinAddressCopy(addressOrUrl)) return '';
    const addr = addressOrUrl.trim();
    return ` data-redfin-copy-address="${this._escapeAttr(addr)}" title="Opens Redfin and copies this address so you can paste it into Redfin's search bar"`;
  }

  // Copies an address to the clipboard and shows a brief confirmation toast.
  async copyAddressForRedfin(address) {
    if (!address) return;
    const text = address.trim();
    let copied = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        copied = true;
      }
    } catch (err) {
      copied = false;
    }
    if (!copied) {
      copied = this._legacyCopy(text);
    }
    if (copied) {
      this._showToast("Address copied — paste into Redfin's search bar to find the listing.");
    }
  }

  _legacyCopy(text) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch (err) {
      return false;
    }
  }

  _showToast(message) {
    const existing = document.getElementById('property-links-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'property-links-toast';
    toast.textContent = message;
    toast.style.cssText = `
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
      background: #0f172a; color: #e2e8f0; border: 1px solid #334155;
      padding: 10px 16px; border-radius: 10px; font-size: 13px; font-weight: 600;
      z-index: 9999; box-shadow: 0 10px 25px rgba(0,0,0,0.35); max-width: 90vw;
      text-align: center; pointer-events: none;
    `;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3200);
  }

  _escapeAttr(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  // Delegated click handler: any element with data-redfin-copy-address
  // copies that address to the clipboard when clicked. Delegated on
  // document so it works for links rendered/re-rendered after this file loads.
  _initRedfinCopyDelegate() {
    document.addEventListener('click', (e) => {
      const el = e.target.closest && e.target.closest('[data-redfin-copy-address]');
      if (el) {
        this.copyAddressForRedfin(el.getAttribute('data-redfin-copy-address'));
      }
    });
  }

  // Zillow Search URL
  getZillowUrl(addressStr) {
    if (!addressStr) return '#';
    const cleanAddr = addressStr.trim().replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '-');
    return `https://www.zillow.com/homes/${cleanAddr}_rb/`;
  }

  // Realtor.com Search URL
  getRealtorUrl(addressStr) {
    if (!addressStr) return '#';
    const cleanAddr = encodeURIComponent(addressStr.trim());
    return `https://www.realtor.com/realestateandhomes-search/${cleanAddr}`;
  }

  // Google Maps Single Place / Direct Address Link
  getGoogleMapsUrl(addressStr, lat = null, lng = null) {
    if (!addressStr && (!lat || !lng)) return '#';
    const trimmed = addressStr ? addressStr.trim() : '';
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed;
    }
    if (lat && lng) {
      return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
    }
    const cleanAddr = encodeURIComponent(trimmed);
    return `https://www.google.com/maps/search/?api=1&query=${cleanAddr}`;
  }

  // Google Maps / Street View Panorama Link
  getStreetViewUrl(lat, lng, addressStr) {
    if (lat && lng) {
      return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat},${lng}`;
    }
    const cleanAddr = encodeURIComponent(addressStr || '');
    return `https://www.google.com/maps/search/?api=1&query=${cleanAddr}`;
  }

  // Google Maps Multi-Stop Driving Navigation URL
  getMultiStopDrivingUrl(startAddress, orderedStops, loopBack) {
    if (!orderedStops || orderedStops.length === 0) return '#';

    const origin = encodeURIComponent(startAddress || orderedStops[0].address);
    let destination = encodeURIComponent(orderedStops[orderedStops.length - 1].address);

    if (loopBack) {
      destination = origin;
    }

    let waypoints = [];
    if (loopBack) {
      // All stops are waypoints
      waypoints = orderedStops.map(s => encodeURIComponent(s.address));
    } else if (orderedStops.length > 1) {
      // Middle stops are waypoints
      waypoints = orderedStops.slice(0, orderedStops.length - 1).map(s => encodeURIComponent(s.address));
    }

    let url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}`;
    if (waypoints.length > 0) {
      url += `&waypoints=${waypoints.join('|')}`;
    }

    return url;
  }

  // Returns true if the app is being accessed over a local / private network host
  isPrivateNetwork() {
    const host = window.location.hostname;
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.local') || host.endsWith('.lan')) return true;
    if (/^10\./.test(host) || /^192\.168\./.test(host)) return true;
    if (/^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)) return true;
    return false;
  }

  // Returns 'dev' or 'prod'. Always defaults to 'prod' if not on a private network.
  getFetchMode() {
    if (!this.isPrivateNetwork()) return 'prod';
    return localStorage.getItem('homeward_fetch_mode') || 'dev';
  }

  async checkAdminStatus() {
    if (this._isAdminAuthenticated) {
      this.updateHeaderLogoutUI(true);
      return true;
    }
    const endpoints = ['/backend/sync-db.php?action=status', 'https://nycto.ninja/backend/sync-db.php?action=status'];
    for (const url of endpoints) {
      try {
        const resp = await fetch(url, { credentials: 'include' });
        if (resp.ok) {
          const data = await resp.json();
          if (data && data.authenticated) {
            this._isAdminAuthenticated = true;
            this.updateHeaderLogoutUI(true);
            return true;
          }
        }
      } catch (e) {}
    }
    this.updateHeaderLogoutUI(false);
    return false;
  }

  updateHeaderLogoutUI(show) {
    const btnHeaderLogout = document.getElementById('btn-header-admin-logout');
    if (btnHeaderLogout) {
      if (show) {
        btnHeaderLogout.classList.remove('hidden');
        btnHeaderLogout.classList.add('flex');
      } else {
        btnHeaderLogout.classList.add('hidden');
        btnHeaderLogout.classList.remove('flex');
      }
    }
  }

  async verifyDevAdminPassword(password) {
    const endpoints = ['/backend/sync-db.php', 'https://nycto.ninja/backend/sync-db.php'];
    for (const url of endpoints) {
      try {
        const resp = await fetch(url, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'login', password })
        });
        if (resp.ok) {
          const data = await resp.json();
          if (data && data.success) {
            this._isAdminAuthenticated = true;
            this.updateHeaderLogoutUI(true);
            return true;
          }
        }
      } catch (e) {}
    }
    return false;
  }

  promptDevAuthModal(callback) {
    const modal = document.getElementById('modal-dev-auth');
    const pwdInput = document.getElementById('dev-auth-password-input');
    const errBox = document.getElementById('dev-auth-error-msg');
    const btnSubmit = document.getElementById('btn-submit-dev-auth');
    const btnCancel = document.getElementById('btn-cancel-dev-auth');
    const btnClose = document.getElementById('btn-close-dev-auth-modal');

    if (!modal) {
      const pwd = prompt('Enter Admin Password to enable Dev Mode:');
      if (pwd) {
        this.verifyDevAdminPassword(pwd).then(valid => callback(valid));
      } else {
        callback(false);
      }
      return;
    }

    if (errBox) errBox.classList.add('hidden');
    if (pwdInput) pwdInput.value = '';

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    setTimeout(() => pwdInput && pwdInput.focus(), 50);

    const closeModal = (success = false) => {
      modal.classList.add('hidden');
      modal.classList.remove('flex');
      cleanup();
      callback(success);
    };

    const handleAuthenticate = async () => {
      const password = pwdInput ? pwdInput.value.trim() : '';
      if (!password) {
        if (errBox) {
          errBox.textContent = 'Please enter the admin password.';
          errBox.classList.remove('hidden');
        }
        return;
      }

      if (btnSubmit) btnSubmit.disabled = true;
      const valid = await this.verifyDevAdminPassword(password);
      if (btnSubmit) btnSubmit.disabled = false;

      if (valid) {
        closeModal(true);
      } else {
        if (errBox) {
          errBox.textContent = 'Invalid admin password. Access denied.';
          errBox.classList.remove('hidden');
        }
      }
    };

    const onKeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAuthenticate();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeModal(false);
      }
    };

    const onCancel = () => closeModal(false);

    const cleanup = () => {
      if (btnSubmit) btnSubmit.removeEventListener('click', handleAuthenticate);
      if (btnCancel) btnCancel.removeEventListener('click', onCancel);
      if (btnClose) btnClose.removeEventListener('click', onCancel);
      if (pwdInput) pwdInput.removeEventListener('keydown', onKeydown);
    };

    if (btnSubmit) btnSubmit.addEventListener('click', handleAuthenticate);
    if (btnCancel) btnCancel.addEventListener('click', onCancel);
    if (btnClose) btnClose.addEventListener('click', onCancel);
    if (pwdInput) pwdInput.addEventListener('keydown', onKeydown);
  }

  initDevToolsDropdown() {
    if (!this.isPrivateNetwork()) return;
    const dropdownContainer = document.getElementById('dev-tools-dropdown-container');
    const trigger = document.getElementById('btn-dev-tools-trigger');
    const panel = document.getElementById('dev-tools-panel');
    const chevron = document.getElementById('chevron-dev-tools');
    if (!dropdownContainer || !trigger || !panel) return;

    dropdownContainer.classList.remove('hidden');

    const togglePanel = (e) => {
      e.stopPropagation();
      const isOpen = !panel.classList.contains('hidden');
      if (isOpen) {
        panel.classList.add('hidden');
        panel.classList.remove('flex');
        if (chevron) chevron.style.transform = 'rotate(0deg)';
      } else {
        panel.classList.remove('hidden');
        panel.classList.add('flex');
        if (chevron) chevron.style.transform = 'rotate(180deg)';
      }
    };

    const closePanel = () => {
      panel.classList.add('hidden');
      panel.classList.remove('flex');
      if (chevron) chevron.style.transform = 'rotate(0deg)';
    };

    trigger.addEventListener('click', togglePanel);

    document.addEventListener('click', (e) => {
      if (!dropdownContainer.contains(e.target)) closePanel();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closePanel();
    });

    panel.addEventListener('click', (e) => {
      if (e.target.closest('#btn-admin-sync') || e.target.closest('#btn-view-local-db') || e.target.closest('#btn-header-admin-logout')) {
        closePanel();
      }
    });
  }

  async initFetchModeToggle() {
    if (!this.isPrivateNetwork()) return;
    const container = document.getElementById('fetch-mode-toggle-container');
    const btn = document.getElementById('btn-fetch-mode-toggle');
    if (!container || !btn) return;

    container.classList.remove('hidden');
    container.classList.add('flex');

    const storedMode = localStorage.getItem('homeward_fetch_mode') || 'prod';
    if (storedMode === 'dev') {
      const isAdmin = await this.checkAdminStatus();
      if (!isAdmin) {
        localStorage.setItem('homeward_fetch_mode', 'prod');
      }
    }

    const updateUI = () => {
      const mode = this.getFetchMode();
      if (mode === 'dev') {
        btn.textContent = '⚡ Dev Mode';
        btn.className = 'font-bold text-[11px] px-2 py-0.5 rounded transition-all bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30';
        btn.title = 'Dev Mode Active: Local development environment.';
      } else {
        btn.textContent = '☁️ Prod Mode';
        btn.className = 'font-bold text-[11px] px-2 py-0.5 rounded transition-all bg-sky-500/20 text-sky-300 border border-sky-500/40 hover:bg-sky-500/30';
        btn.title = 'Prod Mode Active: Production environment.';
      }
    };

    btn.addEventListener('click', async () => {
      const currentMode = this.getFetchMode();
      if (currentMode === 'dev') {
        localStorage.setItem('homeward_fetch_mode', 'prod');
        updateUI();
        this._showToast('Switched to Prod Mode');
        return;
      }

      const isAdmin = await this.checkAdminStatus();
      if (isAdmin) {
        localStorage.setItem('homeward_fetch_mode', 'dev');
        updateUI();
        this._showToast('Switched to Dev Mode');
        return;
      }

      this.promptDevAuthModal((success) => {
        if (success) {
          localStorage.setItem('homeward_fetch_mode', 'dev');
          updateUI();
          this._showToast('Authenticated! Switched to Dev Mode');
        }
      });
    });

    updateUI();
  }

  // Fetch listing specs, price & high-res photo via the shared
  // backend/property-lookup.php endpoint (used by mortgage-calculator too).
  // That endpoint holds its own 7-day server-side cache.
  async fetchRedfinMetadata(redfinUrlOrAddress, force = false, attempt = 1) {
    if (!redfinUrlOrAddress) return null;
    let url = redfinUrlOrAddress.trim();
    
    // If input is a street address, auto-construct the Redfin listing URL slug
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      const parts = url.split(',').map(p => p.trim());
      if (parts.length >= 3) {
        const street = parts[0].replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-');
        const city = parts[1].replace(/[^a-zA-Z0-9]/g, '-').replace(/-+/g, '-');
        const statePart = parts[2].toLowerCase();
        let stateCode = 'CO';
        if (statePart.includes('texas') || statePart === 'tx') stateCode = 'TX';
        else if (statePart.includes('california') || statePart === 'ca') stateCode = 'CA';
        else if (statePart.includes('florida') || statePart === 'fl') stateCode = 'FL';
        else if (parts[2].trim().length === 2) stateCode = parts[2].trim().toUpperCase();

        let zipPart = parts[3] ? parts[3].replace(/[^0-9]/g, '') : '';
        if (!zipPart && parts[2].match(/\d{5}/)) zipPart = parts[2].match(/\d{5}/)[0];

        url = `https://www.redfin.com/${stateCode}/${city}/${street}${zipPart ? '-' + zipPart : ''}`;
      } else {
        return null;
      }
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 75000);

      const fetchMode = this.getFetchMode();
      const modeParam = fetchMode === 'dev' ? '&mode=dev' : '';
      const proxyUrl = `/backend/property-lookup.php?url=${encodeURIComponent(url)}${force ? '&force=1' : ''}${modeParam}`;
      const resp = await fetch(proxyUrl, { signal: controller.signal });
      clearTimeout(timeoutId);

      const data = await resp.json().catch(() => null);

      if (data && !data.error && data.price) {
        let parsedLotSize = null;
        const rawLot = data.lotSizeLabel || data.lotSize || data.lotSqFt;
        if (rawLot) {
          if (typeof rawLot === 'number') {
            parsedLotSize = rawLot >= 43560 ? `${(rawLot / 43560).toFixed(2)} Acres` : `${rawLot.toLocaleString()} sq ft`;
          } else {
            const str = String(rawLot).trim();
            const num = parseFloat(str.replace(/,/g, ''));
            if (!isNaN(num) && !str.toLowerCase().includes('sq ft') && !str.toLowerCase().includes('acre')) {
              parsedLotSize = num >= 43560 ? `${(num / 43560).toFixed(2)} Acres` : `${Math.round(num).toLocaleString()} sq ft`;
            } else {
              parsedLotSize = str;
            }
          }
        }

        const result = {
          redfinUrl: data.url || data.redfinUrl || (data.redfinId ? `https://www.redfin.com/home/${data.redfinId}` : null),
          url: data.url || null,
          provider: data.provider || null,
          price: data.price ? (typeof data.price === 'number' ? `$${data.price.toLocaleString()}` : data.price) : null,
          photoUrl: data.photoUrl || data.imageUrl || data.primaryPhotoUrl || data.mainPhoto || null,
          lotSize: parsedLotSize,
          hoaNotes: (data.hoaFee !== undefined && data.hoaFee !== null) ? (data.hoaFee > 0 ? `$${data.hoaFee}/mo HOA` : 'No HOA ($0)') : (data.hoaDues ? `$${data.hoaDues}/mo` : null),
          beds: data.beds || null,
          baths: data.baths || null,
          sqft: data.sqft ? (typeof data.sqft === 'number' ? `${data.sqft.toLocaleString()} sq ft` : (String(data.sqft).includes('sq ft') ? data.sqft : `${data.sqft} sq ft`)) : null,
          yearBuilt: data.yearBuilt || null
        };

        // Save fetched data into 7-Day Property Cache DB
        if (window.storageManager && (result.price || result.hoaNotes || result.photoUrl)) {
          window.storageManager.setCachedProperty(redfinUrlOrAddress, result);
        }

        if (attempt > 1) {
          this._showToast('⚡ Auto-Detect recovered after rate-limit backoff!');
        }

        return result;
      } else if (data && data.rateLimited && attempt < 3) {
        const delaySec = attempt === 1 ? 6 : 12;
        this._showToast(`⚠️ Redfin rate-limited this address. Retrying in ${delaySec}s (attempt ${attempt} of 2)...`);
        await new Promise(res => setTimeout(res, delaySec * 1000));
        return await this.fetchRedfinMetadata(redfinUrlOrAddress, force, attempt + 1);
      } else {
        const errMsg = (data && data.error) ? data.error : 'Property not found in cache. Click the 🔖 Bookmarklet button to import it from your browser!';
        this.openBookmarkletNeededModal(errMsg);
        return null;
      }
    } catch (e) {
      console.warn('Property proxy fetch error:', e);
      this.openBookmarkletNeededModal('Property not found in cache. Click the 🔖 Bookmarklet button to import it from your browser!');
    }
    return null;
  }

  // Alias fetchPropertyMetadata to fetchRedfinMetadata for backward compatibility
  async fetchPropertyMetadata(urlOrAddress, force = false) {
    return await this.fetchRedfinMetadata(urlOrAddress, force);
  }

  getProviderLabel(url = '', provider = '') {
    const p = (provider || '').toLowerCase();
    if (p === 'redfin') return 'Redfin';
    if (p === 'zillow' || p === 'trulia') return 'Zillow';
    if (p === 'realtor') return 'Realtor.com';
    if (p === 'homes') return 'Homes.com';

    const u = (url || '').toLowerCase();
    if (u.includes('redfin.com')) return 'Redfin';
    if (u.includes('zillow.com') || u.includes('trulia.com')) return 'Zillow';
    if (u.includes('realtor.com')) return 'Realtor.com';
    if (u.includes('homes.com')) return 'Homes.com';

    return 'Listing';
  }

  openBookmarkletModal() {
    const modal = document.getElementById('modal-bookmarklet');
    const bookmarkletLink = document.getElementById('bookmarklet-link');
    const headerBookmarkletLink = document.getElementById('header-bookmarklet-link');
    const bookmarkletCodeText = document.getElementById('bookmarklet-code-text');
    const BOOKMARKLET_CODE = `javascript:(function(){var u=window.location.href,s=['redfin.com','zillow.com','realtor.com','homes.com','trulia.com'];if(!s.some(function(d){return u.includes(d);}))return alert('Please run this bookmarklet while viewing a property listing on Redfin, Zillow, Realtor.com, or Homes.com.');try{if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(u);}else{var c=document.createElement('textarea');c.value=u;document.body.appendChild(c);c.select();document.execCommand('copy');c.remove();}}catch(e){}function b64(str){return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,function(m,p1){return String.fromCharCode('0x'+p1);}));}var w=window.open('about:blank','nycto_import','width=460,height=340,resizable=yes,scrollbars=no');var f=document.createElement('form');f.method='POST';f.action='https://nycto.ninja/backend/import-property.php';f.target='nycto_import';var iU=document.createElement('input');iU.type='hidden';iU.name='url';iU.value=u;f.appendChild(iU);var iH=document.createElement('input');iH.type='hidden';iH.name='html';iH.value=b64(document.documentElement.outerHTML);f.appendChild(iH);document.body.appendChild(f);f.submit();setTimeout(function(){f.remove();},1000);})();`;

    if (bookmarkletLink) bookmarkletLink.href = BOOKMARKLET_CODE;
    if (headerBookmarkletLink) headerBookmarkletLink.href = BOOKMARKLET_CODE;
    if (bookmarkletCodeText) bookmarkletCodeText.value = BOOKMARKLET_CODE;

    if (modal) {
      modal.style.setProperty('display', 'flex', 'important');
      modal.classList.remove('hidden');
      modal.setAttribute('aria-hidden', 'false');
    }
  }

  closeBookmarkletModal() {
    const modal = document.getElementById('modal-bookmarklet');
    if (modal) {
      modal.style.setProperty('display', 'none', 'important');
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  openBookmarkletNeededModal(messageText) {
    const modal = document.getElementById('modal-bookmarklet-needed');
    const msgEl = document.getElementById('bookmarklet-needed-modal-message');
    if (modal) {
      if (msgEl && messageText) {
        msgEl.textContent = messageText;
      }
      modal.style.setProperty('display', 'flex', 'important');
      modal.classList.remove('hidden');
      modal.setAttribute('aria-hidden', 'false');
    }
  }

  closeBookmarkletNeededModal() {
    const modal = document.getElementById('modal-bookmarklet-needed');
    if (modal) {
      modal.style.setProperty('display', 'none', 'important');
      modal.classList.add('hidden');
      modal.setAttribute('aria-hidden', 'true');
    }
  }

  checkRecentImportBanner() {
    const banner = document.getElementById('recent-import-banner');
    const addrEl = document.getElementById('recent-import-address');
    if (!banner || !addrEl) return;

    try {
      const raw = localStorage.getItem('nycto_recent_imported_property');
      if (!raw) {
        banner.classList.add('hidden');
        return;
      }

      const data = JSON.parse(raw);
      const ageMs = Date.now() - (data.ts || 0);

      // Only show if imported within the last 2 hours
      if (data.url && ageMs < 2 * 60 * 60 * 1000) {
        const providerLabel = this.getProviderLabel(data.url, data.provider);
        const priceText = data.price ? ` ($${Number(data.price).toLocaleString()})` : '';
        addrEl.textContent = `${data.address || 'Property'}${priceText} • ${providerLabel}`;
        banner.classList.remove('hidden');
      } else {
        banner.classList.add('hidden');
      }
    } catch (e) {
      banner.classList.add('hidden');
    }
  }
}

window.propertyLinks = new PropertyLinks();
