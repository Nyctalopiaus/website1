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

            const speed = model.generation_speed || getGenerationSpeed(model.vram_req_gb, state.vramGb);
            const suitabilityTag = getSuitabilityTag(state.goal, cfg.key);

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
                            <span>VRAM (${state.contextK}k Context)</span>
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
            const speed = m.generation_speed || getGenerationSpeed(m.vram_req_gb, state.vramGb);
            const item = document.createElement('div');
            item.className = 'model-list-item';
            item.innerHTML = `
                <div>
                    <div style="font-weight: 700; font-size: 15px; color: #F8FAFC;" title="${m.id}">${m.id}</div>
                    <div style="font-size: 12px; color: #94A3B8; margin-top: 2px;" title="Model Parameter Size & Hardware Memory Fit">
                        ${m.params_b}B Params | ${m.vram_req_gb} GB VRAM required (${m.vram_usage_pct}% of budget @ ${state.contextK}k context)
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
