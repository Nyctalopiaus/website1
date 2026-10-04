/**
 * Nycto's MLS Property Scout - Admin Property & Media Cleanup Module
 * Audits off-market listings, cached photos, and orphan media files, and manages cleanup execution.
 */
import { apiFetch } from './api.js';
import { CONFIG, state, elements } from './state.js';
import { showToast } from './toast.js';
import { escapeHtml, fetchProperties, getStatusBadgeClass } from './properties.js';
import { closeAdminMenu } from './auth.js';

let cleanupData = {
    summary: null,
    properties: [],
    orphans: []
};

let selectedMlsIds = new Set();

// Image Health panel state. Kept separate from selectedMlsIds on purpose: that set feeds the
// delete/cleanup action, and the listings in this panel are mostly healthy active ones that
// must never end up in it.
let imageHealthSelectedIds = new Set();
let imageHealthPanelOpen = false;
let imageHealthAwaitingData = false;

function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return bytes + ' B';
}

function formatPrice(val) {
    if (!val || isNaN(val)) return '$0';
    return '$' + Math.round(val).toLocaleString();
}

export function openAdminCleanupModal() {
    if (!state.authenticated || !state.isAdmin) {
        return showToast('Admin privileges required', 'error');
    }
    closeAdminMenu();
    if (elements.modalAdminCleanup) {
        elements.modalAdminCleanup.classList.add('active');
    }
    selectedMlsIds.clear();
    if (elements.cleanupSelectAll) elements.cleanupSelectAll.checked = false;
    if (elements.cleanupIncludeOrphans) elements.cleanupIncludeOrphans.checked = false;
    closeImageHealthPanel();
    fetchAdminCleanupPreview();
}

export function closeAdminCleanupModal() {
    if (elements.modalAdminCleanup) {
        elements.modalAdminCleanup.classList.remove('active');
    }
}

export function fetchAdminCleanupPreview() {
    if (!elements.cleanupPropertiesTbody) return;
    elements.cleanupPropertiesTbody.innerHTML = `
        <tr>
            <td colspan="8" style="text-align:center; padding:2rem; color:var(--text-muted);">
                Auditing off-market & stale active listings & cached photo files...
            </td>
        </tr>
    `;

    const staleDays = elements.cleanupStaleThreshold ? elements.cleanupStaleThreshold.value : 14;

    apiFetch(CONFIG.API_URL + '?action=admin_cleanup_preview&stale_days=' + encodeURIComponent(staleDays))
        .then(data => {
            if (data && data.success) {
                cleanupData = data;
                updateCleanupStats(data.summary, data.properties, data.orphans);
                populateStatusFilter(data.summary.status_counts, data.summary);
                renderAdminCleanupTable();
                renderImageHealthPanel();
            } else {
                showToast(data.error || 'Failed to load cleanup preview data', 'error');
            }
        })
        .catch(err => {
            console.error('Failed to fetch cleanup preview:', err);
            if (elements.cleanupPropertiesTbody) {
                elements.cleanupPropertiesTbody.innerHTML = `
                    <tr>
                        <td colspan="8" style="text-align:center; padding:2rem; color:var(--accent-red);">
                            Failed to load audit data: ${escapeHtml(err.message || 'Server error')}
                        </td>
                    </tr>
                `;
            }
        });
}

