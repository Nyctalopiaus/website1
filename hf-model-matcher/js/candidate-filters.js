/* ==========================================================================
   CANDIDATE-TABLE FILTERS
   Pure functions that re-sort/re-filter/re-group an already-fetched
   `all_candidates` array for display. Deliberately has zero DOM dependency
   and never mutates its input - app.js calls these on the canonical fetched
   batch (state.recommendations.all_candidates) each time a sort/filter
   control changes, then re-renders from the result. No network call is
   involved in any of this - the candidate batch itself doesn't change, only
   how it's displayed.
   ========================================================================== */

// --- Sort + filter ---
// `filters`: { sort, quant, verified } - all optional, defaulting to "no-op".
//   sort:     'score_desc' (default) | 'vram_asc' | 'params_asc' | 'params_desc'
//   quant:    'all' (default) | '4' | '8' | '16'  (matches active_quant_bits)
//   verified: 'all' (default) | 'verified' (verified_gguf === true only) |
//             'hide_flagged' (drop verified_gguf === false; keep true/null)
export function applyCandidateFilters(candidates, filters = {}) {
    const sort = filters.sort || 'score_desc';
    const quant = filters.quant || 'all';
    const verified = filters.verified || 'all';

    let result = candidates.slice();

    if (quant !== 'all') {
        const bits = Number(quant);
        result = result.filter(m => (m.active_quant_bits || 4) === bits);
    }

    if (verified === 'verified') {
        result = result.filter(m => m.verified_gguf === true);
    } else if (verified === 'hide_flagged') {
        // Keep confirmed-real (true) AND never-checked (null) - only drop the
        // ones actually confirmed to lack a real GGUF file (see the hero-
        // eligibility fix in engine.py/main.py/recommendation-engine.js).
        result = result.filter(m => m.verified_gguf !== false);
    }

    const sorters = {
        score_desc: (a, b) => b.recommendation_score - a.recommendation_score,
        vram_asc: (a, b) => a.vram_req_gb - b.vram_req_gb,
        params_asc: (a, b) => a.params_b - b.params_b,
        params_desc: (a, b) => b.params_b - a.params_b
    };
    result.sort(sorters[sort] || sorters.score_desc);

    return result;
}

// --- Dedupe near-duplicate quant/format variants of the same base model ---
// e.g. six separate MLX-bit-depth variants of the same 30B model showing up
// as six full peer rows. Groups by a normalized base name (author + known
// quant/format/bit-depth tokens stripped) plus rounded params_b (so a
// similarly-named but differently-sized model never gets merged in).
//
// Expects `candidates` already sorted by preference (e.g. score desc) - the
// FIRST model encountered per group becomes the primary (shown as the main
// row); every later match in the same group becomes a collapsed variant.
const QUANT_FORMAT_TOKEN_RE = /[-_.](gguf|mlx|awq|gptq|exl2|fp8|fp16|nvfp4|int4|int8)(?=[-_.]|$)/gi;
const BIT_DEPTH_TOKEN_RE = /[-_.]?\d+bit(?=[-_.]|$)/gi;
const QUANT_LEVEL_TOKEN_RE = /[-_.]?q\d(_k(_[ms])?|_\d)?(?=[-_.]|$)/gi;

function normalizeBaseKey(model) {
    const repoName = (model.id || '').split('/').slice(1).join('/') || model.id || '';
    let key = repoName.toLowerCase();
    key = key.replace(QUANT_FORMAT_TOKEN_RE, '-');
    key = key.replace(BIT_DEPTH_TOKEN_RE, '-');
    key = key.replace(QUANT_LEVEL_TOKEN_RE, '-');
    key = key.replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');
    // Round to the nearest 0.5B so trivially-differing param estimates for
    // what's really the same model don't split into separate groups, while
    // genuinely different-sized models never merge.
    const roundedParams = Math.round((model.params_b || 0) * 2) / 2;
    return `${key}::${roundedParams}`;
}

// Returns an array of { primary, variants: [...] } groups, in first-seen
// order (i.e. matching the input array's order for whichever model in each
// group appeared first).
export function groupByBaseModel(candidates) {
    const groups = new Map();
    for (const m of candidates) {
        const key = normalizeBaseKey(m);
        if (!groups.has(key)) {
            groups.set(key, { primary: m, variants: [] });
        } else {
            groups.get(key).variants.push(m);
        }
    }
    return [...groups.values()];
}
