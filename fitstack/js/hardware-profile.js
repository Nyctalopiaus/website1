/* ==========================================================================
   HARDWARE PROFILER
   Everything about capturing the user's hardware: the GPU vendor/model/count
   controls, VRAM/RAM/context sliders, quick-pick presets, the hybrid
   auto-detect flow (server-side /api/detect-hardware first, WebGL renderer
   sniffing as a client-side fallback), and restoring/persisting that same
   set of fields from localStorage.

   This module owns the DOM elements for the profiler panel directly (they're
   queried once, at module load) and is wired up by calling initHardwareProfile()
   with the shared app state object plus the two callbacks (saveStateToStorage,
   triggerRecommendations) it needs to invoke on every change - the same
   pattern app.js already used internally before this was split out, just
   passed in explicitly instead of captured by a shared closure.
   ========================================================================== */
import { GPU_CATALOG, budgetLabel } from './gpu-catalog.js';

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
const vramSectionLabel = document.getElementById('vram-section-label');
const btnAutoDetect = document.getElementById('btn-auto-detect');
const autoDetectInlineNotice = document.getElementById('auto-detect-inline-notice');
const autoDetectNoticeIcon = document.getElementById('auto-detect-notice-icon');
const autoDetectNoticeText = document.getElementById('auto-detect-notice-text');

