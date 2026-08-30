/* autocomplete.js - Standalone UI Typeahead & Dropdown Component */
(function(window) {
  'use strict';

  function attachAutocomplete(inputEl, containerEl, options = {}) {
    if (!inputEl) return null;

    let debounceTimer = null;
    let activeController = null;
    const fetchFn = options.fetchFn || (async () => []);
    const onSelect = options.onSelect || (() => {});
    const minLength = options.minLength || 2;
    const delayMs = options.delayMs || 200;
    const idBase = inputEl.id || `autocomplete-${Math.random().toString(36).slice(2, 8)}`;

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

    if (dropdownEl) {
      dropdownEl.setAttribute('role', 'listbox');
    }
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
      Array.from(dropdownEl.children).forEach((child) => child.classList.remove('is-active'));
    }

    function setActive(idx) {
      if (!dropdownEl) return;
      const items = Array.from(dropdownEl.children);
      if (!items.length) return;
      activeIndex = ((idx % items.length) + items.length) % items.length;
      clearActive();
      const activeEl = items[activeIndex];
      activeEl.classList.add('is-active');
      activeEl.scrollIntoView({ block: 'nearest' });
      inputEl.setAttribute('aria-activedescendant', itemId(activeIndex));
    }

    function hide() {
      if (dropdownEl) {
        dropdownEl.hidden = true;
        dropdownEl.style.display = 'none';
      }
      currentCandidates = [];
      activeIndex = -1;
      inputEl.setAttribute('aria-expanded', 'false');
      inputEl.removeAttribute('aria-activedescendant');
    }

    // Abort whatever lookup is currently in flight for this field. Without
    // this, each debounced keystroke pause fired an independent, uncancelled
    // Photon+Open-Meteo lookup (each can take up to ~8.5s to fail) -- so
    // several stale, unresolvable prefixes of the address ended up in
    // flight at once, hammering the free geocoders for no reason. `fetchFn`
    // is expected to accept an AbortSignal as its second argument and pass
    // it through to the actual network calls.
    function cancelPendingLookup() {
      if (activeController) {
        activeController.abort();
        activeController = null;
      }
    }

    function runLookup(val) {
      cancelPendingLookup();
      const controller = new AbortController();
      activeController = controller;
      return fetchFn(val, controller.signal).finally(() => {
        if (activeController === controller) activeController = null;
      });
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
        item.className = 'autocomplete-item';
        item.id = itemId(idx);
        item.setAttribute('role', 'option');
        item.textContent = candidate.displayName;
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          selectCandidate(candidate);
        });
        item.addEventListener('mouseenter', () => setActive(idx));
        dropdownEl.appendChild(item);
      });
      dropdownEl.hidden = false;
      dropdownEl.style.display = 'block';
      inputEl.setAttribute('aria-expanded', 'true');
    }

    inputEl.addEventListener('input', (e) => {
      const val = (e.target.value || '').trim();
      if (debounceTimer) clearTimeout(debounceTimer);
      if (val.length < minLength) {
        cancelPendingLookup();
        hide();
        return;
      }
      debounceTimer = setTimeout(async () => {
        try {
          const results = await runLookup(val);
          if (results && results.length) {
            show(results);
          } else {
            hide();
          }
        } catch (err) {
          // A cancellation just means a newer lookup (for whatever the user
          // has typed since) is already taking over -- it will call show()
          // or hide() itself when it resolves, so there's nothing to do here.
          if (err && err.name === 'CancelledError') return;
          hide();
        }
      }, delayMs);
    });

    inputEl.addEventListener('focus', () => {
      const val = (inputEl.value || '').trim();
      if (val.length >= minLength) {
        runLookup(val).then((results) => {
          if (results && results.length) show(results);
        }).catch((err) => {
          if (err && err.name === 'CancelledError') return;
        });
      }
    });

    // Keyboard navigation: Arrow Up/Down to move the highlight, Enter to pick the
    // highlighted suggestion, Escape to close. Previously the dropdown only
    // responded to mouse clicks, which shut out keyboard-only users entirely.
    inputEl.addEventListener('keydown', (e) => {
      const isVisible = dropdownEl && !dropdownEl.hidden && currentCandidates.length > 0;
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
        // If nothing is highlighted, let Enter fall through to submit the form
        // using whatever the user has typed, same as before.
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

  window.RelocationAutocomplete = {
    attachAutocomplete
  };
})(window);