function updateCleanupStats(summary, properties, orphans) {
    if (!summary) return;

    if (elements.cleanupStatProps) elements.cleanupStatProps.innerText = summary.off_market_count || 0;
    if (elements.cleanupStatPropsSub) {
        const statuses = Object.keys(summary.status_counts || {})
            .filter(s => s.toLowerCase() !== 'active')
            .join(', ');
        elements.cleanupStatPropsSub.innerText = statuses ? `Statuses: ${statuses}` : 'Non-Active Listings';
    }

    if (elements.cleanupStatStale) elements.cleanupStatStale.innerText = summary.stale_active_count || 0;
    if (elements.cleanupStatStaleSub) {
        elements.cleanupStatStaleSub.innerText = `Active but not synced in ${summary.stale_days_threshold || 14}+ days`;
    }

    if (elements.cleanupStatPhotos) elements.cleanupStatPhotos.innerText = (summary.off_market_photos_count || 0) + (summary.stale_active_photos_count || 0);
    if (elements.cleanupStatPhotosBytes) elements.cleanupStatPhotosBytes.innerText = `${formatBytes((summary.off_market_photos_bytes || 0) + (summary.stale_active_photos_bytes || 0))} on disk`;

    if (elements.cleanupStatOrphans) elements.cleanupStatOrphans.innerText = summary.orphan_files_count || 0;
    if (elements.cleanupStatOrphansBytes) elements.cleanupStatOrphansBytes.innerText = `${formatBytes(summary.orphan_bytes)} on disk`;

    const totalReclaimable = (summary.off_market_photos_bytes || 0) + (summary.stale_active_photos_bytes || 0) + (summary.orphan_bytes || 0);
    if (elements.cleanupStatReclaimable) elements.cleanupStatReclaimable.innerText = formatBytes(totalReclaimable);
    if (elements.cleanupStatImageIssues) elements.cleanupStatImageIssues.innerText = summary.invalid_primary_preview_count || 0;
    if (elements.cleanupStatImageIssuesSub) {
        elements.cleanupStatImageIssuesSub.innerText = `Bad or missing photos · ${summary.low_photo_count || 0} under ${summary.low_photo_threshold || 5} photos · click to review`;
    }

    if (elements.cleanupOrphanSummaryText) {
        elements.cleanupOrphanSummaryText.innerText = `${summary.orphan_files_count || 0} files, ${formatBytes(summary.orphan_bytes)}`;
    }
}

function populateStatusFilter(statusCounts, summary) {
    if (!elements.cleanupFilterStatus) return;
    const currentVal = elements.cleanupFilterStatus.value;
    const staleDays = summary?.stale_days_threshold || 14;
    const staleCount = summary?.stale_active_count || 0;
    
    let html = `<option value="all">All Candidates (Off-Market + Stale)</option>`;
    html += `<option value="stale_active">Stale Active Listings (${staleCount})</option>`;
    if (statusCounts) {
        for (const [st, count] of Object.entries(statusCounts)) {
            if (st.toLowerCase() === 'active') continue;
            html += `<option value="${escapeHtml(st)}">${escapeHtml(st)} (${count})</option>`;
        }
    }
    elements.cleanupFilterStatus.innerHTML = html;
    if (currentVal && Array.from(elements.cleanupFilterStatus.options).some(o => o.value === currentVal)) {
        elements.cleanupFilterStatus.value = currentVal;
    }
}

// ---- Cleanup table column sorting ---------------------------------------------------------
// Keyed by <th> position in the cleanup table's header row (index 0 is the select-all box).
// key null = the backend's own order (non-active first, then oldest sync first).
const CLEANUP_SORT_COLUMNS = [null, 'listing', 'status', 'sync', 'price', 'saved', 'photos', 'bytes'];
const CLEANUP_SORT_TEXT_KEYS = new Set(['listing', 'status']);
let cleanupSort = { key: null, dir: 1 };

function cleanupSortValue(p, key) {
    switch (key) {
        case 'listing': return p.address || '';
        case 'status': return p.is_stale_active ? 'Active (Stale)' : (p.status || '');
        case 'sync': return Number(p.days_since_sync) || 0;
        case 'price': return Number(p.price) || 0;
        // Favorites first, then user notes, then agent notes, then nothing saved.
        case 'saved': return (p.favorite ? 4 : 0) + (p.user_notes ? 2 : 0) + (p.realtor_notes ? 1 : 0);
        case 'photos': return Number(p.media_files_count) || 0;
        case 'bytes': return Number(p.media_bytes) || 0;
        default: return 0;
    }
}

