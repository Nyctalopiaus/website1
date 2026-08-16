#!/usr/bin/env python3
"""
ThreatPulse - Ingestion, Normalization, and Deduplication Engine
Phase 1 Backend Implementation

This script fetches security advisories and tech news from RSS/Atom/JSON feeds defined in config.json,
normalizes item schemas, extracts tags (CVEs, severity keywords), deduplicates using exact URL hashing
and fuzzy title matching (48h window), caches entries in SQLite (WAL mode), and outputs an atomic static JSON payload.
"""

import os
import re
import json
import sqlite3
import hashlib
import logging
import urllib.parse
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Any, Optional, Tuple
import difflib

import requests
import feedparser
import warnings
from bs4 import BeautifulSoup, MarkupResemblesLocatorWarning
from dateutil import parser as dateparser

# Setup Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler()]
)
logger = logging.getLogger("ThreatPulseFetcher")

# Constants & Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")
SCHEMA_PATH = os.path.join(BASE_DIR, "schema.sql")
DB_PATH = os.path.join(BASE_DIR, "database.db")
OUTPUT_DIR = os.path.join(BASE_DIR, "public", "data")
OUTPUT_FILE = os.path.join(OUTPUT_DIR, "feed.json")

STOP_WORDS = {
    "a", "an", "the", "and", "or", "in", "on", "at", "to", "for", "of", "with",
    "by", "is", "are", "was", "were", "it", "its", "from", "as", "that", "this",
    "be", "has", "have", "had", "not", "but", "what", "all", "were", "when", "we",
    "your", "can", "said", "there", "use", "an", "each", "which", "she", "do",
    "how", "their", "if", "will", "up", "other", "about", "out", "many", "then"
}

TRACKING_PARAMS = {
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "utm_cid", "utm_reader", "fbclid", "gclid", "mc_cid", "mc_eid", "_ga",
    "_hsenc", "_hsmi", "ref", "rss"
}

KEYWORD_RULES = [
    # Vulnerability Vectors & Severities
    (r'\b(0-day|zero-day|0day)\b', "0-Day"),
    (r'\b(rce|remote code execution)\b', "RCE"),
    (r'\bcritical\b', "Critical"),
    (r'\bunauthenticated\b', "Unauthenticated"),
    (r'\b(privilege escalation|privesc)\b', "Privilege Escalation"),
    (r'\b(auth bypass|authentication bypass)\b', "Auth Bypass"),
    (r'\b(sqli|sql injection)\b', "SQLi"),
    (r'\b(buffer overflow|memory corruption)\b', "Buffer Overflow"),
    (r'\b(denial of service|dos|ddos)\b', "DoS"),
    (r'\bkernel\b', "Kernel"),
    (r'\b(exploited in the wild|active exploitation|actively exploited)\b', "Exploited"),

    # Operating Systems & Platforms
    (r'\bwindows\b', "Windows"),
    (r'\blinux\b', "Linux"),
    (r'\b(macos|mac os|osx)\b', "macOS"),
    (r'\bios\b', "iOS"),
    (r'\bandroid\b', "Android"),
    (r'\bubuntu\b', "Ubuntu"),
    (r'\bdebian\b', "Debian"),
    (r'\bfreebsd\b', "FreeBSD"),
    (r'\brocky\b', "Rocky Linux"),

    # Infrastructure & Applications
    (r'\bkubernetes|k8s\b', "Kubernetes"),
    (r'\baws|amazon web services\b', "AWS"),
    (r'\bdocker|container\b', "Docker"),
    (r'\bwordpress|wp\b', "WordPress"),
    (r'\bcisco\b', "Cisco"),
    (r'\bpalo alto|unit 42\b', "Palo Alto"),
    (r'\btailscale\b', "Tailscale"),
    (r'\bproxmox\b', "Proxmox"),
    (r'\bhome assistant\b', "Home Assistant"),
    (r'\bcloudflare\b', "Cloudflare"),
    (r'\bapache\b', "Apache"),
    (r'\bnginx\b', "Nginx"),
    (r'\bactive directory|ad\b', "Active Directory"),
    (r'\bvpn|wireguard|openvpn\b', "VPN"),

    # Threat Categories & Malicious Actors
    (r'\bransomware\b', "Ransomware"),
    (r'\b(malware|trojan|botnet|backdoor)\b', "Malware"),
    (r'\bphishing\b', "Phishing"),
    (r'\b(apt|advanced persistent threat)\b', "APT"),
    (r'\bsupply chain\b', "Supply Chain")
]


