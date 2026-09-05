/* ==========================================================================
   CLIENT-SIDE RECOMMENDATION ENGINE
   Runs entirely in the browser as a fallback when the FastAPI backend is
   unreachable: searches the Hugging Face Hub API directly for GGUF/MLX
   models matching the user's goal, scores them against the user's VRAM
   budget (with KV-cache overhead by context window), and picks the three
   "hero" recommendations (best overall / speed demon / max capability).
   This is a from-scratch reimplementation of the same scoring logic as the
   Python backend's engine.py + hf_client.py - kept in its own module because
   it's the largest, most self-contained piece of app.js (pure functions and
   one hardcoded seed list, no DOM dependency beyond its return value).

   getGenerationSpeed and getSuitabilityTag are exported because the UI
   renderer (still in app.js pending its own extraction) also needs them to
   redisplay a model's speed rating and workflow-fit tag.
   ========================================================================== */

import { estimateBandwidthGBs, getEffectiveBudgetGb } from './gpu-catalog.js';

// Helper: KV-Cache Overhead Calculator
function getKvCacheOverhead(contextK) {
    const map = { 4: 0.4, 8: 0.8, 16: 1.5, 32: 3.5, 64: 5.5, 128: 8.0 };
    return map[contextK] || 1.5;
}

// Priority-ordered filename tokens to look for on the Hub when verifying a
// model's real .gguf size, per requested quant level. Kept in sync with
// QUANT_FILENAME_TOKENS in backend/hf_client.py.
const QUANT_FILENAME_TOKENS = {
    4: ['q4_k_m', 'q4_k_s', 'q4_k_l', 'q4_0', 'iq4_xs', 'iq4_nl'],
    8: ['q8_0'],
    16: ['f16', 'fp16']
};

// config.json field-name aliases to try, in order, for each architecture number
// the real KV-cache formula needs. Kept in sync with ARCH_FIELD_ALIASES in
// backend/hf_client.py.
const ARCH_FIELD_ALIASES = {
    num_hidden_layers: ['num_hidden_layers', 'n_layer', 'num_layers'],
    num_attention_heads: ['num_attention_heads', 'n_head', 'num_heads'],
    num_key_value_heads: ['num_key_value_heads', 'n_head_kv', 'num_kv_heads'],
    hidden_size: ['hidden_size', 'n_embd', 'd_model']
};

function firstPresent(cfg, aliases) {
    for (const key of aliases) {
        const val = cfg[key];
        if (typeof val === 'number' && val > 0) return val;
    }
    return null;
}

// Computes the model's REAL KV-cache memory footprint from its actual
// architecture instead of the flat getKvCacheOverhead() table, which is blind
// to model size entirely. Mirrors backend/hf_client.py's get_exact_kv_cache_gb()
// - see that docstring for the full rationale (confirmed live: real cross-origin
// fetch to a base model's config.json from the deployed nycto.ninja page works,
// and Qwen2.5-Coder-7B's real 16k KV cache computes to ~0.92GB vs the flat
// table's 1.5GB - GQA models have far fewer KV heads than query heads).
async function getExactKvCacheGb(baseModelId, contextK) {
    try {
        const res = await fetch(`https://huggingface.co/${baseModelId}/raw/main/config.json`);
        if (!res.ok) return null;
        const cfg = await res.json();

        const numLayers = firstPresent(cfg, ARCH_FIELD_ALIASES.num_hidden_layers);
        const numHeads = firstPresent(cfg, ARCH_FIELD_ALIASES.num_attention_heads);
        const hiddenSize = firstPresent(cfg, ARCH_FIELD_ALIASES.hidden_size);
        // True MHA models don't publish a separate KV-head count - in that case
        // KV heads equal query heads.
        const numKvHeads = firstPresent(cfg, ARCH_FIELD_ALIASES.num_key_value_heads) || numHeads;

        if (!(numLayers && numHeads && hiddenSize && numKvHeads)) return null;

        const headDim = hiddenSize / numHeads;
        const contextTokens = contextK * 1000;
        // 2 (K and V) x layers x kv_heads x head_dim x tokens x 2 bytes (fp16 KV
        // cache - llama.cpp's default). Decimal GB, matching the app convention.
        const kvCacheBytes = 2 * numLayers * numKvHeads * headDim * contextTokens * 2;
        const kvCacheGb = Math.round((kvCacheBytes / 1e9) * 100) / 100;

        return {
            exactKvOverheadGb: kvCacheGb,
            kvArchitecture: {
                baseModel: baseModelId,
                numHiddenLayers: numLayers,
                numAttentionHeads: numHeads,
                numKeyValueHeads: numKvHeads,
                hiddenSize: hiddenSize,
                isGqa: numKvHeads < numHeads
            }
        };
    } catch (e) {
        return null;
    }
}