function sortCleanupProperties(props) {
    const { key, dir } = cleanupSort;
    if (!key) return props;
    const isText = CLEANUP_SORT_TEXT_KEYS.has(key);
    return props.sort((a, b) => {
        const av = cleanupSortValue(a, key);
        const bv = cleanupSortValue(b, key);
        const cmp = isText
            ? String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: 'base' })
            : av - bv;
        return cmp * dir;
    });
}

// First click: A-Z for text columns, largest first for numeric ones. Second click reverses,
// third click returns to the default order.
function cycleCleanupSort(key) {
    const firstDir = CLEANUP_SORT_TEXT_KEYS.has(key) ? 1 : -1;
    if (cleanupSort.key !== key) cleanupSort = { key, dir: firstDir };
    else if (cleanupSort.dir === firstDir) cleanupSort = { key, dir: -firstDir };
    else cleanupSort = { key: null, dir: 1 };
    renderAdminCleanupTable();
}

function syncCleanupSortHeaders() {
    const headRow = elements.cleanupPropertiesTbody.closest('table')?.querySelector('thead tr');
    if (!headRow) return;
    [...headRow.children].forEach((th, i) => {
        const key = CLEANUP_SORT_COLUMNS[i];
        if (!key) return;
        if (!th.dataset.sortKey) {
            th.dataset.sortKey = key;
            th.dataset.sortLabel = th.textContent.trim();
            th.style.cursor = 'pointer';
            th.style.userSelect = 'none';
            th.title = 'Click to sort';
            th.tabIndex = 0;
            th.addEventListener('click', () => cycleCleanupSort(key));
            th.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter' && e.key !== ' ') return;
                e.preventDefault();
                cycleCleanupSort(key);
            });
        }
        const active = cleanupSort.key === key;
        th.textContent = th.dataset.sortLabel + (active ? (cleanupSort.dir === 1 ? ' \u25B2' : ' \u25BC') : '');
        th.setAttribute('aria-sort', active ? (cleanupSort.dir === 1 ? 'ascending' : 'descending') : 'none');
    });
}

