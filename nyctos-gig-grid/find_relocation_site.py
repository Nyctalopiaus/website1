# find_relocation_site.py - Locate relocation-assessment / relocation-assistant files
import os

root_dir = r"c:\Users\joshu\OneDrive\Documents\AI Projects\Website1"

relocation_files = []
for r, d, files in os.walk(root_dir):
    for f in files:
        if 'relocation' in f.lower() or 'assessment' in f.lower() or 'assistant' in f.lower():
            relocation_files.append(os.path.join(r, f))

print(f"Found {len(relocation_files)} relocation-related files:\n")
for path in relocation_files[:30]:
    print(f"  - {path}")
