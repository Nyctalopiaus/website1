# find_retry_calls.py
with open(r"c:\Users\joshu\OneDrive\Documents\AI Projects\Website1\vm_code\nyctos-gig-grid\services\EventAggregator.php", "r", encoding="utf-8") as f:
    lines = f.readlines()

for idx, line in enumerate(lines, 1):
    if "executewithretry" in line.lower():
        print(f"Line {idx}: {line.strip()}")