export function renderAdminCleanupTable() {
    if (!elements.cleanupPropertiesTbody) return;
    syncCleanupSortHeaders();

    const filterStatus = elements.cleanupFilterStatus ? elements.cleanupFilterStatus.value.toLowerCase() : 'all';
    const protectFavorites = elements.cleanupProtectFavorites ? elements.cleanupProtectFavorites.checked : true;

    const filteredProps = (cleanupData.properties || []).filter(p => {
        if (filterStatus === 'stale_active') {
            return !!p.is_stale_active;
        }
        if (filterStatus !== 'all' && (p.status || '').toLowerCase() !== filterStatus) {
            return false;
        }
        return true;
    });
    sortCleanupProperties(filteredProps);

    if (!filteredProps.length) {
        elements.cleanupPropertiesTbody.innerHTML = `
            <tr>
                <td colspan="8" style="text-align:center; padding:2rem; color:var(--text-muted);">
                    No candidate properties match the current status filter.
                </td>
            </tr>
        `;
        updateCleanupSelectionSummary();
        return;
    }

    elements.cleanupPropertiesTbody.innerHTML = filteredProps.map(p => {
        const isSelected = selectedMlsIds.has(p.mls_id);
        const isDisabled = protectFavorites && p.is_protected;

        const statusClass = p.is_stale_active ? 'badge-warning' : getStatusBadgeClass(p.status);
        const statusBadge = p.is_stale_active
            ? `<span class="badge ${statusClass}" style="background:rgba(234, 179, 8, 0.15); color:#D97706; border:1px solid rgba(234, 179, 8, 0.3);"><i data-lucide="clock" style="width:11px; height:11px; margin-right:3px;"></i> Active (Stale)</span>`
            : `<span class="badge ${statusClass}">${escapeHtml(p.status)}</span>`;

        const syncAgeHtml = p.days_since_sync !== undefined
            ? `<span style="font-size:0.75rem; font-weight:600; color:${p.days_since_sync >= 14 ? 'var(--accent-gold)' : 'var(--text-muted)'};">${p.days_since_sync}d ago</span>`
            : `<span style="font-size:0.75rem; color:var(--text-muted);">N/A</span>`;

        const thumb = p.main_image_url
            ? `<img src="${escapeHtml(p.main_image_url)}" style="width:40px; height:30px; object-fit:cover; border-radius:4px;" alt="thumb">`
            : `<div style="width:40px; height:30px; background:var(--bg-card); border-radius:4px; display:flex; align-items:center; justify-content:center;"><i data-lucide="home" style="width:0.9em; height:0.9em;"></i></div>`;

        let savedBadges = [];
        if (p.favorite) savedBadges.push(`<span title="Favorited by user"><i data-lucide="star"></i> Favorite</span>`);
        if (p.user_notes) savedBadges.push(`<span title="User Notes: ${escapeHtml(p.user_notes)}"><i data-lucide="file-text"></i> Notes</span>`);
        if (p.realtor_notes) savedBadges.push(`<span title="Realtor Notes"><i data-lucide="handshake"></i> Agent Notes</span>`);
        const savedHtml = savedBadges.length ? savedBadges.join(' ') : `<span style="color:var(--text-muted); font-size:0.75rem;">None</span>`;

        return `
            <tr style="${isDisabled ? 'opacity:0.6;' : ''}">
                <td style="text-align:center;">
                    <input type="checkbox"
                           class="cleanup-item-checkbox"
                           data-mls-id="${escapeHtml(p.mls_id)}"
                           ${isSelected ? 'checked' : ''}
                           ${isDisabled ? 'disabled title="Protected because listing is favorited or has user notes"' : ''}
                           style="accent-color: var(--accent-emerald); cursor:${isDisabled ? 'not-allowed' : 'pointer'};">
                </td>
                <td>
                    <div style="display:flex; align-items:center; gap:0.6rem;">
                        ${thumb}
                        <div>
                            <div style="font-weight:600;">${escapeHtml(p.address || 'Address N/A')}</div>
                            <div style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(p.city)}, ${escapeHtml(p.state)} • MLS #${escapeHtml(p.mls_id)}</div>
                        </div>
                    </div>
                </td>
                <td>${statusBadge}</td>
                <td>${syncAgeHtml}</td>
                <td style="font-weight:600;">${formatPrice(p.price)}</td>
                <td style="font-size:0.75rem;">${savedHtml}</td>
                <td>${p.media_files_count} photos</td>
                <td style="font-weight:600; color:var(--accent-gold);">${formatBytes(p.media_bytes)}</td>
            </tr>
        `;
    }).join('');
    if (window.lucide) window.lucide.createIcons();

    // Attach row checkbox event listeners
    elements.cleanupPropertiesTbody.querySelectorAll('.cleanup-item-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const mlsId = e.target.dataset.mlsId;
            if (e.target.checked) {
                selectedMlsIds.add(mlsId);
            } else {
                selectedMlsIds.delete(mlsId);
            }
            updateCleanupSelectionSummary();
        });
    });

    updateCleanupSelectionSummary();
}

export function updateCleanupSelectionSummary() {
    const mode = elements.cleanupModeSelect ? elements.cleanupModeSelect.value : 'full_delete';
    const includeOrphans = elements.cleanupIncludeOrphans ? elements.cleanupIncludeOrphans.checked : false;

    let selectedPropsCount = selectedMlsIds.size;
    let selectedPhotosCount = 0;
    let selectedBytes = 0;

    (cleanupData.properties || []).forEach(p => {
        if (selectedMlsIds.has(p.mls_id)) {
            selectedPhotosCount += p.media_files_count || 0;
            selectedBytes += p.media_bytes || 0;
        }
    });

    if (includeOrphans && cleanupData.summary) {
        selectedPhotosCount += cleanupData.summary.orphan_files_count || 0;
        selectedBytes += cleanupData.summary.orphan_bytes || 0;
    }

    if (elements.cleanupSelectionSummary) {
        if (selectedPropsCount === 0 && !includeOrphans) {
            elements.cleanupSelectionSummary.innerText = 'No properties or orphan files selected for cleanup.';
        } else {
            let modeText = 'delete properties & photos';
            if (mode === 'mark_stale') modeText = 'mark status as "Stale / Unsynced"';
            else if (mode === 'media_only') modeText = 'delete photos only';

            const propText = selectedPropsCount === 1 ? '1 property' : `${selectedPropsCount} properties`;
            const orphanText = includeOrphans ? ` + ${cleanupData.summary?.orphan_files_count || 0} orphan files` : '';
            elements.cleanupSelectionSummary.innerHTML = `
                Selected: <strong style="color:var(--text-primary);">${propText}${orphanText}</strong> 
                (${selectedPhotosCount} photos, <strong style="color:var(--accent-emerald);">${formatBytes(selectedBytes)}</strong> to free) 
                • Mode: <em>${modeText}</em>
            `;
        }
    }

    if (elements.btnAdminCleanupSubmit) {
        elements.btnAdminCleanupSubmit.disabled = (selectedPropsCount === 0 && !includeOrphans);
    }
}

