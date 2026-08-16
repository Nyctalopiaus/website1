from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
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
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

hf_client = HuggingFaceClient()

class RecommendationRequest(BaseModel):
    vram_gb: float = Field(..., ge=0.5, le=1024, description="Available GPU VRAM in GB")
    ram_gb: float = Field(..., ge=1.0, le=2048, description="Available System RAM in GB")
    gpu_type: Optional[str] = Field("NVIDIA RTX Series", description="User CPU/GPU description")
    goal: str = Field(..., description="Target goal: coding, image-gen, vision, chat")
    preferred_quant: Optional[int] = Field(4, description="Quantization bits (4, 8, 16)")
    query: Optional[str] = Field("", description="Optional search keyword override")

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
            preferred_quant=req.preferred_quant or 4
        )
        return {
            "request_hardware": {
                "vram_gb": req.vram_gb,
                "ram_gb": req.ram_gb,
                "gpu_type": req.gpu_type,
                "goal": req.goal
            },
            "hero_cards": results["hero_cards"],
            "all_candidates": results["all_candidates"],
            "total_candidates": results["total_candidates"]
        }
    except Exception as e:
        print(f"[API Error] /api/recommend: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate recommendations: {str(e)}")

current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)

@app.get("/")
def read_root():
    index_path = os.path.join(parent_dir, "index.html")
    if os.path.exists(index_path):
        return FileResponse(index_path)
    return {"message": "Frontend index.html not found."}
