/**
 * Full-screen photo viewer.
 *
 *   window.openPhotoViewer(mlsId)            -> "All photos" scrolling grid + sticky info panel
 *   window.openPhotoViewer(mlsId, index)     -> single-photo lightbox starting at `index`
 *
 * Grid view:   click a photo to open it big; ←/→ or the header buttons jump to the prev/next
 *              home in the current filtered list; Esc closes.
 * Single view: ←/→ (or swipe) step through photos; Esc / grid button returns to the grid.
 *
 * Self-contained: injects its own overlay + CSS, and listens for keys in the capture phase so
 * it wins over the detail modal's own arrow/Esc handlers while it's open.
 */
import { state } from './state.js';
import { cleanDisplayAddress, escapeHtml, NO_PHOTO_IMG } from './properties.js';

let overlay = null;
let current = { mlsId: null, images: [], index: 0, mode: 'grid', fromDetail: false };

function getGallery(p) {
    let g = [];
    if (Array.isArray(p.gallery_images)) g = p.gallery_images;
    else if (typeof p.gallery_images === 'string') { try { g = JSON.parse(p.gallery_images); } catch (e) {} }
    if (!Array.isArray(g)) g = [];
    g = g.filter(u => typeof u === 'string' && u.trim());
    if (g.length === 0 && p.main_image_url) g = [p.main_image_url];
    return g;
}

function findProperty(mlsId) {
    return (state.allProperties || []).find(p => String(p.mls_id) === String(mlsId));
}

function homeList() {
    const list = (state.filteredProperties && state.filteredProperties.length) ? state.filteredProperties : (state.allProperties || []);
    return list;
}

function img(url, cls, alt, extra = '') {
    return `<img src="${escapeHtml(url)}" class="${cls}" alt="${escapeHtml(alt)}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${NO_PHOTO_IMG}';" ${extra}>`;
}

function injectStyles() {
    if (document.getElementById('pv-styles')) return;
    const css = `
    .pv-overlay{position:fixed;inset:0;z-index:5000;background:rgba(20,18,14,.55);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:24px;}
    .pv-dialog{width:100%;max-width:1240px;height:100%;max-height:900px;background:var(--bg-main,#FAF6F0);color:var(--text-primary,#3A342A);display:flex;flex-direction:column;border-radius:14px;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.35);}
    .pv-header{flex:0 0 auto;display:flex;align-items:center;gap:.75rem;padding:.6rem 1rem;border-bottom:1px solid var(--border-color,rgba(0,0,0,.12));background:var(--bg-card-solid,#fff);}
    .pv-icon-btn{background:none;border:none;color:inherit;cursor:pointer;padding:.4rem;border-radius:8px;display:inline-flex;align-items:center;gap:.35rem;font:inherit;font-size:.85rem;}
    .pv-icon-btn:hover{background:rgba(0,0,0,.06);}
    .pv-icon-btn:disabled{opacity:.35;cursor:default;background:none;}
    .pv-icon-btn svg{width:20px;height:20px;}
    .pv-title{font-weight:600;font-size:.95rem;}
    .pv-sub{color:var(--text-muted,#8A7F6E);font-size:.85rem;}
    .pv-spacer{flex:1;}
    .pv-body{flex:1;overflow-y:auto;}
    .pv-grid-wrap{max-width:1180px;margin:0 auto;padding:1rem;display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:1.25rem;align-items:start;}
    .pv-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px;}
    .pv-grid .pv-cell{cursor:zoom-in;overflow:hidden;border-radius:6px;background:rgba(0,0,0,.05);aspect-ratio:3/2;}
    .pv-grid .pv-cell.wide{grid-column:1 / -1;aspect-ratio:16/9;}
    .pv-grid .pv-cell img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .25s;}
    .pv-grid .pv-cell:hover img{transform:scale(1.02);}
    .pv-side{position:sticky;top:1rem;display:flex;flex-direction:column;gap:.35rem;}
    .pv-price{font-size:1.6rem;font-weight:700;}
    .pv-facts{font-weight:600;}
    .pv-side .btn{margin-top:.6rem;justify-content:center;}
    .pv-home-pos{font-size:.8rem;color:var(--text-muted,#8A7F6E);margin-top:.5rem;}
    .pv-single{position:relative;flex:1;background:#111;display:flex;align-items:center;justify-content:center;overflow:hidden;touch-action:pan-y;}
    .pv-single img.pv-big{max-width:100%;max-height:100%;object-fit:contain;user-select:none;-webkit-user-drag:none;}
    .pv-nav{position:absolute;top:50%;transform:translateY(-50%);width:52px;height:52px;border-radius:50%;border:none;background:rgba(255,255,255,.9);color:#222;cursor:pointer;display:flex;align-items:center;justify-content:center;box-shadow:0 2px 10px rgba(0,0,0,.35);}
    .pv-nav:hover{background:#fff;}
    .pv-nav svg{width:26px;height:26px;}
    .pv-nav.prev{left:16px;} .pv-nav.next{right:16px;}
    .pv-counter{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,.6);color:#fff;padding:4px 12px;border-radius:999px;font-size:.85rem;}
    .pv-strip{flex:0 0 auto;display:flex;gap:6px;overflow-x:auto;padding:8px;background:#111;}
    .pv-strip img{height:58px;width:88px;object-fit:cover;border-radius:4px;opacity:.5;cursor:pointer;flex:0 0 auto;border:2px solid transparent;}
    .pv-strip img.active{opacity:1;border-color:#fff;}
    .pv-empty{padding:3rem;text-align:center;color:var(--text-muted,#8A7F6E);}
    body.pv-open{overflow:hidden;}
    @media (max-width: 820px){
      .pv-grid-wrap{grid-template-columns:1fr;}
      .pv-side{position:static;order:-1;}
      .pv-grid{grid-template-columns:1fr;}
      .pv-nav{width:40px;height:40px;} .pv-nav.prev{left:8px;} .pv-nav.next{right:8px;}
      .pv-hide-sm{display:none;}
      .pv-overlay{padding:0;}
      .pv-dialog{max-width:none;max-height:none;border-radius:0;}
    }`;
    const style = document.createElement('style');
    style.id = 'pv-styles';
    style.textContent = css;
    document.head.appendChild(style);
}