export function selectCandidateHomes() {
    const protectFavorites = elements.cleanupProtectFavorites ? elements.cleanupProtectFavorites.checked : true;
    selectedMlsIds.clear();

    (cleanupData.properties || []).forEach(p => {
        if (!protectFavorites || !p.is_protected) {
            selectedMlsIds.add(p.mls_id);
        }
    });

    if (elements.cleanupSelectAll) elements.cleanupSelectAll.checked = true;
    renderAdminCleanupTable();
}

export function selectStaleCandidates() {
    const protectFavorites = elements.cleanupProtectFavorites ? elements.cleanupProtectFavorites.checked : true;
    selectedMlsIds.clear();

    (cleanupData.properties || []).forEach(p => {
        if (p.is_stale_active) {
            if (!protectFavorites || !p.is_protected) {
                selectedMlsIds.add(p.mls_id);
            }
        }
    });

    if (elements.cleanupSelectAll) elements.cleanupSelectAll.checked = true;
    renderAdminCleanupTable();
}

export function clearSelection() {
    selectedMlsIds.clear();
    if (elements.cleanupSelectAll) elements.cleanupSelectAll.checked = false;
    renderAdminCleanupTable();
}

async function requestImageRetry(mlsIds) {
    try {
        const res = await apiFetch(CONFIG.API_URL + '?action=admin_retry_listing_images', {
            method: 'POST',
            body: JSON.stringify({ mls_ids: mlsIds })
        });
        if (res?.success) {
            showToast(`${res.marked_count} listing(s) marked for image re-scrape`, 'success');
            return true;
        }
        showToast(res?.error || 'Failed to mark listings for image re-scrape', 'error');
    } catch (e) {
        showToast('Failed to mark listings for image re-scrape', 'error');
    }
    return false;
}

export async function markSelectedForImageRetry() {
    if (!selectedMlsIds.size) {
        showToast('Select at least one listing first', 'warning');
        return;
    }
    if (await requestImageRetry([...selectedMlsIds])) {
        selectedMlsIds.clear();
        fetchAdminCleanupPreview();
    }
}

// ---- Image Health panel ------------------------------------------------------------------
// Opened by clicking the "Image Health Issues" card. Lists every listing (any status, not just
// the cleanup candidates in the main table) that has a bad cached photo or fewer photos than
// the backend's low-photo threshold, and queues the ticked ones for a deep image re-scrape.

// "When a sync last saw this listing", from the backend's seconds_since_sync.
function formatSyncAge(seconds) {
    if (seconds === null || seconds === undefined) return 'Never';
    if (seconds < 3600) return `${Math.max(1, Math.round(seconds / 60))} min ago`;
    if (seconds < 86400) return `${Math.round(seconds / 3600)} hr ago`;
    const days = Math.floor(seconds / 86400);
    return `${days} day${days === 1 ? '' : 's'} ago`;
}

// Queued, but no scrape has touched it in over a day: the search no longer returns it, so the
// queue can't be worked off until one does.
function isQueuedButUnreached(l) {
    return !!l.rescrape_queued && (l.seconds_since_sync === null || l.seconds_since_sync === undefined || l.seconds_since_sync >= 86400);
}

