import json
import re
import time
from typing import List, Dict, Any, Optional
from urllib.request import Request, urlopen
from huggingface_hub import HfApi

class HuggingFaceClient:
    # Priority-ordered filename tokens to look for on the Hub when verifying a
    # model's real .gguf size, per requested quant level. Community GGUF repos
    # (bartowski, unsloth, mradermacher, etc.) follow this naming convention near-
    # universally; multiple tokens are tried in case the top pick isn't present in
    # a given repo. Kept in sync with QUANT_FILENAME_TOKENS in
    # js/recommendation-engine.js.
    QUANT_FILENAME_TOKENS = {
        4: ["q4_k_m", "q4_k_s", "q4_k_l", "q4_0", "iq4_xs", "iq4_nl"],
        8: ["q8_0"],
        16: ["f16", "fp16"],
    }

    # config.json field-name aliases to try, in order, for each architecture
    # number the real KV-cache formula needs. The vast majority of modern causal
    # LMs (Llama/Qwen/Mistral/Gemma/Phi/DeepSeek families) publish the first name
    # in each list; the alternates cover older/less common config schemas. Kept
    # in sync with ARCH_FIELD_ALIASES in js/recommendation-engine.js.
    ARCH_FIELD_ALIASES = {
        "num_hidden_layers": ["num_hidden_layers", "n_layer", "num_layers"],
        "num_attention_heads": ["num_attention_heads", "n_head", "num_heads"],
        "num_key_value_heads": ["num_key_value_heads", "n_head_kv", "num_kv_heads"],
        "hidden_size": ["hidden_size", "n_embd", "d_model"],
    }

    def __init__(self):
        self.api = HfApi()
        self._cache: Dict[str, Any] = {}
        self._cache_ttl = 600
        # get_exact_gguf_info() now runs over a ~15-model bounded slice per
        # request (previously only the 3 hero picks) so the same popular
        # repos get re-verified on nearly every request with the same
        # defaults (goal + context_k=16) - cache results the same way the
        # raw search results are cached above, keyed on the exact lookup
        # inputs since quant_bits/context_k both affect the answer.
        self._verify_cache: Dict[str, Any] = {}
        self._verify_cache_ttl = 600

    def _get_cache_key(self, goal: str, query: str = "") -> str:
        return f"{goal}:{query}"

    @staticmethod
    def _first_present(cfg: Dict[str, Any], aliases: List[str]) -> Optional[float]:
        for key in aliases:
            val = cfg.get(key)
            if isinstance(val, (int, float)) and val > 0:
                return val
        return None

    def get_exact_kv_cache_gb(self, base_model_id: str, context_k: int) -> Optional[Dict[str, Any]]:
        """
        Computes the model's REAL KV-cache memory footprint from its actual
        architecture - layer count, KV-head count, head dimension - instead of the
        flat per-context-window lookup table in KV_CACHE_OVERHEAD_GB (engine.py),
        which is blind to model size/architecture entirely: a 1.5B model and a 70B
        model get charged the identical KV-cache GB for the same context length in
        that table, which is wrong. GQA models - most modern releases (Llama 3,
        Qwen2.5, Mistral, Gemma2...) - use far fewer KV heads than query heads, so
        the flat table's implicit assumption can be off by 50%+ in either
        direction depending on the model (confirmed live: Qwen2.5-Coder-7B at 16k
        context computes to ~0.92GB real vs the flat table's 1.5GB - the table
        OVER-estimates for GQA models, though it can under-estimate for others).

        Reads config.json from the model's ORIGINAL (non-GGUF) base repo rather
        than the GGUF file's own binary header - the header carries the same
        numbers, but extracting them cleanly means parsing GGUF's binary
        key-value format, whereas config.json is the same numbers as a small,
        reliable, standardized JSON file. GGUF quantizers reliably tag the base
        model via cardData.base_model (see get_exact_gguf_info).

        Standard formula: 2 (K and V) x num_layers x num_kv_heads x head_dim x
        context_tokens x 2 bytes (fp16 KV cache - llama.cpp's default). Returns
        None (falls back to the flat table) if the base model isn't reachable or
        doesn't publish the standard causal-LM config schema (e.g. non-LLM
        architectures like diffusion models don't have this concept at all).
        """
        try:
            url = f"https://huggingface.co/{base_model_id}/raw/main/config.json"
            req = Request(url, headers={"User-Agent": "hf-model-matcher/1.0"})
            with urlopen(req, timeout=6) as resp:
                cfg = json.loads(resp.read().decode("utf-8"))
        except Exception:
            return None

        num_layers = self._first_present(cfg, self.ARCH_FIELD_ALIASES["num_hidden_layers"])
        num_heads = self._first_present(cfg, self.ARCH_FIELD_ALIASES["num_attention_heads"])
        hidden_size = self._first_present(cfg, self.ARCH_FIELD_ALIASES["hidden_size"])
        # True MHA models don't publish a separate KV-head count at all - in that
        # case KV heads equal query heads (num_key_value_heads defaults to None
        # here, so this falls back to num_heads below).
        num_kv_heads = self._first_present(cfg, self.ARCH_FIELD_ALIASES["num_key_value_heads"]) or num_heads

        if not (num_layers and num_heads and hidden_size and num_kv_heads):
            return None

        head_dim = hidden_size / num_heads
        context_tokens = context_k * 1000
        kv_cache_bytes = 2 * num_layers * num_kv_heads * head_dim * context_tokens * 2
        # Decimal GB, matching the app-wide convention (see get_exact_gguf_info).
        kv_cache_gb = round(kv_cache_bytes / 1e9, 2)

        return {
            "exact_kv_overhead_gb": kv_cache_gb,
            "kv_architecture": {
                "base_model": base_model_id,
                "num_hidden_layers": int(num_layers),
                "num_attention_heads": int(num_heads),
                "num_key_value_heads": int(num_kv_heads),
                "hidden_size": int(hidden_size),
                "is_gqa": num_kv_heads < num_heads,
            },
        }

    def get_exact_gguf_info(self, repo_id: str, quant_bits: int = 4, context_k: int = 16) -> Optional[Dict[str, Any]]:
        """
        Looks up the model's REAL .gguf file size directly from the Hub, instead of
        relying on the params-times-bits estimate (which undercounts K-quants -
        Q4_K_M runs closer to ~4.5-5 effective bits/weight than a clean 4, because
        K-quants mix precision across tensors and carry per-block scale factors).
        Also pulls the exact parameter count and native max context length from the
        repo's GGUF metadata block when the Hub has parsed one, and - when the repo
        tags its base model - the real KV-cache size via get_exact_kv_cache_gb()
        instead of the flat lookup table.

        Called over a bounded pre-hero-selection verification slice (~15 models:
        top-by-score + smallest-by-params among the vetted pool - see main.py's
        get_model_recommendations) rather than the full ~40-candidate search
        batch, to keep this cheap while still closing the gap where a model that
        never actually gets a real check could win a hero slot. Sums split-file
        sizes together (large models are often shipped as
        "...-Q4_K_M-00001-of-00003.gguf" etc. rather than one file). Returns None
        on ANY failure (network, 404, no matching quant file) so callers always
        have a safe fallback to the estimate - this must never be able to break a
        request, only improve it when it can. The KV-cache lookup is independent
        of the file-size lookup succeeding: a repo with an unmatched quant file
        can still get its KV cache upgraded to a real number, and vice versa.
        Results are cached (see __init__) since the same popular repos tend to
        recur across requests with the default goal/context_k.
        """
        cache_key = f"{repo_id}:{quant_bits}:{context_k}"
        cached = self._verify_cache.get(cache_key)
        if cached is not None and (time.time() - cached["timestamp"] < self._verify_cache_ttl):
            return cached["data"]

        try:
            url = f"https://huggingface.co/api/models/{repo_id}?blobs=true"
            req = Request(url, headers={"User-Agent": "hf-model-matcher/1.0"})
            with urlopen(req, timeout=6) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except Exception:
            self._verify_cache[cache_key] = {"timestamp": time.time(), "data": None}
            return None

        siblings = data.get("siblings") or []
        tokens = self.QUANT_FILENAME_TOKENS.get(quant_bits, self.QUANT_FILENAME_TOKENS[4])

        matched_bytes = 0
        matched_token = None
        matched_files: List[str] = []
        for token in tokens:
            files = [
                s for s in siblings
                if s.get("size") and str(s.get("rfilename", "")).lower().endswith(".gguf")
                and token in str(s.get("rfilename", "")).lower()
            ]
            if files:
                matched_bytes = sum(f["size"] for f in files)
                matched_token = token
                matched_files = [f["rfilename"] for f in files]
                break

        result: Dict[str, Any] = {}

        if matched_bytes > 0:
            # Decimal GB (bytes / 1e9), matching the existing app-wide convention -
            # calculate_vram_required() already sizes everything in decimal GB (no
            # binary/1024 math anywhere in the pipeline), and this number gets
            # compared directly against that estimate plus the user's VRAM budget,
            # so it needs to speak the same unit or the comparison is skewed.
            result["exact_weight_bytes"] = matched_bytes
            result["exact_weight_gb"] = round(matched_bytes / 1e9, 2)
            result["matched_quant_token"] = matched_token
            result["matched_files"] = matched_files

        gguf_meta = data.get("gguf") or {}
        if isinstance(gguf_meta.get("total"), (int, float)) and gguf_meta["total"] > 0:
            result["exact_params_b"] = round(gguf_meta["total"] / 1e9, 2)
        if isinstance(gguf_meta.get("context_length"), (int, float)):
            result["native_context_length"] = int(gguf_meta["context_length"])

        base_model = (data.get("cardData") or {}).get("base_model")
        if isinstance(base_model, list):
            base_model = base_model[0] if base_model else None
        if isinstance(base_model, str) and base_model.strip():
            kv_result = self.get_exact_kv_cache_gb(base_model.strip(), context_k)
            if kv_result:
                result.update(kv_result)

        final_result = result or None
        self._verify_cache[cache_key] = {"timestamp": time.time(), "data": final_result}
        return final_result

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
