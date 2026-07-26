# inspect_genre_dropdown.py - Search for genre dropdown options in nyctos-gig-grid
import os
import re

dir_path = r"c:\Users\joshu\OneDrive\Documents\AI Projects\Website1\vm_code\nyctos-gig-grid"

for root, dirs, files in os.walk(dir_path):
    for f in files:
        if f.endswith('.php') or f.endswith('.js') or f.endswith('.html'):
            file_path = os.path.join(root, f)
            with open(file_path, 'r', encoding='utf-8', errors='ignore') as file_obj:
                content = file_obj.read()
                if '<select' in content or 'genre' in content.lower():
                    matches = [l.strip() for l in content.splitlines() if 'genre' in l.lower() or 'option' in l.lower() or 'select' in l.lower()]
                    if any('select' in m.lower() or 'option' in m.lower() for m in matches):
                        print(f"\nFile: {file_path}")
                        for m in matches[:10]:
                            print(f"   -> {m}")
