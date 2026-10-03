import { state } from './state.js';

function formatShowingTime(value) {
    if (!value) return '';
    const date = new Date(String(value).replace(' ', 'T'));
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export async function renderClientNextSteps() {
    const container = document.getElementById('client-next-steps-container');
    if (!container) return;

    if (!state.authenticated || state.currentUserProfile?.role !== 'client') {
        container.style.display = 'none';
        container.innerHTML = '';
        return;
    }

    const properties = state.allProperties || [];
    const favorites = properties.filter(property => property.favorite).length;
    const possibilities = properties.filter(property => !property.hidden && !property.favorite && Number(property.possibility) === 1).length;
    // Only Active listings count as needing review: a Pending/Closed/Withdrawn home that was never
    // reviewed isn't something the client still has to act on.
    const reviewNeeded = properties.filter(property => !property.hidden && !property.favorite && property.rating === 0
        && String(property.status || '').trim().toLowerCase() === 'active').length;
    let showings = [];
    try {
        const res = await fetch('backend/api.php?action=get_my_showings', { credentials: 'include' }).then(response => response.json());
        showings = res?.success && Array.isArray(res.showings) ? res.showings : [];
    } catch (e) {}
    const nextShowing = showings[0];
    const showingDetail = nextShowing ? `${formatShowingTime(nextShowing.showing_time)} | ${nextShowing.address || 'Property showing'}` : 'No showings scheduled';

    container.style.display = 'block';
    container.innerHTML = `
        <section class="user-top-panel">
            <div class="user-top-panel-header">
                <div>
                    <h2 class="user-top-panel-title"><i data-lucide="circle-check"></i> My Next Steps</h2>
                    <p class="user-top-panel-sub">Keep your possibilities current and share your reactions with your realtor.</p>
                </div>
                <button class="btn-dashboard-collapse" onclick="if(window.toggleUserDashboard) window.toggleUserDashboard(true);" title="Collapse Dashboard Metrics" type="button">
                    <i data-lucide="chevron-up"></i> Collapse
                </button>
            </div>
            <div class="user-top-panel-grid">
                <div class="user-panel-card" onclick="window.focusClientNextStep('none')" title="Filter to unreviewed listings">
                    <div class="user-panel-card-header">
                        <span class="user-panel-card-label">To Review</span>
                        <i data-lucide="clipboard-list" style="color:var(--accent-gold);"></i>
                    </div>
                    <div class="user-panel-card-value">${reviewNeeded}</div>
                    <div class="user-panel-card-sub">Homes to review</div>
                </div>

                <div class="user-panel-card" onclick="window.focusClientNextStep('favorite')" title="Filter to saved favorites">
                    <div class="user-panel-card-header">
                        <span class="user-panel-card-label">Favorites</span>
                        <i data-lucide="star" style="color:var(--accent-gold);"></i>
                    </div>
                    <div class="user-panel-card-value">${favorites}</div>
                    <div class="user-panel-card-sub">Saved favorites</div>
                </div>

                <div class="user-panel-card" onclick="window.focusClientNextStep('possibility')" title="Filter to under consideration">
                    <div class="user-panel-card-header">
                        <span class="user-panel-card-label">Consideration</span>
                        <i data-lucide="circle-help" style="color:var(--accent-blue);"></i>
                    </div>
                    <div class="user-panel-card-value">${possibilities}</div>
                    <div class="user-panel-card-sub">Under consideration</div>
                </div>

                <div class="user-panel-card" onclick="if(window.switchView) window.switchView('grid');" title="View scheduled property showings">
                    <div class="user-panel-card-header">
                        <span class="user-panel-card-label">Showings</span>
                        <i data-lucide="calendar-clock" style="color:var(--accent-emerald);"></i>
                    </div>
                    <div class="user-panel-card-value">${showings.length}</div>
                    <div class="user-panel-card-sub">${showingDetail}</div>
                </div>
            </div>
        </section>
    `;
    if (window.lucide) window.lucide.createIcons();
}

window.focusClientNextStep = function(status) {
    // Keep the grid in step with the number on the card: To Review counts Active listings only,
    // while Favorites and Consideration count every MLS status.
    const mlsStatusSelect = document.getElementById('filter-status');
    const wantedMlsStatus = status === 'none' ? 'Active' : 'all';
    if (mlsStatusSelect && mlsStatusSelect.value !== wantedMlsStatus) {
        mlsStatusSelect.value = wantedMlsStatus;
        mlsStatusSelect.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const select = document.getElementById('filter-matrix-status-top');
    if (select) {
        select.value = status;
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    // Bring the results into view, stopping just below the sticky header (logo bar + playlist
    // banner, ~238px when the banner shows). A plain scrollIntoView({block:'start'}) put the
    // grid's top edge at y=0, hiding the first row of cards under that header.
    requestAnimationFrame(() => {
        const target = document.getElementById('view-grid-container');
        if (!target) return;
        const header = document.querySelector('.header-sticky-wrapper');
        const offset = (header ? header.getBoundingClientRect().height : 0) + 12;
        const top = target.getBoundingClientRect().top + window.scrollY - offset;
        window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' });
    });
};