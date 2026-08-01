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
        } else if (target.classList.contains('btn-admin-edit-artists')) {
            const eventId = target.getAttribute('data-event-id') || '';
            const artistsStr = target.getAttribute('data-artists') || '';
            if (!eventId || !artistsStr) {
                alert('Missing event data.');
                return;
            }
            
            // Parse artists (separated by " & " or "," or " and ")
            const artists = artistsStr.split(/\s*&\s*|\s*,\s*|\s+and\s+/i).map(a => a.trim()).filter(a => a);
            
            // Find the modal for this card
            const card = target.closest('.event-card');
            if (!card) return;
            
            const modal = card.querySelector('.modal-edit-artists-overlay');
            if (!modal) return;
            
            // Populate modal with input fields
            const listContainer = modal.querySelector('.artists-edit-list');
            listContainer.innerHTML = '';
            
            artists.forEach((artist, index) => {
                const inputWrapper = document.createElement('div');
                inputWrapper.className = 'artist-edit-item';
                inputWrapper.innerHTML = `
                    <label class="artist-edit-label">Artist ${index + 1}</label>
                    <input type="text" class="artist-edit-input" value="${artist.replace(/"/g, '&quot;')}" />
                `;
                listContainer.appendChild(inputWrapper);
            });
            
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
                
                const joinedArtists = editedArtists.join(' & ');
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
