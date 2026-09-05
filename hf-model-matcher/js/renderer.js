/* ==========================================================================
   RENDERER MODULE
   Builds the hero-card and candidate-list DOM from a recommendation result
   (whichever engine produced it - backend API or the client-side fallback).

   Extracted from app.js (module #4 of the incremental split). Depends on
   recommendation-engine.js for per-model speed/suitability labels. Does NOT
   own the "Setup Guide" launcher modal (openCodeModal) - that's still
   defined in app.js until modal.js is extracted next - so renderResults()
   takes an `onLaunchClick` callback instead of importing app.js directly.
   ========================================================================== */
import { getGenerationSpeed, getSuitabilityTag } from './recommendation-engine.js';
import { estimateBandwidthGBs, getEffectiveBudgetGb, budgetLabel } from './gpu-catalog.js';

// --- DOM Elements ---
const heroContainer = document.getElementById('hero-cards-container');
const candidatesContainer = document.getElementById('candidates-container');
const totalCandidatesCount = document.getElementById('total-candidates-count');
const dataSourceNotice = document.getElementById('data-source-notice');

// --- Loading / error states shown while triggerRecommendations() is in flight ---
export function showLoadingState() {
    if (heroContainer) {
        heroContainer.innerHTML = '<div style="grid-column: span 3; text-align: center; padding: 40px; color: #94A3B8;">Searching Hugging Face models & computing Tier-1 VRAM + KV-Cache budget...</div>';
    }
}

export function showErrorState(message) {
    if (heroContainer) {
        heroContainer.innerHTML = `<div style="grid-column: span 3; text-align: center; padding: 30px; color: #EF4444;">Error fetching recommendations: ${message}</div>`;
    }
}

/* ==========================================================================
   HERO CARD JUSTIFICATION ("Why this pick?")
   Reconstructs, in plain English, exactly what the selection code in
   backend/engine.py (or its client-side mirror in recommendation-engine.js)
   did to land on this specific model for this specific hero slot - using
   only numbers already present on the model object and the candidate batch,
   so it can never drift out of sync with a value the math didn't actually
   produce. Kept honest on purpose: this describes the real ranking signal
   (Hugging Face popularity + goal-keyword relevance), not a claim of
   benchmarked quality.
   ========================================================================== */
function buildRoleRationale(cfg, model, state, candidates) {
    if (!cfg || !cfg.key) return buildRankRationale(model, state, candidates);
    const vramPct = model.vram_usage_pct;
    // Real budget figure + unit word, not state.vramGb - in CPU mode that's a
    // stale/unused GPU number that would otherwise contradict the percentage
    // right next to it (already computed against the real RAM-derived budget).
    const budgetGb = Math.round(getEffectiveBudgetGb(state) * 10) / 10;
    const unit = budgetLabel(state);
    if (cfg.key === 'best_overall') {
        const vettingNote = ` Hero cards only draw from models with at least 1,000 downloads <em>and</em> 5 likes &mdash; downloads alone can come from tooling/mirrors with no human behind them, so likes are required too before a model can headline a pick.`;
        if (vramPct >= 60 && vramPct <= 88) {
            return `<strong>Best Overall</strong> is chosen from the models using <strong>60&ndash;88%</strong> of your ${budgetGb}GB ${unit} budget &mdash; enough headroom to avoid out-of-memory errors and leave room for your context window, without leaving a bigger, better-fitting model on the table. This model uses <strong>${vramPct}%</strong>, landing right in that window, and had the highest popularity + relevance score among the candidates that did.${vettingNote}`;
        }
        return `No candidate landed in the ideal 60&ndash;88% ${unit} "sweet spot" for your ${budgetGb}GB budget on this search, so <strong>Best Overall</strong> fell back to the single highest popularity + relevance score among everything that fit at all. This model uses <strong>${vramPct}%</strong> of your budget.${vettingNote}`;
    }
    if (cfg.key === 'speed_demon') {
        if (vramPct <= 45) {
            return `<strong>Speed Demon</strong> is the <em>smallest</em> model (by parameter count) using <strong>45% or less</strong> of your ${unit} budget &mdash; guaranteeing it runs fully inside ${unit} with headroom to spare, for the fastest, most consistent tokens/sec even with other apps open. This model uses ${vramPct}%.`;
        }
        return `No candidate fit under the 45% ${unit} threshold on this search, so <strong>Speed Demon</strong> fell back to the smallest available model by parameter count (${model.params_b}B), which still uses ${vramPct}% of your budget.`;
    }
    if (cfg.key === 'max_capability') {
        const paramsB = model.exact_params_b || model.params_b;
        return `<strong>Max Capability</strong> is the <em>largest</em> model (by parameter count) that still fits inside your ${unit} budget at ${model.active_quant_bits || 4}-bit quantization &mdash; maximizing reasoning depth and answer quality, at the cost of some speed headroom. At ${paramsB}B parameters, it's the biggest one your ${budgetGb}GB budget can hold.`;
    }
    return '';
}

