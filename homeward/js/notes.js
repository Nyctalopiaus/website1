/**
 * BuildRoute Inspection Notebook & Notes Module
 * Handles editing lot details, ratings, dropdown specs, photos, and pro/con tags.
 */
class NotesManager {
  constructor() {
    this.currentEditingStopId = null;
  }

  openNotebook(stopData, onSaveCallback) {
    if (!stopData) return;
    this.currentEditingStopId = stopData.id;

    // Populate Fields
    const addrInput = document.getElementById('note-address-input');
    if (addrInput) {
      addrInput.value = stopData.address;
    } else {
      const el = document.getElementById('note-address');
      if (el) el.textContent = stopData.address;
    }

    document.getElementById('note-price').value = stopData.price || '';
    document.getElementById('note-size').value = stopData.lotSize || '';
    const sqftInput = document.getElementById('note-sqft');
    if (sqftInput) sqftInput.value = stopData.sqft || (stopData.sqFt || '');
    const yearInput = document.getElementById('note-year');
    if (yearInput) yearInput.value = stopData.yearBuilt || '';
    const elevInput = document.getElementById('note-elevation');
    if (elevInput) elevInput.value = stopData.elevationFt ? (typeof stopData.elevationFt === 'number' ? stopData.elevationFt.toLocaleString() + ' ft' : stopData.elevationFt) : '';
    const facingEl = document.getElementById('note-facing');
    if (facingEl) facingEl.value = stopData.facingDirection || '';
    const terrainEl = document.getElementById('note-terrain');
    if (terrainEl) terrainEl.value = stopData.terrain || 'Flat';
    document.getElementById('note-hoa').value = stopData.hoaNotes || '';
    document.getElementById('note-pros').value = stopData.pros ? stopData.pros.join(', ') : '';
    document.getElementById('note-cons').value = stopData.cons ? stopData.cons.join(', ') : '';
    document.getElementById('note-text').value = stopData.notes || '';

    // Multi-Photo Population
    const photoSource = stopData.photoUrls || stopData.photoUrl || '';
    const photoInputVal = Array.isArray(photoSource) ? photoSource.join(', ') : photoSource;
    document.getElementById('note-photo-url').value = photoInputVal;
    this.activePhotoIdx = 0;
    this.updatePhotoPreview(photoInputVal);

    // Auto-check DB cache for photoUrl & missing specs on notebook open
    if (window.propertyLinks && window.propertyLinks.fetchRedfinMetadata) {
      window.propertyLinks.fetchRedfinMetadata(stopData.redfinUrl || stopData.address).then(meta => {
        if (meta) {
          if (!stopData.price && meta.price) document.getElementById('note-price').value = meta.price;
          if (!stopData.sqft && meta.sqft && document.getElementById('note-sqft')) document.getElementById('note-sqft').value = meta.sqft;
          if (!stopData.yearBuilt && meta.yearBuilt && document.getElementById('note-year')) document.getElementById('note-year').value = meta.yearBuilt;
          if (!stopData.hoaNotes && meta.hoaNotes) document.getElementById('note-hoa').value = meta.hoaNotes;
          if (meta.photoUrl && meta.photoUrl !== 'https:' && meta.photoUrl !== 'http:') {
            if (!this.activePhotoUrls || this.activePhotoUrls.length === 0) {
              this.addPhotoUrl(meta.photoUrl);
            }
          }
        }
      }).catch(() => null);
    }

    // Auto-populate from permanent LocalStorage cache for previously saved observations & media
    if (window.storageManager) {
      window.storageManager.getCachedProperty(stopData.address).then(cached => {
        if (!cached) return;
        if (!document.getElementById('note-text').value && cached.notes) document.getElementById('note-text').value = cached.notes;
        if (!document.getElementById('note-pros').value && cached.pros) {
          document.getElementById('note-pros').value = Array.isArray(cached.pros) ? cached.pros.join(', ') : cached.pros;
        }
        if (!document.getElementById('note-cons').value && cached.cons) {
          document.getElementById('note-cons').value = Array.isArray(cached.cons) ? cached.cons.join(', ') : cached.cons;
        }
        if ((!this.activePhotoUrls || this.activePhotoUrls.length === 0) && (cached.photoUrls || cached.photoUrl)) {
          const cachedPhoto = cached.photoUrls || cached.photoUrl;
          const cachedPhotoVal = Array.isArray(cachedPhoto) ? cachedPhoto.join(', ') : cachedPhoto;
          document.getElementById('note-photo-url').value = cachedPhotoVal;
          this.updatePhotoPreview(cachedPhotoVal);
        }
      }).catch(() => null);
    }

    document.getElementById('note-visited').checked = !!stopData.visited;
    const solarEl = document.getElementById('note-solar');
    if (solarEl) solarEl.checked = !!stopData.hasSolar;

    // Populate Preference Match Score & Breakdown Checklist
    this.updateNotebookScoreLive(stopData);

    // Bind real-time input listeners to update Match Score live as fields change
    ['note-price', 'note-size', 'note-sqft', 'note-year', 'note-facing', 'note-terrain', 'note-hoa', 'note-solar'].forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.oninput = () => this.updateNotebookScoreLive(stopData);
        el.onchange = () => this.updateNotebookScoreLive(stopData);
      }
    });

    const sizeInput = document.getElementById('note-size');
    const badgeAutoSize = document.getElementById('badge-auto-size');
    const badgeAutoSqft = document.getElementById('badge-auto-sqft');
    const badgeAutoYear = document.getElementById('badge-auto-year');
    const badgeAutoElev = document.getElementById('badge-auto-elevation');
    const badgeAutoFacing = document.getElementById('badge-auto-facing');
    const badgeAutoTerrain = document.getElementById('badge-auto-terrain');
    const badgeAutoHoa = document.getElementById('badge-auto-hoa');
    const toggleAutoBadges = (show) => {
      if (badgeAutoSize) badgeAutoSize.classList.toggle('hidden', !show);
      if (badgeAutoSqft) badgeAutoSqft.classList.toggle('hidden', !show);
      if (badgeAutoYear) badgeAutoYear.classList.toggle('hidden', !show);
      if (badgeAutoElev) badgeAutoElev.classList.toggle('hidden', !show);
      if (badgeAutoFacing) badgeAutoFacing.classList.toggle('hidden', !show);
      if (badgeAutoTerrain) badgeAutoTerrain.classList.toggle('hidden', !show);
      if (badgeAutoHoa) badgeAutoHoa.classList.toggle('hidden', !show);
    };

    toggleAutoBadges(!!stopData.isAutoDetected);

    // Auto-detect Elevation, Slope, Facing, Specs & Photo handler
    const autoDetectBtn = document.getElementById('btn-autodetect-elevation');
    if (autoDetectBtn) {
      autoDetectBtn.onclick = async () => {
        if (autoDetectBtn.disabled) return;
        autoDetectBtn.disabled = true;
        autoDetectBtn.classList.add('opacity-60', 'cursor-not-allowed');
        autoDetectBtn.textContent = '⏳ Fetching Specs & Photo...';

        try {
          const [gisRes, redfinMeta] = await Promise.all([
            window.geocoder.fetchLotElevationAndTerrain(stopData.lat, stopData.lng).catch(() => null),
            window.propertyLinks.fetchRedfinMetadata(stopData.redfinUrl || stopData.address).catch(() => null)
          ]);

          if (gisRes || redfinMeta) {
            if (elevInput && gisRes && gisRes.elevationFt) elevInput.value = `${gisRes.elevationFt.toLocaleString()} ft`;
            if (terrainEl && gisRes && gisRes.terrain) terrainEl.value = gisRes.terrain;
            if (facingEl && gisRes && gisRes.facingDirection) facingEl.value = gisRes.facingDirection;
            if (sizeInput && ((redfinMeta && redfinMeta.lotSize) || (gisRes && gisRes.lotSize))) {
              sizeInput.value = (redfinMeta && redfinMeta.lotSize) ? redfinMeta.lotSize : (gisRes ? gisRes.lotSize : '');
            }
            if (redfinMeta) {
              if (redfinMeta.redfinUrl) stopData.redfinUrl = redfinMeta.redfinUrl;
              if (redfinMeta.price) document.getElementById('note-price').value = redfinMeta.price;
              if (redfinMeta.sqft && document.getElementById('note-sqft')) document.getElementById('note-sqft').value = redfinMeta.sqft;
              if (redfinMeta.yearBuilt && document.getElementById('note-year')) document.getElementById('note-year').value = redfinMeta.yearBuilt;
              if (redfinMeta.photoUrl && redfinMeta.photoUrl !== 'https:' && redfinMeta.photoUrl !== 'http:') {
                this.addPhotoUrl(redfinMeta.photoUrl);
              }
              if (redfinMeta.hoaNotes) document.getElementById('note-hoa').value = redfinMeta.hoaNotes;
            }

          stopData.isAutoDetected = true;
          toggleAutoBadges(true);

          // Save combined specs to 7-day DB cache
          const combinedCache = {
            elevationFt: gisRes ? gisRes.elevationFt : null,
            terrain: gisRes ? gisRes.terrain : 'Flat',
            facingDirection: (facingEl && facingEl.value) ? facingEl.value : (gisRes ? gisRes.facingDirection : ''),
            lotSize: sizeInput ? sizeInput.value : '',
            sqft: document.getElementById('note-sqft') ? document.getElementById('note-sqft').value : '',
            yearBuilt: document.getElementById('note-year') ? document.getElementById('note-year').value : '',
            price: document.getElementById('note-price') ? document.getElementById('note-price').value : '',
            photoUrl: document.getElementById('note-photo-url') ? document.getElementById('note-photo-url').value : '',
            hoaNotes: document.getElementById('note-hoa') ? document.getElementById('note-hoa').value : ''
          };
          window.storageManager.setCachedProperty(stopData.address, combinedCache);

          this.updateNotebookScoreLive(stopData);

          // Visual Pulse Highlight on updated fields
          ['note-price', 'note-size', 'note-sqft', 'note-year', 'note-elevation', 'note-facing', 'note-terrain', 'note-hoa'].forEach(id => {
            const el = document.getElementById(id);
            if (el) {
              el.classList.add('ring-2', 'ring-sky-400');
              setTimeout(() => el.classList.remove('ring-2', 'ring-sky-400'), 1500);
            }
          });

          autoDetectBtn.textContent = redfinMeta ? '✓ Auto-Detected All Specs & Photo!' : '✓ GIS Lot Specs Auto-Detected!';
          autoDetectBtn.classList.add('bg-emerald-500/30', 'text-emerald-300', 'border-emerald-500/50');
          setTimeout(() => {
            autoDetectBtn.textContent = '⚡ Auto-Detect Specs & Photo';
            autoDetectBtn.classList.remove('bg-emerald-500/30', 'text-emerald-300', 'border-emerald-500/50');
          }, 3000);
        } else {
          autoDetectBtn.textContent = '❌ Fetch Failed';
          setTimeout(() => { autoDetectBtn.textContent = '⚡ Auto-Detect Lot Details'; }, 2000);
        }
        } finally {
          autoDetectBtn.disabled = false;
          autoDetectBtn.classList.remove('opacity-60', 'cursor-not-allowed');
        }
      };
    }

    // Set Rating Stars
    this.setRatingStars(stopData.rating || 3);

    // Set Quick Search Links
    const gmapsBtn = document.getElementById('note-googlemaps-link');
    const redfinBtn = document.getElementById('note-redfin-link');
    const zillowBtn = document.getElementById('note-zillow-link');
    const streetViewBtn = document.getElementById('note-streetview-link');

    const updateQuickLinks = (addrText) => {
      if (gmapsBtn) gmapsBtn.href = window.propertyLinks.getGoogleMapsUrl(addrText, stopData.lat, stopData.lng);
      if (redfinBtn) {
        const cached = (window.storageManager && typeof window.storageManager.getCachedPropertySync === 'function') ? window.storageManager.getCachedPropertySync(addrText) : null;
        const redfinSource = stopData.redfinUrl || (cached ? (cached.redfinUrl || cached.url) : null) || addrText;
        redfinBtn.href = window.propertyLinks.getRedfinUrl(redfinSource);
        if (window.propertyLinks.needsRedfinAddressCopy(redfinSource)) {
          redfinBtn.setAttribute('data-redfin-copy-address', redfinSource.trim());
          redfinBtn.title = "Opens Redfin and copies this address so you can paste it into Redfin's search bar";
        } else {
          redfinBtn.removeAttribute('data-redfin-copy-address');
          redfinBtn.removeAttribute('title');
        }
      }
      if (zillowBtn) zillowBtn.href = window.propertyLinks.getZillowUrl(stopData.zillowUrl || addrText);
      if (streetViewBtn) streetViewBtn.href = window.propertyLinks.getStreetViewUrl(stopData.lat, stopData.lng, addrText);
    };

    updateQuickLinks(stopData.address);

    if (addrInput) {
      addrInput.oninput = () => updateQuickLinks(addrInput.value.trim() || stopData.address);
    }

    // Photo Add Button and Input Handlers
    const btnAddPhoto = document.getElementById('btn-add-photo-url');
    const photoUrlInput = document.getElementById('note-photo-url-input');

    if (btnAddPhoto && photoUrlInput) {
      const handleAdd = () => {
        const val = photoUrlInput.value.trim();
        if (val) {
          this.addPhotoUrl(val);
          photoUrlInput.value = '';
        }
      };
      btnAddPhoto.onclick = handleAdd;
      photoUrlInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleAdd();
        }
      };
    }

    // Multi-File Upload Event Listener
    const photoFileInput = document.getElementById('note-photo-file');
    if (photoFileInput) {
      photoFileInput.onchange = (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        const readPromises = files.map(file => {
          return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (evt) => resolve(evt.target.result);
            reader.readAsDataURL(file);
          });
        });

        Promise.all(readPromises).then(base64Urls => {
          base64Urls.forEach(url => this.addPhotoUrl(url));
        });
      };
    }

    this.currentStopData = stopData;
    this.currentSaveCallback = onSaveCallback;

    // Setup Close / Done Handler
    const saveBtn = document.getElementById('save-note-btn');
    if (saveBtn) {
      saveBtn.onclick = () => this.closeNotebook();
    }

    // Open Modal
    const modal = document.getElementById('notebook-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.style.display = 'flex';
    }
  }

  saveCurrentNotebookData() {
    if (!this.currentStopData || !this.currentSaveCallback) return;

    const stopData = this.currentStopData;
    const addrInput = document.getElementById('note-address');
    const elevInput = document.getElementById('note-elevation');
    const facingEl = document.getElementById('note-facing');
    const terrainEl = document.getElementById('note-terrain');
    const solarEl = document.getElementById('note-solar');

    const currentAddr = addrInput ? (addrInput.value.trim() || stopData.address) : stopData.address;
    const rawElev = elevInput ? elevInput.value.replace(/[^0-9]/g, '') : '';
    const parsedUrls = this.activePhotoUrls || [];

    const updatedData = {
      id: stopData.id,
      address: currentAddr,
      price: document.getElementById('note-price') ? document.getElementById('note-price').value.trim() : '',
      lotSize: document.getElementById('note-size') ? document.getElementById('note-size').value.trim() : '',
      sqft: document.getElementById('note-sqft') ? document.getElementById('note-sqft').value.trim() : '',
      yearBuilt: document.getElementById('note-year') ? document.getElementById('note-year').value.trim() : '',
      elevationFt: rawElev ? parseInt(rawElev) : (stopData.elevationFt || null),
      isAutoDetected: !!stopData.isAutoDetected,
      facingDirection: facingEl ? facingEl.value : (stopData.facingDirection || ''),
      terrain: terrainEl ? terrainEl.value : 'Flat',
      hasSolar: solarEl ? solarEl.checked : false,
      hoaNotes: document.getElementById('note-hoa') ? document.getElementById('note-hoa').value.trim() : '',
      rating: parseInt(document.getElementById('note-rating-val') ? document.getElementById('note-rating-val').value : '3') || 3,
      pros: document.getElementById('note-pros') ? document.getElementById('note-pros').value.split(',').map(s => s.trim()).filter(Boolean) : [],
      cons: document.getElementById('note-cons') ? document.getElementById('note-cons').value.split(',').map(s => s.trim()).filter(Boolean) : [],
      notes: document.getElementById('note-text') ? document.getElementById('note-text').value.trim() : '',
      photoUrl: parsedUrls.length > 0 ? parsedUrls[0] : '',
      photoUrls: parsedUrls,
      visited: document.getElementById('note-visited') ? document.getElementById('note-visited').checked : false
    };

    // Save updated observations, media, and specs permanently into browser LocalStorage property cache
    if (window.storageManager && currentAddr) {
      window.storageManager.setCachedProperty(currentAddr, updatedData);
    }

    this.currentSaveCallback(updatedData);
  }

  closeNotebook() {
    this.saveCurrentNotebookData();
    const modal = document.getElementById('notebook-modal');
    if (modal) {
      modal.classList.add('hidden');
      modal.style.display = 'none';
    }
    this.currentEditingStopId = null;
    this.currentStopData = null;
    this.currentSaveCallback = null;
  }

  setRatingStars(ratingVal) {
    document.getElementById('note-rating-val').value = ratingVal;
    const starSpans = document.querySelectorAll('#star-container span');
    starSpans.forEach((span, idx) => {
      if (idx < ratingVal) {
        span.classList.add('active');
        span.textContent = '★';
      } else {
        span.classList.remove('active');
        span.textContent = '☆';
      }
    });
  }

  parsePhotoUrls(inputVal) {
    if (!inputVal) return [];
    if (Array.isArray(inputVal)) return inputVal.filter(Boolean);
    return String(inputVal)
      .split(/[\n,\s]+/)
      .map(s => s.trim())
      .filter(s => s.length > 10 && (s.startsWith('http://') || s.startsWith('https://') || s.startsWith('data:image/')));
  }

  syncHiddenPhotoInput() {
    const hiddenInput = document.getElementById('note-photo-url');
    if (hiddenInput) {
      hiddenInput.value = (this.activePhotoUrls || []).join(', ');
    }
  }

  addPhotoUrl(urlVal) {
    const newUrls = this.parsePhotoUrls(urlVal);
    if (newUrls.length === 0) return;

    this.activePhotoUrls = [...(this.activePhotoUrls || []), ...newUrls];
    this.activePhotoIdx = this.activePhotoUrls.length - 1;
    this.syncHiddenPhotoInput();
    this.updatePhotoPreview(this.activePhotoUrls);
  }

  updatePhotoPreview(inputVal) {
    const previewContainer = document.getElementById('photo-preview-container');
    const mainImg = document.getElementById('note-photo-preview');
    const counter = document.getElementById('photo-index-counter');
    const listContainer = document.getElementById('photo-url-list-container');

    this.activePhotoUrls = this.parsePhotoUrls(inputVal);

    if (!this.activePhotoUrls || this.activePhotoUrls.length === 0) {
      if (previewContainer) previewContainer.classList.add('hidden');
      if (listContainer) listContainer.innerHTML = '';
      this.syncHiddenPhotoInput();
      return;
    }

    if (previewContainer) previewContainer.classList.remove('hidden');
    if (this.activePhotoIdx >= this.activePhotoUrls.length) {
      this.activePhotoIdx = 0;
    }

    const currentUrl = this.activePhotoUrls[this.activePhotoIdx];
    if (mainImg) {
      mainImg.src = currentUrl;
      mainImg.onerror = () => {
        mainImg.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" fill="%239ca3af" viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>';
      };
    }

    if (counter) {
      counter.textContent = `Photo ${this.activePhotoIdx + 1} of ${this.activePhotoUrls.length}`;
    }

    // Render Listed Photo URL Items with Delete X
    if (listContainer) {
      listContainer.innerHTML = this.activePhotoUrls.map((url, idx) => {
        const displayLabel = url.startsWith('data:image/') ? `Uploaded Image #${idx + 1}` : url;
        const isActive = idx === this.activePhotoIdx;

        return `
          <div class="flex items-center justify-between gap-2 p-2 rounded-xl border ${isActive ? 'bg-sky-500/10 border-sky-500/40 text-slate-100' : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'} transition-all group">
            <div class="flex items-center gap-2 overflow-hidden flex-1 cursor-pointer" onclick="window.notesManager.selectPhotoIndex(${idx})">
              <img src="${url}" class="w-8 h-8 rounded-lg object-cover flex-shrink-0 border border-slate-700">
              <span class="text-xs font-mono truncate flex-1" title="${displayLabel}">${displayLabel}</span>
            </div>
            <button type="button" onclick="window.notesManager.removePhotoIndex(${idx})" class="px-2 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 font-bold text-xs border border-rose-500/20 transition-colors flex-shrink-0" title="Delete Photo">
              ✕
            </button>
          </div>
        `;
      }).join('');
    }
    this.syncHiddenPhotoInput();
  }

  selectPhotoIndex(idx) {
    this.activePhotoIdx = idx;
    this.updatePhotoPreview(this.activePhotoUrls);
  }

  removePhotoIndex(idx) {
    if (this.activePhotoUrls && idx >= 0 && idx < this.activePhotoUrls.length) {
      this.activePhotoUrls.splice(idx, 1);
      this.activePhotoIdx = Math.max(0, Math.min(this.activePhotoIdx, this.activePhotoUrls.length - 1));
      this.updatePhotoPreview(this.activePhotoUrls);
    }
  }

  updateNotebookScoreLive(currentStopData) {
    if (!window.propertyScorer || !window.homewardApp || !window.homewardApp.currentTour) return;

    const priceEl = document.getElementById('note-price');
    const priceVal = priceEl ? priceEl.value.trim() : (currentStopData ? currentStopData.price : '');
    const sizeEl = document.getElementById('note-size');
    const sizeVal = sizeEl ? sizeEl.value.trim() : (currentStopData ? currentStopData.lotSize : '');
    const sqftEl = document.getElementById('note-sqft');
    const sqftVal = sqftEl ? sqftEl.value.trim() : (currentStopData ? currentStopData.sqft : '');
    const yearEl = document.getElementById('note-year');
    const yearVal = yearEl ? yearEl.value.trim() : (currentStopData ? currentStopData.yearBuilt : '');
    const facingEl = document.getElementById('note-facing');
    const facingVal = facingEl ? facingEl.value : (currentStopData ? currentStopData.facingDirection : '');
    const terrainEl = document.getElementById('note-terrain');
    const terrainVal = terrainEl ? terrainEl.value : (currentStopData ? currentStopData.terrain : '');
    const hoaEl = document.getElementById('note-hoa');
    const hoaVal = hoaEl ? hoaEl.value.trim() : (currentStopData ? currentStopData.hoaNotes : '');
    const solarEl = document.getElementById('note-solar');
    const solarVal = solarEl ? solarEl.checked : (currentStopData ? currentStopData.hasSolar : false);

    const evalStop = {
      ...(currentStopData || {}),
      price: priceVal || (currentStopData ? currentStopData.price : null),
      lotSize: sizeVal || (currentStopData ? currentStopData.lotSize : null),
      sqft: sqftVal || (currentStopData ? currentStopData.sqft : null),
      yearBuilt: yearVal || (currentStopData ? currentStopData.yearBuilt : null),
      facingDirection: facingVal || (currentStopData ? currentStopData.facingDirection : null),
      terrain: terrainVal || (currentStopData ? currentStopData.terrain : null),
      hoaNotes: hoaVal || (currentStopData ? currentStopData.hoaNotes : null),
      hasSolar: solarVal
    };

    const prefs = window.homewardApp.currentTour.preferences || {};
    const score = window.propertyScorer.calculateMatchScore(evalStop, prefs);

    const scoreBadge = document.getElementById('notebook-match-score-badge');
    const scoreText = document.getElementById('notebook-match-score-text');
    const passedList = document.getElementById('notebook-match-passed-list');
    const failedList = document.getElementById('notebook-match-failed-list');

    const badgeColor = score.badgeColor === 'emerald' ? 'emerald' : (score.badgeColor === 'rose' ? 'rose' : 'amber');
    if (scoreBadge) {
      scoreBadge.className = `text-xs px-2 py-0.5 rounded-full font-bold bg-${badgeColor}-500/20 text-${badgeColor}-400 border border-${badgeColor}-500/30`;
      scoreBadge.textContent = `🎯 ${score.scorePct}% Preference Match`;
    }
    if (scoreText) {
      scoreText.className = `font-bold text-xs text-${badgeColor}-400`;
      scoreText.textContent = `🎯 ${score.scorePct}% Match (${score.earnedPoints || 0}/${score.totalMaxPoints || 0} pts)`;
    }
    if (passedList) {
      passedList.innerHTML = (score.passedCriteria || []).map(p => `<div>✓ ${p}</div>`).join('');
    }
    if (failedList) {
      failedList.innerHTML = (score.failedCriteria || []).map(f => `<div>✕ ${f}</div>`).join('');
    }
  }

  initStarRatingEvents() {
    const starSpans = document.querySelectorAll('#star-container span');
    starSpans.forEach(span => {
      span.addEventListener('click', (e) => {
        const val = parseInt(e.target.getAttribute('data-val'));
        this.setRatingStars(val);
      });
    });

    const photoInput = document.getElementById('note-photo-url');
    if (photoInput) {
      photoInput.addEventListener('input', (e) => {
        this.updatePhotoPreview(e.target.value.trim());
      });
    }

    const fileInput = document.getElementById('note-photo-file');
    if (fileInput) {
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => {
            const dataUrl = event.target.result;
            document.getElementById('note-photo-url').value = dataUrl;
            this.updatePhotoPreview(dataUrl);
          };
          reader.readAsDataURL(file);
        }
      });
    }
  }
}

window.notesManager = new NotesManager();
