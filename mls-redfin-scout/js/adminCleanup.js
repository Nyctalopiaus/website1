/**
 * MLS & Redfin Property Scout - Admin Property & Media Cleanup Module
 * Audits off-market listings, cached photos, and orphan media files, and manages cleanup execution.
 */
import { apiFetch } from './api.js';
import { CONFIG, state, elements } from './state.js';
import { showToast } from './toast.js';
import { escapeHtml, fetchProperties } from './properties.js';
import { closeAdminMenu } from './auth.js';

let cleanupData = {
    summary: null,
    properties: [],
    orphans: []
};

let selectedMlsIds = new Set();

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
    if (!state.authenticated || state.user !== 'admin') {
        return showToast('Admin privileges required', 'error');
    }
    closeAdminMenu();
    if (elements.modalAdminCleanup) {
        elements.modalAdminCleanup.classList.add('active');
    }
    selectedMlsIds.clear();
    if (elements.cleanupSelectAll) elements.cleanupSelectAll.checked = false;
    if (elements.cleanupIncludeOrphans) elements.cleanupIncludeOrphans.checked = false;
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
            <td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">
                Auditing off-market listings & cached photo files... ⏳
            </td>
        </tr>
    `;

    apiFetch(CONFIG.API_URL + '?action=admin_cleanup_preview')
        .then(data => {
            if (data && data.success) {
                cleanupData = data;
                updateCleanupStats(data.summary, data.properties, data.orphans);
                populateStatusFilter(data.summary.status_counts);
                renderAdminCleanupTable();
            } else {
                showToast(data.error || 'Failed to load cleanup preview data', 'error');
            }
        })
        .catch(err => {
            console.error('Failed to fetch cleanup preview:', err);
            if (elements.cleanupPropertiesTbody) {
                elements.cleanupPropertiesTbody.innerHTML = `
                    <tr>
                        <td colspan="7" style="text-align:center; padding:2rem; color:var(--accent-red);">
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

    if (elements.cleanupStatPhotos) elements.cleanupStatPhotos.innerText = summary.off_market_photos_count || 0;
    if (elements.cleanupStatPhotosBytes) elements.cleanupStatPhotosBytes.innerText = `${formatBytes(summary.off_market_photos_bytes)} on disk`;

    if (elements.cleanupStatOrphans) elements.cleanupStatOrphans.innerText = summary.orphan_files_count || 0;
    if (elements.cleanupStatOrphansBytes) elements.cleanupStatOrphansBytes.innerText = `${formatBytes(summary.orphan_bytes)} on disk`;

    const totalReclaimable = (summary.off_market_photos_bytes || 0) + (summary.orphan_bytes || 0);
    if (elements.cleanupStatReclaimable) elements.cleanupStatReclaimable.innerText = formatBytes(totalReclaimable);

    if (elements.cleanupOrphanSummaryText) {
        elements.cleanupOrphanSummaryText.innerText = `${summary.orphan_files_count || 0} files, ${formatBytes(summary.orphan_bytes)}`;
    }
}

function populateStatusFilter(statusCounts) {
    if (!elements.cleanupFilterStatus) return;
    const currentVal = elements.cleanupFilterStatus.value;
    
    let html = `<option value="all">All Non-Active Statuses</option>`;
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

export function renderAdminCleanupTable() {
    if (!elements.cleanupPropertiesTbody) return;

    const filterStatus = elements.cleanupFilterStatus ? elements.cleanupFilterStatus.value.toLowerCase() : 'all';
    const protectFavorites = elements.cleanupProtectFavorites ? elements.cleanupProtectFavorites.checked : true;

    const filteredProps = (cleanupData.properties || []).filter(p => {
        if (filterStatus !== 'all' && (p.status || '').toLowerCase() !== filterStatus) {
            return false;
        }
        return true;
    });

    if (!filteredProps.length) {
        elements.cleanupPropertiesTbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align:center; padding:2rem; color:var(--text-muted);">
                    No candidate off-market properties match the current status filter. 🎉
                </td>
            </tr>
        `;
        updateCleanupSelectionSummary();
        return;
    }

    elements.cleanupPropertiesTbody.innerHTML = filteredProps.map(p => {
        const isSelected = selectedMlsIds.has(p.mls_id);
        const isDisabled = protectFavorites && p.is_protected;

        let statusClass = 'badge-closed';
        const stLower = (p.status || '').toLowerCase();
        if (stLower.includes('pending') || stLower.includes('contract')) statusClass = 'badge-pending';
        else if (stLower.includes('active')) statusClass = 'badge-active';

        const thumb = p.main_image_url
            ? `<img src="${escapeHtml(p.main_image_url)}" style="width:40px; height:30px; object-fit:cover; border-radius:4px;" alt="thumb">`
            : `<div style="width:40px; height:30px; background:var(--bg-card); border-radius:4px; display:flex; align-items:center; justify-content:center; font-size:0.8rem;">🏠</div>`;

        let savedBadges = [];
        if (p.favorite) savedBadges.push(`<span title="Favorited by user">⭐ Favorite</span>`);
        if (p.user_notes) savedBadges.push(`<span title="User Notes: ${escapeHtml(p.user_notes)}">📝 Notes</span>`);
        if (p.realtor_notes) savedBadges.push(`<span title="Realtor Notes">🤝 Agent Notes</span>`);
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
                <td><span class="badge ${statusClass}">${escapeHtml(p.status)}</span></td>
                <td style="font-weight:600;">${formatPrice(p.price)}</td>
                <td style="font-size:0.75rem;">${savedHtml}</td>
                <td>${p.media_files_count} photos</td>
                <td style="font-weight:600; color:var(--accent-gold);">${formatBytes(p.media_bytes)}</td>
            </tr>
        `;
    }).join('');

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
            const modeText = mode === 'full_delete' ? 'delete properties & photos' : 'delete photos only';
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

export function clearSelection() {
    selectedMlsIds.clear();
    if (elements.cleanupSelectAll) elements.cleanupSelectAll.checked = false;
    renderAdminCleanupTable();
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

    let modeDescription = mode === 'full_delete'
        ? 'PERMANENTLY DELETE selected property records and their photo files'
        : 'DELETE local photo files for selected properties while preserving listing text data';

    let confirmMsg = `⚠️ Are you sure you want to execute property cleanup?\n\n`
        + `• Mode: ${modeDescription}\n`
        + `• Target Properties: ${targetMlsIds.length}\n`
        + `• Include Orphan Media Files: ${includeOrphans ? 'Yes' : 'No'}\n\n`
        + `This action cannot be undone. Proceed?`;

    if (!confirm(confirmMsg)) {
        return;
    }

    if (elements.btnAdminCleanupSubmit) {
        elements.btnAdminCleanupSubmit.disabled = true;
        elements.btnAdminCleanupSubmit.innerText = 'Cleaning Up... ⏳';
    }

    apiFetch(CONFIG.API_URL + '?action=admin_cleanup_execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            target_mls_ids: targetMlsIds,
            cleanup_mode: mode,
            clean_orphans: includeOrphans
        })
    })
    .then(data => {
        if (data && data.success) {
            const freedText = formatBytes(data.freed_bytes || 0);
            showToast(`Cleanup complete! Removed ${data.deleted_properties_count} items and freed ${freedText} 🧹`, 'success');
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
            elements.btnAdminCleanupSubmit.innerText = '🔥 Clean Up Selected Items';
        }
    });
}
