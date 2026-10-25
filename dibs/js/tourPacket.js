/**
 * Tour packet: a printable, double-sided PDF for the agent's showing day (backend/packet.php).
 *
 * Every sheet of paper is two PDF pages (front, back), so printing duplex keeps everything paired:
 *   Sheet 1   front: cover + itinerary            back: route map + driving legs
 *   Sheet 2   front: client brief, questions,     back: scorecard to compare the homes
 *             and a bring-along checklist
 *   Sheet 3+  one per home, in tour order
 *             front: photo, price, facts, costs,  back: showing details, brief fit, client
 *             interior details, remarks                 notes, and a notes/rating form
 * Every block is drawn into a fixed box and text that doesn't fit is cut with "…", so nothing
 * ever spills onto another page. If the page count ever came out odd, a blank page is added.
 *
 * Built with jsPDF in the browser. Route and times come from the open Tour Planner; listing
 * details from get_tour_packet. Map tiles: OpenStreetMap (attributed on the map page).
 */
import { showToast } from './toast.js';

const PAGE_W = 612, PAGE_H = 792, M = 36, CW = PAGE_W - 2 * M;   // US Letter, points
const FOOT_Y = PAGE_H - 22;
// Designed for black-and-white printing: meaning is carried by symbols, words and weight, never by
// hue alone, and large filled areas are avoided to save toner. Accent tones are dark enough to stay
// legible as gray.
const C = {
    ink: [28, 30, 34], muted: [92, 96, 104], rule: [200, 203, 208], fill: [244, 244, 244],
    gold: [112, 86, 24], goldFill: [250, 246, 235], green: [28, 30, 34], amber: [28, 30, 34],
    red: [28, 30, 34], gray: [120, 124, 130], white: [255, 255, 255], blue: [28, 30, 34],
};
const RESULT = {
    pass: ['Meets', C.green], partial: ['Close', C.amber], miss: ['Misses', C.red], dealbreaker: ['Deal-breaker', C.red],
    unconfirmed: ['Check', C.gray], unknown: ['Unknown', C.gray],
};
const MODE = { must: 'Must', prefer: 'Nice', avoid: 'Avoid' };

// ------------------------------------------------------------------ libraries

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = src;
        s.onload = resolve;
        s.onerror = () => reject(new Error('Failed to load ' + src));
        document.head.appendChild(s);
    });
}
// The website's typefaces (both SIL Open Font License), embedded so the printout matches Dibs:
// Plus Jakarta Sans for text, Playfair Display for names, addresses and prices. Static TTFs from
// the pinned @expo-google-fonts packages on jsDelivr. If they can't load, the packet falls back
// to the PDF's built-in Helvetica and still builds.
const FONT_CDN = 'https://cdn.jsdelivr.net/npm/@expo-google-fonts';
const FONT_FILES = [
    { family: 'Jakarta', style: 'normal', url: `${FONT_CDN}/plus-jakarta-sans@0.2.3/PlusJakartaSans_400Regular.ttf` },
    { family: 'Jakarta', style: 'bold', url: `${FONT_CDN}/plus-jakarta-sans@0.2.3/PlusJakartaSans_700Bold.ttf` },
    { family: 'Jakarta', style: 'italic', url: `${FONT_CDN}/plus-jakarta-sans@0.2.3/PlusJakartaSans_400Regular_Italic.ttf` },
    { family: 'Playfair', style: 'normal', url: `${FONT_CDN}/playfair-display@0.2.3/PlayfairDisplay_400Regular.ttf` },
    { family: 'Playfair', style: 'bold', url: `${FONT_CDN}/playfair-display@0.2.3/PlayfairDisplay_700Bold.ttf` },
];
let fontData = null;   // [{ family, style, file, b64 }] once loaded; [] if they couldn't be
function loadFonts() {
    if (fontData) return Promise.resolve(fontData);
    const toB64 = buf => {
        let bin = '';
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
        return btoa(bin);
    };
    // Copies on this site (assets/fonts/) first: the live site's security policy doesn't let the page fetch
    // from other domains. The CDN is the fallback for setups without the local copies.
    // Only accept a real TrueType file: the server answers unknown paths with the app's HTML page.
    const get = url => fetch(url).then(r => { if (!r.ok) throw new Error('font ' + r.status); return r.arrayBuffer(); }).then(buf => {
        const v = new DataView(buf);
        if (buf.byteLength < 1024 || (v.getUint32(0) !== 0x00010000 && v.getUint32(0) !== 0x74727565)) throw new Error('not a font: ' + url);
        return buf;
    });
    return Promise.all(FONT_FILES.map(f => {
        const file = f.url.split('/').pop();
        return get('assets/fonts/' + file).catch(() => get(f.url)).then(buf => ({ ...f, file, b64: toB64(buf) }));
    }))
        .then(list => (fontData = list))
        .catch(e => { console.warn('[TourPacket] fonts unavailable, using Helvetica', e); return []; });
}

