/**
 * Agent activity feed + engagement chips for the realtor view (backend/feed.php).
 *
 * realtorView.js calls window.renderAgentFeedPanel() after every render. The panel fills
 * #agent-feed-panel; each roster card's [data-engagement-for] slot gets that client's chip.
 * Data is cached for a minute so switching clients doesn't refetch.
 */
import { apiFetch } from './api.js';
import { escapeHtml } from './properties.js';

const esc = v => escapeHtml(String(v ?? ''));
const CACHE_MS = 60 * 1000;
const SHOW = 8;

let cache = null;          // { at, data }
let loading = null;
let tab = 'attention';     // attention | all
let expanded = false;
let collapsed = false;
try { collapsed = localStorage.getItem('dibs_agent_feed_collapsed') === '1'; } catch (e) { /* storage unavailable */ }

const TREND = {
    heating: { icon: 'flame', label: 'Heating up' },
    cooling: { icon: 'snowflake', label: 'Cooling off' },
    new: { icon: 'sparkle', label: 'New client' },
    steady: { icon: 'activity', label: 'Steady' },
};

function ago(iso) {
    const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
    if (s < 3600) return s < 120 ? 'just now' : `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
}

function firstName(name) {
    return String(name || '').trim().split(/\s+/)[0] || 'client';
}

function level(score) {
    return score >= 60 ? 'high' : (score >= 30 ? 'mid' : 'low');
}

async function load(force = false) {
    if (!force && cache && Date.now() - cache.at < CACHE_MS) return cache.data;
    if (!loading) {
        loading = apiFetch('backend/api.php?action=get_agent_feed')
            .then(res => {
                if (!res || !res.success) throw new Error(res?.error || 'Could not load the activity feed.');
                cache = { at: Date.now(), data: res };
                return res;
            })
            .finally(() => { loading = null; });
    }
    return loading;
}

function chipHtml(c) {
    const t = TREND[c.trend] || TREND.steady;
    const why = `Engagement ${c.score} (a week ago: ${c.prev}). ${t.label}${c.days_quiet !== null && c.days_quiet >= 2 ? `, last active ${c.days_quiet} days ago` : ''}.`;
    return `<span class="engagement-chip engagement-chip--${level(c.score)} engagement-chip--${esc(c.trend)}" title="${esc(why)}" aria-label="${esc(why)}">
        <i data-lucide="${t.icon}"></i>${c.score}</span>`;
}

function itemHtml(i) {
    const button = i.action === 'requests'
        ? `<button type="button" class="btn btn-secondary feed-item-btn" data-feed-requests="${esc(i.client_id)}">Review requests</button>`
        : i.action === 'listing' && i.mls_id
        ? `<button type="button" class="btn btn-secondary feed-item-btn" data-feed-listing="${esc(i.mls_id)}">Open listing</button>`
        : i.kind === 'heating'
            ? `<button type="button" class="btn btn-secondary feed-item-btn" data-feed-client="${esc(i.client_id)}" data-feed-to="activity">See activity</button>`
            : `<button type="button" class="btn btn-secondary feed-item-btn" data-feed-client="${esc(i.client_id)}" data-feed-to="chat">Message ${esc(firstName(i.client_name))}</button>`;
    return `<li class="feed-item ${i.attention ? 'feed-item--attention' : ''} feed-item--${esc(i.kind)}">
        <span class="feed-item-icon"><i data-lucide="${esc(i.icon)}"></i></span>
        <div class="feed-item-body">
            <div class="feed-item-text">${esc(i.text)}</div>
            <div class="feed-item-meta">${esc(ago(i.at))}</div>
        </div>
        ${button}
    </li>`;
}

function render(panel, data) {
    const attention = data.items.filter(i => i.attention);
    const list = tab === 'attention' ? attention : data.items;
    const shown = expanded ? list : list.slice(0, SHOW);
    panel.innerHTML = `
        <div class="agent-feed-head">
            <button type="button" class="agent-feed-toggle" data-feed="collapse" aria-expanded="${!collapsed}">
                <i data-lucide="${collapsed ? 'chevron-right' : 'chevron-down'}"></i>
                <span class="agent-feed-title">Client activity</span>
                ${attention.length ? `<span class="agent-feed-count">${attention.length} need you</span>` : ''}
            </button>
            ${collapsed ? '' : `
            <div class="agent-feed-tabs" role="tablist">
                <button type="button" role="tab" aria-selected="${tab === 'attention'}" data-feed-tab="attention">Needs you (${attention.length})</button>
                <button type="button" role="tab" aria-selected="${tab === 'all'}" data-feed-tab="all">All activity (${data.items.length})</button>
                <button type="button" class="agent-feed-refresh" data-feed="refresh" title="Refresh" aria-label="Refresh"><i data-lucide="refresh-cw"></i></button>
            </div>`}
        </div>
        ${collapsed ? '' : `
        ${shown.length ? `<ul class="feed-list">${shown.map(itemHtml).join('')}</ul>`
            : `<p class="feed-empty">${tab === 'attention' ? 'Nothing needs you right now.' : 'No client activity in the last 14 days.'}</p>`}
        ${list.length > SHOW ? `<button type="button" class="feed-more" data-feed="more">${expanded ? 'Show less' : `Show ${list.length - SHOW} more`}</button>` : ''}`}`;
    if (window.lucide) window.lucide.createIcons();
}

function fillRoster(data) {
    const byId = new Map(data.clients.map(c => [String(c.id), c]));
    document.querySelectorAll('[data-engagement-for]').forEach(slot => {
        const c = byId.get(slot.dataset.engagementFor);
        slot.innerHTML = c ? chipHtml(c) : '';
    });
    if (window.lucide) window.lucide.createIcons();
}

export async function renderAgentFeedPanel(force = false) {
    const panel = document.getElementById('agent-feed-panel');
    if (!panel) return;
    if (!cache) panel.innerHTML = '<p class="feed-empty">Loading client activity…</p>';
    try {
        const data = await load(force);
        const current = document.getElementById('agent-feed-panel');
        if (!current) return;
        render(current, data);
        fillRoster(data);
    } catch (e) {
        panel.innerHTML = `<p class="feed-empty">${esc(e.message)}</p>`;
    }
}

window.renderAgentFeedPanel = renderAgentFeedPanel;

/** Opens the feed on a tab ('attention' or 'all') and scrolls to it (used by the Agent Hub boxes). */
window.showAgentFeed = async function (which = 'attention') {
    tab = which === 'all' ? 'all' : 'attention';
    expanded = false;
    collapsed = false;
    try { localStorage.setItem('dibs_agent_feed_collapsed', '0'); } catch (e) { /* storage unavailable */ }
    await renderAgentFeedPanel(true);
    document.getElementById('agent-feed-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

document.addEventListener('click', event => {
    const t = event.target;
    if (!(t instanceof Element) || !t.closest('#agent-feed-panel')) return;
    const req = t.closest('[data-feed-requests]');
    if (req) { window.showShowingRequests?.(req.dataset.feedRequests); return; }
    const listing = t.closest('[data-feed-listing]');
    if (listing) { window.openDetailModal?.(listing.dataset.feedListing); return; }
    const client = t.closest('[data-feed-client]');
    if (client) { window.openRealtorClientTab?.(client.dataset.feedClient, client.dataset.feedTo || 'chat'); return; }
    const tabBtn = t.closest('[data-feed-tab]');
    if (tabBtn) { tab = tabBtn.dataset.feedTab; expanded = false; renderAgentFeedPanel(); return; }
    const action = t.closest('[data-feed]')?.dataset.feed;
    if (action === 'more') { expanded = !expanded; renderAgentFeedPanel(); }
    else if (action === 'refresh') renderAgentFeedPanel(true);
    else if (action === 'collapse') {
        collapsed = !collapsed;
        try { localStorage.setItem('dibs_agent_feed_collapsed', collapsed ? '1' : '0'); } catch (e) { /* storage unavailable */ }
        renderAgentFeedPanel();
    }
});
