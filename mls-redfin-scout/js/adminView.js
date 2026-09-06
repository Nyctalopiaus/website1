import { apiFetch } from './api.js';
import { state } from './state.js';
import { showToast } from './toast.js';
import { escapeHtml } from './properties.js';
import { openAdminCleanupModal } from './adminCleanup.js';
import { openEventLogModal, openUserMgmtModal } from './auth.js';

function renderKpi(label, value, detail, icon, tone = '') {
    return `
        <div class="kpi-card" style="${tone ? `border-color:${tone};` : ''}">
            <div class="kpi-card-header"><span class="kpi-label">${label}</span><span class="kpi-card-icon"><i data-lucide="${icon}"></i></span></div>
            <div class="kpi-value">${value}</div>
            <div class="kpi-sub">${detail}</div>
        </div>
    `;
}

function openAddressCorrectionModal(property) {
    document.getElementById('admin-address-correction-modal')?.remove();
    const modal = document.createElement('div');
    modal.id = 'admin-address-correction-modal';
    modal.className = 'modal-overlay active';
    modal.style.zIndex = '11000';
    modal.innerHTML = `
        <div class="modal-content modal-content--confirm">
            <button type="button" class="modal-close" aria-label="Close"><i data-lucide="x"></i></button>
            <h3 class="modal-title-row"><i data-lucide="map-pin"></i> Correct Listing Address</h3>
            <p class="modal-description">MLS #${escapeHtml(property.mlsId)}</p>
            <label class="filter-label modal-field-label">Street address</label><input class="input-text modal-field-control" id="admin-address-street" value="${escapeHtml(property.address || '')}">
            <div style="display:grid; grid-template-columns:1fr 80px 120px; gap:0.65rem; margin-top:0.65rem;"><div><label class="filter-label">City</label><input class="input-text" id="admin-address-city" value="${escapeHtml(property.city || '')}"></div><div><label class="filter-label">State</label><input class="input-text" id="admin-address-state" maxlength="2" value="${escapeHtml(property.state || '')}"></div><div><label class="filter-label">ZIP</label><input class="input-text" id="admin-address-zip" maxlength="10" value="${escapeHtml(property.zip || '')}"></div></div>
            <div class="modal-actions"><button type="button" class="btn btn-secondary" data-action="cancel">Cancel</button><button type="button" class="btn btn-gold" data-action="save"><i data-lucide="save"></i> Save Address</button></div>
        </div>
    `;
    const close = () => modal.remove();
    modal.querySelector('.modal-close')?.addEventListener('click', close);
    modal.querySelector('[data-action="cancel"]')?.addEventListener('click', close);
    modal.querySelector('[data-action="save"]')?.addEventListener('click', async () => {
        const response = await apiFetch('backend/api.php?action=admin_update_property_address', { method: 'POST', body: JSON.stringify({ mls_id: property.mlsId, address: document.getElementById('admin-address-street')?.value.trim() || '', city: document.getElementById('admin-address-city')?.value.trim() || '', state: document.getElementById('admin-address-state')?.value.trim() || '', zip: document.getElementById('admin-address-zip')?.value.trim() || '' }) });
        if (response?.success) {
            close();
            showToast('Listing address corrected', 'success');
            renderAdminView();
        } else {
            showToast(response?.error || 'Failed to correct address', 'error');
        }
    });
    document.body.appendChild(modal);
    if (window.lucide) window.lucide.createIcons();
}