// Generic per-row rationale for the candidate table (any rank, not just the 3
// fixed hero slots) - describes where this specific model landed and why,
// using only numbers already on the model object and the candidate batch.
function buildRankRationale(model, state, candidates) {
    const poolSize = (candidates || []).length || 1;
    const rankIdx = (candidates || []).findIndex(c => c.id === model.id);
    const rank = rankIdx >= 0 ? rankIdx + 1 : poolSize;

    let verifiedNote = '';
    if (model.verified_gguf === true) {
        verifiedNote = ' Its real GGUF file was independently verified against the repo on Hugging Face.';
    } else if (model.verified_gguf === false) {
        verifiedNote = ' <strong style="color:#FBBF24;">⚠ Heads up:</strong> when checked, this repo could not be confirmed to have a real quantized (GGUF) file - it may not actually be downloadable/runnable as shown, despite the VRAM math below.';
    }

    const budgetGb = Math.round(getEffectiveBudgetGb(state) * 10) / 10;
    const unit = budgetLabel(state);
    return `This model ranked <strong>#${rank}</strong> of ${poolSize} candidates found for your "${state.goal}" search, scoring <strong>${model.recommendation_score}/100</strong> (see the popularity/relevance math below). It uses <strong>${model.vram_usage_pct}%</strong> of your ${budgetGb}GB ${unit} budget at ${model.active_quant_bits || 4}-bit quantization.${verifiedNote}`;
}

function buildKvCacheLine(model, contextK) {
    if (model.kv_overhead_source === 'exact' && model.kv_architecture) {
        const arch = model.kv_architecture;
        const kvHeadNote = arch.isGqa
            ? ` (this model uses grouped-query attention &mdash; only ${arch.numKeyValueHeads} KV heads vs ${arch.numAttentionHeads} query heads, which is why this differs from a generic estimate)`
            : '';
        return `Plus <strong>${model.kv_overhead_gb} GB</strong> for KV-cache at ${contextK}k context &mdash; calculated from this model's actual architecture (${arch.numHiddenLayers} layers, ${arch.numKeyValueHeads} KV heads, ${arch.hiddenSize / arch.numAttentionHeads}-dim per head), not a generic table${kvHeadNote}.`;
    }
    return `Plus <strong>${model.kv_overhead_gb} GB</strong> reserved for KV-cache at your ${contextK}k-token context setting (a generic estimate by context size only &mdash; we couldn't confirm this model's real architecture to compute it exactly).`;
}

function buildVramMath(model, state) {
    const quantBits = model.active_quant_bits || 4;
    const contextK = model.context_k || state.contextK;
    const kvLine = `${buildKvCacheLine(model, contextK)} Total: <strong>${model.vram_req_gb} GB</strong> &mdash; ${model.vram_usage_pct}% of your ${state.vramGb} GB budget.`;

    if (model.vram_source === 'exact') {
        const filesLabel = (model.matched_quant_files || []).length > 1
            ? `${model.matched_quant_files.length} split files`
            : (model.matched_quant_files || [])[0] || 'the matching quant file';
        const paramsNote = model.exact_params_b
            ? ` (${model.exact_params_b}B parameters, read directly from the file's own GGUF metadata rather than guessed from the repo name)`
            : '';
        return `<strong>${model.vram_weight_gb} GB</strong> is this model's <em>actual</em> file size on Hugging Face &mdash; not an estimate &mdash; verified against ${filesLabel}${paramsNote}. ${kvLine}`;
    }

    const rawGb = ((model.params_b * quantBits) / 8).toFixed(2);
    return `${model.params_b}B params (estimated from the repo name) &times; ${quantBits}-bit &divide; 8 = <strong>${rawGb} GB</strong> raw weights. &times;1.25 for runtime/framework overhead &asymp; <strong>${model.vram_weight_gb} GB</strong> (we couldn't verify this one's exact file size against the Hub, so this is the formula estimate). ${kvLine}`;
}

