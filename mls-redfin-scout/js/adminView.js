import { apiFetch } from './api.js';
import { state } from './state.js';
import { showToast } from './toast.js';
import { escapeHtml } from './properties.js';
import { openAdminCleanupModal } from './adminCleanup.js';
import { openEventLogModal, openUserMgmtModal } from './auth.js';

let activeTab = 'overview';
let autoRefreshActive = false;
let autoRefreshTimer = null;
let scrapeFilter = 'all';
let scrapeSearchQuery = '';
let qualitySearchQuery = '';

function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return '0 B';
    if (bytes >= 1073741824) return (bytes / 1073741824).toFixed(2) + ' GB';
    if (bytes >= 1048576) return (bytes / 1048576).toFixed(1) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return bytes + ' B';
}

function renderKpi(label, value, detail, icon, tone = '', pulseColor = '') {
    const pulseDot = pulseColor ? `<span class="pulse-dot pulse-dot-${pulseColor}"></span>` : '';
    return `
        <div class="kpi-card" style="${tone ? `border-color:${tone};` : ''}">
            <div class="kpi-card-header">
                <span class="kpi-label">${pulseDot}${label}</span>
                <span class="kpi-card-icon"><i data-lucide="${icon}"></i></span>
            </div>
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
            <label class="filter-label modal-field-label">Street address</label>
            <input class="input-text modal-field-control" id="admin-address-street" value="${escapeHtml(property.address || '')}">
            <div style="display:grid; grid-template-columns:1fr 80px 120px; gap:0.65rem; margin-top:0.65rem;">
                <div><label class="filter-label">City</label><input class="input-text" id="admin-address-city" value="${escapeHtml(property.city || '')}"></div>
                <div><label class="filter-label">State</label><input class="input-text" id="admin-address-state" maxlength="2" value="${escapeHtml(property.state || '')}"></div>
                <div><label class="filter-label">ZIP</label><input class="input-text" id="admin-address-zip" maxlength="10" value="${escapeHtml(property.zip || '')}"></div>
            </div>
            <div class="modal-actions">
                <button type="button" class="btn btn-secondary" data-action="cancel">Cancel</button>
                <button type="button" class="btn btn-gold" data-action="save"><i data-lucide="save"></i> Save Address</button>
            </div>
        </div>
    `;
    const close = () => modal.remove();
    modal.querySelector('.modal-close')?.addEventListener('click', close);
    modal.querySelector('[data-action="cancel"]')?.addEventListener('click', close);
    modal.querySelector('[data-action="save"]')?.addEventListener('click', async () => {
        const response = await apiFetch('backend/api.php?action=admin_update_property_address', {
            method: 'POST',
            body: JSON.stringify({
                mls_id: property.mlsId,
                address: document.getElementById('admin-address-street')?.value.trim() || '',
                city: document.getElementById('admin-address-city')?.value.trim() || '',
                state: document.getElementById('admin-address-state')?.value.trim() || '',
                zip: document.getElementById('admin-address-zip')?.value.trim() || ''
            })
        });
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

    if (!container.querySelector('.admin-operations')) {
        container.innerHTML = '<div class="loading-spinner-container" style="text-align:center; padding:4rem;"><i data-lucide="loader-2" class="spin-icon" style="width:36px; height:36px; color:var(--accent-gold);"></i><p style="margin-top:1rem; color:var(--text-muted);">Loading Admin Control Center...</p></div>';
        if (window.lucide) window.lucide.createIcons();
    }

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

        // Storage distribution breakdown
        const photoBytes = summary.off_market_photos_bytes || 0;
        const orphanBytes = summary.orphan_bytes || 0;
        const totalStorageBytes = photoBytes + orphanBytes || 1;
        const photosPct = Math.round((photoBytes / totalStorageBytes) * 100) || 0;
        const orphansPct = Math.round((orphanBytes / totalStorageBytes) * 100) || 0;

        // Scrape runs filtering & search
        const filteredScrapeRuns = scrapeRuns.filter(run => {
            const st = (run.status || '').toLowerCase();
            if (scrapeFilter !== 'all' && st !== scrapeFilter) return false;
            if (scrapeSearchQuery) {
                const q = scrapeSearchQuery.toLowerCase();
                const actor = (run.initiated_by || '').toLowerCase();
                const started = (run.started_at || '').toLowerCase();
                if (!actor.includes(q) && !started.includes(q) && !st.includes(q)) return false;
            }
            return true;
        });

        // Data quality queue filtering
        const filteredQualityQueue = missingAddressListings.filter(item => {
            if (!qualitySearchQuery) return true;
            const q = qualitySearchQuery.toLowerCase();
            return (item.mls_id || '').toLowerCase().includes(q) ||
                   (item.address || '').toLowerCase().includes(q) ||
                   (item.city || '').toLowerCase().includes(q);
        });

        container.innerHTML = `
            <section class="admin-operations" style="display:grid; gap:1.25rem;">
                <!-- Control Center Top Header -->
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:1rem; flex-wrap:wrap;">
                    <div>
                        <div style="display:flex; align-items:center; gap:0.6rem;">
                            <h2 class="font-serif" style="font-size:1.55rem;"><i data-lucide="shield-check"></i> Admin Operations</h2>
                            <span class="badge" style="background:rgba(79,122,70,0.15); color:var(--badge-active); border:1px solid rgba(79,122,70,0.3); font-size:0.78rem;">
                                <span class="pulse-dot pulse-dot-green"></span> System Operational
                            </span>
                        </div>
                        <p style="margin-top:0.25rem; color:var(--text-muted); font-size:0.88rem;">Real-time infrastructure health, data integrity, user roles, and security audit control.</p>
                    </div>
                    <div style="display:flex; items-center; gap:0.65rem; flex-wrap:wrap;">
                        <button type="button" id="admin-auto-refresh-toggle" class="auto-refresh-wrapper ${autoRefreshActive ? 'active' : ''}" title="Toggle 30-second live auto-refresh">
                            <i data-lucide="rotate-cw" style="width:14px; height:14px; ${autoRefreshActive ? 'animation:spin 3s linear infinite;' : ''}"></i>
                            <span>Auto-refresh: <strong>${autoRefreshActive ? 'ON' : 'OFF'}</strong></span>
                        </button>
                        <button type="button" class="btn btn-secondary" id="admin-operations-refresh" title="Refresh admin workspace"><i data-lucide="refresh-cw"></i> Refresh</button>
                    </div>
                </div>

                <!-- Segmented Workspace Sub-Navigation Tabs -->
                <div class="admin-nav-tabs">
                    <button type="button" class="admin-tab-btn ${activeTab === 'overview' ? 'active' : ''}" data-tab="overview">
                        <i data-lucide="layout-dashboard"></i> Overview & Metrics
                    </button>
                    <button type="button" class="admin-tab-btn ${activeTab === 'cleanup' ? 'active' : ''}" data-tab="cleanup">
                        <i data-lucide="hard-drive"></i> Data Audit & Cleanup ${summary.orphan_files_count ? `<span class="admin-tab-badge">${summary.orphan_files_count}</span>` : ''}
                    </button>
                    <button type="button" class="admin-tab-btn ${activeTab === 'users' ? 'active' : ''}" data-tab="users">
                        <i data-lucide="users"></i> User Accounts <span class="admin-tab-badge">${users.length}</span>
                    </button>
                    <button type="button" class="admin-tab-btn ${activeTab === 'logs' ? 'active' : ''}" data-tab="logs">
                        <i data-lucide="scroll-text"></i> Security & Logs
                    </button>
                </div>

                <!-- TAB CONTENT: OVERVIEW & METRICS -->
                ${activeTab === 'overview' ? `
                    <!-- KPI Cards Grid -->
                    <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(190px, 1fr)); gap:1rem;">
                        ${renderKpi('Stored Listings', visibility.length, `${hidden} globally hidden`, 'house', '', 'green')}
                        ${renderKpi('Stale Listings', summary.stale_active_count || 0, `Not synced >${summary.stale_days_threshold || 14}d`, 'clock', summary.stale_active_count ? 'rgba(234,179,8,0.35)' : '', summary.stale_active_count ? 'amber' : '')}
                        ${renderKpi('Image Health', summary.invalid_primary_preview_count || 0, 'Missing or invalid previews', 'image-off', summary.invalid_primary_preview_count ? 'rgba(184,122,42,0.4)' : '', summary.invalid_primary_preview_count ? 'amber' : '')}
                        ${renderKpi('Address Quality', summary.missing_address_count || 0, 'Listings missing address', 'map-pin-off', summary.missing_address_count ? 'rgba(176,70,58,0.35)' : '', summary.missing_address_count ? 'red' : '')}
                        ${renderKpi('User Accounts', users.length, `${clientCount} client accounts`, 'users', '', 'green')}
                        ${renderKpi('Orphan Media', summary.orphan_files_count || 0, `${formatBytes(summary.orphan_bytes)} cleanable`, 'files', summary.orphan_files_count ? 'rgba(176,70,58,0.35)' : '', summary.orphan_files_count ? 'amber' : '')}
                    </div>

                    <!-- Storage Allocation Breakdown Bar -->
                    <div class="storage-allocation-card">
                        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem;">
                            <div>
                                <h4 style="font-size:0.95rem; font-weight:700;"><i data-lucide="hard-drive"></i> Media & Disk Space Distribution</h4>
                                <span style="font-size:0.8rem; color:var(--text-muted);">Reclaimable disk space: <strong style="color:var(--badge-active);">${formatBytes((summary.off_market_photos_bytes || 0) + (summary.stale_active_photos_bytes || 0) + (summary.orphan_bytes || 0))}</strong></span>
                            </div>
                            <button type="button" class="btn btn-gold" id="admin-quick-cleanup-btn" style="font-size:0.8rem; padding:0.35rem 0.85rem;"><i data-lucide="eraser"></i> Audit Storage</button>
                        </div>
                        <div class="storage-progress-bar" title="Photos: ${photosPct}%, Orphans: ${orphansPct}%">
                            <div class="storage-segment storage-seg-photos" style="width: ${photosPct}%;"></div>
                            <div class="storage-segment storage-seg-orphans" style="width: ${orphansPct}%;"></div>
                        </div>
                        <div class="storage-legend-grid">
                            <div class="storage-legend-item">
                                <span class="storage-legend-dot" style="background:#C1892E;"></span>
                                <span>Cached Photos: <strong>${formatBytes(summary.off_market_photos_bytes || 0)}</strong> (${summary.off_market_photos_count || 0} files)</span>
                            </div>
                            <div class="storage-legend-item">
                                <span class="storage-legend-dot" style="background:#B0463A;"></span>
                                <span>Orphan Files: <strong>${formatBytes(summary.orphan_bytes || 0)}</strong> (${summary.orphan_files_count || 0} files)</span>
                            </div>
                        </div>
                    </div>

                    <!-- Scrape Runs Matrix Table -->
                    <section style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-md); overflow:hidden;">
                        <div style="padding:1rem 1.25rem; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap;">
                            <div>
                                <h3 style="font-size:1rem; font-weight:700;"><i data-lucide="database-zap"></i> Import & Scrape History</h3>
                                <p style="margin-top:0.2rem; color:var(--text-muted); font-size:0.82rem;">Token-attributed bookmarklet sync runs and outcomes.</p>
                            </div>
                            <div class="admin-filter-bar">
                                <input type="text" class="input-text admin-search-input" id="scrape-runs-search" placeholder="Search actor or status..." value="${escapeHtml(scrapeSearchQuery)}">
                                <div style="display:flex; gap:0.25rem;">
                                    <button type="button" class="admin-chip-filter ${scrapeFilter === 'all' ? 'active' : ''}" data-scrape-filter="all">All</button>
                                    <button type="button" class="admin-chip-filter ${scrapeFilter === 'completed' ? 'active' : ''}" data-scrape-filter="completed">Completed</button>
                                    <button type="button" class="admin-chip-filter ${scrapeFilter === 'failed' ? 'active' : ''}" data-scrape-filter="failed">Failed</button>
                                </div>
                            </div>
                        </div>
                        <div style="overflow-x:auto;">
                            <table class="matrix-table" style="width:100%; font-size:0.84rem;">
                                <thead>
                                    <tr>
                                        <th>Started</th>
                                        <th>Initiated By</th>
                                        <th>Status</th>
                                        <th>Processed</th>
                                        <th>Full Scraped</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${filteredScrapeRuns.slice(0, 10).map(run => {
                                        const isComp = run.status === 'completed';
                                        const isFail = run.status === 'failed';
                                        const pulseClass = isComp ? 'pulse-dot-green' : isFail ? 'pulse-dot-red' : 'pulse-dot-amber';
                                        return `
                                            <tr>
                                                <td style="font-weight:600;">${escapeHtml(run.started_at || '')}</td>
                                                <td><span style="font-weight:500;">${escapeHtml(run.initiated_by || '-')}</span></td>
                                                <td>
                                                    <span class="badge" style="${isComp ? 'background:rgba(79,122,70,0.15); color:var(--badge-active); border:1px solid rgba(79,122,70,0.3);' : isFail ? 'background:rgba(176,70,58,0.15); color:var(--accent-red); border:1px solid rgba(176,70,58,0.3);' : 'background:rgba(184,122,42,0.15); color:var(--badge-pending); border:1px solid rgba(184,122,42,0.3);'}">
                                                        <span class="pulse-dot ${pulseClass}"></span> ${escapeHtml(run.status || 'unknown')}
                                                    </span>
                                                </td>
                                                <td style="font-weight:600;">${escapeHtml(String(run.metrics?.processedCount ?? '-'))}</td>
                                                <td>${escapeHtml(String(run.metrics?.fullScrapeCount ?? '-'))}</td>
                                            </tr>
                                        `;
                                    }).join('') || `<tr><td colspan="5" style="text-align:center; padding:1.5rem; color:var(--text-muted);">No matching scrape runs recorded.</td></tr>`}
                                </tbody>
                            </table>
                        </div>
                    </section>

                    <!-- Data Quality Queue -->
                    <section style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-md); overflow:hidden;">
                        <div style="padding:1rem 1.25rem; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center; gap:1rem; flex-wrap:wrap;">
                            <div>
                                <h3 style="font-size:1rem; font-weight:700;"><i data-lucide="triangle-alert"></i> Data Quality Queue</h3>
                                <p style="margin-top:0.2rem; color:var(--text-muted); font-size:0.82rem;">Listings missing address data prior to client publishing.</p>
                            </div>
                            <input type="text" class="input-text admin-search-input" id="quality-queue-search" placeholder="Search MLS or address..." value="${escapeHtml(qualitySearchQuery)}">
                        </div>
                        ${filteredQualityQueue.length ? `
                            <div style="overflow-x:auto;">
                                <table class="matrix-table" style="width:100%; font-size:0.84rem;">
                                    <thead>
                                        <tr>
                                            <th>MLS</th>
                                            <th>Current Address</th>
                                            <th>Location</th>
                                            <th>Last Updated</th>
                                            <th>Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        ${filteredQualityQueue.map(property => `
                                            <tr>
                                                <td style="font-weight:700; color:var(--accent-gold);">MLS #${escapeHtml(property.mls_id)}</td>
                                                <td style="font-weight:600;">${escapeHtml(property.address || 'Address unavailable')}</td>
                                                <td>${escapeHtml([property.city, property.state, property.zip].filter(Boolean).join(', ') || '-')}</td>
                                                <td>${escapeHtml(property.updated_at || '')}</td>
                                                <td style="display:flex; gap:0.4rem;">
                                                    <button type="button" class="btn btn-secondary admin-address-edit" data-mls-id="${escapeHtml(property.mls_id)}" data-address="${escapeHtml(property.address || '')}" data-city="${escapeHtml(property.city || '')}" data-state="${escapeHtml(property.state || '')}" data-zip="${escapeHtml(property.zip || '')}" style="font-size:0.76rem; padding:0.25rem 0.5rem;"><i data-lucide="pencil"></i> Correct</button>
                                                    <button type="button" class="btn btn-gold admin-image-retry-btn" data-mls-id="${escapeHtml(property.mls_id)}" style="font-size:0.76rem; padding:0.25rem 0.5rem;" title="Retry image scrape"><i data-lucide="rotate-cw"></i> Re-Fetch</button>
                                                </td>
                                            </tr>
                                        `).join('')}
                                    </tbody>
                                </table>
                            </div>
                        ` : `<div style="padding:1.5rem; color:var(--text-muted); text-align:center;">No data quality issues match the current criteria.</div>`}
                    </section>

                    <!-- Recent Operations Audit -->
                    <section style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-md); overflow:hidden;">
                        <div style="padding:1rem 1.25rem; border-bottom:1px solid var(--border-color);">
                            <h3 style="font-size:1rem; font-weight:700;"><i data-lucide="activity"></i> Recent Activity Trace</h3>
                            <p style="margin-top:0.2rem; color:var(--text-muted); font-size:0.82rem;">${recentScrape ? `Latest scrape activity: ${escapeHtml(recentScrape.timestamp || '')}` : 'No recent scrape activity recorded.'}</p>
                        </div>
                        <div style="overflow-x:auto;">
                            <table class="matrix-table" style="width:100%; font-size:0.84rem;">
                                <thead>
                                    <tr>
                                        <th>Time</th>
                                        <th>Source</th>
                                        <th>Actor</th>
                                        <th>Activity</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${events.slice(0, 8).map(event => `
                                        <tr>
                                            <td style="font-weight:600;">${escapeHtml(event.timestamp || '')}</td>
                                            <td><span class="badge badge-secondary" style="font-size:0.75rem;">${escapeHtml(event.source || 'system')}</span></td>
                                            <td>${escapeHtml(event.username || '-')}</td>
                                            <td>${escapeHtml(event.message || '')}</td>
                                        </tr>
                                    `).join('') || '<tr><td colspan="4" style="text-align:center; padding:1.5rem; color:var(--text-muted);">No activity recorded.</td></tr>'}
                                </tbody>
                            </table>
                        </div>
                    </section>
                ` : ''}

                <!-- TAB CONTENT BRIDGES -->
                ${activeTab === 'cleanup' ? `<div style="padding:1.5rem; text-align:center; background:var(--bg-card); border-radius:var(--radius-md); border:1px solid var(--border-color);"><h3>Data & Media Cleanup Audit</h3><p style="color:var(--text-muted); margin:0.5rem 0 1.25rem;">Audit off-market properties and free up server storage.</p><button type="button" class="btn btn-gold" id="btn-tab-launch-cleanup"><i data-lucide="hard-drive"></i> Open Full Cleanup Modal</button></div>` : ''}
                ${activeTab === 'users' ? `<div style="padding:1.5rem; text-align:center; background:var(--bg-card); border-radius:var(--radius-md); border:1px solid var(--border-color);"><h3>User Account Management</h3><p style="color:var(--text-muted); margin:0.5rem 0 1.25rem;">Manage team accounts, clients, and realtor permissions.</p><button type="button" class="btn btn-gold" id="btn-tab-launch-users"><i data-lucide="users"></i> Open User Manager</button></div>` : ''}
                ${activeTab === 'logs' ? `<div style="padding:1.5rem; text-align:center; background:var(--bg-card); border-radius:var(--radius-md); border:1px solid var(--border-color);"><h3>Security & Event Audit Log</h3><p style="color:var(--text-muted); margin:0.5rem 0 1.25rem;">System trace, sync logs, and security login records.</p><button type="button" class="btn btn-gold" id="btn-tab-launch-logs"><i data-lucide="scroll-text"></i> Open Full Event Log</button></div>` : ''}
            </section>
        `;

        // Attach event listeners
        container.querySelectorAll('.admin-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tab = e.currentTarget.dataset.tab;
                if (tab) {
                    activeTab = tab;
                    renderAdminView();
                    if (tab === 'cleanup') openAdminCleanupModal();
                    else if (tab === 'users') openUserMgmtModal();
                    else if (tab === 'logs') openEventLogModal();
                }
            });
        });

        container.querySelector('#admin-quick-cleanup-btn')?.addEventListener('click', openAdminCleanupModal);
        container.querySelector('#btn-tab-launch-cleanup')?.addEventListener('click', openAdminCleanupModal);
        container.querySelector('#btn-tab-launch-users')?.addEventListener('click', openUserMgmtModal);
        container.querySelector('#btn-tab-launch-logs')?.addEventListener('click', openEventLogModal);

        container.querySelector('#admin-operations-refresh')?.addEventListener('click', () => {
            renderAdminView();
            showToast('Admin workspace updated', 'success');
        });

        // Auto-refresh toggle handler
        const autoToggleBtn = container.querySelector('#admin-auto-refresh-toggle');
        if (autoToggleBtn) {
            autoToggleBtn.addEventListener('click', () => {
                autoRefreshActive = !autoRefreshActive;
                if (autoRefreshActive) {
                    showToast('Auto-refresh enabled (30s interval)', 'info');
                    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
                    autoRefreshTimer = setInterval(() => {
                        if (document.getElementById('view-admin-container')?.style.display !== 'none') {
                            renderAdminView();
                        } else {
                            clearInterval(autoRefreshTimer);
                            autoRefreshActive = false;
                        }
                    }, 30000);
                } else {
                    showToast('Auto-refresh disabled', 'info');
                    if (autoRefreshTimer) clearInterval(autoRefreshTimer);
                }
                renderAdminView();
            });
        }

        // Scrape runs search & filter listeners
        const scrapeSearchEl = container.querySelector('#scrape-runs-search');
        if (scrapeSearchEl) {
            scrapeSearchEl.addEventListener('input', (e) => {
                scrapeSearchQuery = e.target.value;
                renderAdminView();
            });
        }

        container.querySelectorAll('[data-scrape-filter]').forEach(chip => {
            chip.addEventListener('click', (e) => {
                scrapeFilter = e.currentTarget.dataset.scrapeFilter;
                renderAdminView();
            });
        });

        // Quality queue search listener
        const qualitySearchEl = container.querySelector('#quality-queue-search');
        if (qualitySearchEl) {
            qualitySearchEl.addEventListener('input', (e) => {
                qualitySearchQuery = e.target.value;
                renderAdminView();
            });
        }

        container.querySelectorAll('.admin-address-edit').forEach(button => {
            button.addEventListener('click', () => openAddressCorrectionModal({
                mlsId: button.dataset.mlsId,
                address: button.dataset.address,
                city: button.dataset.city,
                state: button.dataset.state,
                zip: button.dataset.zip
            }));
        });

        container.querySelectorAll('.admin-image-retry-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const mlsId = e.currentTarget.dataset.mlsId;
                if (!mlsId) return;
                try {
                    const res = await apiFetch('backend/api.php?action=admin_retry_listing_images', {
                        method: 'POST',
                        body: JSON.stringify({ mls_ids: [mlsId] })
                    });
                    if (res?.success) {
                        showToast(`MLS #${mlsId} queued for image re-fetch`, 'success');
                    } else {
                        showToast(res?.error || 'Failed to retry image scrape', 'error');
                    }
                } catch (err) {
                    showToast('Failed to queue image re-fetch', 'error');
                }
            });
        });

        if (window.lucide) window.lucide.createIcons();
    } catch (error) {
        container.innerHTML = '<div class="empty-state-box" style="text-align:center; padding:4rem;"><h3>Unable to load Admin Operations</h3><p style="color:var(--text-muted);">Check the event log and try again.</p></div>';
        showToast('Failed to load Admin Operations', 'error');
    }
}