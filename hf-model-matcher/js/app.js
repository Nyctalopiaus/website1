/* ==========================================================================
   HUGGING FACE MODEL MATCH - HYBRID APPLICATION SCRIPT
   Supports: FastAPI Backend API + Client-Side Fallback Engine + LocalStorage Persistence
   Features: 4-Stage Upgrade (KV-Cache Scaling, Speed Ratings, Tabbed Launchers,
             Quant Matrix, Suitability Badges, Onboarding Assistant)
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    const STORAGE_KEY = 'nycto_hf_matcher_state';

    // --- GPU Catalog per Vendor ---
    const GPU_CATALOG = {
        nvidia: [
            { label: 'NVIDIA GeForce RTX 5090 (32GB)', vram: 32 },
            { label: 'NVIDIA GeForce RTX 5080 (64GB)', vram: 64 },
            { label: 'NVIDIA GeForce RTX 5080 (16GB)', vram: 16 },
            { label: 'NVIDIA GeForce RTX 4090 (24GB)', vram: 24, default: true },
            { label: 'NVIDIA GeForce RTX 4080 Super (16GB)', vram: 16 },
            { label: 'NVIDIA GeForce RTX 4080 (16GB)', vram: 16 },
            { label: 'NVIDIA GeForce RTX 4070 Ti Super (16GB)', vram: 16 },
            { label: 'NVIDIA GeForce RTX 4070 Ti (12GB)', vram: 12 },
            { label: 'NVIDIA GeForce RTX 4070 Super (12GB)', vram: 12 },
            { label: 'NVIDIA GeForce RTX 4070 (12GB)', vram: 12 },
            { label: 'NVIDIA GeForce RTX 4060 Ti (16GB)', vram: 16 },
            { label: 'NVIDIA GeForce RTX 4060 Ti (8GB)', vram: 8 },
            { label: 'NVIDIA GeForce RTX 4060 (8GB)', vram: 8 },
            { label: 'NVIDIA GeForce RTX 3090 Ti (24GB)', vram: 24 },
            { label: 'NVIDIA GeForce RTX 3090 (24GB)', vram: 24 },
            { label: 'NVIDIA GeForce RTX 3080 Ti (12GB)', vram: 12 },
            { label: 'NVIDIA GeForce RTX 3080 (12GB)', vram: 12 },
            { label: 'NVIDIA GeForce RTX 3080 (10GB)', vram: 10 },
            { label: 'NVIDIA GeForce RTX 3070 Ti (8GB)', vram: 8 },
            { label: 'NVIDIA GeForce RTX 3070 (8GB)', vram: 8 },
            { label: 'NVIDIA GeForce RTX 3060 Ti (8GB)', vram: 8 },
            { label: 'NVIDIA GeForce RTX 3060 (12GB - Budget Fav)', vram: 12 },
            { label: 'NVIDIA GeForce RTX 2080 Ti (11GB)', vram: 11 },
            { label: 'NVIDIA H200 (141GB HBM3e)', vram: 141 },
            { label: 'NVIDIA H100 SXM (80GB HBM3)', vram: 80 },
            { label: 'NVIDIA A100 (80GB HBM2e)', vram: 80 },
            { label: 'NVIDIA A100 (40GB HBM2)', vram: 40 },
            { label: 'NVIDIA L40S (48GB GDDR6)', vram: 48 },
            { label: 'NVIDIA RTX 6000 Ada (48GB GDDR6)', vram: 48 }
        ],
        amd: [
            { label: 'AMD Radeon RX 7900 XTX (24GB)', vram: 24 },
            { label: 'AMD Radeon RX 7900 XT (20GB)', vram: 20 },
            { label: 'AMD Radeon RX 7900 GRE (16GB)', vram: 16 },
            { label: 'AMD Radeon RX 7800 XT (16GB)', vram: 16 },
            { label: 'AMD Radeon RX 7700 XT (12GB)', vram: 12 },
            { label: 'AMD Radeon RX 6950 XT (16GB)', vram: 16 },
            { label: 'AMD Radeon RX 6900 XT (16GB)', vram: 16 },
            { label: 'AMD Radeon RX 6800 XT (16GB)', vram: 16 },
            { label: 'AMD Radeon RX 6800 (16GB)', vram: 16 },
            { label: 'AMD Radeon RX 6700 XT (12GB)', vram: 12 },
            { label: 'AMD Instinct MI300X (192GB HBM3)', vram: 192 }
        ],
        apple: [
            { label: 'Apple M4 / M3 / M2 / M1 Ultra (192GB Unified)', vram: 192 },
            { label: 'Apple M4 / M3 / M2 / M1 Ultra (128GB Unified)', vram: 128 },
            { label: 'Apple M4 / M3 / M2 / M1 Ultra (96GB Unified)', vram: 96 },
            { label: 'Apple M4 / M3 / M2 / M1 Max (64GB Unified)', vram: 64 },
            { label: 'Apple M4 / M3 / M2 / M1 Max (48GB Unified)', vram: 48 },
            { label: 'Apple M4 / M3 / M2 / M1 Max (36GB Unified)', vram: 36 },
            { label: 'Apple M4 / M3 / M2 / M1 Pro (36GB Unified)', vram: 36 },
            { label: 'Apple M4 / M3 / M2 / M1 Pro (18GB Unified)', vram: 18 }
        ],
        intel: [
            { label: 'Intel Arc B580 Battlemage (12GB)', vram: 12 },
            { label: 'Intel Arc A770 (16GB)', vram: 16 },
            { label: 'Intel Arc A750 (8GB)', vram: 8 },
            { label: 'Intel Arc A580 (8GB)', vram: 8 }
        ],
        custom: [
            { label: '✏️ Custom / Not Listed (Manual VRAM Slider)', vram: 'custom' }
        ]
    };

    // --- Application State ---
    const state = {
        vramGb: 64.0,
        ramGb: 64.0,
        contextK: 16,
        gpuVendor: 'nvidia',
        gpuType: 'NVIDIA RTX Series',
        goal: 'coding',
        query: '',
        preferredQuant: 4,
        gpuCount: 1,
        gpuBaseVram: 64.0,
        recommendations: null
    };

    // --- DOM Elements ---
    const vramInput = document.getElementById('vram-slider');
    const vramVal = document.getElementById('vram-val');
    const ramInput = document.getElementById('ram-slider');
    const ramVal = document.getElementById('ram-val');
    const contextSelect = document.getElementById('context-select');
    const contextVal = document.getElementById('context-val');
    const gpuVendorSelect = document.getElementById('gpu-vendor-select');
    const gpuModelSelect = document.getElementById('gpu-model-select');
    const gpuCountBtns = document.querySelectorAll('.btn-gpu-count');
    const gpuCountVal = document.getElementById('gpu-count-val');
    const gpuVramCalcBadge = document.getElementById('gpu-vram-calc-badge');
    const btnAutoDetect = document.getElementById('btn-auto-detect');
    const autoDetectInlineNotice = document.getElementById('auto-detect-inline-notice');
    const autoDetectNoticeIcon = document.getElementById('auto-detect-notice-icon');
    const autoDetectNoticeText = document.getElementById('auto-detect-notice-text');
    
    const goalCards = document.querySelectorAll('.goal-card');
    const searchInput = document.getElementById('search-input');
    const btnRefresh = document.getElementById('btn-refresh');

    const heroContainer = document.getElementById('hero-cards-container');
    const candidatesContainer = document.getElementById('candidates-container');
    const totalCandidatesCount = document.getElementById('total-candidates-count');

    // Modals
    const modalOverlay = document.getElementById('modal-overlay');
    const modalClose = document.getElementById('modal-close');
    const modalTitle = document.getElementById('modal-title');
    const codeOllama = document.getElementById('code-ollama');
    const codeModelfile = document.getElementById('code-modelfile');
    const codeLmstudioSearch = document.getElementById('code-lmstudio-search');
    const clineModelId = document.getElementById('cline-model-id');
    const codeClineConfig = document.getElementById('code-cline-config');
    const modalTabs = document.querySelectorAll('.modal-tab');
    const copyBtns = document.querySelectorAll('.btn-copy');

    const btnOpenQuickstart = document.getElementById('btn-open-quickstart');
    const modalQuickstartOverlay = document.getElementById('modal-quickstart-overlay');
    const modalQuickstartClose = document.getElementById('modal-quickstart-close');

    const btnOpenQuantMatrix = document.getElementById('btn-open-quant-matrix');
    const modalQuantOverlay = document.getElementById('modal-quant-overlay');
    const modalQuantClose = document.getElementById('modal-quant-close');

    const btnOpenOnboarding = document.getElementById('btn-open-onboarding');
    const modalOnboardingOverlay = document.getElementById('modal-onboarding-overlay');
    const modalOnboardingClose = document.getElementById('modal-onboarding-close');

    // Populate GPU Model options dynamically based on chosen Vendor
    function populateGpuModels(vendorKey, selectedVram = null) {
        if (!gpuModelSelect) return;
        gpuModelSelect.innerHTML = '';
        
        const models = GPU_CATALOG[vendorKey] || GPU_CATALOG.nvidia;
        let selectedSet = false;

        models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.vram;
            opt.textContent = m.label;
            
            if (selectedVram !== null && String(m.vram) === String(selectedVram) && !selectedSet) {
                opt.selected = true;
                selectedSet = true;
            } else if (selectedVram === null && m.default && !selectedSet) {
                opt.selected = true;
                selectedSet = true;
            }
            gpuModelSelect.appendChild(opt);
        });

        const customOpt = document.createElement('option');
        customOpt.value = 'custom';
        customOpt.textContent = '✏️ Custom / Manual VRAM Slider';
        if (!selectedSet && selectedVram === 'custom') customOpt.selected = true;
        gpuModelSelect.appendChild(customOpt);
    }

    if (gpuVendorSelect) {
        gpuVendorSelect.addEventListener('change', (e) => {
            state.gpuVendor = e.target.value;
            populateGpuModels(state.gpuVendor);
            
            if (gpuModelSelect && gpuModelSelect.value !== 'custom') {
                state.gpuBaseVram = parseFloat(gpuModelSelect.value);
                updateEffectiveVram();
            } else {
                if (gpuVramCalcBadge) gpuVramCalcBadge.textContent = 'Manual Slider Mode';
                saveStateToStorage();
            }
        });
    }

    if (gpuModelSelect) {
        gpuModelSelect.addEventListener('change', (e) => {
            if (e.target.value === 'custom') {
                if (gpuVramCalcBadge) gpuVramCalcBadge.textContent = 'Manual Slider Mode';
                saveStateToStorage();
            } else {
                state.gpuBaseVram = parseFloat(e.target.value);
                updateEffectiveVram();
            }
        });
    }

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
                gpuModelVal: gpuModelSelect ? gpuModelSelect.value : '64'
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

            if (gpuVendorSelect) gpuVendorSelect.value = state.gpuVendor;
            populateGpuModels(state.gpuVendor, saved.gpuModelVal || state.gpuBaseVram);

            if (vramInput) vramInput.value = state.vramGb;
            if (vramVal) vramVal.textContent = `${state.vramGb} GB`;
            if (ramInput) ramInput.value = state.ramGb;
            if (ramVal) ramVal.textContent = `${state.ramGb} GB`;
            if (contextSelect) contextSelect.value = state.contextK;
            if (contextVal) contextVal.textContent = `${state.contextK}k Tokens`;

            if (gpuCountBtns) {
                gpuCountBtns.forEach(b => {
                    b.classList.toggle('active', parseInt(b.dataset.count, 10) === state.gpuCount);
                });
            }
            if (gpuCountVal) {
                gpuCountVal.textContent = state.gpuCount === 1 ? '1x Single GPU' : `${state.gpuCount}x Parallel Rigs`;
            }

            if (gpuVramCalcBadge) {
                if (gpuModelSelect && gpuModelSelect.value === 'custom') {
                    gpuVramCalcBadge.textContent = 'Manual Slider Mode';
                } else {
                    gpuVramCalcBadge.textContent = `${state.gpuBaseVram} GB per GPU`;
                }
            }

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

    if (gpuCountBtns) {
        gpuCountBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                gpuCountBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                state.gpuCount = parseInt(btn.dataset.count, 10);
                if (gpuCountVal) {
                    gpuCountVal.textContent = state.gpuCount === 1 ? '1x Single GPU' : `${state.gpuCount}x Parallel Rigs`;
                }
                if (gpuModelSelect && gpuModelSelect.value !== 'custom') {
                    updateEffectiveVram();
                } else {
                    saveStateToStorage();
                    triggerRecommendations();
                }
            });
        });
    }

    function updateEffectiveVram() {
        const totalVram = state.gpuBaseVram * state.gpuCount;
        state.vramGb = totalVram;
        if (vramInput) vramInput.value = Math.min(totalVram, 192);
        if (vramVal) vramVal.textContent = `${totalVram} GB`;
        if (gpuVramCalcBadge) gpuVramCalcBadge.textContent = `${state.gpuBaseVram} GB per GPU`;
        saveStateToStorage();
        triggerRecommendations();
    }

    // --- Hardware Sliders & Controls ---
    if (vramInput) {
        vramInput.addEventListener('input', (e) => {
            state.vramGb = parseFloat(e.target.value);
            if (vramVal) vramVal.textContent = `${state.vramGb} GB`;
            if (gpuModelSelect && gpuModelSelect.value !== 'custom') {
                const expected = state.gpuBaseVram * state.gpuCount;
                if (state.vramGb !== expected) {
                    gpuModelSelect.value = 'custom';
                    if (gpuVramCalcBadge) gpuVramCalcBadge.textContent = 'Manual Slider Mode';
                }
            }
            saveStateToStorage();
            triggerRecommendations();
        });
    }

    if (ramInput) {
        ramInput.addEventListener('input', (e) => {
            state.ramGb = parseFloat(e.target.value);
            if (ramVal) ramVal.textContent = `${state.ramGb} GB`;
            saveStateToStorage();
            triggerRecommendations();
        });
    }

    if (contextSelect) {
        contextSelect.addEventListener('change', (e) => {
            state.contextK = parseInt(e.target.value, 10);
            if (contextVal) contextVal.textContent = `${state.contextK}k Tokens`;
            saveStateToStorage();
            triggerRecommendations();
        });
    }

    // Preset Buttons
    document.querySelectorAll('.btn-preset').forEach(btn => {
        btn.addEventListener('click', () => {
            const vram = parseFloat(btn.dataset.vram);
            const ram = parseFloat(btn.dataset.ram);
            const count = parseInt(btn.dataset.count || '1', 10);
            
            state.vramGb = vram;
            state.ramGb = ram;
            state.gpuCount = count;
            state.gpuBaseVram = Math.round(vram / count);

            if (vramInput) vramInput.value = vram;
            if (ramInput) ramInput.value = ram;
            if (vramVal) vramVal.textContent = `${vram} GB`;
            if (ramVal) ramVal.textContent = `${ram} GB`;
            if (gpuVramCalcBadge) gpuVramCalcBadge.textContent = `${state.gpuBaseVram} GB per GPU`;

            gpuCountBtns.forEach(b => {
                b.classList.toggle('active', parseInt(b.dataset.count, 10) === count);
            });
            if (gpuCountVal) {
                gpuCountVal.textContent = count === 1 ? '1x Single GPU' : `${count}x Parallel Rigs`;
            }

            if (gpuModelSelect) {
                const matchingOption = Array.from(gpuModelSelect.options).find(opt => parseFloat(opt.value) === state.gpuBaseVram);
                if (matchingOption) {
                    gpuModelSelect.value = matchingOption.value;
                } else {
                    gpuModelSelect.value = 'custom';
                }
            }

            saveStateToStorage();
            triggerRecommendations();
        });
    });

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

    // --- Hybrid Auto Hardware Profiler ---
    if (btnAutoDetect) {
        btnAutoDetect.addEventListener('click', async () => {
            btnAutoDetect.textContent = '⚡ Detecting Hardware...';
            if (autoDetectInlineNotice) autoDetectInlineNotice.style.display = 'none';

            let detectedRam = 0;
            let estimatedVram = 0;
            let gpuName = '';
            let isDetected = false;

            try {
                const relativeApiPath = window.location.pathname.endsWith('/') 
                    ? `${window.location.pathname}api/detect-hardware` 
                    : `${window.location.pathname}/api/detect-hardware`;

                const res = await fetch(relativeApiPath.replace(/\/+/g, '/'));
                if (res.ok) {
                    const data = await res.json();
                    if (data.gpu && data.gpu.detected && data.gpu.vram_gb > 0) {
                        estimatedVram = data.gpu.vram_gb;
                        gpuName = data.gpu.name;
                        isDetected = true;
                    }
                    if (data.ram_gb && data.ram_gb > 0) {
                        detectedRam = data.ram_gb;
                    }
                }
            } catch (e) {}

            if (!isDetected) {
                if (navigator.deviceMemory && navigator.deviceMemory >= 8) {
                    detectedRam = navigator.deviceMemory >= 32 ? 64.0 : navigator.deviceMemory;
                }

                let webglRenderer = '';
                try {
                    const canvas = document.createElement('canvas');
                    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
                    if (gl) {
                        const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
                        if (debugInfo) {
                            webglRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_STRING) || '';
                        }
                    }
                } catch (err) {}

                const gpuUpper = String(webglRenderer).toUpperCase();
                if (gpuUpper.includes('5080')) { estimatedVram = 64.0; gpuName = 'NVIDIA GeForce RTX 5080'; isDetected = true; }
                else if (gpuUpper.includes('5090')) { estimatedVram = 32.0; gpuName = 'NVIDIA GeForce RTX 5090'; isDetected = true; }
                else if (gpuUpper.includes('4090') || gpuUpper.includes('3090')) { estimatedVram = 24.0; gpuName = 'NVIDIA GeForce RTX 4090/3090'; isDetected = true; }
                else if (gpuUpper.includes('4080')) { estimatedVram = 16.0; gpuName = 'NVIDIA GeForce RTX 4080'; isDetected = true; }
                else if (gpuUpper.includes('3080')) { estimatedVram = 16.0; gpuName = 'NVIDIA GeForce RTX 3080'; isDetected = true; }
                else if (gpuUpper.includes('4070') || gpuUpper.includes('3070')) { estimatedVram = 12.0; gpuName = 'NVIDIA GeForce RTX 4070/3070'; isDetected = true; }
                else if (gpuUpper.includes('3060')) { estimatedVram = 12.0; gpuName = 'NVIDIA GeForce RTX 3060'; isDetected = true; }
                else if (gpuUpper.includes('APPLE') || gpuUpper.includes('M-SERIES') || gpuUpper.includes('METAL')) { estimatedVram = 32.0; gpuName = 'Apple Silicon Unified Memory'; isDetected = true; }
            }

            if (isDetected && estimatedVram > 0) {
                state.vramGb = estimatedVram;
                if (detectedRam > 0) state.ramGb = Math.round(detectedRam);
                state.gpuBaseVram = estimatedVram;

                if (vramInput) vramInput.value = estimatedVram;
                if (ramInput && detectedRam > 0) ramInput.value = Math.round(detectedRam);
                if (vramVal) vramVal.textContent = `${estimatedVram} GB`;
                if (ramVal && detectedRam > 0) ramVal.textContent = `${Math.round(detectedRam)} GB`;
                if (gpuVramCalcBadge) gpuVramCalcBadge.textContent = `${estimatedVram} GB per GPU`;

                if (gpuVendorSelect) gpuVendorSelect.value = gpuName.toLowerCase().includes('apple') ? 'apple' : 'nvidia';
                populateGpuModels(state.gpuVendor, estimatedVram);

                btnAutoDetect.style.borderColor = 'rgba(52, 211, 153, 0.6)';
                btnAutoDetect.textContent = `✓ Auto-Detected: ${gpuName} (${estimatedVram}GB VRAM)`;

                if (autoDetectInlineNotice) {
                    autoDetectInlineNotice.style.display = 'block';
                    autoDetectInlineNotice.style.background = 'rgba(16, 185, 129, 0.1)';
                    autoDetectInlineNotice.style.borderColor = 'rgba(16, 185, 129, 0.4)';
                    autoDetectInlineNotice.style.color = '#6EE7B7';
                    if (autoDetectNoticeIcon) autoDetectNoticeIcon.textContent = '✓';
                    if (autoDetectNoticeText) autoDetectNoticeText.innerHTML = `<strong>Auto-Detect Success:</strong> Identified ${gpuName} with ${estimatedVram} GB VRAM & ${detectedRam > 0 ? Math.round(detectedRam) : 64} GB System RAM.`;
                }

                setTimeout(() => {
                    btnAutoDetect.style.borderColor = '';
                    btnAutoDetect.textContent = '⚡ Auto-Detect My Hardware';
                }, 4000);

                saveStateToStorage();
                triggerRecommendations();
            } else {
                btnAutoDetect.style.borderColor = 'rgba(245, 158, 11, 0.8)';
                btnAutoDetect.textContent = '⚠️ Auto-Detect Unavailable';

                if (autoDetectInlineNotice) {
                    autoDetectInlineNotice.style.display = 'block';
                    autoDetectInlineNotice.style.background = 'rgba(245, 158, 11, 0.1)';
                    autoDetectInlineNotice.style.borderColor = 'rgba(245, 158, 11, 0.4)';
                    autoDetectInlineNotice.style.color = '#FCD34D';
                    if (autoDetectNoticeIcon) autoDetectNoticeIcon.textContent = '⚠️';
                    if (autoDetectNoticeText) autoDetectNoticeText.innerHTML = `<strong>Auto-Detect Unavailable:</strong> Browser privacy settings prevented automatic GPU profiling. Please select your card vendor & model or adjust the sliders manually below.`;
                }

                setTimeout(() => {
                    btnAutoDetect.style.borderColor = '';
                    btnAutoDetect.textContent = '⚡ Auto-Detect My Hardware';
                }, 5000);
            }
        });
    }

    // --- Recommendation Trigger & Hybrid Engine ---
    async function triggerRecommendations() {
        if (heroContainer) {
            heroContainer.innerHTML = '<div style="grid-column: span 3; text-align: center; padding: 40px; color: #94A3B8;">Searching Hugging Face models & computing Tier-1 VRAM + KV-Cache budget...</div>';
        }

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
                    query: state.query
                })
            });

            if (response.ok) {
                const data = await response.json();
                state.recommendations = data;
                renderResults(data);
                return;
            }
        } catch (err) {
            console.warn('Backend API unavailable, falling back to Client-Side HF Engine:', err);
        }

        try {
            const data = await runClientSideEngine(state);
            state.recommendations = data;
            renderResults(data);
        } catch (clientErr) {
            console.error('Client engine failed:', clientErr);
            if (heroContainer) {
                heroContainer.innerHTML = `<div style="grid-column: span 3; text-align: center; padding: 30px; color: #EF4444;">Error fetching recommendations: ${clientErr.message}</div>`;
            }
        }
    }

    // Helper: KV-Cache Overhead Calculator
    function getKvCacheOverhead(contextK) {
        const map = { 4: 0.4, 8: 0.8, 16: 1.5, 32: 3.5, 64: 5.5, 128: 8.0 };
        return map[contextK] || 1.5;
    }

    // Helper: Generation Speed Status Rating
    function getGenerationSpeed(vramReqTotal, userVramGb) {
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
    function getSuitabilityTag(goal, heroKey) {
        if (heroKey === 'speed_demon') return '⚡ Fast Autocomplete & Low Latency';
        if (goal === 'coding') return '💻 Ideal for VS Code & Cline Integration';
        if (goal === 'chat') return '💬 Great for Local RAG & Long Docs';
        if (goal === 'vision') return '👁️ Ideal for Document OCR & Visual Q&A';
        if (goal === 'image-gen') return '🎨 High-Resolution Visual Generation';
        return '✨ High Accuracy Workflow';
    }

    // --- Client-Side 4-Tier Recommendation Engine ---
    async function runClientSideEngine(params) {
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

        for (let q of searchQueries) {
            try {
                const url = `https://huggingface.co/api/models?search=${encodeURIComponent(q)}&sort=downloads&limit=15`;
                const hfRes = await fetch(url);
                if (hfRes.ok) {
                    const items = await hfRes.json();
                    items.forEach(m => {
                        if (m.id && (!uniqueMap[m.id] || (m.downloads || 0) > (uniqueMap[m.id].downloads || 0))) {
                            uniqueMap[m.id] = m;
                        }
                    });
                }
            } catch (e) {}
        }

        let rawModels = Object.values(uniqueMap);
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
            hero_cards: {
                best_overall: heroBest,
                speed_demon: heroSpeed,
                max_capability: heroMax
            },
            all_candidates: surviving,
            total_candidates: surviving.length
        };
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

    // --- UI Renderer ---
    function renderResults(data) {
        const hero = data.hero_cards;
        const candidates = data.all_candidates || [];
        if (totalCandidatesCount) totalCandidatesCount.textContent = data.total_candidates || 0;

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
                        <button class="btn-action primary btn-launch" data-repoid="${model.id}" title="Get instant 1-click startup commands for LM Studio, Ollama, and VS Code / Cline">Run Code ⚡</button>
                    </div>
                `;

                heroContainer.appendChild(cardEl);
            });

            document.querySelectorAll('.btn-launch').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    openCodeModal(e.target.dataset.repoid);
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
                        <button class="btn-action primary btn-launch" data-repoid="${m.id}" style="padding: 4px 10px; font-size: 12px;" title="Get instant launcher code">Run ⚡</button>
                    </div>
                `;
                candidatesContainer.appendChild(item);
            });

            candidatesContainer.querySelectorAll('.btn-launch').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    openCodeModal(e.target.dataset.repoid);
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

    // --- STAGE 2: Launcher Modal Handler ---
    async function openCodeModal(repoId) {
        if (!state.recommendations) return;
        const allModels = state.recommendations.all_candidates || [];
        const model = allModels.find(m => m.id === repoId);
        if (!model) return;

        if (modalTitle) modalTitle.textContent = `Run Instructions for ${model.name}`;
        
        let targetQuant = 'Q4_K_M';
        if (state.vramGb >= 48) {
            targetQuant = 'Q5_K_M';
        } else if (state.vramGb <= 12) {
            targetQuant = 'Q4_K_S';
        }

        let baseName = model.name.replace(/[-_]gguf$/i, '');
        let targetFile = null;
        let fileLabelTitle = `🎯 Recommended Target GGUF File for your ${state.vramGb}GB VRAM:`;

        const existingBox = modalOverlay?.querySelector('.file-guide-box');
        if (existingBox) existingBox.remove();

        const fileGuideBox = document.createElement('div');
        fileGuideBox.className = 'file-guide-box';
        fileGuideBox.innerHTML = `
            <div style="background: rgba(59,130,246,0.12); border: 1px solid var(--accent-blue); padding: 14px; border-radius: 10px; margin-bottom: 16px;">
                <div id="modal-target-label" style="font-size: 12px; font-weight: 700; color: #38BDF8; margin-bottom: 4px;">${fileLabelTitle}</div>
                <code id="modal-target-filename" style="font-size: 13px; color: #F8FAFC; word-break: break-all; display: block; padding: 6px 10px; background: rgba(0,0,0,0.3); border-radius: 6px; margin: 6px 0;">Finding exact GGUF file on Hugging Face...</code>
                <div style="display: flex; gap: 10px; flex-wrap: wrap; margin-top: 8px;">
                    <a id="btn-direct-download-link" href="#" target="_blank" class="btn-action primary" style="padding: 6px 12px; font-size: 12px; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; border-radius: 6px;">
                        <span>⬇️</span> <span>Direct Download File</span>
                    </a>
                    <a id="btn-tree-link" href="https://huggingface.co/${repoId}/tree/main" target="_blank" class="btn-action" style="padding: 6px 12px; font-size: 12px; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; border-radius: 6px;">
                        <span>📁</span> <span>Browse Files on Hugging Face</span>
                    </a>
                </div>
            </div>
        `;

        const modalBoxContent = modalOverlay?.querySelector('.modal-box');
        if (modalBoxContent && modalTabs && modalTabs[0]) {
            modalBoxContent.insertBefore(fileGuideBox, modalTabs[0].parentElement);
        }

        const modalTargetLabel = document.getElementById('modal-target-label');
        const modalTargetFilename = document.getElementById('modal-target-filename');
        const btnDirectDownload = document.getElementById('btn-direct-download-link');

        try {
            const hfTreeRes = await fetch(`https://huggingface.co/api/models/${repoId}/tree/main`);
            if (hfTreeRes.ok) {
                const treeFiles = await hfTreeRes.json();
                const filePaths = treeFiles.map(f => f.path).filter(Boolean);
                const ggufFiles = filePaths.filter(p => p.toLowerCase().endsWith('.gguf'));
                if (ggufFiles.length > 0) {
                    let matched = ggufFiles.find(p => p.toUpperCase().includes(targetQuant));
                    if (!matched && targetQuant === 'Q5_K_M') {
                        matched = ggufFiles.find(p => p.toUpperCase().includes('Q4_K_M') || p.toUpperCase().includes('Q8_0'));
                    }
                    if (!matched) {
                        matched = ggufFiles.find(p => p.toUpperCase().includes('Q4_K_M') || p.toUpperCase().includes('Q4_0'));
                    }
                    if (!matched) {
                        matched = ggufFiles[0];
                    }
                    targetFile = matched;
                }
            }
        } catch (err) {}

        if (targetFile) {
            const directUrl = `https://huggingface.co/${repoId}/resolve/main/${targetFile}`;
            if (modalTargetFilename) modalTargetFilename.textContent = targetFile;
            if (btnDirectDownload) {
                btnDirectDownload.style.display = 'inline-flex';
                btnDirectDownload.href = directUrl;
                btnDirectDownload.querySelector('span:last-child').textContent = `Direct Download (${targetFile})`;
            }
        } else {
            if (modalTargetFilename) modalTargetFilename.textContent = `Multiple weights/directories in repository`;
            if (btnDirectDownload) btnDirectDownload.style.display = 'none';
        }

        // Fill Launcher Tabs Data
        if (codeLmstudioSearch) codeLmstudioSearch.textContent = model.id;
        if (codeOllama) codeOllama.textContent = model.run_instructions?.ollama || `ollama run ${model.name.toLowerCase()}`;
        if (codeModelfile) codeModelfile.textContent = `FROM ${model.id}\nPARAMETER num_ctx ${state.contextK * 1024}\nPARAMETER temperature 0.7`;
        if (clineModelId) clineModelId.textContent = model.id;
        if (codeClineConfig) codeClineConfig.textContent = `http://localhost:1234/v1`;

        if (modalOverlay) modalOverlay.classList.add('active');
    }

    // Modal Tabs Listener
    if (modalTabs) {
        modalTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                modalTabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');
                
                const targetPane = tab.dataset.tab;
                document.querySelectorAll('.tab-pane').forEach(pane => {
                    pane.classList.toggle('active', pane.id === `tab-content-${targetPane}`);
                });
            });
        });
    }

    // Modal Close Listeners
    if (modalClose && modalOverlay) {
        modalClose.addEventListener('click', () => modalOverlay.classList.remove('active'));
    }
    if (modalOverlay) {
        modalOverlay.addEventListener('click', (e) => {
            if (e.target === modalOverlay) modalOverlay.classList.remove('active');
        });
    }

    if (btnOpenQuickstart && modalQuickstartOverlay) {
        btnOpenQuickstart.addEventListener('click', () => modalQuickstartOverlay.classList.add('active'));
    }
    if (modalQuickstartClose && modalQuickstartOverlay) {
        modalQuickstartClose.addEventListener('click', () => modalQuickstartOverlay.classList.remove('active'));
    }
    if (modalQuickstartOverlay) {
        modalQuickstartOverlay.addEventListener('click', (e) => {
            if (e.target === modalQuickstartOverlay) modalQuickstartOverlay.classList.remove('active');
        });
    }

    if (btnOpenQuantMatrix && modalQuantOverlay) {
        btnOpenQuantMatrix.addEventListener('click', () => modalQuantOverlay.classList.add('active'));
    }
    if (modalQuantClose && modalQuantOverlay) {
        modalQuantClose.addEventListener('click', () => modalQuantOverlay.classList.remove('active'));
    }
    if (modalQuantOverlay) {
        modalQuantOverlay.addEventListener('click', (e) => {
            if (e.target === modalQuantOverlay) modalQuantOverlay.classList.remove('active');
        });
    }

    if (btnOpenOnboarding && modalOnboardingOverlay) {
        btnOpenOnboarding.addEventListener('click', () => modalOnboardingOverlay.classList.add('active'));
    }
    if (modalOnboardingClose && modalOnboardingOverlay) {
        modalOnboardingClose.addEventListener('click', () => modalOnboardingOverlay.classList.remove('active'));
    }
    if (modalOnboardingOverlay) {
        modalOnboardingOverlay.addEventListener('click', (e) => {
            if (e.target === modalOnboardingOverlay) modalOnboardingOverlay.classList.remove('active');
        });
    }

    // Copy to Clipboard buttons
    copyBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetId = btn.dataset.target;
            const codeEl = document.getElementById(targetId);
            if (codeEl) {
                navigator.clipboard.writeText(codeEl.textContent.trim());
                btn.textContent = 'Copied! ✓';
                setTimeout(() => btn.textContent = 'Copy', 2000);
            }
        });
    });

    loadStateFromStorage();
    triggerRecommendations();
});
