/**
 * MLS & Redfin Property Scout - Bookmarklet Drag Link Setup
 * Wires the drag-to-bookmark buttons using the global getBookmarkletCode /
 * getDeepScrapeBookmarkletCode functions from bookmarklet-builder.js (a classic script,
 * loaded before this module, so its globals are already defined).
 */
import { elements } from './state.js';


export function setupBookmarkletLink() {
    const getApiUrl = () => {
        let base = window.location.origin + window.location.pathname.replace(/\/index\.html$/, '').replace(/\/$/, '');
        return base + '/backend/api.php';
    };

    const updateHrefs = () => {
        const apiUrl = getApiUrl();
        if (typeof getBookmarkletCode === 'function') {
            const code = getBookmarkletCode(apiUrl);
            if (elements.dragBookmarkletBtn) elements.dragBookmarkletBtn.setAttribute('href', code);
            if (elements.modalDragBmBtn) elements.modalDragBmBtn.setAttribute('href', code);
        }
        if (typeof getDeepScrapeBookmarkletCode === 'function') {
            const deepCode = getDeepScrapeBookmarkletCode(apiUrl);
            if (elements.modalDragDeepBmBtn) elements.modalDragDeepBmBtn.setAttribute('href', deepCode);
        }
    };

    updateHrefs();

    // Re-sync on hover or drag start
    const targets = [elements.dragBookmarkletBtn, elements.modalDragBmBtn, elements.modalDragDeepBmBtn].filter(Boolean);
    targets.forEach(btn => {
        ['mouseenter', 'focus', 'mousedown', 'dragstart'].forEach(evt => {
            btn.addEventListener(evt, updateHrefs);
        });
    });

    if (elements.dragBookmarkletBtn) {
        elements.dragBookmarkletBtn.addEventListener('click', (e) => {
            e.preventDefault();
            elements.modalBookmarklet?.classList.add('active');
        });
    }
}
