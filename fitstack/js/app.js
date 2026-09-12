/* ==========================================================================
   HUGGING FACE MODEL MATCH - HYBRID APPLICATION SCRIPT
   Supports: FastAPI Backend API + Client-Side Fallback Engine + LocalStorage Persistence
   Features: 4-Stage Upgrade (KV-Cache Scaling, Speed Ratings, Tabbed Launchers,
             Quant Matrix, Suitability Badges, Onboarding Assistant)

   This is the entry point; it wires together the modules below rather than
   containing all app logic itself:
     - gpu-catalog.js           static GPU vendor/model reference data
     - hardware-profile.js      GPU/RAM/context controls, presets, auto-detect
     - recommendation-engine.js client-side fallback engine (used when the
                                 FastAPI backend is unreachable)
     - renderer.js              builds hero-card & candidate-list DOM from a
                                 recommendation result
     - modal.js                 setup-guide launcher modal + the quickstart/
                                 quant-matrix/onboarding info modals
   ========================================================================== */
import { populateGpuModels, getGpuModelSelectValue, restoreProfilerUI, initHardwareProfile } from './hardware-profile.js';
import { runClientSideEngine } from './recommendation-engine.js';
import { renderResults, showLoadingState, showErrorState } from './renderer.js';
import { openCodeModal } from './modal.js';
import { applyCandidateFilters, groupByBaseModel } from './candidate-filters.js';

