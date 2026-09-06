/**
 * MLS & Redfin Property Scout - Realtor Command Center Module
 * Handles client management, client status matrix, dual property notes, property chat, and tour planning.
 */
import { apiFetch } from './api.js';
import { state, elements } from './state.js';
import { showToast } from './toast.js';
import { cleanDisplayAddress, escapeHtml, NO_PHOTO_IMG, getRedfinUrl } from './properties.js';
import { sendPropertiesToHomeward } from './export.js';

let activeClientId = null;
let clientActivity = [];
let realtorData = {
    clients: [],
    selected_client: null,
    matrix: { loved: [], shortlisted: [], disliked: [], in_discussion: [], unreviewed: [] }
};
let realtorOverview = { active_clients: 0, homes_awaiting_review: 0, scheduled_showings: 0, unread_notifications: 0 };
let activeSubTab = 'matrix'; // 'matrix' | 'chat' | 'tour'
let activeChatMlsId = null;
let globalPropertyVisibility = [];
let globalPropertySearch = '';
let globalPropertyStatusFilter = 'all';
let globalPropertyVisibilityFilter = 'all';
let realtorFilterStatus = 'all'; // 'all' | 'loved' | 'shortlisted' | 'disliked' | 'unreviewed' | 'discussion'
let realtorSearchQuery = '';
let realtorMlsStatusFilter = 'all'; // 'all' | 'Active' | 'Pending' | 'Closed'

// Accessors used outside this module (e.g. js/export.js) to work with whichever
// client is currently selected in the Realtor Command Center, instead of the
// logged-in account's own data.
export function getActiveRealtorClient() {
    return realtorData.selected_client || null;
}
export function getActiveClientFavorites() {
    return (realtorData.matrix && realtorData.matrix.loved) || [];
}
export function getActiveClientTourProperties() {
    const matrix = realtorData.matrix || {};
    return [...(matrix.loved || []), ...(matrix.shortlisted || [])];
}

export async function renderRealtorView(clientId = null) {
    const container = document.getElementById('view-realtor-container');
    if (!container) return;

    container.innerHTML = `<div class="loading-spinner-container" style="text-align:center; padding: 4rem;"><i data-lucide="loader-2" class="spin-icon" style="width:36px; height:36px; color:var(--accent-gold);"></i><p style="margin-top:1rem; color:var(--text-muted);">Loading Realtor Command Center...</p></div>`;
    if (window.lucide) window.lucide.createIcons();

    try {
        const url = clientId ? `backend/api.php?action=get_client_matrix&client_id=${clientId}` : 'backend/api.php?action=get_client_matrix';
        const res = await apiFetch(url);
        if (res && res.success) {
            realtorData = res;
            if (res.selected_client) {
                activeClientId = res.selected_client.id;
            }
            if (activeSubTab === 'activity' && activeClientId) {
                await loadClientActivity(activeClientId);
            }
        }
        const overviewRes = await apiFetch('backend/api.php?action=get_realtor_overview');
        if (overviewRes?.success && overviewRes.overview) {
            realtorOverview = overviewRes.overview;
        }
    } catch (e) {
        console.error('Failed to load realtor matrix:', e);
        showToast('Error loading Realtor Command Center', 'error');
    }

    buildRealtorDom(container);
}

