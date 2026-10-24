/**
 * Phone-only collapsible sections: My Next Steps, Search Intelligence, and the
 * Search / Filters / Views control bar. On screens <= 768px each one starts collapsed
 * on every page load and its header toggles it. The m-collapsed class only has an
 * effect inside the matching @media rule in styles.css, so desktop is unaffected.
 * The section containers persist across re-renders (only their innerHTML changes),
 * so the collapsed state survives the panels being redrawn.
 */
const mq = window.matchMedia('(max-width: 768px)');

const SECTION_SELECTOR = '#client-next-steps-container, .user-dashboard-top-grid > .stats-bar, .top-filter-container';
const HEADER_SELECTOR = '.user-dashboard-top-grid .user-top-panel-header, .top-filter-container > .mobile-section-toggle';

function setCollapsed(section, collapsed) {
    section.classList.toggle('m-collapsed', collapsed);
    const header = section.querySelector('.user-top-panel-header, .mobile-section-toggle');
    if (header) header.setAttribute('aria-expanded', String(!collapsed));
}

function collapseAllOnPhone() {
    if (!mq.matches) return;
    document.querySelectorAll(SECTION_SELECTOR).forEach(section => setCollapsed(section, true));
}

document.addEventListener('click', (e) => {
    if (!mq.matches) return;
    const header = e.target.closest(HEADER_SELECTOR);
    if (!header) return;
    const section = header.closest(SECTION_SELECTOR);
    if (!section) return;
    setCollapsed(section, !section.classList.contains('m-collapsed'));
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', collapseAllOnPhone);
} else {
    collapseAllOnPhone();
}
