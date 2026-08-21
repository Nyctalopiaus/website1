
const ICONS = {
  star: '⭐',
  starFilled: '★',
  starEmpty: '☆'
};

function findVenueDetails(venueData, rawVenue) {
  if (!Array.isArray(venueData)) return null;
  const normalized = String(rawVenue || '').toLowerCase().trim();
  return venueData.find(item => String(item?.venue_name || '').toLowerCase().trim() === normalized) || null;
}

function containsAnyKeyword(value, keywords) {
  return keywords.some(keyword => value.includes(keyword));
}

function normalizeLocationToken(value) {
  return (value || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function initFilters(opts = {}) {
  const getInterestedIds = opts.getInterestedIds || function() { try { return JSON.parse(localStorage.getItem('gig_grid_interested_events') || '[]'); } catch(e) { return []; } };
  const saveInterestedIds = opts.saveInterestedIds || function(ids) { try { localStorage.setItem('gig_grid_interested_events', JSON.stringify(ids)); } catch(e) {} };
  const getPurchasedIds = opts.getPurchasedIds || function() { try { return JSON.parse(localStorage.getItem('gig_grid_purchased_events') || '[]'); } catch(e) { return []; } };
  const savePurchasedIds = opts.savePurchasedIds || function(ids) { try { localStorage.setItem('gig_grid_purchased_events', JSON.stringify(ids)); } catch(e) {} };
  const getIgnoredEventIds = opts.getIgnoredEventIds || function() { try { return JSON.parse(localStorage.getItem('gig_grid_ignored_events') || '[]'); } catch(e) { return []; } };
  const saveIgnoredEventIds = opts.saveIgnoredEventIds || function(ids) { try { localStorage.setItem('gig_grid_ignored_events', JSON.stringify(ids)); } catch(e) {} };
  const venueData = Array.isArray(opts.venueData) ? opts.venueData : [];
  const genreBuckets = (opts.genreBuckets && typeof opts.genreBuckets === 'object')
    ? opts.genreBuckets
    : { all: { label: 'All Genres', title: 'All events' } };

  console.log('[GigGrid] initFilters loaded v20260726_v5');
  const venueList = document.getElementById('venue-checkboxes-list');
  const dropdownToggle = document.getElementById('venue-dropdown-toggle');
  const dropdownMenu = document.getElementById('venue-dropdown-menu');
  const venueSelectAll = document.getElementById('venue-select-all');
  const monthSelect = document.getElementById('month-dropdown-select');
  const genreSelect = document.getElementById('genre-select');
  const views = document.querySelectorAll('.calendar-view');
  const artistSearchInput = document.getElementById('artist-search-input');
  const clearSearchButton = document.getElementById('btn-clear-search');
  const btnInterestedFilter = document.getElementById('btn-interested-filter');
  const btnFreeFilter = document.getElementById('btn-free-filter');
  const cards = document.querySelectorAll('.events-content .event-card');
  const genreHelpTrigger = document.getElementById('genre-help-trigger');
  const genreHelpPanel = document.getElementById('genre-help-panel');
  const genreHelpTitle = document.getElementById('genre-help-title');
  const genreHelpText = document.getElementById('genre-help-text');
  const btnJustAnnounced = document.getElementById('btn-just-announced');
  const btnGroupByVenue = document.getElementById('btn-group-by-venue');

  let activeRegions = new Set(['all']);
  let activeGenre = 'all';
  let filterInterestedOnly = false;
  let filterFreeOnly = false;
  let filterJustAnnounced = false;
  let groupByVenue = false;
  let lastActiveMonthView = (monthSelect && monthSelect.value !== 'interested-view') ? monthSelect.value : null;

  // Keep dropdown in sync with SSR-selected month to avoid browser-restored stale selection.
  if (monthSelect) {
    const activeServerView = document.querySelector('.calendar-view.active[data-month]');
    const activeServerMonth = activeServerView ? String(activeServerView.dataset.month || '').trim() : '';
    const activeServerValue = activeServerMonth ? `month-${activeServerMonth}` : '';
    if (activeServerValue && monthSelect.querySelector(`option[value="${activeServerValue}"]`)) {
      monthSelect.value = activeServerValue;
      lastActiveMonthView = activeServerValue;
    }
  }
  const activeMarket = document.body?.dataset?.market || 'colorado';
  const INTL_MARKETS = new Set(['england', 'scotland', 'wales', 'ireland']);
  const activeCountry = INTL_MARKETS.has(activeMarket)
    ? activeMarket
    : (document.body?.dataset?.country || '');
  const eventsApiUrl = document.body?.dataset?.eventsApi || 'api/events.php';
  const marketRegionStorageKey = `gig_grid_active_regions_${activeMarket}`;
  const navigateTo = (nextUrl) => {
    if (!nextUrl) return;
    if (typeof window.__softNavigate === 'function') {
      window.__softNavigate(nextUrl);
      return;
    }
    window.location.assign(nextUrl);
  };
  const navigateToMarketScope = (nextUrl) => {
    if (!nextUrl) return;
    window.location.assign(nextUrl);
  };

  // Handle America vs International Toggle Buttons & Instant Market Navigation
  const regionToggleBtns = document.querySelectorAll('.region-toggle-btn');
  const usStatesContainer = document.getElementById('us-states-select-container');
  const intlCountriesContainer = document.getElementById('intl-countries-select-container');
  const usStateSelect = document.getElementById('us-state-dropdown-select');
  const intlCountrySelect = document.getElementById('intl-country-dropdown-select');

  function findOptionByParam(selectEl, paramName, expectedValue) {
    if (!selectEl || !expectedValue) return null;
    const normalizedExpected = String(expectedValue).toLowerCase();
    return Array.from(selectEl.options).find(opt => {
      try {
        const parsed = new URL(opt.value, window.location.origin);
        const actual = (parsed.searchParams.get(paramName) || '').toLowerCase();
        return actual === normalizedExpected;
      } catch (_) {
        return false;
      }
    }) || null;
  }

  if (INTL_MARKETS.has(activeMarket) && intlCountrySelect) {
    const matchedCountryOption = findOptionByParam(intlCountrySelect, 'market', activeMarket);
    if (matchedCountryOption) {
      intlCountrySelect.value = matchedCountryOption.value;
    }
  }

  if (!INTL_MARKETS.has(activeMarket) && usStateSelect) {
    const matchedMarketOption = findOptionByParam(usStateSelect, 'market', activeMarket);
    if (matchedMarketOption) {
      usStateSelect.value = matchedMarketOption.value;
    }
  }

  // Remember which market within each family (US state / intl country) was last
  // active, so switching America <-> International and back restores where you
  // left off instead of always resetting to the first option in the list.
  const lastUsMarketKey = 'gig_grid_last_us_market';
  const lastIntlMarketKey = 'gig_grid_last_intl_market';

  try {
    if (INTL_MARKETS.has(activeMarket)) {
      localStorage.setItem(lastIntlMarketKey, activeMarket);
    } else {
      localStorage.setItem(lastUsMarketKey, activeMarket);
    }
  } catch (_) {}

  if (INTL_MARKETS.has(activeMarket) && usStateSelect) {
    let lastUsMarket = null;
    try { lastUsMarket = localStorage.getItem(lastUsMarketKey); } catch (_) {}
    const matchedLastUsOption = findOptionByParam(usStateSelect, 'market', lastUsMarket);
    if (matchedLastUsOption) {
      usStateSelect.value = matchedLastUsOption.value;
    }
  }

  if (!INTL_MARKETS.has(activeMarket) && intlCountrySelect) {
    let lastIntlMarket = null;
    try { lastIntlMarket = localStorage.getItem(lastIntlMarketKey); } catch (_) {}
    const matchedLastIntlOption = findOptionByParam(intlCountrySelect, 'market', lastIntlMarket);
    if (matchedLastIntlOption) {
      intlCountrySelect.value = matchedLastIntlOption.value;
    }
  }

  if (intlCountrySelect) {
    intlCountrySelect.addEventListener('change', (e) => {
      const nextUrl = intlCountrySelect.value;
      console.log('[GigGrid] Intl country changed:', nextUrl);
      if (!nextUrl) return;

      try {
        localStorage.removeItem(marketRegionStorageKey);
      } catch (_) {}

      navigateToMarketScope(nextUrl);
    });
  }

  if (usStateSelect) {
    usStateSelect.addEventListener('change', () => {
      const nextUrl = usStateSelect.value;
      if (!nextUrl) return;
      navigateToMarketScope(nextUrl);
    });
  }

  regionToggleBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const targetGroup = btn.getAttribute('data-target-group');
      regionToggleBtns.forEach(b => b.classList.toggle('active', b === btn));

      if (targetGroup === 'us') {
        if (usStatesContainer) usStatesContainer.style.display = 'inline-block';
        if (intlCountriesContainer) intlCountriesContainer.style.display = 'none';

        const isCurrentUs = (activeMarket === 'colorado' || activeMarket === 'california' || activeMarket === 'texas');
        if (!isCurrentUs && usStateSelect && usStateSelect.value) {
          navigateToMarketScope(usStateSelect.value);
        }
      } else {
        if (usStatesContainer) usStatesContainer.style.display = 'none';
        if (intlCountriesContainer) intlCountriesContainer.style.display = 'inline-block';

        const isCurrentIntl = INTL_MARKETS.has(activeMarket);
        if (!isCurrentIntl && intlCountrySelect && intlCountrySelect.value) {
          navigateToMarketScope(intlCountrySelect.value);
        }
      }
    });
  });

  const CHUNK_SIZE = 8;
  let visibleChunkLimit = CHUNK_SIZE;
  const pendingChunkLoads = new Set();

  function resetChunkLimit() {
    visibleChunkLimit = CHUNK_SIZE;
  }

  async function loadMoreFromServer(view) {
    if (!view || view.dataset.hasMore !== '1') return 0;
    const month = view.dataset.month || '';
    if (!month) return 0;

    const viewKey = view.id || month;
    if (pendingChunkLoads.has(viewKey)) return 0;
    pendingChunkLoads.add(viewKey);

    const loadMoreBtn = view.querySelector('.load-more-container .btn-load-more');
    if (loadMoreBtn) {
      loadMoreBtn.disabled = true;
      loadMoreBtn.innerHTML = '<span>Loading...</span>';
    }

    try {
      const offset = Number(view.dataset.nextOffset || 0);
      const params = new URLSearchParams({
        market: activeMarket,
        region: activeCountry,
        month,
        offset: String(offset),
        limit: String(CHUNK_SIZE)
      });

      const response = await fetch(`${eventsApiUrl}?${params.toString()}`, {
        credentials: 'same-origin',
        headers: {
          'Accept': 'application/json'
        }
      });
      if (!response.ok) {
        throw new Error(`Chunk request failed (${response.status})`);
      }

      const payload = await response.json();
      if (!payload || payload.status !== 'ok') {
        throw new Error('Invalid chunk response payload');
      }

      if (payload.html) {
        const existingLoadMore = view.querySelector('.load-more-container');
        if (existingLoadMore) {
          existingLoadMore.insertAdjacentHTML('beforebegin', payload.html);
        } else {
          view.insertAdjacentHTML('beforeend', payload.html);
        }
      }

      const loadedCount = Number(payload.loaded_count || 0);
      const totalGroups = Number(payload.total_groups || view.dataset.totalGroups || 0);
      const previousLoaded = Number(view.dataset.loadedGroups || 0);

      view.dataset.loadedGroups = String(previousLoaded + loadedCount);
      view.dataset.nextOffset = String(Number(payload.next_offset || (offset + loadedCount)));
      view.dataset.totalGroups = String(totalGroups);
      view.dataset.hasMore = payload.has_more ? '1' : '0';

      return loadedCount;
    } catch (error) {
      console.error('Failed loading additional event cards', error);
      if (loadMoreBtn) {
        loadMoreBtn.disabled = false;
        loadMoreBtn.innerHTML = '<span>Load More Shows</span>';
      }
      return 0;
    } finally {
      pendingChunkLoads.delete(viewKey);
    }
  }

  function saveActiveRegions() {
    try {
      localStorage.setItem(marketRegionStorageKey, JSON.stringify(Array.from(activeRegions)));
    } catch (e) {
      console.warn('Failed to save active regions to localStorage:', e);
    }
  }

  function loadActiveRegions() {
    try {
      const saved = localStorage.getItem(marketRegionStorageKey);
      const validRegions = new Set(Array.from(document.querySelectorAll('.region-btn')).map(b => b.getAttribute('data-region')));
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const filtered = parsed.filter(r => validRegions.has(r));
          if (filtered.length > 0) {
            activeRegions = new Set(filtered);
          } else {
            activeRegions = new Set(['all']);
          }
          document.querySelectorAll('.region-btn').forEach(b => {
            const rVal = b.getAttribute('data-region');
            b.classList.toggle('active', activeRegions.has(rVal));
          });
        }
      }
    } catch (e) {
      console.warn('Failed to load active regions from localStorage:', e);
    }
  }

  loadActiveRegions();

  const btnResetIgnored = document.getElementById('btn-reset-ignored');
  const resetIgnoredLabel = document.getElementById('reset-ignored-label');
  const summaryMarket = document.getElementById('summary-market');
  const summaryResults = document.getElementById('summary-results');
  const summaryFilters = document.getElementById('summary-filters');
  const summaryPill = document.getElementById('live-filter-summary');
  const btnToggleIntro = document.getElementById('btn-toggle-intro');
  const introDrawer = document.getElementById('intro-drawer');

  if (btnToggleIntro && introDrawer) {
    btnToggleIntro.addEventListener('click', () => {
      introDrawer.classList.toggle('hidden');
    });
  }

  function updateResetIgnoredButton() {
    const ignoredIds = getIgnoredEventIds ? getIgnoredEventIds() : [];
    const count = ignoredIds.length;
    if (resetIgnoredLabel) {
      resetIgnoredLabel.textContent = `Reset Ignored (${count})`;
    }
    if (btnResetIgnored) {
      btnResetIgnored.style.display = 'inline-flex';
      btnResetIgnored.setAttribute('aria-label', `Reset ignored events (${count})`);
    }
  }

  const regionCitiesByMarket = {
    colorado: {
      springs: ['colorado springs', 'pueblo', 'castle rock'],
      denver: ['denver', 'boulder', 'golden', 'morrison', 'englewood', 'littleton', 'arvada', 'westminster', 'thornton', 'lakewood', 'greenwood village'],
      north: ['fort collins', 'greeley', 'loveland', 'longmont', 'bellvue'],
      west: ['grand junction', 'fruita', 'palisade', 'montrose', 'telluride', 'aspen', 'steamboat springs', 'glenwood springs']
    },
    california: {
      norcal: ['san francisco', 'oakland', 'berkeley', 'san jose', 'mountain view', 'napa', 'roseville', 'wheatland', 'lincoln', 'sacramento', 'concord'],
      la: ['los angeles', 'la', 'inglewood', 'hollywood', 'west hollywood', 'pasadena', 'pomona'],
      oc: ['anaheim', 'santa ana', 'orange', 'fullerton', 'costa mesa', 'irvine'],
      sd: ['san diego', 'chula vista', 'la mesa', 'el cajon', 'oceanside', 'solana beach']
    },
    scotland: {
      glasgow: ['glasgow', 'paisley', 'greenock', 'kilmarnock', 'ayr', 'dumbarton', 'hamilton', 'motherwell', 'livingston', 'a\' chill bheag', 'campbeltown'],
      edinburgh: ['edinburgh', 'dunfermline', 'bathgate', 'falkirk', 'stirling', 'perth', 'galashiels', 'hawick', 'kelso', 'selkirk'],
      aberdeen: ['aberdeen', 'dundee', 'inverurie', 'elgin', 'arbroath', 'st andrews', 'glenrothes', 'kirkcaldy', 'mintlaw'],
      highlands: ['inverness', 'fort william', 'wick', 'thurso', 'lerwick', 'stornoway', 'orkney', 'oban', 'caird', 'strathaven']
    },
    wales: {
      cardiff: ['cardiff', 'newport', 'barry', 'cwmbran', 'pontypridd', 'caerphilly'],
      swansea: ['swansea', 'llanelli', 'port talbot', 'bridgend', 'neath', 'abertillery', 'merthyr tydfil'],
      northwales: ['wrexham', 'rhyl', 'llandudno', 'bangor', 'colwyn bay', 'aberystwyth']
    },
    ireland: {
      dublin: ['dublin', 'bray', 'drogheda', 'dundalk', 'navan', 'carlow', 'wexford', 'kilkenny', 'waterford'],
      belfast: ['belfast', 'derry', 'londonderry', 'sligo', 'letterkenny'],
      cork: ['cork', 'limerick', 'tralee', 'killarney', 'ennis'],
      galway: ['galway', 'athlone']
    },
    england: {
      london: ['london', 'brighton', 'oxford', 'cambridge', 'southampton', 'portsmouth', 'exeter', 'norwich', 'alton'],
      manchester: ['manchester', 'liverpool', 'preston'],
      birmingham: ['birmingham', 'nottingham', 'shrewsbury', 'torquay'],
      bristol: ['bristol'],
      leeds: ['leeds', 'sheffield', 'newcastle', 'hull', 'york']
    },
    texas: {
      austin: ['austin', 'round rock', 'san marcos', 'cedar park', 'georgetown', 'pflugerville', 'buda', 'kyle', 'bastrop', 'taylor'],
      dallas: ['dallas', 'fort worth', 'arlington', 'plano', 'garland', 'irving', 'denton', 'mckinney', 'frisco', 'grand prairie'],
      houston: ['houston', 'the woodlands', 'sugar land', 'katy', 'pasadena', 'galveston', 'baytown', 'conroe', 'pearland', 'spring'],
      'san-antonio': ['san antonio', 'new braunfels', 'corpus christi', 'laredo', 'brownsville', 'mcallen', 'victoria', 'seguin', 'boerne', 'kerrville', 'helotes']
    }
  };

  const effectiveMarket = activeMarket;
  const regionCities = regionCitiesByMarket[effectiveMarket] || regionCitiesByMarket['colorado'];

  function getMarketLabel(marketKey) {
    if (marketKey === 'colorado') return 'CO';
    if (marketKey === 'california') return 'CA';
    if (marketKey === 'texas') return 'TX';
    if (marketKey === 'england') return 'England';
    if (marketKey === 'scotland') return 'Scotland';
    if (marketKey === 'wales') return 'Wales';
    if (marketKey === 'ireland') return 'Ireland';
    return 'CO';
  }

  function updateLiveFilterSummary(visibleCount, selectedVenueCount, totalVenueCount, searchQuery) {
    if (summaryMarket) {
      summaryMarket.textContent = `Market: ${getMarketLabel(activeMarket)}`;
    }

    if (summaryResults) {
      summaryResults.textContent = `Visible shows: ${visibleCount}`;
    }

    if (summaryFilters) {
      const parts = [];
      if (!activeRegions.has('all')) {
        const labels = Array.from(activeRegions).map(r => r.toUpperCase());
        parts.push(`Regions (${labels.join(', ')})`);
      }
      if (activeGenre !== 'all') {
        const selectedGenreLabel = genreBuckets[activeGenre]?.label || activeGenre;
        parts.push(`Genre ${selectedGenreLabel}`);
      }
      if (selectedVenueCount !== totalVenueCount) parts.push(`Venues ${selectedVenueCount}/${totalVenueCount}`);
      if (filterInterestedOnly) parts.push('Interested only');
      if (filterFreeOnly) parts.push('Free events');
      if (searchQuery) parts.push(`Search "${searchQuery}"`);

      summaryFilters.textContent = parts.length ? `Filters: ${parts.length} active` : 'Filters: default';
      summaryFilters.title = parts.length ? parts.join(' • ') : 'No extra filters active';
    }
  }

  const venuesSet = new Set();

  if (Array.isArray(venueData)) {
    venueData.forEach(v => {
      if (v && v.venue_name) {
        venuesSet.add(v.venue_name.trim().toLowerCase());
      }
    });
  }

  const allCardsToScan = [];
  document.querySelectorAll('.event-card').forEach(c => allCardsToScan.push(c));
  document.querySelectorAll('template.deferred-cards-template').forEach(tpl => {
    try {
      const clone = tpl.content.cloneNode(true);
      clone.querySelectorAll('.event-card').forEach(c => allCardsToScan.push(c));
    } catch (e) {}
  });

  allCardsToScan.forEach(card => {
    if (card.dataset) {
      const rawVenue = String(card.dataset.venue || '').trim().toLowerCase();
      if (!rawVenue) {
        return;
      }
      const matched = findVenueDetails(venueData, rawVenue);
      const normalized = matched ? String(matched.venue_name || '').toLowerCase() : rawVenue;
      card.dataset.venue = normalized;
      venuesSet.add(normalized);
    }
  });

  const sortedVenues = Array.from(venuesSet).map(venue => {
    const matched = Array.isArray(venueData)
      ? venueData.find(item => String(item?.venue_name || '').toLowerCase() === venue)
      : null;
    const displayName = matched ? matched.venue_name : venue.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
    return { raw: venue, name: displayName };
  }).sort((a, b) => a.name.localeCompare(b.name));

  if (venueList) {
    sortedVenues.forEach(item => {
      const label = document.createElement('label');
      label.style.display = 'flex';
      label.style.alignItems = 'center';
      label.style.gap = '0.5rem';
      label.style.padding = '0.25rem 0.5rem';
      label.style.color = 'var(--text-medium)';
      label.style.fontSize = '0.8rem';
      label.style.cursor = 'pointer';
      label.style.userSelect = 'none';
      label.innerHTML = `<input type="checkbox" class="venue-filter-checkbox" value="${item.raw}" checked style="accent-color: var(--accent-crimson);" /><span>${item.name}</span>`;
      venueList.appendChild(label);
    });
  }

  // Venue Filter Quick Search & Action Buttons
  const venueSearchInput = document.getElementById('venue-search-input');
  const btnVenueSelectAll = document.getElementById('btn-venue-select-all');
  const btnVenueClearAll = document.getElementById('btn-venue-clear-all');

  if (venueSearchInput) {
    venueSearchInput.addEventListener('input', () => {
      const query = venueSearchInput.value.toLowerCase().trim();
      if (venueList) {
        venueList.querySelectorAll('label').forEach(label => {
          const txt = label.textContent.toLowerCase();
          label.style.display = txt.includes(query) ? 'flex' : 'none';
        });
      }
    });
  }

  if (btnVenueSelectAll) {
    btnVenueSelectAll.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      if (venueList) {
        venueList.querySelectorAll('label').forEach(label => {
          if (label.style.display !== 'none') {
            const cb = label.querySelector('.venue-filter-checkbox');
            if (cb) cb.checked = true;
          }
        });
      }
      applyFilters();
    });
  }

  if (btnVenueClearAll) {
    btnVenueClearAll.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      if (venueList) {
        venueList.querySelectorAll('label').forEach(label => {
          if (label.style.display !== 'none') {
            const cb = label.querySelector('.venue-filter-checkbox');
            if (cb) cb.checked = false;
          }
        });
      }
      applyFilters();
    });
  }

  function parseDateSafe(dateStr) {
    if (!dateStr) return null;
    const iso = dateStr.replace(' ', 'T');
    const d = new Date(iso);
    return isNaN(d.getTime()) ? null : d;
  }

  function isShowActive(startTimeStr) {
    if (!startTimeStr) return true;
    const dObj = parseDateSafe(startTimeStr);
    if (!dObj) return true;
    const cutoffTime = dObj.getTime() + (4 * 60 * 60 * 1000);
    return new Date().getTime() <= cutoffTime;
  }

  function updateInterestedCards() {
    const interestedIds = getInterestedIds().map(id => String(id));
    const interestedSet = new Set(interestedIds);
    const purchasedIds = getPurchasedIds().map(id => String(id));
    const purchasedSet = new Set(purchasedIds);

    const optionInterested = document.getElementById('interested-dropdown-option');
    const optionPurchased = document.getElementById('purchased-dropdown-option');
    const btnFilter = document.getElementById('btn-interested-filter');
    const allCards = document.querySelectorAll('.calendar-view:not(#interested-view):not(#purchased-view) .event-card');
    
    let interestedCount = 0;
    let purchasedCount = 0;

    allCards.forEach(card => {
      const eventId = card.id.replace('card-', '');
      const btnAction = card.querySelector('.btn-interested-toggle');
      const startTimeStr = btnAction ? btnAction.getAttribute('data-start') : '';
      if (isShowActive(startTimeStr)) {
        if (interestedSet.has(eventId)) interestedCount++;
        if (purchasedSet.has(eventId)) purchasedCount++;
      }
    });

    if (optionInterested) {
      optionInterested.textContent = `★ Interested Shows (${interestedCount})`;
    }
    if (optionPurchased) {
      optionPurchased.textContent = `🎟️ My Tickets (${purchasedCount})`;
    }

    if (btnFilter) {
      const labelSpan = btnFilter.querySelector('.btn-premium-filter-label');
      if (labelSpan) {
        labelSpan.textContent = interestedCount > 0 ? `Interested Only (${interestedCount})` : 'Interested Only';
      }
      const iconSpan = btnFilter.querySelector('.btn-premium-filter-icon');
      if (iconSpan) {
        iconSpan.textContent = '⭐';
      }
      btnFilter.setAttribute('title', interestedCount > 0 ? `Show starred favorite shows (${interestedCount})` : 'Show starred favorite shows');
      btnFilter.setAttribute('aria-label', interestedCount > 0 ? `Interested only filter (${interestedCount} shows)` : 'Interested only filter');
    }

    document.querySelectorAll('.event-card').forEach(card => {
      const eventId = card.id.replace('card-', '');
      const btn = card.querySelector('.btn-interested-toggle');
      const badgeInterested = card.querySelector('.badge-status-interested');
      const badgePurchased = card.querySelector('.badge-status-purchased');

      if (purchasedSet.has(eventId)) {
        card.setAttribute('data-status-state', 'purchased');
        card.classList.remove('is-interested');
        card.classList.add('is-purchased');
        if (btn) {
          btn.classList.remove('active');
          btn.classList.add('purchased');
          btn.textContent = '🎟️';
          btn.title = 'Got Tickets! (Click to unmark)';
        }
        if (badgeInterested) badgeInterested.style.display = 'none';
        if (badgePurchased) badgePurchased.style.display = 'inline-flex';
      } else if (interestedSet.has(eventId)) {
        card.setAttribute('data-status-state', 'interested');
        card.classList.add('is-interested');
        card.classList.remove('is-purchased');
        if (btn) {
          btn.classList.add('active');
          btn.classList.remove('purchased');
          btn.textContent = ICONS.starFilled;
          btn.title = 'Interested! (Click to mark Got Tickets)';
        }
        if (badgeInterested) badgeInterested.style.display = 'inline-flex';
        if (badgePurchased) badgePurchased.style.display = 'none';
      } else {
        card.setAttribute('data-status-state', 'none');
        card.classList.remove('is-interested', 'is-purchased');
        if (btn) {
          btn.classList.remove('active', 'purchased');
          btn.textContent = ICONS.starEmpty;
          btn.title = 'Mark as Interested';
        }
        if (badgeInterested) badgeInterested.style.display = 'none';
        if (badgePurchased) badgePurchased.style.display = 'none';
      }
    });
  }

  function renderInterestedShows() {
    const container = document.getElementById('interested-view');
    if (!container) return;
    container.innerHTML = '';

    const interestedIds = getInterestedIds().map(id => String(id));
    const interestedSet = new Set(interestedIds);
    const allCards = document.querySelectorAll('.calendar-view:not(#interested-view):not(#purchased-view) .event-card');
    let count = 0;

    allCards.forEach(card => {
      const eventId = card.id.replace('card-', '');
      if (interestedSet.has(eventId)) {
        const btnAction = card.querySelector('.btn-interested-toggle');
        const startTimeStr = btnAction ? btnAction.getAttribute('data-start') : '';
        if (isShowActive(startTimeStr)) {
          const clone = card.cloneNode(true);
          clone.style.display = 'grid';
          const delay = Math.min(count, 8) * 0.035;
          clone.style.setProperty('--stagger-delay', `${delay}s`);
          clone.classList.add('card-entering');
          container.appendChild(clone);
          setTimeout(() => {
            clone.classList.remove('card-entering');
            clone.style.removeProperty('--stagger-delay');
          }, (delay + 0.3) * 1000);
          count++;
        }
      }
    });

    if (count === 0) {
      container.innerHTML = `
        <div class="no-events" style="text-align: center; padding: 4rem 1rem; color: var(--text-muted);">
          <span style="font-size: 3rem; display: block; margin-bottom: 1rem; filter: drop-shadow(0 0 10px rgba(245, 158, 11, 0.4));">★</span>
          <h3 style="color: var(--text-bright); font-family: var(--font-header); font-size: 1.8rem; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em;">No Interested Shows</h3>
          <p style="font-size: 0.9rem; max-width: 400px; margin: 0 auto; line-height: 1.6;">Click the star icon on any show card to save it as interested.</p>
        </div>
      `;
    }
  }

  function renderPurchasedShows() {
    const container = document.getElementById('purchased-view');
    if (!container) return;
    container.innerHTML = '';

    const purchasedIds = getPurchasedIds().map(id => String(id));
    const purchasedSet = new Set(purchasedIds);
    const allCards = document.querySelectorAll('.calendar-view:not(#interested-view):not(#purchased-view) .event-card');
    let count = 0;

    allCards.forEach(card => {
      const eventId = card.id.replace('card-', '');
      if (purchasedSet.has(eventId)) {
        const btnAction = card.querySelector('.btn-interested-toggle');
        const startTimeStr = btnAction ? btnAction.getAttribute('data-start') : '';
        if (isShowActive(startTimeStr)) {
          const clone = card.cloneNode(true);
          clone.style.display = 'grid';
          const delay = Math.min(count, 8) * 0.035;
          clone.style.setProperty('--stagger-delay', `${delay}s`);
          clone.classList.add('card-entering');
          container.appendChild(clone);
          setTimeout(() => {
            clone.classList.remove('card-entering');
            clone.style.removeProperty('--stagger-delay');
          }, (delay + 0.3) * 1000);
          count++;
        }
      }
    });

    if (count === 0) {
      container.innerHTML = `
        <div class="no-events" style="text-align: center; padding: 4rem 1rem; color: var(--text-muted);">
          <span style="font-size: 3rem; display: block; margin-bottom: 1rem; filter: drop-shadow(0 0 10px rgba(16, 185, 129, 0.4));">🎟️</span>
          <h3 style="color: var(--text-bright); font-family: var(--font-header); font-size: 1.8rem; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em;">No Purchased Tickets Yet</h3>
          <p style="font-size: 0.9rem; max-width: 400px; margin: 0 auto; line-height: 1.6;">Click the ticket button on an interested show to confirm your purchased tickets!</p>
        </div>
      `;
    }
  }

  function renderVenueGroupedShows(activeMonthTargetId) {
    const container = document.getElementById('venue-grouped-container');
    if (!container) return;
    container.innerHTML = '';

    const checkedVenues = Array.from(document.querySelectorAll('.venue-filter-checkbox:checked')).map(cb => cb.value);
    const checkedVenueSet = new Set(checkedVenues);
    const totalVenueCount = document.querySelectorAll('.venue-filter-checkbox').length;
    const isAllVenuesChecked = checkedVenues.length === 0 || checkedVenues.length >= totalVenueCount;

    const searchQuery = artistSearchInput ? artistSearchInput.value.toLowerCase().trim() : '';
    const ignoredSet = new Set((getIgnoredEventIds ? getIgnoredEventIds() : []).map(id => String(id)));
    const interestedSet = filterInterestedOnly ? new Set(getInterestedIds().map(id => String(id))) : null;

    const regionTokenMap = {};
    if (!activeRegions.has('all')) {
      activeRegions.forEach(rKey => {
        regionTokenMap[rKey] = (regionCities[rKey] || []).map(normalizeLocationToken);
      });
    }

    const monthViews = Array.from(views).filter(v => v.id !== 'interested-view' && v.id !== 'purchased-view' && v.id !== 'venue-grouped-view' && v.id !== 'empty-view');
    
    // Unpack only the active target month view lazily if not unpacked yet
    const activeViewEl = monthViews.find(v => v.id === activeMonthTargetId) || monthViews[0];
    if (activeViewEl) {
      unpackDeferredCards(activeViewEl);
    }

    const venueGroupMap = new Map();

    monthViews.forEach(view => {
      // Skip views that have not been unpacked yet unless it's activeViewEl
      if (view !== activeViewEl && view.querySelector('template.deferred-cards-template')) {
        return;
      }

      view.querySelectorAll('.event-card').forEach(card => {
        const cardCity = card.dataset.city || card.getAttribute('data-city') || '';
        const cardVenue = (card.dataset.venue || card.getAttribute('data-venue') || '').toLowerCase().trim();
        const cardEventId = card.id.replace('card-', '');

        if (ignoredSet.has(cardEventId)) return;

        let show = true;
        const btnAction = card.querySelector('.btn-interested-toggle');
        const startTimeStr = btnAction ? btnAction.getAttribute('data-start') : '';
        if (startTimeStr && !isShowActive(startTimeStr)) show = false;

        if (show && !activeRegions.has('all')) {
          let matchesAnyRegion = false;
          const normalizedCardCity = normalizeLocationToken(cardCity);
          for (const rKey of activeRegions) {
            const targetCities = regionTokenMap[rKey] || [];
            if (containsAnyKeyword(normalizedCardCity, targetCities)) {
              matchesAnyRegion = true;
              break;
            }
          }
          if (!matchesAnyRegion) show = false;
        }

        if (show && !isAllVenuesChecked && !checkedVenueSet.has(cardVenue)) show = false;

        if (show && filterInterestedOnly) {
          if (!interestedSet || !interestedSet.has(cardEventId)) show = false;
        }

        if (show && filterFreeOnly) {
          const freeFlag = String(card.getAttribute('data-free') || '0') === '1';
          if (!freeFlag) show = false;
        }

        if (show && filterJustAnnounced) {
          const createdAtStr = card.getAttribute('data-created-at');
          if (createdAtStr) {
            const createdDate = new Date(createdAtStr);
            const now = new Date();
            const diffDays = (now - createdDate) / (1000 * 60 * 60 * 24);
            if (diffDays > 7) show = false;
          }
        }

        if (show && searchQuery !== '') {
          const searchBlob = (card.dataset.search || card.dataset.searchTextCache || (card.dataset.searchTextCache = card.textContent.toLowerCase())).toLowerCase();
          if (!searchBlob.includes(searchQuery)) show = false;
        }

        if (show && activeGenre !== 'all') {
          const genre = (card.getAttribute('data-genre') || 'all').toLowerCase();
          const tagsStr = (card.getAttribute('data-tags') || '').toLowerCase();
          const cardTags = tagsStr.split(',').map(t => t.trim()).filter(Boolean);
          const renderedTagsCache = card.dataset.renderedTagsCache || (card.dataset.renderedTagsCache = Array.from(card.querySelectorAll('.tag-pill')).map(pill => pill.textContent.toLowerCase().trim()).join('|'));
          const renderedTags = renderedTagsCache ? renderedTagsCache.split('|').filter(Boolean) : [];

          const checkBucketMatch = (bKey) => {
            if (genre === bKey) return true;
            const bTags = genreBuckets[bKey]?.tags || [];
            return cardTags.some(tag => bTags.includes(tag)) || renderedTags.some(tag => bTags.includes(tag));
          };

          if (!checkBucketMatch(activeGenre)) show = false;
        }

        if (show) {
          const venueKey = cardVenue || 'other venue';
          if (!venueGroupMap.has(venueKey)) {
            const matchedObj = Array.isArray(venueData) ? venueData.find(v => String(v?.venue_name || '').toLowerCase() === venueKey) : null;
            const displayName = matchedObj ? matchedObj.venue_name : venueKey.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            venueGroupMap.set(venueKey, { name: displayName, cards: [] });
          }
          venueGroupMap.get(venueKey).cards.push(card);
        }
      });
    });

    const sortedGroups = Array.from(venueGroupMap.values()).sort((a, b) => {
      if (b.cards.length !== a.cards.length) return b.cards.length - a.cards.length;
      return a.name.localeCompare(b.name);
    });

    if (sortedGroups.length === 0) {
      container.innerHTML = `
        <div class="no-events" style="text-align: center; padding: 4rem 1rem; color: var(--text-muted);">
          <span style="font-size: 3rem; display: block; margin-bottom: 1rem; filter: drop-shadow(0 0 10px rgba(6, 182, 212, 0.4));">🏛️</span>
          <h3 style="color: var(--text-bright); font-family: var(--font-header); font-size: 1.8rem; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em;">No Venues Found</h3>
          <p style="font-size: 0.9rem; max-width: 400px; margin: 0 auto; line-height: 1.6;">Try adjusting your venue filters, region selection, or search query.</p>
        </div>
      `;
      return;
    }

    let globalIndex = 0;
    sortedGroups.forEach(group => {
      const section = document.createElement('div');
      section.className = 'venue-group-section';

      const header = document.createElement('div');
      header.className = 'venue-group-header';
      header.innerHTML = `
        <h3 class="venue-group-title">🏛️ ${group.name}</h3>
        <span class="venue-group-count">${group.cards.length} ${group.cards.length === 1 ? 'Show' : 'Shows'}</span>
      `;
      section.appendChild(header);

      const grid = document.createElement('div');
      grid.className = 'events-grid';

      group.cards.forEach(card => {
        const clone = card.cloneNode(true);
        clone.style.display = 'grid';
        const delay = Math.min(globalIndex, 10) * 0.03;
        clone.style.setProperty('--stagger-delay', `${delay}s`);
        clone.classList.add('card-entering');
        grid.appendChild(clone);
        setTimeout(() => {
          clone.classList.remove('card-entering');
          clone.style.removeProperty('--stagger-delay');
        }, (delay + 0.3) * 1000);
        globalIndex++;
      });

      section.appendChild(grid);
      container.appendChild(section);
    });
  }

  function unpackDeferredCards(view) {
    if (!view) return;
    const template = view.querySelector('template.deferred-cards-template');
    if (template) {
      const clone = template.content.cloneNode(true);
      view.appendChild(clone);
      template.remove();
    }
  }

  function applyFilters() {
    const checkedVenues = Array.from(document.querySelectorAll('.venue-filter-checkbox:checked')).map(cb => cb.value);
    const checkedVenueSet = new Set(checkedVenues);
    const selectedCountSpan = document.getElementById('venue-selected-count');
    const totalCount = document.querySelectorAll('.venue-filter-checkbox').length;
    const searchQuery = artistSearchInput ? artistSearchInput.value.toLowerCase().trim() : '';
    const ignoredSet = new Set((getIgnoredEventIds ? getIgnoredEventIds() : []).map(id => String(id)));
    const interestedSet = filterInterestedOnly ? new Set(getInterestedIds().map(id => String(id))) : null;
    const regionTokenMap = {};
    if (!activeRegions.has('all')) {
      activeRegions.forEach(rKey => {
        regionTokenMap[rKey] = (regionCities[rKey] || []).map(normalizeLocationToken);
      });
    }
    let targetId = monthSelect ? monthSelect.value : '';

    if (groupByVenue) {
      const activeMonthTargetId = targetId;
      targetId = 'venue-grouped-view';
      renderVenueGroupedShows(activeMonthTargetId);
    }

    const needsFullUnpack = (searchQuery !== '' || activeGenre !== 'all' || !activeRegions.has('all') || checkedVenues.length < totalCount || filterInterestedOnly || filterJustAnnounced || visibleChunkLimit > CHUNK_SIZE);
    views.forEach(v => {
      if (needsFullUnpack || v.id === targetId) {
        unpackDeferredCards(v);
      }
    });

    if (!filterInterestedOnly && targetId === 'interested-view') {
      if (lastActiveMonthView && document.querySelector(`#month-dropdown-select option[value="${lastActiveMonthView}"]`)) {
        targetId = lastActiveMonthView;
        if (monthSelect) monthSelect.value = targetId;
      } else if (monthSelect) {
        for (let i = 0; i < monthSelect.options.length; i++) {
          const val = monthSelect.options[i].value;
          if (val !== 'interested-view' && val !== 'empty-view' && !monthSelect.options[i].disabled) {
            targetId = val;
            monthSelect.value = targetId;
            break;
          }
        }
      }
    }

    if (selectedCountSpan) {
      if (checkedVenues.length === totalCount) selectedCountSpan.textContent = 'All Venues';
      else if (checkedVenues.length === 0) selectedCountSpan.textContent = '0 Venues';
      else selectedCountSpan.textContent = `${checkedVenues.length} Selected`;
    }

    // Step 1: Calculate visibility for all cards across all views
    const viewVisibleCounts = {};
    const viewTotalMatchingCounts = {};

    views.forEach(view => {
      if (view.id === 'venue-grouped-view') {
        const totalCardsInGrouped = view.querySelectorAll('.event-card').length;
        viewVisibleCounts[view.id] = totalCardsInGrouped;
        viewTotalMatchingCounts[view.id] = totalCardsInGrouped;
        return;
      }

      let visibleCount = 0;
      let visibleIndexInView = 0;

      view.querySelectorAll('.event-card').forEach(card => {
        const cardCity = card.dataset.city;
        const cardVenue = card.dataset.venue;
        let show = true;

        const cardEventIdsStr = card.dataset.eventIds || card.id.replace('card-', '');
        const cardEventIds = cardEventIdsStr.split(',').map(id => id.trim()).filter(Boolean);
        if (cardEventIds.some(id => ignoredSet.has(id))) {
          show = false;
        }

        const startTimeStr = card.dataset.startTime || (() => {
          const btnAction = card.querySelector('.btn-interested-toggle');
          const startVal = btnAction ? (btnAction.getAttribute('data-start') || '') : '';
          card.dataset.startTime = startVal;
          return startVal;
        })();
        if (startTimeStr && !isShowActive(startTimeStr)) {
          show = false;
        }

        if (show && view.id !== 'interested-view') {
          if (show && !activeRegions.has('all')) {
            let matchesAnyRegion = false;
            const normalizedCardCity = normalizeLocationToken(cardCity);
            for (const rKey of activeRegions) {
              const targetCities = regionTokenMap[rKey] || [];
              if (containsAnyKeyword(normalizedCardCity, targetCities)) {
                matchesAnyRegion = true;
                break;
              }
            }
            if (!matchesAnyRegion) show = false;
          }
          if (show && !checkedVenueSet.has(cardVenue)) show = false;
        }

        if (show && filterInterestedOnly) {
          const eventId = card.id.replace('card-', '');
          if (!interestedSet || !interestedSet.has(eventId)) {
            show = false;
          }
        }

        if (show && filterFreeOnly) {
          const freeFlag = String(card.getAttribute('data-free') || '0') === '1';
          if (!freeFlag) {
            show = false;
          }
        }

        if (show && filterJustAnnounced) {
          const createdAtStr = card.getAttribute('data-created-at');
          if (createdAtStr) {
            const createdDate = new Date(createdAtStr);
            const now = new Date();
            const diffDays = (now - createdDate) / (1000 * 60 * 60 * 24);
            if (diffDays > 7) {
              show = false;
            }
          }
        }

        if (show && searchQuery !== '') {
          const searchBlob = (card.dataset.search || card.dataset.searchTextCache || (card.dataset.searchTextCache = card.textContent.toLowerCase())).toLowerCase();
          const isMatch = searchBlob.includes(searchQuery);
          if (!isMatch) {
            show = false;
          }
        }

        if (show && activeGenre !== 'all') {
          const genre = (card.getAttribute('data-genre') || 'all').toLowerCase();
          const tagsStr = (card.getAttribute('data-tags') || '').toLowerCase();
          const cardTags = tagsStr.split(',').map(t => t.trim()).filter(Boolean);
          const renderedTagsCache = card.dataset.renderedTagsCache || (card.dataset.renderedTagsCache = Array.from(card.querySelectorAll('.tag-pill')).map(pill => pill.textContent.toLowerCase().trim()).join('|'));
          const renderedTags = renderedTagsCache ? renderedTagsCache.split('|').filter(Boolean) : [];
          const allCardTags = [...new Set([...cardTags, ...renderedTags])];

          const hasTagInList = (cardTagsList, bucketList) => {
            return cardTagsList.some(tag => bucketList.includes(tag));
          };

          const checkBucketMatch = (bKey) => {
            if (genre === bKey) return true;
            const bTags = genreBuckets[bKey]?.tags || [];
            return hasTagInList(allCardTags, bTags);
          };

          if (!checkBucketMatch(activeGenre)) {
            show = false;
          }
        }

        if (show) {
          visibleIndexInView++;
          if (visibleIndexInView <= visibleChunkLimit) {
            card.classList.remove('card-hiding');
            card.style.display = 'grid';
            // Animate cards only on first reveal to avoid flashing during repeated filter passes.
            if (card.dataset.didEnter !== '1') {
              card.style.setProperty('--stagger-delay', `${Math.min(visibleCount * 0.02, 0.18)}s`);
              card.classList.remove('card-entering');
              card.classList.add('card-entering');
              card.dataset.didEnter = '1';
            }
            visibleCount++;
          } else {
            card.style.display = 'none';
            card.classList.remove('card-hiding', 'card-entering');
          }
        } else {
          card.style.display = 'none';
          card.classList.remove('card-hiding', 'card-entering');
        }
      });

      viewVisibleCounts[view.id] = visibleCount;
      viewTotalMatchingCounts[view.id] = visibleIndexInView;
    });

    // Step 2: Auto-switch month when active text search or Just Announced filter is set and current month has 0 matches
    if (!filterInterestedOnly && (searchQuery !== '' || filterJustAnnounced)) {
      if ((viewVisibleCounts[targetId] || 0) === 0) {
        const monthViews = Array.from(views).filter(v => v.id !== 'interested-view' && v.id !== 'empty-view');
        const firstMatching = monthViews.find(v => (viewVisibleCounts[v.id] || 0) > 0);
        if (firstMatching && firstMatching.id !== targetId) {
          targetId = firstMatching.id;
          if (monthSelect) {
            monthSelect.value = targetId;
            lastActiveMonthView = targetId;
            const monthCustomLabel = monthSelect.parentElement?.querySelector('.custom-select-label') ||
              monthSelect.closest('.custom-select-wrapper')?.querySelector('.custom-select-label');
            const activeOpt = monthSelect.options[monthSelect.selectedIndex];
            if (monthCustomLabel && activeOpt) {
              monthCustomLabel.textContent = activeOpt.textContent;
            }
          }
        }
      }
    }

    // Step 3: Activate target view with smooth fade transition & update UI empty states
    let activeViewVisibleCount = 0;

    views.forEach(view => {
      const isActiveView = (filterInterestedOnly && targetId === 'interested-view') ? (view.id === 'interested-view') : (view.id === targetId);
      const wasActive = view.classList.contains('active');
      const visibleCount = viewVisibleCounts[view.id] || 0;
      const visibleIndexInView = viewTotalMatchingCounts[view.id] || 0;

      view.classList.toggle('active', isActiveView);
      view.style.display = isActiveView ? 'flex' : 'none';

      if (isActiveView && !wasActive) {
        view.style.animation = 'none';
        void view.offsetWidth;
        view.style.animation = 'viewFadeInUp 0.32s cubic-bezier(0.16, 1, 0.3, 1) forwards';
      }

      if (isActiveView) {
        activeViewVisibleCount = visibleCount;
      }

      const hasMoreServer = view.dataset.hasMore === '1';
      const totalGroupsFromServer = Number(view.dataset.totalGroups || 0);
      let loadMoreContainer = view.querySelector('.load-more-container');
      if (isActiveView && (visibleIndexInView > visibleChunkLimit || hasMoreServer)) {
        if (!loadMoreContainer) {
          loadMoreContainer = document.createElement('div');
          loadMoreContainer.className = 'load-more-container';
          loadMoreContainer.innerHTML = `
            <button type="button" class="btn-load-more">
              <span>Load More Shows</span>
            </button>
          `;
          view.appendChild(loadMoreContainer);

          loadMoreContainer.querySelector('.btn-load-more').addEventListener('click', async e => {
            e.preventDefault();
            if (view.dataset.hasMore === '1') {
              const loadedCount = await loadMoreFromServer(view);
              if (loadedCount > 0) {
                visibleChunkLimit += loadedCount;
                applyFilters();
              }
              return;
            }

            visibleChunkLimit += CHUNK_SIZE;
            applyFilters();
          });
        }

        loadMoreContainer.style.display = 'flex';
        const btn = loadMoreContainer.querySelector('.btn-load-more');
        if (btn) {
          const totalLabelCount = totalGroupsFromServer > 0 ? totalGroupsFromServer : visibleIndexInView;
          const isPending = pendingChunkLoads.has(view.id || view.dataset.month || '');
          if (isPending) {
            btn.innerHTML = '<span>Loading...</span>';
            btn.disabled = true;
          } else {
            btn.innerHTML = `<span>Load More Shows (${visibleCount} of ${totalLabelCount})</span>`;
            btn.disabled = false;
          }
        }
      } else if (loadMoreContainer) {
        loadMoreContainer.style.display = 'none';
      }

      let emptyStateEl = view.querySelector('.filter-empty-state');
      if (isActiveView && visibleCount === 0 && view.id !== 'interested-view' && view.id !== 'empty-view') {
        const is0Venues = checkedVenues.length === 0;
        const hasSearch = searchQuery !== '';
        const hasGenre = activeGenre !== 'all';
        const hasRegion = !activeRegions.has('all');
        const genreLabel = genreSelect ? (genreSelect.options[genreSelect.selectedIndex]?.textContent || activeGenre) : activeGenre;

        let emptyCfg = {
          icon: '🎛️',
          title: 'No Filter Matches',
          message: 'No shows match this exact filter combination—try expanding your venue & genre selections or resetting filters.',
          btnText: '🔄 Reset All Filters',
          btnAction: 'reset_all'
        };

        if (is0Venues && !hasSearch && !hasGenre) {
          emptyCfg = {
            icon: '🏛️',
            title: 'No Venues Selected',
            message: 'You have unchecked all venue filters. Try checking your favorite venues or clicking "Select All" below.',
            btnText: '🏛️ Select All Venues',
            btnAction: 'select_all_venues'
          };
        } else if (hasGenre && !hasSearch && !is0Venues) {
          emptyCfg = {
            icon: '🎵',
            title: `No ${genreLabel} Shows Found`,
            message: `No shows match the "${genreLabel}" filter in this month. Try expanding your genre selection or checking other months.`,
            btnText: '🎵 Show All Genres',
            btnAction: 'reset_genre'
          };
        } else if (hasSearch) {
          emptyCfg = {
            icon: '🔍',
            title: `No Matches for "${searchQuery}"`,
            message: `We couldn't find any shows matching "${searchQuery}". Try checking for typos or clearing your search.`,
            btnText: '✕ Clear Search',
            btnAction: 'clear_search'
          };
        } else if (hasRegion && !hasGenre && !hasSearch) {
          emptyCfg = {
            icon: '📍',
            title: 'No Shows in Selected Sub-Area',
            message: 'No shows match your currently active sub-area filter. Try expanding to All Sub-Areas.',
            btnText: '📍 All Sub-Areas',
            btnAction: 'reset_region'
          };
        }

        if (!emptyStateEl) {
          emptyStateEl = document.createElement('div');
          emptyStateEl.className = 'filter-empty-state';
          view.appendChild(emptyStateEl);
        }

        emptyStateEl.innerHTML = `
          <div class="no-events-icon">${emptyCfg.icon}</div>
          <h3 style="color: var(--text-bright); font-family: var(--font-header); font-size: 1.6rem; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.04em;">${emptyCfg.title}</h3>
          <p style="color: var(--text-muted); max-width: 440px; margin: 0 auto; font-size: 0.9rem; line-height: 1.6;">
            ${emptyCfg.message}
          </p>
          <button type="button" class="btn-empty-action" data-action="${emptyCfg.btnAction}">
            ${emptyCfg.btnText}
          </button>
        `;
        emptyStateEl.style.display = 'block';

        const actionBtn = emptyStateEl.querySelector('.btn-empty-action');
        if (actionBtn) {
          actionBtn.addEventListener('click', e => {
            e.preventDefault();
            const act = actionBtn.getAttribute('data-action');
            if (act === 'select_all_venues') {
              if (venueList) {
                venueList.querySelectorAll('.venue-filter-checkbox').forEach(cb => cb.checked = true);
              }
              applyFilters();
            } else if (act === 'reset_genre') {
              activeGenre = 'all';
              if (genreSelect) {
                genreSelect.value = 'all';
                genreSelect.dispatchEvent(new Event('change'));
              }
              applyFilters();
            } else if (act === 'clear_search') {
              if (artistSearchInput) artistSearchInput.value = '';
              syncSearchClearButton();
              updateMarketLinksWithSearch();
              applyFilters();
            } else if (act === 'reset_region') {
              activeRegions.clear();
              activeRegions.add('all');
              document.querySelectorAll('.region-btn').forEach(b => {
                b.classList.toggle('active', b.getAttribute('data-region') === 'all');
              });
              saveActiveRegions();
              applyFilters();
            } else {
              resetAllFilters();
            }
          });
        }
      } else if (emptyStateEl) {
        emptyStateEl.style.display = 'none';
      }
    });

    updateLiveFilterSummary(activeViewVisibleCount, checkedVenues.length, totalCount, searchQuery);



    const eventsContainer = document.querySelector('.events-content');
    if (eventsContainer) {
      eventsContainer.classList.add('is-ready');
    }
  }

  let applyFiltersRaf = null;
  let applyFiltersDebounceTimer = null;

  function scheduleApplyFilters(delayMs = 0) {
    if (applyFiltersDebounceTimer) {
      clearTimeout(applyFiltersDebounceTimer);
      applyFiltersDebounceTimer = null;
    }

    const run = () => {
      if (applyFiltersRaf) {
        cancelAnimationFrame(applyFiltersRaf);
      }
      applyFiltersRaf = requestAnimationFrame(() => {
        applyFiltersRaf = null;
        applyFilters();
      });
    };

    if (delayMs > 0) {
      applyFiltersDebounceTimer = setTimeout(run, delayMs);
      return;
    }

    run();
  }



  function resetAllFilters() {
    resetChunkLimit();
    document.querySelectorAll('.event-card').forEach(card => {
      delete card.dataset.didEnter;
      card.classList.remove('card-entering');
    });
    if (artistSearchInput) artistSearchInput.value = '';
    activeGenre = 'all';
    if (genreSelect) {
      genreSelect.value = 'all';
      genreSelect.dispatchEvent(new Event('change'));
    }
    activeRegions.clear();
    activeRegions.add('all');
    document.querySelectorAll('.region-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-region') === 'all');
    });
    saveActiveRegions();
    if (venueList) {
      venueList.querySelectorAll('.venue-filter-checkbox').forEach(cb => cb.checked = true);
    }
    if (venueSearchInput) venueSearchInput.value = '';
    if (venueList) {
      venueList.querySelectorAll('label').forEach(lbl => lbl.style.display = 'flex');
    }
    syncSearchClearButton();
    updateMarketLinksWithSearch();
    applyFilters();
  }



  function animateInterestedBadge() {
    const customToggle = document.getElementById('month-custom-toggle');
    const btnInterested = document.getElementById('btn-interested-filter');

    if (customToggle) {
      customToggle.classList.remove('pulse-badge');
      void customToggle.offsetWidth;
      customToggle.classList.add('pulse-badge');
    }

    if (btnInterested) {
      btnInterested.classList.remove('pulse-badge');
      void btnInterested.offsetWidth;
      btnInterested.classList.add('pulse-badge');
    }

    setTimeout(() => {
      if (customToggle) customToggle.classList.remove('pulse-badge');
      if (btnInterested) btnInterested.classList.remove('pulse-badge');
    }, 400);
  }

  function syncSearchClearButton() {
    if (!artistSearchInput || !clearSearchButton) return;
    const hasText = artistSearchInput.value.trim() !== '';
    clearSearchButton.style.display = hasText ? 'inline-flex' : 'none';
  }

  if (dropdownToggle) {
    dropdownToggle.addEventListener('click', event => {
      event.stopPropagation();
      dropdownMenu.style.display = dropdownMenu.style.display === 'none' ? 'block' : 'none';
    });
  }
  document.addEventListener('click', () => {
    if (dropdownMenu) dropdownMenu.style.display = 'none';
  });
  if (dropdownMenu) {
    dropdownMenu.addEventListener('click', event => {
      event.stopPropagation();
    });
  }

  document.querySelectorAll('.region-btn[data-region]').forEach(btn => {
    btn.addEventListener('click', () => {
      const regionVal = btn.getAttribute('data-region');
      if (!regionVal) return;

      if (regionVal === 'all') {
        activeRegions.clear();
        activeRegions.add('all');
        document.querySelectorAll('.region-btn').forEach(b => {
          b.classList.toggle('active', b.getAttribute('data-region') === 'all');
        });
      } else {
        activeRegions.delete('all');
        const allBtn = document.querySelector('.region-btn[data-region="all"]');
        if (allBtn) allBtn.classList.remove('active');

        if (activeRegions.has(regionVal)) {
          activeRegions.delete(regionVal);
          btn.classList.remove('active');
        } else {
          activeRegions.add(regionVal);
          btn.classList.add('active');
        }

        const specificBtns = Array.from(document.querySelectorAll('.region-btn[data-region]:not([data-region="all"])'));
        if (activeRegions.size === 0 || activeRegions.size === specificBtns.length) {
          activeRegions.clear();
          activeRegions.add('all');
          document.querySelectorAll('.region-btn').forEach(b => {
            b.classList.toggle('active', b.getAttribute('data-region') === 'all');
          });
        }
      }

      saveActiveRegions();
      resetChunkLimit();
      applyFilters();
    });
  });

  const genreStorageKey = 'gig_grid_active_genre';

  function saveActiveGenre() {
    try {
      localStorage.setItem(genreStorageKey, activeGenre);
    } catch (e) {
      console.warn('Failed to save active genre to localStorage:', e);
    }
  }

  function loadActiveGenre() {
    try {
      const saved = localStorage.getItem(genreStorageKey);
      if (saved && genreSelect && Array.from(genreSelect.options).some(opt => opt.value === saved)) {
        activeGenre = saved;
        genreSelect.value = saved;
      }
    } catch (e) {
      console.warn('Failed to load active genre from localStorage:', e);
    }
  }

  if (genreSelect) {
    loadActiveGenre();
    const updateGenreTooltip = () => {
      const selected = genreSelect.options[genreSelect.selectedIndex];
      const bucket = genreBuckets[selected?.value] || genreBuckets.all;
      if (genreHelpTitle) {
        genreHelpTitle.textContent = bucket?.label || selected?.textContent || 'Genre';
      }
      if (genreHelpText) {
        genreHelpText.textContent = bucket?.title || '';
      }
    };

    updateGenreTooltip();
    genreSelect.addEventListener('change', event => {
      activeGenre = event.target.value;
      saveActiveGenre();
      updateGenreTooltip();
      resetChunkLimit();
      applyFilters();
    });
  }

  if (genreHelpTrigger && genreHelpPanel) {
    const hideHelpPanel = () => {
      genreHelpPanel.classList.remove('fading');
      genreHelpPanel.classList.remove('active');
    };

    const showHelpPanel = () => {
      genreHelpPanel.classList.remove('fading');
      genreHelpPanel.classList.add('active');
    };

    genreHelpTrigger.addEventListener('mouseenter', showHelpPanel);
    genreHelpTrigger.addEventListener('mouseleave', event => {
      if (!genreHelpPanel.contains(event.relatedTarget)) {
        hideHelpPanel();
      }
    });
    genreHelpTrigger.addEventListener('focus', showHelpPanel);
    genreHelpTrigger.addEventListener('blur', hideHelpPanel);

    genreHelpPanel.addEventListener('mouseenter', showHelpPanel);
    genreHelpPanel.addEventListener('mouseleave', event => {
      if (event.relatedTarget !== genreHelpTrigger) {
        hideHelpPanel();
      }
    });
  }

  if (venueSelectAll) {
    venueSelectAll.addEventListener('change', () => {
      document.querySelectorAll('.venue-filter-checkbox').forEach(cb => {
        cb.checked = venueSelectAll.checked;
      });
      resetChunkLimit();
      applyFilters();
    });
  }

  document.addEventListener('change', event => {
    if (event.target && event.target.classList.contains('venue-filter-checkbox')) {
      const cbs = document.querySelectorAll('.venue-filter-checkbox');
      const checked = document.querySelectorAll('.venue-filter-checkbox:checked');
      if (venueSelectAll) {
        venueSelectAll.checked = cbs.length === checked.length;
      }
      resetChunkLimit();
      applyFilters();
    }
  });

  if (monthSelect) {
    monthSelect.addEventListener('change', () => {
      resetChunkLimit();
      const targetId = monthSelect.value;
      if (targetId && targetId.startsWith('month-')) {
        const m = targetId.replace('month-', '');
        const currentUrl = new URL(window.location.href);
        if (currentUrl.searchParams.get('month') !== m) {
          currentUrl.searchParams.set('month', m);
          // Force a full SSR refresh for month switches to avoid stale view/summary state.
          window.location.assign(currentUrl.toString());
          return;
        }
      }
      if (targetId && targetId !== 'interested-view' && targetId !== 'empty-view') {
        lastActiveMonthView = targetId;
      }
      if (targetId === 'interested-view') {
        filterInterestedOnly = true;
        if (btnInterestedFilter) {
          btnInterestedFilter.classList.add('is-active');
          btnInterestedFilter.setAttribute('aria-pressed', 'true');
        }
      } else if (filterInterestedOnly) {
        filterInterestedOnly = false;
        if (btnInterestedFilter) {
          btnInterestedFilter.classList.remove('is-active');
          btnInterestedFilter.setAttribute('aria-pressed', 'false');
        }
      }
      applyFilters();

      // Smoothly scroll back up to top of page / schedule controls
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 40);
    });
  }

  if (btnJustAnnounced) {
    btnJustAnnounced.addEventListener('click', () => {
      filterJustAnnounced = !filterJustAnnounced;
      btnJustAnnounced.classList.toggle('active', filterJustAnnounced);
      btnJustAnnounced.classList.toggle('is-active', filterJustAnnounced);
      resetChunkLimit();
      applyFilters();
    });
  }

  if (btnGroupByVenue) {
    btnGroupByVenue.addEventListener('click', () => {
      groupByVenue = !groupByVenue;
      btnGroupByVenue.classList.toggle('active', groupByVenue);
      resetChunkLimit();
      applyFilters();
    });
  }

  function setupCustomSingleSelect(selectEl) {
    if (!selectEl) return;

    if (selectEl.nextElementSibling && selectEl.nextElementSibling.classList.contains('custom-select-wrapper')) {
      selectEl.nextElementSibling.remove();
    }

    if (selectEl.parentElement && selectEl.parentElement.classList.contains('custom-select-wrapper')) {
      return;
    }

    const originalRect = selectEl.getBoundingClientRect();
    const originalWidth = Math.ceil(originalRect.width || selectEl.offsetWidth || 0);
    const originalHeight = Math.ceil(originalRect.height || selectEl.offsetHeight || 0);

    const wrapper = document.createElement('div');
    wrapper.className = 'custom-select-wrapper';
    if (originalWidth > 0) {
      wrapper.style.minWidth = `${originalWidth}px`;
    }
    if (originalHeight > 0) {
      wrapper.style.minHeight = `${originalHeight}px`;
    }
    selectEl.parentNode.insertBefore(wrapper, selectEl);
    wrapper.appendChild(selectEl);
    selectEl.style.cssText = 'display: none !important;';

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'custom-select-toggle';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'custom-select-label';

    const caretSpan = document.createElement('span');
    caretSpan.className = 'dropdown-caret';
    caretSpan.textContent = '▼';

    toggleBtn.appendChild(labelSpan);
    toggleBtn.appendChild(caretSpan);
    wrapper.appendChild(toggleBtn);

    const menu = document.createElement('div');
    menu.className = 'custom-select-menu';
    wrapper.appendChild(menu);

    function syncOptions() {
      menu.innerHTML = '';
      Array.from(selectEl.options).forEach(opt => {
        if (opt.value === 'empty-view') return;
        if (opt.hidden || opt.style.display === 'none') return;
        const item = document.createElement('div');
        item.className = 'custom-select-option' + (opt.value === selectEl.value ? ' selected' : '');
        item.textContent = opt.textContent;
        item.dataset.value = opt.value;

        item.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          selectEl.value = opt.value;
          selectEl.dispatchEvent(new Event('change', { bubbles: true }));
          closeMenu();
        });
        menu.appendChild(item);
      });

      const activeOpt = selectEl.options[selectEl.selectedIndex];
      labelSpan.textContent = activeOpt ? activeOpt.textContent : '';
    }

    function closeMenu() {
      menu.classList.remove('open');
      toggleBtn.classList.remove('active');
      wrapper.classList.remove('is-open');
    }

    function openMenu() {
      document.querySelectorAll('.custom-select-wrapper.is-open').forEach(w => w.classList.remove('is-open'));
      document.querySelectorAll('.custom-select-menu.open').forEach(m => m.classList.remove('open'));
      document.querySelectorAll('.custom-select-toggle.active').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.links-popover').forEach(p => { p.style.display = 'none'; p.classList.remove('open'); });
      document.querySelectorAll('.btn-links-toggle.active').forEach(b => b.classList.remove('active'));
      if (dropdownMenu) dropdownMenu.style.display = 'none';

      syncOptions();
      menu.classList.add('open');
      toggleBtn.classList.add('active');
      wrapper.classList.add('is-open');
    }

    toggleBtn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      const isOpen = menu.classList.contains('open');
      if (isOpen) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    selectEl.addEventListener('change', () => {
      const activeOpt = selectEl.options[selectEl.selectedIndex];
      labelSpan.textContent = activeOpt ? activeOpt.textContent : '';
      syncOptions();
    });

    document.addEventListener('click', e => {
      if (!wrapper.contains(e.target)) {
        closeMenu();
      }
    });

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        closeMenu();
      }
    });

    syncOptions();
  }

  if (document.body && document.body.classList.contains('select-enhancing')) {
    document.body.classList.remove('select-enhancing');
  }

  function updateMarketLinksWithSearch() {
    const query = artistSearchInput ? artistSearchInput.value.trim() : '';

    const currentUrl = new URL(window.location.href);
    if (query) {
      currentUrl.searchParams.set('q', query);
    } else {
      currentUrl.searchParams.delete('q');
    }
    window.history.replaceState({}, '', currentUrl.pathname + currentUrl.search);
  }

  // Pre-fill search input from URL parameter if present
  const urlParams = new URLSearchParams(window.location.search);
  const queryParam = urlParams.get('q') || urlParams.get('search');
  if (queryParam && artistSearchInput && !artistSearchInput.value) {
    artistSearchInput.value = queryParam;
    syncSearchClearButton();
  }

  if (artistSearchInput) {
    artistSearchInput.addEventListener('input', () => {
      syncSearchClearButton();
      updateMarketLinksWithSearch();
      resetChunkLimit();
      scheduleApplyFilters(90);
    });
  }

  if (clearSearchButton && artistSearchInput) {
    clearSearchButton.addEventListener('click', () => {
      artistSearchInput.value = '';
      syncSearchClearButton();
      updateMarketLinksWithSearch();
      resetChunkLimit();
      applyFilters();
      artistSearchInput.focus();
    });
  }

  updateMarketLinksWithSearch();

  // Handle Status Popover Menu Toggles & Item Clicks
  document.addEventListener('click', event => {
    // 1. Toggle Button Click -> Open/Close Popover Menu
    const toggleBtn = event.target.closest('.btn-interested-toggle');
    if (toggleBtn) {
      event.preventDefault();
      event.stopPropagation();
      
      const wrapper = toggleBtn.closest('.status-menu-wrapper');
      const menu = wrapper ? wrapper.querySelector('.status-popover-menu') : null;
      const isOpen = menu ? menu.classList.contains('open') : false;

      // Close all open popover menus first
      document.querySelectorAll('.status-popover-menu.open').forEach(m => m.classList.remove('open'));

      if (menu && !isOpen) {
        menu.classList.add('open');
      }
      return;
    }

    // 2. Menu Item Action Click
    const menuItem = event.target.closest('.status-popover-item');
    if (menuItem) {
      event.preventDefault();
      event.stopPropagation();
      const action = menuItem.getAttribute('data-action');
      const eventId = menuItem.getAttribute('data-id');

      let interestedIds = getInterestedIds().map(id => String(id));
      let purchasedIds = getPurchasedIds().map(id => String(id));

      if (action === 'interested') {
        if (!interestedIds.includes(String(eventId))) interestedIds.push(String(eventId));
        purchasedIds = purchasedIds.filter(id => id !== String(eventId));
      } else if (action === 'purchased') {
        if (!purchasedIds.includes(String(eventId))) purchasedIds.push(String(eventId));
        interestedIds = interestedIds.filter(id => id !== String(eventId));
      } else if (action === 'clear') {
        interestedIds = interestedIds.filter(id => id !== String(eventId));
        purchasedIds = purchasedIds.filter(id => id !== String(eventId));
      }

      saveInterestedIds(interestedIds);
      savePurchasedIds(purchasedIds);
      updateInterestedCards();
      renderInterestedShows();
      renderPurchasedShows();
      animateInterestedBadge();
      applyFilters();

      // Close menu
      document.querySelectorAll('.status-popover-menu.open').forEach(m => m.classList.remove('open'));
      return;
    }

    // 3. Click outside closes popover menus
    if (!event.target.closest('.status-menu-wrapper')) {
      document.querySelectorAll('.status-popover-menu.open').forEach(m => m.classList.remove('open'));
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.status-popover-menu.open').forEach(m => m.classList.remove('open'));
    }
  });

  if (btnInterestedFilter) {
    btnInterestedFilter.setAttribute('aria-pressed', 'false');
    btnInterestedFilter.addEventListener('click', () => {
      resetChunkLimit();
      filterInterestedOnly = !filterInterestedOnly;
      btnInterestedFilter.classList.toggle('is-active', filterInterestedOnly);
      btnInterestedFilter.setAttribute('aria-pressed', filterInterestedOnly ? 'true' : 'false');

      if (filterInterestedOnly && monthSelect) {
        monthSelect.value = 'interested-view';
        monthSelect.dispatchEvent(new Event('change'));
      } else if (!filterInterestedOnly && monthSelect && monthSelect.value === 'interested-view') {
        if (lastActiveMonthView && document.querySelector(`#month-dropdown-select option[value="${lastActiveMonthView}"]`)) {
          monthSelect.value = lastActiveMonthView;
        } else {
          for (let i = 0; i < monthSelect.options.length; i++) {
            if (monthSelect.options[i].value !== 'interested-view') {
              monthSelect.selectedIndex = i;
              break;
            }
          }
        }
        monthSelect.dispatchEvent(new Event('change'));
      } else {
        applyFilters();
      }
    });
  }

  if (btnFreeFilter) {
    btnFreeFilter.setAttribute('aria-pressed', 'false');
    btnFreeFilter.addEventListener('click', () => {
      resetChunkLimit();
      filterFreeOnly = !filterFreeOnly;
      btnFreeFilter.classList.toggle('is-active', filterFreeOnly);
      btnFreeFilter.setAttribute('aria-pressed', filterFreeOnly ? 'true' : 'false');
      applyFilters();
    });
  }

  document.addEventListener('click', event => {
    const ignoreBtn = event.target.closest('.btn-ignore-event');
    if (!ignoreBtn) return;

    event.preventDefault();
    event.stopPropagation();
    const card = ignoreBtn.closest('.event-card');
    const idsStr = ignoreBtn.getAttribute('data-event-ids') || (card ? card.id.replace('card-', '') : '');
    const idsToIgnore = idsStr.split(',').map(id => id.trim()).filter(Boolean);

    let currentIgnored = getIgnoredEventIds ? getIgnoredEventIds() : [];
    idsToIgnore.forEach(id => {
      if (!currentIgnored.includes(id)) {
        currentIgnored.push(id);
      }
    });
    if (saveIgnoredEventIds) saveIgnoredEventIds(currentIgnored);

    if (card) {
      card.classList.add('card-hiding');
      setTimeout(() => {
        applyFilters();
        updateResetIgnoredButton();
      }, 180);
    } else {
      applyFilters();
      updateResetIgnoredButton();
    }
  });

  if (btnResetIgnored) {
    btnResetIgnored.addEventListener('click', e => {
      e.preventDefault();
      resetChunkLimit();
      if (saveIgnoredEventIds) saveIgnoredEventIds([]);
      document.querySelectorAll('.event-card').forEach(c => c.classList.remove('card-hiding'));
      if (artistSearchInput) {
        artistSearchInput.value = '';
        syncSearchClearButton();
        updateMarketLinksWithSearch();
      }
      updateResetIgnoredButton();
      applyFilters();
    });
  }

  let isScrollingToLoad = false;
  let autoExpandFollowUpQueued = false;

  function scheduleAutoExpandRecheck(delayMs = 0) {
    if (autoExpandFollowUpQueued) return;
    autoExpandFollowUpQueued = true;
    window.setTimeout(() => {
      autoExpandFollowUpQueued = false;
      checkAndTriggerAutoExpand();
    }, delayMs);
  }

  async function checkAndTriggerAutoExpand() {
    if (isScrollingToLoad) return;
    const activeView = document.querySelector('.calendar-view.active');
    if (!activeView) return;

    const loadMoreContainer = activeView.querySelector('.load-more-container');
    if (!loadMoreContainer || loadMoreContainer.style.display === 'none') return;

    const rect = loadMoreContainer.getBoundingClientRect();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;

    if (rect.top <= viewportHeight + 400) {
      isScrollingToLoad = true;
      try {
        if (activeView.dataset.hasMore === '1') {
          const loadedCount = await loadMoreFromServer(activeView);
          if (loadedCount > 0) {
            visibleChunkLimit += loadedCount;
            applyFilters();
          }
        } else {
          visibleChunkLimit += CHUNK_SIZE;
          applyFilters();
        }
      } finally {
        setTimeout(() => {
          isScrollingToLoad = false;
        }, 250);
      }
    }
  }

  ['scroll', 'resize', 'wheel', 'touchmove'].forEach(evt => {
    window.addEventListener(evt, checkAndTriggerAutoExpand, { passive: true });
  });

  updateResetIgnoredButton();
  updateInterestedCards();
  renderInterestedShows();
  renderPurchasedShows();
  syncSearchClearButton();
  applyFilters();
  // Kick off auto-expand on first paint in case no scroll/wheel events fire.
  scheduleAutoExpandRecheck(60);

  return {
    applyFilters,
    getFilterInterestedOnly: () => filterInterestedOnly,
    updateInterestedCards,
    renderInterestedShows,
    renderPurchasedShows,
    renderVenueGroupedShows
  };
}