function buildRealtorDom(container) {
    const clients = realtorData.clients || [];
    const client = realtorData.selected_client;
    const matrix = realtorData.matrix || { loved: [], shortlisted: [], disliked: [], in_discussion: [], unreviewed: [] };

    if (!client) {
        container.innerHTML = `
            <div class="empty-state-box" style="text-align:center; padding:4rem;">
                <i data-lucide="users" style="width:48px; height:48px; color:var(--text-muted);"></i>
                <h3 style="margin-top:1rem; font-family:'Space Grotesk',sans-serif;">No Assigned Clients Found</h3>
                <p style="color:var(--text-muted);">You do not currently have any clients assigned to your realtor account.</p>
            </div>
        `;
        if (window.lucide) window.lucide.createIcons();
        return;
    }

    const stageOptions = [
        { key: 'searching', label: '🔍 Searching', color: '#3b82f6' },
        { key: 'touring', label: '🚗 Touring', color: '#eab308' },
        { key: 'offer', label: '📝 Making Offer', color: '#a855f7' },
        { key: 'contract', label: '🔑 Under Contract', color: '#10b981' },
        { key: 'closed', label: '🎉 Closed', color: '#06b6d4' }
    ];

    const currentStage = client.pipeline_stage || 'searching';
    const minP = client.target_min_price ? `$${(client.target_min_price / 1000).toFixed(0)}k` : 'Any';
    const maxP = client.target_max_price ? `$${(client.target_max_price / 1000).toFixed(0)}k` : 'Any';
    const budgetStr = (minP === 'Any' && maxP === 'Any') ? 'Budget not set' : `${minP} - ${maxP}`;
    const targetAreas = client.target_cities || 'Areas not set';
    const targetBeds = client.target_beds ? `${client.target_beds}+ beds` : 'Beds not set';
    const targetTimeline = client.target_timeline || 'Timeline not set';
    const hasSearchBrief = client.must_haves || client.deal_breakers;

    const lovedCount = (matrix.loved || []).length;
    const shortlistCount = (matrix.shortlisted || []).length;
    const unreviewedCount = (matrix.unreviewed || []).length;
    const dislikedCount = (matrix.disliked || []).length;

    container.innerHTML = `
        <div class="realtor-kpi-summary-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; margin-bottom: 1.25rem;">
            <div class="kpi-card"><div class="kpi-card-header"><span class="kpi-label">Active Clients</span><span class="kpi-card-icon"><i data-lucide="users"></i></span></div><div class="kpi-value">${realtorOverview.active_clients || 0}</div><div class="kpi-sub">Current client roster</div></div>
            <div class="kpi-card"><div class="kpi-card-header"><span class="kpi-label">Awaiting Review</span><span class="kpi-card-icon"><i data-lucide="clipboard-list"></i></span></div><div class="kpi-value">${realtorOverview.homes_awaiting_review || 0}</div><div class="kpi-sub">Client-property decisions</div></div>
            <div class="kpi-card"><div class="kpi-card-header"><span class="kpi-label">Scheduled Showings</span><span class="kpi-card-icon"><i data-lucide="calendar-clock"></i></span></div><div class="kpi-value">${realtorOverview.scheduled_showings || 0}</div><div class="kpi-sub">Across active clients</div></div>
            <div class="kpi-card"><div class="kpi-card-header"><span class="kpi-label">Unread Follow-Ups</span><span class="kpi-card-icon"><i data-lucide="bell"></i></span></div><div class="kpi-value">${realtorOverview.unread_notifications || 0}</div><div class="kpi-sub">New client activity</div></div>
        </div>
        <div class="realtor-kpi-summary-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; margin-bottom: 1.25rem;">
            <div class="kpi-card">
                <div class="kpi-card-header">
                    <span class="kpi-label">Assigned Clients</span>
                    <span class="kpi-card-icon"><i data-lucide="users"></i></span>
                </div>
                <div class="kpi-value">${clients.length}</div>
                <div class="kpi-sub">Roster Size</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-card-header">
                    <span class="kpi-label">Client Loved</span>
                    <span class="kpi-card-icon"><i data-lucide="heart" style="color:var(--accent-red);"></i></span>
                </div>
                <div class="kpi-value">${lovedCount}</div>
                <div class="kpi-sub">Favorites for ${escapeHtml(client.full_name || client.username)}</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-card-header">
                    <span class="kpi-label">Shortlisted</span>
                    <span class="kpi-card-icon"><i data-lucide="star" style="color:var(--accent-gold);"></i></span>
                </div>
                <div class="kpi-value">${shortlistCount}</div>
                <div class="kpi-sub">Top Picks</div>
            </div>
            <div class="kpi-card">
                <div class="kpi-card-header">
                    <span class="kpi-label">Unreviewed Homes</span>
                    <span class="kpi-card-icon"><i data-lucide="eye" style="color:var(--accent-blue);"></i></span>
                </div>
                <div class="kpi-value">${unreviewedCount}</div>
                <div class="kpi-sub">Pending Curation</div>
            </div>
        </div>

        <div class="realtor-cc-layout">
            <!-- Left Sidebar: Client Roster -->
            <aside class="realtor-roster-sidebar">
                <div class="sidebar-header">
                    <h3 class="sidebar-title"><i data-lucide="users"></i> Client Roster (${clients.length})</h3>
                </div>
                <div class="client-list">
                    ${clients.map(c => {
                        const isSel = c.id === client.id;
                        const initial = (c.full_name || c.username || 'C').charAt(0).toUpperCase();
                        const stg = stageOptions.find(s => s.key === (c.pipeline_stage || 'searching')) || stageOptions[0];
                        return `
                            <div class="client-roster-card ${isSel ? 'active' : ''}" onclick="window.selectRealtorClient(${c.id})">
                                <div class="client-avatar">${initial}</div>
                                <div class="client-info">
                                    <div class="client-name">${escapeHtml(c.full_name || c.username)}</div>
                                    <div class="client-stage-pill" style="border-color:${stg.color}; color:${stg.color};">${stg.label}</div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </aside>

            <!-- Right Workspace: Selected Client Command Center -->
            <main class="realtor-workspace">
                <!-- Client Header & Pipeline Control -->
                <div class="client-workspace-header">
                    <div class="client-header-main">
                        <div class="client-header-avatar">${(client.full_name || client.username).charAt(0).toUpperCase()}</div>
                        <div>
                            <h2 class="client-header-name">${escapeHtml(client.full_name || client.username)}</h2>
                            <div class="client-header-meta">
                                <span><i data-lucide="mail"></i> ${escapeHtml(client.email || 'No email')}</span>
                                <span><i data-lucide="phone"></i> ${escapeHtml(client.phone || 'No phone')}</span>
                                <span><i data-lucide="dollar-sign"></i> ${budgetStr}</span>
                                <span><i data-lucide="map-pin"></i> ${escapeHtml(targetAreas)}</span>
                                <span><i data-lucide="bed-double"></i> ${escapeHtml(targetBeds)}</span>
                                <span><i data-lucide="calendar-clock"></i> ${escapeHtml(targetTimeline)}</span>
                            </div>
                            ${hasSearchBrief ? `<div style="display:grid; gap:0.35rem; margin-top:0.65rem; font-size:0.82rem;"><span>${client.must_haves ? `<strong>Must-haves:</strong> ${escapeHtml(client.must_haves)}` : ''}</span><span>${client.deal_breakers ? `<strong>Deal-breakers:</strong> ${escapeHtml(client.deal_breakers)}` : ''}</span></div>` : ''}
                        </div>
                    </div>

                    <!-- Pipeline Stage Selector Buttons -->
                    <div class="pipeline-selector-group">
                        <span class="pipeline-label">Pipeline Stage:</span>
                        <div class="pipeline-chips">
                            ${stageOptions.map(stg => `
                                <button type="button" class="pipeline-chip ${currentStage === stg.key ? 'active' : ''}"
                                        style="${currentStage === stg.key ? `background-color:${stg.color}; color:#fff; border-color:${stg.color};` : ''}"
                                        onclick="window.updateClientStage(${client.id}, '${stg.key}')">
                                    ${stg.label}
                                </button>
                            `).join('')}
                        </div>
                    </div>
                </div>

                <!-- Sub-Navigation Tabs: Property Board | Discussion Thread | Tour Planner | Curated Playlists -->
                <div class="realtor-subnav-bar">
                    <div class="realtor-subnav-tabs">
                        <button class="realtor-tab-btn ${activeSubTab === 'matrix' ? 'active' : ''}" onclick="window.switchRealtorSubTab('matrix')">
                            <i data-lucide="layout-grid"></i> Property Status Board
                        </button>
                        <button class="realtor-tab-btn ${activeSubTab === 'chat' ? 'active' : ''}" onclick="window.switchRealtorSubTab('chat')">
                            <i data-lucide="message-square"></i> Client Messages & Discussion
                        </button>
                        <button class="realtor-tab-btn ${activeSubTab === 'activity' ? 'active' : ''}" onclick="window.switchRealtorSubTab('activity')">
                            <i data-lucide="activity"></i> Client Activity
                        </button>
                        <button class="realtor-tab-btn ${activeSubTab === 'tour' ? 'active' : ''}" onclick="window.switchRealtorSubTab('tour')">
                            <i data-lucide="map-pin"></i> Showing & Tour Itinerary (${(matrix.loved.length + matrix.shortlisted.length)})
                        </button>
                        <button class="realtor-tab-btn ${activeSubTab === 'playlists' ? 'active' : ''}" onclick="window.switchRealtorSubTab('playlists')">
                            <i data-lucide="music"></i> Curated Playlists
                        </button>
                        <button class="realtor-tab-btn ${activeSubTab === 'property-management' ? 'active' : ''}" onclick="window.switchRealtorSubTab('property-management')">
                            <i data-lucide="settings-2"></i> Property Management
                        </button>
                    </div>
                </div>

                <!-- Tab Content Area -->
                <div class="realtor-tab-content">
                    ${activeSubTab === 'matrix' ? renderStatusMatrixContent(matrix, client) : ''}
                    ${activeSubTab === 'chat' ? renderChatThreadContent(client) : ''}
                    ${activeSubTab === 'activity' ? renderClientActivityContent(client) : ''}
                    ${activeSubTab === 'tour' ? renderTourPlannerContent(matrix, client) : ''}
                    ${activeSubTab === 'playlists' ? renderPlaylistsTabContent(client) : ''}
                    ${activeSubTab === 'property-management' ? renderPropertyManagementContent() : ''}
                </div>
            </main>
        </div>
    `;

    if (window.lucide) window.lucide.createIcons();
    if (activeSubTab === 'chat') {
        loadChatMessages(client.id);
    }
}

function filterProperty(p) {
    if (realtorSearchQuery) {
        const q = realtorSearchQuery.toLowerCase();
        const addr = (p.address || '').toLowerCase();
        const city = (p.city || '').toLowerCase();
        const mls = (p.mls_id || '').toLowerCase();
        if (!addr.includes(q) && !city.includes(q) && !mls.includes(q)) {
            return false;
        }
    }
    if (realtorMlsStatusFilter !== 'all') {
        const st = (p.status || 'Active').toLowerCase();
        if (st !== realtorMlsStatusFilter.toLowerCase()) {
            return false;
        }
    }
    return true;
}

function renderStatusMatrixContent(matrix, client) {
    const loved = (matrix.loved || []).filter(filterProperty);
    const shortlisted = (matrix.shortlisted || []).filter(filterProperty);
    const disliked = (matrix.disliked || []).filter(filterProperty);
    const unreviewed = (matrix.unreviewed || []).filter(filterProperty);
    const inDiscussion = (matrix.in_discussion || []).filter(filterProperty);

    const totalCount = (matrix.loved || []).length + (matrix.shortlisted || []).length + (matrix.disliked || []).length + (matrix.unreviewed || []).length;

    const showLoved = realtorFilterStatus === 'all' || realtorFilterStatus === 'loved';
    const showShortlisted = realtorFilterStatus === 'all' || realtorFilterStatus === 'shortlisted';
    const showDisliked = realtorFilterStatus === 'all' || realtorFilterStatus === 'disliked';
    const showUnreviewed = realtorFilterStatus === 'all' || realtorFilterStatus === 'unreviewed';
    const showDiscussion = realtorFilterStatus === 'in_discussion';

    const singleCol = realtorFilterStatus !== 'all' && realtorFilterStatus !== 'in_discussion';
    let gridStyle = singleCol ? 'display: block;' : 'display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 1rem;';

    return `
        <!-- Filter Toolbar -->
        <div class="realtor-filter-toolbar" style="display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 0.75rem; padding: 0.85rem 1rem; background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); margin-bottom: 1rem;">
            <div style="display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;">
                <label style="font-weight: 700; font-size: 0.85rem; color: var(--text-muted); display: flex; align-items: center; gap: 0.35rem;">
                    <i data-lucide="filter" style="width:16px; height:16px;"></i> Client Reaction Filter:
                </label>
                <select class="input-select" style="padding: 0.4rem 0.75rem; font-size: 0.85rem;" onchange="window.setRealtorStatusFilter(this.value)">
                    <option value="all" ${realtorFilterStatus === 'all' ? 'selected' : ''}>📊 All Status Columns (${totalCount})</option>
                    <option value="loved" ${realtorFilterStatus === 'loved' ? 'selected' : ''}>❤️ Loved / Favorites (${(matrix.loved || []).length})</option>
                    <option value="shortlisted" ${realtorFilterStatus === 'shortlisted' ? 'selected' : ''}>⭐ Shortlisted / Top Picks (${(matrix.shortlisted || []).length})</option>
                    <option value="disliked" ${realtorFilterStatus === 'disliked' ? 'selected' : ''}>👎 Disliked / Passed (${(matrix.disliked || []).length})</option>
                    <option value="unreviewed" ${realtorFilterStatus === 'unreviewed' ? 'selected' : ''}>📋 Unreviewed Homes (${(matrix.unreviewed || []).length})</option>
                    <option value="in_discussion" ${realtorFilterStatus === 'in_discussion' ? 'selected' : ''}>💬 In Discussion Thread (${(matrix.in_discussion || []).length})</option>
                </select>
            </div>

            <div style="display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;">
                <div style="position: relative;">
                    <input type="text" class="input-text" placeholder="Search address, MLS..." value="${escapeHtml(realtorSearchQuery)}" style="padding: 0.4rem 0.75rem; font-size: 0.85rem; width: 200px;" oninput="window.setRealtorSearchQuery(this.value)">
                </div>
                <select class="input-select" style="padding: 0.4rem 0.75rem; font-size: 0.85rem;" onchange="window.setRealtorMlsFilter(this.value)">
                    <option value="all" ${realtorMlsStatusFilter === 'all' ? 'selected' : ''}>All MLS Statuses</option>
                    <option value="Active" ${realtorMlsStatusFilter === 'Active' ? 'selected' : ''}>Active</option>
                    <option value="Pending" ${realtorMlsStatusFilter === 'Pending' ? 'selected' : ''}>Pending</option>
                    <option value="Closed" ${realtorMlsStatusFilter === 'Closed' ? 'selected' : ''}>Closed / Sold</option>
                </select>
                ${(realtorFilterStatus !== 'all' || realtorSearchQuery !== '' || realtorMlsStatusFilter !== 'all') ? `
                    <button class="btn btn-sm" style="font-size: 0.78rem; padding: 0.35rem 0.6rem;" onclick="window.resetRealtorFilters()"><i data-lucide="rotate-ccw"></i> Reset</button>
                ` : ''}
            </div>
        </div>

        <div class="status-matrix-grid" style="${gridStyle}">
            ${showLoved ? `
                <div class="matrix-column matrix-col-loved">
                    <div class="matrix-col-header">
                        <h4><i data-lucide="heart" style="color:var(--accent-red);"></i> Loved / Favorites (${loved.length})</h4>
                    </div>
                    <div class="matrix-col-body" style="${singleCol ? 'display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem;' : ''}">
                        ${loved.length === 0 ? '<div class="matrix-empty-pill">No loved properties match</div>' : loved.map(p => renderRealtorPropertyCard(p, client.id)).join('')}
                    </div>
                </div>
            ` : ''}

            ${showShortlisted ? `
                <div class="matrix-column matrix-col-shortlist">
                    <div class="matrix-col-header">
                        <h4><i data-lucide="star" style="color:var(--accent-gold);"></i> Shortlisted (${shortlisted.length})</h4>
                    </div>
                    <div class="matrix-col-body" style="${singleCol ? 'display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem;' : ''}">
                        ${shortlisted.length === 0 ? '<div class="matrix-empty-pill">No shortlisted properties match</div>' : shortlisted.map(p => renderRealtorPropertyCard(p, client.id)).join('')}
                    </div>
                </div>
            ` : ''}

            ${showDisliked ? `
                <div class="matrix-column matrix-col-disliked">
                    <div class="matrix-col-header">
                        <h4><i data-lucide="thumbs-down" style="color:var(--text-muted);"></i> Disliked / Passed (${disliked.length})</h4>
                    </div>
                    <div class="matrix-col-body" style="${singleCol ? 'display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem;' : ''}">
                        ${disliked.length === 0 ? '<div class="matrix-empty-pill">No disliked properties match</div>' : disliked.map(p => renderRealtorPropertyCard(p, client.id)).join('')}
                    </div>
                </div>
            ` : ''}

            ${showUnreviewed ? `
                <div class="matrix-column matrix-col-unreviewed">
                    <div class="matrix-col-header">
                        <h4><i data-lucide="eye" style="color:var(--accent-blue);"></i> Unreviewed (${unreviewed.length})</h4>
                    </div>
                    <div class="matrix-col-body" style="${singleCol ? 'display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem;' : ''}">
                        ${unreviewed.length === 0 ? '<div class="matrix-empty-pill">No unreviewed properties match</div>' : unreviewed.map(p => renderRealtorPropertyCard(p, client.id)).join('')}
                    </div>
                </div>
            ` : ''}

            ${showDiscussion ? `
                <div class="matrix-column matrix-col-discussion" style="grid-column: 1 / -1;">
                    <div class="matrix-col-header">
                        <h4><i data-lucide="message-square" style="color:var(--accent-gold);"></i> Properties in Active Discussion (${inDiscussion.length})</h4>
                    </div>
                    <div class="matrix-col-body" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1rem;">
                        ${inDiscussion.length === 0 ? '<div class="matrix-empty-pill">No active discussion properties match</div>' : inDiscussion.map(p => renderRealtorPropertyCard(p, client.id)).join('')}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
}

function renderRealtorPropertyCard(p, clientId) {
    const displayAddr = cleanDisplayAddress(p.address, p.mls_id);
    const imgUrl = p.main_image_url || NO_PHOTO_IMG;
    const priceStr = `$${(p.price || 0).toLocaleString()}`;
    const ppsqft = p.sqft_finished ? `$${Math.round(p.price / p.sqft_finished)}/sqft` : '';

    const statusRaw = p.status || 'Active';
    let statusBg = '#10b981'; // emerald green
    let statusColor = '#ffffff';

    if (statusRaw.toLowerCase().includes('pending') || statusRaw.toLowerCase().includes('contract')) {
        statusBg = '#eab308'; // amber yellow
        statusColor = '#000000';
    } else if (statusRaw.toLowerCase().includes('closed') || statusRaw.toLowerCase().includes('sold')) {
        statusBg = '#3b82f6'; // blue
        statusColor = '#ffffff';
    }

    return `
        <div class="realtor-prop-card" data-mls-id="${p.mls_id}" style="cursor:pointer;" onclick="window.openDetailModal('${p.mls_id}')">
            <div class="realtor-card-thumb">
                <img src="${imgUrl}" alt="${escapeHtml(displayAddr)}" loading="lazy">
                <span class="realtor-card-status-badge" style="position: absolute; top: 6px; left: 6px; background: ${statusBg}; color: ${statusColor}; font-weight: 800; font-size: 0.68rem; padding: 0.15rem 0.45rem; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.04em; z-index: 2; box-shadow: 0 2px 4px rgba(0,0,0,0.4);">
                    ${escapeHtml(statusRaw)}
                </span>
                <span class="realtor-card-price">${priceStr}</span>
                <button class="btn-prop-chat-badge ${p.has_messages ? 'has-msg' : ''}" onclick="event.stopPropagation(); window.openPropertyChat('${p.mls_id}', ${clientId})" title="Property Discussion Thread">
                    <i data-lucide="message-square"></i> Chat
                </button>
            </div>
            <div class="realtor-card-body">
                <div class="realtor-card-address">${escapeHtml(displayAddr)}</div>
                <div class="realtor-card-specs">
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: 0.2rem;">
                        <span style="font-weight: 700; font-size: 0.75rem; color: ${statusBg}; border: 1px solid ${statusBg}; padding: 0.05rem 0.35rem; border-radius: 3px; background: rgba(0,0,0,0.15);">
                            MLS #${escapeHtml(p.mls_id)} • ${escapeHtml(statusRaw)}
                        </span>
                    </div>
                    <div>
                        <span>${p.beds || 0} bds</span> • <span>${p.baths || 0} ba</span> • <span>${(p.sqft_finished || 0).toLocaleString()} sqft</span> ${ppsqft ? `• <span>${ppsqft}</span>` : ''}
                    </div>
                </div>

                    <button type="button" class="btn btn-secondary" style="font-size:0.78rem; align-self:flex-start;" onclick="event.stopPropagation(); window.requestClientFeedback('${p.mls_id}', ${clientId})"><i data-lucide="message-circle-question"></i> Request Feedback</button>

                <!-- Client Notes Box -->
                <div class="note-box client-note-box">
                    <div class="note-box-title"><i data-lucide="globe"></i> Client Note:</div>
                    <div class="note-box-text">${escapeHtml(p.user_notes || 'No client note entered.')}</div>
                </div>

                <!-- Realtor Private Note Textarea -->
                <div class="note-box realtor-private-note-box">
                    <div class="note-box-title"><i data-lucide="lock" style="color:var(--accent-gold);"></i> Confidential Realtor Note (Private):</div>
                    <textarea class="realtor-note-textarea"
                              placeholder="Add private strategy notes, lockbox code, seller motivation..."
                              onclick="event.stopPropagation()"
                              onblur="window.saveRealtorPrivateNote('${p.mls_id}', ${clientId}, this.value)">${escapeHtml(p.realtor_private_notes || '')}</textarea>
                    <span class="note-save-status" id="save-status-${p.mls_id}"></span>
                </div>
            </div>
        </div>
    `;
}

function renderChatThreadContent(client) {
    return `
        <div class="realtor-chat-container">
            <div class="chat-header-bar">
                <h3><i data-lucide="message-square"></i> Message History with ${escapeHtml(client.full_name || client.username)}</h3>
            </div>
            <div class="chat-messages-scroll" id="realtor-chat-messages">
                <div class="text-center text-muted" style="padding:2rem;">Loading chat messages...</div>
            </div>
            <div class="chat-input-bar">
                <input type="text" id="realtor-chat-input" class="input-text" placeholder="Type a message to ${escapeHtml(client.full_name || client.username)}..." onkeydown="if(event.key==='Enter') window.sendRealtorChatMessage(${client.id})">
                <button class="btn btn-gold" onclick="window.sendRealtorChatMessage(${client.id})"><i data-lucide="send"></i> Send</button>
            </div>
        </div>
    `;
}

function renderTourPlannerContent(matrix, client) {
    const tourProps = [...(matrix.loved || []), ...(matrix.shortlisted || [])];
    const toShowingInputValue = value => value ? String(value).replace(' ', 'T').slice(0, 16) : '';

    return `
        <div class="realtor-tour-planner">
            <div class="tour-planner-header">
                <div>
                    <h3><i data-lucide="map-pin"></i> Showing & Tour Itinerary Builder</h3>
                    <p style="color:var(--text-muted); font-size:0.88rem;">Curated shortlist of houses to show ${escapeHtml(client.full_name || client.username)}.</p>
                </div>
                <button class="btn btn-gold" onclick="window.openHomewardTourRoute()"><i data-lucide="map"></i> Map Route in Homeward</button>
            </div>

            ${tourProps.length === 0 ? `
                <div class="empty-state-box" style="text-align:center; padding:3rem;">
                    <p style="color:var(--text-muted);">No loved or shortlisted properties available to build a tour for this client.</p>
                </div>
            ` : `
                <div class="tour-list-wrapper">
                    ${tourProps.map((p, idx) => {
                        const displayAddr = cleanDisplayAddress(p.address, p.mls_id);
                        return `
                            <div class="tour-item-card">
                                <div class="tour-step-badge">${idx + 1}</div>
                                <div class="tour-prop-info">
                                    <div class="tour-prop-title">${escapeHtml(displayAddr)}</div>
                                    <div class="tour-prop-sub">$${(p.price||0).toLocaleString()} • ${p.beds||0}bd / ${p.baths||0}ba</div>
                                </div>
                                <div class="tour-inputs">
                                    <input type="datetime-local" class="input-text tour-time-input" id="tour-time-${p.mls_id}" aria-label="Showing date and time" style="width:210px;" value="${escapeHtml(toShowingInputValue(p.showing_time))}">
                                    <input type="text" class="input-text tour-lockbox-input" id="tour-access-${p.mls_id}" placeholder="Access instructions" style="width:180px;" value="${escapeHtml(p.access_notes || '')}">
                                    <input type="text" class="input-text" id="tour-feedback-${p.mls_id}" placeholder="Post-showing feedback" style="width:180px;" value="${escapeHtml(p.feedback || '')}">
                                    <button type="button" class="btn btn-secondary" style="font-size:0.78rem;" onclick="window.saveShowingItinerary('${p.mls_id}', ${client.id})"><i data-lucide="save"></i> Save</button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `}
        </div>
    `;
}

// Window Globals for Interactive Controls
window.selectRealtorClient = function(clientId) {
    activeClientId = clientId;
    renderRealtorView(clientId);
};

// Tour planner's "Map Route in Homeward" button — exports the selected client's
// loved + shortlisted properties (the same list shown in the itinerary builder above)
// as an ordered Homeward route, rather than the logged-in realtor's own favorites.
window.openHomewardTourRoute = function() {
    const client = getActiveRealtorClient();
    const tourProps = getActiveClientTourProperties();
    sendPropertiesToHomeward(tourProps, {
        emptyMessage: client
            ? `No loved or shortlisted properties available to build a tour for ${client.full_name || client.username}.`
            : 'No client selected to build a tour for.'
    });
};

async function loadGlobalPropertyVisibility() {
    try {
        const res = await apiFetch('backend/api.php?action=list_global_property_visibility');
        globalPropertyVisibility = res?.success && Array.isArray(res.properties) ? res.properties : [];
    } catch (e) {
        globalPropertyVisibility = [];
        showToast('Failed to load property management data', 'error');
    }
}

async function loadClientActivity(clientId) {
    try {
        const res = await apiFetch(`backend/api.php?action=get_client_activity&client_id=${encodeURIComponent(clientId)}`);
        clientActivity = res?.success && Array.isArray(res.activity) ? res.activity : [];
    } catch (e) {
        clientActivity = [];
        showToast('Failed to load client activity', 'error');
    }
}

function renderClientActivityContent(client) {
    return `
        <section style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-md); overflow:hidden;">
            <div style="padding:1rem 1.25rem; border-bottom:1px solid var(--border-color);">
                <h3 style="font-size:1.05rem;"><i data-lucide="activity"></i> Property Activity for ${escapeHtml(client.full_name || client.username)}</h3>
                <p style="margin-top:0.25rem; color:var(--text-muted); font-size:0.85rem;">Favorites, decisions, notes, and curated playlist additions.</p>
            </div>
            ${clientActivity.length ? `<div style="overflow-x:auto;"><table class="matrix-table" style="width:100%; font-size:0.84rem;"><thead><tr><th>Time</th><th>Property</th><th>Activity</th></tr></thead><tbody>${clientActivity.map(item => `<tr><td>${escapeHtml(item.created_at || '')}</td><td><strong>${escapeHtml(cleanDisplayAddress(item.address, item.mls_id))}</strong><br><span style="font-size:0.76rem; color:var(--text-muted);">MLS #${escapeHtml(item.mls_id)}</span></td><td>${escapeHtml(item.message || '')}</td></tr>`).join('')}</tbody></table></div>` : `<div style="padding:3rem; text-align:center; color:var(--text-muted);"><i data-lucide="clock-3" style="width:32px; height:32px;"></i><p style="margin-top:0.65rem;">No client property activity has been recorded yet.</p></div>`}
        </section>
    `;
}

function renderPropertyManagementContent() {
    const statuses = [...new Set(globalPropertyVisibility.map(property => property.status || 'Unknown'))].sort();
    const filteredProperties = globalPropertyVisibility.filter(property => {
        const isHidden = Boolean(property.is_hidden);
        if (globalPropertyVisibilityFilter === 'visible' && isHidden) return false;
        if (globalPropertyVisibilityFilter === 'hidden' && !isHidden) return false;
        if (globalPropertyStatusFilter !== 'all' && (property.status || 'Unknown') !== globalPropertyStatusFilter) return false;
        if (globalPropertySearch) {
            const query = globalPropertySearch.toLowerCase();
            const text = `${property.address || ''} ${property.city || ''} ${property.zip || ''} ${property.mls_id || ''}`.toLowerCase();
            if (!text.includes(query)) return false;
        }
        return true;
    });
    const hiddenProperties = globalPropertyVisibility.filter(property => property.is_hidden);

    return `
        <section style="background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-md); padding:1.25rem;">
            <div style="margin-bottom:1.25rem;">
                <h3 style="display:flex; align-items:center; gap:0.45rem; font-size:1.1rem;"><i data-lucide="settings-2"></i> Global Property Visibility</h3>
                <p style="margin-top:0.25rem; color:var(--text-muted); font-size:0.85rem;">Hidden listings are removed from every client and realtor dashboard. Add an optional internal reason before hiding a property.</p>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:0.65rem; align-items:end; margin-bottom:1rem; padding:0.85rem; background:var(--bg-input); border:1px solid var(--border-color); border-radius:var(--radius-sm);">
                <label style="display:grid; gap:0.3rem; flex:1; min-width:220px;"><span class="filter-label">Search</span><input class="input-text" value="${escapeHtml(globalPropertySearch)}" placeholder="Address, city, ZIP, or MLS ID" oninput="window.setGlobalPropertySearch(this.value)"></label>
                <label style="display:grid; gap:0.3rem;"><span class="filter-label">Property Status</span><select class="input-select" onchange="window.setGlobalPropertyStatusFilter(this.value)"><option value="all">All statuses</option>${statuses.map(status => `<option value="${escapeHtml(status)}" ${globalPropertyStatusFilter === status ? 'selected' : ''}>${escapeHtml(status)}</option>`).join('')}</select></label>
                <label style="display:grid; gap:0.3rem;"><span class="filter-label">Visibility</span><select class="input-select" onchange="window.setGlobalPropertyVisibilityFilter(this.value)"><option value="all" ${globalPropertyVisibilityFilter === 'all' ? 'selected' : ''}>All (${globalPropertyVisibility.length})</option><option value="visible" ${globalPropertyVisibilityFilter === 'visible' ? 'selected' : ''}>Visible (${globalPropertyVisibility.length - hiddenProperties.length})</option><option value="hidden" ${globalPropertyVisibilityFilter === 'hidden' ? 'selected' : ''}>Hidden (${hiddenProperties.length})</option></select></label>
                <button type="button" class="btn btn-secondary" title="Reset property management filters" onclick="window.resetGlobalPropertyFilters()"><i data-lucide="rotate-ccw"></i></button>
            </div>
            <div style="margin-top:1.25rem;">
                <h4 style="font-size:0.95rem; margin-bottom:0.65rem;">Properties (${filteredProperties.length})</h4>
                ${filteredProperties.length ? `
                    <div style="overflow-x:auto;">
                        <table class="matrix-table" style="width:100%; font-size:0.84rem;">
                            <thead><tr><th>Property</th><th>MLS Status</th><th>Lifecycle</th><th>Visibility</th><th>Reason</th><th>Hidden By</th><th></th></tr></thead>
                            <tbody>${filteredProperties.map(property => `<tr>
                                <td>${escapeHtml(cleanDisplayAddress(property.address, property.mls_id))}</td>
                                <td>${escapeHtml(property.status || 'Unknown')}<br><span style="color:var(--text-muted); font-size:0.76rem;">MLS #${escapeHtml(property.mls_id)}</span></td>
                                <td>${escapeHtml((property.lifecycle_status || 'active').replace(/^./, character => character.toUpperCase()))}</td>
                                <td>${property.is_hidden ? '<span class="badge" style="background:rgba(176,70,58,0.12); color:var(--accent-red);">Hidden</span>' : '<span class="badge" style="background:rgba(79,122,70,0.12); color:var(--badge-active);">Visible</span>'}</td>
                                <td>${escapeHtml(property.hidden_reason || '-')}</td>
                                <td>${escapeHtml(property.hidden_by || '-')} ${property.hidden_at ? `<br><span style="color:var(--text-muted); font-size:0.76rem;">${escapeHtml(property.hidden_at)}</span>` : ''}</td>
                                <td>${property.is_hidden ? `<button type="button" class="btn btn-secondary" style="font-size:0.78rem; padding:0.3rem 0.55rem;" onclick="window.restoreGlobalProperty('${escapeHtml(property.mls_id)}')"><i data-lucide="eye"></i> Restore</button>` : `<button type="button" class="btn btn-secondary" style="font-size:0.78rem; padding:0.3rem 0.55rem;" onclick="window.openGlobalPropertyHideModal('${escapeHtml(property.mls_id)}', '${escapeHtml(cleanDisplayAddress(property.address, property.mls_id))}')"><i data-lucide="eye-off"></i> Hide</button>`}</td>
                            </tr>`).join('')}</tbody>
                        </table>
                    </div>` : `<p style="color:var(--text-muted); font-size:0.85rem;">No properties match these filters.</p>`}
            </div>
        </section>
    `;
}

window.switchRealtorSubTab = async function(tabName) {
    activeSubTab = tabName;
    if (tabName === 'property-management') {
        await loadGlobalPropertyVisibility();
    }
    if (tabName === 'activity' && activeClientId) {
        await loadClientActivity(activeClientId);
    }
    buildRealtorDom(document.getElementById('view-realtor-container'));
};

window.restoreGlobalProperty = async function(mlsId) {
    try {
        const res = await apiFetch('backend/api.php?action=update_global_property_visibility', {
            method: 'POST',
            body: JSON.stringify({ mls_id: mlsId, is_hidden: false })
        });
        if (res?.success) {
            showToast('Property restored for all users', 'success');
            await loadGlobalPropertyVisibility();
            buildRealtorDom(document.getElementById('view-realtor-container'));
        } else {
            showToast(res?.error || 'Failed to restore property', 'error');
        }
    } catch (e) {
        showToast('Failed to restore property', 'error');
    }
};

window.openGlobalPropertyHideModal = function(mlsId, propertyLabel) {
    const existingModal = document.getElementById('global-property-hide-modal');
    if (existingModal) existingModal.remove();

    const modal = document.createElement('div');
    modal.id = 'global-property-hide-modal';
    modal.className = 'modal-overlay active';
    modal.style.zIndex = '11000';
    modal.innerHTML = `
        <div class="modal-content modal-content--confirm">
            <button type="button" class="modal-close" aria-label="Close" onclick="window.closeGlobalPropertyHideModal()"><i data-lucide="x"></i></button>
            <h3 class="modal-title-row"><i data-lucide="eye-off"></i> Hide Property for Everyone</h3>
            <p class="modal-description">This removes <strong>${escapeHtml(propertyLabel || `MLS #${mlsId}`)}</strong> from every client and realtor dashboard until it is restored.</p>
            <label class="filter-label modal-field-label" for="global-property-lifecycle-status">Lifecycle outcome</label>
            <select id="global-property-lifecycle-status" class="input-select modal-field-control"><option value="archived">Archived / no longer available</option><option value="under_contract">Under Contract</option><option value="sold">Sold</option><option value="withdrawn">Withdrawn</option></select>
            <label class="filter-label modal-field-label" for="global-property-hide-reason">Internal reason (optional)</label>
            <textarea id="global-property-hide-reason" class="input-text modal-field-control" rows="4" placeholder="Example: Sold, no longer available, or withdrawn by seller"></textarea>
            <div class="modal-actions">
                <button type="button" class="btn btn-secondary" onclick="window.closeGlobalPropertyHideModal()">Cancel</button>
                <button type="button" class="btn btn-gold" onclick="window.hideGlobalProperty('${escapeHtml(mlsId)}')"><i data-lucide="eye-off"></i> Hide for Everyone</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    if (window.lucide) window.lucide.createIcons();
    document.getElementById('global-property-hide-reason')?.focus();
};

window.closeGlobalPropertyHideModal = function() {
    document.getElementById('global-property-hide-modal')?.remove();
};

window.hideGlobalProperty = async function(mlsId) {
    const reason = document.getElementById('global-property-hide-reason')?.value.trim() || '';
    const lifecycleStatus = document.getElementById('global-property-lifecycle-status')?.value || 'archived';
    try {
        const res = await apiFetch('backend/api.php?action=update_global_property_visibility', {
            method: 'POST',
            body: JSON.stringify({ mls_id: mlsId, is_hidden: true, lifecycle_status: lifecycleStatus, reason })
        });
        if (res?.success) {
            window.closeGlobalPropertyHideModal();
            showToast('Property hidden from all users', 'success');
            await loadGlobalPropertyVisibility();
            buildRealtorDom(document.getElementById('view-realtor-container'));
        } else {
            showToast(res?.error || 'Failed to update property visibility', 'error');
        }
    } catch (e) {
        showToast('Failed to update property visibility', 'error');
    }
};

window.setGlobalPropertySearch = function(value) {
    globalPropertySearch = value;
    buildRealtorDom(document.getElementById('view-realtor-container'));
};

window.setGlobalPropertyStatusFilter = function(value) {
    globalPropertyStatusFilter = value;
    buildRealtorDom(document.getElementById('view-realtor-container'));
};

window.setGlobalPropertyVisibilityFilter = function(value) {
    globalPropertyVisibilityFilter = value;
    buildRealtorDom(document.getElementById('view-realtor-container'));
};

window.resetGlobalPropertyFilters = function() {
    globalPropertySearch = '';
    globalPropertyStatusFilter = 'all';
    globalPropertyVisibilityFilter = 'all';
    buildRealtorDom(document.getElementById('view-realtor-container'));
};

window.updateClientStage = async function(clientId, stageKey) {
    try {
        const res = await apiFetch('backend/api.php?action=update_client_pipeline', {
            method: 'POST',
            body: JSON.stringify({ client_id: clientId, pipeline_stage: stageKey })
        });
        if (res && res.success) {
            showToast(`Updated client pipeline to ${stageKey.toUpperCase()}`, 'success');
            renderRealtorView(clientId);
        }
    } catch (e) {
        showToast('Failed to update client stage', 'error');
    }
};

window.saveShowingItinerary = async function(mlsId, clientId) {
    const showingTime = document.getElementById(`tour-time-${mlsId}`)?.value.trim() || '';
    const accessNotes = document.getElementById(`tour-access-${mlsId}`)?.value.trim() || '';
    const feedback = document.getElementById(`tour-feedback-${mlsId}`)?.value.trim() || '';
    try {
        const res = await apiFetch('backend/api.php?action=save_showing_itinerary', {
            method: 'POST',
            body: JSON.stringify({ client_id: clientId, mls_id: mlsId, showing_time: showingTime, access_notes: accessNotes, feedback })
        });
        if (res?.success) {
            showToast('Showing itinerary saved', 'success');
        } else {
            showToast(res?.error || 'Failed to save showing itinerary', 'error');
        }
    } catch (e) {
        showToast('Failed to save showing itinerary', 'error');
    }
};

window.saveRealtorPrivateNote = async function(mlsId, clientId, noteText) {
    const statusSpan = document.getElementById(`save-status-${mlsId}`);
    if (statusSpan) statusSpan.innerText = 'Saving...';
    try {
        const res = await apiFetch('backend/api.php?action=save_realtor_notes', {
            method: 'POST',
            body: JSON.stringify({ client_id: clientId, mls_id: mlsId, realtor_notes: noteText })
        });
        if (res && res.success) {
            if (statusSpan) {
                statusSpan.innerText = '✓ Saved';
                setTimeout(() => { if (statusSpan) statusSpan.innerText = ''; }, 2000);
            }
        }
    } catch (e) {
        if (statusSpan) statusSpan.innerText = '⚠️ Error';
    }
};

async function loadChatMessages(clientId) {
    const chatContainer = document.getElementById('realtor-chat-messages');
    if (!chatContainer) return;
    try {
        const res = await apiFetch(`backend/api.php?action=get_property_messages&client_id=${clientId}`);
        if (res && res.success) {
            const msgs = res.messages || [];
            if (msgs.length === 0) {
                chatContainer.innerHTML = `<div class="text-center text-muted" style="padding:2rem;">No messages exchanged yet with this client. Start the conversation below!</div>`;
                return;
            }
            chatContainer.innerHTML = msgs.map(m => {
                const isRealtor = m.sender_role === 'realtor';
                const timeStr = new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return `
                    <div class="chat-bubble-row ${isRealtor ? 'chat-sent' : 'chat-received'}">
                        <div class="chat-bubble">
                            ${m.property_address ? `<div class="chat-prop-tag"><i data-lucide="home"></i> ${escapeHtml(m.property_address)}</div>` : ''}
                            <div class="chat-msg-text">${escapeHtml(m.message)}</div>
                            <div class="chat-msg-time">${timeStr}</div>
                        </div>
                    </div>
                `;
            }).join('');
            chatContainer.scrollTop = chatContainer.scrollHeight;
            if (window.lucide) window.lucide.createIcons();
        }
    } catch (e) {
        console.error('Failed to load chat:', e);
    }
}

window.sendRealtorChatMessage = async function(clientId) {
    const input = document.getElementById('realtor-chat-input');
    if (!input) return;
    const msg = input.value.trim();
    if (!msg) return;

    input.value = '';
    try {
        const res = await apiFetch('backend/api.php?action=send_property_message', {
            method: 'POST',
            body: JSON.stringify({ client_id: clientId, mls_id: activeChatMlsId || 'general', message: msg })
        });
        if (res && res.success) {
            loadChatMessages(clientId);
        }
    } catch (e) {
        showToast('Failed to send message', 'error');
    }
};

window.openPropertyChat = function(mlsId, clientId) {
    activeChatMlsId = mlsId;
    activeSubTab = 'chat';
    buildRealtorDom(document.getElementById('view-realtor-container'));
};

window.requestClientFeedback = async function(mlsId, clientId) {
    try {
        const res = await apiFetch('backend/api.php?action=send_property_message', {
            method: 'POST',
            body: JSON.stringify({ client_id: clientId, mls_id: mlsId, message: 'Could you share your thoughts on this home when you have a moment?' })
        });
        if (res?.success) {
            showToast('Feedback request sent to client', 'success');
            renderRealtorView(clientId);
        } else {
            showToast(res?.error || 'Failed to request feedback', 'error');
        }
    } catch (e) {
        showToast('Failed to request feedback', 'error');
    }
};

function renderPlaylistsTabContent(client) {
    const allCollections = window.cachedCollections || state.collections || [];
    const clientPlaylists = allCollections.filter(c => !c.client_id || (c.client_id && parseInt(c.client_id) === parseInt(client.id)));

    return `
        <div class="realtor-playlists-container" style="background: var(--bg-card); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 1.25rem;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; flex-wrap: wrap; gap: 0.75rem;">
                <div>
                    <h3 style="margin: 0; font-size: 1.1rem; font-weight: 700; display: flex; align-items: center; gap: 0.4rem;">
                        <i data-lucide="music"></i> Curated Playlists for ${escapeHtml(client.full_name || client.username)}
                    </h3>
                    <p style="margin: 0.2rem 0 0; font-size: 0.85rem; color: var(--text-muted);">
                        Create, edit, and share custom property collections with your client.
                    </p>
                </div>
                <button class="btn btn-gold" onclick="window.openCreatePlaylistForClient(${client.id})">
                    <i data-lucide="plus-circle"></i> Create New Playlist
                </button>
            </div>

            ${clientPlaylists.length === 0 ? `
                <div class="empty-state-box" style="text-align: center; padding: 3rem;">
                    <i data-lucide="folder-plus" style="width: 48px; height: 48px; color: var(--text-muted);"></i>
                    <h4 style="margin-top: 1rem; color: var(--text-main);">No Playlists Created Yet</h4>
                    <p style="color: var(--text-muted); font-size: 0.88rem;">Group houses into playlists for showings, strategy reviews, or client sharing.</p>
                    <button class="btn btn-gold" style="margin-top: 0.75rem;" onclick="window.openCreatePlaylistForClient(${client.id})">
                        <i data-lucide="plus"></i> Create First Playlist
                    </button>
                </div>
            ` : `
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 1rem;">
                    ${clientPlaylists.map(p => {
                        const count = Array.isArray(p.mls_ids) ? p.mls_ids.length : (p.item_count || 0);
                        const currentOrigin = window.location.origin + window.location.pathname.replace(/\/index\.html.*$/, '/');
                        const shareUrl = `${currentOrigin}share.html?token=${p.share_token}`;
                        return `
                            <div class="playlist-card" style="background: var(--bg-input); border: 1px solid var(--border-color); border-radius: var(--radius-sm); padding: 1rem; display: flex; flex-direction: column; justify-content: space-between; gap: 0.75rem;">
                                <div>
                                    <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 0.5rem;">
                                        <h4 style="margin: 0; font-size: 1rem; font-weight: 700; color: var(--accent-gold);">${escapeHtml(p.title)}</h4>
                                        <span class="badge" style="background: var(--bg-card); border: 1px solid var(--border-color); color: var(--text-main); font-weight: 800; font-size: 0.72rem;">${count} Homes</span>
                                    </div>
                                    ${p.description ? `<p style="font-size: 0.82rem; color: var(--text-muted); margin: 0.4rem 0 0; line-height: 1.3;">${escapeHtml(p.description)}</p>` : ''}
                                </div>
                                <div style="display: flex; gap: 0.4rem; flex-wrap: wrap; border-top: 1px solid var(--border-color); padding-top: 0.75rem;">
                                    <button class="btn btn-sm btn-secondary" style="font-size: 0.78rem;" onclick="window.openPlaylistAndEdit('${p.share_token}')">
                                        <i data-lucide="edit-3"></i> Edit Playlist
                                    </button>
                                    <button class="btn btn-sm btn-primary" style="font-size: 0.78rem;" onclick="navigator.clipboard.writeText('${shareUrl}'); showToast('Playlist share link copied!', 'success');">
                                        <i data-lucide="share-2"></i> Share Link
                                    </button>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            `}
        </div>
    `;
}

window.openCreatePlaylistForClient = function(clientId) {
    if (window.openPlaylistsModal) window.openPlaylistsModal();
    setTimeout(() => {
        const clientEl = document.getElementById('playlist-client-select');
        if (clientEl) clientEl.value = clientId;
    }, 150);
};

window.setRealtorStatusFilter = function(val) {
    realtorFilterStatus = val;
    const container = document.getElementById('view-realtor-container');
    if (container) buildRealtorDom(container);
};

window.setRealtorSearchQuery = function(val) {
    realtorSearchQuery = val;
    const container = document.getElementById('view-realtor-container');
    if (container) buildRealtorDom(container);
};

window.setRealtorMlsFilter = function(val) {
    realtorMlsStatusFilter = val;
    const container = document.getElementById('view-realtor-container');
    if (container) buildRealtorDom(container);
};

window.resetRealtorFilters = function() {
    realtorFilterStatus = 'all';
    realtorSearchQuery = '';
    realtorMlsStatusFilter = 'all';
    const container = document.getElementById('view-realtor-container');
    if (container) buildRealtorDom(container);
};

window.getRealtorActiveClientData = function() {
    return realtorData;
};

window.renderRealtorView = renderRealtorView;
