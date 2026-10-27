/**
 * Head-to-Head field registry (claude/head-to-head-spec.md §1).
 *
 * Each field: { key, label, section, get(home, ctx) -> value|null, type, better, draw, w, fmt?, unscored? }
 *   type    'money' | 'number' | 'text' | 'html'
 *   better  'higher' | 'lower' | null   (null = no automatic winner; identical text still auto-draws)
 *   draw    { abs?, pct? }  a gap inside this is a Draw
 *   w       default weight 0..3
 * After the curated fields, every other MLS detail the records carry is added as a text field
 * (see buildFields), so nothing collected is left out.
 */
import { monthlyCost, loadPaySettings } from './compare.js';
import { getCompScore } from './properties.js';
import { getCardDaysOnMarket } from './views.js';

export const SECTIONS = [
    'Money', 'Space', 'Rooms', 'Garage & outside', 'Systems & condition', 'Location & HOA',
    'Tour impressions', 'Your notes', 'More MLS details',
];

const raw = p => (p.raw_mls_json && typeof p.raw_mls_json === 'object') ? p.raw_mls_json : {};
const det = p => (raw(p).details && typeof raw(p).details === 'object') ? raw(p).details : {};

/** A number from 2,164 / $3,428 / "$190.00 / Monthly"; null when there isn't one. */
export function num(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    const m = String(v).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
    return m ? Number(m[0]) : null;
}
const pos = v => { const n = num(v); return n && n > 0 ? n : null; };
const txt = v => {
    if (v === null || v === undefined) return null;
    const s = String(v).replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    return s ? s : null;
};

/** Look up an MLS detail by its label in any section (labels are unique enough across sections). */
function d(p, label) {
    const all = det(p);
    for (const sec of Object.keys(all)) {
        const s = all[sec];
        if (s && typeof s === 'object' && s[label] !== undefined && s[label] !== '') return s[label];
    }
    const lf = raw(p).labeled_fields;
    return lf && lf[label] !== undefined && lf[label] !== '' ? lf[label] : null;
}

const ROOM_EXTRA = /^(office|den|study|loft|bonus room|media room|game room|workshop|exercise room|gym|sun room)$/i;
function extraRooms(p) {
    const rooms = Array.isArray(raw(p).rooms) ? raw(p).rooms : null;
    if (!rooms) return null;
    const list = rooms.map(r => String(r.type || '')).filter(t => ROOM_EXTRA.test(t));
    return { count: list.length, list };
}

// ---- Rooms (MLS room list: type, level, features like "Primary", dim like "16.11 x 12.1" = 16'11" x 12'1")
const roomsOf = p => Array.isArray(raw(p).rooms) && raw(p).rooms.length ? raw(p).rooms : null;
function parseDim(s) {
    const m = String(s || '').match(/(\d+)(?:\.(\d+))?\s*[x×X]\s*(\d+)(?:\.(\d+))?/);
    if (!m) return null;
    const ft = (f, i) => Number(f) + (i ? Math.min(Number(i), 11) / 12 : 0);
    const w = ft(m[1], m[2]), l = ft(m[3], m[4]);
    if (!w || !l) return null;
    const lab = (f, i) => `${Number(f)}'${i ? Number(i) : 0}"`;
    return { area: w * l, text: `${lab(m[1], m[2])} × ${lab(m[3], m[4])}` };
}
function roomText(r) {
    if (!r) return null;
    const dm = parseDim(r.dim);
    const size = dm ? `${dm.text} (${Math.round(dm.area)} sqft)` : 'size not listed';
    const desc = txt(r.desc);
    return `${size} · ${r.level || 'level not listed'}${desc ? ' · ' + desc : ''}`;
}
/** The matching room; the largest one when several match and sizes are listed. */
function pickRoom(p, test) {
    const list = (roomsOf(p) || []).filter(test);
    if (!list.length) return null;
    return list.reduce((best, r) => ((parseDim(r.dim)?.area || 0) > (parseDim(best.dim)?.area || 0) ? r : best), list[0]);
}
const isPrimary = r => /primary|master/i.test(`${r.features || ''} ${r.desc || ''}`);
const roomIs = re => r => re.test(String(r.type || ''));
function roomField(key, label, test, w) {
    return { key, label, section: 'Rooms', type: 'number', better: 'higher', draw: { pct: 5 }, w,
        get: p => parseDim(pickRoom(p, test)?.dim)?.area ?? null,
        fmt: (v, p) => roomText(pickRoom(p, test)),
        note: p => roomText(pickRoom(p, test)) };
}
function bedsByLevel(p) {
    const rooms = roomsOf(p);
    if (!rooms) return null;
    const c = {};
    rooms.filter(r => /^bedroom$/i.test(r.type || '')).forEach(r => { const l = r.level || '?'; c[l] = (c[l] || 0) + 1; });
    const order = ['Main', 'Upper', 'Lower', 'Basement'];
    return Object.keys(c).sort((x, y) => (order.indexOf(x) + 1 || 9) - (order.indexOf(y) + 1 || 9)).map(l => `${l} ${c[l]}`).join(' · ') || null;
}