function buildScoreMath(model, candidates, state) {
    const poolSize = candidates.length || 1;
    const boostNote = model.task_boost > 1
        ? ` Because its name/tags matched your "${state.goal}" goal, it also got a &times;${model.task_boost} relevance boost.`
        : ` It didn't match any "${state.goal}"-specific keywords, so no relevance boost was applied.`;
    return `Downloads (${model.downloads.toLocaleString()}) and likes (${model.likes.toLocaleString()}) are each log-scaled against the highest value seen among the ${poolSize} candidates found for this search &mdash; so one viral model can't swamp the scale &mdash; then combined as <strong>40% downloads + 40% likes + 20% trending momentum</strong> (momentum = likes&times;1.5 + downloads&times;0.01 = ${Math.round(model.trending_score).toLocaleString()}).${boostNote} If the top score in this batch would've exceeded 100, every score was scaled down proportionally so it tops out at 100 &mdash; rank order is unaffected. Final: <strong>${model.recommendation_score} / 100</strong>.`;
}

function buildJustificationHTML(model, cfg, state, candidates) {
    return `
        <details class="hero-justification">
            <summary>Why this pick? 🔍</summary>
            <div class="hero-justification-body">
                <p>${buildRoleRationale(cfg, model, state, candidates)}</p>
                <p><strong>VRAM math:</strong> ${buildVramMath(model, state)}</p>
                <p><strong>Popularity/relevance score:</strong> ${buildScoreMath(model, candidates, state)}</p>
                <p class="hero-justification-caveat">The VRAM number is deterministic math (exact when verified, a documented formula otherwise) &mdash; you can check it yourself. The score is a Hugging Face popularity + goal-relevance heuristic, a proxy for "well-vetted, likely to work well," not an independent benchmark of output quality.</p>
            </div>
        </details>
    `;
}

// Collapsed "+N more quantizations" sub-list for near-duplicate quant/format
// variants of the same base model (see groupByBaseModel in
// candidate-filters.js, wired in from app.js's refreshCandidateView()).
// `variants` is the array attached to a candidate's `_variants` property, or
// undefined/empty when this model wasn't grouped with anything - in which
// case this renders nothing.
function buildVariantGroupHTML(variants) {
    if (!variants || variants.length === 0) return '';
    const rows = variants.map(v => `
        <div class="variant-row">
            <span title="${v.id}">${v.id}</span>
            <span style="display:flex; gap:8px; align-items:center;">
                <span class="stat-pill" style="font-size: 11px;">Score: ${v.recommendation_score}</span>
                <button class="btn-action btn-copy-model-id" data-id="${v.id}" style="padding: 3px 8px; font-size: 11px;" title="Copy exact Model ID for LM Studio / Ollama">Copy ID 📋</button>
                <button class="btn-action primary btn-launch" data-repoid="${v.id}" style="padding: 3px 8px; font-size: 11px;" title="Get the download link and step-by-step setup instructions">Setup ⚡</button>
            </span>
        </div>
    `).join('');
    return `
        <details class="variant-group">
            <summary>+${variants.length} more quantization${variants.length > 1 ? 's' : ''} of this model ▾</summary>
            ${rows}
        </details>
    `;
}