// Looks up a model's REAL .gguf file size directly from the Hub instead of
// relying on the params-times-bits estimate (which undercounts K-quants -
// Q4_K_M runs closer to ~4.5-5 effective bits/weight than a clean 4), plus the
// real architecture-derived KV-cache size when the repo tags its base model.
// Mirrors backend/hf_client.py's get_exact_gguf_info() - see that docstring for
// the full rationale. Called over a bounded pre-hero-selection verification
// slice (top-by-score + smallest-by-params among the vetted pool - see
// runClientSideEngine below), never the full search batch. Returns null on
// any failure so callers always have a safe fallback to the estimate.
async function getExactGgufInfo(repoId, quantBits, contextK) {
    let data;
    try {
        const res = await fetch(`https://huggingface.co/api/models/${repoId}?blobs=true`);
        if (!res.ok) return null;
        data = await res.json();
    } catch (e) {
        return null;
    }

    const siblings = data.siblings || [];
    const tokens = QUANT_FILENAME_TOKENS[quantBits] || QUANT_FILENAME_TOKENS[4];
    const result = {};

    for (const token of tokens) {
        const files = siblings.filter(s =>
            s.size && String(s.rfilename || '').toLowerCase().endsWith('.gguf') &&
            String(s.rfilename || '').toLowerCase().includes(token)
        );
        if (files.length > 0) {
            const bytes = files.reduce((sum, f) => sum + f.size, 0);
            // Decimal GB (bytes / 1e9) - matches the app-wide convention used
            // everywhere else (no binary/1024 math in this pipeline), since this
            // gets compared directly against the estimate and the user's budget.
            result.exactWeightGb = Math.round((bytes / 1e9) * 100) / 100;
            result.matchedFiles = files.map(f => f.rfilename);
            break;
        }
    }

    const gguf = data.gguf || {};
    if (typeof gguf.total === 'number' && gguf.total > 0) {
        result.exactParamsB = Math.round((gguf.total / 1e9) * 100) / 100;
    }
    if (typeof gguf.context_length === 'number') {
        result.nativeContextLength = gguf.context_length;
    }

    let baseModel = (data.cardData || {}).base_model;
    if (Array.isArray(baseModel)) baseModel = baseModel[0];
    if (typeof baseModel === 'string' && baseModel.trim()) {
        const kvResult = await getExactKvCacheGb(baseModel.trim(), contextK);
        if (kvResult) Object.assign(result, kvResult);
    }

    return Object.keys(result).length > 0 ? result : null;
}

// Fallback bandwidth (GB/s) used only if a caller doesn't pass one - matches
// the mid-tier consumer-GPU estimate in gpu-catalog.js's estimateBandwidthGBs.
const DEFAULT_BANDWIDTH_GBS = 500;

// Real-world sustained throughput lands well below a GPU's theoretical peak
// bandwidth (attention/kernel overhead, batch-of-1 inefficiency, etc.) - this
// factor calibrates the roofline estimate toward realistic single-stream
// llama.cpp-style numbers (e.g. ~80-100 t/s for a 7B Q4 model on a 24GB
// consumer card, ~15-25 t/s for a 32B Q4 model on the same card) rather than
// the much higher numbers a naive bandwidth/weight-size division would give.
const SUSTAINED_THROUGHPUT_EFFICIENCY = 0.35;

