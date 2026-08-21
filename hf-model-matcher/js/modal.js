/* ==========================================================================
   MODAL MODULE
   Owns all four overlay modals: the per-model "Setup Guide" launcher modal
   (GGUF file lookup + tabbed run instructions), and the three static info
   modals (Quickstart, Quant Matrix, Onboarding) - their open/close wiring,
   tab switching, copy-to-clipboard buttons, and the Escape-key handler.

   Extracted from app.js (module #5 of the incremental split). Fully
   self-contained: unlike hardware-profile.js this doesn't need an
   init({state, ...callbacks}) call, since none of its listeners mutate
   shared app state or call back into app.js - they're pure DOM/UI wiring
   and register themselves at module load (safe under `type="module"`,
   which runs after the DOM has parsed, same as the other split modules).

   The one function that needs live app data is openCodeModal(), so it's
   exported and takes `state` as an explicit parameter each call (rather
   than via injection), since it's invoked fresh per click rather than
   registered once - renderer.js's `onLaunchClick(repoId)` callback in
   app.js wraps it as `(repoId) => openCodeModal(repoId, state)`.
   ========================================================================== */

// --- DOM Elements ---
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

// --- STAGE 2: Launcher Modal Handler ---
export async function openCodeModal(repoId, state) {
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
            <details style="margin-top: 12px; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 10px;">
                <summary style="cursor: pointer; font-size: 12px; font-weight: 700; color: #94A3B8;">❓ New to local LLMs? What is this file, and what do I do with it?</summary>
                <div style="margin-top: 8px; font-size: 12.5px; line-height: 1.65; color: #CBD5E1;">
                    <strong>GGUF</strong> is a single-file model format used by local-AI apps like <strong>LM Studio</strong> and <strong>Ollama</strong> to run this model on your own computer, fully offline &mdash; no cloud, no API key.<br><br>
                    The letters/numbers in the filename (like <code>Q4_K_M</code>) describe how much the model has been compressed to fit in memory: lower numbers (Q3, Q4) use less VRAM/RAM but can lose a touch of quality, while higher numbers (Q6, Q8) stay closer to full quality but need more memory. <code>Q4_K_M</code> / <code>Q5_K_M</code> is a good default for most setups &mdash; see the <strong>Quant Matrix</strong> button up top for the full breakdown.<br><br>
                    <strong>What to do next:</strong> click "Direct Download File" above to save it, then either drag the file straight into <strong>LM Studio</strong> (or use its "Load Model" button), or use the <strong>Ollama + WebUI</strong> tab below to run it by name.
                </div>
            </details>
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
        // No .gguf files in this repo - it's the original, full-precision release,
        // not a version quantized for local use. Rather than a dead-end message,
        // point the user at a Hugging Face search for a community GGUF conversion
        // (community uploaders like bartowski/unsloth/mradermacher routinely publish
        // these as separate "<model>-GGUF" repos within days of a model's release).
        if (modalTargetFilename) modalTargetFilename.textContent = `This repo only has the original (non-quantized) model files - no ready-to-use GGUF version here.`;
        if (btnDirectDownload) {
            btnDirectDownload.style.display = 'inline-flex';
            btnDirectDownload.href = `https://huggingface.co/models?search=${encodeURIComponent(baseName + ' GGUF')}`;
            btnDirectDownload.querySelector('span:first-child').textContent = '🔍';
            btnDirectDownload.querySelector('span:last-child').textContent = 'Search for a GGUF Version';
        }
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

// Escape closes whichever modal is currently open (keyboard accessibility)
document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    [modalOverlay, modalQuickstartOverlay, modalQuantOverlay, modalOnboardingOverlay].forEach(overlay => {
        if (overlay) overlay.classList.remove('active');
    });
});