// --- Main Renderer ---
// `onLaunchClick(repoId)` is called when a hero card's or candidate row's
// "Setup Guide" / "Setup" button is clicked - app.js passes its
// (still-local) openCodeModal function in for this.
export function renderResults(data, { state, onLaunchClick }) {
    const hero = data.hero_cards;
    const candidates = data.all_candidates || [];
    if (totalCandidatesCount) totalCandidatesCount.textContent = data.total_candidates || 0;

    if (dataSourceNotice) {
        dataSourceNotice.style.display = data.source === 'fallback' ? 'flex' : 'none';
    }

    // Effective hardware-fit budget & speed-model mode for this render pass -
    // computed once here rather than per-model, since neither depends on the
    // model being displayed (see getEffectiveBudgetGb/budgetLabel in
    // gpu-catalog.js for the CPU/RAM-only vs GPU/VRAM swap).
    const cpuOnly = state.gpuVendor === 'cpu';
    const effectiveBudgetGb = getEffectiveBudgetGb(state);
    const budgetWord = budgetLabel(state);

    if (heroContainer) {
        heroContainer.innerHTML = '';

        const cardConfigs = [
            { key: 'best_overall', title: '🏆 Best Overall', typeClass: 'best-overall', badgeClass: 'badge-best', sub: 'Optimal Quality & Hardware Fit' },
            { key: 'speed_demon', title: '🚀 Speed Demon', typeClass: 'speed-demon', badgeClass: 'badge-speed', sub: 'Low Latency & High Tokens/sec' },
            { key: 'max_capability', title: '🧠 Max Capability', typeClass: 'max-capability', badgeClass: 'badge-max', sub: 'Maximum Parameter Budget' }
        ];

        cardConfigs.forEach(cfg => {
            const model = hero[cfg.key];
            if (!model) return;

            const vramPct = model.vram_usage_pct;
            let barColorClass = 'fill-green';
            if (vramPct > 80) barColorClass = 'fill-coral';
            else if (vramPct > 60) barColorClass = 'fill-amber';

            const speed = model.generation_speed || getGenerationSpeed(model, effectiveBudgetGb, estimateBandwidthGBs(state.gpuVendor, state.gpuBaseVram), cpuOnly);
            const suitabilityTag = getSuitabilityTag(state.goal, cfg.key);

            // Weight size and KV-cache size are verified independently (different
            // data sources, different failure modes), so the badge is precise about
            // which piece(s) of the total are real numbers vs formula estimates.
            const weightExact = model.vram_source === 'exact';
            const kvExact = model.kv_overhead_source === 'exact';
            let vramBadge = '';
            if (weightExact && kvExact) {
                vramBadge = ' <span class="vram-verified-badge" title="Both weight size and KV-cache size verified against real data (the actual .gguf file, and this model\'s real architecture)">✓ verified</span>';
            } else if (weightExact) {
                vramBadge = ' <span class="vram-verified-badge" title="Weight size verified against the actual .gguf file on Hugging Face (KV-cache is still a generic estimate)">✓ weight verified</span>';
            } else if (kvExact) {
                vramBadge = ' <span class="vram-verified-badge" title="KV-cache size calculated from this model\'s real architecture (weight size is still a formula estimate)">✓ KV verified</span>';
            }

            const cardEl = document.createElement('div');
            cardEl.className = `hero-card ${cfg.typeClass}`;
            cardEl.innerHTML = `
                <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <div class="badge-tier ${cfg.badgeClass}">${cfg.title}</div>
                        <!-- STAGE 1: Visual Generation Speed Gauge Badge -->
                        <span class="stat-pill ${speed.badge_class || 'badge-speed-blistering'}" style="font-weight: 700; font-size: 11px;" title="${speed.desc}">${speed.label}</span>
                    </div>

                    <div class="model-name" title="${model.id}">${model.name}</div>
                    <div class="model-author">by ${model.author} • ${cfg.sub}</div>

                    <!-- STAGE 3: Workflow Suitability Tag -->
                    <div class="tag-suitability">${suitabilityTag}</div>

                    <div class="vram-bar-container" style="margin-top: 10px;" title="VRAM Footprint: Requires ${model.vram_req_gb} GB (Model: ${model.vram_weight_gb || model.vram_req_gb}GB + KV-Cache: ${model.kv_overhead_gb || 1.5}GB @ ${state.contextK}k tokens)">
                        <div class="vram-label">
                            <span>${budgetWord} (${state.contextK}k Context)${vramBadge}</span>
                            <span><strong>${model.vram_req_gb} GB</strong> (${vramPct}%)</span>
                        </div>
                        <div class="vram-track">
                            <div class="vram-fill ${barColorClass}" style="width: ${Math.min(vramPct, 100)}%;"></div>
                        </div>
                    </div>

                    <div class="stats-row">
                        <span class="stat-pill" title="Model Parameter Size: ${model.params_b} Billion parameters">⚙️ ${model.params_b}B Params</span>
                        <span class="stat-pill" title="Hugging Face Downloads: ${model.downloads.toLocaleString()} downloads">📥 ${(model.downloads / 1000).toFixed(0)}k Downloads</span>
                        <span class="stat-pill" title="Community Upvotes: ${model.likes.toLocaleString()} likes">❤️ ${model.likes} Likes</span>
                    </div>

                    ${buildJustificationHTML(model, cfg, state, candidates)}
                </div>

                <div class="card-actions">
                    <a href="https://huggingface.co/${model.id}" target="_blank" class="btn-action" title="View official model weights on HF Hub">HF Repo ↗</a>
                    <button class="btn-action primary btn-launch" data-repoid="${model.id}" title="Get the download link and step-by-step setup instructions for LM Studio, Ollama, and VS Code / Cline">Setup Guide ⚡</button>
                </div>
            `;

            heroContainer.appendChild(cardEl);
        });

        document.querySelectorAll('.btn-launch').forEach(btn => {
            btn.addEventListener('click', (e) => {
                onLaunchClick(e.target.dataset.repoid);
            });
        });
    }

    if (candidatesContainer) {
        candidatesContainer.innerHTML = '';
        if (candidates.length === 0) {
            candidatesContainer.innerHTML = '<div style="padding: 20px; text-align: center; color: #94A3B8;">No models match your VRAM budget & context window. Try increasing VRAM slider or lowering context window.</div>';
            return;
        }

        candidates.forEach(m => {
            const speed = m.generation_speed || getGenerationSpeed(m, effectiveBudgetGb, estimateBandwidthGBs(state.gpuVendor, state.gpuBaseVram), cpuOnly);
            const unverifiedBadge = m.verified_gguf === false
                ? ' <span class="vram-unverified-badge" title="Checked against Hugging Face and no real GGUF file was found - may not actually be downloadable/runnable as shown">⚠ unverified</span>'
                : '';
            const item = document.createElement('div');
            item.className = 'model-list-item';
            item.innerHTML = `
                <div class="model-list-item-row">
                    <div>
                        <div style="font-weight: 700; font-size: 15px; color: #F8FAFC;" title="${m.id}">${m.id}${unverifiedBadge}</div>
                        <div style="font-size: 12px; color: #94A3B8; margin-top: 2px;" title="Model Parameter Size & Hardware Memory Fit">
                            ${m.params_b}B Params | ${m.vram_req_gb} GB ${budgetWord} required (${m.vram_usage_pct}% of budget @ ${state.contextK}k context)
                        </div>
                    </div>
                    <div style="display: flex; gap: 8px; align-items: center; flex-wrap: wrap;">
                        <span class="stat-pill ${speed.badge_class}" style="font-size: 11px;" title="${speed.desc}">${speed.label}</span>
                        <span class="stat-pill" title="Weighted Community Score">Score: ${m.recommendation_score}</span>
                        <!-- STAGE 2: 1-Click Copy Model ID button -->
                        <button class="btn-action btn-copy-model-id" data-id="${m.id}" style="padding: 4px 10px; font-size: 12px;" title="Copy exact Model ID for LM Studio / Ollama">Copy ID 📋</button>
                        <a href="https://huggingface.co/${m.id}" target="_blank" class="btn-action" style="padding: 4px 10px; font-size: 12px;" title="View official model repo on Hugging Face Hub">HF ↗</a>
                        <button class="btn-action primary btn-launch" data-repoid="${m.id}" style="padding: 4px 10px; font-size: 12px;" title="Get the download link and step-by-step setup instructions">Setup ⚡</button>
                    </div>
                </div>
                ${buildJustificationHTML(m, null, state, candidates)}
                ${buildVariantGroupHTML(m._variants)}
            `;
            candidatesContainer.appendChild(item);
        });

        candidatesContainer.querySelectorAll('.btn-launch').forEach(btn => {
            btn.addEventListener('click', (e) => {
                onLaunchClick(e.target.dataset.repoid);
            });
        });

        // STAGE 2: Candidate Copy Model ID Listener
        candidatesContainer.querySelectorAll('.btn-copy-model-id').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const modelId = e.target.dataset.id;
                navigator.clipboard.writeText(modelId);
                const originalText = e.target.textContent;
                e.target.textContent = 'Copied! ✓';
                setTimeout(() => e.target.textContent = originalText, 2000);
            });
        });
    }
}
