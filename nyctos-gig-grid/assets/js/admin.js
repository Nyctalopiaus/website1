/**
 * Admin Review Engine Script (CSP Compliant External Module)
 * Full 6-Core Rule Actions Handler
 */
document.addEventListener('DOMContentLoaded', () => {
    console.log('🛠️ Enterprise Admin Engine Active (6-Core Actions).');

    // Restore scroll position after reload
    const savedScrollPos = sessionStorage.getItem('admin_scroll_pos');
    if (savedScrollPos !== null) {
        sessionStorage.removeItem('admin_scroll_pos');
        window.scrollTo({ top: parseInt(savedScrollPos, 10), behavior: 'instant' });
    }

    function reloadPreservingScroll() {
        sessionStorage.setItem('admin_scroll_pos', window.scrollY);
        location.reload();
    }

    const csrfMeta = document.querySelector('meta[name="csrf-token"]');
    const csrfToken = csrfMeta ? csrfMeta.getAttribute('content') : '';

    // Handle Admin Action Clicks
    document.addEventListener('click', async (e) => {
        const target = e.target.closest('.btn-admin-act');
        if (!target) return;

        const artist = target.getAttribute('data-artist') || '';
        const venue = target.getAttribute('data-venue') || '';

        if (target.classList.contains('btn-admin-banner')) {
            const titleInput = prompt('Extract exact Tour/Event Banner string (e.g. Campground, Flashback, Summer Sessions):', artist);
            if (!titleInput) return;
            const res = await saveAdminRule('add_event_title', titleInput);
            if (res.success) {
                alert(`✅ Saved "${titleInput}" to event_titles.txt! Reloading grid...`);
                reloadPreservingScroll();
            } else {
                alert('❌ Error: ' + (res.error || 'Failed'));
            }
        } else if (target.classList.contains('btn-admin-special')) {
            const specInput = prompt('Suppress Music Buttons for this title/keyword (Yoga, Film, Trivia, Karaoke):', artist);
            if (!specInput) return;
            const res = await saveAdminRule('add_special_event', specInput);
            if (res.success) {
                alert(`✅ Saved "${specInput}" to special_events.txt! Reloading grid...`);
                reloadPreservingScroll();
            } else {
                alert('❌ Error: ' + (res.error || 'Failed'));
            }
        } else if (target.classList.contains('btn-admin-split')) {
            const splitInput = prompt('Enter exact delimiter pattern to split combined band names (e.g. |, ft., w/, &):', '|');
            if (!splitInput) return;
            const res = await saveAdminRule('add_artist_split', splitInput);
            if (res.success) {
                alert(`✅ Saved split pattern "${splitInput}" to artist_splits.txt! Reloading grid...`);
                reloadPreservingScroll();
            } else {
                alert('❌ Error: ' + (res.error || 'Failed'));
            }
        } else if (target.classList.contains('btn-admin-omit')) {
            if (!confirm(`Are you sure you want to omit/ignore "${artist}"?`)) return;
            const res = await saveAdminRule('add_ignored_artist', artist);
            if (res.success) {
                alert(`✅ Omitted "${artist}"! Saved to ignored_artists.txt. Reloading grid...`);
                reloadPreservingScroll();
            } else {
                alert('❌ Error: ' + (res.error || 'Failed'));
            }
        } else if (target.classList.contains('btn-admin-headliner')) {
            const eventId = target.getAttribute('data-event-id') || '';
            if (!eventId || !artist) return;
            if (!confirm(`Promote "${artist}" to #1 Headliner for this show?`)) return;
            const res = await saveAdminRule('make_headliner', artist, { event_id: eventId });
            if (res.success) {
                alert(`✅ Promoted "${artist}" to Headliner! Reloading grid...`);
                reloadPreservingScroll();
            } else {
                alert('❌ Error: ' + (res.error || 'Failed'));
            }
        } else if (target.classList.contains('btn-admin-save-city')) {
            const card = target.closest('.event-card');
            const cityInput = card ? card.querySelector('.admin-city-input') : null;
            const cityVal = cityInput ? cityInput.value.trim() : '';
            if (!cityVal || !venue) {
                alert('Please enter a valid city override name.');
                return;
            }
            const res = await saveAdminRule('add_venue_city', cityVal, { venue });
            if (res.success) {
                alert(`✅ Saved city "${cityVal}" for venue "${venue}" to venue_cities.txt! Reloading...`);
                reloadPreservingScroll();
            } else {
                alert('❌ Error: ' + (res.error || 'Failed'));
            }
        } else if (target.classList.contains('btn-admin-save-region')) {
            const card = target.closest('.event-card');
            const regionSelect = card ? card.querySelector('.admin-region-select') : null;
            const regionVal = regionSelect ? regionSelect.value.trim() : '';
            if (!venue) return;
            if (!regionVal) {
                alert('Please select a sub-area to assign.');
                return;
            }
            const res = await saveAdminRule('add_venue_region', regionVal, { venue });
            if (res.success) {
                alert(`✅ Saved sub-area "${regionVal.toUpperCase()}" for venue "${venue}". Reloading...`);
                reloadPreservingScroll();
            } else {
                alert('❌ Error: ' + (res.error || 'Failed'));
            }
        } else if (target.classList.contains('btn-admin-title')) {
            const eventId = target.getAttribute('data-event-id') || '';
            const currTitle = target.getAttribute('data-current-title') || artist;
            if (!eventId) {
                alert('Missing event ID for title override.');
                return;
            }

            const titleInput = prompt('Enter the exact single banner/title for this card (used as one un-split line):', currTitle);
            if (!titleInput) return;

            const cleanTitle = titleInput.trim();
            if (!cleanTitle) {
                alert('Title cannot be empty.');
                return;
            }

            const res = await saveAdminRule('override_event_title', cleanTitle, { event_id: eventId });
            if (res.success) {
                alert('✅ Saved card title override. Reloading grid...');
                reloadPreservingScroll();
            } else {
                alert('❌ Error: ' + (res.error || 'Failed'));
            }
        } else if (target.classList.contains('btn-admin-artist-override')) {
            const eventId = target.getAttribute('data-event-id') || '';
            const currArtists = target.getAttribute('data-current-artists') || artist;
            if (!eventId) {
                alert('Missing event ID for artist override.');
                return;
            }

            const artistInput = prompt('Enter artist name(s). For multiple bands, separate with " & " (example: Band A & Band B):', currArtists);
            if (!artistInput) return;

            const cleanArtists = artistInput.trim();
            if (!cleanArtists) {
                alert('Artist override cannot be empty.');
                return;
            }

            const res = await saveAdminRule('override_event_artists', cleanArtists, { event_id: eventId });
            if (res.success) {
                alert('✅ Saved artist override. Reloading grid...');
                reloadPreservingScroll();
            } else {
                alert('❌ Error: ' + (res.error || 'Failed'));
            }
        } else if (target.classList.contains('btn-admin-mark-special')) {
            const eventId = target.getAttribute('data-event-id') || '';
            if (!eventId) {
                alert('Missing event ID.');
                return;
            }

            const ok = confirm('Mark this card as non-music (Special Event) and hide listen/link buttons?');
            if (!ok) return;

            const res = await saveAdminRule('override_genre', 'special_event', { event_id: eventId });
            if (res.success) {
                alert('✅ Marked as non-music (Special Event). Reloading grid...');
                reloadPreservingScroll();
            } else {
                alert('❌ Error: ' + (res.error || 'Failed'));
            }
        } else if (target.classList.contains('btn-admin-purge-event')) {
            const eventId = target.getAttribute('data-event-id') || '';
            const artist = target.getAttribute('data-artist') || 'this show';
            if (!eventId) {
                alert('Missing event ID.');
                return;
            }

            const ok = confirm(`⚠️ Are you sure you want to PERMANENTLY PURGE "${artist}" (ID: ${eventId}) from the database? This cannot be undone.`);
            if (!ok) return;

            const res = await saveAdminRule('purge_event', '1', { event_id: eventId });
            if (res.success) {
                alert('🔥 Event permanently purged from database! Reloading grid...');
                reloadPreservingScroll();
            } else {
                alert('❌ Error purging event: ' + (res.error || 'Failed'));
            }
        } else if (target.classList.contains('btn-admin-edit-artists')) {
            const eventId = target.getAttribute('data-event-id') || '';
            const artistsStr = target.getAttribute('data-artists') || '';
            if (!eventId || !artistsStr) {
                alert('Missing event data.');
                return;
            }
            
            // Parse artists (check if explicitly joined by || first, else split by delimiters)
            let artists = [];
            if (artistsStr.includes('||')) {
                artists = artistsStr.split(/\s*\|\|\s*/).map(a => a.trim()).filter(a => a);
            } else {
                artists = artistsStr.split(/\s*&\s*|\s*,\s*|\s+and\s+/i).map(a => a.trim()).filter(a => a);
            }
            
            // Find the modal for this card
            const card = target.closest('.event-card');
            if (!card) return;
            
            const modal = card.querySelector('.modal-edit-artists-overlay');
            if (!modal) return;
            
            const listContainer = modal.querySelector('.artists-edit-list');
            listContainer.innerHTML = '';
            
            let draggedItem = null;

            function updateLabels() {
                const items = listContainer.querySelectorAll('.artist-edit-item');
                items.forEach((item, idx) => {
                    const label = item.querySelector('.artist-edit-label');
                    if (label) {
                        label.textContent = `Artist ${idx + 1}`;
                    }
                });
            }

            function renderArtistRow(artistName = '') {
                const item = document.createElement('div');
                item.className = 'artist-edit-item';
                item.setAttribute('draggable', 'false');
                item.innerHTML = `
                    <span class="drag-handle" title="Click and drag to reorder artist">⣿</span>
                    <label class="artist-edit-label">Artist</label>
                    <input type="text" class="artist-edit-input" value="${artistName.replace(/"/g, '&quot;')}" placeholder="Artist / band name..." />
                    <button type="button" class="btn-remove-artist" title="Delete artist row">🗑️</button>
                `;

                // Handle remove button click
                const btnRemove = item.querySelector('.btn-remove-artist');
                btnRemove.onclick = () => {
                    item.remove();
                    updateLabels();
                };

                const handle = item.querySelector('.drag-handle');
                const input = item.querySelector('.artist-edit-input');

                if (handle) {
                    handle.addEventListener('mousedown', () => {
                        item.setAttribute('draggable', 'true');
                    });
                    handle.addEventListener('mouseup', () => {
                        item.setAttribute('draggable', 'false');
                    });
                }

                if (input) {
                    input.addEventListener('mousedown', (e) => {
                        item.setAttribute('draggable', 'false');
                    });
                }

                // Bind HTML5 drag and drop
                item.addEventListener('dragstart', (e) => {
                    draggedItem = item;
                    item.classList.add('is-dragging');
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', '');
                });

                item.addEventListener('dragend', () => {
                    item.classList.remove('is-dragging');
                    item.setAttribute('draggable', 'false');
                    draggedItem = null;
                    updateLabels();
                });

                item.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (!draggedItem || draggedItem === item) return;

                    const rect = item.getBoundingClientRect();
                    const isAfter = (e.clientY - rect.top) / (rect.bottom - rect.top) > 0.5;
                    listContainer.insertBefore(draggedItem, isAfter ? item.nextSibling : item);
                });

                listContainer.appendChild(item);
                updateLabels();
            }

            // Populate initial artist rows
            artists.forEach(art => renderArtistRow(art));

            // Handle "+ Add Artist" button
            const addBtn = modal.querySelector('.btn-modal-add-artist');
            if (addBtn) {
                addBtn.onclick = () => {
                    renderArtistRow('');
                    const inputs = listContainer.querySelectorAll('.artist-edit-input');
                    if (inputs.length) {
                        inputs[inputs.length - 1].focus();
                    }
                };
            }

            // Show modal
            modal.style.display = 'flex';
            
            // Handle close button
            const closeBtn = modal.querySelector('.modal-close-btn');
            closeBtn.onclick = () => modal.style.display = 'none';
            
            // Handle cancel button
            const cancelBtn = modal.querySelector('.btn-modal-cancel');
            cancelBtn.onclick = () => modal.style.display = 'none';
            
            // Handle save button
            const saveBtn = modal.querySelector('.btn-modal-save');
            saveBtn.onclick = async () => {
                const inputs = listContainer.querySelectorAll('.artist-edit-input');
                const editedArtists = Array.from(inputs)
                    .map(input => input.value.trim())
                    .filter(val => val);
                
                if (!editedArtists.length) {
                    alert('Please enter at least one artist name.');
                    return;
                }
                
                const joinedArtists = editedArtists.join(' || ');
                const res = await saveAdminRule('override_event_artists', joinedArtists, { event_id: eventId });
                
                if (res.success) {
                    alert('✅ Saved artist names. Reloading grid...');
                    reloadPreservingScroll();
                } else {
                    alert('❌ Error: ' + (res.error || 'Failed'));
                }
            };
            
            // Close modal when clicking outside
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.style.display = 'none';
                }
            });
        }
    });

    // Handle Genre Select Dropdown Changes
    document.addEventListener('change', async (e) => {
        if (!e.target.classList.contains('admin-genre-select')) return;
        const select = e.target;
        const eventId = select.getAttribute('data-event-id');
        const genreVal = select.value;
        if (!eventId || !genreVal) return;

        const res = await saveAdminRule('override_genre', genreVal, { event_id: eventId });
        if (res.success) {
            alert(`✅ Updated genre for event ID ${eventId} to "${genreVal}"! Reloading grid...`);
            reloadPreservingScroll();
        } else {
            alert('❌ Error updating genre: ' + (res.error || 'Failed'));
        }
    });

    // Click to copy Event ID
    document.addEventListener('click', (e) => {
        const copyBadge = e.target.closest('.admin-card-id');
        if (!copyBadge) return;
        const eventId = copyBadge.getAttribute('data-event-id');
        if (!eventId) return;

        navigator.clipboard.writeText(eventId).then(() => {
            const btnCopy = copyBadge.querySelector('.btn-copy-id');
            if (btnCopy) {
                const orig = btnCopy.textContent;
                btnCopy.textContent = '✅ Copied!';
                setTimeout(() => { btnCopy.textContent = orig; }, 1500);
            }
        }).catch(err => {
            console.error('Failed to copy Event ID:', err);
        });
    });

    // Open Merge Event Modal
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-admin-merge-event');
        if (!btn) return;
        const card = btn.closest('.event-card');
        if (!card) return;
        const modal = card.querySelector('.modal-merge-event-overlay');
        if (modal) {
            modal.style.display = 'flex';
            const input = modal.querySelector('.merge-target-id-input');
            if (input) input.focus();
        }
    });

    // Handle Merge Event Modal Actions (Cancel, Close, Confirm)
    document.addEventListener('click', async (e) => {
        const cancelBtn = e.target.closest('.modal-merge-event .btn-modal-cancel, .modal-merge-event .modal-close-btn');
        if (cancelBtn) {
            const modal = cancelBtn.closest('.modal-merge-event-overlay');
            if (modal) modal.style.display = 'none';
            return;
        }

        const confirmBtn = e.target.closest('.btn-modal-confirm-merge');
        if (!confirmBtn) return;

        const modal = confirmBtn.closest('.modal-merge-event-overlay');
        const sourceId = confirmBtn.getAttribute('data-source-id');
        const targetInput = modal.querySelector('.merge-target-id-input');
        const targetId = targetInput ? targetInput.value.trim() : '';

        if (!targetId) {
            alert('Please enter or paste a valid Target Event ID.');
            return;
        }
        if (sourceId === targetId) {
            alert('Target Event ID cannot be the same as the Source Event ID.');
            return;
        }

        confirmBtn.disabled = true;
        confirmBtn.textContent = 'Merging...';

        const res = await saveAdminRule('merge_events', targetId, { event_id: sourceId });
        if (res.success) {
            alert('✅ Successfully merged event card into target event!');
            if (modal) modal.style.display = 'none';
            reloadPreservingScroll();
        } else {
            alert('❌ Error merging events: ' + (res.error || 'Failed'));
            confirmBtn.disabled = false;
            confirmBtn.textContent = 'Confirm & Merge';
        }
    });

    async function saveAdminRule(action, value, extra = {}) {
        try {
            const resp = await fetch('api/save_admin_rule.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, value, csrf_token: csrfToken, ...extra })
            });
            return await resp.json();
        } catch (err) {
            console.error('Admin API error:', err);
            return { success: false, error: err.message };
        }
    }
});