// Helper: Generation Speed Status Rating.
//
// Previously this was purely "does it fit in VRAM, and with how much
// headroom" (a percentage of the user's total budget) - which meant a 1.5B
// model and a 30B model could both land in the same "Blistering" bucket as
// long as each individually cleared the VRAM-fit threshold, even though real
// single-stream decode speed drops substantially as parameter count rises on
// the same GPU. Local LLM decode is memory-bandwidth-bound: each generated
// token requires streaming the model's active weights through memory once, so
// a simple roofline estimate - GPU bandwidth (GB/s) divided by the model's
// weight size (GB) - is a much better proxy for realistic tokens/sec than
// VRAM-fit percentage alone. Known simplification: this treats every param as
// "active" per token, which over-estimates cost for sparse/MoE architectures
// (e.g. Qwen3-Coder-30B-A3B only activates ~3B params per token) - the same
// simplification the existing VRAM-sizing math already makes elsewhere in
// this file, not a new limitation introduced here.
// CPU/RAM-bound inference is dramatically slower and far less uniform across
// hardware (RAM channel count/speed, AVX512 support, thread count all matter
// far more here than on a GPU) than the bandwidth-roofline model above -
// deliberately a rough, size-only bucket table rather than a bandwidth
// estimate, and labeled "(rough)" in the UI so it doesn't read as precise as
// the GPU badges.
function getCpuSpeedTier(paramsB) {
    const p = paramsB || 7;
    if (p <= 4) {
        return {
            level: 'cpu', label: '🖥️ CPU Estimate (rough): ~5–15 t/s', badge_class: 'badge-speed-cpu',
            tps: '~5–15 t/s', desc: 'Rough CPU/RAM-bound estimate - actual speed varies a lot by RAM speed & CPU core count'
        };
    }
    if (p <= 14) {
        return {
            level: 'cpu', label: '🖥️ CPU Estimate (rough): ~2–6 t/s', badge_class: 'badge-speed-cpu',
            tps: '~2–6 t/s', desc: 'Rough CPU/RAM-bound estimate - actual speed varies a lot by RAM speed & CPU core count'
        };
    }
    return {
        level: 'cpu', label: '🖥️ CPU Estimate (rough): <2 t/s', badge_class: 'badge-speed-cpu',
        tps: '<2 t/s', desc: 'Rough CPU/RAM-bound estimate - large models are very slow to run without a GPU'
    };
}

export function getGenerationSpeed(model, userBudgetGb, gpuBandwidthGBs, cpuOnly = false) {
    const fits = model.vram_req_gb <= userBudgetGb;

    if (!fits) {
        if (cpuOnly) {
            return {
                level: 'spillover',
                label: '🔴 Exceeds RAM Budget',
                badge_class: 'badge-speed-spillover',
                tps: 'N/A',
                desc: 'Larger than your available System RAM budget - will not run without swapping to disk'
            };
        }
        return {
            level: 'spillover',
            label: '🔴 Slow Spillover (2–8 t/s)',
            badge_class: 'badge-speed-spillover',
            tps: '2–8 t/s',
            desc: 'Pushed past GPU VRAM into System RAM'
        };
    }

    if (cpuOnly) {
        return getCpuSpeedTier(model.params_b);
    }

    const bandwidth = gpuBandwidthGBs || DEFAULT_BANDWIDTH_GBS;
    const weightGb = Math.max(model.vram_weight_gb || model.vram_req_gb, 0.1);
    const estimatedTps = (bandwidth * SUSTAINED_THROUGHPUT_EFFICIENCY) / weightGb;

    if (estimatedTps >= 30) {
        return {
            level: 'blistering',
            label: '🟢 Blistering (30–60+ t/s)',
            badge_class: 'badge-speed-blistering',
            tps: '30–60+ t/s',
            desc: '100% inside GPU VRAM, small relative to your GPU’s memory bandwidth'
        };
    }
    if (estimatedTps >= 12) {
        return {
            level: 'moderate',
            label: '🟡 Moderate (12–25 t/s)',
            badge_class: 'badge-speed-moderate',
            tps: '12–25 t/s',
            desc: 'Fits in VRAM, but sized large enough relative to your GPU to slow decoding'
        };
    }
    return {
        level: 'slow',
        label: '🟠 Slow (fits, but <12 t/s)',
        badge_class: 'badge-speed-slow',
        tps: '<12 t/s',
        desc: 'Fits in VRAM, but this model is large relative to your GPU’s memory bandwidth'
    };
}