/** The buyer's repair estimate; null = not entered (0 is a real answer). */
const repairOf = p => { const n = num(p.repair_estimate); return n === null || n < 0 ? null : n; };

const sqftFin = p => pos(p.sqft_finished) || pos(d(p, 'Living Area (SqFt Fin)'));
const sqftAbove = p => pos(raw(p).interior?.sqft_above_grade) || pos(d(p, 'Above Grade Fin Area (SqFt)'));

export const money = v => '$' + Math.round(Number(v)).toLocaleString();
const int = v => Math.round(Number(v)).toLocaleString();
const sqft = v => int(v) + ' sqft';

// Curated fields: the ones with a clear direction get automatic winners.
const CURATED = [
    // ---- Money
    { key: 'price', label: 'List price', section: 'Money', type: 'money', better: 'lower', draw: { abs: 5000 }, w: 3,
        get: p => pos(p.price), fmt: money },
    { key: 'repair', label: 'Repair / update estimate (yours)', section: 'Money', type: 'money', better: 'lower', draw: { abs: 2500 }, w: 1,
        get: p => repairOf(p), fmt: (v, p) => money(v) + (txt(p.repair_note) ? ` · ${txt(p.repair_note)}` : '') },
    { key: 'adj_cost', label: 'Adjusted true cost (price + repairs)', section: 'Money', type: 'money', better: 'lower', draw: { abs: 5000 }, w: 3,
        get: p => (pos(p.price) && repairOf(p) !== null) ? p.price + repairOf(p) : null, fmt: money,
        note: p => pos(p.price) ? 'enter a repair estimate (0 if none)' : null },
    { key: 'adj_ppsf', label: 'Adjusted $ / finished sq ft', section: 'Money', type: 'money', better: 'lower', draw: { pct: 3 }, w: 1,
        get: p => (pos(p.price) && repairOf(p) !== null && sqftFin(p)) ? (p.price + repairOf(p)) / sqftFin(p) : null, fmt: v => money(v) + '/sqft' },
    { key: 'ppsf_fin', label: '$ / finished sq ft', section: 'Money', type: 'money', better: 'lower', draw: { pct: 3 }, w: 3,
        get: p => (pos(p.price) && sqftFin(p)) ? p.price / sqftFin(p) : null, fmt: v => money(v) + '/sqft' },
    { key: 'ppsf_above', label: '$ / above-grade sq ft', section: 'Money', type: 'money', better: 'lower', draw: { pct: 3 }, w: 2,
        get: p => (pos(p.price) && sqftAbove(p)) ? p.price / sqftAbove(p) : null, fmt: v => money(v) + '/sqft' },
    { key: 'monthly', label: 'Monthly cost (P&I + tax + HOA)', section: 'Money', type: 'money', better: 'lower', draw: { abs: 50 }, w: 3,
        get: (p, ctx) => monthlyCost(p, ctx.pay)?.total ?? null, fmt: v => money(v) + '/mo' },
    { key: 'annual_tax', label: 'Property tax', section: 'Money', type: 'money', better: 'lower', draw: { abs: 150 }, w: 2,
        get: p => pos(p.annual_tax) || pos(d(p, 'Tax Annual Amount')), fmt: v => money(v) + '/yr' },
    { key: 'hoa', label: 'HOA dues', section: 'Money', type: 'money', better: 'lower', draw: { abs: 10 }, w: 2,
        get: p => num(p.hoa_fee) ?? 0, fmt: v => v ? money(v) + '/mo' : 'No HOA' },
    { key: 'metro', label: 'Metro district', section: 'Money', type: 'text', better: null, w: 1,
        get: p => d(p, 'Metro District Website') ? 'Yes' : null },
    { key: 'vs_comps', label: 'Price vs. RentCast value', section: 'Money', type: 'number', better: 'lower', draw: { abs: 2 }, w: 2,
        get: p => getCompScore(p)?.pct ?? null,
        fmt: (v, p) => { const s = getCompScore(p); return s ? `${s.pctText} (${money(s.estimate)})` : ''; } },
    { key: 'price_cut', label: 'Price cut from original', section: 'Money', type: 'money', better: 'higher', draw: { abs: 2500 }, w: 1,
        get: p => { const o = pos(p.original_price) || pos(d(p, 'Original List Price')); const c = pos(p.price);
            return o && c ? Math.max(0, o - c) : null; },
        fmt: (v, p) => { if (!v) return 'None'; const o = pos(p.original_price) || pos(d(p, 'Original List Price'));
            return `${money(v)} (−${(v / o * 100).toFixed(1)}%)`; } },
    { key: 'dom', label: 'Days on market (more = more leverage)', section: 'Money', type: 'number', better: 'higher', draw: { abs: 7 }, w: 1,
        get: p => { const n = getCardDaysOnMarket(p); return n === null || n === undefined ? null : Number(n); }, fmt: v => int(v) + ' days' },
    { key: 'terms', label: 'Listing terms', section: 'Money', type: 'text', better: null, w: 0, get: p => d(p, 'Listing Terms') },
    { key: 'concessions', label: 'Special conditions', section: 'Money', type: 'text', better: null, w: 0, get: p => d(p, 'Special Listing Conditions') },

    // ---- Space
    { key: 'sqft_fin', label: 'Finished sq ft', section: 'Space', type: 'number', better: 'higher', draw: { pct: 3 }, w: 3, get: sqftFin, fmt: sqft },
    { key: 'sqft_above', label: 'Above-grade finished sq ft', section: 'Space', type: 'number', better: 'higher', draw: { pct: 3 }, w: 3, get: sqftAbove, fmt: sqft },
    { key: 'sqft_total', label: 'Total sq ft', section: 'Space', type: 'number', better: 'higher', draw: { pct: 3 }, w: 1,
        get: p => pos(p.sqft_total) || pos(d(p, 'Area (SqFt) Total')), fmt: sqft },
    { key: 'beds', label: 'Bedrooms', section: 'Space', type: 'number', better: 'higher', draw: { abs: 0 }, w: 1,
        get: p => pos(p.beds) || pos(d(p, 'Beds Total')), fmt: int },
    { key: 'baths', label: 'Bathrooms', section: 'Space', type: 'number', better: 'higher', draw: { abs: 0 }, w: 1,
        get: p => pos(p.baths) || pos(d(p, 'Baths Total')),
        fmt: (v, p) => { const i = raw(p).interior || {}; const parts = [];
            if (i.baths_full) parts.push(`${i.baths_full} full`); if (i.baths_3_4) parts.push(`${i.baths_3_4} three-quarter`); if (i.baths_1_2) parts.push(`${i.baths_1_2} half`);
            return int(v) + (parts.length ? ` (${parts.join(', ')})` : ''); } },
    { key: 'extra_rooms', label: 'Office / den / bonus rooms', section: 'Space', type: 'number', better: 'higher', draw: { abs: 0 }, w: 2,
        get: p => extraRooms(p)?.count ?? null, fmt: (v, p) => v ? `${v}: ${extraRooms(p).list.join(', ')}` : 'None listed' },
    { key: 'levels', label: 'Levels / style', section: 'Space', type: 'text', better: null, w: 1, get: p => p.levels || d(p, 'Levels') },
    { key: 'basement', label: 'Basement', section: 'Space', type: 'text', better: null, w: 1, get: p => raw(p).interior?.basement || d(p, 'Basement') },
    { key: 'bsmt_total', label: 'Basement sq ft', section: 'Space', type: 'number', better: 'higher', draw: { pct: 5 }, w: 1,
        get: p => pos(raw(p).interior?.sqft_below_grade_total) || pos(d(p, 'Below Grade (SqFt) Total')), fmt: sqft },
    { key: 'bsmt_fin', label: 'Basement finished sq ft', section: 'Space', type: 'number', better: 'higher', draw: { pct: 5 }, w: 0,
        get: p => num(raw(p).interior?.sqft_below_grade_finished) ?? num(d(p, 'Below Grade Finished Area')), fmt: sqft },
    { key: 'lot', label: 'Lot size', section: 'Space', type: 'number', better: 'higher', draw: { pct: 5 }, w: 2,
        get: p => pos(p.lot_sqft) || (pos(p.lot_acres) ? Math.round(p.lot_acres * 43560) : null) || pos(d(p, 'Lot Size Square Feet')),
        fmt: v => `${int(v)} sqft (${(v / 43560).toFixed(2)} ac)` },

    // ---- Rooms
    roomField('room_primary', 'Primary bedroom', r => /^bedroom$/i.test(r.type || '') && isPrimary(r), 2),
    { key: 'primary_level', label: 'Primary bedroom level', section: 'Rooms', type: 'text', better: null, w: 1,
        get: p => pickRoom(p, r => /^bedroom$/i.test(r.type || '') && isPrimary(r))?.level || null },
    roomField('room_primary_bath', 'Primary bath', r => /^bathroom/i.test(r.type || '') && isPrimary(r), 1),
    roomField('room_kitchen', 'Kitchen', roomIs(/^kitchen$/i), 2),
    roomField('room_living', 'Main living space (largest living / great / family room)', roomIs(/^(living room|great room|family room)$/i), 2),
    roomField('room_dining', 'Dining room', roomIs(/^dining room$/i), 1),
    roomField('room_office', 'Office / den / study', roomIs(/^(office|den|study)$/i), 2),
    roomField('room_bonus', 'Bonus / loft / media / game room', roomIs(/^(bonus room|loft|media room|game room)$/i), 1),
    roomField('room_laundry', 'Laundry', roomIs(/^laundry$/i), 0),
    { key: 'beds_by_level', label: 'Bedrooms by level', section: 'Rooms', type: 'text', better: null, w: 1, get: bedsByLevel },
    { key: 'room_list', label: 'All rooms', section: 'Rooms', type: 'text', better: null, w: 0, unscored: true, long: true,
        get: p => (roomsOf(p) || []).map(r => `${r.type}${isPrimary(r) ? ' (primary)' : ''}: ${roomText(r)}`).join(' | ') || null },

    // ---- Garage & outside
    { key: 'garage', label: 'Garage spaces', section: 'Garage & outside', type: 'number', better: 'higher', draw: { abs: 0 }, w: 3,
        get: p => pos(p.garage_spaces), fmt: v => int(v) + '-car' },
    { key: 'parking_total', label: 'Total parking', section: 'Garage & outside', type: 'number', better: 'higher', draw: { abs: 0 }, w: 1,
        get: p => pos(p.parking_total) || pos(d(p, 'Parking Total')), fmt: int },
    { key: 'parking_features', label: 'Parking features (oversized, tandem…)', section: 'Garage & outside', type: 'text', better: null, w: 2,
        get: p => raw(p).parking_features || d(p, 'Parking Features') },
    { key: 'electric', label: 'Electric (220V?)', section: 'Garage & outside', type: 'text', better: null, w: 1, get: p => raw(p).electric || d(p, 'Electric') },
    { key: 'fencing', label: 'Fencing (as listed)', section: 'Garage & outside', type: 'text', better: null, w: 1, get: p => raw(p).fencing || d(p, 'Fencing') },
    { key: 'driveway', label: 'Driveway faces (set by you)', section: 'Garage & outside', type: 'text', better: null, w: 1,
        get: p => ({ N: 'North', NE: 'Northeast', E: 'East', SE: 'Southeast', S: 'South', SW: 'Southwest', W: 'West', NW: 'Northwest' })[p.facing] || null },
    { key: 'faces', label: 'House faces (MLS)', section: 'Garage & outside', type: 'text', better: null, w: 0, get: p => raw(p).direction_faces || d(p, 'Direction Faces') },
    { key: 'lot_features', label: 'Lot features', section: 'Garage & outside', type: 'text', better: null, w: 1, get: p => raw(p).lot_features || d(p, 'Lot Features') },
    { key: 'exterior', label: 'Exterior features', section: 'Garage & outside', type: 'text', better: null, w: 1, get: p => raw(p).exterior_features || d(p, 'Exterior Features') },
    { key: 'patio', label: 'Patio / porch', section: 'Garage & outside', type: 'text', better: null, w: 1, get: p => raw(p).patio_porch || d(p, 'Patio And Porch Features') },
    { key: 'view', label: 'View', section: 'Garage & outside', type: 'text', better: null, w: 1, get: p => d(p, 'View') },
    { key: 'outbuildings', label: 'Outbuildings', section: 'Garage & outside', type: 'text', better: null, w: 0, get: p => d(p, 'Type') },
    { key: 'road', label: 'Road frontage', section: 'Garage & outside', type: 'text', better: null, w: 0, get: p => d(p, 'Road Frontage Type') },

    // ---- Systems & condition
    { key: 'year', label: 'Year built', section: 'Systems & condition', type: 'number', better: 'higher', draw: { abs: 2 }, w: 2,
        get: p => pos(p.year_built) || pos(d(p, 'Year Built')), fmt: v => String(Math.round(v)) },
    { key: 'condition', label: 'Property condition (MLS)', section: 'Systems & condition', type: 'text', better: null, w: 2, get: p => d(p, 'Property Condition') },
    { key: 'roof', label: 'Roof', section: 'Systems & condition', type: 'text', better: null, w: 1, get: p => raw(p).roof || d(p, 'Roof') },
    { key: 'heating', label: 'Heating', section: 'Systems & condition', type: 'text', better: null, w: 1, get: p => raw(p).heating || d(p, 'Heating') },
    { key: 'cooling', label: 'Cooling', section: 'Systems & condition', type: 'text', better: null, w: 1, get: p => raw(p).cooling || d(p, 'Cooling') },
    { key: 'construction', label: 'Construction', section: 'Systems & condition', type: 'text', better: null, w: 0, get: p => raw(p).construction_materials || d(p, 'Construction Materials') },
    { key: 'foundation', label: 'Foundation', section: 'Systems & condition', type: 'text', better: null, w: 0, get: p => d(p, 'Foundation Details') },
    { key: 'windows', label: 'Windows', section: 'Systems & condition', type: 'text', better: null, w: 1, get: p => raw(p).window_features || d(p, 'Window Features') },
    { key: 'flooring', label: 'Flooring', section: 'Systems & condition', type: 'text', better: null, w: 1, get: p => raw(p).interior?.flooring || d(p, 'Flooring') },
    { key: 'appliances', label: 'Appliances', section: 'Systems & condition', type: 'text', better: null, w: 1, get: p => raw(p).interior?.appliances || d(p, 'Appliances') },
    { key: 'interior_features', label: 'Interior features', section: 'Systems & condition', type: 'text', better: null, w: 1, get: p => raw(p).interior_features || d(p, 'Interior Features') },
    { key: 'fireplaces', label: 'Fireplaces', section: 'Systems & condition', type: 'text', better: null, w: 0, get: p => raw(p).interior?.fireplaces || d(p, 'Fireplaces') },
    { key: 'laundry', label: 'Laundry', section: 'Systems & condition', type: 'text', better: null, w: 0, get: p => d(p, 'Laundry Features') },
    { key: 'green', label: 'Energy features', section: 'Systems & condition', type: 'text', better: null, w: 0, get: p => d(p, 'Green Energy Efficient') },
    { key: 'utilities', label: 'Water / sewer', section: 'Systems & condition', type: 'text', better: null, w: 0,
        get: p => [raw(p).water_source || d(p, 'Water Source'), raw(p).sewer || d(p, 'Sewer')].filter(Boolean).join(' · ') || null },

    // ---- Location & HOA
    { key: 'subdivision', label: 'Subdivision', section: 'Location & HOA', type: 'text', better: null, w: 1, get: p => raw(p).subdivision_name || d(p, 'Subdivision Name') },
    { key: 'city', label: 'City / ZIP', section: 'Location & HOA', type: 'text', better: null, w: 1, get: p => [p.city, p.zip].filter(Boolean).join(' ') || null },
    { key: 'district', label: 'School district', section: 'Location & HOA', type: 'text', better: null, w: 1, get: p => p.school_district || d(p, 'School District') },
    { key: 'schools', label: 'Schools (elem / middle / high)', section: 'Location & HOA', type: 'text', better: null, w: 0,
        get: p => [d(p, 'Elementary School'), d(p, 'Middle Or Junior School'), d(p, 'High School')].filter(Boolean).join(' / ') || null },
    { key: 'hoa_names', label: 'HOA(s)', section: 'Location & HOA', type: 'text', better: null, w: 0,
        get: p => [d(p, 'HOA 1'), d(p, 'HOA 2'), d(p, 'HOA 3')].filter(Boolean).join(' · ') || null },
    { key: 'covenants', label: 'Restrictions / covenants', section: 'Location & HOA', type: 'text', better: null, w: 1, get: p => d(p, 'Restrictions/Covenants?') },
    { key: 'pets', label: 'Pets allowed', section: 'Location & HOA', type: 'text', better: null, w: 0, get: p => raw(p).pets_allowed || d(p, 'Pets Allowed') },
    { key: 'transit', label: 'Transit', section: 'Location & HOA', type: 'text', better: null, w: 0,
        get: p => [d(p, 'Distance To Bus') && 'Bus ' + d(p, 'Distance To Bus'), d(p, 'Distance To Light Rail') && 'Light rail ' + d(p, 'Distance To Light Rail')].filter(Boolean).join(' · ') || null },

    // ---- Tour impressions (your 1–5 ratings from Tour Results)
    ...[['overall', 'Overall', 3], ['layout', 'Layout & flow', 2], ['condition', 'Condition', 2],
        ['location', 'Location & street', 2], ['value', 'Value for price', 2], ['live_here', 'Would live here', 3]]
        .map(([k, label, w]) => ({ key: 'tour_' + k, label, section: 'Tour impressions', type: 'number', better: 'higher', draw: { abs: 0 }, w,
            get: (p, ctx) => { const v = num(ctx.tourScores[String(p.mls_id)]?.[k]); return v >= 1 && v <= 5 ? v : null; }, fmt: v => `${v} / 5` })),
    { key: 'rank', label: 'Top Picks rank', section: 'Tour impressions', type: 'number', better: 'lower', draw: { abs: 0 }, w: 1,
        get: p => pos(p.pick_rank), fmt: v => '#' + v },

    // ---- Your notes (shown, not scored)
    { key: 'tour_notes', label: 'Tour notes', section: 'Your notes', type: 'text', better: null, w: 0, unscored: true, get: p => p.tour_notes },
    { key: 'user_notes', label: 'Notes', section: 'Your notes', type: 'text', better: null, w: 0, unscored: true, get: p => p.user_notes },
    { key: 'tags', label: 'Reaction tags', section: 'Your notes', type: 'text', better: null, w: 0, unscored: true,
        get: p => { let t = p.tags_json ?? p.tags; if (typeof t === 'string') { try { t = JSON.parse(t); } catch (e) { t = null; } }
            return Array.isArray(t) && t.length ? t.join(', ') : null; } },
    { key: 'description', label: 'Listing description', section: 'Your notes', type: 'text', better: null, w: 0, unscored: true, long: true,
        get: p => raw(p).description },
];