function getImageHealthListings() {
    // Bad photos first, then not-yet-queued before queued, then fewest photos first.
    return (cleanupData.image_health_listings || []).slice().sort((a, b) =>
        (Number(!!b.has_bad_photo) - Number(!!a.has_bad_photo))
        || (Number(!!a.rescrape_queued) - Number(!!b.rescrape_queued))
        || ((a.photo_count || 0) - (b.photo_count || 0)));
}

function selectDefaultImageHealthListings() {
    // Everything that isn't already waiting on a re-scrape.
    imageHealthSelectedIds = new Set(
        getImageHealthListings().filter(l => !l.rescrape_queued).map(l => l.mls_id)
    );
}

function updateImageHealthSelectionUi(listings) {
    const count = imageHealthSelectedIds.size;
    if (elements.btnImageHealthRetryLabel) {
        elements.btnImageHealthRetryLabel.innerText = count ? `Mark ${count} for Image Re-scrape` : 'Mark for Image Re-scrape';
    }
    if (elements.btnImageHealthRetry) elements.btnImageHealthRetry.disabled = count === 0;
    if (elements.imageHealthSelectAll) {
        elements.imageHealthSelectAll.checked = listings.length > 0 && count === listings.length;
        elements.imageHealthSelectAll.indeterminate = count > 0 && count < listings.length;
    }
}

