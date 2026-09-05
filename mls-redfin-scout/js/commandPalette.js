/**
 * MLS & Redfin Property Scout - Command Palette (Cmd/Ctrl+K)
 */
import { elements, state } from './state.js';
import { switchView } from './views.js';
import { applyFiltersAndRender } from './filters.js';
import { exportCSV } from './export.js';
import { toggleTheme } from './theme.js';
import { escapeHtml } from './properties.js';
import { openRecommendModal } from './recommend.js';
// openDetailModal is called here but not imported: it's exposed on window by detailModal.js
// (needed anyway since it's also invoked from onclick="..." attributes in rendered HTML).


    export function openCommandPalette() {
        if (!elements.modalCommandPalette) return;
        elements.modalCommandPalette.classList.add('active');
        if (elements.cmdPaletteInput) {
            elements.cmdPaletteInput.value = '';
            elements.cmdPaletteInput.focus();
        }
        renderCommandPaletteResults('');
    }
    export function closeCommandPalette() {
        if (elements.modalCommandPalette) {
            elements.modalCommandPalette.classList.remove('active');
        }
    }
    export function handleCmdPaletteSearch(e) {
        renderCommandPaletteResults(e.target.value.trim().toLowerCase());
    }
    export function renderCommandPaletteResults(query) {
        if (!elements.cmdPaletteResults) return;

        let results = [];

        // View Actions
        const actions = [
            { icon: '🎴', title: 'Switch to Card Grid View', action: () => switchView('grid') },
            { icon: '🗺️', title: 'Switch to Interactive Map View', action: () => switchView('map') },
            { icon: '📊', title: 'Switch to Table View', action: () => switchView('table') },
            { icon: '⚖️', title: 'Switch to Comparison Matrix View', action: () => switchView('matrix') },
            { icon: '⭐', title: 'Filter: Favorites Only', action: () => { elements.toggleFavorites.checked = true; state.filters.favoritesOnly = true; applyFiltersAndRender(); switchView('grid'); } },
            { icon: '🤝', title: 'Filter: Shared with Realtor Only', action: () => { elements.toggleRealtorShared.checked = true; state.filters.realtorSharedOnly = true; applyFiltersAndRender(); switchView('grid'); } },
            { icon: '✨', title: 'Top Picks: Rank My Favorites', action: () => openRecommendModal() },
            { icon: '📄', title: 'Export Properties to CSV', action: () => exportCSV() },
            { icon: '🌙', title: 'Toggle Light / Dark Theme', action: () => toggleTheme() }
        ];

        actions.forEach(act => {
            if (!query || act.title.toLowerCase().includes(query)) {
                results.push({
                    type: 'action',
                    icon: act.icon,
                    title: act.title,
                    subtitle: 'Quick Action',
                    execute: act.action
                });
            }
        });

        // Search Properties
        state.allProperties.forEach(p => {
            const textMatch = `${p.address} ${p.city} ${p.mls_id} ${p.user_notes}`.toLowerCase();
            if (query && textMatch.includes(query)) {
                results.push({
                    type: 'property',
                    icon: '🏠',
                    title: `$${p.price.toLocaleString()} - ${p.address}`,
                    subtitle: `${p.city}, CO | MLS #${p.mls_id} | ${p.beds} Beds, ${p.baths} Baths`,
                    execute: () => openDetailModal(p.mls_id)
                });
            }
        });

        if (results.length === 0) {
            elements.cmdPaletteResults.innerHTML = `<div style="padding:1.5rem; text-align:center; color:var(--text-muted); font-size:0.9rem;">No matching commands or properties found.</div>`;
            return;
        }

        elements.cmdPaletteResults.innerHTML = results.slice(0, 8).map((res, idx) => `
            <div class="cmd-item ${idx === 0 ? 'selected' : ''}" data-idx="${idx}">
                <div style="display:flex; align-items:center; gap:0.75rem;">
                    <span style="font-size:1.2rem;">${res.icon}</span>
                    <div>
                        <div class="cmd-item-title">${escapeHtml(res.title)}</div>
                        <div class="cmd-item-subtitle">${escapeHtml(res.subtitle)}</div>
                    </div>
                </div>
                <span style="font-size:0.75rem; color:var(--text-muted);">Jump ↵</span>
            </div>
        `).join('');

        // Attach click listeners to items
        elements.cmdPaletteResults.querySelectorAll('.cmd-item').forEach((itemEl, idx) => {
            itemEl.addEventListener('click', () => {
                closeCommandPalette();
                results[idx].execute();
            });
        });
    }
