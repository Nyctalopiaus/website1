/* autocomplete.js - Standalone UI Typeahead & Autocomplete Component for Homeward */
(function(window) {
  'use strict';

  function attachAutocomplete(inputEl, options = {}) {
    if (!inputEl) return null;

    let debounceTimer = null;
    const fetchFn = options.fetchFn || (async () => []);
    const onSelect = options.onSelect || (() => {});
    const minLength = options.minLength || 2;
    const delayMs = options.delayMs || 200;
    const idBase = inputEl.id || `autocomplete-${Math.random().toString(36).slice(2, 8)}`;

    // Ensure input container has position: relative for absolute dropdown alignment
    let wrap = inputEl.parentNode;
    if (!wrap || !wrap.classList.contains('search-input-wrap')) {
      wrap = document.createElement('div');
      wrap.className = 'search-input-wrap relative w-full flex-1';
      inputEl.parentNode.insertBefore(wrap, inputEl);
      wrap.appendChild(inputEl);
    }
    inputEl.classList.add('w-full');

    let dropdownEl = wrap.querySelector('.autocomplete-list');
    if (!dropdownEl) {
      dropdownEl = document.createElement('div');
      dropdownEl.className = 'autocomplete-list absolute left-0 right-0 top-full mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden max-h-60 overflow-y-auto hidden';
      wrap.appendChild(dropdownEl);
    }

    dropdownEl.setAttribute('role', 'listbox');
    inputEl.setAttribute('role', 'combobox');
    inputEl.setAttribute('aria-autocomplete', 'list');
    inputEl.setAttribute('aria-expanded', 'false');

    let currentCandidates = [];
    let activeIndex = -1;

    function itemId(idx) {
      return `${idBase}-option-${idx}`;
    }

    function clearActive() {
      if (!dropdownEl) return;
      Array.from(dropdownEl.children).forEach((child) => {
        child.classList.remove('bg-sky-500/20', 'text-sky-300', 'is-active');
      });
    }

    function setActive(idx) {
      if (!dropdownEl) return;
      const items = Array.from(dropdownEl.children);
      if (!items.length) return;
      activeIndex = ((idx % items.length) + items.length) % items.length;
      clearActive();
      const activeEl = items[activeIndex];
      if (activeEl) {
        activeEl.classList.add('bg-sky-500/20', 'text-sky-300', 'is-active');
        activeEl.scrollIntoView({ block: 'nearest' });
        inputEl.setAttribute('aria-activedescendant', itemId(activeIndex));
      }
    }

    function hide() {
      if (dropdownEl) {
        dropdownEl.classList.add('hidden');
        dropdownEl.innerHTML = '';
      }
      currentCandidates = [];
      activeIndex = -1;
      inputEl.setAttribute('aria-expanded', 'false');
      inputEl.removeAttribute('aria-activedescendant');
    }

    function selectCandidate(candidate) {
      inputEl.value = candidate.displayName;
      onSelect(candidate);
      hide();
    }

    function show(candidates) {
      if (!dropdownEl || !Array.isArray(candidates) || !candidates.length) {
        hide();
        return;
      }
      currentCandidates = candidates.slice(0, 6);
      activeIndex = -1;
      dropdownEl.innerHTML = '';

      currentCandidates.forEach((candidate, idx) => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item px-3 py-2 text-xs text-slate-200 cursor-pointer border-b border-slate-800/60 last:border-0 hover:bg-sky-500/20 hover:text-sky-300 transition-colors flex items-center gap-2';
        item.id = itemId(idx);
        item.setAttribute('role', 'option');
        item.innerHTML = `<span class="text-sky-400">📍</span> <span class="truncate">${candidate.displayName}</span>`;
        
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          selectCandidate(candidate);
        });
        item.addEventListener('mouseenter', () => setActive(idx));
        dropdownEl.appendChild(item);
      });

      dropdownEl.classList.remove('hidden');
      inputEl.setAttribute('aria-expanded', 'true');
    }

    inputEl.addEventListener('input', (e) => {
      const val = (e.target.value || '').trim();
      if (debounceTimer) clearTimeout(debounceTimer);
      if (val.length < minLength) {
        hide();
        return;
      }
      debounceTimer = setTimeout(async () => {
        try {
          const results = await fetchFn(val);
          if (results && results.length) {
            show(results);
          } else {
            hide();
          }
        } catch (_err) {
          hide();
        }
      }, delayMs);
    });

    inputEl.addEventListener('focus', () => {
      const val = (inputEl.value || '').trim();
      if (val.length >= minLength) {
        fetchFn(val).then((results) => {
          if (results && results.length) show(results);
        }).catch(() => {});
      }
    });

    inputEl.addEventListener('keydown', (e) => {
      const isVisible = dropdownEl && !dropdownEl.classList.contains('hidden') && currentCandidates.length > 0;
      if (!isVisible) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActive(activeIndex + 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActive(activeIndex - 1);
      } else if (e.key === 'Enter') {
        if (activeIndex >= 0 && activeIndex < currentCandidates.length) {
          e.preventDefault();
          selectCandidate(currentCandidates[activeIndex]);
        }
      } else if (e.key === 'Escape') {
        hide();
      }
    });

    document.addEventListener('click', (e) => {
      if (dropdownEl && !dropdownEl.contains(e.target) && e.target !== inputEl) {
        hide();
      }
    });

    return { hide, show };
  }

  window.HomewardAutocomplete = {
    attachAutocomplete
  };
})(window);
