/**
 * DoorScout Address Autocomplete Module
 * Connects input elements to OpenStreetMap Nominatim geocoding API with debouncing.
 */

class AddressAutocomplete {
  constructor(inputElement, dropdownElement, onSelectCallback) {
    this.input = inputElement;
    this.dropdown = dropdownElement;
    this.onSelect = onSelectCallback;
    this.debounceTimer = null;
    this.lastQuery = '';

    this.initEvents();
  }

  initEvents() {
    this.input.addEventListener('input', () => {
      clearTimeout(this.debounceTimer);
      const query = this.input.value.trim();
      if (query.length < 3) {
        this.hideDropdown();
        return;
      }
      this.debounceTimer = setTimeout(() => this.search(query), 350);
    });

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (!this.input.contains(e.target) && !this.dropdown.contains(e.target)) {
        this.hideDropdown();
      }
    });
  }

  async search(query) {
    if (query === this.lastQuery) return;
    this.lastQuery = query;

    this.dropdown.innerHTML = `<div class="px-3 py-2 text-xs text-slate-400 flex items-center gap-2">
      <span class="animate-spin">⏳</span> Searching addresses...
    </div>`;
    this.showDropdown();

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=5`;
      const response = await fetch(url, {
        headers: { 'Accept-Language': 'en-US,en' }
      });
      const results = await response.json();

      if (!results || results.length === 0) {
        this.dropdown.innerHTML = `<div class="px-3 py-2 text-xs text-slate-400">No matching addresses found</div>`;
        return;
      }

      this.dropdown.innerHTML = '';
      results.forEach(place => {
        const item = document.createElement('div');
        item.className = 'px-3 py-2.5 hover:bg-slate-800 cursor-pointer text-xs text-slate-200 border-b border-slate-800/60 last:border-0 transition-colors flex items-start gap-2';
        item.innerHTML = `
          <span class="text-sky-400 mt-0.5">📍</span>
          <div>
            <div class="font-medium text-slate-100">${escapeHtml(place.display_name.split(',')[0])}</div>
            <div class="text-[10px] text-slate-400 truncate max-w-[280px]">${escapeHtml(place.display_name)}</div>
          </div>
        `;

        item.addEventListener('click', () => {
          this.input.value = place.display_name;
          this.hideDropdown();
          if (typeof this.onSelect === 'function') {
            this.onSelect({
              address: place.display_name,
              lat: parseFloat(place.lat),
              lng: parseFloat(place.lon)
            });
          }
        });

        this.dropdown.appendChild(item);
      });
    } catch (err) {
      console.error('Geocoding error:', err);
      this.dropdown.innerHTML = `<div class="px-3 py-2 text-xs text-rose-400">Error retrieving address suggestions</div>`;
    }
  }

  showDropdown() {
    this.dropdown.classList.remove('hidden');
  }

  hideDropdown() {
    this.dropdown.classList.add('hidden');
  }
}

function escapeHtml(str) {
  return (str || '').replace(/[&<>"']/g, match => {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[match];
  });
}

window.AddressAutocomplete = AddressAutocomplete;
