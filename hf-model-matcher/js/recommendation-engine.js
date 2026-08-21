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

// Helper: KV-Cache Overhead Calculator
function getKvCacheOverhead(contextK) {
    const map = { 4: 0.4, 8: 0.8, 16: 1.5, 32: 3.5, 64: 5.5, 128: 8.0 };
    return map[contextK] || 1.5;
}

// Helper: Generation Speed Status Rating
export function getGenerationSpeed(vramReqTotal, userVramGb) {
    const pct = (vramReqTotal / Math.max(userVramGb, 1.0)) * 100.0;
    if (vramReqTotal <= userVramGb) {
        if (pct <= 80.0) {
            return {
                level: 'blistering',
                label: '🟢 Blistering (30–60+ t/s)',
                badge_class: 'badge-speed-blistering',
                tps: '30–60+ t/s',
                desc: '100% inside GPU VRAM'
            };
        } else {
            return {
                level: 'moderate',
                label: '🟡 Moderate (12–25 t/s)',
                badge_class: 'badge-speed-moderate',
                tps: '12–25 t/s',
                desc: 'Fits in VRAM with tight context room'
            };
        }
    } else {
        return {
            level: 'spillover',
            label: '🔴 Slow Spillover (2–8 t/s)',
            badge_class: 'badge-speed-spillover',
            tps: '2–8 t/s',
            desc: 'Pushed past GPU VRAM into System RAM'
        };
    }
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
    const userVram = Math.max(params.vramGb, 1.0);
    const kvOverhead = getKvCacheOverhead(params.contextK || 16);
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

        if (vramReqTotal <= userVram * 1.05) {
            const vramPct = Math.min(Math.round((vramReqTotal / userVram) * 1000) / 10, 100);
            const trendingScore = (likes * 1.5) + (downloads * 0.01);

            let taskBoost = 1.0;
            if (params.goal === 'coding' && (repoLower.includes('code') || repoLower.includes('coder'))) taskBoost = 1.35;
            if (params.goal === 'image-gen' && (repoLower.includes('flux') || repoLower.includes('sdxl'))) taskBoost = 1.4;

            const nameParts = repoId.split('/');
            const author = nameParts.length > 1 ? nameParts[0] : 'Community';
            const name = nameParts.length > 1 ? nameParts[1] : repoId;
            const speedObj = getGenerationSpeed(vramReqTotal, userVram);

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

    const vettedPool = surviving.filter(m => (m.downloads || 0) >= 1000 && (m.likes || 0) >= 5);
    const heroPool = vettedPool.length > 0 ? vettedPool : surviving;

    const sweetSpot = heroPool.filter(m => m.vram_usage_pct >= 48 && m.vram_usage_pct <= 92);
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
