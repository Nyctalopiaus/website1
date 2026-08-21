document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('gameForm');
  const grid = document.getElementById('gamesGrid');
  const errorEl = document.getElementById('error-message');
  const sortSelect = document.getElementById('sortColumnSelect');
  const sortToggleBtn = document.getElementById('toggleSortDirection');

  const STORAGE_KEY = 'handheld_gaming_log_games';
  let games = [];

  // Sorting state
  let sortColumn = 'title';
  let sortAscending = true;

  // Games are stored exclusively in the browser's localStorage, matching the
  // "100% Private & Local Storage" claim shown in the UI. Do NOT reintroduce a
  // server sync call here — a previous version POSTed entries to a shared,
  // unauthenticated /api/games record on the backend, which meant every
  // visitor's log was stored server-side and visible to every other visitor.
  // See project notes for details.
  function loadGames() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        games = JSON.parse(stored);
      } catch (e) {
        console.error('[ERROR] Failed to parse stored games:', e);
        games = [];
      }
    }
    updateStats();
    applySorting();
  }

  function saveGames() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(games));
  }

  function updateStats() {
    const totalHours = games.reduce((sum, g) => sum + g.hours, 0);
    const count = games.length;
    const greatCount = games.filter(g => g.rating.toLowerCase() === 'great').length;
    const ratio = count > 0 ? Math.round((greatCount / count) * 100) : 0;

    document.getElementById('stat-hours').textContent = `${totalHours.toFixed(1)}h`;
    document.getElementById('stat-count').textContent = `${count} ${count === 1 ? 'game' : 'games'}`;
    document.getElementById('stat-ratio').textContent = `${ratio}%`;
  }

  function validateForm() {
    let errors = [];

    const titleInput = form.querySelector('[name="title"]');
    const hoursInput = form.querySelector('[name="hours"]');
    const ratingSelect = form.querySelector('[name="rating"]');

    if (games.length >= 20) {
      errors.push('Log limit reached. The gaming log is restricted to a maximum of 20 entries to prevent data overrun.');
    }

    if (!titleInput.value.trim().length) {
      errors.push('Title is required.');
    }

    const hoursValue = parseFloat(hoursInput.value);
    if (isNaN(hoursValue) || hoursValue < 0.5) {
      errors.push('Play time must be at least 0.5 hours.');
    } else if (hoursValue > 100) {
      errors.push('Play time cannot exceed 100 hours.');
    }

    const rating = ratingSelect.value.trim();
    if (!rating || !['Great', 'Playable', 'Poor'].includes(rating)) {
      errors.push('Please select a valid performance rating: Great, Playable, or Poor.');
    }

    return { isValid: errors.length === 0, messages: errors };
  }

  function renderGames() {
    grid.innerHTML = '';

    if (games.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-grid-message';
      empty.textContent = 'No games logged yet. Add your first game above!';
      grid.appendChild(empty);
      return;
    }

    games.forEach(game => {
      // Outer card (handles rotating border hover sweep)
      const card = document.createElement('div');
      card.className = 'game-card';
      card.setAttribute('data-id', game.id);

      // Inner card content container (solid background overlaid on rotating border)
      const content = document.createElement('div');
      content.className = 'card-content';

      // Title
      const titleEl = document.createElement('h3');
      titleEl.className = 'card-title';
      titleEl.textContent = game.title;

      // Hours
      const hoursEl = document.createElement('div');
      hoursEl.className = 'card-hours';
      const hourVal = document.createTextNode(game.hours.toFixed(1));
      const hourSpan = document.createElement('span');
      hourSpan.className = 'unit';
      hourSpan.textContent = ' h';
      hoursEl.appendChild(hourVal);
      hoursEl.appendChild(hourSpan);

      // Rating
      const ratingContainer = document.createElement('div');
      ratingContainer.className = 'card-rating-container';
      const ratingBadge = document.createElement('span');
      ratingBadge.className = `rating-badge badge-${game.rating.toLowerCase()}`;
      ratingBadge.textContent = game.rating.toUpperCase();
      ratingContainer.appendChild(ratingBadge);

      // Delete button
      const deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.className = 'btn-delete';
      deleteBtn.textContent = '✕';
      deleteBtn.setAttribute('data-id', game.id);
      deleteBtn.setAttribute('aria-label', `Delete ${game.title}`);

      // Append items to content overlay
      content.appendChild(deleteBtn);
      content.appendChild(titleEl);
      content.appendChild(hoursEl);
      content.appendChild(ratingContainer);

      // Append content to outer card
      card.appendChild(content);

      grid.appendChild(card);
    });
  }

  // Form submission handler
  form.addEventListener('submit', (event) => {
    event.preventDefault();

    const titleInput = form.querySelector('[name="title"]');
    const hoursInput = form.querySelector('[name="hours"]');
    const ratingSelect = form.querySelector('[name="rating"]');

    const { isValid, messages } = validateForm();

    if (!isValid) {
      errorEl.textContent = messages.join('\n');
      errorEl.style.display = 'block';
      return;
    }

    errorEl.textContent = '';
    errorEl.style.display = 'none';

    const title = titleInput.value.trim();
    const hours = parseFloat(hoursInput.value);
    const rating = ratingSelect.value;

    const newGame = {
      id: Date.now(),
      title,
      hours,
      rating
    };

    games.push(newGame);
    saveGames();
    updateStats();
    applySorting();

    // Reset fields
    titleInput.value = '';
    hoursInput.value = '';
    ratingSelect.value = '';
  });

  // Delete button handler (delegated on grid)
  grid.addEventListener('click', (event) => {
    const btn = event.target.closest('.btn-delete');
    if (!btn || !btn.dataset.id) return;

    const id = parseInt(btn.dataset.id);
    games = games.filter(g => g.id !== id);
    saveGames();
    updateStats();
    applySorting();
  });

  // Sorting handlers
  sortSelect.addEventListener('change', () => {
    sortColumn = sortSelect.value;
    applySorting();
  });

  sortToggleBtn.addEventListener('click', () => {
    sortAscending = !sortAscending;
    sortToggleBtn.textContent = sortAscending ? '↑' : '↓';
    applySorting();
  });

  function applySorting() {
    games.sort((a, b) => {
      let valA, valB;

      if (sortColumn === 'title') {
        valA = a.title.trim().toLowerCase();
        valB = b.title.trim().toLowerCase();
        return sortAscending ? valA.localeCompare(valB) : valB.localeCompare(valA);
      } else if (sortColumn === 'hours') {
        valA = a.hours;
        valB = b.hours;
        return sortAscending ? valA - valB : valB - valA;
      } else if (sortColumn === 'rating') {
        const ratingMap = { great: 3, playable: 2, poor: 1 };
        valA = ratingMap[a.rating.toLowerCase()] || 0;
        valB = ratingMap[b.rating.toLowerCase()] || 0;
        return sortAscending ? valA - valB : valB - valA;
      }
      return 0;
    });

    renderGames();
  }

  // Quick Start Modal Toggle
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

  // Features Modal Toggle
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

  // Initialize page
  loadGames();
});

