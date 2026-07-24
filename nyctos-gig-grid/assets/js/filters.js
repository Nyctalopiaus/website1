import { ICONS, findVenueDetails } from './utils.js';

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

export function initFilters({ venueData, genreBuckets, getInterestedIds, saveInterestedIds, getIgnoredEventIds, saveIgnoredEventIds }) {
  const venueList = document.getElementById('venue-checkboxes-list');
  const dropdownToggle = document.getElementById('venue-dropdown-toggle');
  const dropdownMenu = document.getElementById('venue-dropdown-menu');
  const venueSelectAll = document.getElementById('venue-select-all');
  const monthSelect = document.getElementById('month-dropdown-select');
  const views = document.querySelectorAll('.calendar-view');
  const artistSearchInput = document.getElementById('artist-search-input');
  const clearSearchButton = document.getElementById('btn-clear-search');
  const btnInterestedFilter = document.getElementById('btn-interested-filter');
  const cards = document.querySelectorAll('.events-content .event-card');
  const genreHelpTrigger = document.getElementById('genre-help-trigger');
  const genreHelpPanel = document.getElementById('genre-help-panel');
  const genreHelpTitle = document.getElementById('genre-help-title');
  const genreHelpText = document.getElementById('genre-help-text');

  let activeRegion = 'all';
  let activeGenre = 'all';
  let filterInterestedOnly = false;
  let lastActiveMonthView = (monthSelect && monthSelect.value !== 'interested-view') ? monthSelect.value : null;
  const activeMarket = document.body?.dataset?.market || 'front-range';

  const btnResetIgnored = document.getElementById('btn-reset-ignored');
  const resetIgnoredLabel = document.getElementById('reset-ignored-label');

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
    'front-range': {
      springs: ['colorado springs', 'pueblo', 'castle rock'],
      denver: ['denver', 'boulder', 'golden', 'morrison', 'englewood', 'littleton', 'arvada', 'westminster', 'thornton'],
      north: ['fort collins', 'greeley', 'loveland', 'longmont', 'bellvue']
    },
    socal: {
      la: ['los angeles', 'la', 'inglewood', 'hollywood'],
      oc: ['anaheim', 'santa ana', 'orange', 'fullerton', 'costa mesa', 'irvine'],
      sd: ['san diego', 'chula vista', 'la mesa', 'el cajon', 'oceanside']
    },
    scotland: {
      glasgow: ['glasgow', 'glasgow scotland'],
      edinburgh: ['edinburgh', 'edinburgh scotland'],
      other: ['dundee', 'aberdeen', 'stirling', 'perth', 'falkirk', 'paisley', 'inverness']
    }
  };
  const regionCities = regionCitiesByMarket[activeMarket] || regionCitiesByMarket['front-range'];

  const venuesSet = new Set();
  cards.forEach(card => {
    if (card.dataset.venue) {
      const rawVenue = card.dataset.venue.trim().toLowerCase();
      const matched = findVenueDetails(venueData, rawVenue);
      const normalized = matched ? matched.venue_name.toLowerCase() : rawVenue;
      card.dataset.venue = normalized;
      venuesSet.add(normalized);
    }
  });

  const sortedVenues = Array.from(venuesSet).map(venue => {
    const matched = venueData.find(item => item.venue_name.toLowerCase() === venue);
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
    const option = document.getElementById('interested-dropdown-option');
    const btnFilter = document.getElementById('btn-interested-filter');
    const allCards = document.querySelectorAll('.calendar-view:not(#interested-view) .event-card');
    let count = 0;

    allCards.forEach(card => {
      const eventId = card.id.replace('card-', '');
      if (!interestedSet.has(eventId)) return;
      const btnAction = card.querySelector('.btn-interested-toggle');
      const startTimeStr = btnAction ? btnAction.getAttribute('data-start') : '';
      if (isShowActive(startTimeStr)) {
        count++;
      }
    });

    if (option) {
      option.textContent = `${ICONS.star} Interested Shows (${count})`;
    }

    if (btnFilter) {
      const labelSpan = btnFilter.querySelector('.btn-premium-filter-label');
      if (labelSpan) {
        labelSpan.textContent = count > 0 ? `Interested Only (${count})` : 'Interested Only';
      }
    }

    document.querySelectorAll('.event-card').forEach(card => {
      const eventId = card.id.replace('card-', '');
      const btn = card.querySelector('.btn-interested-toggle');
      if (interestedSet.has(eventId)) {
        card.classList.add('is-interested');
        if (btn) {
          btn.classList.add('active');
          btn.textContent = ICONS.starFilled;
          btn.title = 'Interested!';
        }
      } else {
        card.classList.remove('is-interested');
        if (btn) {
          btn.classList.remove('active');
          btn.textContent = ICONS.starEmpty;
          btn.title = 'Mark as Interested';
        }
      }
    });
  }

  function renderInterestedShows() {
    const container = document.getElementById('interested-view');
    if (!container) return;
    container.innerHTML = '';

    const interestedIds = getInterestedIds().map(id => String(id));
    const interestedSet = new Set(interestedIds);
    const allCards = document.querySelectorAll('.calendar-view:not(#interested-view) .event-card');
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
          <span style="font-size: 3rem; display: block; margin-bottom: 1rem; filter: drop-shadow(0 0 10px rgba(245, 158, 11, 0.4));">${ICONS.star}</span>
          <h3 style="color: var(--text-bright); font-family: var(--font-header); font-size: 1.8rem; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em;">No Interested Shows</h3>
          <p style="font-size: 0.9rem; max-width: 400px; margin: 0 auto; line-height: 1.6;">Click the star icon on any concert card to save it here and keep track of your schedule.</p>
        </div>
      `;
    }
  }

  function applyFilters() {
    const checkedVenues = Array.from(document.querySelectorAll('.venue-filter-checkbox:checked')).map(cb => cb.value);
    const selectedCountSpan = document.getElementById('venue-selected-count');
    const totalCount = document.querySelectorAll('.venue-filter-checkbox').length;
    const searchQuery = artistSearchInput ? artistSearchInput.value.toLowerCase().trim() : '';
    let targetId = monthSelect ? monthSelect.value : '';
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

    if (searchQuery === '' && !filterInterestedOnly && lastActiveMonthView) {
      if (document.querySelector(`#month-dropdown-select option[value="${lastActiveMonthView}"]`)) {
        targetId = lastActiveMonthView;
        if (monthSelect && monthSelect.value !== targetId) {
          monthSelect.value = targetId;
          const monthCustomLabel = monthSelect.parentElement?.querySelector('.custom-select-label') ||
                                 monthSelect.closest('.custom-select-wrapper')?.querySelector('.custom-select-label');
          const activeOpt = monthSelect.options[monthSelect.selectedIndex];
          if (monthCustomLabel && activeOpt) {
            monthCustomLabel.textContent = activeOpt.textContent;
          }
        }
      }
    }

    if (selectedCountSpan) {
      if (checkedVenues.length === totalCount) selectedCountSpan.textContent = 'All Venues';
      else if (checkedVenues.length === 0) selectedCountSpan.textContent = '0 Venues';
      else selectedCountSpan.textContent = `${checkedVenues.length} Selected`;
    }

    views.forEach(view => {
      let visibleCount = 0;
      let visibleIndexInView = 0;
      const wasActiveView = view.classList.contains('active');
      view.querySelectorAll('.event-card').forEach(card => {
        const cardCity = card.dataset.city;
        const cardVenue = card.dataset.venue;
        let show = true;

        const cardEventIdsStr = card.dataset.eventIds || card.id.replace('card-', '');
        const cardEventIds = cardEventIdsStr.split(',').map(id => id.trim()).filter(Boolean);
        const ignoredIds = (getIgnoredEventIds ? getIgnoredEventIds() : []).map(id => String(id));
        if (cardEventIds.some(id => ignoredIds.includes(id))) {
          show = false;
        }

        const btnAction = card.querySelector('.btn-interested-toggle');
        const startTimeStr = btnAction ? btnAction.getAttribute('data-start') : '';
        if (startTimeStr && !isShowActive(startTimeStr)) {
          show = false;
        }

        if (show && view.id !== 'interested-view') {
          if (show && activeRegion !== 'all') {
            const targetCities = (regionCities[activeRegion] || []).map(normalizeLocationToken);
            const normalizedCardCity = normalizeLocationToken(cardCity);
            if (!containsAnyKeyword(normalizedCardCity, targetCities)) show = false;
          }
          if (show && !checkedVenues.includes(cardVenue)) show = false;
        }

        if (show && filterInterestedOnly) {
          const eventId = card.id.replace('card-', '');
          const interestedIds = getInterestedIds().map(id => String(id));
          if (!interestedIds.includes(eventId)) {
            show = false;
          }
        }

        if (show && searchQuery !== '') {
          const searchBlob = (card.dataset.search || '').toLowerCase();
          const cardText = card.textContent.toLowerCase();
          const isMatch = searchBlob.includes(searchQuery) ||
                          cardText.includes(searchQuery);
          if (!isMatch) {
            show = false;
          }
        }

        if (show && activeGenre !== 'all') {
          const genre = (card.getAttribute('data-genre') || 'metal').toLowerCase();
          const tagsStr = (card.getAttribute('data-tags') || '').toLowerCase();
          const cardTags = tagsStr.split(',').map(t => t.trim()).filter(Boolean);
          const renderedTags = Array.from(card.querySelectorAll('.tag-pill')).map(pill => pill.textContent.toLowerCase().trim());
          const allCardTags = [...new Set([...cardTags, ...renderedTags])];

          const punkTags = genreBuckets.punk?.tags || [];
          const indieTags = genreBuckets.indie?.tags || [];
          const metalTags = genreBuckets.metal?.tags || [];

          const hasTagInList = (cardTagsList, bucketList) => {
            return cardTagsList.some(tag => bucketList.includes(tag));
          };

          const checkBucketMatch = (bKey) => {
            if (genre === bKey) return true;
            const bTags = genreBuckets[bKey]?.tags || [];
            return hasTagInList(allCardTags, bTags);
          };

          let hasAnyBucketMatch = false;
          Object.keys(genreBuckets).forEach(bKey => {
            if (bKey !== 'all') {
              if (checkBucketMatch(bKey)) {
                hasAnyBucketMatch = true;
              }
            }
          });

          const matchGenre = () => {
            if (activeGenre === 'metal') {
              return checkBucketMatch('metal') || !hasAnyBucketMatch;
            }
            return checkBucketMatch(activeGenre);
          };

          if (!matchGenre()) {
            show = false;
          }
        }

        if (show) {
          card.classList.remove('card-hiding');
          card.style.display = 'grid';
          visibleCount++;
          visibleIndexInView++;
        } else {
          card.style.display = 'none';
          card.classList.remove('card-hiding');
        }
      });

      const isActiveView = (filterInterestedOnly && targetId === 'interested-view') ? (view.id === 'interested-view') : (view.id === targetId);

      if (isActiveView && !wasActiveView) {
        view.classList.remove('active');
        void view.offsetWidth;
        view.classList.add('active');
      } else if (!isActiveView) {
        view.classList.remove('active');
      }

      let emptyStateEl = view.querySelector('.filter-empty-state');
      if (isActiveView && visibleCount === 0 && view.id !== 'interested-view' && view.id !== 'empty-view') {
        if (!emptyStateEl) {
          emptyStateEl = document.createElement('div');
          emptyStateEl.className = 'filter-empty-state';
          emptyStateEl.innerHTML = `
            <div class="no-events-icon" style="filter: drop-shadow(0 0 12px rgba(239, 68, 68, 0.3));">🔍</div>
            <h3 style="color: var(--text-bright); font-family: var(--font-header); font-size: 1.6rem; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.04em;">No Matches Found</h3>
            <p style="color: var(--text-muted); max-width: 440px; margin: 0 auto; font-size: 0.9rem; line-height: 1.6;">
              No shows match this exact filter combination. Try clearing your search query or expanding your venue & genre selections.
            </p>
            <button type="button" class="btn-reset-filters" style="margin-top: 1.25rem; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.15); color: #fff; padding: 0.5rem 1.2rem; border-radius: 6px; font-size: 0.8rem; font-weight: 700; cursor: pointer; transition: all 0.2s ease;">
              🔄 Reset Filters
            </button>
          `;
          view.appendChild(emptyStateEl);

          emptyStateEl.querySelector('.btn-reset-filters').addEventListener('click', e => {
            e.preventDefault();
            resetAllFilters();
          });
        } else {
          emptyStateEl.style.display = 'block';
        }
      } else if (emptyStateEl) {
        emptyStateEl.style.display = 'none';
      }
    });

    if (searchQuery !== '' && !filterInterestedOnly) {
      autoSwitchToFirstMatchingMonth();
    }
  }

  function autoSwitchToFirstMatchingMonth() {
    if (!monthSelect) return;

    const currentMonthView = document.getElementById(monthSelect.value);
    const hasVisibleCardsInCurrent = currentMonthView && Array.from(currentMonthView.querySelectorAll('.event-card')).some(c => c.style.display === 'grid');

    if (hasVisibleCardsInCurrent) return;

    const monthViews = Array.from(views).filter(v => v.id !== 'interested-view' && v.id !== 'empty-view');
    const firstMatchingView = monthViews.find(v => {
      return Array.from(v.querySelectorAll('.event-card')).some(c => c.style.display === 'grid');
    });

    if (!firstMatchingView || monthSelect.value === firstMatchingView.id) return;

    monthSelect.value = firstMatchingView.id;
    lastActiveMonthView = firstMatchingView.id;

    const monthCustomLabel = monthSelect.parentElement?.querySelector('.custom-select-label') ||
      monthSelect.closest('.custom-select-wrapper')?.querySelector('.custom-select-label');
    const activeOpt = monthSelect.options[monthSelect.selectedIndex];
    if (monthCustomLabel && activeOpt) {
      monthCustomLabel.textContent = activeOpt.textContent;
    }
    views.forEach(v => {
      v.classList.toggle('active', v.id === firstMatchingView.id);
    });
  }

  function resetAllFilters() {
    if (artistSearchInput) artistSearchInput.value = '';
    activeGenre = 'all';
    if (genreSelect) {
      genreSelect.value = 'all';
      genreSelect.dispatchEvent(new Event('change'));
    }
    activeRegion = 'all';
    document.querySelectorAll('.region-btn').forEach(b => {
      b.classList.toggle('active', b.getAttribute('data-region') === 'all');
    });
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

  function moveToFirstVisibleMonthView() {
    if (!monthSelect) return;

    const monthViews = Array.from(views).filter(v => v.id !== 'interested-view' && v.id !== 'empty-view');
    const firstVisible = monthViews.find(v => {
      const visibleCard = Array.from(v.querySelectorAll('.event-card')).find(c => c.style.display !== 'none');
      return !!visibleCard;
    });

    if (!firstVisible || monthSelect.value === firstVisible.id) return;

    monthSelect.value = firstVisible.id;
    const monthCustomLabel = monthSelect.parentElement?.querySelector('.custom-select-label') ||
      monthSelect.closest('.custom-select-wrapper')?.querySelector('.custom-select-label');
    const activeOpt = monthSelect.options[monthSelect.selectedIndex];
    if (monthCustomLabel && activeOpt) {
      monthCustomLabel.textContent = activeOpt.textContent;
    }
    monthSelect.dispatchEvent(new Event('change', { bubbles: true }));
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

  document.querySelectorAll('.region-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.region-btn').forEach(button => button.classList.remove('active'));
      btn.classList.add('active');
      activeRegion = btn.getAttribute('data-region');
      applyFilters();
    });
  });

  const genreSelect = document.getElementById('genre-select');
  if (genreSelect) {
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
      updateGenreTooltip();
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
      applyFilters();
    }
  });

  if (monthSelect) {
    monthSelect.addEventListener('change', () => {
      const targetId = monthSelect.value;
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

    const wrapper = document.createElement('div');
    wrapper.className = 'custom-select-wrapper';
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
    }

    function openMenu() {
      document.querySelectorAll('.custom-select-menu.open').forEach(m => m.classList.remove('open'));
      document.querySelectorAll('.custom-select-toggle.active').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.links-popover').forEach(p => { p.style.display = 'none'; p.classList.remove('open'); });
      document.querySelectorAll('.btn-links-toggle.active').forEach(b => b.classList.remove('active'));
      if (dropdownMenu) dropdownMenu.style.display = 'none';

      syncOptions();
      menu.classList.add('open');
      toggleBtn.classList.add('active');
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

  setupCustomSingleSelect(genreSelect);
  setupCustomSingleSelect(monthSelect);

  function updateMarketLinksWithSearch() {
    const query = artistSearchInput ? artistSearchInput.value.trim() : '';
    const marketLinks = document.querySelectorAll('.header-market-link');
    
    marketLinks.forEach(link => {
      try {
        const url = new URL(link.href, window.location.origin);
        if (query) {
          url.searchParams.set('q', query);
        } else {
          url.searchParams.delete('q');
        }
        link.href = url.pathname + url.search;
      } catch (e) {}
    });

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
      applyFilters();
    });
  }

  if (clearSearchButton && artistSearchInput) {
    clearSearchButton.addEventListener('click', () => {
      artistSearchInput.value = '';
      syncSearchClearButton();
      updateMarketLinksWithSearch();
      applyFilters();
      artistSearchInput.focus();
    });
  }

  updateMarketLinksWithSearch();

  document.addEventListener('click', event => {
    const btn = event.target.closest('.btn-interested-toggle');
    if (!btn) return;

    event.preventDefault();
    event.stopPropagation();
    const eventId = btn.getAttribute('data-id');
    let interestedIds = getInterestedIds();
    if (interestedIds.includes(eventId)) {
      interestedIds = interestedIds.filter(id => id !== eventId);
    } else {
      interestedIds.push(eventId);
    }
    saveInterestedIds(interestedIds);
    updateInterestedCards();
    renderInterestedShows();
    animateInterestedBadge();
    if (filterInterestedOnly) applyFilters();
  });

  if (btnInterestedFilter) {
    btnInterestedFilter.setAttribute('aria-pressed', 'false');
    btnInterestedFilter.addEventListener('click', () => {
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
      if (saveIgnoredEventIds) saveIgnoredEventIds([]);
      document.querySelectorAll('.event-card').forEach(c => c.classList.remove('card-hiding'));
      if (artistSearchInput) {
        artistSearchInput.value = '';
        syncSearchClearButton();
        updateMarketLinksWithSearch();
      }
      updateResetIgnoredButton();
      applyFilters();
      moveToFirstVisibleMonthView();
    });
  }

  updateResetIgnoredButton();
  updateInterestedCards();
  renderInterestedShows();
  syncSearchClearButton();
  applyFilters();

  return {
    applyFilters,
    getFilterInterestedOnly: () => filterInterestedOnly,
    updateInterestedCards,
    renderInterestedShows
  };
}