let libs = null;
function loadLibs() {
    if (!libs) {
        libs = (window.jspdf?.jsPDF ? Promise.resolve() : loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'))
            // QR codes are a nice-to-have: the packet still builds without them.
            .then(() => (window.qrcode ? null : loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js').catch(() => null)))
            .catch(e => { libs = null; throw e; });
    }
    return libs;
}

// ------------------------------------------------------------------ text helpers

/** jsPDF's built-in fonts only cover Windows-1252; map or drop anything else. */
function T(v) {
    return String(v ?? '')
        .replace(/[−‐‑]/g, '-').replace(/→/g, '->').replace(/[★☆]/g, '*')
        .replace(/ /g, ' ').replace(/[\r\t]+/g, ' ')
        .replace(/[^\n\x20-\x7e\xa1-\xff–—‘’“”•…€™·]/g, '');
}
const money = v => (v == null || v === '' || Number.isNaN(Number(v))) ? '' : '$' + Math.round(Number(v)).toLocaleString('en-US');
const num = v => (v == null || v === '' || Number.isNaN(Number(v))) ? '' : Number(v).toLocaleString('en-US');
const firstName = n => String(n || '').trim().split(/\s+/)[0] || 'Client';
function clock(d) {
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return '';
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function longDate(ymd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd || '');
    if (!m) return '';
    return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}
function shortDate(ymd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || '');
    return m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
}
function daysSince(ymd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || '');
    if (!m) return null;
    return Math.max(0, Math.floor((Date.now() - new Date(+m[1], +m[2] - 1, +m[3]).getTime()) / 86400000));
}
function fullAddress(h) {
    return [h.address, h.city, [h.state || 'CO', h.zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
}
function directionsUrl(dest, origin = '', waypoints = []) {
    const q = new URLSearchParams({ api: '1', destination: dest, travelmode: 'driving' });
    if (origin) q.set('origin', origin);
    if (waypoints.length) q.set('waypoints', waypoints.join('|'));
    return 'https://www.google.com/maps/dir/?' + q.toString();
}

// ------------------------------------------------------------------ drawing primitives

class Sheet {
    constructor(doc, fonts = []) {
        this.doc = doc;
        this.fonts = false;
        try {
            for (const f of fonts) {
                doc.addFileToVFS(f.file, f.b64);
                doc.addFont(f.file, f.family, f.style);
            }
            this.fonts = fonts.length === FONT_FILES.length;
        } catch (e) { this.fonts = false; }
    }
    color(c) { this.doc.setTextColor(...c); return this; }
    /** style: normal | bold | italic (text face) or display | displayBold (headline face). */
    font(size, style = 'normal', c = C.ink) {
        const display = style === 'display' || style === 'displayBold';
        if (this.fonts) this.doc.setFont(display ? 'Playfair' : 'Jakarta', style === 'displayBold' || style === 'bold' ? 'bold' : (style === 'italic' ? 'italic' : 'normal'));
        else this.doc.setFont('helvetica', style === 'displayBold' ? 'bold' : (display ? 'normal' : style));
        this.doc.setFontSize(size);
        this.color(c);
        return this;
    }
    fill(c) { this.doc.setFillColor(...c); return this; }
    stroke(c, w = 0.6) { this.doc.setDrawColor(...c); this.doc.setLineWidth(w); return this; }
    rect(x, y, w, h, mode = 'S', r = 0) {
        if (r) this.doc.roundedRect(x, y, w, h, r, r, mode); else this.doc.rect(x, y, w, h, mode);
        return this;
    }
    line(x1, y1, x2, y2) { this.doc.line(x1, y1, x2, y2); return this; }

    /** One line, cut with "…" to fit width. align: left|right|center. */
    one(str, x, y, w, size, style = 'normal', c = C.ink, align = 'left') {
        this.font(size, style, c);
        let s = T(str);
        if (this.doc.getTextWidth(s) > w) {
            while (s.length > 1 && this.doc.getTextWidth(s + '…') > w) s = s.slice(0, -1);
            s = s.trimEnd() + '…';
        }
        const ax = align === 'right' ? x + w : (align === 'center' ? x + w / 2 : x);
        this.doc.text(s, ax, y, { align, baseline: 'alphabetic' });
        return this;
    }

    /** Wrapped text inside (w × maxH); returns the height used. Cut with "…" when it doesn't fit. */
    box(str, x, y, w, maxH, size = 9, style = 'normal', c = C.ink, lineH = null) {
        const lh = lineH || size * 1.28;
        const maxLines = Math.floor((maxH + 0.01) / lh);
        if (maxLines < 1 || !String(str ?? '').trim()) return 0;
        this.font(size, style, c);
        let lines = this.doc.splitTextToSize(T(str), w);
        if (lines.length > maxLines) {
            lines = lines.slice(0, maxLines);
            let last = lines[maxLines - 1];
            while (last.length > 1 && this.doc.getTextWidth(last + '…') > w) last = last.slice(0, -1);
            lines[maxLines - 1] = last.trimEnd() + '…';
        }
        lines.forEach((ln, i) => this.doc.text(ln, x, y + size + i * lh, { baseline: 'alphabetic' }));
        return lines.length * lh;
    }

    /** Height a wrapped text would need (uncut). */
    measure(str, w, size = 9, lineH = null) {
        this.font(size);
        return this.doc.splitTextToSize(T(str), w).length * (lineH || size * 1.28);
    }

    /** Section title with a short gold rule; returns y below it. */
    title(text, x, y, w) {
        this.one(String(text).toUpperCase(), x, y + 9, w, 8.5, 'bold', C.gold);
        this.stroke(C.gold, 1.2).line(x, y + 13, x + 28, y + 13);
        this.stroke(C.rule, 0.5).line(x + 30, y + 13, x + w, y + 13);
        return y + 20;
    }

    /** Label over value, inside a fixed cell. */
    fact(label, value, x, y, w) {
        this.one(label, x, y + 7, w, 6.8, 'bold', C.muted);
        this.one(value || '—', x, y + 18, w, 9.5, 'normal', C.ink);
    }

    checkbox(x, y, label, size = 8.5, w = 160) {
        this.stroke(C.ink, 0.7).rect(x, y, 9, 9);
        this.one(label, x + 14, y + 8, w - 14, size);
    }

    circles(x, y, n = 5, r = 5.2, gap = 15) {
        this.stroke(C.ink, 0.7);
        for (let i = 0; i < n; i++) this.doc.circle(x + r + i * gap, y + r, r, 'S');
    }

    dot(x, y, c, r = 3) { this.fill(c); this.doc.circle(x + r, y + r, r, 'F'); }

    /** Result mark that reads in grayscale: check (meets), X (misses / deal-breaker), half-filled
     *  circle (close), question mark (check photos / unknown). (x, y) is the top-left of a size box. */
    mark(kind, x, y, size = 6) {
        const d = this.doc, c = size / 2;
        this.stroke(C.ink, 0.9);
        if (kind === 'pass') { d.line(x + 0.5, y + c, x + c * 0.8, y + size - 0.6); d.line(x + c * 0.8, y + size - 0.6, x + size, y + 0.4); }
        else if (kind === 'miss' || kind === 'dealbreaker') { d.line(x + 0.6, y + 0.6, x + size - 0.6, y + size - 0.6); d.line(x + size - 0.6, y + 0.6, x + 0.6, y + size - 0.6); }
        else if (kind === 'partial') { d.circle(x + c, y + c, c - 0.4, 'S'); this.fill(C.ink); d.rect(x + 0.4, y + c, size - 0.8, c - 0.4, 'F'); }
        else { this.one('?', x, y + size - 0.2, size, size * 1.35, 'bold', C.ink, 'center'); }
    }

    ruled(x, y, w, h, gap = 18) {
        this.stroke(C.rule, 0.5);
        for (let yy = y + gap; yy <= y + h + 0.1; yy += gap) this.line(x, yy, x + w, yy);
    }

    qr(text, x, y, size) {
        if (!window.qrcode || !text) return false;
        try {
            const q = window.qrcode(0, 'M');
            q.addData(text);
            q.make();
            const n = q.getModuleCount();
            const cell = size / n;
            this.fill(C.ink);
            for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
                if (q.isDark(r, c)) this.doc.rect(x + c * cell, y + r * cell, cell + 0.05, cell + 0.05, 'F');
            }
            return true;
        } catch (e) { return false; }
    }

    image(dataUrl, x, y, w, h) {
        if (!dataUrl) return false;
        try { this.doc.addImage(dataUrl, 'JPEG', x, y, w, h, undefined, 'FAST'); return true; } catch (e) { return false; }
    }

    placeholder(x, y, w, h, label) {
        this.stroke(C.rule, 0.6).rect(x, y, w, h);
        this.one(label, x, y + h / 2 + 3, w, 9, 'normal', C.muted, 'center');
    }
}

// ------------------------------------------------------------------ images

function loadImage(src, timeoutMs = 10000) {
    return new Promise(resolve => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        const t = setTimeout(() => { img.src = ''; resolve(null); }, timeoutMs);
        img.onload = () => { clearTimeout(t); resolve(img); };
        img.onerror = () => { clearTimeout(t); resolve(null); };
        img.src = src;
    });
}

/** Photo cropped to fill a w×h box (points), as a compact JPEG. */
async function photoData(src, w, h) {
    const img = await loadImage(src);
    if (!img || !img.naturalWidth) return null;
    const scale = 2.2;   // ~160 dpi on paper
    const cw = Math.round(w * scale), ch = Math.round(h * scale);
    const canvas = Object.assign(document.createElement('canvas'), { width: cw, height: ch });
    const ctx = canvas.getContext('2d');
    const r = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const dw = img.naturalWidth * r, dh = img.naturalHeight * r;
    ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
    // Grayscale with a little extra contrast, so what's on screen is what a black-and-white printer
    // produces and photos don't print flat and muddy.
    try {
        const px = ctx.getImageData(0, 0, cw, ch);
        for (let i = 0; i < px.data.length; i += 4) {
            const g = 0.299 * px.data[i] + 0.587 * px.data[i + 1] + 0.114 * px.data[i + 2];
            px.data[i] = px.data[i + 1] = px.data[i + 2] = Math.max(0, Math.min(255, Math.round((g - 128) * 1.15 + 134)));
        }
        ctx.putImageData(px, 0, 0);
        return canvas.toDataURL('image/jpeg', 0.8);
    } catch (e) { return null; }
}

/**
 * Branding image as PNG data: 'circle' crops to a round headshot (transparent corners), 'fit' keeps
 * the logo's proportions. Converted to grayscale so the screen matches a black-and-white print.
 * Returns { data, w, h } in source pixels (for aspect ratio) or null.
 */
async function brandImage(src, mode) {
    const img = await loadImage(src);
    if (!img || !img.naturalWidth) return null;
    const max = mode === 'circle' ? 360 : 900;
    const r = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    let w = Math.round(img.naturalWidth * r), h = Math.round(img.naturalHeight * r);
    if (mode === 'circle') w = h = Math.min(w, h);
    const canvas = Object.assign(document.createElement('canvas'), { width: w, height: h });
    const ctx = canvas.getContext('2d');
    if (mode === 'circle') {
        ctx.beginPath(); ctx.arc(w / 2, h / 2, w / 2, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
        const sc = Math.max(w / img.naturalWidth, h / img.naturalHeight);
        ctx.drawImage(img, (w - img.naturalWidth * sc) / 2, (h - img.naturalHeight * sc) / 2, img.naturalWidth * sc, img.naturalHeight * sc);
    } else {
        ctx.drawImage(img, 0, 0, w, h);
    }
    try {
        const px = ctx.getImageData(0, 0, w, h);
        for (let i = 0; i < px.data.length; i += 4) {
            const g = Math.round(0.299 * px.data[i] + 0.587 * px.data[i + 1] + 0.114 * px.data[i + 2]);
            px.data[i] = px.data[i + 1] = px.data[i + 2] = g;
        }
        ctx.putImageData(px, 0, 0);
        return { data: canvas.toDataURL('image/png'), w, h };
    } catch (e) { return null; }   // cross-site image that can't be read
}

// ------------------------------------------------------------------ map

function project(lat, lng, z) {
    const s = 256 * 2 ** z;
    const sin = Math.sin(lat * Math.PI / 180);
    return { x: (lng + 180) / 360 * s, y: (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * s };
}

/**
 * Route map as a JPEG: OpenStreetMap tiles, the driving route, numbered pins.
 * Falls back to a plain background when tiles can't load, so the map page always has the route.
 */
async function mapImage(points, route, wPt, hPt) {
    const scale = 2.4;
    const W = Math.round(wPt * scale), H = Math.round(hPt * scale);
    const all = [...points, ...route.map(([lat, lng]) => ({ lat, lng }))].filter(p => p.lat != null && p.lng != null);
    if (!all.length) return null;
    const pad = 70;
    let z = 16;
    for (; z > 3; z--) {
        const ps = all.map(p => project(p.lat, p.lng, z));
        const w = Math.max(...ps.map(p => p.x)) - Math.min(...ps.map(p => p.x));
        const h = Math.max(...ps.map(p => p.y)) - Math.min(...ps.map(p => p.y));
        if (w <= W - 2 * pad && h <= H - 2 * pad) break;
    }
    const ps = all.map(p => project(p.lat, p.lng, z));
    const cx = (Math.max(...ps.map(p => p.x)) + Math.min(...ps.map(p => p.x))) / 2;
    const cy = (Math.max(...ps.map(p => p.y)) + Math.min(...ps.map(p => p.y))) / 2;
    const ox = cx - W / 2, oy = cy - H / 2;
    const toPx = (lat, lng) => { const p = project(lat, lng, z); return { x: p.x - ox, y: p.y - oy }; };

    const draw = async withTiles => {
        const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#eef0ea';
        ctx.fillRect(0, 0, W, H);
        if (withTiles) {
            const n = 2 ** z;
            const jobs = [];
            for (let tx = Math.floor(ox / 256); tx <= Math.floor((ox + W) / 256); tx++) {
                for (let ty = Math.floor(oy / 256); ty <= Math.floor((oy + H) / 256); ty++) {
                    if (ty < 0 || ty >= n) continue;
                    const wx = ((tx % n) + n) % n;
                    jobs.push(loadImage(`https://tile.openstreetmap.org/${z}/${wx}/${ty}.png`, 8000)
                        .then(img => { if (img) ctx.drawImage(img, tx * 256 - ox, ty * 256 - oy, 256, 256); }));
                }
            }
            await Promise.all(jobs);
            // Light gray basemap: in black-and-white print a full-color map turns into a dark blur, so
            // the tiles become pale gray and the route and pins carry the page.
            const px = ctx.getImageData(0, 0, W, H);
            for (let i = 0; i < px.data.length; i += 4) {
                const g = 0.299 * px.data[i] + 0.587 * px.data[i + 1] + 0.114 * px.data[i + 2];
                px.data[i] = px.data[i + 1] = px.data[i + 2] = Math.round(255 - (255 - g) * 0.42);
            }
            ctx.putImageData(px, 0, 0);
        }
        // Route line (road geometry when the planner has it, otherwise straight legs).
        const line = route.length > 1 ? route.map(([lat, lng]) => toPx(lat, lng)) : points.filter(p => p.lat != null).map(p => toPx(p.lat, p.lng));
        if (line.length > 1) {
            ctx.lineJoin = 'round'; ctx.lineCap = 'round';
            ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 13;
            ctx.beginPath(); line.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
            ctx.strokeStyle = '#1c1e22'; ctx.lineWidth = 6;
            ctx.beginPath(); line.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
        }
        // Pins: start as a dark square, stops as numbered gold circles.
        points.forEach(p => {
            if (p.lat == null) return;
            const { x, y } = toPx(p.lat, p.lng);
            ctx.lineWidth = 4; ctx.strokeStyle = '#ffffff';
            if (p.label === 'S') {
                ctx.fillStyle = '#1f2328';
                ctx.fillRect(x - 22, y - 22, 44, 44); ctx.strokeRect(x - 22, y - 22, 44, 44);
            } else {
                // Confirmed: solid black. Requested: white with a black ring, so it reads without color.
                ctx.fillStyle = p.requested ? '#ffffff' : '#1c1e22';
                ctx.beginPath(); ctx.arc(x, y, 25, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                if (p.requested) { ctx.lineWidth = 5; ctx.strokeStyle = '#1c1e22'; ctx.beginPath(); ctx.arc(x, y, 22, 0, Math.PI * 2); ctx.stroke(); }
            }
            ctx.fillStyle = p.requested && p.label !== 'S' ? '#1c1e22' : '#ffffff';
            ctx.font = 'bold 26px Helvetica, Arial, sans-serif';
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(p.label, x, y + 1);
        });
        return canvas.toDataURL('image/jpeg', 0.86);
    };
    try { return { data: await draw(true), tiles: true }; }
    catch (e) { return { data: await draw(false), tiles: false }; }   // tainted canvas: no tiles
}

// ------------------------------------------------------------------ pages

function footer(s, info, pageNo, total, label, agent = {}) {
    s.stroke(C.rule, 0.5).line(M, FOOT_Y - 9, PAGE_W - M, FOOT_Y - 9);
    s.one(`${info.clientName} \u00b7 ${info.dateShort || 'Tour date not set'}`, M, FOOT_Y, 150, 7.2, 'normal', C.muted);
    s.one(label, M + 150, FOOT_Y, 200, 7.2, 'bold', C.muted, 'center');
    const who = [agent.name, agent.phone].filter(Boolean).join(' \u00b7 ');
    s.one(`${who ? who + '   ' : ''}Page ${pageNo} of ${total}`, M + 350, FOOT_Y, CW - 350, 7.2, 'normal', C.muted, 'right');
}

function coverPage(s, P) {
    const { client, agent, stops, info } = P;
    // Header: logo + title on the left, the agent (headshot, name, contact) on the right.
    const brand = P.brand || {};
    s.stroke(C.rule, 0.6).rect(M, M, CW, 92, 'S', 6);
    let lx = M + 16;
    if (brand.logo) {
        const lh = 40, lw = Math.min(150, lh * brand.logo.w / brand.logo.h);
        const lhh = lw * brand.logo.h / brand.logo.w;
        try { s.doc.addImage(brand.logo.data, 'PNG', lx, M + 14 + (lh - lhh) / 2, lw, lhh, undefined, 'FAST'); } catch (e) { /* skip */ }
        lx += lw + 14;
        s.stroke(C.rule, 0.6).line(lx - 7, M + 14, lx - 7, M + 78);
    }
    const tw = M + CW - 230 - lx;
    s.one('SHOWING TOUR', lx, M + 24, tw, 8.5, 'bold', C.gold);
    s.one(client.name, lx, M + 54, tw, 24, 'displayBold');
    s.one(info.dateLong || 'Tour date not set', lx, M + 74, tw, 11, 'display', C.muted);
    const hs = 58;
    const hasPhoto = Boolean(brand.headshot);
    const ax = M + CW - 16 - (hasPhoto ? hs + 12 : 0) - 200;
    if (hasPhoto) {
        try { s.doc.addImage(brand.headshot.data, 'PNG', M + CW - 16 - hs, M + 17, hs, hs, undefined, 'FAST'); } catch (e) { /* skip */ }
    }
    s.one('YOUR AGENT', ax, M + 26, 200, 7.5, 'bold', C.gold, 'right');
    s.one(agent.name, ax, M + 43, 200, 13, 'displayBold', C.ink, 'right');
    s.one(agent.brokerage, ax, M + 56, 200, 8.3, 'normal', C.muted, 'right');
    s.one(agent.phone, ax, M + 67, 200, 8.3, 'normal', C.ink, 'right');
    s.one(agent.email, ax, M + 78, 200, 8.3, 'normal', C.muted, 'right');

    // Client + summary cards
    let y = M + 108;
    const half = (CW - 12) / 2;
    s.stroke(C.rule).rect(M, y, half, 96, 'S', 5).rect(M + half + 12, y, half, 96, 'S', 5);
    let cy = s.title('Client', M + 12, y + 8, half - 24);
    s.fact('Phone', client.phone, M + 12, cy, (half - 24) / 2);
    s.fact('Email', client.email, M + 12 + (half - 24) / 2, cy, (half - 24) / 2);
    s.fact('Stage', client.stage ? client.stage[0].toUpperCase() + client.stage.slice(1) : '', M + 12, cy + 30, (half - 24) / 2);
    s.fact('Timeline', client.timeline, M + 12 + (half - 24) / 2, cy + 30, (half - 24) / 2);

    const sx = M + half + 24, sw = half - 24;
    cy = s.title('Tour at a glance', sx, y + 8, sw);
    s.fact('Starts from', info.startAddress, sx, cy, sw);
    const third = sw / 3;
    s.fact('Departs', info.departs, sx, cy + 30, third);
    s.fact('Homes', `${stops.length}${info.requested ? ` (${info.requested} req.)` : ''}`, sx + third, cy + 30, third);
    s.fact('Driving', info.driving, sx + 2 * third, cy + 30, third);

    // Itinerary table
    y += 110;
    y = s.title(`Itinerary${info.backBy ? ` · back by ${info.backBy}` : ''}`, M, y, CW);
    const buyer = P.copy === 'buyer';
    const cols = buyer
        ? [{ k: '#', w: 22 }, { k: 'Time', w: 110 }, { k: 'Home', w: CW - 22 - 110 - 80 - 110 }, { k: 'Price', w: 80 }, { k: 'Bd / Ba / Sq ft', w: 110 }, { k: '', w: 0 }]
        : [{ k: '#', w: 22 }, { k: 'Time', w: 92 }, { k: 'Home', w: 196 }, { k: 'Price', w: 66 }, { k: 'Bd / Ba / Sq ft', w: 84 }, { k: 'Access', w: CW - 22 - 92 - 196 - 66 - 84 }];
    let x = M;
    s.stroke(C.ink, 0.7).line(M, y + 15, M + CW, y + 15);
    cols.forEach(c => { if (c.w > 0) s.one(c.k, x + 4, y + 10.5, c.w - 6, 7, 'bold', C.muted); x += c.w; });
    y += 15;
    const bottom = FOOT_Y - 30;
    const n = Math.max(1, stops.length);
    const rowH = Math.max(15, Math.min(34, (bottom - y) / n));
    const two = rowH >= 26;
    stops.forEach((st, i) => {
        const h = st.home;
        const ry = y + i * rowH;
        const base = ry + (two ? 12 : rowH / 2 + 3);
        let cx = M;
        s.one(String(i + 1), cx + 4, base, cols[0].w - 6, 9, 'bold', C.gold); cx += cols[0].w;
        s.one(st.window, cx + 4, base, cols[1].w - 6, 8.5); cx += cols[1].w;
        s.one(h.address, cx + 4, base, cols[2].w - 6, 9, 'bold');
        if (two) s.one(`${h.city || ''}${h.zip ? ' ' + h.zip : ''}${st.requested ? ' · REQUESTED' : ''}`, cx + 4, base + 11, cols[2].w - 6, 7.5, st.requested ? 'bold' : 'normal', st.requested ? C.ink : C.muted);
        cx += cols[2].w;
        s.one(money(h.price), cx + 4, base, cols[3].w - 6, 8.5); cx += cols[3].w;
        s.one([h.beds ?? '-', h.baths ?? '-', num(h.sqft_finished) || '-'].join(' / '), cx + 4, base, cols[4].w - 6, 8.5); cx += cols[4].w;
        if (!buyer && two) s.box(h.access_notes || '', cx + 4, ry + 3, cols[5].w - 6, rowH - 5, 7.2, 'normal', C.muted, 8.6);
        else if (!buyer) s.one(h.access_notes || '', cx + 4, base, cols[5].w - 6, 7.2, 'normal', C.muted);
        s.stroke(C.rule, 0.4).line(M, ry + rowH, M + CW, ry + rowH);
    });
    const after = y + stops.length * rowH + 14;
    if (bottom - after > 70) {
        const ny = s.title('Notes for the day', M, after, CW);
        s.ruled(M, ny - 4, CW, bottom - ny, 20);
    }
    s.one('Print double-sided, flip on long edge, at 100% (actual size). Each home is one sheet: front and back.',
        M, bottom + 18, CW, 7.5, 'normal', C.muted, 'center');
}

/**
 * Map height for the route page: the itinerary table below it gets at least 20pt per row (start,
 * every stop, and the return), and the map takes the rest, between 220 and 400pt. Used both to
 * render the map image and to place it, so the image is never stretched.
 */
function routeMapHeight(stopCount, loopBack) {
    const rows = stopCount + 1 + (loopBack ? 1 : 0);
    const fixed = (M + 20) + 18 + 20 + 14 + 18;   // title, attribution, table title, header, footer gap
    return Math.max(220, Math.min(400, FOOT_Y - fixed - rows * 20));
}

function mapPage(s, P) {
    const { stops, info } = P;
    let y = s.title('Route overview', M, M, CW);
    
    // Balanced map height leaving ample space for the full driving itinerary
    const mapH = routeMapHeight(stops.length, Boolean(info.returnLeg));
    if (P.map?.data) s.image(P.map.data, M, y, CW, mapH);
    else s.placeholder(M, y, CW, mapH, 'Map unavailable: the homes or start point have no map location.');
    s.stroke(C.rule).rect(M, y, CW, mapH);
    s.one(P.map?.tiles ? 'Map data © OpenStreetMap contributors' : '', M, y + mapH + 9, CW, 6.5, 'normal', C.muted, 'right');
    y += mapH + 18;

    // Driving itinerary header
    y = s.title(`Driving itinerary · ${info.driving || 'times estimated'}`, M, y, CW);

    const qrW = 92;
    const tableW = CW - qrW - 14;

    // Table header
    const cols = [
        { k: 'Stop', w: 34 },
        { k: 'Destination & Address', w: tableW - 34 - 110 - 105 },
        { k: 'Showing Time', w: 110 },
        { k: 'Drive Leg', w: 105 },
    ];
    s.stroke(C.ink, 0.7).line(M, y + 14, M + tableW, y + 14);
    let hx = M;
    cols.forEach(c => { s.one(c.k, hx + 4, y + 10, c.w - 6, 7, 'bold', C.muted); hx += c.w; });
    const tableTop = y + 14;

    const allLegs = [];
    allLegs.push({
        num: 'Start',
        address: info.startAddress || 'Start location',
        cityZip: '',
        window: info.departs ? `Departs ${info.departs}` : 'Departure point',
        leg: 'Starting point',
        requested: false,
    });

    stops.forEach((st, i) => {
        allLegs.push({
            num: String(i + 1),
            address: st.home.address,
            cityZip: [st.home.city, st.home.zip].filter(Boolean).join(' '),
            window: st.window || 'Not scheduled',
            leg: st.leg || (i === 0 ? 'From start location' : 'Drive info pending'),
            requested: st.requested,
        });
    });

    if (info.returnLeg) {
        allLegs.push({
            num: 'End',
            address: `Return to: ${info.startAddress || 'Start location'}`,
            cityZip: '',
            window: info.backBy ? `Back by ${info.backBy}` : 'Tour completed',
            leg: info.returnLeg,
            requested: false,
        });
    }

    const tableBottom = FOOT_Y - 18;
    const availableH = tableBottom - tableTop;
    // Rows shrink to fit (single-line under 24pt), so a long tour never runs past the page.
    const rowH = Math.min(32, availableH / allLegs.length);
    const isSpacious = rowH >= 24;

    allLegs.forEach((lg, i) => {
        const ry = tableTop + i * rowH;
        const isSpecial = lg.num === 'Start' || lg.num === 'End';

        let cx = M;
        // Stop number badge/label
        s.one(lg.num, cx + 4, ry + (isSpacious ? 11 : rowH / 2 + 3), cols[0].w - 6, isSpecial ? 7.5 : 8.5, 'bold', isSpecial ? C.muted : C.gold);
        cx += cols[0].w;

        // Destination address + City/Zip
        s.one(lg.address, cx + 4, ry + (isSpacious ? 11 : rowH / 2 + 3), cols[1].w - 6, isSpacious ? 8.5 : 8, 'bold');
        if (isSpacious && lg.cityZip) {
            s.one(lg.cityZip, cx + 4, ry + 21, cols[1].w - 6, 7.2, 'normal', C.muted);
        }
        cx += cols[1].w;

        // Scheduled window
        s.one(lg.window, cx + 4, ry + (isSpacious ? 11 : rowH / 2 + 3), cols[2].w - 6, 7.8, lg.requested ? 'bold' : 'normal', lg.requested ? C.amber : C.ink);
        if (isSpacious && lg.requested) {
            s.one('Requested (unconfirmed)', cx + 4, ry + 21, cols[2].w - 6, 6.8, 'bold', C.amber);
        }
        cx += cols[2].w;

        // Leg distance & drive time
        s.one(lg.leg, cx + 4, ry + (isSpacious ? 11 : rowH / 2 + 3), cols[3].w - 6, 7.6, 'normal', C.ink);
        s.stroke(C.rule, 0.4).line(M, ry + rowH, M + tableW, ry + rowH);
    });

    // Navigation QR Card on the right
    const qx = M + tableW + 14;
    const qy = y;
    const qh = tableBottom - qy;
    s.stroke(C.rule).rect(qx, qy, qrW, qh, 'S', 4);
    s.one('NAVIGATION', qx + 6, qy + 13, qrW - 12, 7.5, 'bold', C.gold, 'center');
    if (P.routeUrl && s.qr(P.routeUrl, qx + (qrW - 70) / 2, qy + 22, 70)) {
        s.box('Scan for turn-by-turn driving route in Google Maps', qx + 4, qy + 100, qrW - 8, qh - 106, 7, 'normal', C.muted, 8.6);
    } else {
        s.box('Multi-stop driving directions via Google Maps', qx + 4, qy + 36, qrW - 8, 48, 7.2, 'normal', C.muted, 8.8);
    }
}

function briefPage(s, P) {
    const { client, brief, stops, payment } = P;
    const first = firstName(client.name);
    let y = s.title(`What ${first} is looking for`, M, M, CW);
    const colW = (CW - 24) / 3;
    const boxH = 196;
    [['Must have', brief.must, 'pass'], ['Nice to have', brief.prefer, 'partial'], ['Deal-breakers', brief.avoid, 'miss']].forEach(([label, items, mk], i) => {
        const col = C.ink;
        const x = M + i * (colW + 12);
        s.stroke(C.rule).rect(x, y, colW, boxH, 'S', 5);
        s.mark(mk, x + 10, y + 11, 7);
        s.one(label, x + 22, y + 18, colW - 32, 10, 'bold', col);
        let yy = y + 28;
        const list = (items || []).length ? items : ['Nothing set in the brief'];
        for (const it of list) {
            const room = y + boxH - 8 - yy;
            if (room < 11) break;
            s.dot(x + 10, yy + 4, (items || []).length ? C.ink : C.gray, 1.6);
            yy += s.box(it, x + 18, yy, colW - 28, room, 8.5, 'normal', C.ink, 10.6) + 3;
        }
    });
    y += boxH + 8;
    if (payment) {
        s.box(`Monthly estimates in this packet: ${payment.rate_pct.toFixed(2)}% 30-year fixed${payment.from_brief ? ' (from the brief)' : ` (Freddie Mac weekly average${payment.rate_date ? ', ' + shortDate(payment.rate_date) : ''})`}, ${payment.down_pct}% down, plus property tax and HOA. Insurance not included.`,
            M, y, CW, 24, 7.8, 'normal', C.muted, 9.6);
    }
    y += 30;

    // Client questions and notes, by stop
    y = s.title(`Questions & notes from ${first}`, M, y, CW);
    const qa = stops.map((st, i) => ({ i, h: st.home })).filter(({ h }) => h.client?.question || h.client?.notes);
    const qNeed = qa.reduce((n, { h }) => n + Math.min(40, 4 + s.measure([h.client.question, h.client.notes].join('   '), CW - 196, 8.2, 10)), 0);
    const qBottom = y + Math.max(20, Math.min(200, qNeed + 6));
    if (!qa.length) {
        s.box(`${first} hasn't left questions or notes on these homes.`, M, y, CW, 14, 8.5, 'normal', C.muted);
    } else {
        let yy = y;
        for (const { i, h } of qa) {
            if (qBottom - yy < 12) break;
            s.one(`${i + 1}. ${h.address}`, M, yy + 9, 190, 8.5, 'bold');
            const txt = [h.client.question ? `Question: ${h.client.question}` : '', h.client.notes ? `Notes: ${h.client.notes}` : ''].filter(Boolean).join('   ');
            yy += Math.max(12, s.box(txt, M + 196, yy, CW - 196, Math.min(36, qBottom - yy), 8.2, 'normal', C.ink, 10)) + 4;
        }
    }
    y = qBottom + 8;

    // Bring-along and day-of checklists
    const buyerList = [
        'Your must-haves and deal-breakers (above)', 'Phone for photos (ask before taking video)',
        'Tape measure for furniture and garage fit', 'Check water pressure, outlets and cell signal',
        'Open closets, cabinets and the electrical panel', 'Notice smells, stains, cracks and uneven floors',
        'Stand in the yard: noise, privacy, sun direction', 'Drive the street: traffic, parking, neighbors',
        'Questions for your agent as they come up', 'Rate each home right after you leave it',
    ];
    y = s.title(P.copy === 'buyer' ? 'Bring along & look for' : 'Before you go', M, y, CW);
    const items = P.copy === 'buyer' ? buyerList : [
        'Confirm every showing with the listing agents', 'Recheck each listing is still active the morning of',
        'Lockbox / showing app working, phone charged', `${first}'s pre-approval letter (and a few spare copies)`,
        'This packet + a clipboard and pens', 'Tape measure and a flashlight for basements/crawl spaces',
        'Shoe covers, water, and snacks for longer tours', 'Business cards; offer and disclosure forms on hand',
        'Comparable sales for the homes most likely to get an offer', 'Note any homes with pets or special entry rules',
    ];
    const half = (CW - 16) / 2;
    const rh = Math.min(18, (FOOT_Y - 24 - y) / Math.ceil(items.length / 2));
    items.forEach((it, i) => s.checkbox(M + (i % 2) * (half + 16), y + Math.floor(i / 2) * rh, it, 8.3, half));
    y += Math.ceil(items.length / 2) * rh + 12;
    if (FOOT_Y - 24 - y > 60) {
        y = s.title('Notes for the day', M, y, CW);
        s.ruled(M, y - 4, CW, FOOT_Y - 24 - y, 20);
    }
}

/** Listing agent's contact for a home, from the captured MLS fields (agent copy only). */
function listingContact(h) {
    for (const fields of Object.values(h.details || {})) {
        for (const [label, value] of Object.entries(fields || {})) {
            if (/attribution contact|list(ing)? agent|list agent (direct )?phone|list agent email/i.test(label) && String(value).trim()) {
                return String(value).split(/\s*[,;]\s*/).filter(Boolean).join(' · ');
            }
        }
    }
    return '';
}

/**
 * Agent copy, back of sheet 2: one list for the day. Every stop in order with its time, when to
 * call ahead (as you leave the previous stop), the listing agent's contact, access notes, and boxes
 * to tick as each showing is confirmed and done.
 */
function callSheetPage(s, P) {
    const { stops, info } = P;
    let y = s.title(`Call sheet · ${info.dateLong || 'tour date not set'}`, M, M, CW);
    s.box('Call ahead as you leave the previous stop. Tick "Conf." once the listing agent confirms and "Done" after the showing.',
        M, y - 4, CW, 12, 7.4, 'normal', C.muted, 9);
    y += 12;
    const cols = [
        { k: '#', w: 18 }, { k: 'Showing', w: 82 }, { k: 'Call by', w: 50 }, { k: 'Home', w: 132 },
        { k: 'Listing agent', w: 120 }, { k: 'Access', w: CW - 18 - 82 - 50 - 132 - 120 - 56 }, { k: 'Conf. / Done', w: 56 },
    ];
    let x = M;
    cols.forEach(c => { s.one(c.k, x + 3, y + 10, c.w - 4, 7, 'bold', C.muted); x += c.w; });
    s.stroke(C.ink, 0.7).line(M, y + 14, M + CW, y + 14);
    y += 14;
    const bottom = FOOT_Y - 100;   // leave room for day notes
    const rowH = Math.max(16, Math.min(40, (bottom - y) / Math.max(1, stops.length)));
    const roomy = rowH >= 26;
    stops.forEach((st, i) => {
        const h = st.home;
        const ry = y + i * rowH;
        const base = ry + (roomy ? 11 : rowH / 2 + 3);
        let cx = M;
        s.one(String(i + 1), cx + 3, base, cols[0].w - 4, 8.6, 'bold'); cx += cols[0].w;
        s.one(st.window || 'Not scheduled', cx + 3, base, cols[1].w - 4, 7.6, st.requested ? 'bold' : 'normal');
        if (roomy && st.requested) s.one('REQUESTED', cx + 3, base + 10, cols[1].w - 4, 6.6, 'bold');
        cx += cols[1].w;
        s.one(i === 0 ? 'At start' : `Leaving #${i}`, cx + 3, base, cols[2].w - 4, 7.2, 'normal', C.muted); cx += cols[2].w;
        s.one(h.address, cx + 3, base, cols[3].w - 4, 8, 'bold');
        if (roomy) s.one(`${h.city || ''} ${h.zip || ''}`, cx + 3, base + 10, cols[3].w - 4, 7, 'normal', C.muted);
        cx += cols[3].w;
        const contact = listingContact(h);
        if (roomy) s.box(contact || 'Not captured', cx + 3, ry + 2, cols[4].w - 6, rowH - 4, 7, 'normal', contact ? C.ink : C.muted, 8.4);
        else s.one(contact || 'Not captured', cx + 3, base, cols[4].w - 6, 7, 'normal', contact ? C.ink : C.muted);
        cx += cols[4].w;
        if (roomy) s.box(h.access_notes || '', cx + 3, ry + 2, cols[5].w - 6, rowH - 4, 7, 'normal', C.ink, 8.4);
        else s.one(h.access_notes || '', cx + 3, base, cols[5].w - 6, 7);
        cx += cols[5].w;
        s.stroke(C.ink, 0.7).rect(cx + 8, base - 7.5, 8, 8).rect(cx + 32, base - 7.5, 8, 8);
        s.stroke(C.rule, 0.4).line(M, ry + rowH, M + CW, ry + rowH);
    });
    const ny = y + stops.length * rowH + 16;
    const t = s.title('Day notes', M, ny, CW);
    s.ruled(M, t - 4, CW, FOOT_Y - 20 - t, 16);
}

function scorecardPage(s, P) {
    const { stops, client } = P;
    let y = s.title(`Scorecard · rate each home right after leaving it`, M, M, CW);
    const cols = [
        { k: '#', w: 20 }, { k: 'Home', w: 138 }, { k: 'Overall', w: 66 }, { k: 'Layout', w: 66 },
        { k: 'Condition', w: 66 }, { k: 'Location', w: 66 }, { k: 'Next step', w: CW - 20 - 138 - 4 * 66 },
    ];
    let x = M;
    s.stroke(C.ink, 0.7).line(M, y + 15, M + CW, y + 15);
    cols.forEach(c => { s.one(c.k, x + 4, y + 10.5, c.w - 6, 7, 'bold', C.muted); x += c.w; });
    y += 15;
    const n = Math.max(1, stops.length);
    const tableBottom = Math.min(y + n * 34, FOOT_Y - 150);
    const rh = Math.max(16, Math.min(34, (tableBottom - y) / n));
    const small = rh < 22;
    stops.forEach((st, i) => {
        const ry = y + i * rh;
        let cx = M;
        s.one(String(i + 1), cx + 4, ry + rh / 2 + 3, 14, 9, 'bold', C.gold); cx += cols[0].w;
        s.one(st.home.address, cx + 4, ry + (small ? rh / 2 + 3 : rh / 2 - 1), cols[1].w - 6, small ? 7.8 : 8.5, 'bold');
        if (!small) s.one(money(st.home.price), cx + 4, ry + rh / 2 + 9, cols[1].w - 6, 7.5, 'normal', C.muted);
        cx += cols[1].w;
        const r = small ? 3.4 : 4.2, gap = small ? 10.5 : 11.6;
        for (let k = 0; k < 4; k++) { s.circles(cx + 3, ry + rh / 2 - r, 5, r, gap); cx += 66; }
        const opts = ['Offer', '2nd', 'Pass'];
        let ox = cx + 4;
        const ow = (cols[6].w - 8) / 3;
        opts.forEach(o => { s.stroke(C.ink, 0.6).rect(ox, ry + rh / 2 - 4, 8, 8); s.one(o, ox + 11, ry + rh / 2 + 3, ow - 12, small ? 6.8 : 7.5); ox += ow; });
        s.stroke(C.rule, 0.4).line(M, ry + rh, M + CW, ry + rh);
    });
    y += n * rh + 18;
    const half = (CW - 16) / 2;
    const h = FOOT_Y - 24 - y;
    if (h > 40) {
        s.title(`${firstName(client.name)}'s top picks`, M, y, half);
        ['1.', '2.', '3.'].forEach((l, i) => { s.one(l, M, y + 38 + i * 22, 14, 9, 'bold', C.gold); });
        s.ruled(M + 16, y + 20, half - 16, Math.min(66, h - 24), 22);
        if (h > 140) {
            s.title('Overall impressions', M, y + 100, half);
            s.ruled(M, y + 120, half, h - 124, 20);
        }
        s.title('Follow-ups', M + half + 16, y, half);
        s.ruled(M + half + 16, y + 20, half, h - 24, 20);
    }
}

// Fields the front of the sheet already shows, so the details list doesn't repeat them.
const SHOWN_ON_FRONT = new Set([
    // MLS labels (deep scrape) ...
    'Original List Price', 'List Price', 'Listing Contract Date', 'Property Sub Type', 'Structure Type', 'Levels', 'Year Built',
    'Beds Total', 'Baths Total', 'Living Area (SqFt Fin)', 'Above Grade Fin Area (SqFt)', 'Below Grade (SqFt) Total',
    'Below Grade Finished Area', 'Lot Size Acres', 'Lot Size Square Feet', 'Tax Annual Amount', 'Tax Year', 'Parking Total',
    'Garage Spaces', 'Architectural Style', 'PSF Finished', 'Basement', 'Elementary School', 'Middle Or Junior School', 'High School',
    // ... and the grouped fallback's labels
    'Bedrooms Total', 'Bathrooms Total', 'Bedrooms', 'Bathrooms', 'Lot Size', 'Above Grade Finished', 'Below Grade Total',
    'Below Grade Finished', 'Middle School', 'Assoc Fee / Frequency',
]);
const RENAME = { 'Attribution Contact': 'Listing agent contact', 'Middle Or Junior School': 'Middle school', 'Senior Community YN': 'Senior community' };

function detailValue(h, ...labels) {
    for (const sec of Object.values(h.details || {})) for (const l of labels) if (sec && sec[l]) return sec[l];
    return '';
}

/** "Label: value" wrapped in a column, with the label bold. Returns the lines to draw. */
function kvLines(s, label, value, w, size) {
    s.font(size, 'bold');
    const lw = s.doc.getTextWidth(T(label) + ': ');
    s.font(size, 'normal');
    const words = T(value).split(/\s+/).filter(Boolean);
    const lines = [];
    let cur = '', avail = Math.max(20, w - lw);
    for (const word of words) {
        const tryLine = cur ? cur + ' ' + word : word;
        if (s.doc.getTextWidth(tryLine) <= avail || !cur) {
            cur = tryLine;
            // A single word wider than the line: hard-cut it.
            while (s.doc.getTextWidth(cur) > avail && cur.length > 1) {
                let cut = cur.length - 1;
                while (cut > 1 && s.doc.getTextWidth(cur.slice(0, cut)) > avail) cut--;
                lines.push(cur.slice(0, cut)); cur = cur.slice(cut); avail = w;
            }
        } else { lines.push(cur); cur = word; avail = w; }
    }
    if (cur || !lines.length) lines.push(cur);
    return { lw, lines };
}

/**
 * "What to check at this home": up to 10 short prompts, most useful first.
 *   1. Brief criteria the listing doesn't confirm (e.g. a 6' fence not mentioned in the remarks)
 *   2. Flags in the listing text: as-is, short sale, bank-owned, leased solar, non-conforming
 *      bedrooms, water issues, needed updates, hot tub
 *   3. What's excluded from the sale
 *   4. HOA covenants
 *   5. Age-based checks from the year built (lead/asbestos, aluminum wiring, polybutylene, sewer scope)
 *   6. Colorado basics: radon, and ages of roof / furnace / water heater
 */
function checklistFor(h, st) {
    const out = [];
    const add = t => { if (t && !out.includes(t)) out.push(t); };
    const text = String(h.remarks || '').toLowerCase();
    const detail = (...labels) => String(detailValue(h, ...labels) || '');

    for (const r of (h.fit?.reasons || [])) {
        if (r.result === 'unconfirmed') {
            const what = (String(r.detail || '').match(/"([^"]+)"/g) || []).map(q => q.replace(/"/g, '')).join(', ') || r.criterion;
            add(`${what}: on ${r.mode === 'avoid' ? 'the avoid list' : 'the brief'}, not in the listing`);
        } else if (r.result === 'unknown' && r.mode === 'must') {
            add(`${r.criterion}: must-have, not in the listing data`);
        }
    }
    if (st.requested) add('Showing not confirmed yet: check with your agent');

    if (/\bas[- ]is\b/.test(text)) add('Sold as-is: ask what the seller knows; plan an inspection');
    if (/short sale/.test(text)) add('Short sale: lender approval can take weeks to months');
    if (/bank[- ]owned|\breo\b|foreclos/.test(text) || /real estate owned/i.test(detail('Special Listing Conditions'))) add('Bank-owned: limited disclosures, likely as-is terms');
    if (/solar/.test(text)) add(/leas/.test(text) ? 'Leased solar: get the lease terms and transfer rules' : 'Solar: owned or leased? Ask for bills and payoff');
    if (/non[- ]?conforming/.test(text)) add('Non-conforming bedroom(s): check egress windows');
    if (/water damage|flood|mold|leak/.test(text)) add('Ask about past water, leaks or moisture');
    const fix = text.match(/(?:needs?|would benefit from|could use|ready for)\s+(?:new\s+)?([a-z ,&]{3,40}?)(?:[.,;]|\s+(?:and|to|but)\b)/);
    if (fix) add(`Listing notes updates needed (${fix[1].trim()}): budget for it`);
    else if (/fixer|investor special|needs tlc|tlc\b|major repairs/.test(text)) add('Listed as needing work: budget for repairs');
    if (/hot tub|\bspa\b/.test(text)) add('Hot tub: included and working?');
    if (/well water|private well|domestic well|septic/.test(text)) add('Well or septic: needs its own inspection and testing');

    const excl = String(h.exclusions || detail('Exclusions')).trim();
    if (excl && !/^(none\.?|n\/?a|no)$/i.test(excl)) add(`Not included: ${excl}`);
    if (/^yes/i.test(detail('Restrictions/Covenants?', 'Restriction Covenants'))) add('HOA covenants: check rules on fences, sheds, parking, rentals');

    const yb = Number(h.year_built) || 0;
    if (yb && yb < 1978) add('Built before 1978: lead paint disclosure; look for asbestos materials');
    if (yb >= 1965 && yb <= 1973) add('Ask about aluminum branch wiring (1965-73 homes)');
    if (yb >= 1978 && yb <= 1995) add('Look for gray polybutylene water lines (1978-95 homes)');
    if (yb && new Date().getFullYear() - yb >= 25) add('Older sewer line: consider a sewer scope');
    add(/radon/.test(text) ? 'Radon system mentioned: ask for test results' : 'Radon (common in Colorado): tested or mitigated?');
    add('Ask the ages of roof, furnace, A/C and water heater');
    return out.slice(0, 10);
}

/** Score ring: light full circle with a dark arc proportional to the score (reads in grayscale). */
function scoreRing(s, cx, cy, r, score) {
    s.stroke(C.rule, 3).doc.circle(cx, cy, r, 'S');
    s.stroke(C.ink, 3);
    const end = -Math.PI / 2 + (Math.PI * 2 * Math.max(0, Math.min(100, score)) / 100);
    for (let a = -Math.PI / 2; a < end; a += 0.08) {
        const b = Math.min(end, a + 0.08);
        s.doc.line(cx + r * Math.cos(a), cy + r * Math.sin(a), cx + r * Math.cos(b), cy + r * Math.sin(b));
    }
    s.one(String(score), cx - r, cy + 4, 2 * r, 11, 'bold', C.ink, 'center');
}

/**
 * Buyer copy: everything a buyer needs for one home on a single page. Photo, price, the facts
 * buyers ask about, how it fits their brief, what to check in person, a short description, and
 * room to rate it and write. No access details, no full MLS dump.
 */
function buyerHomePage(s, P, st, idx) {
    const h = st.home;
    const first = firstName(P.client.name);
    // Header
    s.stroke(C.ink, 1).rect(M, M, 86, 17, 'S', 3);
    s.one(`STOP ${idx + 1} OF ${P.stops.length}`, M, M + 12, 86, 8, 'bold', C.ink, 'center');
    s.one(st.window ? `${st.window}${st.requested ? '  ·  REQUESTED, NOT CONFIRMED' : ''}` : '', M + 94, M + 12, 300, 8.6, 'bold');
    let y = M + 22;
    s.one(h.address, M, y + 19, 340, 18, 'displayBold');
    s.one(`${h.city || ''}, ${h.state || 'CO'} ${h.zip || ''}${h.subdivision ? ' · ' + h.subdivision : ''}`, M, y + 32, 340, 9, 'normal', C.muted);
    s.one(money(h.price), PAGE_W - M - 190, y + 19, 190, 18, 'displayBold', C.ink, 'right');
    const dom = daysSince(h.list_date);
    const cut = h.original_price && h.price && h.original_price > h.price ? `Reduced from ${money(h.original_price)}` : '';
    s.one([cut, dom != null ? `${dom} days on market` : ''].filter(Boolean).join(' · '), PAGE_W - M - 190, y + 32, 190, 8, cut ? 'bold' : 'normal', C.ink, 'right');
    y += 42;

    // Photo + fit / monthly
    const pw = 210, ph = 140;
    if (!s.image(st.photos[0], M, y, pw, ph)) s.placeholder(M, y, pw, ph, 'No photo');
    const sx = M + pw + 12, sw = CW - pw - 12;
    let sy = y;
    const fit = h.fit;
    if (fit && fit.score != null) {
        scoreRing(s, sx + 22, sy + 22, 17, fit.score);
        s.one(`HOW IT FITS ${first.toUpperCase()}'S BRIEF`, sx + 48, sy + 12, sw - 48, 7, 'bold', C.muted);
        const reasons = (fit.reasons || []).filter(r => r.criterion !== 'Listing status');
        let ry = sy + 20;
        for (const r of reasons) {
            if (ry > sy + 84) break;
            s.mark(r.result, sx + 48, ry - 1, 5.5);
            s.one(`${r.criterion}: ${r.detail || ''}`, sx + 58, ry + 4.5, sw - 58, 7.4, ['miss', 'dealbreaker'].includes(r.result) ? 'bold' : 'normal');
            ry += 9.4;
        }
        sy += 92;
    }
    if (h.monthly) {
        s.stroke(C.rule, 0.5).line(sx, sy, sx + sw, sy);
        s.one('ESTIMATED MONTHLY', sx, sy + 13, 120, 7, 'bold', C.muted);
        s.one(`${money(h.monthly.total)}/mo`, sx, sy + 30, 130, 14, 'bold');
        s.one(`P&I ${money(h.monthly.pi)} · Tax ${money(h.monthly.tax)} · HOA ${money(h.monthly.hoa)}`, sx + 130, sy + 24, sw - 130, 7.6);
        if (P.payment) s.one(`${P.payment.rate_pct.toFixed(2)}% 30-yr, ${P.payment.down_pct}% down, before insurance`, sx + 130, sy + 34, sw - 130, 6.8, 'normal', C.muted);
    }
    y += ph + 8;

    // The facts buyers ask about
    const baths = [h.baths_full ? `${h.baths_full} full` : '', h.baths_34 ? `${h.baths_34} 3/4` : '', h.baths_half ? `${h.baths_half} half` : ''].filter(Boolean).join(', ');
    const schools = [h.schools?.elementary, h.schools?.middle, h.schools?.high].filter(Boolean).join(' / ')
        || [detailValue(h, 'Elementary School'), detailValue(h, 'Middle Or Junior School'), detailValue(h, 'High School')].filter(Boolean).join(' / ');
    const ppsf = h.price && h.sqft_finished ? Math.round(h.price / h.sqft_finished) : null;
    const facts = [
        ['Beds / baths', [h.beds != null ? `${h.beds} bd` : '', h.baths != null ? `${h.baths} ba${baths ? ` (${baths})` : ''}` : ''].filter(Boolean).join(' · ')],
        ['Finished sq ft', h.sqft_finished ? `${num(h.sqft_finished)}${ppsf ? ` · ${money(ppsf)}/sq ft` : ''}` : ''],
        ['Year built · levels', [h.year_built, h.levels].filter(Boolean).join(' · ')],
        ['Lot', [h.lot_acres ? `${h.lot_acres} ac` : '', h.lot_sqft ? `${num(h.lot_sqft)} sq ft` : ''].filter(Boolean).join(' · ')],
        ['Garage', h.garage_spaces ? `${h.garage_spaces} car` : ''],
        ['Basement', h.basement || detailValue(h, 'Basement')],
        ['HOA · property tax', [h.hoa_fee ? `${money(h.hoa_fee)}/mo` : 'No HOA', h.annual_tax ? `${money(h.annual_tax)}/yr` : ''].filter(Boolean).join(' · ')],
        ['Schools', schools || h.school_district],
        ['Heating · cooling', [detailValue(h, 'Heating'), detailValue(h, 'Cooling')].filter(Boolean).join(' · ')],
        ['Fireplaces', h.fireplaces || detailValue(h, 'Fireplaces')],
        ['Fencing', detailValue(h, 'Fencing')],
        ['Style', h.style || detailValue(h, 'Architectural Style')],
    ].filter(([, v]) => v && String(v).trim());
    y = s.title('The home', M, y, CW);
    const fw = CW / 4;
    facts.forEach(([l, v], i) => s.fact(l, String(v), M + (i % 4) * fw, y - 2 + Math.floor(i / 4) * 23, fw - 8));
    y += Math.ceil(facts.length / 4) * 23 + 4;

    // What to check in person
    const checks = checklistFor(h, st).slice(0, 8);
    if (checks.length) {
        y = s.title('What to check', M, y, CW);
        const colW = (CW - 16) / 2, rows = Math.ceil(checks.length / 2);
        checks.forEach((c, i) => s.checkbox(M + (i >= rows ? colW + 16 : 0), y - 2 + (i % rows) * 12.5, c, 7.6, colW));
        y += rows * 12.5 + 4;
    }

    // A short description
    // The full description, using everything except what the notes section needs (ratings, choices,
    // and at least 4 writing lines). Long descriptions step down to a smaller size before anything is cut.
    if (h.remarks) {
        y = s.title('About this home', M, y, CW);
        const text = String(h.remarks).replace(/\s*\n\s*/g, ' ').trim();
        const room = FOOT_Y - 18 - (y - 4) - (22 + 30 + 14 + 4 * 15) - 62;
        const [size, lh] = s.measure(text, CW, 7.8, 9.8) <= room ? [7.8, 9.8] : (s.measure(text, CW, 7.2, 8.9) <= room ? [7.2, 8.9] : [6.8, 8.3]);
        y += s.box(text, M, y - 4, CW, room, size, 'normal', C.ink, lh) + 2;
    }

    // Two QR codes: directions (buyers often meet the agent at the house) and this home in Dibs,
    // to rate it and add notes from their phone before they leave.
    const qs = 50;
    const dibsUrl = `${window.location.origin}${window.location.pathname.replace(/[^/]*$/, '')}?results=${encodeURIComponent(h.mls_id)}`;
    const qrItems = [
        [directionsUrl(fullAddress(h)), 'Directions', 'Scan for turn-by-turn directions to this home.'],
        [dibsUrl, 'Rate it in Dibs', 'Scan to enter these ratings and notes in Dibs (Tour Results), so your agent sees them right away.'],
    ];
    const half = (CW - 20) / 2;
    let drew = false;
    qrItems.forEach(([url, head, text], i) => {
        const x = M + i * (half + 20);
        if (s.qr(url, x, y + 4, qs)) {
            drew = true;
            s.one(head, x + qs + 10, y + 16, half - qs - 10, 9, 'bold');
            s.box(text, x + qs + 10, y + 20, half - qs - 10, 30, 7.6, 'normal', C.muted, 9.2);
        }
    });
    if (drew) y += qs + 10;

    // Rate it and take notes (whatever room is left)
    y = s.title('Your notes', M, y + 2, CW);
    const ratings = ['Overall', 'Layout & flow', 'Condition', 'Location & street', 'Value for price', 'Would live here'];
    const third = CW / 3;
    ratings.forEach((r, i) => {
        const x = M + (i % 3) * third, yy = y + Math.floor(i / 3) * 14;
        s.one(r, x, yy + 7.5, 80, 7.6);
        s.circles(x + 84, yy, 5, 4, 11);
    });
    y += 30;
    ['Love it', 'See it again', 'Pass'].forEach((o, i) => s.checkbox(M + i * (CW / 3), y, o, 8, CW / 3));
    y += 14;
    const lines = FOOT_Y - 18 - y;
    if (lines > 14) s.ruled(M, y, CW, lines, 15);
}

/** Back of a buyer sheet when the tour has an odd number of homes. */
function notesPage(s, P) {
    let y = s.title('Notes', M, M, CW);
    s.ruled(M, y, CW, FOOT_Y - 18 - y, 18);
}

function homeFront(s, P, st, idx) {
    const h = st.home;
    const total = P.stops.length;
    // Top line
    s.stroke(C.ink, 1).rect(M, M, 92, 18, 'S', 3);
    s.one(`STOP ${idx + 1} OF ${total}`, M, M + 12.5, 92, 8.5, 'bold', C.ink, 'center');
    s.one(st.window || '', M + 100, M + 13, 200, 9.5, 'bold');
    if (st.requested) s.one('REQUESTED \u00b7 NOT CONFIRMED', M + 290, M + 13, 150, 7.5, 'bold', C.ink);
    s.one(`MLS #${h.mls_id}`, PAGE_W - M - 150, M + 13, 150, 8.5, 'normal', C.muted, 'right');

    // Address + price
    let y = M + 24;
    s.one(h.address, M, y + 20, 350, 19, 'displayBold');
    s.one(`${h.city || ''}, ${h.state || 'CO'} ${h.zip || ''}${h.subdivision ? ' · ' + h.subdivision : ''}`, M, y + 34, 350, 9.5, 'normal', C.muted);
    s.one(money(h.price), PAGE_W - M - 180, y + 20, 180, 19, 'displayBold', C.ink, 'right');
    const dom = daysSince(h.list_date);
    const cut = h.original_price && h.price && h.original_price > h.price
        ? `Reduced from ${money(h.original_price)} (-${((1 - h.price / h.original_price) * 100).toFixed(1)}%)` : '';
    s.one(cut || 'Original list price', PAGE_W - M - 180, y + 32, 180, 8, cut ? 'bold' : 'normal', cut ? C.green : C.muted, 'right');
    s.one([h.status, dom != null ? `${dom} days on market` : ''].filter(Boolean).join(' · '), PAGE_W - M - 180, y + 43, 180, 8, 'normal', C.muted, 'right');

    // Photo + side panel (fit, monthly cost, value)
    y += 52;
    const pw = 236, ph = 160;
    if (!s.image(st.photos[0], M, y, pw, ph)) s.placeholder(M, y, pw, ph, 'No photo');
    const sx = M + pw + 12, sw = CW - pw - 12;
    const fit = h.fit;
    const ppsf = h.price && h.sqft_finished ? Math.round(h.price / h.sqft_finished) : null;
    // Only the boxes that have something to say; they share the photo's height.
    const panels = [];
    if (fit && fit.score != null) panels.push((by, bh) => {
        const r = Math.min(17, bh / 2 - 5), cx = sx + 8 + r, cy = by + bh / 2;
        s.stroke(C.rule, 3).doc.circle(cx, cy, r, 'S');
        // Arc for the score, drawn as short segments (prints as a solid dark ring proportional to the score).
        s.stroke(C.ink, 3);
        const end = -Math.PI / 2 + (Math.PI * 2 * Math.max(0, Math.min(100, fit.score)) / 100);
        for (let a = -Math.PI / 2; a < end; a += 0.08) {
            const b = Math.min(end, a + 0.08);
            s.doc.line(cx + r * Math.cos(a), cy + r * Math.sin(a), cx + r * Math.cos(b), cy + r * Math.sin(b));
        }
        s.one(String(fit.score), cx - r, cy + 4, 2 * r, 11, 'bold', C.ink, 'center');
        const tx = sx + 16 + 2 * r;
        s.one('FIT WITH THE BRIEF', tx, by + 15, sw - (tx - sx) - 8, 7, 'bold', C.muted);
        const misses = (fit.reasons || []).filter(x => ['miss', 'dealbreaker'].includes(x.result)).map(x => x.criterion);
        s.box(misses.length ? `Misses: ${misses.join(', ')}` : `${fit.band ? fit.band[0].toUpperCase() + fit.band.slice(1) : ''} match. Details on the back.`, tx, by + 18, sw - (tx - sx) - 8, bh - 22, 8, misses.length ? 'bold' : 'normal', C.ink, 9.4);
    });
    if (h.monthly) panels.push((by, bh) => {
        s.one('ESTIMATED MONTHLY', sx + 10, by + 13, 110, 7, 'bold', C.muted);
        s.one(`${money(h.monthly.total)}/mo`, sx + 10, by + 31, 120, 14, 'bold');
        s.one(`P&I ${money(h.monthly.pi)} \u00b7 Tax ${money(h.monthly.tax)} \u00b7 HOA ${money(h.monthly.hoa)}`, sx + 130, by + 25, sw - 140, 7.8, 'normal', C.ink);
        if (P.payment) s.one(`${P.payment.rate_pct.toFixed(2)}% 30-yr, ${P.payment.down_pct}% down, before insurance`, sx + 130, by + 36, sw - 140, 7, 'normal', C.muted);
    });
    if (h.value_estimate || ppsf) panels.push((by, bh) => {
        s.one('VALUE CHECK', sx + 10, by + 13, 110, 7, 'bold', C.muted);
        if (h.value_estimate) {
            s.one(`${money(h.value_estimate.estimate)} est.`, sx + 10, by + 31, 120, 12, 'bold');
            s.one(`Range ${money(h.value_estimate.low)} - ${money(h.value_estimate.high)} (${shortDate(h.value_estimate.as_of)})`, sx + 130, by + 25, sw - 140, 7.6, 'normal', C.muted);
            if (ppsf) s.one(`${money(ppsf)} per finished sq ft`, sx + 130, by + 36, sw - 140, 7.8);
        } else {
            s.one(`${money(ppsf)} / sq ft`, sx + 10, by + 31, 120, 12, 'bold');
            s.one('Price per finished sq ft', sx + 130, by + 28, sw - 140, 7.6, 'normal', C.muted);
        }
    });
    if (panels.length) {
        const bh = Math.min(64, (ph - 4 * (panels.length - 1)) / panels.length);
        panels.forEach((draw, i) => { const by = y + i * (bh + 4); s.stroke(C.rule).rect(sx, by, sw, bh, 'S', 4); draw(by, bh); });
    }

    // Key facts
    y += ph + 8;
    y = s.title('At a glance', M, y, CW);
    const baths = [h.baths_full ? `${h.baths_full} full` : '', h.baths_34 ? `${h.baths_34} 3/4` : '', h.baths_half ? `${h.baths_half} half` : ''].filter(Boolean).join(', ');
    const schoolLine = [h.schools?.elementary, h.schools?.middle, h.schools?.high].filter(Boolean).join(' / ') || detailValue(h, 'Elementary School', 'Middle Or Junior School', 'High School') || h.school_district;
    const facts = [
        ['Bedrooms', h.beds != null ? `${h.beds} beds` : '—'],
        ['Bathrooms', h.baths != null ? `${h.baths} baths${baths ? ` (${baths})` : ''}` : '—'],
        ['Finished sq ft', h.sqft_finished ? `${num(h.sqft_finished)} sq ft` : '—'],
        ['Above / below grade', h.sqft_above ? `${num(h.sqft_above)} / ${num(h.sqft_below) || 0}${h.sqft_below_finished != null ? ` (${num(h.sqft_below_finished)} fin)` : ''}` : (h.sqft_total ? `${num(h.sqft_total)} total sq ft` : '—')],

        ['Price / sq ft', ppsf ? `${money(ppsf)} / fin sq ft` : '—'],
        ['Lot size', [h.lot_acres ? `${h.lot_acres} ac` : '', h.lot_sqft ? `${num(h.lot_sqft)} sq ft` : ''].filter(Boolean).join(' · ') || '—'],
        ['Year built', h.year_built || '—'],
        ['Architectural style', h.style || detailValue(h, 'Architectural Style') || '—'],

        ['Property type', [h.property_type, h.structure_type].filter(Boolean).join(' / ') || '—'],
        ['Levels', h.levels || '—'],
        ['Garage / parking', [h.garage_spaces ? `${h.garage_spaces} garage` : '', h.parking_total ? `${h.parking_total} total` : ''].filter(Boolean).join(' · ') || '—'],
        ['Basement', h.basement || detailValue(h, 'Basement') || '—'],

        ['HOA fee', h.hoa_fee ? `${money(h.hoa_fee)}/mo` : 'None listed'],
        ['Property tax', h.annual_tax ? `${money(h.annual_tax)}${h.tax_year ? ` (${h.tax_year})` : ''}` : '—'],
        ['Schools (E / M / H)', schoolLine || '—'],
        ['Days on market', dom != null ? `${dom} days · Listed ${shortDate(h.list_date)}` : (h.list_date ? `Listed ${shortDate(h.list_date)}` : '—')],
    ];
    const fw = CW / 4;
    const shown = facts.filter(([, v]) => v != null && String(v).trim() && String(v) !== '\u2014');
    shown.forEach(([l, v], i) => s.fact(l, String(v), M + (i % 4) * fw, y + Math.floor(i / 4) * 24, fw - 8));
    y += Math.ceil(shown.length / 4) * 24 + 4;

    // Room by room (if captured)
    const rooms = Array.isArray(h.rooms) ? h.rooms : [];
    const remarksMin = 75;
    if (rooms.length > 0) {
        y = s.title('Room by room', M, y, CW);
        const cols = [{ k: 'Room', w: 150 }, { k: 'Level', w: 64 }, { k: 'Dimensions', w: 74 }, { k: 'Features & Description', w: CW - 288 }];
        let x = M;
        s.stroke(C.ink, 0.7).line(M, y - 2 + 11, M + CW, y - 2 + 11);
        cols.forEach(c => { s.one(c.k, x + 3, y + 6.5, c.w - 4, 6.8, 'bold', C.muted); x += c.w; });
        y += 11;
        const limit = FOOT_Y - 16 - remarksMin;
        let shown = 0;
        for (const r of rooms) {
            const desc = [r.features, r.desc].filter(Boolean).join(' · ');
            const dh = desc ? Math.min(2, Math.ceil(s.measure(desc, cols[3].w - 4, 7.2, 8.6) / 8.6)) : 1;
            const rh = Math.max(11, dh * 8.6 + 2);
            if (y + rh > limit) break;
            let cx = M;
            s.one(r.type || '', cx + 3, y + 7.5, cols[0].w - 4, 7.4, 'bold'); cx += cols[0].w;
            s.one(r.level || '', cx + 3, y + 7.5, cols[1].w - 4, 7.4); cx += cols[1].w;
            s.one(r.dim || '', cx + 3, y + 7.5, cols[2].w - 4, 7.4); cx += cols[2].w;
            s.box(desc, cx + 3, y - 0.5, cols[3].w - 4, rh, 7.2, 'normal', C.ink, 8.6);
            s.stroke(C.rule, 0.3).line(M, y + rh, M + CW, y + rh);
            y += rh;
            shown++;
        }
        if (shown < rooms.length) s.one(`+ ${rooms.length - shown} more rooms (full list in Dibs)`, M, y + 8, CW, 7, 'normal', C.muted, 'right');
        y += 12;
    }

    // Remarks get whatever room is left
    y = s.title('Listing remarks', M, y, CW);
    const remH = FOOT_Y - 16 - y;
    if (remH > 20) {
        s.box(String(h.remarks || '').replace(/\s*\n\s*/g, ' ').trim() || 'No remarks captured for this listing.', M, y - 3, CW, remH, 8, 'normal', h.remarks ? C.ink : C.muted, 10.2);
    }
}

/**
 * Every captured MLS field not already on the front, section by section, flowed down three
 * columns. Works with any section names (the deep scrape's own MLS sections, or the grouped
 * fallback the server builds for older captures). Anything that doesn't fit is counted, never lost
 * silently.
 */
function detailsBlock(s, h, x, y, w, maxH, buyer = false) {
    const entries = [];
    const sections = h.details && typeof h.details === 'object' ? h.details : {};
    for (const [sec, fields] of Object.entries(sections)) {
        const kv = Object.entries(fields || {}).filter(([l, v]) => !SHOWN_ON_FRONT.has(l) && String(v ?? '').trim()
            && !(buyer && /attribution|list(ing)? ?(agent|office)|co-?list|lockbox|key ?box|supra|showing|access|instructions/i.test(l)));
        if (!kv.length) continue;
        entries.push({ sec });
        kv.forEach(([l, v]) => entries.push({ label: RENAME[l] || l, value: String(v) }));
    }
    if (!entries.length) {
        entries.push({ note: 'Full MLS details for this home appear after its next deep scrape with the updated bookmarklet.' });
    }
    const gap = 12, colW = (w - 2 * gap) / 3, size = 6.8, lh = 8.2, maxLines = 4;
    let col = 0, cy = y, dropped = 0, maxY = y;
    const bottom = y + maxH - 10;   // room for the "+ N more" line
    for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        const cx = x + col * (colW + gap);
        let need, lines = null;
        if (e.sec) need = 13;
        else if (e.note) need = s.measure(e.note, colW, size, lh) + 2;
        else { lines = kvLines(s, e.label, e.value, colW, size); need = Math.min(lines.lines.length, maxLines) * lh + 1.4; }
        const keepWith = e.sec && entries[i + 1] && !entries[i + 1].sec ? 10 : 0;   // never strand a heading
        if (cy + need + keepWith > bottom) {
            if (col < 2) { col++; cy = y; i--; continue; }
            dropped = entries.slice(i).filter(z => z.label).length;
            break;
        }
        if (e.sec) {
            s.one(e.sec.toUpperCase(), cx, cy + 9, colW, 7, 'bold', C.gold);
            s.stroke(C.rule, 0.4).line(cx, cy + 11.5, cx + colW, cy + 11.5);
        } else if (e.note) {
            s.box(e.note, cx, cy, colW, need, size, 'italic', C.muted, lh);
        } else {
            let ls = lines.lines;
            if (ls.length > maxLines) { ls = ls.slice(0, maxLines); ls[maxLines - 1] = ls[maxLines - 1].replace(/.{0,2}$/, '') + '…'; }
            s.font(size, 'bold', C.muted);
            s.doc.text(T(e.label) + ':', cx, cy + size);
            s.font(size, 'normal', C.ink);
            ls.forEach((ln, k) => s.doc.text(ln, k === 0 ? cx + lines.lw : cx, cy + size + k * lh));
        }
        cy += need;
        maxY = Math.max(maxY, cy);
    }
    if (dropped) { s.one(`+ ${dropped} more fields (full listing in Dibs)`, x, y + maxH - 1, w, 7, 'normal', C.muted, 'right'); maxY = y + maxH; }
    return maxY;
}

function homeBack(s, P, st, idx) {
    const h = st.home;
    const first = firstName(P.client.name);
    s.one(`${idx + 1}. ${h.address}`, M, M + 12, 360, 13, 'displayBold');
    s.one(`${h.city || ''} · ${money(h.price)} · MLS #${h.mls_id}`, PAGE_W - M - 220, M + 12, 220, 8.5, 'normal', C.muted, 'right');
    let y = M + 20;

    // Showing box + directions QR
    const reasons = (h.fit?.reasons || []).filter(r => r.criterion !== 'Listing status');
    const lw = reasons.length ? 220 : CW, bandH = 100;
    s.stroke(C.rule).rect(M, y, lw, bandH, 'S', 4);
    let ly = s.title('Showing', M + 8, y + 5, lw - 16);
    s.fact(st.requested ? 'Time \u00b7 requested, not confirmed' : 'Time \u00b7 confirmed', st.window || 'Not scheduled', M + 8, ly - 3, lw - 86);
    ly += 24;
    if (P.copy !== 'buyer') {
        s.one('ACCESS', M + 8, ly + 6, 80, 6.6, 'bold', C.muted);
        s.box(h.access_notes || 'No access notes. Confirm entry with the listing agent.', M + 8, ly + 7, lw - 78, y + bandH - ly - 8, 7.6, 'normal', h.access_notes ? C.ink : C.muted, 9);
    }
    if (s.qr(directionsUrl(fullAddress(h)), M + lw - 64, y + 26, 56)) s.one('Directions', M + lw - 66, y + 90, 60, 6.4, 'normal', C.muted, 'center');

    // Fit details (only when the brief has criteria to compare)
    const rx = M + lw + 10, rw = CW - lw - 10;
    if (reasons.length) s.stroke(C.rule).rect(rx, y, rw, bandH, 'S', 4);
    let ry = reasons.length ? s.title(`How it fits ${first}'s brief`, rx + 8, y + 5, rw - 16) : 0;
    let shownR = 0;
    for (const r of reasons) {
        if (y + bandH - 4 - ry < 9.6) break;
        const [word, col] = RESULT[r.result] || RESULT.unknown;
        s.mark(r.result, rx + 8, ry - 2.5, 6);
        s.one(`${MODE[r.mode] || ''} · ${r.criterion}`, rx + 16, ry + 4, 112, 7.4, 'bold');
        s.one(`${word}: ${r.detail || ''}`, rx + 130, ry + 4, rw - 138, 7.4, ['miss', 'dealbreaker'].includes(r.result) ? 'bold' : 'normal', C.ink);
        ry += 9.6;
        shownR++;
    }
    if (shownR < reasons.length) s.one(`+ ${reasons.length - shownR} more`, rx + 8, y + bandH - 3, rw - 16, 6.6, 'normal', C.muted, 'right');
    y += bandH + 6;

    // Client context, sized to what there is
    const cl = h.client || {};
    const ctx = [];
    if (cl.favorite) ctx.push('Favorited');
    if (cl.rating) ctx.push(`Rated ${cl.rating} of 5`);
    if (cl.toured) ctx.push('Toured before');
    const text = [cl.question ? `Question for you: ${cl.question}` : '', cl.notes ? `Notes: ${cl.notes}` : '', h.private_notes ? `Your private notes: ${h.private_notes}` : ''].filter(Boolean).join('\n');
    if (text || ctx.length) {
        const ctxH = text ? Math.min(56, 22 + s.measure(text, CW - 16, 7.8, 9.4)) : 22;
        s.stroke(C.rule).rect(M, y, CW, ctxH, 'S', 4);
        const cy = s.title(`${first} on this home${ctx.length ? ' \u00b7 ' + ctx.join(' \u00b7 ') : ''}`, M + 8, y + 4, CW - 16);
        if (text) s.box(text, M + 8, cy - 4, CW - 16, y + ctxH - cy, 7.8, 'normal', C.ink, 9.4);
        y += ctxH + 6;
    }

    // What to check in person: brief items the listing doesn't confirm, flags in the listing text,
    // and age-based questions. Two columns of checkboxes.
    const checks = checklistFor(h, st);
    if (checks.length) {
        y = s.title('What to check at this home', M, y, CW);
        const colW = (CW - 16) / 2, rows = Math.ceil(checks.length / 2);
        checks.forEach((c, i) => s.checkbox(M + (i >= rows ? colW + 16 : 0), y - 2 + (i % rows) * 13, c, 7.8, colW));
        y += rows * 13 + 6;
    }

    // Everything else from the MLS - Property Specifications
    const formH = 186;
    y = s.title('MLS details', M, y, CW);
    const usedTo = detailsBlock(s, h, M, y - 2, CW, FOOT_Y - 18 - formH - (y - 2), P.copy === 'buyer');
    // Notes start right after the details, so a short listing leaves more room to write.
    y = Math.min(FOOT_Y - 14 - formH, usedTo + 10);

    agentNotes(s, P, y, FOOT_Y - 18);
}

/** A label followed by a writing line to the right edge of the column. */
function lineField(s, label, x, y, w) {
    s.font(7.4, 'bold', C.muted);
    const lw = s.doc.getTextWidth(T(label)) + 6;
    s.doc.text(T(label), x, y + 8);
    s.stroke(C.rule, 0.6).line(x + lw, y + 9.5, x + w, y + 9.5);
}

/**
 * The agent's notes for one home (agent copy, back of the sheet), in two parts:
 *   What the client thought: her read of their interest, what they said, objections
 *   Your read: condition concerns, pricing, offer range, competition / seller signals
 * then follow-ups. Extra room on short pages goes to "What they said".
 */
function agentNotes(s, P, top, bottom) {
    const first = firstName(P.client.name);
    let y = s.title('Tour notes', M, top, CW);
    const gap = 20, colW = (CW - gap) / 2, rx = M + colW + gap;
    const followH = 40;
    // The two columns are sized to "Your read"; any extra room on the page becomes notes lines
    // under the follow-ups, so the columns stay balanced.
    const colBottom = Math.min(bottom - followH, y + 124);

    // Right column: your read
    let ry = y;
    s.one('YOUR READ', rx, ry + 7, colW, 7.4, 'bold', C.ink);
    ry += 13;
    s.one('Condition concerns', rx, ry + 7, colW, 7.2, 'normal', C.muted);
    ry += 10;
    const third = colW / 3;
    ['Roof', 'HVAC', 'Foundation', 'Water / moisture', 'Windows', 'Electrical'].forEach((c, i) =>
        s.checkbox(rx + (i % 3) * third, ry + Math.floor(i / 3) * 12, c, 7.4, third));
    ry += 27;
    lineField(s, 'Est. repairs $', rx, ry, colW); ry += 16;
    s.one('Pricing', rx, ry + 7, 50, 7.2, 'normal', C.muted);
    ['Overpriced', 'About right', 'Good value'].forEach((c, i) => s.checkbox(rx + 44 + i * ((colW - 44) / 3), ry, c, 7.4, (colW - 44) / 3));
    ry += 15;
    lineField(s, 'Likely offer range $', rx, ry, colW); ry += 16;
    lineField(s, 'Competition / seller signals', rx, ry, colW); ry += 14;
    s.stroke(C.rule, 0.6).line(rx, ry + 9.5, rx + colW, ry + 9.5);

    // Left column: what the client thought (fills the same height as the right column, or more)
    let ly = y;
    s.one(`WHAT ${first.toUpperCase()} THOUGHT`, M, ly + 7, colW, 7.4, 'bold', C.ink);
    ly += 13;
    s.one('Interest (your read)', M, ly + 7, 90, 7.2, 'normal', C.muted);
    s.circles(M + 92, ly, 5, 4, 11);
    s.one('low', M + 152, ly + 7, 20, 6.4, 'normal', C.muted);
    s.one('high', M + 168, ly + 7, 24, 6.4, 'normal', C.muted);
    ly += 15;
    s.one(`What ${first} said`, M, ly + 7, colW, 7.2, 'normal', C.muted);
    const objH = 26;
    const saidH = Math.max(30, colBottom - (ly + 10) - objH);
    s.ruled(M, ly + 4, colW, saidH, 14);
    ly += 10 + saidH;
    lineField(s, 'Objections / deal-breakers', M, ly, colW);
    s.stroke(C.rule, 0.6).line(M, ly + 23, M + colW, ly + 23);

    // Follow-ups, full width
    let fy = Math.max(colBottom, ry + 16) + 4;
    s.stroke(C.rule, 0.5).line(M, fy - 4, M + CW, fy - 4);
    s.one('FOLLOW-UPS', M, fy + 7, 80, 7.4, 'bold', C.ink);
    const items = ['Run comps', 'Request disclosures', 'HOA documents', 'Book second showing', 'Ask about other offers', 'Inspection quote'];
    const w3 = (CW - 80) / 3;
    items.forEach((t, i) => s.checkbox(M + 80 + (i % 3) * w3, fy + Math.floor(i / 3) * 13, t, 7.6, w3));
    const ny = fy + 30;
    if (bottom - ny > 40) {
        const t = s.title('Notes', M, ny, CW);
        s.ruled(M, t - 4, CW, bottom - t + 2, 15);
    }
}

// ------------------------------------------------------------------ assemble

function collectStops(tm, data) {
    const byId = new Map(data.homes.map(h => [String(h.mls_id), h]));
    const sched = new Map((tm.tourData.scheduleMatrix?.orderedStops || []).map(o => [String(o.stopData?.mls_id), o]));
    const stops = [];
    (tm.tourData.stops || []).forEach(s => {
        const home = byId.get(String(s.mls_id));
        if (!home) return;
        const o = sched.get(String(s.mls_id));
        const booked = /^\d{4}-\d{2}-\d{2}[T ](\d{2}):(\d{2})/.exec(home.showing_time || '');
        let window = o ? `${clock(o.arrivalTime)} - ${clock(o.departureTime)}` : '';
        if (booked) {
            const d = new Date(`${home.showing_time.replace(' ', 'T')}`);
            window = `${clock(d)} (booked)`;
        }
        stops.push({
            home, window, requested: home.tour_status === 'pending',
            leg: o ? `${o.legDistanceMiles} mi · ${o.legDriveMins} min` : '',
            photos: [],
        });
    });
    return stops;
}

function infoFor(tm, data, stops) {
    const sm = tm.tourData.scheduleMatrix || {};
    const settings = tm.tourData.settings || {};
    const hasDate = /^\d{4}-\d{2}-\d{2}$/.test(settings.tour_date || '');
    const ordered = sm.orderedStops || [];
    const firstLeg = ordered[0];
    const departs = firstLeg ? new Date(firstLeg.arrivalTime.getTime() - firstLeg.legDriveMins * 60000) : null;
    const mins = sm.totalDriveMins;
    return {
        clientName: data.client.name,
        dateLong: hasDate ? longDate(settings.tour_date) : '',
        dateShort: hasDate ? shortDate(settings.tour_date) : '',
        startAddress: settings.start_address || 'Not set',
        departs: departs ? clock(departs) : (settings.start_time || ''),
        driving: sm.totalDistanceMiles != null ? `${Math.round(sm.totalDistanceMiles)} mi · ${mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins} min`}` : '',
        backBy: sm.returnLeg?.finalReturnTime ? clock(sm.returnLeg.finalReturnTime) : (ordered.length ? clock(ordered[ordered.length - 1].departureTime) : ''),
        returnLeg: sm.returnLeg ? `${sm.returnLeg.legDistanceMiles} mi · ${sm.returnLeg.legDriveMins} min` : '',
        requested: stops.filter(s => s.requested).length,
    };
}

async function buildPacket(opts, progress) {
    const tm = window.tourViewManager;
    if (!tm?.tourData?.isRealtor) throw new Error('Open a client\'s tour in the Tour Planner first.');
    if (!tm.tourData.clientId) throw new Error('Pick a client in the Tour Planner first.');
    await tm.flushAutosave?.();

    progress('Loading the tour…');
    const [data] = await Promise.all([
        (async () => {
            const { apiFetch } = await import('./api.js');
            const res = await apiFetch(`backend/api.php?action=get_tour_packet&client_id=${encodeURIComponent(tm.tourData.clientId)}${opts.copy === 'buyer' ? '&copy=buyer' : (opts.privateNotes ? '&private=1' : '')}`);
            if (!res || !res.success) throw new Error(res?.error || 'Could not load the tour details.');
            return res;
        })(),
        loadLibs(),
        loadFonts(),
    ]);
    const stops = collectStops(tm, data);
    if (!stops.length) throw new Error('This tour has no confirmed or requested homes to print.');
    const info = infoFor(tm, data, stops);
    const settings = tm.tourData.settings || {};

    if (opts.photos) {
        let done = 0;
        const total = stops.reduce((n, st) => n + Math.min(1, st.home.photos.length), 0);
        const queue = [];
        stops.forEach(st => st.home.photos.slice(0, 1).forEach((src, i) => queue.push({ st, src, i })));
        // A few at a time so a long tour doesn't flood the server.
        const worker = async () => {
            while (queue.length) {
                const { st, src, i } = queue.shift();
                st.photos[i] = await photoData(src, 236, 160);
                progress(`Adding photos (${++done} of ${total})…`);
            }
        };
        await Promise.all([worker(), worker(), worker(), worker()]);
    }

    // Agent branding for the cover and footers: headshot cropped to a circle, logo kept in proportion.
    // Both are converted to grayscale here, since the packet is usually printed in black and white.
    progress('Adding your branding…');
    const brand = { headshot: null, logo: null };
    try { if (data.agent.headshot) brand.headshot = await brandImage(data.agent.headshot, 'circle'); } catch (e) { /* skip */ }
    try { if (data.agent.logo) brand.logo = await brandImage(data.agent.logo, 'fit'); } catch (e) { /* skip */ }

    let map = null;
    if (opts.map) {
        progress('Drawing the route map…');
        const points = [];
        if (settings.start_lat != null && settings.start_lng != null) points.push({ lat: Number(settings.start_lat), lng: Number(settings.start_lng), label: 'S' });
        stops.forEach((st, i) => points.push({ lat: st.home.lat, lng: st.home.lng, label: String(i + 1), requested: st.requested }));
        const mapH = routeMapHeight(stops.length, Boolean(tm.tourData.scheduleMatrix?.returnLeg));
        map = await mapImage(points, tm.tourData.scheduleMatrix?.roadGeometry || [], CW, mapH);
    }

    const start = settings.start_address || '';
    const routeUrl = stops.length <= 9 && start
        ? directionsUrl(settings.loop_back ? start : fullAddress(stops[stops.length - 1].home), start,
            (settings.loop_back ? stops : stops.slice(0, -1)).map(st => fullAddress(st.home)))
        : '';

    progress('Laying out pages…');
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'pt', format: 'letter', orientation: 'portrait', compress: true });
    doc.setProperties({ title: `Tour packet - ${data.client.name}`, subject: 'Showing tour', creator: 'Dibs' });
    const s = new Sheet(doc, fontData || []);
    if (!s.fonts) progress('Fonts unavailable; using the standard PDF font…');
    const P = { copy: opts.copy === 'buyer' ? 'buyer' : 'agent', brand, client: data.client, agent: data.agent, brief: data.brief, payment: data.payment_basis, stops, info, map, routeUrl };
    const labels = [];
    const page = (fn, label, first = false) => { if (!first) doc.addPage('letter', 'portrait'); fn(); labels.push(label); };

    page(() => coverPage(s, P), `Sheet 1 \u00b7 front`, true);
    page(() => mapPage(s, P), 'Sheet 1 · back');
    page(() => briefPage(s, P), 'Sheet 2 · front');
    // Buyers compare homes on the scorecard; the agent gets a call sheet for the day instead.
    if (P.copy === 'buyer') page(() => scorecardPage(s, P), 'Sheet 2 · back');
    else page(() => callSheetPage(s, P), 'Sheet 2 · back');
    if (P.copy === 'buyer') {
        // Buyer copy: one page per home, two homes per sheet (front and back), so there's half as
        // much to carry. An odd last home gets a notes page on its back.
        stops.forEach((st, i) => page(() => buyerHomePage(s, P, st, i), `Sheet ${3 + Math.floor(i / 2)} \u00b7 Stop ${i + 1} ${i % 2 ? 'back' : 'front'}`));
        if (stops.length % 2) page(() => notesPage(s, P), `Sheet ${3 + Math.floor(stops.length / 2)} \u00b7 back`);
    } else {
        stops.forEach((st, i) => {
            page(() => homeFront(s, P, st, i), `Sheet ${i + 3} \u00b7 Stop ${i + 1} front`);
            page(() => homeBack(s, P, st, i), `Sheet ${i + 3} \u00b7 Stop ${i + 1} back`);
        });
    }
    // Duplex safety: never end on a front with no back.
    if (doc.getNumberOfPages() % 2) {
        doc.addPage('letter', 'portrait');
        s.one('This page intentionally left blank.', M, PAGE_H / 2, CW, 9, 'normal', C.muted, 'center');
        labels.push('Blank');
    }
    const total = doc.getNumberOfPages();
    const copyLabel = opts.copy === 'buyer' ? 'Buyer copy' : 'Agent copy';
    for (let i = 1; i <= total; i++) { doc.setPage(i); footer(s, info, i, total, `${labels[i - 1] || ''} \u00b7 ${copyLabel}`, data.agent); }

    const safe = v => String(v || '').replace(/[^A-Za-z0-9 _-]+/g, '').trim().replace(/\s+/g, ' ');
    doc.save(`Tour packet - ${safe(data.client.name)}${settings.tour_date ? ' - ' + settings.tour_date : ''} - ${copyLabel}.pdf`);
    return { pages: total, sheets: total / 2 };
}

// ------------------------------------------------------------------ dialog

function ensureModal() {
    let modal = document.getElementById('modal-tour-packet');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.id = 'modal-tour-packet';
    modal.innerHTML = `
        <div class="modal-content tour-bulk-modal" role="dialog" aria-modal="true" aria-labelledby="tour-packet-title">
            <button class="modal-close" aria-label="Close" data-packet="close"><i data-lucide="x"></i></button>
            <div class="my-home-header"><h2 id="tour-packet-title"><i data-lucide="file-text"></i> Tour packet</h2></div>
            <div id="tour-packet-body"></div>
        </div>`;
    document.body.appendChild(modal);
    return modal;
}

function paintDialog(msg = '') {
    const tm = window.tourViewManager;
    const n = tm?.tourData?.stops?.length || 0;
    const body = document.getElementById('tour-packet-body');
    body.innerHTML = `
        <p class="tour-bulk-lead">A printable PDF for this tour: <strong data-packet-sheets data-agent="${n + 2}" data-buyer="${2 + Math.ceil(n / 2)}">${n + 2} sheets</strong>, printed front and back.</p>
        <ul class="tour-bulk-notes">
            <li>Sheet 1: cover with the itinerary, and the route map on the back</li>
            <li data-packet-sheet2>Sheet 2: the client's brief, their questions and a checklist, with your call sheet for the day on the back</li>
            <li data-packet-homes>Then one sheet per home: full listing details on the front; fit, what to check, MLS details and notes on the back</li>
        </ul>
        <div class="packet-options">
            <label><input type="checkbox" data-packet-opt="photos" checked> Listing photos</label>
            <label><input type="checkbox" data-packet-opt="map" checked> Route map</label>
            <fieldset class="packet-copy">
                <legend>Who is this copy for?</legend>
                <label><input type="radio" name="packet-copy" value="agent" checked> <strong>Agent copy</strong>: access notes, listing-agent contacts, full MLS details</label>
                <label><input type="radio" name="packet-copy" value="buyer"> <strong>Buyer copy</strong>: no lockbox or access info, no listing-agent contacts, no private notes</label>
            </fieldset>
            <label data-packet-private><input type="checkbox" data-packet-opt="privateNotes"> My private notes (agent copy only)</label>
        </div>
        <p class="tour-bulk-hint">Print double-sided, <strong>flip on long edge</strong>, at <strong>100% / actual size</strong>.</p>
        <p class="tour-bulk-hint" data-packet-status aria-live="polite">${msg}</p>
        <div class="brief-actions">
            <button type="button" class="btn btn-secondary" data-packet="close">Cancel</button>
            <button type="button" class="btn btn-primary" data-packet="make"><i data-lucide="download"></i> Create PDF</button>
        </div>`;
    if (window.lucide) window.lucide.createIcons();
}

export function openTourPacket() {
    const tm = window.tourViewManager;
    if (!tm?.tourData?.isRealtor) { showToast('Tour packets are for agents.', 'error'); return; }
    if (!tm.tourData.stops?.length) { showToast('Add homes to the tour first.', 'info'); return; }
    ensureModal().classList.add('active');
    paintDialog();
}
window.openTourPacket = openTourPacket;

let building = false;
document.addEventListener('click', async event => {
    const t = event.target;
    if (!(t instanceof Element) || !t.closest('#modal-tour-packet')) return;
    if (t.id === 'modal-tour-packet' && !building) { t.classList.remove('active'); return; }
    const btn = t.closest('[data-packet]');
    if (!btn) return;
    if (btn.dataset.packet === 'close' && !building) document.getElementById('modal-tour-packet').classList.remove('active');
    if (btn.dataset.packet !== 'make' || building) return;
    const opt = k => Boolean(document.querySelector(`#modal-tour-packet [data-packet-opt="${k}"]`)?.checked);
    const status = document.querySelector('#modal-tour-packet [data-packet-status]');
    building = true;
    btn.disabled = true;
    try {
        const copy = document.querySelector('#modal-tour-packet input[name="packet-copy"]:checked')?.value === 'buyer' ? 'buyer' : 'agent';
        const r = await buildPacket({ copy, photos: opt('photos'), map: opt('map'), privateNotes: copy === 'agent' && opt('privateNotes') }, m => { if (status) status.textContent = m; });
        document.getElementById('modal-tour-packet').classList.remove('active');
        showToast(`Tour packet ready: ${r.pages} pages (${r.sheets} sheets, double-sided).`, 'success');
    } catch (e) {
        console.error('[TourPacket]', e);
        if (status) status.textContent = e.message || 'Could not build the packet.';
    } finally {
        building = false;
        btn.disabled = false;
    }
});