// MLS labels the curated list already covers, or that aren't worth comparing (contacts, ids, legal text).
const SKIP_LABELS = new Set([
    'Tax Annual Amount', 'Tax Year', 'Original List Price', 'Living Area (SqFt Fin)', 'Above Grade Fin Area (SqFt)',
    'Area (SqFt) Total', 'Beds Total', 'Baths Total', 'Baths Full', 'Baths 3/4', 'Baths 1/2', 'Baths 1/4', 'Levels',
    'Basement', 'Basement YN', 'Below Grade (SqFt) Total', 'Below Grade Finished Area', 'Lot Size Acres',
    'Lot Size Square Feet', 'Parking Total', 'Parking Features', 'Electric', 'Fencing', 'Direction Faces', 'Lot Features',
    'Exterior Features', 'Patio And Porch Features', 'View', 'Type', 'Road Frontage Type', 'Year Built',
    'Property Condition', 'Roof', 'Heating', 'Cooling', 'Construction Materials', 'Foundation Details',
    'Window Features', 'Flooring', 'Appliances', 'Interior Features', 'Fireplaces', 'Laundry Features',
    'Green Energy Efficient', 'Water Source', 'Sewer', 'Subdivision Name', 'School District', 'Elementary School',
    'Middle Or Junior School', 'High School', 'HOA 1', 'HOA 2', 'HOA 3', 'Restrictions/Covenants?', 'Pets Allowed',
    'Distance To Bus', 'Distance To Light Rail', 'Listing Terms', 'Special Listing Conditions', 'Metro District Website',
    'PSF Above Grade', 'PSF Finished', 'PSF Total', 'Total Annual HOA Fees', 'Association Fee (HOA) 1',
    'Association Fee (HOA) 2', 'Association Fee (HOA) 3', 'HOA',
    // not useful to compare
    'Attribution Contact', 'Parcel Number', 'Tax Legal Description', 'List Office Name', 'Listing Contract Date',
    'HOA 1 Phone #', 'HOA 2 Phone #', 'HOA 3 Phone #', 'HOA 1 Website', 'HOA 2 Website', 'HOA 3 Website',
    'HOA 1 Type', 'HOA 2 Type', 'HOA 3 Type', 'New Home Community Listing ID', 'New Home Community URL', 'Lot Number',
    'Property Type', 'Property Sub Type', 'Structure Type', 'Ownership',
]);