// Populate GPU Model options dynamically based on chosen Vendor
export function populateGpuModels(vendorKey, selectedVram = null) {
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

// Used by app.js's saveStateToStorage - the select's live DOM value is the
// source of truth for what to persist, and that DOM element now lives here.
export function getGpuModelSelectValue() {
    return gpuModelSelect ? gpuModelSelect.value : '64';
}

// Toggles the VRAM slider, Card Model dropdown, and GPU-count buttons between
// usable and disabled/greyed depending on whether CPU (RAM-only, no GPU)
// mode is selected, and relabels the two spots that would otherwise still
// read like a GPU VRAM figure applies. Reuses the existing vendor-switch
// plumbing rather than a separate toggle - `cpu` is just another vendor
// value in GPU_CATALOG (see gpu-catalog.js), the same way `custom` already
// works as a special sentinel.
function applyCpuModeUI(state) {
    const isCpu = state.gpuVendor === 'cpu';
    if (vramInput) vramInput.disabled = isCpu;
    if (gpuModelSelect) gpuModelSelect.disabled = isCpu;
    if (gpuCountBtns) gpuCountBtns.forEach(b => { b.disabled = isCpu; });
    if (vramSectionLabel) vramSectionLabel.textContent = `Total Effective ${budgetLabel(state)}`;
    if (gpuVramCalcBadge && isCpu) gpuVramCalcBadge.textContent = 'RAM-Bound (No GPU)';
    const vramControlGroup = vramInput ? vramInput.closest('.control-group') : null;
    if (vramControlGroup) vramControlGroup.classList.toggle('cpu-mode-disabled', isCpu);
}

// Applies a (possibly just-restored-from-localStorage) state object to every
// profiler DOM element. Called from app.js's loadStateFromStorage after it
// has parsed and applied the saved values onto the shared state object.
export function restoreProfilerUI(state, savedGpuModelVal) {
    if (gpuVendorSelect) gpuVendorSelect.value = state.gpuVendor;
    populateGpuModels(state.gpuVendor, savedGpuModelVal || state.gpuBaseVram);

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

    applyCpuModeUI(state);
}

// Wires up every profiler control. Call once, after the shared `state` object
// and the two app.js callbacks it needs exist.
export function initHardwareProfile({ state, saveStateToStorage, triggerRecommendations }) {
    function updateEffectiveVram() {
        const totalVram = state.gpuBaseVram * state.gpuCount;
        state.vramGb = totalVram;
        if (vramInput) vramInput.value = Math.min(totalVram, 192);
        if (vramVal) vramVal.textContent = `${totalVram} GB`;
        if (gpuVramCalcBadge) gpuVramCalcBadge.textContent = `${state.gpuBaseVram} GB per GPU`;
        saveStateToStorage();
        triggerRecommendations();
    }

    if (gpuVendorSelect) {
        gpuVendorSelect.addEventListener('change', (e) => {
            state.gpuVendor = e.target.value;
            populateGpuModels(state.gpuVendor);
            applyCpuModeUI(state);

            if (state.gpuVendor === 'cpu') {
                // No VRAM concept applies - the System RAM slider becomes the
                // fit-gate budget instead (see getEffectiveBudgetGb in
                // gpu-catalog.js and cpu_only in the backend/client engines).
                saveStateToStorage();
                triggerRecommendations();
                return;
            }

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

    // --- Hardware Sliders & Controls ---
    if (vramInput) {
        vramInput.addEventListener('input', (e) => {
            state.vramGb = parseFloat(e.target.value);
            if (vramVal) vramVal.textContent = `${state.vramGb} GB`;
            vramInput.setAttribute('aria-valuetext', `${state.vramGb} gigabytes`);
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
            ramInput.setAttribute('aria-valuetext', `${state.ramGb} gigabytes`);
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

    // --- Hybrid Auto Hardware Profiler ---
    if (btnAutoDetect) {
        btnAutoDetect.addEventListener('click', async () => {
            btnAutoDetect.textContent = '⚡ Detecting Hardware...';
            if (autoDetectInlineNotice) autoDetectInlineNotice.style.display = 'none';

            let detectedRam = 0;
            let estimatedVram = 0;
            let gpuName = '';
            let isDetected = false;
            let detectedVendorKey = 'nvidia';

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
                        // Some browsers/extensions let the extension object through while
                        // stripping its constants (privacy/fingerprint protection), leaving
                        // UNMASKED_RENDERER_STRING undefined - calling getParameter(undefined)
                        // throws INVALID_ENUM. Guard on the constant itself, not just the
                        // extension object, so that case fails clean instead of throwing.
                        if (debugInfo && debugInfo.UNMASKED_RENDERER_STRING !== undefined) {
                            webglRenderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_STRING) || '';
                        }
                    }
                } catch (err) {}

                const gpuUpper = String(webglRenderer).toUpperCase();
                // NVIDIA / Apple Silicon
                if (gpuUpper.includes('5090')) { estimatedVram = 32.0; gpuName = 'NVIDIA GeForce RTX 5090'; isDetected = true; detectedVendorKey = 'nvidia'; }
                else if (gpuUpper.includes('5080')) { estimatedVram = 16.0; gpuName = 'NVIDIA GeForce RTX 5080'; isDetected = true; detectedVendorKey = 'nvidia'; }
                else if (gpuUpper.includes('4090') || gpuUpper.includes('3090')) { estimatedVram = 24.0; gpuName = 'NVIDIA GeForce RTX 4090/3090'; isDetected = true; detectedVendorKey = 'nvidia'; }
                else if (gpuUpper.includes('4080')) { estimatedVram = 16.0; gpuName = 'NVIDIA GeForce RTX 4080'; isDetected = true; detectedVendorKey = 'nvidia'; }
                else if (gpuUpper.includes('3080')) { estimatedVram = 16.0; gpuName = 'NVIDIA GeForce RTX 3080'; isDetected = true; detectedVendorKey = 'nvidia'; }
                else if (gpuUpper.includes('4070') || gpuUpper.includes('3070')) { estimatedVram = 12.0; gpuName = 'NVIDIA GeForce RTX 4070/3070'; isDetected = true; detectedVendorKey = 'nvidia'; }
                else if (gpuUpper.includes('3060')) { estimatedVram = 12.0; gpuName = 'NVIDIA GeForce RTX 3060'; isDetected = true; detectedVendorKey = 'nvidia'; }
                else if (gpuUpper.includes('APPLE') || gpuUpper.includes('M-SERIES') || gpuUpper.includes('METAL')) { estimatedVram = 32.0; gpuName = 'Apple Silicon Unified Memory'; isDetected = true; detectedVendorKey = 'apple'; }
                // AMD Radeon - checked longest/most-specific model string first so e.g.
                // "7900 XTX" isn't mis-matched by the shorter "7900 XT" check.
                else if (gpuUpper.includes('7900 XTX')) { estimatedVram = 24.0; gpuName = 'AMD Radeon RX 7900 XTX'; isDetected = true; detectedVendorKey = 'amd'; }
                else if (gpuUpper.includes('7900 XT')) { estimatedVram = 20.0; gpuName = 'AMD Radeon RX 7900 XT'; isDetected = true; detectedVendorKey = 'amd'; }
                else if (gpuUpper.includes('7900 GRE')) { estimatedVram = 16.0; gpuName = 'AMD Radeon RX 7900 GRE'; isDetected = true; detectedVendorKey = 'amd'; }
                else if (gpuUpper.includes('7800 XT')) { estimatedVram = 16.0; gpuName = 'AMD Radeon RX 7800 XT'; isDetected = true; detectedVendorKey = 'amd'; }
                else if (gpuUpper.includes('7700 XT')) { estimatedVram = 12.0; gpuName = 'AMD Radeon RX 7700 XT'; isDetected = true; detectedVendorKey = 'amd'; }
                else if (gpuUpper.includes('6950 XT')) { estimatedVram = 16.0; gpuName = 'AMD Radeon RX 6950 XT'; isDetected = true; detectedVendorKey = 'amd'; }
                else if (gpuUpper.includes('6900 XT')) { estimatedVram = 16.0; gpuName = 'AMD Radeon RX 6900 XT'; isDetected = true; detectedVendorKey = 'amd'; }
                else if (gpuUpper.includes('6800 XT')) { estimatedVram = 16.0; gpuName = 'AMD Radeon RX 6800 XT'; isDetected = true; detectedVendorKey = 'amd'; }
                else if (gpuUpper.includes('6800')) { estimatedVram = 16.0; gpuName = 'AMD Radeon RX 6800'; isDetected = true; detectedVendorKey = 'amd'; }
                else if (gpuUpper.includes('6700 XT')) { estimatedVram = 12.0; gpuName = 'AMD Radeon RX 6700 XT'; isDetected = true; detectedVendorKey = 'amd'; }
                // Intel Arc
                else if (gpuUpper.includes('ARC B580')) { estimatedVram = 12.0; gpuName = 'Intel Arc B580'; isDetected = true; detectedVendorKey = 'intel'; }
                else if (gpuUpper.includes('ARC A770')) { estimatedVram = 16.0; gpuName = 'Intel Arc A770'; isDetected = true; detectedVendorKey = 'intel'; }
                else if (gpuUpper.includes('ARC A750')) { estimatedVram = 8.0; gpuName = 'Intel Arc A750'; isDetected = true; detectedVendorKey = 'intel'; }
                else if (gpuUpper.includes('ARC A580')) { estimatedVram = 8.0; gpuName = 'Intel Arc A580'; isDetected = true; detectedVendorKey = 'intel'; }
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

                // detectedVendorKey covers the WebGL-fallback path; the server-side
                // /api/detect-hardware path above never sets it, so fall back to a
                // name-based guess there too. Previously this always forced 'nvidia'
                // (unless the name said 'apple'), silently mislabeling AMD/Intel and
                // leaving state.gpuVendor out of sync with the dropdown's displayed value.
                let finalVendorKey = detectedVendorKey;
                const gpuNameLower = gpuName.toLowerCase();
                if (gpuNameLower.includes('apple')) finalVendorKey = 'apple';
                else if (gpuNameLower.includes('amd') || gpuNameLower.includes('radeon')) finalVendorKey = 'amd';
                else if (gpuNameLower.includes('intel') || gpuNameLower.includes('arc')) finalVendorKey = 'intel';

                if (gpuVendorSelect) gpuVendorSelect.value = finalVendorKey;
                state.gpuVendor = finalVendorKey;
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
}
