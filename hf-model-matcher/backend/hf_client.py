import re
import time
from typing import List, Dict, Any, Optional
from huggingface_hub import HfApi

class HuggingFaceClient:
    def __init__(self):
        self.api = HfApi()
        self._cache: Dict[str, Any] = {}
        self._cache_ttl = 600

    def _get_cache_key(self, goal: str, query: str = "") -> str:
        return f"{goal}:{query}"

    def parse_parameter_count_b(self, repo_id: str, tags: List[str] = None) -> float:
        tags = tags or []
        repo_lower = repo_id.lower()

        for tag in tags:
            tag_str = str(tag).lower()
            if tag_str.startswith("params:"):
                val = tag_str.replace("params:", "").strip()
                if val.endswith("b"):
                    try: return float(val[:-1])
                    except ValueError: pass
                elif val.endswith("m"):
                    try: return float(val[:-1]) / 1000.0
                    except ValueError: pass

        match = re.search(r'(?:^|[\-_/\s])(\d+(?:\.\d+)?)\s*[bB](?:[\-_/\s]|$)', repo_id)
        if match:
            try:
                val = float(match.group(1))
                if 0.05 <= val <= 500.0:
                    return val
            except ValueError:
                pass

        match_m = re.search(r'(?:^|[\-_/\s])(\d+(?:\.\d+)?)\s*[mM](?:[\-_/\s]|$)', repo_id)
        if match_m:
            try:
                val = float(match_m.group(1))
                if 10 <= val <= 2000:
                    return val / 1000.0
            except ValueError:
                pass

        if "flux" in repo_lower: return 12.0
        if "sdxl" in repo_lower: return 3.5
        if "stable-diffusion-v1" in repo_lower: return 1.0
        if "stable-diffusion-3" in repo_lower: return 8.0
        if "moondream" in repo_lower: return 1.8
        if "minicpm-v" in repo_lower: return 8.0
        if "paligemma" in repo_lower: return 3.0
        if "llava" in repo_lower: return 7.0
        if "starcoder2-3b" in repo_lower: return 3.0
        if "starcoder2-7b" in repo_lower: return 7.0
        if "starcoder2-15b" in repo_lower: return 15.0
        if "deepseek-coder-6.7b" in repo_lower: return 6.7
        if "deepseek-coder-33b" in repo_lower: return 33.0
        if "codestral" in repo_lower: return 22.0
        if "mistral-7b" in repo_lower: return 7.0
        if "command-r-plus" in repo_lower: return 104.0
        if "command-r" in repo_lower: return 35.0

        return 7.0

    def fetch_models_for_goal(self, goal: str, query: str = "", limit: int = 40) -> List[Dict[str, Any]]:
        cache_key = self._get_cache_key(goal, query)
        now = time.time()
        if cache_key in self._cache:
            entry = self._cache[cache_key]
            if now - entry["timestamp"] < self._cache_ttl:
                return entry["data"]

        models_result = []
        pipeline_tag = None
        search_term = query

        if goal == "coding":
            pipeline_tag = "text-generation"
            if not search_term: search_term = "coder"
        elif goal == "image-gen":
            pipeline_tag = "text-to-image"
            if not search_term: search_term = "diffusers"
        elif goal == "vision":
            pipeline_tag = "image-to-text"
            if not search_term: search_term = "vision"
        elif goal == "chat":
            pipeline_tag = "text-generation"
            if not search_term: search_term = "instruct"

        try:
            fetched = self.api.list_models(
                filter=pipeline_tag if pipeline_tag else None,
                search=search_term if search_term else None,
                sort="downloads",
                limit=limit,
                full=False
            )

            for m in fetched:
                repo_id = m.id
                tags = getattr(m, "tags", []) or []
                downloads = getattr(m, "downloads", 0) or 0
                likes = getattr(m, "likes", 0) or 0
                params_b = self.parse_parameter_count_b(repo_id, tags)
                
                has_gguf = any("gguf" in str(t).lower() for t in tags) or "gguf" in repo_id.lower()
                has_fp16 = any("fp16" in str(t).lower() for t in tags) or "fp16" in repo_id.lower()
                has_safetensors = any("safetensors" in str(t).lower() for t in tags)
                
                trending_score = float(likes) * 1.5 + float(downloads) * 0.01

                models_result.append({
                    "id": repo_id,
                    "pipeline_tag": getattr(m, "pipeline_tag", pipeline_tag or "text-generation"),
                    "tags": tags,
                    "downloads": downloads,
                    "likes": likes,
                    "trending_score": trending_score,
                    "params_b": params_b,
                    "has_gguf": has_gguf,
                    "has_fp16": has_fp16,
                    "has_safetensors": has_safetensors,
                    "author": repo_id.split('/')[0] if '/' in repo_id else "Community",
                    "name": repo_id.split('/')[-1] if '/' in repo_id else repo_id
                })
        except Exception as e:
            print(f"[HFClient] Error fetching models for {goal}: {e}")
            models_result = self._get_fallback_seed_models(goal)

        self._cache[cache_key] = {"timestamp": now, "data": models_result}
        return models_result

    def _get_fallback_seed_models(self, goal: str) -> List[Dict[str, Any]]:
        if goal == "coding":
            return [
                {"id": "Qwen/Qwen2.5-Coder-7B-Instruct", "pipeline_tag": "text-generation", "tags": ["code"], "downloads": 1250000, "likes": 3400, "trending_score": 5100, "params_b": 7.0, "has_gguf": True, "has_fp16": True, "has_safetensors": True, "author": "Qwen", "name": "Qwen2.5-Coder-7B-Instruct"},
                {"id": "Qwen/Qwen2.5-Coder-14B-Instruct", "pipeline_tag": "text-generation", "tags": ["code"], "downloads": 890000, "likes": 2800, "trending_score": 4200, "params_b": 14.0, "has_gguf": True, "has_fp16": True, "has_safetensors": True, "author": "Qwen", "name": "Qwen2.5-Coder-14B-Instruct"},
                {"id": "deepseek-ai/DeepSeek-R1-Distill-Qwen-14B", "pipeline_tag": "text-generation", "tags": ["code"], "downloads": 1500000, "likes": 4200, "trending_score": 6300, "params_b": 14.0, "has_gguf": True, "has_fp16": True, "has_safetensors": True, "author": "deepseek-ai", "name": "DeepSeek-R1-Distill-Qwen-14B"},
            ]
        elif goal == "image-gen":
            return [
                {"id": "black-forest-labs/FLUX.1-schnell", "pipeline_tag": "text-to-image", "tags": ["flux"], "downloads": 3200000, "likes": 6500, "trending_score": 9750, "params_b": 12.0, "has_gguf": True, "has_fp16": True, "has_safetensors": True, "author": "black-forest-labs", "name": "FLUX.1-schnell"},
                {"id": "stabilityai/stable-diffusion-xl-base-1.0", "pipeline_tag": "text-to-image", "tags": ["sdxl"], "downloads": 4500000, "likes": 8900, "trending_score": 13350, "params_b": 3.5, "has_gguf": False, "has_fp16": True, "has_safetensors": True, "author": "stabilityai", "name": "stable-diffusion-xl-base-1.0"},
            ]
        elif goal == "vision":
            return [
                {"id": "Qwen/Qwen2-VL-7B-Instruct", "pipeline_tag": "image-to-text", "tags": ["vision"], "downloads": 1100000, "likes": 3200, "trending_score": 4800, "params_b": 7.0, "has_gguf": True, "has_fp16": True, "has_safetensors": True, "author": "Qwen", "name": "Qwen2-VL-7B-Instruct"},
            ]
        else:
            return [
                {"id": "deepseek-ai/DeepSeek-R1-Distill-Qwen-8B", "pipeline_tag": "text-generation", "tags": ["instruct"], "downloads": 3100000, "likes": 5600, "trending_score": 8400, "params_b": 8.0, "has_gguf": True, "has_fp16": True, "has_safetensors": True, "author": "deepseek-ai", "name": "DeepSeek-R1-Distill-Qwen-8B"},
                {"id": "meta-llama/Llama-3.1-8B-Instruct", "pipeline_tag": "text-generation", "tags": ["llama"], "downloads": 5200000, "likes": 9800, "trending_score": 14700, "params_b": 8.0, "has_gguf": True, "has_fp16": True, "has_safetensors": True, "author": "meta-llama", "name": "Llama-3.1-8B-Instruct"},
            ]
