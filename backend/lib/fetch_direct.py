import sys
import json

try:
    from curl_cffi import requests
    url = sys.argv[1] if len(sys.argv) > 1 else ""
    if not url:
        print(json.dumps({"error": "No URL provided"}))
        sys.exit(1)

    resp = requests.get(
        url,
        impersonate="chrome",
        timeout=15,
        headers={
            "Accept-Language": "en-US,en;q=0.9",
            "Referer": "https://www.google.com/"
        }
    )

    print(json.dumps({
        "status": resp.status_code,
        "content": resp.text
    }))
except Exception as e:
    print(json.dumps({"error": str(e)}))
    sys.exit(1)
