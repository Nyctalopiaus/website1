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
        <section style="margin:0 0 1.25rem; padding:1rem 1.15rem; background:var(--bg-card); border:1px solid var(--border-color); border-radius:var(--radius-md);">
            <div style="display:flex; justify-content:space-between; align-items:baseline; gap:1rem; flex-wrap:wrap; margin-bottom:0.75rem;">
                <div><h2 style="font-size:1rem;"><i data-lucide="circle-check"></i> My Next Steps</h2><p style="margin-top:0.15rem; color:var(--text-muted); font-size:0.82rem;">Keep your shortlist current and share your reactions with your realtor.</p></div>
            </div>
            <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); gap:0.65rem;">
                <button type="button" class="btn btn-secondary" style="justify-content:flex-start; text-align:left;" onclick="window.focusClientNextStep('none')"><i data-lucide="clipboard-list"></i><span><strong>${reviewNeeded}</strong><br><small>Homes to review</small></span></button>
                <button type="button" class="btn btn-secondary" style="justify-content:flex-start; text-align:left;" onclick="window.focusClientNextStep('favorite')"><i data-lucide="star"></i><span><strong>${favorites}</strong><br><small>Saved favorites</small></span></button>
                <button type="button" class="btn btn-secondary" style="justify-content:flex-start; text-align:left;" onclick="window.focusClientNextStep('possibility')"><i data-lucide="circle-help"></i><span><strong>${possibilities}</strong><br><small>Under consideration</small></span></button>
                <div style="display:flex; align-items:center; gap:0.55rem; padding:0.6rem 0.75rem; border:1px solid var(--border-color); border-radius:var(--radius-sm);"><i data-lucide="calendar-clock" style="color:var(--accent-emerald);"></i><span><strong>${showings.length}</strong><br><small>${showingDetail}</small></span></div>
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