document.addEventListener('DOMContentLoaded', () => {
    const STORAGE_KEY = 'nycto_hf_matcher_state';

    // --- Application State ---
    const state = {
        vramGb: 24.0,       // matches index.html's #vram-slider value="24" (was 64.0 — cold-load mismatch bug)
        ramGb: 64.0,
        contextK: 16,
        gpuVendor: 'nvidia',
        gpuType: 'NVIDIA RTX Series',
        goal: 'coding',
        query: '',
        preferredQuant: 4,
        gpuCount: 1,
        gpuBaseVram: 24.0,  // matches the "24 GB per GPU" badge (was 64.0 — same bug)
        recommendations: null,
        // Candidate-table sort/filter view state. Deliberately NOT persisted to
        // localStorage (see saveStateToStorage/loadStateFromStorage below) - a
        // fresh search shouldn't silently carry over a stale filter from a
        // previous session. Re-sorting/re-filtering never re-fetches from the
        // network - see refreshCandidateView() - it only re-displays whatever
        // state.recommendations.all_candidates already holds.
        candidateSort: 'score_desc',
        candidateFilterQuant: 'all',
        candidateFilterVerified: 'all'
    };

    // --- DOM Elements ---
    // Hardware-profiler elements (sliders, GPU dropdowns, auto-detect) are
    // owned by hardware-profile.js now - see the import above.
    const goalCards = document.querySelectorAll('.goal-card');
    const searchInput = document.getElementById('search-input');
    const btnRefresh = document.getElementById('btn-refresh');
    const candidateSortSelect = document.getElementById('candidate-sort-select');
    const candidateQuantSelect = document.getElementById('candidate-quant-select');
    const candidateVerifiedChips = document.querySelectorAll('[data-verified-filter]');

    // Hero-card & candidate-list containers are owned by renderer.js now -
    // see the import above. Modal DOM elements are owned by modal.js now -
    // see the import above.

    // --- LocalStorage Persistence Helpers ---
    function saveStateToStorage() {
        try {
            const payload = {
                vramGb: state.vramGb,
                ramGb: state.ramGb,
                contextK: state.contextK,
                gpuVendor: state.gpuVendor,
                gpuType: state.gpuType,
                goal: state.goal,
                gpuCount: state.gpuCount,
                gpuBaseVram: state.gpuBaseVram,
                gpuModelVal: getGpuModelSelectValue()
            };
            localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        } catch (e) {}
    }

    function loadStateFromStorage() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) {
                populateGpuModels('nvidia', 24);
                return false;
            }
            const saved = JSON.parse(raw);

            if (saved.vramGb) state.vramGb = parseFloat(saved.vramGb);
            if (saved.ramGb) state.ramGb = parseFloat(saved.ramGb);
            if (saved.contextK) state.contextK = parseInt(saved.contextK, 10);
            if (saved.gpuVendor) state.gpuVendor = saved.gpuVendor;
            if (saved.gpuType) state.gpuType = saved.gpuType;
            if (saved.goal) state.goal = saved.goal;
            if (saved.gpuCount) state.gpuCount = parseInt(saved.gpuCount, 10);
            if (saved.gpuBaseVram) state.gpuBaseVram = parseFloat(saved.gpuBaseVram);

            restoreProfilerUI(state, saved.gpuModelVal);

            if (goalCards) {
                goalCards.forEach(card => {
                    card.classList.toggle('active', card.dataset.goal === state.goal);
                });
            }

            return true;
        } catch (e) {
            populateGpuModels('nvidia', 24);
            return false;
        }
    }

    goalCards.forEach(card => {
        card.addEventListener('click', () => {
            goalCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            state.goal = card.dataset.goal;
            saveStateToStorage();
            triggerRecommendations();
        });
    });

    let searchTimeout = null;
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                state.query = e.target.value.trim();
                triggerRecommendations();
            }, 300);
        });
    }

    if (btnRefresh) {
        btnRefresh.addEventListener('click', () => triggerRecommendations());
    }

    // --- Candidate-table sort/filter controls ---
    // These never re-fetch from the network - they only re-sort/re-filter/
    // re-group whatever state.recommendations.all_candidates already holds
    // (see renderWithCurrentFilters below), which is a distinct mechanism
    // from the free-text search box above (that one changes WHICH models get
    // searched for, so it correctly still triggers a real request).
    if (candidateSortSelect) {
        candidateSortSelect.addEventListener('change', (e) => {
            state.candidateSort = e.target.value;
            renderWithCurrentFilters();
        });
    }
    if (candidateQuantSelect) {
        candidateQuantSelect.addEventListener('change', (e) => {
            state.candidateFilterQuant = e.target.value;
            renderWithCurrentFilters();
        });
    }
    candidateVerifiedChips.forEach(chip => {
        chip.addEventListener('click', () => {
            candidateVerifiedChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            state.candidateFilterVerified = chip.dataset.verifiedFilter;
            renderWithCurrentFilters();
        });
    });

    // Re-sorts/re-filters/re-groups the current fetched candidate batch and
    // re-renders - no network call. Shared by the controls above AND by
    // triggerRecommendations() below, so a fresh fetch is displayed through
    // the same pipeline as a manual sort/filter change (keeping the current
    // sort/filter selection applied to new results too, e.g. after switching
    // goals) rather than two divergent code paths.
    function renderWithCurrentFilters() {
        if (!state.recommendations) return;
        const filtered = applyCandidateFilters(state.recommendations.all_candidates || [], {
            sort: state.candidateSort,
            quant: state.candidateFilterQuant,
            verified: state.candidateFilterVerified
        });
        const grouped = groupByBaseModel(filtered).map(g => ({ ...g.primary, _variants: g.variants }));
        renderResults(
            { ...state.recommendations, all_candidates: grouped },
            { state, onLaunchClick: (repoId) => openCodeModal(repoId, state) }
        );
    }

    // GPU/RAM/context controls, presets, and auto-detect are all wired up
    // here - see hardware-profile.js. Safe to call before triggerRecommendations
    // is textually defined below: it's a hoisted function declaration, and
    // initHardwareProfile only registers event listeners synchronously here:
    // none of them fire (and so none of them call triggerRecommendations)
    // until the user actually interacts with a control, by which point the
    // whole script has finished running.
    initHardwareProfile({ state, saveStateToStorage, triggerRecommendations });

    // --- Recommendation Trigger & Hybrid Engine ---
    async function triggerRecommendations() {
        showLoadingState();

        try {
            const relativeApiPath = window.location.pathname.endsWith('/') 
                ? `${window.location.pathname}api/recommend` 
                : `${window.location.pathname}/api/recommend`;

            const response = await fetch(relativeApiPath.replace(/\/+/g, '/'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    vram_gb: state.vramGb,
                    ram_gb: state.ramGb,
                    context_k: state.contextK,
                    gpu_type: state.gpuType,
                    goal: state.goal,
                    preferred_quant: state.preferredQuant,
                    query: state.query,
                    // RAM-only / no-GPU inference mode - see gpu-catalog.js's
                    // "cpu" vendor entry and backend/engine.py's cpu_only branch.
                    cpu_only: state.gpuVendor === 'cpu'
                })
            });

            if (response.ok) {
                const data = await response.json();
                state.recommendations = data;
                renderWithCurrentFilters();
                return;
            }
        } catch (err) {
            console.warn('Backend API unavailable, falling back to Client-Side HF Engine:', err);
        }

        try {
            const data = await runClientSideEngine(state);
            state.recommendations = data;
            renderWithCurrentFilters();
        } catch (clientErr) {
            console.error('Client engine failed:', clientErr);
            showErrorState(clientErr.message);
        }
    }

    // getKvCacheOverhead / getGenerationSpeed / getSuitabilityTag / runClientSideEngine /
    // parseParamsInBillions / getFallbackModels all moved to recommendation-engine.js.

    // renderResults / showLoadingState / showErrorState all moved to
    // renderer.js (hero-card & candidate-list DOM building).

    // openCodeModal / modal-tabs listener / modal close listeners / copy-to-
    // clipboard buttons / Escape-key handler all moved to modal.js.


    loadStateFromStorage();
    triggerRecommendations();
});
