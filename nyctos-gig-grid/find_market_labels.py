# find_market_labels.py
import os

gig_grid_dir = r"c:\Users\joshu\OneDrive\Documents\AI Projects\Website1\vm_code\nyctos-gig-grid"

for root, dirs, files in os.walk(gig_grid_dir):
    for f in files:
        if f.endswith('.php') or f.endswith('.js'):
            path = os.path.join(root, f)
            rel_path = os.path.relpath(path, gig_grid_dir)
            with open(path, 'r', encoding='utf-8', errors='ignore') as pfile:
                content = pfile.read()
                lines = content.splitlines()
                for idx, line in enumerate(lines, 1):
                    if 'front-range' in line.lower() or 'socal' in line.lower():
                        if 'front range' in line.lower() or 'socal' in line.lower() or 'front-range' in line.lower():
                            print(f"{rel_path}:{idx} -> {line.strip()[:100]}")
