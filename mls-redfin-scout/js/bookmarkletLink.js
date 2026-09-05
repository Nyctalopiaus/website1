/**
 * MLS & Redfin Property Scout - Bookmarklet Drag Link Setup
 * Wires the drag-to-bookmark buttons using the global getBookmarkletCode /
 * getDeepScrapeBookmarkletCode functions from bookmarklet-builder.js (a classic script,
 * loaded before this module, so its globals are already defined).
 */
import { elements } from './state.js';


    export function setupBookmarkletLink() {
        const apiUrl = window.location.href.replace(/\/index\.html.*$/, '') + '/backend/api.php';
        const code = typeof getBookmarkletCode === 'function' 
            ? getBookmarkletCode(apiUrl) 
            : 'javascript:alert("Bookmarklet Engine Loading...");';

        if (elements.dragBookmarkletBtn) {
            elements.dragBookmarkletBtn.href = code;
            elements.dragBookmarkletBtn.addEventListener('click', (e) => {
                e.preventDefault();
                elements.modalBookmarklet.classList.add('active');
            });
        }
        if (elements.modalDragBmBtn) elements.modalDragBmBtn.href = code;

        const deepCode = typeof getDeepScrapeBookmarkletCode === 'function'
            ? getDeepScrapeBookmarkletCode(apiUrl)
            : 'javascript:alert("Deep Scrape Engine Loading...");';
        if (elements.modalDragDeepBmBtn) elements.modalDragDeepBmBtn.href = deepCode;
    }