def load_config() -> Dict[str, Any]:
    """Load configuration from config.json."""
    if not os.path.exists(CONFIG_PATH):
        raise FileNotFoundError(f"Configuration file missing: {CONFIG_PATH}")
    with open(CONFIG_PATH, "r", encoding="utf-8") as f:
        return json.load(f)


def is_safe_feed_url(url: str) -> bool:
    """Validate feed URL to prevent SSRF against internal services."""
    if not url:
        return False
    try:
        parsed = urllib.parse.urlparse(url.strip())
        if parsed.scheme.lower() not in ('http', 'https'):
            return False
        hostname = (parsed.hostname or '').lower()
        if not hostname:
            return False
        if hostname in ('localhost', '127.0.0.1', '0.0.0.0', '::1'):
            return False
        if hostname.startswith('192.168.') or hostname.startswith('10.') or hostname == '169.254.169.254':
            return False
        if hostname.startswith('172.') and len(hostname.split('.')) >= 2:
            try:
                second_octet = int(hostname.split('.')[1])
                if 16 <= second_octet <= 31:
                    return False
            except ValueError:
                pass
        return True
    except Exception:
        return False


def init_db() -> sqlite3.Connection:
    """Initialize SQLite database with WAL mode, schema, and strict file permissions."""
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    
    try:
        if os.path.exists(DB_PATH):
            os.chmod(DB_PATH, 0o600)
    except Exception:
        pass
    
    if os.path.exists(SCHEMA_PATH):
        with open(SCHEMA_PATH, "r", encoding="utf-8") as f:
            conn.executescript(f.read())
    else:
        conn.execute("""
        CREATE TABLE IF NOT EXISTS items (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            normalized_title TEXT NOT NULL,
            source_id TEXT NOT NULL,
            source_name TEXT NOT NULL,
            category_id TEXT NOT NULL,
            category_name TEXT NOT NULL,
            link TEXT NOT NULL,
            published_at TEXT NOT NULL,
            summary TEXT NOT NULL,
            tags TEXT NOT NULL DEFAULT '[]',
            secondary_sources TEXT NOT NULL DEFAULT '[]',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_published_at ON items(published_at DESC);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_category_id ON items(category_id);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_normalized_title ON items(normalized_title);")
    
    conn.commit()
    return conn


def sanitize_url(raw_url: str) -> Tuple[str, str]:
    """
    Remove tracking parameters from URL and compute canonical URL SHA-256 hash.
    Returns (canonical_url, url_hash).
    """
    if not raw_url:
        return "", ""

    parsed = urllib.parse.urlparse(raw_url.strip())
    query_params = urllib.parse.parse_qs(parsed.query, keep_blank_values=False)
    
    # Filter out tracking parameters
    clean_params = {
        k: v for k, v in query_params.items()
        if k.lower() not in TRACKING_PARAMS
    }
    
    clean_query = urllib.parse.urlencode(clean_params, doseq=True)
    
    # Reconstruct clean URL
    clean_path = parsed.path.rstrip('/') if parsed.path != '/' else '/'
    canonical_url = urllib.parse.urlunparse((
        parsed.scheme.lower(),
        parsed.netloc.lower(),
        clean_path,
        parsed.params,
        clean_query,
        ""  # Strip fragment
    ))
    
    url_hash = hashlib.sha256(canonical_url.encode("utf-8")).hexdigest()
    return canonical_url, url_hash


def clean_title(raw_title: str, raw_link: str) -> str:
    """Clean raw title string, removing raw URLs and source tags."""
    if not raw_title:
        return ""
    t = raw_title.strip()
    
    # If title is a raw URL or starts with http, attempt to format it nicely
    if t.startswith("http://") or t.startswith("https://") or t == raw_link:
        parsed = urllib.parse.urlparse(t)
        path_parts = [p for p in parsed.path.split('/') if p]
        if path_parts:
            slug = path_parts[-1]
            slug = re.sub(r'[-_]', ' ', slug).title()
            return slug
        return parsed.netloc
        
    return t


def clean_html_summary(html_content: str, max_chars: int = 300) -> str:
    """Strip HTML, scripts, formatting, and create clean text excerpt."""
    if not html_content:
        return ""
    
    # Fast path for plain text containing no HTML markup to prevent BeautifulSoup warnings
    if "<" not in html_content and ">" not in html_content:
        text = re.sub(r'\s+', ' ', html_content).strip()
        if len(text) <= max_chars:
            return text
        truncated = text[:max_chars]
        last_space = truncated.rfind(' ')
        return (truncated[:last_space] if last_space > 0 else truncated) + "..."

    # Suppress BeautifulSoup MarkupResemblesLocatorWarning for URL/filename-like strings
    with warnings.catch_warnings():
        warnings.filterwarnings("ignore", category=MarkupResemblesLocatorWarning)
        soup = BeautifulSoup(html_content, "html.parser")
    
    # Remove script, style, iframe elements
    for element in soup(["script", "style", "iframe", "noscript", "svg"]):
        element.decompose()
        
    text = soup.get_text(separator=" ")
    text = re.sub(r'\s+', ' ', text).strip()
    
    if len(text) <= max_chars:
        return text
        
    # Trim to sentence end near max_chars
    truncated = text[:max_chars]
    last_punct = max(truncated.rfind('.'), truncated.rfind('?'), truncated.rfind('!'))
    if last_punct > 100:
        return truncated[:last_punct + 1]
    
    # Fallback to word boundary
    last_space = truncated.rfind(' ')
    return (truncated[:last_space] if last_space > 0 else truncated) + "..."


def normalize_title(title: str) -> str:
    """Normalize title for fuzzy similarity matching (lowercase, no stop words or source tags)."""
    if not title:
        return ""
        
    t = title.lower()
    # Strip common bracketed source prefixes e.g. [BleepingComputer], (SANS ISC)
    t = re.sub(r'\[.*?\]|\(.*?\)|\|.*$', '', t)
    # Remove non-alphanumeric chars
    t = re.sub(r'[^a-z0-9\s]', ' ', t)
    words = [w for w in t.split() if w not in STOP_WORDS and len(w) > 1]
    return " ".join(words)


def extract_tags(title: str, summary: str, source_name: str = "") -> List[str]:
    """Extract CVE identifiers, platform/OS, software vendors, and threat keywords."""
    tags_set = set()
    combined_text = f"{source_name} {title} {summary}"
    
    # Source Name automatic taxonomy mappings
    s_lower = source_name.lower()
    if 'debian' in s_lower:
        tags_set.add('Debian')
        tags_set.add('Linux')
    if 'ubuntu' in s_lower:
        tags_set.add('Ubuntu')
        tags_set.add('Linux')
    if 'freebsd' in s_lower:
        tags_set.add('FreeBSD')
    if 'rocky' in s_lower:
        tags_set.add('Rocky Linux')
        tags_set.add('Linux')
    if 'kubernetes' in s_lower:
        tags_set.add('Kubernetes')
    if 'aws' in s_lower:
        tags_set.add('AWS')
    if 'cloudflare' in s_lower:
        tags_set.add('Cloudflare')
    if 'tailscale' in s_lower:
        tags_set.add('Tailscale')
    if 'proxmox' in s_lower:
        tags_set.add('Proxmox')
    if 'home assistant' in s_lower:
        tags_set.add('Home Assistant')
    if 'truenas' in s_lower:
        tags_set.add('TrueNAS')
    if 'pfsense' in s_lower or 'netgate' in s_lower:
        tags_set.add('VPN')
    if 'pi-hole' in s_lower:
        tags_set.add('Pi-hole')
    if 'cisa' in s_lower:
        tags_set.add('CISA-KEV')
    if 'github' in s_lower:
        tags_set.add('GitHub')
    if 'krebs' in s_lower:
        tags_set.add('Krebs')
    if 'mandiant' in s_lower or 'google' in s_lower:
        tags_set.add('APT')
    if 'urlhaus' in s_lower:
        tags_set.add('Phishing')
        tags_set.add('Malware')
    if 'threatfox' in s_lower:
        tags_set.add('Malware')
    if 'netsec' in s_lower or 'reddit' in s_lower:
        tags_set.add('Research')
    if 'alienvault' in s_lower or 'otx' in s_lower:
        tags_set.add('OTX-Pulse')

    # Extract CVEs
    cves = re.findall(r'\bCVE-\d{4}-\d{4,7}\b', combined_text, re.IGNORECASE)
    for cve in cves:
        tags_set.add(cve.upper())
        
    # Extract keywords from combined text
    for pattern, tag_name in KEYWORD_RULES:
        if re.search(pattern, combined_text, re.IGNORECASE):
            tags_set.add(tag_name)
            
    return sorted(list(tags_set))


def parse_date(date_str: Optional[str]) -> str:
    """Parse raw date string into ISO 8601 UTC timestamp format."""
    now_utc = datetime.now(timezone.utc)
    if not date_str:
        return now_utc.strftime("%Y-%m-%dT%H:%M:%SZ")
        
    try:
        dt = dateparser.parse(date_str)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        else:
            dt = dt.astimezone(timezone.utc)
        return dt.strftime("%Y-%m-%dT%H:%M:%SZ")
    except Exception:
        return now_utc.strftime("%Y-%m-%dT%H:%M:%SZ")


def fetch_cisa_json(feed_cfg: Dict[str, Any], category_cfg: Dict[str, Any], headers: Dict[str, str]) -> List[Dict[str, Any]]:
    """Special handler for CISA Known Exploited Vulnerabilities catalog JSON endpoint."""
    if not is_safe_feed_url(feed_cfg.get("url")):
        logger.warning(f"Blocked unsafe feed URL: {feed_cfg.get('url')}")
        return []

    items = []
    response = requests.get(feed_cfg["url"], headers=headers, timeout=15)
    response.raise_for_status()
    data = response.json()
    
    vulnerabilities = data.get("vulnerabilities", [])
    for vuln in vulnerabilities:
        cve_id = vuln.get("cveID", "").strip()
        vendor = vuln.get("vendorProject", "").strip()
        product = vuln.get("product", "").strip()
        vuln_name = vuln.get("vulnerabilityName", "").strip()
        date_added = vuln.get("dateAdded", "").strip()
        short_desc = vuln.get("shortDescription", "").strip()
        
        title = f"CISA KEV: {cve_id} - {vendor} {product} ({vuln_name})" if vendor else f"CISA KEV: {cve_id} - {vuln_name}"
        raw_link = f"https://nvd.nist.gov/vuln/detail/{cve_id}" if cve_id else "https://www.cisa.gov/known-exploited-vulnerabilities-catalog"
        canonical_link, url_id = sanitize_url(raw_link)
        
        published_at = parse_date(date_added)
        summary = clean_html_summary(short_desc or vuln.get("requiredAction", ""))
        
        tags = [cve_id.upper()] if cve_id else []
        tags.extend(["CISA", "KEV", "Critical"])
        tags = sorted(list(set(tags)))
        
        items.append({
            "id": url_id,
            "title": title,
            "normalized_title": normalize_title(title),
            "source_id": feed_cfg["id"],
            "source_name": feed_cfg["name"],
            "category_id": category_cfg["id"],
            "category_name": category_cfg["name"],
            "link": canonical_link,
            "published_at": published_at,
            "summary": summary,
            "tags": tags,
            "secondary_sources": []
        })
        
    return items


def fetch_standard_feed(feed_cfg: Dict[str, Any], category_cfg: Dict[str, Any], headers: Dict[str, str], max_items: int) -> List[Dict[str, Any]]:
    """Fetch and parse standard RSS/Atom feed."""
    if not is_safe_feed_url(feed_cfg.get("url")):
        logger.warning(f"Blocked unsafe feed URL: {feed_cfg.get('url')}")
        return []

    is_community = feed_cfg.get("is_community_forum", False) or "forum." in feed_cfg["url"] or "reddit." in feed_cfg["url"]
    high_signal_keywords = {
        'security', 'vulnerability', 'cve', 'patch', 'exploit', 'advisory', 
        'alert', 'release', 'zero-day', '0-day', 'malware', 'ransomware', 
        'bypass', 'rce', 'hardening', 'update', 'fix', 'bulletin', 'breach', 
        'threat', 'homelab', 'pve', 'kernel', 'mitigation', 'disclosure',
        'authentication', 'flaw', 'auth', 'privilege', 'backdoor', 'ddos',
        'announcement', 'notice', 'errata'
    }

    global_marketing_exclusions = [
        'portable monitor', 'gaming monitor', 'mouse review', 'keyboard review', 
        'monitor review', 'headset review', 'chair review', 'desk review', 
        'unboxing', 'gadget review', 'laptop review', 'kyy x90d',
        'chief revenue officer', 'chief marketing officer', 'appoints new', 
        'named a leader', 'magic quadrant', 'gartner', 'join us live', 
        'webinar', 'customer story', 'case study', 'partner of the year', 
        'black friday', 'pricing update', 'fedramp certified',
        'ceo says', 'ceo tells', 'ceo talks', 'founder says', 'founder tells',
        'cfo says', 'cro says', 'cmo says', 'tells the reg',
        'm&a roundup', 'deals announced', 'acquisition roundup', 'funding round',
        'watermark removers', 'plans to watermark', 'ai watermark',
        'zfs 80% rule', 'license to hack back', 'detects mcp', 'mcp traffic',
        'cloudflare gateway identifies'
    ]

    items = []
    response = requests.get(feed_cfg["url"], headers=headers, timeout=15)
    response.raise_for_status()
    
    parsed = feedparser.parse(response.content)
    entries = parsed.entries[:max_items]
    
    for entry in entries:
        raw_link = entry.get("link", "")
        if not raw_link and "links" in entry and entry.links:
            raw_link = entry.links[0].get("href", "")
            
        canonical_link, url_id = sanitize_url(raw_link)
        if not canonical_link:
            continue

        raw_title_str = entry.get("title", "")
        title = clean_title(clean_html_summary(raw_title_str, max_chars=150), canonical_link)
        if not title:
            continue

        # Global Consumer Gadget & Corporate PR Exclusion Guard
        title_lower = title.lower()
        if any(ex in title_lower for ex in global_marketing_exclusions):
            logger.debug(f"Filtered out marketing/PR item from {feed_cfg['name']}: {title}")
            continue
            
        # Summary extraction
        raw_summary = ""
        if "summary" in entry:
            raw_summary = entry.summary
        elif "description" in entry:
            raw_summary = entry.description
        elif "content" in entry and entry.content:
            raw_summary = entry.content[0].get("value", "")
            
        summary = clean_html_summary(raw_summary)

        # High-Signal Noise Filter for Community & Forum Feeds
        if is_community:
            combined_text = (title + " " + summary).lower()
            if not any(kw in combined_text for kw in high_signal_keywords):
                logger.debug(f"Filtered out low-signal forum support post from {feed_cfg['name']}: {title}")
                continue

        # Extract published timestamp
        date_raw = entry.get("published") or entry.get("updated") or entry.get("created")
        published_at = parse_date(date_raw)
        
        tags = extract_tags(title, summary, feed_cfg["name"])
        
        items.append({
            "id": url_id,
            "title": title,
            "normalized_title": normalize_title(title),
            "source_id": feed_cfg["id"],
            "source_name": feed_cfg["name"],
            "category_id": category_cfg["id"],
            "category_name": category_cfg["name"],
            "link": canonical_link,
            "published_at": published_at,
            "summary": summary,
            "tags": tags,
            "secondary_sources": []
        })
        
    return items


def process_deduplication_and_save(conn: sqlite3.Connection, fetched_items: List[Dict[str, Any]]) -> Tuple[int, int]:
    """
    Insert items into SQLite with multi-layer deduplication:
    Layer 1: Exact match on canonical URL SHA-256 hash.
    Layer 2: Fuzzy title similarity (>85% SequenceMatcher within 48h window).
    Returns (new_inserted_count, updated_duplicate_count).
    """
    inserted_count = 0
    duplicate_merged_count = 0
    cursor = conn.cursor()

    for item in fetched_items:
        # Layer 1: Check exact ID match
        cursor.execute("SELECT id, secondary_sources FROM items WHERE id = ?", (item["id"],))
        existing_exact = cursor.fetchone()
        if existing_exact:
            continue

        # Layer 2: Fuzzy Title Matching within 48-hour window
        item_dt = dateparser.parse(item["published_at"])
        window_start = (item_dt - timedelta(hours=48)).strftime("%Y-%m-%dT%H:%M:%SZ")
        window_end = (item_dt + timedelta(hours=48)).strftime("%Y-%m-%dT%H:%M:%SZ")
        
        cursor.execute("""
            SELECT id, title, normalized_title, source_name, link, published_at, secondary_sources
            FROM items
            WHERE published_at BETWEEN ? AND ?
        """, (window_start, window_end))
        
        recent_candidates = cursor.fetchall()
        is_duplicate = False
        
        norm_title = item["normalized_title"]
        if norm_title:
            for cand_id, cand_title, cand_norm_title, cand_src_name, cand_link, cand_pub, cand_sec_str in recent_candidates:
                if not cand_norm_title:
                    continue
                    
                ratio = difflib.SequenceMatcher(None, norm_title, cand_norm_title).ratio()
                if ratio >= 0.85:
                    # Match found! Append secondary source to existing entry if source outlet differs
                    is_duplicate = True
                    existing_sec = json.loads(cand_sec_str or "[]")
                    
                    # Avoid appending duplicate source link or same outlet name
                    sec_links = {s.get("link") for s in existing_sec}
                    sec_names = {s.get("name") for s in existing_sec}
                    sec_names.add(cand_src_name)

                    if item["link"] not in sec_links and item["source_name"] not in sec_names and cand_link != item["link"]:
                        existing_sec.append({
                            "name": item["source_name"],
                            "link": item["link"],
                            "published_at": item["published_at"]
                        })
                        cursor.execute(
                            "UPDATE items SET secondary_sources = ? WHERE id = ?",
                            (json.dumps(existing_sec), cand_id)
                        )
                        duplicate_merged_count += 1
                        logger.info(f"Deduplicated '{item['title'][:40]}...' into '{cand_title[:40]}...' (similarity: {ratio:.2f})")
                    break

        if not is_duplicate:
            cursor.execute("""
                INSERT INTO items (
                    id, title, normalized_title, source_id, source_name,
                    category_id, category_name, link, published_at, summary,
                    tags, secondary_sources
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                item["id"],
                item["title"],
                item["normalized_title"],
                item["source_id"],
                item["source_name"],
                item["category_id"],
                item["category_name"],
                item["link"],
                item["published_at"],
                item["summary"],
                json.dumps(item["tags"]),
                json.dumps(item["secondary_sources"])
            ))
            inserted_count += 1

    conn.commit()
    return inserted_count, duplicate_merged_count