function renderImageHealthPanel() {
    if (!imageHealthPanelOpen || !elements.cleanupImageHealthTbody) return;

    const listings = getImageHealthListings();
    const threshold = cleanupData.summary?.low_photo_threshold || 5;

    if (imageHealthAwaitingData && cleanupData.summary) {
        // The card was clicked before the audit finished loading; apply the default selection now.
        imageHealthAwaitingData = false;
        selectDefaultImageHealthListings();
    }

    // Drop selections for listings that left the list after a refresh.
    const validIds = new Set(listings.map(l => l.mls_id));
    imageHealthSelectedIds.forEach(id => { if (!validIds.has(id)) imageHealthSelectedIds.delete(id); });

    if (elements.cleanupImageHealthSummary) {
        const bad = listings.filter(l => l.has_bad_photo).length;
        const few = listings.filter(l => l.has_few_photos).length;
        const queued = listings.filter(l => l.rescrape_queued).length;
        const unreached = listings.filter(isQueuedButUnreached).length;
        elements.cleanupImageHealthSummary.innerText =
            `${bad} with a bad or missing photo · ${few} with under ${threshold} photos · ${queued} already queued. ` +
            'Marked listings get their gallery re-walked on the next deep scrape.' +
            (unreached ? ` ${unreached} queued listing${unreached === 1 ? ' has' : 's have'} not been seen by a scrape in over a day, so no search is returning ${unreached === 1 ? 'it' : 'them'} to re-scrape.` : '');
    }

    if (!listings.length) {
        elements.cleanupImageHealthTbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; padding:1.5rem; color:var(--text-muted);">
                    ${cleanupData.summary ? `No listings have bad photos or fewer than ${threshold} photos.` : 'Loading audit data...'}
                </td>
            </tr>
        `;
        updateImageHealthSelectionUi(listings);
        return;
    }

    elements.cleanupImageHealthTbody.innerHTML = listings.map(l => {
        const thumb = l.main_image_url
            ? `<img src="${escapeHtml(l.main_image_url)}" loading="lazy" style="width:40px; height:30px; object-fit:cover; border-radius:4px;" alt="thumb">`
            : `<div style="width:40px; height:30px; background:var(--bg-card); border-radius:4px; display:flex; align-items:center; justify-content:center;"><i data-lucide="image-off" style="width:0.9em; height:0.9em;"></i></div>`;

        const issues = [];
        if (l.has_bad_photo) issues.push(`<span class="badge" style="background:rgba(176, 70, 58, 0.12); color:var(--accent-red); border:1px solid rgba(176, 70, 58, 0.3);">Bad photo</span>`);
        if (l.has_few_photos) issues.push(`<span class="badge" style="background:rgba(234, 179, 8, 0.15); color:#D97706; border:1px solid rgba(234, 179, 8, 0.3);">Under ${threshold} photos</span>`);

        const queuedHtml = l.rescrape_queued
            ? `<span style="font-size:0.75rem; font-weight:600; color:var(--accent-emerald);"><i data-lucide="clock" style="width:11px; height:11px; margin-right:3px;"></i>Queued</span>`
            : `<span style="font-size:0.75rem; color:var(--text-muted);">Not queued</span>`;

        const unreached = isQueuedButUnreached(l);
        const syncedTitle = (l.last_synced_at ? new Date(l.last_synced_at).toLocaleString() : 'No sync has recorded this listing')
            + (unreached ? ' - queued, but no scrape has reached it since' : '');
        const syncedHtml = `<span title="${escapeHtml(syncedTitle)}" style="font-size:0.75rem; white-space:nowrap; ${unreached ? 'font-weight:600; color:var(--accent-gold);' : 'color:var(--text-muted);'}">${formatSyncAge(l.seconds_since_sync)}</span>`;

        return `
            <tr>
                <td style="text-align:center;">
                    <input type="checkbox"
                           class="image-health-checkbox"
                           data-mls-id="${escapeHtml(l.mls_id)}"
                           ${imageHealthSelectedIds.has(l.mls_id) ? 'checked' : ''}
                           style="accent-color: var(--accent-emerald); cursor:pointer;">
                </td>
                <td>
                    <div style="display:flex; align-items:center; gap:0.6rem;">
                        ${thumb}
                        <div>
                            <div style="font-weight:600;">${escapeHtml(l.address || 'Address N/A')}</div>
                            <div style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(l.city)}, ${escapeHtml(l.state)} • MLS #${escapeHtml(l.mls_id)}</div>
                        </div>
                    </div>
                </td>
                <td><span class="badge ${getStatusBadgeClass(l.status)}">${escapeHtml(l.status)}</span></td>
                <td>${l.photo_count || 0} photo${l.photo_count === 1 ? '' : 's'}</td>
                <td><div style="display:flex; flex-wrap:wrap; gap:0.3rem;">${issues.join('')}</div></td>
                <td>${syncedHtml}</td>
                <td>${queuedHtml}</td>
            </tr>
        `;
    }).join('');
    if (window.lucide) window.lucide.createIcons();

    elements.cleanupImageHealthTbody.onchange = (e) => {
        const cb = e.target.closest('.image-health-checkbox');
        if (!cb) return;
        if (cb.checked) imageHealthSelectedIds.add(cb.dataset.mlsId);
        else imageHealthSelectedIds.delete(cb.dataset.mlsId);
        updateImageHealthSelectionUi(listings);
    };
    updateImageHealthSelectionUi(listings);
}

export function toggleImageHealthPanel() {
    if (imageHealthPanelOpen) {
        closeImageHealthPanel();
        return;
    }
    imageHealthPanelOpen = true;
    imageHealthAwaitingData = !cleanupData.summary;
    selectDefaultImageHealthListings();
    if (elements.cleanupImageHealthPanel) elements.cleanupImageHealthPanel.style.display = '';
    if (elements.cleanupCardImageIssues) elements.cleanupCardImageIssues.setAttribute('aria-expanded', 'true');
    renderImageHealthPanel();
    if (elements.cleanupImageHealthPanel) elements.cleanupImageHealthPanel.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

export function closeImageHealthPanel() {
    imageHealthPanelOpen = false;
    imageHealthAwaitingData = false;
    imageHealthSelectedIds.clear();
    if (elements.cleanupImageHealthPanel) elements.cleanupImageHealthPanel.style.display = 'none';
    if (elements.cleanupCardImageIssues) elements.cleanupCardImageIssues.setAttribute('aria-expanded', 'false');
}

export function toggleImageHealthSelectAll(e) {
    if (e.target.checked) {
        imageHealthSelectedIds = new Set(getImageHealthListings().map(l => l.mls_id));
    } else {
        imageHealthSelectedIds.clear();
    }
    renderImageHealthPanel();
}

export async function markImageHealthForRetry() {
    if (!imageHealthSelectedIds.size) {
        showToast('Tick at least one listing first', 'warning');
        return;
    }
    if (elements.btnImageHealthRetry) elements.btnImageHealthRetry.disabled = true;
    const ok = await requestImageRetry([...imageHealthSelectedIds]);
    if (ok) {
        imageHealthSelectedIds.clear();
        fetchAdminCleanupPreview();
    }
    renderImageHealthPanel();
}

export function toggleSelectAll(e) {
    const isChecked = e.target.checked;
    const protectFavorites = elements.cleanupProtectFavorites ? elements.cleanupProtectFavorites.checked : true;

    (cleanupData.properties || []).forEach(p => {
        if (isChecked) {
            if (!protectFavorites || !p.is_protected) {
                selectedMlsIds.add(p.mls_id);
            }
        } else {
            selectedMlsIds.delete(p.mls_id);
        }
    });

    renderAdminCleanupTable();
}

export function handleAdminCleanupExecute() {
    const mode = elements.cleanupModeSelect ? elements.cleanupModeSelect.value : 'full_delete';
    const includeOrphans = elements.cleanupIncludeOrphans ? elements.cleanupIncludeOrphans.checked : false;
    const targetMlsIds = Array.from(selectedMlsIds);

    if (!targetMlsIds.length && !includeOrphans) {
        return showToast('Please select at least one property or orphan cleanup option.', 'error');
    }

    let modeDescription = 'PERMANENTLY DELETE selected property records and their photo files';
    if (mode === 'mark_stale') {
        modeDescription = 'CHANGE STATUS of selected properties to "Stale / Unsynced" (preserving local photos & notes)';
    } else if (mode === 'media_only') {
        modeDescription = 'DELETE local photo files for selected properties while preserving listing text data';
    }

    let confirmMsg = `Are you sure you want to execute property cleanup?\n\n`
        + `• Mode: ${modeDescription}\n`
        + `• Target Properties: ${targetMlsIds.length}\n`
        + `• Include Orphan Media Files: ${includeOrphans ? 'Yes' : 'No'}\n\n`
        + `Proceed?`;

    if (!confirm(confirmMsg)) {
        return;
    }

    if (elements.btnAdminCleanupSubmit) {
        elements.btnAdminCleanupSubmit.disabled = true;
        elements.btnAdminCleanupSubmit.innerText = 'Processing...';
    }

    apiFetch(CONFIG.API_URL + '?action=admin_cleanup_execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            target_mls_ids: targetMlsIds,
            cleanup_mode: mode,
            target_status: 'Stale / Unsynced',
            clean_orphans: includeOrphans
        })
    })
    .then(data => {
        if (data && data.success) {
            const freedText = formatBytes(data.freed_bytes || 0);
            const actionText = mode === 'mark_stale' ? 'Updated status for' : 'Removed';
            showToast(`Cleanup complete! ${actionText} ${data.deleted_properties_count} items and freed ${freedText}`, 'success');
            selectedMlsIds.clear();
            if (elements.cleanupSelectAll) elements.cleanupSelectAll.checked = false;
            fetchProperties(); // Refresh main dashboard list
            fetchAdminCleanupPreview(); // Refresh cleanup modal stats
        } else {
            showToast(data.error || 'Cleanup execution failed', 'error');
        }
    })
    .catch(err => {
        console.error('Error executing admin cleanup:', err);
        showToast('Error executing property cleanup', 'error');
    })
    .finally(() => {
        if (elements.btnAdminCleanupSubmit) {
            elements.btnAdminCleanupSubmit.disabled = false;
            elements.btnAdminCleanupSubmit.innerHTML = '<i data-lucide="flame"></i> Clean Up Selected Items';
            if (window.lucide) window.lucide.createIcons();
        }
    });
}