/** Field key for an uncurated MLS detail; stable so picks/weights survive across sessions. */
const mlsKey = (sec, label) => 'mls:' + (sec + '|' + label).toLowerCase().replace(/[^a-z0-9|]+/g, '_');

/** The full field list for these two homes: curated fields, then every other MLS detail either one carries. */
export function buildFields(a, b) {
    const fields = [...CURATED];
    const seen = new Set();
    for (const p of [a, b]) {
        const all = det(p);
        for (const sec of Object.keys(all)) {
            const s = all[sec];
            if (!s || typeof s !== 'object') continue;
            for (const label of Object.keys(s)) {
                if (SKIP_LABELS.has(label)) continue;
                const key = mlsKey(sec, label);
                if (seen.has(key)) continue;
                seen.add(key);
                fields.push({ key, label, sub: sec, section: 'More MLS details', type: 'text', better: null, w: 1,
                    get: q => { const v = det(q)[sec]?.[label]; return v === undefined || v === '' ? null : v; } });
            }
        }
    }
    return fields;
}

/** Value + display text for one home; null value = not listed. */
export function readField(f, p, ctx) {
    let v = null;
    try { v = f.get(p, ctx); } catch (e) { v = null; }
    if (f.type === 'text') {
        v = txt(v);
        return { value: v, text: v };
    }
    v = (v === null || v === undefined || v === '' || !isFinite(Number(v))) ? null : Number(v);
    if (v === null) { let n = null; try { n = f.note ? f.note(p, ctx) : null; } catch (e) {} return { value: null, text: n || null }; }
    return { value: v, text: f.fmt ? f.fmt(v, p) : String(v) };
}