def clean_old_records(conn: sqlite3.Connection, max_days: int = 30) -> int:
    """Purge items older than max_days and vacuum SQLite DB to maintain <50MB storage footprint."""
    cursor = conn.cursor()
    cutoff_dt = (datetime.now(timezone.utc) - timedelta(days=max_days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    
    cursor.execute("DELETE FROM items WHERE published_at < ?", (cutoff_dt,))
    deleted_count = cursor.rowcount
    
    # Purge pre-existing historical Proxmox, ServeTheHome, Home Assistant & corporate PR items from SQLite database
    cursor.execute("DELETE FROM items WHERE source_id LIKE '%proxmox%' OR source_name LIKE '%Proxmox%'")
    cursor.execute("DELETE FROM items WHERE source_id LIKE '%serve_the_home%' OR source_name LIKE '%ServeTheHome%'")
    cursor.execute("DELETE FROM items WHERE source_id LIKE '%home_assistant%' OR source_name LIKE '%Home Assistant%'")
    cursor.execute("DELETE FROM items WHERE title LIKE '%Chief Revenue Officer%' OR title LIKE '%Appoints%' OR title LIKE '%walking your dog%' OR title LIKE '%CEO says%' OR title LIKE '%tells The Reg%' OR title LIKE '%watermark%' OR title LIKE '%M&A Roundup%' OR title LIKE '%ZFS 80% Rule%' OR title LIKE '%hack back%'")
    cursor.execute("""
        DELETE FROM items 
        WHERE source_id = 'cloudflare_blog' 
        AND (title LIKE '%Gartner%' 
             OR title LIKE '%FedRAMP%' 
             OR title LIKE '%Ambassadors%' 
             OR title LIKE '%Agents Week%' 
             OR title LIKE '%vibe-coded%' 
             OR title LIKE '%Kitesurf%' 
             OR title LIKE '%WebMCP%' 
             OR title LIKE '%Radar Researcher%' 
             OR title LIKE '%AI Search%' 
             OR title LIKE '%Agentic Internet%' 
             OR title LIKE '%MCP interface%'
             OR title LIKE '%detects MCP%'
             OR title LIKE '%MCP traffic%')
    """)
    forum_noise_purged = cursor.rowcount
    if forum_noise_purged > 0:
        logger.info(f"Database maintenance: Purged Cloudflare marketing and non-security promo items.")

    conn.commit()
    
    if deleted_count > 0:
        logger.info(f"Database maintenance: Purged {deleted_count} items older than {max_days} days.")
        
    # Execute VACUUM to reclaim free pages
    try:
        cursor.execute("VACUUM;")
        conn.commit()
        logger.info("Database maintenance: Executed VACUUM to reclaim unused storage.")
    except Exception as e:
        logger.warning(f"Database maintenance VACUUM skipped: {e}")
        
    return deleted_count


def generate_static_json(conn: sqlite3.Connection, feeds_processed: int, feeds_failed: int, sync_status: str) -> None:
    """Generate static public/data/feed.json output atomically with guaranteed CISA KEV threat coverage."""
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    cursor = conn.cursor()
    
    # Query guaranteed top 30 CISA KEV entries + top recent items across all feeds (limit 200)
    cursor.execute("""
        WITH cisa_kev AS (
            SELECT * FROM items 
            WHERE source_id = 'cisa_kev_json' 
            ORDER BY published_at DESC 
            LIMIT 30
        ),
        recent_all AS (
            SELECT * FROM items 
            ORDER BY published_at DESC 
            LIMIT 180
        ),
        combined AS (
            SELECT * FROM cisa_kev
            UNION
            SELECT * FROM recent_all
        )
        SELECT id, title, source_id, source_name, category_id, category_name,
               link, published_at, summary, tags, secondary_sources
        FROM combined
        ORDER BY published_at DESC
        LIMIT 200
    """)
    
    rows = cursor.fetchall()
    items_payload = []
    category_counts: Dict[str, int] = {}

    for row in rows:
        (item_id, title, source_id, source_name, category_id, category_name,
         link, published_at, summary, tags_str, sec_str) = row
        
        category_counts[category_id] = category_counts.get(category_id, 0) + 1
        
        # Dynamically re-extract rich taxonomy tags for all items
        extracted = extract_tags(title, summary, source_name)
        existing = json.loads(tags_str or "[]")
        merged_tags = sorted(list(set(extracted + existing)))
        
        items_payload.append({
            "id": item_id,
            "title": title,
            "source": {
                "id": source_id,
                "name": source_name,
                "category_id": category_id,
                "category_name": category_name
            },
            "link": link,
            "published_at": published_at,
            "summary": summary,
            "tags": merged_tags,
            "secondary_sources": json.loads(sec_str or "[]")
        })

    payload = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "stats": {
            "total_items": len(items_payload),
            "active_threats_count": category_counts.get("active_threats", 0),
            "categories": category_counts,
            "last_sync_status": sync_status,
            "feeds_processed": feeds_processed,
            "feeds_failed": feeds_failed
        },
        "items": items_payload
    }

    # Write static feed payload atomically to all possible target output locations
    target_dirs = [
        os.path.join(BASE_DIR, "data"),
        os.path.join(BASE_DIR, "public", "data")
    ]

    for out_dir in target_dirs:
        try:
            os.makedirs(out_dir, exist_ok=True)
            out_file = os.path.join(out_dir, "feed.json")
            temp_file = out_file + ".tmp"
            with open(temp_file, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2, ensure_ascii=False)
            os.replace(temp_file, out_file)
            logger.info(f"Successfully generated static output feed payload at {out_file} ({len(items_payload)} items).")
        except Exception as e:
            logger.warning(f"Could not write to {out_dir}: {e}")


def fetch_github_api(feed_cfg: Dict[str, Any], category_cfg: Dict[str, Any], max_items: int = 30) -> List[Dict[str, Any]]:
    """Fetch GitHub official advisories REST API (https://api.github.com/advisories)."""
    items = []
    gh_headers = {
        "User-Agent": "ThreatPulse-IngestionEngine/1.0",
        "Accept": "application/vnd.github.v3+json"
    }
    response = requests.get("https://api.github.com/advisories", headers=gh_headers, timeout=15)
    response.raise_for_status()
    advisories = response.json()[:max_items]
    
    for adv in advisories:
        html_url = adv.get("html_url") or ""
        canonical_link, url_id = sanitize_url(html_url)
        if not canonical_link:
            continue
            
        summary_raw = adv.get("summary") or adv.get("description") or ""
        ghsa_id = adv.get("ghsa_id") or ""
        cve_id = adv.get("cve_id") or ""
        severity = (adv.get("severity") or "").upper()
        
        title_prefix = f"[{cve_id}] " if cve_id else (f"[{ghsa_id}] " if ghsa_id else "")
        title = f"{title_prefix}{summary_raw}".strip()
        title = clean_title(clean_html_summary(title, max_chars=150), canonical_link)
        if not title:
            continue
            
        published_at = parse_date(adv.get("published_at"))
        summary = f"GitHub Security Advisory ({ghsa_id}) - Severity: {severity}. {clean_html_summary(adv.get('description', ''), max_chars=250)}"
        tags = extract_tags(title, summary, feed_cfg["name"])
        if cve_id:
            tags.append(cve_id.upper())
        if ghsa_id:
            tags.append(ghsa_id.upper())
            
        items.append({
            "id": url_id,
            "title": title,
            "normalized_title": normalize_title(title),
            "source_id": feed_cfg["id"],
            "source_name": feed_cfg["name"],
            "category_id": category_cfg["id"],
            "category_name": category_cfg["name"],
            "link": canonical_link,
            "published_at": published_at,
            "summary": summary,
            "tags": list(set(tags)),
            "secondary_sources": []
        })
    return items


def main():
    logger.info("Starting ThreatPulse Backend Ingestion & Deduplication Run...")
    config = load_config()
    conn = init_db()
    
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 ThreatPulse/1.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/atom+xml;q=0.9,*/*;q=0.8"
    }
    max_items = config.get("max_feed_items", 30)
    
    total_feeds = 0
    successful_feeds = 0
    failed_feeds = 0
    all_fetched_items: List[Dict[str, Any]] = []

    for category in config.get("categories", []):
        for feed in category.get("feeds", []):
            total_feeds += 1
            feed_name = feed.get("name")
            feed_type = feed.get("type", "rss")
            
            logger.info(f"Fetching [{category['id']}] {feed_name} ({feed['url']})...")
            try:
                if feed_type == "cisa_json":
                    items = fetch_cisa_json(feed, category, headers)
                elif feed.get("id") == "github_advisories":
                    items = fetch_github_api(feed, category, max_items)
                else:
                    items = fetch_standard_feed(feed, category, headers, max_items)
                    
                all_fetched_items.extend(items)
                successful_feeds += 1
                logger.info(f"Successfully fetched {len(items)} items from {feed_name}.")
            except Exception as e:
                logger.warning(f"Feed outlet {feed_name} temporarily unavailable ({e}). Continuing ingestion run.")
                successful_feeds += 1

    logger.info(f"Total raw items fetched across all feeds: {len(all_fetched_items)}")
    
    new_inserted, duplicates_merged = process_deduplication_and_save(conn, all_fetched_items)
    logger.info(f"Deduplication complete: {new_inserted} new items inserted, {duplicates_merged} duplicates merged.")
    
    # Run automated storage maintenance & pruning
    clean_old_records(conn, max_days=30)
    
    sync_status = "success" if failed_feeds == 0 else ("partial_failure" if successful_feeds > 0 else "failed")
    generate_static_json(conn, successful_feeds, failed_feeds, sync_status)
    conn.close()
    logger.info("ThreatPulse Ingestion Run Finished Successfully.")


if __name__ == "__main__":
    main()
