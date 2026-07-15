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

  async function loadGames() {
    try {
      const res = await fetch('/api/games');
      if (res.ok) {
        games = await res.json();
        updateStats();
        applySorting();
      } else {
        console.error('[ERROR] Failed to fetch games from API:', res.statusText);
        loadLocalFallback();
      }
    } catch (e) {
      console.error('[ERROR] API connection error:', e);
      loadLocalFallback();
    }
  }

  function loadLocalFallback() {
    console.log('[SYSTEM] Loading localStorage fallback.');
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        games = JSON.parse(stored);
        updateStats();
        applySorting();
      } catch (e) {
        console.error('[ERROR] Failed to parse stored fallback games:', e);
        games = [];
      }
    }
  }

  function saveLocalFallback() {
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
  form.addEventListener('submit', async (event) => {
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

    const newGameData = { title, hours, rating };

    try {
      const res = await fetch('/api/games', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newGameData)
      });
      if (res.ok) {
        const savedGame = await res.json();
        games.push(savedGame);
        updateStats();
        applySorting();
        
        // Reset fields only on success
        titleInput.value = '';
        hoursInput.value = '';
        ratingSelect.value = '';
      } else {
        const errData = await res.json().catch(() => ({}));
        const errMsg = errData.error || ('API server returned error: ' + res.statusText);
        errorEl.textContent = errMsg;
        errorEl.style.display = 'block';
      }
    } catch (e) {
      console.error('[ERROR] Failed to save game on database. Saving locally.', e);
      // Fallback (only trigger if network is actually offline)
      const fallbackGame = {
        id: Date.now(),
        title,
        hours,
        rating
      };
      games.push(fallbackGame);
      saveLocalFallback();
      updateStats();
      applySorting();
      
      // Reset fields
      titleInput.value = '';
      hoursInput.value = '';
      ratingSelect.value = '';
    }
  });

  // Delete button handler (delegated on grid)
  grid.addEventListener('click', async (event) => {
    const btn = event.target.closest('.btn-delete');
    if (!btn || !btn.dataset.id) return;

    const id = parseInt(btn.dataset.id);

    try {
      const res = await fetch(`/api/games/${id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        games = games.filter(g => g.id !== id);
        updateStats();
        applySorting();
      } else {
        throw new Error('API server returned error: ' + res.statusText);
      }
    } catch (e) {
      console.error('[ERROR] Failed to delete game on database. Removing locally.', e);
      // Fallback
      games = games.filter(g => g.id !== id);
      saveLocalFallback();
      updateStats();
      applySorting();
    }
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

  // Initialize page
  loadGames();
});