/** Automatic pick: 'A' | 'B' | 'D' | null (undecided). */
export function autoPick(f, va, vb) {
    if (va === null || vb === null) return null;
    if (f.type === 'text') return String(va).toLowerCase() === String(vb).toLowerCase() ? 'D' : null;
    if (!f.better) return va === vb ? 'D' : null;
    const gap = Math.abs(va - vb);
    const base = Math.max(Math.abs(va), Math.abs(vb)) || 1;
    if (gap <= (f.draw?.abs ?? 0) || (f.draw?.pct !== undefined && gap / base * 100 <= f.draw.pct)) return 'D';
    const aBetter = f.better === 'higher' ? va > vb : va < vb;
    return aBetter ? 'A' : 'B';
}

/** "B +312 sqft (+11%)"-style difference text for numeric fields; '' when not comparable. */
export function diffText(f, ra, rb) {
    if (f.type === 'text' || ra.value === null || rb.value === null) return '';
    const dlt = rb.value - ra.value;
    if (Math.abs(dlt) < 1e-9) return 'same';
    const pct = ra.value ? ` (${dlt > 0 ? '+' : '−'}${Math.abs(dlt / ra.value * 100).toFixed(Math.abs(dlt / ra.value) < 0.1 ? 1 : 0)}%)` : '';
    let mag;
    if (f.type === 'money') mag = money(Math.abs(dlt));
    else if (Number.isInteger(dlt)) mag = Math.abs(dlt).toLocaleString();
    else mag = Math.abs(dlt).toFixed(1);
    if (f.key === 'vs_comps') return `B ${dlt > 0 ? '+' : '−'}${Math.abs(dlt).toFixed(1)} pts`;
    return `B ${dlt > 0 ? '+' : '−'}${mag}${pct}`;
}

export { loadPaySettings };