// Helper: Workflow Suitability Badging
export function getSuitabilityTag(goal, heroKey) {
    if (heroKey === 'speed_demon') return '⚡ Fast Autocomplete & Low Latency';
    if (goal === 'coding') return '💻 Ideal for VS Code & Cline Integration';
    if (goal === 'chat') return '💬 Great for Local RAG & Long Docs';
    if (goal === 'vision') return '👁️ Ideal for Document OCR & Visual Q&A';
    if (goal === 'image-gen') return '🎨 High-Resolution Visual Generation';
    return '✨ High Accuracy Workflow';
}

function parseParamsInBillions(repoId, tags) {
    for (let tag of tags) {
        let t = String(tag).toLowerCase();
        if (t.startsWith('params:')) {
            let val = t.replace('params:', '').trim();
            if (val.endsWith('b')) return parseFloat(val) || 7.0;
            if (val.endsWith('m')) return (parseFloat(val) || 700) / 1000.0;
        }
    }

    const match = repoId.match(/(?:^|[\-_/\s])(\d+(?:\.\d+)?)\s*[bB](?:[\-_/\s]|$)/);
    if (match) {
        const val = parseFloat(match[1]);
        if (val >= 0.05 && val <= 500) return val;
    }

    const matchM = repoId.match(/(?:^|[\-_/\s])(\d+(?:\.\d+)?)\s*[mM](?:[\-_/\s]|$)/);
    if (matchM) {
        const val = parseFloat(matchM[1]);
        if (val >= 10 && val <= 2000) return val / 1000.0;
    }

    const lower = repoId.toLowerCase();
    if (lower.includes('70b')) return 70.0;
    if (lower.includes('33b')) return 33.0;
    if (lower.includes('32b')) return 32.0;
    if (lower.includes('30b')) return 30.0;
    if (lower.includes('27b')) return 27.0;
    if (lower.includes('14b')) return 14.0;
    if (lower.includes('12b')) return 12.0;
    if (lower.includes('11b')) return 11.0;
    if (lower.includes('9b')) return 9.0;
    if (lower.includes('8b')) return 8.0;
    if (lower.includes('7b')) return 7.0;
    if (lower.includes('3b')) return 3.0;
    if (lower.includes('1.5b')) return 1.5;
    if (lower.includes('flux')) return 12.0;
    if (lower.includes('sdxl')) return 3.5;

    return 7.0;
}

function getFallbackModels(goal) {
    if (goal === 'coding') {
        return [
            { id: 'mradermacher/Llama3.3-coder-70b-GGUF', downloads: 550000, likes: 3200, tags: ['code', '70b', 'gguf'] },
            { id: 'unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF', downloads: 1150000, likes: 2100, tags: ['code', 'gguf'] },
            { id: 'Qwen/Qwen2.5-Coder-14B-Instruct-GGUF', downloads: 890000, likes: 2800, tags: ['code', 'gguf'] },
            { id: 'Qwen/Qwen2.5-Coder-7B-Instruct-GGUF', downloads: 1250000, likes: 3400, tags: ['code', 'gguf'] },
            { id: 'Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF', downloads: 950000, likes: 1400, tags: ['code', 'gguf'] }
        ];
    } else if (goal === 'image-gen') {
        return [
            { id: 'city96/FLUX.1-schnell-gguf', downloads: 3200000, likes: 6500, tags: ['flux', 'gguf'] },
            { id: 'city96/FLUX.1-dev-gguf', downloads: 2800000, likes: 7800, tags: ['flux', 'gguf'] },
            { id: 'bartowski/stable-diffusion-xl-base-1.0-GGUF', downloads: 4500000, likes: 8900, tags: ['sdxl', 'gguf'] }
        ];
    } else if (goal === 'vision') {
        return [
            { id: 'leafspark/Llama-3.2-11B-Vision-Instruct-GGUF', downloads: 1100000, likes: 3200, tags: ['vision', 'gguf'] },
            { id: 'Qwen/Qwen2-VL-7B-Instruct-GGUF', downloads: 1400000, likes: 2100, tags: ['vision', 'gguf'] },
            { id: 'vikhyatk/moondream2-gguf', downloads: 850000, likes: 2700, tags: ['vision', 'gguf'] }
        ];
    } else {
        return [
            { id: 'unsloth/Llama-3.3-70B-Instruct-GGUF', downloads: 1800000, likes: 4100, tags: ['llama', '70b', 'gguf'] },
            { id: 'bartowski/DeepSeek-R1-Distill-Qwen-14B-GGUF', downloads: 3100000, likes: 5600, tags: ['reasoning', 'gguf'] },
            { id: 'bartowski/DeepSeek-R1-Distill-Qwen-8B-GGUF', downloads: 3100000, likes: 5600, tags: ['reasoning', 'gguf'] },
            { id: 'bartowski/Meta-Llama-3.1-8B-Instruct-GGUF', downloads: 5200000, likes: 9800, tags: ['llama', 'gguf'] }
        ];
    }
}