const ICONS = {
    x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg>',
    grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>',
};

function render() {
    const p = findProperty(current.mlsId);
    if (!p || !overlay) return;
    const dialog = overlay.querySelector('.pv-dialog');
    const imgs = current.images;
    const addr = cleanDisplayAddress(p.address, p.mls_id);
    const list = homeList();
    const pos = list.findIndex(h => String(h.mls_id) === String(p.mls_id));
    const canHomeNav = pos !== -1 && list.length > 1;

    const header = `
        <div class="pv-header">
            <button class="pv-icon-btn" data-pv="close" title="Close (Esc)">${ICONS.x}</button>
            ${current.mode === 'single' ? `<button class="pv-icon-btn" data-pv="grid" title="All photos (Esc)">${ICONS.grid}<span class="pv-hide-sm">All photos</span></button>` : ''}
            <div style="min-width:0;">
                <div class="pv-title">${escapeHtml(addr)}</div>
                <div class="pv-sub">${imgs.length} photo${imgs.length === 1 ? '' : 's'}${p.price ? ` · $${Number(p.price).toLocaleString()}` : ''}</div>
            </div>
            <div class="pv-spacer"></div>
            ${canHomeNav ? `
                <button class="pv-icon-btn" data-pv="prev-home" title="Previous home${current.mode === 'grid' ? ' (←)' : ''}">${ICONS.left}<span class="pv-hide-sm">Prev home</span></button>
                <span class="pv-sub pv-hide-sm">${pos + 1} / ${list.length}</span>
                <button class="pv-icon-btn" data-pv="next-home" title="Next home${current.mode === 'grid' ? ' (→)' : ''}"><span class="pv-hide-sm">Next home</span>${ICONS.right}</button>
            ` : ''}
        </div>`;

    if (current.mode === 'grid') {
        // Rhythm: one wide photo, then a pair, repeat.
        const cells = imgs.map((url, i) => {
            const wide = (i % 3 === 0);
            return `<div class="pv-cell ${wide ? 'wide' : ''}" data-pv-idx="${i}">${img(url, '', `Photo ${i + 1}`, i > 3 ? 'loading="lazy"' : '')}</div>`;
        }).join('');
        const beds = p.beds != null ? `${p.beds} bd` : '';
        const baths = p.baths != null ? `${p.baths} ba` : '';
        const sqft = (p.sqft_finished || p.sqft_total) ? `${Number(p.sqft_finished || p.sqft_total).toLocaleString()} sq ft` : '';
        const facts = [beds, baths, sqft].filter(Boolean).join(' • ');
        dialog.innerHTML = header + `
            <div class="pv-body">
                <div class="pv-grid-wrap">
                    ${imgs.length ? `<div class="pv-grid">${cells}</div>` : `<div class="pv-empty">No photos synced for this home yet.</div>`}
                    <aside class="pv-side">
                        ${p.price ? `<div class="pv-price">$${Number(p.price).toLocaleString()}</div>` : ''}
                        ${facts ? `<div class="pv-facts">${escapeHtml(facts)}</div>` : ''}
                        <div>${escapeHtml(addr)}${p.city ? `, ${escapeHtml(p.city)}` : ''}${p.zip ? ` ${escapeHtml(p.zip)}` : ''}</div>
                        ${p.status ? `<div class="pv-sub">${escapeHtml(p.status)}</div>` : ''}
                        ${current.fromDetail ? '' : `<button class="btn btn-primary" data-pv="details">View full details</button>`}
                        ${canHomeNav ? `<div class="pv-home-pos">Home ${pos + 1} of ${list.length} in your current results · ←/→ to flip homes</div>` : ''}
                    </aside>
                </div>
            </div>`;
    } else {
        const i = current.index;
        dialog.innerHTML = header + `
            <div class="pv-single">
                ${imgs.length > 1 ? `<button class="pv-nav prev" data-pv="prev" title="Previous (←)">${ICONS.left}</button>` : ''}
                ${img(imgs[i], 'pv-big', `Photo ${i + 1}`)}
                ${imgs.length > 1 ? `<button class="pv-nav next" data-pv="next" title="Next (→)">${ICONS.right}</button>` : ''}
                <span class="pv-counter">${i + 1} / ${imgs.length}</span>
            </div>
            ${imgs.length > 1 ? `<div class="pv-strip">${imgs.map((u, k) => img(u, k === i ? 'active' : '', `Thumbnail ${k + 1}`, `data-pv-idx="${k}" loading="lazy"`)).join('')}</div>` : ''}`;
        const active = overlay.querySelector('.pv-strip img.active');
        if (active) active.scrollIntoView({ block: 'nearest', inline: 'center' });
        // Preload neighbours so arrowing feels instant
        [i + 1, i - 1].forEach(k => { const u = imgs[(k + imgs.length) % imgs.length]; if (u) { const im = new Image(); im.referrerPolicy = 'no-referrer'; im.src = u; } });
    }
}

