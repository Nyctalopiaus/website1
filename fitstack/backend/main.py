"""
Run locally with:  uvicorn backend.main:app --reload   (from the project root, the
parent of this backend/ folder — NOT `python backend/main.py`, which does nothing).
Dependencies are pinned in backend/requirements.txt.
"""
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Literal
from concurrent.futures import ThreadPoolExecutor
import os

from backend.hardware import detect_system_hardware
from backend.hf_client import HuggingFaceClient
from backend.engine import RecommendationEngine

app = FastAPI(
    title="HuggingFace Hardware-Aware Model Discovery Engine",
    description="Full-stack web application recommending HF models optimized for user hardware setup and goal.",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

hf_client = HuggingFaceClient()

class RecommendationRequest(BaseModel):
    vram_gb: float = Field(..., ge=0.5, le=1024, description="Available GPU VRAM in GB")
    ram_gb: float = Field(..., ge=1.0, le=2048, description="Available System RAM in GB")
    gpu_type: Optional[str] = Field("NVIDIA RTX Series", description="User CPU/GPU description")
    goal: Literal["coding", "image-gen", "vision", "chat"] = Field(..., description="Target goal")
    preferred_quant: Optional[int] = Field(4, description="Quantization bits (4, 8, 16)")
    query: Optional[str] = Field("", description="Optional search keyword override")
    context_k: Optional[Literal[4, 8, 16, 32, 64, 128]] = Field(16, description="Target context window in thousands of tokens, used to size KV-cache overhead")
    cpu_only: Optional[bool] = Field(False, description="RAM-only / no-GPU inference mode - fit-gate budget becomes system RAM (minus a fixed OS reserve) instead of vram_gb")

@app.get("/api/health")
def health_check():
    return {"status": "ok", "app": "Hugging Face Hardware Model Matcher"}

@app.get("/api/detect-hardware")
def get_hardware_profile():
    try:
        profile = detect_system_hardware()
        return profile
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/recommend")
def get_model_recommendations(req: RecommendationRequest):
    try:
        raw_models = hf_client.fetch_models_for_goal(goal=req.goal, query=req.query or "")
        context_k = req.context_k or 16
        cpu_only = bool(req.cpu_only)
        # Same effective-budget swap as RecommendationEngine.score_models - kept
        # in sync here because the post-verification recompute below (line
        # ~156 originally) needs it too, and that recompute previously always
        # divided by req.vram_gb regardless of cpu_only, silently reverting a
        # CPU-mode result's percentages back to a VRAM-relative number the
        # instant verification touched a model.
        effective_budget_gb = max(req.ram_gb - RecommendationEngine.CPU_ONLY_RAM_RESERVE_GB, 1.0) if cpu_only else max(req.vram_gb, 1.0)
        scored_models = RecommendationEngine.score_models(
            models=raw_models,
            user_vram_gb=req.vram_gb,
            user_ram_gb=req.ram_gb,
            goal=req.goal,
            preferred_quant=req.preferred_quant or 4,
            context_k=context_k,
            cpu_only=cpu_only
        )

        if not scored_models:
            data_source = raw_models[0]["source"] if raw_models else "live"
            return {
                "request_hardware": {
                    "vram_gb": req.vram_gb, "ram_gb": req.ram_gb, "gpu_type": req.gpu_type,
                    "goal": req.goal, "context_k": context_k, "cpu_only": cpu_only
                },
                "source": data_source,
                "hero_cards": {}, "all_candidates": [], "total_candidates": 0
            }

        # Real GGUF verification runs BEFORE hero selection, over a bounded slice
        # of the pool - not just the 3 eventual winners after the fact. The
        # ingestion-time gate in hf_client.fetch_models_for_goal() that decides
        # what makes it into `scored_models` at all is a cheap tag/substring
        # heuristic, not a real check against the repo's actual files; a model
        # that heuristically looks GGUF-tagged but isn't could otherwise win a
        # hero slot (or rank highly in the table) with fully-computed but fake
        # quantized VRAM numbers. Verifying first and gating hero eligibility on
        # the result closes that gap instead of only relabeling it afterward.
        #
        # The slice: the models actually reachable by hero selection (the vetted
        # >=1000dl/>=5like pool, or the full list if nothing clears that bar) -
        # top ~12 by score (covers best_overall/max_capability candidates) plus
        # bottom ~3 by params_b (covers speed_demon, which optimizes for
        # smallest-not-highest-score). Bounded so this stays cheap regardless of
        # pool size; every model outside the slice keeps score_models()'s honest
        # "estimated / not checked" defaults rather than being silently treated
        # as verified.
        vetted_for_verification = [m for m in scored_models if m.get("downloads", 0) >= 1000 and m.get("likes", 0) >= 5]
        verification_pool = vetted_for_verification if vetted_for_verification else scored_models
        top_by_score = sorted(verification_pool, key=lambda x: x["recommendation_score"], reverse=True)[:12]
        bottom_by_params = sorted(verification_pool, key=lambda x: x["params_b"])[:3]
        verification_candidates: Dict[str, Dict[str, Any]] = {}
        for m in (top_by_score + bottom_by_params):
            verification_candidates[m["id"]] = m

        unique_lookups = [(m["id"], m.get("active_quant_bits", 4)) for m in verification_candidates.values()]

        verify_by_id: Dict[str, Optional[Dict[str, Any]]] = {}
        if unique_lookups:
            with ThreadPoolExecutor(max_workers=min(len(unique_lookups), 10)) as executor:
                futures = {
                    executor.submit(hf_client.get_exact_gguf_info, repo_id, quant_bits, context_k): repo_id
                    for repo_id, quant_bits in unique_lookups
                }
                for future in futures:
                    repo_id = futures[future]
                    try:
                        verify_by_id[repo_id] = future.result()
                    except Exception:
                        verify_by_id[repo_id] = None

        for m in verification_candidates.values():
            verified = verify_by_id.get(m["id"]) or {}

            if "exact_weight_gb" in verified:
                m["vram_weight_gb"] = verified["exact_weight_gb"]
                m["vram_source"] = "exact"
                m["verified_gguf"] = True
                m["matched_quant_files"] = verified["matched_files"]
                if "exact_params_b" in verified:
                    m["exact_params_b"] = verified["exact_params_b"]
                if "native_context_length" in verified:
                    m["native_context_length"] = verified["native_context_length"]
            else:
                # Actually looked up and found no real .gguf file - distinct from
                # "never checked" (verified_gguf stays None on every model outside
                # this verification slice). Excluded from hero eligibility, but
                # kept in the table with this flag so the frontend can show an
                # honest "unverified" marker rather than hiding it outright.
                m["vram_source"] = "estimated"
                m["verified_gguf"] = False
                m["hero_eligible"] = False

            if "exact_kv_overhead_gb" in verified:
                m["kv_overhead_gb"] = verified["exact_kv_overhead_gb"]
                m["kv_overhead_source"] = "exact"
                m["kv_architecture"] = verified["kv_architecture"]
            else:
                m["kv_overhead_source"] = "estimated"

            # Recompute totals once, after both pieces (weight, KV) have had their
            # chance to be upgraded independently - either, both, or neither may
            # have come back exact.
            m["vram_req_gb"] = round(m["vram_weight_gb"] + m["kv_overhead_gb"], 2)
            m["vram_usage_pct"] = min(round((m["vram_req_gb"] / effective_budget_gb) * 100.0, 1), 100.0)

        results = RecommendationEngine.select_heroes(scored_models)

        # All models in a batch come from the same source (either the live HF Hub
        # search succeeded, or it failed and we fell back to the seed list) - surface
        # that on the response so the frontend can tell the user when results are
        # a small offline sample rather than a live search.
        data_source = raw_models[0]["source"] if raw_models else "live"
        return {
            "request_hardware": {
                "vram_gb": req.vram_gb,
                "ram_gb": req.ram_gb,
                "gpu_type": req.gpu_type,
                "goal": req.goal,
                "context_k": req.context_k or 16
            },
            "source": data_source,
            "hero_cards": results["hero_cards"],
            "all_candidates": results["all_candidates"],
            "total_candidates": results["total_candidates"]
        }
    except Exception as e:
        print(f"[API Error] /api/recommend: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate recommendations: {str(e)}")

current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)

# Serve the frontend's static assets. These were previously imported (StaticFiles)
# but never mounted, so css/js/assets all 404'd when this backend served the site.
# Mounts are conditional: in some deployments (e.g. this app running behind a
# webserver that already serves css/js/assets directly from a separate static
# root) these directories won't exist next to backend/, and StaticFiles() raises
# at import time if the directory is missing - which would crash the whole app
# for every request, including unrelated API routes. Only mount what's present.
for _static_name, _static_dir in (
    ("css", os.path.join(parent_dir, "css")),
    ("js", os.path.join(parent_dir, "js")),
    ("assets", os.path.join(parent_dir, "assets")),
):
    if os.path.isdir(_static_dir):
        app.mount(f"/{_static_name}", StaticFiles(directory=_static_dir), name=_static_name)
    else:
        print(f"[startup] Skipping /{_static_name} mount - directory not found: {_static_dir}")

@app.get("/")
def read_root():
    index_path = os.path.join(parent_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "Frontend index.html not found."}
