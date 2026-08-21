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
    ]
};
