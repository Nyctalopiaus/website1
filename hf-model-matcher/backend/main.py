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
        results = RecommendationEngine.run_pipeline(
            models=raw_models,
            user_vram_gb=req.vram_gb,
            user_ram_gb=req.ram_gb,
            goal=req.goal,
            preferred_quant=req.preferred_quant or 4,
            context_k=req.context_k or 16
        )
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
