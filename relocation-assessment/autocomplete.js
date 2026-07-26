/* autocomplete.js - Standalone UI Typeahead & Dropdown Component */
(function(window) {
  'use strict';

  function attachAutocomplete(inputEl, containerEl, options = {}) {
    if (!inputEl) return null;

    let debounceTimer = null;
    const fetchFn = options.fetchFn || (async () => []);
    const onSelect = options.onSelect || (() => {});
    const minLength = options.minLength || 2;
    const delayMs = options.delayMs || 200;

    // Ensure input container has position: relative for absolute dropdown alignment
    if (inputEl.parentNode && !inputEl.parentNode.classList.contains('search-input-wrap')) {
      const wrap = document.createElement('div');
      wrap.className = 'search-input-wrap';
      inputEl.parentNode.insertBefore(wrap, inputEl);
      wrap.appendChild(inputEl);
    }

    let dropdownEl = containerEl;
    if (!dropdownEl && inputEl.parentNode) {
      dropdownEl = document.createElement('div');
      dropdownEl.className = 'autocomplete-list';
      dropdownEl.hidden = true;
      inputEl.parentNode.appendChild(dropdownEl);
    }

    function hide() {
      if (dropdownEl) {
        dropdownEl.hidden = true;
        dropdownEl.style.display = 'none';
      }
    }

    function show(candidates) {
      if (!dropdownEl || !Array.isArray(candidates) || !candidates.length) {
        hide();
        return;
      }
      dropdownEl.innerHTML = '';
      candidates.slice(0, 6).forEach((candidate) => {
        const item = document.createElement('div');
        item.className = 'autocomplete-item';
        item.textContent = candidate.displayName;
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          inputEl.value = candidate.displayName;
          onSelect(candidate);
          hide();
        });
        dropdownEl.appendChild(item);
      });
      dropdownEl.hidden = false;
      dropdownEl.style.display = 'block';
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

    document.addEventListener('click', (e) => {
      if (dropdownEl && !dropdownEl.contains(e.target) && e.target !== inputEl) {
        hide();
      }
    });

    return { hide, show };
  }

  window.RelocationAutocomplete = {
    attachAutocomplete
  };
})(window);