function showPhoto(idx) {
    const n = current.images.length;
    if (!n) return;
    current.index = ((idx % n) + n) % n;
    current.mode = 'single';
    render();
}

function switchHome(delta) {
    const list = homeList();
    const pos = list.findIndex(h => String(h.mls_id) === String(current.mlsId));
    if (pos === -1 || list.length < 2) return;
    const next = list[(pos + delta + list.length) % list.length];
    const keepMode = current.mode;
    loadHome(next.mls_id);
    current.mode = keepMode === 'single' && current.images.length ? 'single' : 'grid';
    current.index = 0;
    render();
    const body = overlay.querySelector('.pv-body');
    if (body) body.scrollTop = 0;
}

function loadHome(mlsId) {
    const p = findProperty(mlsId);
    current.mlsId = mlsId;
    current.images = p ? getGallery(p) : [];
}

function close() {
    if (!overlay) return;
    overlay.remove();
    overlay = null;
    document.body.classList.remove('pv-open');
    document.removeEventListener('keydown', onKey, true);
}

function onKey(e) {
    if (!overlay) return;
    const k = e.key;
    if (!['Escape', 'ArrowLeft', 'ArrowRight'].includes(k)) return;
    e.preventDefault();
    e.stopImmediatePropagation(); // keep the detail modal from also reacting
    if (k === 'Escape') {
        if (current.mode === 'single') { current.mode = 'grid'; render(); } else close();
        return;
    }
    const d = k === 'ArrowLeft' ? -1 : 1;
    if (current.mode === 'single') showPhoto(current.index + d);
    else switchHome(d);
}

function onClick(e) {
    if (e.target === overlay) { close(); return; } // click on the dimmed backdrop
    const idxEl = e.target.closest('[data-pv-idx]');
    if (idxEl) { showPhoto(Number(idxEl.getAttribute('data-pv-idx'))); return; }
    const btn = e.target.closest('[data-pv]');
    if (!btn) return;
    switch (btn.getAttribute('data-pv')) {
        case 'close': close(); break;
        case 'grid': current.mode = 'grid'; render(); break;
        case 'prev': showPhoto(current.index - 1); break;
        case 'next': showPhoto(current.index + 1); break;
        case 'prev-home': switchHome(-1); break;
        case 'next-home': switchHome(1); break;
        case 'details': {
            const id = current.mlsId;
            close();
            if (typeof window.openDetailModal === 'function') window.openDetailModal(id);
            break;
        }
    }
}

// Swipe support for phones/tablets in single-photo view
let touchX = null;
function onTouchStart(e) { if (current.mode === 'single' && e.touches.length === 1) touchX = e.touches[0].clientX; }
function onTouchEnd(e) {
    if (touchX === null || current.mode !== 'single') return;
    const dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) > 40) showPhoto(current.index + (dx < 0 ? 1 : -1));
}

window.openPhotoViewer = function (mlsId, startIndex = null, opts = {}) {
    if (!findProperty(mlsId)) return;
    injectStyles();
    loadHome(mlsId);
    current.fromDetail = !!opts.fromDetail;
    current.mode = (startIndex === null || startIndex === undefined || !current.images.length) ? 'grid' : 'single';
    current.index = Math.max(0, Math.min(Number(startIndex) || 0, current.images.length - 1));

    if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'pv-overlay';
        overlay.setAttribute('role', 'dialog');
        overlay.setAttribute('aria-modal', 'true');
        overlay.setAttribute('aria-label', 'Property photos');
        overlay.innerHTML = '<div class="pv-dialog"></div>';
        overlay.addEventListener('click', onClick);
        overlay.addEventListener('touchstart', onTouchStart, { passive: true });
        overlay.addEventListener('touchend', onTouchEnd);
        document.body.appendChild(overlay);
        document.body.classList.add('pv-open');
        document.addEventListener('keydown', onKey, true);
    }
    render();
};

window.closePhotoViewer = close;
