/**
 * Opens a listing straight from a link: ?home=<MLS #> (used by the QR codes on the printed buyer
 * tour packet, so a buyer can rate a home and leave notes from their phone while they're there).
 * Waits for sign-in and for the listings to load, opens the home's detail view, then drops the
 * parameter from the address bar so a refresh doesn't reopen it.
 */
import { state } from './state.js';

const params = new URLSearchParams(window.location.search);
// ?results=<MLS #> (packets printed after Tour Results existed) opens Tour Results at that home;
// ?home=<MLS #> (older packets) opens the home's detail view.
const resultsMls = params.get('results');
const mls = resultsMls || params.get('home');
if (mls && /^[A-Za-z0-9-]{3,20}$/.test(mls)) {
    const started = Date.now();
    const timer = setInterval(() => {
        const list = state.allProperties || [];
        const ready = typeof window.openDetailModal === 'function' && state.authenticated && list.length > 0;
        if (ready) {
            clearInterval(timer);
            if (resultsMls && typeof window.openTourResults === 'function') window.openTourResults(mls);
            else if (list.some(p => String(p.mls_id) === mls)) window.openDetailModal(mls);
            const url = new URL(window.location.href);
            url.searchParams.delete('home');
            url.searchParams.delete('results');
            history.replaceState(null, '', url.pathname + url.search + url.hash);
        } else if (Date.now() - started > 10 * 60 * 1000) {
            clearInterval(timer);   // gave up (never signed in)
        }
    }, 500);
}