// --- Client-Side 4-Tier Recommendation Engine ---
export async function runClientSideEngine(params) {
    let searchQueries = [];
    let searchTerm = params.query.trim();

    if (params.goal === 'coding') {
        searchQueries = searchTerm ? [`${searchTerm} gguf`] : ['coder 70b gguf', 'coder 32b gguf', 'coder 14b gguf', 'coder 7b gguf', 'coder gguf'];
    } else if (params.goal === 'image-gen') {
        searchQueries = searchTerm ? [`${searchTerm} gguf`] : ['flux gguf', 'sdxl gguf', 'diffusers gguf'];
    } else if (params.goal === 'vision') {
        searchQueries = searchTerm ? [`${searchTerm} gguf`] : ['vision 70b gguf', 'vision 11b gguf', 'vision gguf'];
    } else if (params.goal === 'chat') {
        searchQueries = searchTerm ? [`${searchTerm} gguf`] : ['70b instruct gguf', '32b instruct gguf', '8b instruct gguf', 'instruct gguf'];
    }

    let uniqueMap = {};
    const seedList = getFallbackModels(params.goal);
    seedList.forEach(seed => { uniqueMap[seed.id] = seed; });

    let anyLiveResults = false;
    for (let q of searchQueries) {
        try {
            const url = `https://huggingface.co/api/models?search=${encodeURIComponent(q)}&sort=downloads&limit=15`;
            const hfRes = await fetch(url);
            if (hfRes.ok) {
                const items = await hfRes.json();
                if (items.length > 0) anyLiveResults = true;
                items.forEach(m => {
                    if (m.id && (!uniqueMap[m.id] || (m.downloads || 0) > (uniqueMap[m.id].downloads || 0))) {
                        uniqueMap[m.id] = m;
                    }
                });
            }
        } catch (e) {}
    }

    let rawModels = Object.values(uniqueMap);
    // If every live Hugging Face search failed (network/CORS/rate-limit), we're
    // left with only the hardcoded seed list, which otherwise silently ignores
    // whatever the user typed in the search box. Filter it so the search box
    // still does something, and mark the batch as 'fallback' so the UI can tell
    // the user they're seeing a small offline sample, not live results.
    if (!anyLiveResults && searchTerm) {
        const needle = searchTerm.toLowerCase();
        const filtered = rawModels.filter(m => (m.id || '').toLowerCase().includes(needle) || (m.tags || []).some(t => String(t).toLowerCase().includes(needle)));
        if (filtered.length > 0) rawModels = filtered;
    }
    const dataSource = anyLiveResults ? 'live' : 'fallback';
    const cpuOnly = params.gpuVendor === 'cpu';
    // Mirrors backend/engine.py's score_models cpu_only branch: no VRAM
    // concept exists in CPU mode, so the fit-gate budget becomes system RAM
    // minus a fixed OS/app reserve instead (see getEffectiveBudgetGb).
    const userVram = getEffectiveBudgetGb(params);
    const kvOverhead = getKvCacheOverhead(params.contextK || 16);
    const gpuBandwidth = estimateBandwidthGBs(params.gpuVendor, params.gpuBaseVram);
    const surviving = [];

    rawModels.forEach(m => {
        const repoId = m.id || m.modelId || '';
        const tags = m.tags || [];
        const downloads = m.downloads || 0;
        const likes = m.likes || 0;

        const repoLower = repoId.toLowerCase();
        const isGguf = repoLower.includes('gguf') ||
                       repoLower.includes('mlx') ||
                       tags.some(t => String(t).toLowerCase().includes('gguf') || String(t).toLowerCase().includes('mlx'));

        if (!isGguf) return;

        const paramsB = parseParamsInBillions(repoId, tags);
        const vramWeight = Math.round((((paramsB * 4) / 8.0) * 1.25) * 100) / 100;
        const vramReqTotal = Math.round((vramWeight + kvOverhead) * 100) / 100;

        // Tolerance matches backend/engine.py's run_pipeline (1.02x) - was 1.05x here,
        // letting the client-side fallback admit models the backend would reject.
        if (vramReqTotal <= userVram * 1.02) {
            const vramPct = Math.min(Math.round((vramReqTotal / userVram) * 1000) / 10, 100);
            const trendingScore = (likes * 1.5) + (downloads * 0.01);

            // Keyword lists and boost values mirror backend/engine.py's task_relevance_boost
            // exactly (kept in sync by hand - there's no shared module between Python and
            // this client-side fallback). This used to only cover 'coding'/'image-gen' with
            // a shorter keyword list, silently leaving 'vision' and 'chat' goals unboosted
            // whenever the fallback engine served a request.
            const tagsLower = tags.map(t => String(t).toLowerCase());
            const matchesAny = (keywords) => keywords.some(k => repoLower.includes(k) || tagsLower.includes(k));
            let taskBoost = 1.0;
            if (params.goal === 'coding') {
                if (matchesAny(['code', 'coder', 'starcoder', 'codellama', 'python', 'rust', 'codestral', 'sql'])) taskBoost = 1.35;
            } else if (params.goal === 'image-gen') {
                if (matchesAny(['diffusers', 'flux', 'sdxl', 'stable-diffusion', 'text-to-image'])) taskBoost = 1.4;
            } else if (params.goal === 'vision') {
                if (matchesAny(['vision', 'vlm', 'multimodal', 'llava', 'moondream', 'paligemma', 'image-to-text'])) taskBoost = 1.4;
            } else if (params.goal === 'chat') {
                if (matchesAny(['instruct', 'chat', 'r1', 'reasoning', 'llama', 'gemma', 'qwen'])) taskBoost = 1.25;
            }

            const nameParts = repoId.split('/');
            const author = nameParts.length > 1 ? nameParts[0] : 'Community';
            const name = nameParts.length > 1 ? nameParts[1] : repoId;
            const speedObj = getGenerationSpeed({ vram_req_gb: vramReqTotal, vram_weight_gb: vramWeight, params_b: paramsB }, userVram, gpuBandwidth, cpuOnly);

            surviving.push({
                id: repoId,
                name: name,
                author: author,
                params_b: paramsB,
                vram_req_gb: vramReqTotal,
                vram_weight_gb: vramWeight,
                kv_overhead_gb: kvOverhead,
                context_k: params.contextK || 16,
                vram_usage_pct: vramPct,
                downloads: downloads,
                likes: likes,
                trending_score: trendingScore,
                task_boost: taskBoost,
                generation_speed: speedObj,
                // Uniform defaults on every row (mirrors backend/engine.py's
                // score_models) - the verification pass below only actually
                // checks a bounded slice of this list, so everything outside
                // that slice keeps these honest "not checked" defaults rather
                // than silently looking identical to a verified row.
                vram_source: 'estimated',
                kv_overhead_source: 'estimated',
                verified_gguf: null,
                hero_eligible: true,
                cpu_only: cpuOnly,
                run_instructions: {
                    ollama: `ollama run ${name.toLowerCase()}`,
                    vllm: `python -m vllm.entrypoints.openai.api_server --model ${repoId}`,
                    transformers: `from transformers import AutoModelForCausalLM, AutoTokenizer\n\nmodel = AutoModelForCausalLM.from_pretrained('${repoId}', device_map='auto')`
                }
            });
        }
    });

    const maxDl = Math.log1p(Math.max(...surviving.map(m => m.downloads), 1));
    const maxLikes = Math.log1p(Math.max(...surviving.map(m => m.likes), 1));
    const maxTrend = Math.log1p(Math.max(...surviving.map(m => m.trending_score), 1));

    surviving.forEach(m => {
        const normDl = maxDl > 0 ? Math.log1p(m.downloads) / maxDl : 0;
        const normLikes = maxLikes > 0 ? Math.log1p(m.likes) / maxLikes : 0;
        const normTrend = maxTrend > 0 ? Math.log1p(m.trending_score) / maxTrend : 0;
        let baseScore = (0.4 * normDl) + (0.4 * normLikes) + (0.2 * normTrend);
        let finalScore = baseScore * m.task_boost * 100;

        if (m.likes === 0 && m.downloads < 10000) {
            finalScore *= 0.25;
        }

        m.recommendation_score = Math.round(finalScore * 10) / 10;
    });

    // task_boost is applied after normalizing to a 0-100 scale, so a strong task
    // match can push recommendation_score past 100. Rescale the whole batch down
    // so the top score is exactly 100 when that happens; ordering is unaffected.
    const topScore = surviving.reduce((max, m) => Math.max(max, m.recommendation_score), 0);
    if (topScore > 100) {
        const scaleFactor = 100 / topScore;
        surviving.forEach(m => { m.recommendation_score = Math.round(m.recommendation_score * scaleFactor * 10) / 10; });
    }

    surviving.sort((a, b) => b.recommendation_score - a.recommendation_score);

    // Real GGUF verification runs BEFORE hero selection, over a bounded slice of
    // the pool - not just the eventual 3 winners after the fact. `isGguf` above
    // (the ingestion-time gate) is a cheap tag/substring heuristic, not a real
    // check against the repo's actual files, so a model that heuristically looks
    // GGUF-tagged but isn't could otherwise win a hero slot with fully-computed
    // but fake quantized VRAM numbers. Mirrors backend/main.py's verification
    // ordering (kept in sync by hand, same as everything else in this file).
    //
    // Bounded set: top ~6 by score (covers best_overall/max_capability) + bottom
    // ~2 by params_b (covers speed_demon) among the vetted pool - smaller than
    // the backend's ~15 since this runs synchronously in the user's own browser.
    const vettedForVerification = surviving.filter(m => (m.downloads || 0) >= 1000 && (m.likes || 0) >= 5);
    const verificationPool = vettedForVerification.length > 0 ? vettedForVerification : surviving;
    const topByScore = [...verificationPool].sort((a, b) => b.recommendation_score - a.recommendation_score).slice(0, 6);
    const bottomByParams = [...verificationPool].sort((a, b) => a.params_b - b.params_b).slice(0, 2);
    const verificationCandidates = [...new Map([...topByScore, ...bottomByParams].map(m => [m.id, m])).values()];

    const verifyContextK = params.contextK || 16;
    await Promise.all(verificationCandidates.map(async (m) => {
        const verified = await getExactGgufInfo(m.id, 4, verifyContextK); // client engine always sizes weights at 4-bit today

        if (verified && verified.exactWeightGb) {
            m.vram_weight_gb = verified.exactWeightGb;
            m.vram_source = 'exact';
            m.verified_gguf = true;
            m.matched_quant_files = verified.matchedFiles;
            if (verified.exactParamsB) m.exact_params_b = verified.exactParamsB;
            if (verified.nativeContextLength) m.native_context_length = verified.nativeContextLength;
        } else {
            // Actually looked up and found no real .gguf file - distinct from
            // "never checked" (verified_gguf stays null on every model outside
            // this verification slice). Excluded from hero eligibility below,
            // but kept in the table with this flag rather than hidden outright.
            m.vram_source = 'estimated';
            m.verified_gguf = false;
            m.hero_eligible = false;
        }

        if (verified && verified.exactKvOverheadGb) {
            m.kv_overhead_gb = verified.exactKvOverheadGb;
            m.kv_overhead_source = 'exact';
            m.kv_architecture = verified.kvArchitecture;
        } else {
            m.kv_overhead_source = 'estimated';
        }

        // Recompute totals once, after both pieces (weight, KV) have had their
        // chance to be upgraded independently - either, both, or neither may
        // have come back exact.
        m.vram_req_gb = Math.round((m.vram_weight_gb + m.kv_overhead_gb) * 100) / 100;
        m.vram_usage_pct = Math.min(Math.round((m.vram_req_gb / userVram) * 1000) / 10, 100);
        // Re-derive the speed badge too, now that vram_weight_gb may have been
        // upgraded from the params-based estimate to the model's real file size.
        m.generation_speed = getGenerationSpeed(m, userVram, gpuBandwidth, cpuOnly);
    }));

    const vettedPool = surviving.filter(m => (m.downloads || 0) >= 1000 && (m.likes || 0) >= 5);
    let heroPool = (vettedPool.length > 0 ? vettedPool : surviving).filter(m => m.hero_eligible !== false);
    if (heroPool.length === 0) {
        // Everything vetted failed real verification - fall back to the full
        // scored list rather than showing empty hero cards, still respecting
        // hero_eligible where possible.
        const eligibleAll = surviving.filter(m => m.hero_eligible !== false);
        heroPool = eligibleAll.length > 0 ? eligibleAll : surviving;
    }

    // Range matches backend/engine.py's sweet_spot (60-88%) - was 48-92% here, a
    // wider window that could pick a different "Best Overall" than the backend
    // would for the identical candidate list depending on which engine answered.
    const sweetSpot = heroPool.filter(m => m.vram_usage_pct >= 60 && m.vram_usage_pct <= 88);
    const heroBest = sweetSpot.length > 0 ? sweetSpot[0] : (heroPool[0] || null);

    const speedCandidates = heroPool.filter(m => m.vram_usage_pct <= 45);
    let heroSpeed = null;
    if (speedCandidates.length > 0) {
        speedCandidates.sort((a, b) => a.params_b - b.params_b || b.recommendation_score - a.recommendation_score);
        heroSpeed = speedCandidates[0];
    } else {
        heroSpeed = [...heroPool].sort((a, b) => a.params_b - b.params_b)[0] || heroBest;
    }

    const maxCandidates = [...heroPool].sort((a, b) => b.params_b - a.params_b || b.recommendation_score - a.recommendation_score);
    let heroMax = maxCandidates[0] || heroBest;

    // Backend/engine.py de-dupes the three hero picks (used_ids) so the same model
    // never fills two "different" hero slots; that logic wasn't ported here, so a
    // small candidate pool could show one model recommended 2-3 times under
    // different labels. Mirror the backend's reassignment approach, searching
    // heroPool (already filtered to hero-eligible) for a replacement.
    const usedIds = new Set();
    if (heroBest) usedIds.add(heroBest.id);

    if (heroSpeed && usedIds.has(heroSpeed.id)) {
        const others = heroPool.filter(m => !usedIds.has(m.id));
        if (others.length > 0) {
            heroSpeed = [...others].sort((a, b) => a.params_b - b.params_b)[0];
        }
    }
    if (heroSpeed) usedIds.add(heroSpeed.id);

    if (heroMax && usedIds.has(heroMax.id)) {
        const others = heroPool.filter(m => !usedIds.has(m.id));
        if (others.length > 0) {
            heroMax = [...others].sort((a, b) => b.params_b - a.params_b)[0];
        }
    }

    return {
        source: dataSource,
        hero_cards: {
            best_overall: heroBest,
            speed_demon: heroSpeed,
            max_capability: heroMax
        },
        all_candidates: surviving,
        total_candidates: surviving.length
    };
}
