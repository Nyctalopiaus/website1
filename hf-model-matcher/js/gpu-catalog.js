/* ==========================================================================
   GPU CATALOG
   Static reference data: known GPU models per vendor, with their VRAM in GB,
   used to populate the "Card Model" dropdown in the Hardware Profiler.

   This is intentionally isolated in its own module: it's the piece most
   likely to need routine updates (new GPU generations, corrected VRAM
   figures) and the one most likely to be edited by someone who isn't
   otherwise touching app logic - keeping it separate means those edits
   can't accidentally break state management, rendering, or anything else.
   ========================================================================== */

export const GPU_CATALOG = {
    nvidia: [
        { label: 'NVIDIA GeForce RTX 5090 (32GB)', vram: 32 },
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
    ],
    // RAM-only / no-GPU inference. Reuses the existing vendor-switch plumbing
    // (populateGpuModels, restoreProfilerUI, saveStateToStorage) the same way
    // `custom` already works as a special sentinel vram value - see
    // hardware-profile.js's cpu-mode handling for how the VRAM slider and
    // GPU-count buttons get disabled when this is selected.
    cpu: [
        { label: '🖥️ N/A — CPU / RAM-Bound Inference', vram: 'cpu', default: true }
    ]
};

// Rough memory-bandwidth estimate (GB/s) by vendor + capacity class, used to
// make the generation-speed badge respond to how large a model is relative to
// the GPU's real bottleneck, not just whether it fits in VRAM at all (see
// getGenerationSpeed() in recommendation-engine.js). Local LLM decode is
// memory-bandwidth-bound, not compute-bound, so bandwidth - not a GPU's raw
// TFLOPS or even its VRAM capacity alone - is the right proxy for "how fast
// does this actually run." This is intentionally a coarse, capacity-tiered
// lookup rather than a per-card spec sheet: it's a hobbyist-facing directional
// estimate (same spirit as the existing "30-60+ t/s" style ranges), not a
// benchmark. Tiers are ordered highest-VRAM-first; the first row whose `min`
// the card's VRAM meets or exceeds wins.
const BANDWIDTH_TIERS_GBS = {
    // Datacenter/prosumer cards at 80GB+ (H100/H200/A100) sit far above
    // consumer GDDR6X bandwidth thanks to HBM.
    nvidia: [[80, 2000], [40, 1500], [24, 950], [16, 650], [12, 500], [0, 350]],
    amd: [[24, 960], [16, 620], [12, 480], [0, 350]],
    // Apple Silicon unified memory bandwidth scales with the chip tier (Max/
    // Ultra have wider memory buses), which correlates loosely with the total
    // unified memory capacity a given SKU ships with.
    apple: [[96, 800], [48, 550], [36, 400], [18, 250], [0, 200]],
    intel: [[0, 450]],
    custom: [[0, 400]]
};

export function estimateBandwidthGBs(vendor, vramGb) {
    const tiers = BANDWIDTH_TIERS_GBS[vendor] || BANDWIDTH_TIERS_GBS.custom;
    const vram = typeof vramGb === 'number' ? vramGb : 0;
    const match = tiers.find(([minVram]) => vram >= minVram);
    return (match || tiers[tiers.length - 1])[1];
}

// RAM reserved for the OS/desktop/other apps when running CPU-only - mirrors
// backend/engine.py's CPU_ONLY_RAM_RESERVE_GB (kept in sync by hand, same as
// every other constant shared between the two engines in this app).
const CPU_ONLY_RAM_RESERVE_GB = 4.0;

// The effective hardware-fit budget for the currently-selected vendor: GPU
// VRAM normally, or system RAM (minus a fixed OS/app reserve) when the user
// has no GPU at all (gpuVendor === 'cpu'). Centralized here so every call
// site - the client-side fallback engine, and the renderer's redisplay-time
// recompute of a model's speed badge - swaps budgets identically instead of
// each reimplementing the same `gpuVendor === 'cpu' ? ... : ...` check.
export function getEffectiveBudgetGb(state) {
    if (state.gpuVendor === 'cpu') {
        return Math.max((state.ramGb || 0) - CPU_ONLY_RAM_RESERVE_GB, 1.0);
    }
    return Math.max(state.vramGb || 0, 1.0);
}

// Swaps the unit word used in the handful of most-visible budget-related
// labels (the sidebar's VRAM slider heading, hero-card/candidate VRAM lines)
// between "VRAM" and "RAM" depending on mode. Deliberately narrow in scope -
// this isn't chasing every string in the app that happens to say "VRAM" (the
// engine-tier explainer box, tooltips, etc. are left as-is), just the labels
// a CPU-mode user would actually read while looking at their results.
export function budgetLabel(state) {
    return state.gpuVendor === 'cpu' ? 'RAM' : 'VRAM';
}
