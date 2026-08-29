import math
from typing import List, Dict, Any

class RecommendationEngine:
    # Estimated KV-cache VRAM overhead (GB) by target context window (thousands of
    # tokens). Mirrors js/app.js's getKvCacheOverhead() so the backend and the
    # client-side fallback engine size hardware fit identically.
    KV_CACHE_OVERHEAD_GB = {4: 0.4, 8: 0.8, 16: 1.5, 32: 3.5, 64: 5.5, 128: 8.0}

    @staticmethod
    def calculate_vram_required(params_b: float, quant_bits: int = 4, overhead_multiplier: float = 1.25) -> float:
        raw_gb = (params_b * quant_bits) / 8.0
        return round(raw_gb * overhead_multiplier, 2)

    @classmethod
    def get_kv_cache_overhead(cls, context_k: int) -> float:
        return cls.KV_CACHE_OVERHEAD_GB.get(context_k, 1.5)

    @classmethod
    def run_pipeline(
        cls,
        models: List[Dict[str, Any]],
        user_vram_gb: float,
        user_ram_gb: float,
        goal: str,
        preferred_quant: int = 4,
        context_k: int = 16
    ) -> Dict[str, Any]:
        user_vram_gb = max(user_vram_gb, 1.0)
        kv_overhead_gb = cls.get_kv_cache_overhead(context_k)
        surviving_models = []

        for m in models:
            params_b = m.get("params_b", 7.0)
            vram_req_q4 = cls.calculate_vram_required(params_b, quant_bits=4)
            vram_req_q8 = cls.calculate_vram_required(params_b, quant_bits=8)
            vram_req_fp16 = cls.calculate_vram_required(params_b, quant_bits=16)

            active_quant_bits = preferred_quant
            vram_weight_gb = cls.calculate_vram_required(params_b, quant_bits=active_quant_bits)
            vram_req = round(vram_weight_gb + kv_overhead_gb, 2)

            if vram_req > user_vram_gb:
                active_quant_bits = 4
                vram_weight_gb = vram_req_q4
                vram_req = round(vram_weight_gb + kv_overhead_gb, 2)

            if vram_req > user_vram_gb * 1.02:
                continue

            vram_pct = round((vram_req / user_vram_gb) * 100.0, 1)

            model_item = dict(m)
            model_item.update({
                "vram_req_gb": vram_req,
                "vram_weight_gb": vram_weight_gb,
                "kv_overhead_gb": kv_overhead_gb,
                "context_k": context_k,
                "vram_req_q4_gb": vram_req_q4,
                "vram_req_q8_gb": vram_req_q8,
                "vram_req_fp16_gb": vram_req_fp16,
                "active_quant_bits": active_quant_bits,
                "vram_usage_pct": min(vram_pct, 100.0),
                "fits_in_hardware": True
            })

            surviving_models.append(model_item)

        task_mapped_models = []
        for m in surviving_models:
            tags = [str(t).lower() for t in m.get("tags", [])]
            repo_id = m.get("id", "").lower()
            task_relevance_boost = 1.0

            if goal == "coding":
                if any(k in repo_id or k in tags for k in ["code", "coder", "starcoder", "codellama", "python", "rust", "codestral", "sql"]):
                    task_relevance_boost = 1.35
            elif goal == "image-gen":
                if any(k in repo_id or k in tags for k in ["diffusers", "flux", "sdxl", "stable-diffusion", "text-to-image"]):
                    task_relevance_boost = 1.4
            elif goal == "vision":
                if any(k in repo_id or k in tags for k in ["vision", "vlm", "multimodal", "llava", "moondream", "paligemma", "image-to-text"]):
                    task_relevance_boost = 1.4
            elif goal == "chat":
                if any(k in repo_id or k in tags for k in ["instruct", "chat", "r1", "reasoning", "llama", "gemma", "qwen"]):
                    task_relevance_boost = 1.25

            m["task_boost"] = task_relevance_boost
            task_mapped_models.append(m)

        if not task_mapped_models:
            return {"hero_cards": {}, "all_candidates": []}

        downloads_list = [m["downloads"] for m in task_mapped_models]
        likes_list = [m["likes"] for m in task_mapped_models]
        trending_list = [m["trending_score"] for m in task_mapped_models]

        max_dl_log = math.log1p(max(downloads_list) if downloads_list else 1)
        max_likes_log = math.log1p(max(likes_list) if likes_list else 1)
        max_trend_log = math.log1p(max(trending_list) if trending_list else 1)

        scored_models = []
        for m in task_mapped_models:
            norm_dl = math.log1p(m["downloads"]) / max_dl_log if max_dl_log > 0 else 0
            norm_likes = math.log1p(m["likes"]) / max_likes_log if max_likes_log > 0 else 0
            norm_trend = math.log1p(m["trending_score"]) / max_trend_log if max_trend_log > 0 else 0

            base_score = (0.4 * norm_dl) + (0.4 * norm_likes) + (0.2 * norm_trend)
            raw_score = base_score * m["task_boost"] * 100

            # A repo can rack up downloads from tooling/mirrors/auto-caching with zero
            # human endorsement behind it - that's not a plausible "Best Overall" pick
            # even if downloads alone score well. Suppress it before scoring, on top of
            # the hard vetted_pool gate below (belt-and-suspenders: this also affects
            # the model's rank in the full candidate list, not just hero eligibility).
            # Mirrors the identical guard in js/recommendation-engine.js.
            if m.get("likes", 0) == 0 and m.get("downloads", 0) < 10000:
                raw_score *= 0.25

            final_score = round(raw_score, 1)

            repo_id = m["id"]
            short_name = m["name"].lower()
            m["recommendation_score"] = final_score
            m["run_instructions"] = {
                "ollama": f"ollama run {short_name}",
                "vllm": f"python -m vllm.entrypoints.openai.api_server --model {repo_id}",
                "transformers": f"from transformers import AutoModelForCausalLM, AutoTokenizer\n\nmodel = AutoModelForCausalLM.from_pretrained('{repo_id}', torch_dtype='auto', device_map='auto')\ntokenizer = AutoTokenizer.from_pretrained('{repo_id}')"
            }

            scored_models.append(m)

        # task_boost is applied after normalizing to a 0-100 scale, so a strong task
        # match can otherwise push recommendation_score past 100 (up to ~140), which
        # reads like a percentage that broke. Rescale the whole batch down so the top
        # score is exactly 100 when that happens; relative ordering is unaffected.
        max_score = max((m["recommendation_score"] for m in scored_models), default=0)
        if max_score > 100:
            scale_factor = 100.0 / max_score
            for m in scored_models:
                m["recommendation_score"] = round(m["recommendation_score"] * scale_factor, 1)

        scored_models.sort(key=lambda x: x["recommendation_score"], reverse=True)

        # Hero cards are drawn from a "vetted" subset requiring some real community
        # engagement (>=1000 downloads AND >=5 likes) before a model can headline a
        # hero slot. Falls back to the full list if nothing clears the bar (a very
        # fresh or niche search shouldn't come back empty). Mirrors heroPool in
        # js/recommendation-engine.js - added there first after live use surfaced
        # implausible 0-like hero picks; ported here so the backend (the primary
        # path whenever it's reachable) gets the same protection.
        vetted_pool = [m for m in scored_models if m.get("downloads", 0) >= 1000 and m.get("likes", 0) >= 5]
        hero_pool = vetted_pool if vetted_pool else scored_models

        sweet_spot = [m for m in hero_pool if 60.0 <= m["vram_usage_pct"] <= 88.0]
        hero_best_overall = sweet_spot[0] if sweet_spot else (hero_pool[0] if hero_pool else None)

        speed_candidates = [m for m in hero_pool if m["vram_usage_pct"] <= 45.0]
        if speed_candidates:
            speed_candidates.sort(key=lambda x: (x["params_b"], -x["recommendation_score"]))
            hero_speed_demon = speed_candidates[0]
        else:
            sorted_by_params = sorted(hero_pool, key=lambda x: x["params_b"])
            hero_speed_demon = sorted_by_params[0] if sorted_by_params else hero_best_overall

        max_candidates = sorted(hero_pool, key=lambda x: (x["params_b"], x["recommendation_score"]), reverse=True)
        hero_max_capability = max_candidates[0] if max_candidates else hero_best_overall

        used_ids = set()
        if hero_best_overall:
            used_ids.add(hero_best_overall["id"])
        
        if hero_speed_demon and hero_speed_demon["id"] in used_ids:
            others = [m for m in scored_models if m["id"] not in used_ids]
            if others:
                hero_speed_demon = sorted(others, key=lambda x: x["params_b"])[0]

        if hero_speed_demon:
            used_ids.add(hero_speed_demon["id"])

        if hero_max_capability and hero_max_capability["id"] in used_ids:
            others = [m for m in scored_models if m["id"] not in used_ids]
            if others:
                hero_max_capability = sorted(others, key=lambda x: x["params_b"], reverse=True)[0]

        return {
            "hero_cards": {
                "best_overall": hero_best_overall,
                "speed_demon": hero_speed_demon,
                "max_capability": hero_max_capability
            },
            "all_candidates": scored_models,
            "total_candidates": len(scored_models)
        }
