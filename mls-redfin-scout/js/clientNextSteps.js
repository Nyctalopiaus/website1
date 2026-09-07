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
    const possibilities = properties.filter(property => property.rating === 3).length;
    const reviewNeeded = properties.filter(property => !property.hidden && !property.favorite && property.rating === 0).length;
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
                    <p class="user-top-panel-sub">Keep your shortlist current and share your reactions with your realtor.</p>
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
    const select = document.getElementById('filter-matrix-status-top');
    if (select) {
        select.value = status;
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    document.getElementById('view-grid-container')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
};