export async function renderAdminView() {
    const container = document.getElementById('view-admin-container');
    if (!container) return;
    if (!state.authenticated || !state.isAdmin) {
        container.innerHTML = '<div class="empty-state-box" style="text-align:center; padding:4rem;"><h3>Admin access required</h3><p style="color:var(--text-muted);">This workspace is available only to administrators.</p></div>';
        return;
    }

    container.innerHTML = '<div class="loading-spinner-container" style="text-align:center; padding:4rem;"><i data-lucide="loader-2" class="spin-icon" style="width:36px; height:36px; color:var(--accent-gold);"></i><p style="margin-top:1rem; color:var(--text-muted);">Loading Admin Operations...</p></div>';
    if (window.lucide) window.lucide.createIcons();

    try {
        const [usersResult, visibilityResult, cleanupResult, eventsResult, scrapeRunsResult] = await Promise.all([
            apiFetch('backend/api.php?action=list_users'),
            apiFetch('backend/api.php?action=list_global_property_visibility'),
            apiFetch('backend/api.php?action=admin_cleanup_preview'),
            apiFetch('backend/api.php?action=view_event_log'),
            apiFetch('backend/api.php?action=get_scrape_runs')
        ]);
        const users = usersResult?.users || [];
        const visibility = visibilityResult?.properties || [];
        const summary = cleanupResult?.summary || {};
        const missingAddressListings = summary.missing_address_listings || [];
        const events = eventsResult?.logs || [];
        const scrapeRuns = scrapeRunsResult?.runs || [];
        const hidden = visibility.filter(property => property.is_hidden).length;
        const clientCount = users.filter(user => user.role === 'client').length;
        const recentScrape = events.find(event => event.source === 'scrape' || event.source === 'sync');

        container.innerHTML = `
            <section class="admin-operations" style="display:grid; gap:1.25rem;">
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; flex-wrap:wrap;">
                    <div>
                        <h2 class="font-serif" style="font-size:1.45rem;"><i data-lucide="shield-check"></i> Admin Operations</h2>
                        <p style="margin-top:0.25rem; color:var(--text-muted);">System health, data integrity, security activity, and maintenance controls.</p>
                    </div>
                    <button type="button" class="btn btn-secondary" id="admin-operations-refresh" title="Refresh admin operations"><i data-lucide="refresh-cw"></i></button>
                </div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); gap:1rem;">
                    ${renderKpi('Stored Listings', visibility.length, `${hidden} globally hidden`, 'house')}
                    ${renderKpi('Image Health', summary.invalid_primary_preview_count || 0, 'Missing or invalid previews', 'image-off', 'rgba(184,122,42,0.35)')}
                    ${renderKpi('Address Quality', summary.missing_address_count || 0, 'Listings missing an address', 'map-pin-off', 'rgba(176,70,58,0.28)')}
                    ${renderKpi('User Accounts', users.length, `${clientCount} client accounts`, 'users')}
                    ${renderKpi('Orphan Media', summary.orphan_files_count || 0, 'Files eligible for cleanup', 'files', 'rgba(176,70,58,0.28)')}
                </div>
                <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:0.75rem;">
                    <button type="button" class="btn btn-gold" id="admin-operations-cleanup"><i data-lucide="hard-drive"></i> Data & Media Cleanup</button>
                    <button type="button" class="btn btn-secondary" id="admin-operations-users"><i data-lucide="users-round"></i> User Management</button>
                    <button type="button" class="btn btn-secondary" id="admin-operations-events"><i data-lucide="scroll-text"></i> Security & Event Log</button>
                </div>
                <section style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-md); overflow:hidden;">
                    <div style="padding:1rem 1.25rem; border-bottom:1px solid var(--border-color);"><h3 style="font-size:1rem;"><i data-lucide="database-zap"></i> Scrape Runs</h3><p style="margin-top:0.2rem; color:var(--text-muted); font-size:0.82rem;">Token-attributed import history and outcomes.</p></div>
                    <div style="overflow-x:auto;"><table class="matrix-table" style="width:100%; font-size:0.84rem;"><thead><tr><th>Started</th><th>Initiated By</th><th>Status</th><th>Processed</th><th>Fully Scraped</th></tr></thead><tbody>
                        ${scrapeRuns.slice(0, 8).map(run => `<tr><td>${escapeHtml(run.started_at || '')}</td><td>${escapeHtml(run.initiated_by || '-')}</td><td><span class="badge" style="${run.status === 'completed' ? 'color:var(--badge-active);' : run.status === 'failed' ? 'color:var(--accent-red);' : 'color:var(--badge-pending);'}">${escapeHtml(run.status || 'unknown')}</span></td><td>${escapeHtml(String(run.metrics?.processedCount ?? '-'))}</td><td>${escapeHtml(String(run.metrics?.fullScrapeCount ?? '-'))}</td></tr>`).join('') || '<tr><td colspan="5" style="text-align:center; padding:1.5rem; color:var(--text-muted);">No structured scrape runs recorded yet.</td></tr>'}
                    </tbody></table></div>
                </section>
                <section style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-md); overflow:hidden;">
                    <div style="padding:1rem 1.25rem; border-bottom:1px solid var(--border-color);"><h3 style="font-size:1rem;"><i data-lucide="triangle-alert"></i> Data Quality Queue</h3><p style="margin-top:0.2rem; color:var(--text-muted); font-size:0.82rem;">Listings that need source-data correction before client presentation.</p></div>
                    ${missingAddressListings.length ? `<div style="overflow-x:auto;"><table class="matrix-table" style="width:100%; font-size:0.84rem;"><thead><tr><th>MLS</th><th>Current Address</th><th>Location</th><th>Last Updated</th><th></th></tr></thead><tbody>${missingAddressListings.map(property => `<tr><td>${escapeHtml(property.mls_id)}</td><td>${escapeHtml(property.address || 'Address unavailable')}</td><td>${escapeHtml([property.city, property.state, property.zip].filter(Boolean).join(', ') || '-')}</td><td>${escapeHtml(property.updated_at || '')}</td><td><button type="button" class="btn btn-secondary admin-address-edit" data-mls-id="${escapeHtml(property.mls_id)}" data-address="${escapeHtml(property.address || '')}" data-city="${escapeHtml(property.city || '')}" data-state="${escapeHtml(property.state || '')}" data-zip="${escapeHtml(property.zip || '')}" style="font-size:0.78rem; padding:0.3rem 0.55rem;"><i data-lucide="pencil"></i> Edit</button></td></tr>`).join('')}</tbody></table></div>` : `<div style="padding:1.5rem; color:var(--text-muted);">No address-quality issues are currently queued.</div>`}
                </section>
                <section style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-md); overflow:hidden;">
                    <div style="padding:1rem 1.25rem; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; gap:1rem; flex-wrap:wrap;">
                        <div><h3 style="font-size:1rem;"><i data-lucide="activity"></i> Recent Operations</h3><p style="margin-top:0.2rem; color:var(--text-muted); font-size:0.82rem;">${recentScrape ? `Latest scrape activity: ${escapeHtml(recentScrape.timestamp || '')}` : 'No scrape activity recorded yet.'}</p></div>
                    </div>
                    <div style="overflow-x:auto;"><table class="matrix-table" style="width:100%; font-size:0.84rem;"><thead><tr><th>Time</th><th>Source</th><th>Actor</th><th>Activity</th></tr></thead><tbody>
                        ${events.slice(0, 8).map(event => `<tr><td>${escapeHtml(event.timestamp || '')}</td><td>${escapeHtml(event.source || 'system')}</td><td>${escapeHtml(event.username || '-')}</td><td>${escapeHtml(event.message || '')}</td></tr>`).join('') || '<tr><td colspan="4" style="text-align:center; padding:1.5rem; color:var(--text-muted);">No activity recorded.</td></tr>'}
                    </tbody></table></div>
                </section>
            </section>
        `;
        container.querySelector('#admin-operations-refresh')?.addEventListener('click', renderAdminView);
        container.querySelector('#admin-operations-cleanup')?.addEventListener('click', openAdminCleanupModal);
        container.querySelector('#admin-operations-users')?.addEventListener('click', openUserMgmtModal);
        container.querySelector('#admin-operations-events')?.addEventListener('click', openEventLogModal);
        container.querySelectorAll('.admin-address-edit').forEach(button => {
            button.addEventListener('click', () => openAddressCorrectionModal({ mlsId: button.dataset.mlsId, address: button.dataset.address, city: button.dataset.city, state: button.dataset.state, zip: button.dataset.zip }));
        });
        if (window.lucide) window.lucide.createIcons();
    } catch (error) {
        container.innerHTML = '<div class="empty-state-box" style="text-align:center; padding:4rem;"><h3>Unable to load Admin Operations</h3><p style="color:var(--text-muted);">Check the event log and try again.</p></div>';
        showToast('Failed to load Admin Operations', 'error');
    }
}