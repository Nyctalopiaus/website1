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

                # Every downstream feature (the run-instructions modal, the Ollama/
                # LM Studio commands, the KV-cache VRAM math) assumes the model has a
                # GGUF file to actually run locally. A model whose repo/tags don't
                # mention GGUF is almost always the original full-precision release
                # (e.g. "Qwen/Qwen2.5-Coder-14B-Instruct" rather than a community
                # "...-GGUF" quant of it) - recommending those sends users to a modal
                # with nothing to download. Skip anything that isn't GGUF/MLX up front
                # instead of only recording has_gguf as inert metadata.
                if not (has_gguf or "mlx" in repo_id.lower() or any("mlx" in str(t).lower() for t in tags)):
                    continue

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
                    "name": repo_id.split('/')[-1] if '/' in repo_id else repo_id,
                    "source": "live"
                })

            # If the search term matched real models but none of them were GGUF/MLX
            # (e.g. a very new release nobody has quantized yet), fall back to the
            # curated seed list rather than showing an empty result set.
            if not models_result:
                models_result = self._get_fallback_seed_models(goal, query)
        except Exception as e:
            print(f"[HFClient] Error fetching models for {goal}: {e}")
            models_result = self._get_fallback_seed_models(goal, query)

        self._cache[cache_key] = {"timestamp": now, "data": models_result}
        return models_result

    def _get_fallback_seed_models(self, goal: str, query: str = "") -> List[Dict[str, Any]]:
        seeds = self._get_fallback_seed_models_unfiltered(goal)
        query = (query or "").strip().lower()
        if query:
            # Only the tiny hardcoded seed set is available here (we've already
            # failed to reach the live HF Hub API), but it should still respect
            # whatever the user typed instead of silently ignoring it.
            filtered = [m for m in seeds if query in m["id"].lower() or any(query in str(t).lower() for t in m.get("tags", []))]
            if filtered:
                seeds = filtered
        for m in seeds:
            m["source"] = "fallback"
        return seeds

    def _get_fallback_seed_models_unfiltered(self, goal: str) -> List[Dict[str, Any]]:
        # These IDs must actually be GGUF repos (not the original full-precision
        # release) - the run-instructions modal, Ollama/LM Studio commands, and
        # KV-cache VRAM math all assume a downloadable .gguf file exists. Kept in
        # sync with the equivalent client-side fallback list in js/app.js's
        # getFallbackModels(), which was already correct on this point.
        if goal == "coding":
            return [
                {"id": "mradermacher/Llama3.3-coder-70b-GGUF", "pipeline_tag": "text-generation", "tags": ["code", "gguf"], "downloads": 550000, "likes": 3200, "trending_score": 10300.0, "params_b": 70.0, "has_gguf": True, "has_fp16": False, "has_safetensors": False, "author": "mradermacher", "name": "Llama3.3-coder-70b-GGUF"},
                {"id": "unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF", "pipeline_tag": "text-generation", "tags": ["code", "gguf"], "downloads": 1150000, "likes": 2100, "trending_score": 14650.0, "params_b": 30.0, "has_gguf": True, "has_fp16": False, "has_safetensors": False, "author": "unsloth", "name": "Qwen3-Coder-30B-A3B-Instruct-GGUF"},
                {"id": "Qwen/Qwen2.5-Coder-14B-Instruct-GGUF", "pipeline_tag": "text-generation", "tags": ["code", "gguf"], "downloads": 890000, "likes": 2800, "trending_score": 13100.0, "params_b": 14.0, "has_gguf": True, "has_fp16": False, "has_safetensors": False, "author": "Qwen", "name": "Qwen2.5-Coder-14B-Instruct-GGUF"},
                {"id": "Qwen/Qwen2.5-Coder-7B-Instruct-GGUF", "pipeline_tag": "text-generation", "tags": ["code", "gguf"], "downloads": 1250000, "likes": 3400, "trending_score": 17600.0, "params_b": 7.0, "has_gguf": True, "has_fp16": False, "has_safetensors": False, "author": "Qwen", "name": "Qwen2.5-Coder-7B-Instruct-GGUF"},
                {"id": "Qwen/Qwen2.5-Coder-1.5B-Instruct-GGUF", "pipeline_tag": "text-generation", "tags": ["code", "gguf"], "downloads": 950000, "likes": 1400, "trending_score": 11600.0, "params_b": 1.5, "has_gguf": True, "has_fp16": False, "has_safetensors": False, "author": "Qwen", "name": "Qwen2.5-Coder-1.5B-Instruct-GGUF"},
            ]
        elif goal == "image-gen":
            return [
                {"id": "city96/FLUX.1-schnell-gguf", "pipeline_tag": "text-to-image", "tags": ["flux", "gguf"], "downloads": 3200000, "likes": 6500, "trending_score": 41750.0, "params_b": 12.0, "has_gguf": True, "has_fp16": False, "has_safetensors": False, "author": "city96", "name": "FLUX.1-schnell-gguf"},
                {"id": "city96/FLUX.1-dev-gguf", "pipeline_tag": "text-to-image", "tags": ["flux", "gguf"], "downloads": 2800000, "likes": 7800, "trending_score": 39700.0, "params_b": 12.0, "has_gguf": True, "has_fp16": False, "has_safetensors": False, "author": "city96", "name": "FLUX.1-dev-gguf"},
                {"id": "bartowski/stable-diffusion-xl-base-1.0-GGUF", "pipeline_tag": "text-to-image", "tags": ["sdxl", "gguf"], "downloads": 4500000, "likes": 8900, "trending_score": 58350.0, "params_b": 3.5, "has_gguf": True, "has_fp16": False, "has_safetensors": False, "author": "bartowski", "name": "stable-diffusion-xl-base-1.0-GGUF"},
            ]
        elif goal == "vision":
            return [
                {"id": "leafspark/Llama-3.2-11B-Vision-Instruct-GGUF", "pipeline_tag": "image-to-text", "tags": ["vision", "gguf"], "downloads": 1100000, "likes": 3200, "trending_score": 15800.0, "params_b": 11.0, "has_gguf": True, "has_fp16": False, "has_safetensors": False, "author": "leafspark", "name": "Llama-3.2-11B-Vision-Instruct-GGUF"},
                {"id": "Qwen/Qwen2-VL-7B-Instruct-GGUF", "pipeline_tag": "image-to-text", "tags": ["vision", "gguf"], "downloads": 1400000, "likes": 2100, "trending_score": 17150.0, "params_b": 7.0, "has_gguf": True, "has_fp16": False, "has_safetensors": False, "author": "Qwen", "name": "Qwen2-VL-7B-Instruct-GGUF"},
                {"id": "vikhyatk/moondream2-gguf", "pipeline_tag": "image-to-text", "tags": ["vision", "gguf"], "downloads": 850000, "likes": 2700, "trending_score": 12550.0, "params_b": 1.8, "has_gguf": True, "has_fp16": False, "has_safetensors": False, "author": "vikhyatk", "name": "moondream2-gguf"},
            ]
        else:
            return [
                {"id": "unsloth/Llama-3.3-70B-Instruct-GGUF", "pipeline_tag": "text-generation", "tags": ["llama", "gguf"], "downloads": 1800000, "likes": 4100, "trending_score": 24150.0, "params_b": 70.0, "has_gguf": True, "has_fp16": False, "has_safetensors": False, "author": "unsloth", "name": "Llama-3.3-70B-Instruct-GGUF"},
                {"id": "bartowski/DeepSeek-R1-Distill-Qwen-14B-GGUF", "pipeline_tag": "text-generation", "tags": ["reasoning", "gguf"], "downloads": 3100000, "likes": 5600, "trending_score": 39400.0, "params_b": 14.0, "has_gguf": True, "has_fp16": False, "has_safetensors": False, "author": "bartowski", "name": "DeepSeek-R1-Distill-Qwen-14B-GGUF"},
                {"id": "bartowski/DeepSeek-R1-Distill-Qwen-8B-GGUF", "pipeline_tag": "text-generation", "tags": ["reasoning", "gguf"], "downloads": 3100000, "likes": 5600, "trending_score": 39400.0, "params_b": 8.0, "has_gguf": True, "has_fp16": False, "has_safetensors": False, "author": "bartowski", "name": "DeepSeek-R1-Distill-Qwen-8B-GGUF"},
                {"id": "bartowski/Meta-Llama-3.1-8B-Instruct-GGUF", "pipeline_tag": "text-generation", "tags": ["llama", "gguf"], "downloads": 5200000, "likes": 9800, "trending_score": 66700.0, "params_b": 8.0, "has_gguf": True, "has_fp16": False, "has_safetensors": False, "author": "bartowski", "name": "Meta-Llama-3.1-8B-Instruct-GGUF"},
            ]
