import psutil
import platform
import os
import subprocess
import re

def detect_system_hardware():
    """
    Detects host hardware specs including exact physical System RAM (GB), CPU cores, platform,
    and GPU model & VRAM (NVIDIA RTX 5080, 5090, 4090, Apple Silicon, etc.).
    """
    mem = psutil.virtual_memory()
    total_ram_gb = round(mem.total / (1024 ** 3), 1)
    available_ram_gb = round(mem.available / (1024 ** 3), 1)
    
    cpu_count = os.cpu_count() or 4
    cpu_name = platform.processor() or platform.machine() or "Generic CPU"
    
    gpu_info = {
        "detected": False,
        "name": "Generic GPU (undetected)",
        "vram_gb": 8.0,
        "vendor": "Generic"
    }

    try:
        import torch
        if torch.cuda.is_available():
            gpu_name = torch.cuda.get_device_name(0)
            total_vram = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
            vram_gb = round(total_vram, 1)

            gpu_info = {
                "detected": True,
                "name": gpu_name,
                "vram_gb": vram_gb,
                "vendor": "NVIDIA"
            }
            return {
                "ram_gb": total_ram_gb,
                "available_ram_gb": available_ram_gb,
                "cpu_cores": cpu_count,
                "cpu_name": cpu_name,
                "platform": platform.system(),
                "gpu": gpu_info
            }
    except Exception:
        pass

    try:
        out = subprocess.check_output(['nvidia-smi', '--query-gpu=name,memory.total', '--format=csv,noheader,nounits'], text=True, timeout=3)
        parts = [p.strip() for p in out.strip().split(',')]
        gpu_name = parts[0]
        vram_mb = float(parts[1]) if len(parts) > 1 else 16384.0
        vram_gb = round(vram_mb / 1024.0, 1)

        gpu_info = {
            "detected": True,
            "name": gpu_name,
            "vram_gb": vram_gb,
            "vendor": "NVIDIA"
        }
    except Exception:
        try:
            cmd = ['powershell', '-Command', 'Get-CimInstance Win32_VideoController | Select-Object -ExpandProperty Name']
            out = subprocess.check_output(cmd, text=True, timeout=3)
            lines = [line.strip() for line in out.splitlines() if line.strip()]
            for name in lines:
                if any(x in name.upper() for x in ["NVIDIA", "RTX", "GEFORCE", "5080", "5090", "4090"]):
                    vram_estimate = 16.0
                    if "5090" in name:
                        vram_estimate = 32.0
                    elif "4090" in name or "3090" in name:
                        vram_estimate = 24.0
                    elif "5080" in name:
                        vram_estimate = 16.0

                    gpu_info = {
                        "detected": True,
                        "name": name,
                        "vram_gb": vram_estimate,
                        "vendor": "NVIDIA"
                    }
                    break
        except Exception:
            pass

    return {
        "ram_gb": total_ram_gb,
        "available_ram_gb": available_ram_gb,
        "cpu_cores": cpu_count,
        "cpu_name": cpu_name,
        "platform": platform.system(),
        "gpu": gpu_info
    }