// The private-notes option only applies to the agent copy.
document.addEventListener('change', event => {
    const t = event.target;
    if (!(t instanceof HTMLInputElement) || t.name !== 'packet-copy') return;
    const priv = document.querySelector('#modal-tour-packet [data-packet-opt="privateNotes"]');
    if (!priv) return;
    priv.disabled = t.value === 'buyer';
    const sheets = document.querySelector('#modal-tour-packet [data-packet-sheets]');
    if (sheets) sheets.textContent = `${t.value === 'buyer' ? sheets.dataset.buyer : sheets.dataset.agent} sheets`;
    const sheet2 = document.querySelector('#modal-tour-packet [data-packet-sheet2]');
    if (sheet2) sheet2.textContent = t.value === 'buyer'
        ? "Sheet 2: the client's brief and a bring-along checklist, with a scorecard to compare the homes on the back"
        : "Sheet 2: the client's brief, their questions and a checklist, with your call sheet for the day on the back";
    const homes = document.querySelector('#modal-tour-packet [data-packet-homes]');
    if (homes) homes.textContent = t.value === 'buyer'
        ? 'Then two homes per sheet, one page each: photo, key facts, fit, what to check, and room for notes'
        : 'Then one sheet per home: full listing details on the front; fit, what to check, MLS details and your tour notes on the back';
    if (priv.disabled) priv.checked = false;
});
