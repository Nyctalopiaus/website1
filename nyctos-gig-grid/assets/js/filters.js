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

export function initFilters({ venueData, genreBuckets, getInterestedIds, saveInterestedIds }) {
  const venueList = document.getElementById('venue-checkboxes-list');
  const dropdownToggle = document.getElementById('venue-dropdown-toggle');
  const dropdownMenu = document.getElementById('venue-dropdown-menu');
  const venueSelectAll = document.getElementById('venue-select-all');
  const monthSelect = document.getElementById('month-dropdown-select');
  const views = document.querySelectorAll('.calendar-view');
  const artistSearchInput = document.getElementById('artist-search-input');
  const btnInterestedFilter = document.getElementById('btn-interested-filter');
  const cards = document.querySelectorAll('.events-content .event-card');
  const genreHelpTrigger = document.getElementById('genre-help-trigger');
  const genreHelpPanel = document.getElementById('genre-help-panel');
  const genreHelpTitle = document.getElementById('genre-help-title');
  const genreHelpText = document.getElementById('genre-help-text');

  let activeRegion = 'all';
  let activeGenre = 'all';
  let filterInterestedOnly = false;
  const activeMarket = document.body?.dataset?.market || 'front-range';

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

  function updateInterestedCards() {
    const interestedIds = getInterestedIds();
    const interestedSet = new Set(interestedIds);
    const option = document.getElementById('interested-dropdown-option');
    if (option) {
      const allCards = document.querySelectorAll('.calendar-view:not(#interested-view) .event-card');
      let count = 0;
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      allCards.forEach(card => {
        const eventId = card.id.replace('card-', '');
        if (!interestedSet.has(eventId)) return;
        const btnAction = card.querySelector('.btn-interested-toggle');
        const startTimeStr = btnAction ? btnAction.getAttribute('data-start') : '';
        if (startTimeStr && new Date(startTimeStr) >= now) {
          count++;
        }
      });
      option.textContent = `${ICONS.star} Interested Shows (${count})`;
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

    const interestedIds = getInterestedIds();
    const allCards = document.querySelectorAll('.calendar-view:not(#interested-view) .event-card');
    let count = 0;
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    allCards.forEach(card => {
      const eventId = card.id.replace('card-', '');
      if (!interestedIds.includes(eventId)) return;
      const btnAction = card.querySelector('.btn-interested-toggle');
      const startTimeStr = btnAction ? btnAction.getAttribute('data-start') : '';
      if (startTimeStr && new Date(startTimeStr) >= now) {
        const clone = card.cloneNode(true);
        clone.style.display = 'grid';
        container.appendChild(clone);
        count++;
      }
    });

    if (count === 0) {
      container.innerHTML = `
        <div class="no-events" style="text-align: center; padding: 4rem 1rem; color: var(--text-muted);">
          <span style="font-size: 3rem; display: block; margin-bottom: 1rem; filter: drop-shadow(0 0 10px rgba(245, 158, 11, 0.4));">${ICONS.star}</span>
          <h3 style="color: var(--text-bright); font-family: var(--font-header); font-size: 1.8rem; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em;">No Interested Shows</h3>
          <p style="font-size: 0.9rem; max-width: 400px; margin: 0 auto; line-height: 1.6;">Click the star icon on any upcoming concert card to save it here and keep track of your schedule.</p>
        </div>
      `;
    }
  }

  function applyFilters() {
    const checkedVenues = Array.from(document.querySelectorAll('.venue-filter-checkbox:checked')).map(cb => cb.value);
    const selectedCountSpan = document.getElementById('venue-selected-count');
    const totalCount = document.querySelectorAll('.venue-filter-checkbox').length;
    const searchQuery = artistSearchInput ? artistSearchInput.value.toLowerCase().trim() : '';
    const targetId = monthSelect ? monthSelect.value : '';

    if (selectedCountSpan) {
      if (checkedVenues.length === totalCount) selectedCountSpan.textContent = 'All Venues';
      else if (checkedVenues.length === 0) selectedCountSpan.textContent = '0 Venues';
      else selectedCountSpan.textContent = `${checkedVenues.length} Selected`;
    }

    views.forEach(view => {
      let visibleCount = 0;
      view.querySelectorAll('.event-card').forEach(card => {
        const cardCity = card.dataset.city;
        const cardVenue = card.dataset.venue;
        let show = true;

        if (view.id !== 'interested-view') {
          if (show && activeRegion !== 'all') {
            const targetCities = (regionCities[activeRegion] || []).map(normalizeLocationToken);
            const normalizedCardCity = normalizeLocationToken(cardCity);
            if (!containsAnyKeyword(normalizedCardCity, targetCities)) show = false;
          }
          if (show && !checkedVenues.includes(cardVenue)) show = false;
        }

        if (show && filterInterestedOnly) {
          const eventId = card.id.replace('card-', '');
          const interestedIds = getInterestedIds();
          if (!interestedIds.includes(eventId)) {
            show = false;
          } else {
            const btnAction = card.querySelector('.btn-interested-toggle');
            const startTimeStr = btnAction ? btnAction.getAttribute('data-start') : '';
            if (startTimeStr) {
              const showDate = new Date(startTimeStr);
              const now = new Date();
              now.setHours(0, 0, 0, 0);
              if (showDate < now) show = false;
            }
          }
        }

        if (show && searchQuery !== '') {
          const artistName = (card.querySelector('.artist-name')?.textContent || '').toLowerCase();
          const venueName = (card.querySelector('.clickable-venue')?.textContent || '').toLowerCase();
          const tags = Array.from(card.querySelectorAll('.tag-pill')).map(pill => pill.textContent.toLowerCase()).join(' ');
          if (!artistName.includes(searchQuery) && !venueName.includes(searchQuery) && !tags.includes(searchQuery)) show = false;
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

          const mapsToPunk = genre === 'punk' || hasTagInList(allCardTags, punkTags);
          const mapsToIndie = genre === 'indie' || hasTagInList(allCardTags, indieTags);
          const mapsToMetal = genre === 'metal' || genre === 'rock' || genre === 'extreme' || hasTagInList(allCardTags, metalTags);

          const hasNoCategories = !mapsToPunk && !mapsToIndie && !mapsToMetal;
          const finalMapsToMetal = mapsToMetal || hasNoCategories;

          const matchGenre = () => {
            if (activeGenre === 'indie') {
              return mapsToIndie;
            }
            if (activeGenre === 'punk') {
              return mapsToPunk;
            }
            if (activeGenre === 'metal') {
              return finalMapsToMetal;
            }
            return false;
          };

          if (!matchGenre()) {
            show = false;
          }
        }

        card.style.display = show ? 'grid' : 'none';
        if (show) visibleCount++;
      });

      if (searchQuery !== '' || filterInterestedOnly) {
        // Avoid duplicate cards when interested-only mode is active: the dedicated
        // interested view contains clones of cards from month views.
        if (filterInterestedOnly && view.id === 'interested-view') {
          view.classList.remove('active');
        } else {
          view.classList.toggle('active', visibleCount > 0);
        }
      } else {
        view.classList.toggle('active', view.id === targetId);
      }

      const option = document.querySelector(`#month-dropdown-select option[value="${view.id}"]`);
      if (option) {
        option.style.display = visibleCount > 0 ? 'block' : 'none';
        option.disabled = visibleCount === 0;
      }
    });

    if (monthSelect) {
      const currentSelected = monthSelect.options[monthSelect.selectedIndex];
      if (currentSelected && currentSelected.disabled) {
        for (let i = 0; i < monthSelect.options.length; i++) {
          if (!monthSelect.options[i].disabled && monthSelect.options[i].value !== 'empty-view') {
            monthSelect.selectedIndex = i;
            monthSelect.dispatchEvent(new Event('change'));
            break;
          }
        }
      }
    }
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
      views.forEach(view => {
        view.classList.toggle('active', view.id === targetId);
      });
    });
  }

  if (artistSearchInput) {
    artistSearchInput.addEventListener('input', () => {
      applyFilters();
    });
  }

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
    if (filterInterestedOnly) applyFilters();
  });

  if (btnInterestedFilter) {
    btnInterestedFilter.addEventListener('click', () => {
      filterInterestedOnly = !filterInterestedOnly;
      if (filterInterestedOnly) {
        btnInterestedFilter.classList.add('active');
        btnInterestedFilter.style.background = 'rgba(245, 158, 11, 0.15)';
        btnInterestedFilter.style.borderColor = 'rgba(245, 158, 11, 0.4)';
        btnInterestedFilter.style.color = '#fbbf24';
        btnInterestedFilter.style.boxShadow = '0 0 10px rgba(245, 158, 11, 0.25)';
      } else {
        btnInterestedFilter.classList.remove('active');
        btnInterestedFilter.style.background = '';
        btnInterestedFilter.style.borderColor = '';
        btnInterestedFilter.style.color = '';
        btnInterestedFilter.style.boxShadow = '';
      }
      applyFilters();
    });
  }

  updateInterestedCards();
  renderInterestedShows();
  applyFilters();

  return {
    applyFilters,
    getFilterInterestedOnly: () => filterInterestedOnly,
    updateInterestedCards,
    renderInterestedShows
  };
}
