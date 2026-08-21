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
import time
import sqlite3
import hashlib
import logging
import ipaddress
import urllib.parse
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Any, Optional, Tuple
import difflib

import requests
import feedparser
import warnings
from bs4 import BeautifulSoup, MarkupResemblesLocatorWarning
from dateutil import parser as dateparser
from dotenv import load_dotenv

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

# Secrets: loaded from api.env sitting alongside this script (same directory as config.json),
# never committed/hardcoded. The existing .htaccess already blocks any "*.env" file and any
# dotfile from being served publicly, so this is safe to keep in the project root next to
# fetcher.py. override=False means a real shell-exported env var always wins over the file,
# which matters for cron setups that already inject secrets a different way.
ENV_PATH = os.path.join(BASE_DIR, "api.env")
load_dotenv(ENV_PATH, override=False)

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

    # Migration guard: add due_date to pre-existing databases created before this column existed.
    # CREATE TABLE IF NOT EXISTS above is a no-op on an already-initialized DB, so this covers upgrades in place.
    existing_columns = {row[1] for row in conn.execute("PRAGMA table_info(items);").fetchall()}
    if "due_date" not in existing_columns:
        conn.execute("ALTER TABLE items ADD COLUMN due_date TEXT;")
        logger.info("Database maintenance: Added missing due_date column (CISA KEV remediation deadlines).")

    # Migration guard: add CVSS/EPSS enrichment columns to pre-existing databases (Phase 1 enrichment).
    enrichment_columns = {
        "cvss_score": "REAL",
        "cvss_severity": "TEXT",
        "epss_score": "REAL",
        "epss_percentile": "REAL",
    }
    added_enrichment_cols = []
    for col_name, col_type in enrichment_columns.items():
        if col_name not in existing_columns:
            conn.execute(f"ALTER TABLE items ADD COLUMN {col_name} {col_type};")
            added_enrichment_cols.append(col_name)
    if added_enrichment_cols:
        logger.info(f"Database maintenance: Added missing enrichment columns: {', '.join(added_enrichment_cols)}.")

    # Migration guard: add GreyNoise cross-reference columns to pre-existing ioc_items tables
    # (Phase 3 IOC Watch GreyNoise upgrade). ioc_items itself was already created by schema.sql
    # on any DB that has run the Phase 3 IOC ingestion at least once, so guard on its columns too.
    existing_ioc_columns = {row[1] for row in conn.execute("PRAGMA table_info(ioc_items);").fetchall()}
    if existing_ioc_columns:  # table exists
        greynoise_columns = {
            "greynoise_classification": "TEXT",
            "greynoise_riot": "INTEGER",
            "greynoise_checked_at": "TEXT",
        }
        added_greynoise_cols = []
        for col_name, col_type in greynoise_columns.items():
            if col_name not in existing_ioc_columns:
                conn.execute(f"ALTER TABLE ioc_items ADD COLUMN {col_name} {col_type};")
                added_greynoise_cols.append(col_name)
        if added_greynoise_cols:
            logger.info(f"Database maintenance: Added missing GreyNoise columns to ioc_items: {', '.join(added_greynoise_cols)}.")
        # Always attempt this (not just when a column was just added): schema.sql's own copy of
        # this CREATE INDEX was deliberately removed (see the note in schema.sql) since it can't
        # run safely there on pre-existing DBs, so this is the only place it's created -- and it
        # needs to run for brand-new DBs too, where the column already existed via CREATE TABLE
        # and added_greynoise_cols above is empty. Column is guaranteed to exist by this point
        # either way (fresh CREATE TABLE above, or the ALTER TABLE loop just above this comment).
        conn.execute("CREATE INDEX IF NOT EXISTS idx_ioc_greynoise_checked_at ON ioc_items(greynoise_checked_at);")

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
        due_date_raw = vuln.get("dueDate", "").strip()
        short_desc = vuln.get("shortDescription", "").strip()

        title = f"CISA KEV: {cve_id} - {vendor} {product} ({vuln_name})" if vendor else f"CISA KEV: {cve_id} - {vuln_name}"
        raw_link = f"https://nvd.nist.gov/vuln/detail/{cve_id}" if cve_id else "https://www.cisa.gov/known-exploited-vulnerabilities-catalog"
        canonical_link, url_id = sanitize_url(raw_link)

        published_at = parse_date(date_added)
        # dueDate is a plain YYYY-MM-DD calendar date (the federal remediation deadline), not a
        # timestamp to reinterpret in UTC the way parse_date() does for feed publish times.
        due_date = f"{due_date_raw}T00:00:00Z" if due_date_raw else None
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
            "secondary_sources": [],
            "due_date": due_date
        })

    return items


def fetch_via_scrape_do(url: str, timeout: int = 20) -> Optional[bytes]:
    """Fallback fetch through Scrape.do's proxy network for sources that block direct
    automated requests outright (e.g. CISA's advisories feed, which returns a blanket 403
    to non-browser clients regardless of source IP -- verified from two unrelated networks).
    Reuses SCRAPE_DO_TOKEN, the same shared credential already used by the mortgage-calculator
    project's Redfin proxy (set once in the shared api.env, read by both). Uses the cheapest
    tier (datacenter proxy, no JS render/super-proxy) since these are static RSS/XML feeds,
    not JS-rendered pages -- keeps credit usage minimal. Returns the raw response content, or
    None if SCRAPE_DO_TOKEN isn't set or the proxied request also fails."""
    token = os.environ.get("SCRAPE_DO_TOKEN")
    if not token:
        return None
    try:
        proxied_url = f"https://api.scrape.do?token={token}&url={urllib.parse.quote(url, safe='')}"
        resp = requests.get(proxied_url, timeout=timeout)
        resp.raise_for_status()
        return resp.content
    except Exception as e:
        logger.warning(f"Scrape.do fallback fetch also failed for {url}: {e}")
        return None


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
    try:
        response = requests.get(feed_cfg["url"], headers=headers, timeout=15)
        response.raise_for_status()
        feed_content = response.content
    except requests.exceptions.RequestException as direct_err:
        proxied_content = fetch_via_scrape_do(feed_cfg["url"])
        if proxied_content is None:
            raise
        logger.info(
            f"Direct fetch failed for {feed_cfg.get('name', feed_cfg['url'])} ({direct_err}); "
            f"recovered via Scrape.do fallback."
        )
        feed_content = proxied_content

    parsed = feedparser.parse(feed_content)
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
            "secondary_sources": [],
            "due_date": None
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
                    tags, secondary_sources, due_date
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
                json.dumps(item["secondary_sources"]),
                item.get("due_date")
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


def build_feed_manifest(config: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Flatten config.json's categories/feeds into a single manifest list: one entry per
    configured feed with its id/name/url/category/tier/enabled state. Shipped in feed.json as
    "sources" so the front-end's Feed List modal and per-item tier badges are generated straight
    from config at render time — adding a feed to config.json is the only step needed for it to
    show up everywhere in the UI; nothing in index.html/app.js needs manual updates."""
    manifest = []
    for category in config.get("categories", []):
        for feed in category.get("feeds", []):
            manifest.append({
                "id": feed.get("id"),
                "name": feed.get("name"),
                "url": feed.get("url"),
                "category_id": category.get("id"),
                "category_name": category.get("name"),
                "tier": feed.get("tier", "aggregator"),
                "enabled": feed.get("enabled") is not False
            })
    return manifest


def generate_static_json(conn: sqlite3.Connection, feeds_processed: int, feeds_failed: int, sync_status: str, feed_manifest: Optional[List[Dict[str, Any]]] = None) -> None:
    """Generate static public/data/feed.json output atomically with every item currently retained in the DB.

    No per-category or global count cap here by design — the site's goal is to surface everything the
    configured feeds provide. Data volume is bounded instead by clean_old_records()'s 30-day age purge.
    Time-scoped views (Today's Triage Briefing 24h vs. Full Stream) are applied client-side in app.js.

    feed_manifest (from build_feed_manifest) resolves each item's source_id to its config-defined
    trust tier (gov/vendor/community/osint/aggregator) at render time, and is also embedded verbatim
    as payload["sources"] so the Feed List modal renders itself from data instead of hardcoded HTML.
    """
    feed_manifest = feed_manifest or []
    source_tier_map = {f["id"]: f["tier"] for f in feed_manifest}
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    cursor = conn.cursor()

    cursor.execute("""
        SELECT id, title, source_id, source_name, category_id, category_name,
               link, published_at, summary, tags, secondary_sources, due_date,
               cvss_score, cvss_severity, epss_score, epss_percentile
        FROM items
        ORDER BY published_at DESC
    """)

    rows = cursor.fetchall()
    items_payload = []
    category_counts: Dict[str, int] = {}

    for row in rows:
        (item_id, title, source_id, source_name, category_id, category_name,
         link, published_at, summary, tags_str, sec_str, due_date,
         cvss_score, cvss_severity, epss_score, epss_percentile) = row

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
                "category_name": category_name,
                "tier": source_tier_map.get(source_id, "aggregator")
            },
            "link": link,
            "published_at": published_at,
            "summary": summary,
            "tags": merged_tags,
            "secondary_sources": json.loads(sec_str or "[]"),
            "due_date": due_date,
            "cvss_score": cvss_score,
            "cvss_severity": cvss_severity,
            "epss_score": epss_score,
            "epss_percentile": epss_percentile
        })

    # Enrichment coverage counters, surfaced in the front-end's Status & Metrics card so that
    # card visibly reflects each phase's added capability rather than staying frozen at its
    # original 4 tiles as the pipeline grows.
    cve_tagged_count = sum(1 for it in items_payload if any(t.startswith("CVE-") for t in it["tags"]))
    epss_scored_count = sum(1 for it in items_payload if it["epss_score"] is not None)
    cvss_scored_count = sum(1 for it in items_payload if it["cvss_score"] is not None)

    payload = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "stats": {
            "total_items": len(items_payload),
            "active_threats_count": category_counts.get("active_threats", 0),
            "categories": category_counts,
            "last_sync_status": sync_status,
            "feeds_processed": feeds_processed,
            "feeds_failed": feeds_failed,
            "cve_tagged_count": cve_tagged_count,
            "epss_scored_count": epss_scored_count,
            "cvss_scored_count": cvss_scored_count
        },
        # Full configured-feed manifest (not just feeds that yielded items this run) so the
        # front-end's Feed List modal, per-source tier badges, and the "Feeds & Sources" tag
        # filter are all generated straight from this data instead of hardcoded HTML that
        # silently drifts out of sync every time a feed is added, removed, or re-tiered.
        "sources": feed_manifest,
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


def fetch_taxii_feed(feed_cfg: Dict[str, Any], category_cfg: Dict[str, Any], headers: Dict[str, str], max_items: int = 30) -> List[Dict[str, Any]]:
    """Generic TAXII 2.1 client, implemented with plain `requests` (no taxii2-client/stix2 SDK
    dependency, matching this file's existing lightweight style). Walks discovery -> default
    api_root -> collections -> objects, and maps STIX 2.1 indicator/report/malware/vulnerability
    objects onto the standard item schema.

    Feed config fields (beyond the standard id/name/url):
      - username / password (optional): HTTP Basic auth, e.g. a public server's guest credentials.
      - collection_title_match (optional): case-insensitive substring match against collection
        titles, to scope which collection(s) get pulled. Defaults to the first collection found
        under the API root if no match/config is given.
      - enabled (optional, default true): set false to keep a feed configured but inactive, e.g.
        while its discovery URL/collection still needs to be confirmed against the vendor's docs.
    """
    if not is_safe_feed_url(feed_cfg.get("url")):
        logger.warning(f"Blocked unsafe TAXII discovery URL: {feed_cfg.get('url')}")
        return []

    auth = None
    if feed_cfg.get("username") and feed_cfg.get("password"):
        auth = (feed_cfg["username"], feed_cfg["password"])

    taxii_headers = {
        "User-Agent": headers.get("User-Agent", "ThreatPulse-IngestionEngine/1.0"),
        "Accept": "application/taxii+json;version=2.1"
    }
    stix_headers = {
        "User-Agent": taxii_headers["User-Agent"],
        "Accept": "application/stix+json;version=2.1, application/taxii+json;version=2.1"
    }

    disc_resp = requests.get(feed_cfg["url"], headers=taxii_headers, auth=auth, timeout=15)
    disc_resp.raise_for_status()
    discovery = disc_resp.json()

    api_root_url = discovery.get("default") or next(iter(discovery.get("api_roots") or []), None)
    if not api_root_url:
        logger.warning(f"TAXII feed {feed_cfg['name']}: discovery response had no api_root.")
        return []
    if not api_root_url.endswith("/"):
        api_root_url += "/"

    coll_resp = requests.get(api_root_url + "collections/", headers=taxii_headers, auth=auth, timeout=15)
    coll_resp.raise_for_status()
    collections = coll_resp.json().get("collections", [])
    if not collections:
        logger.warning(f"TAXII feed {feed_cfg['name']}: API root exposed no collections.")
        return []

    title_match = (feed_cfg.get("collection_title_match") or "").lower()
    target_collections = [c for c in collections if title_match and title_match in (c.get("title") or "").lower()]
    if not target_collections:
        target_collections = collections[:1]

    items: List[Dict[str, Any]] = []

    for coll in target_collections:
        coll_id = coll.get("id")
        if not coll_id:
            continue

        try:
            obj_resp = requests.get(
                f"{api_root_url}collections/{coll_id}/objects/",
                headers=stix_headers,
                auth=auth,
                params={"limit": max_items},
                timeout=20
            )
            obj_resp.raise_for_status()
            stix_objects = obj_resp.json().get("objects", [])
        except Exception as e:
            logger.warning(f"TAXII feed {feed_cfg['name']}: failed to fetch objects for collection '{coll.get('title')}': {e}")
            continue

        for obj in stix_objects[:max_items]:
            if obj.get("type") not in ("indicator", "report", "malware", "vulnerability"):
                continue

            stix_id = obj.get("id") or ""
            if not stix_id:
                continue

            # STIX objects have no individual web page of their own, so the dedup id is derived
            # directly from the STIX id (guaranteed unique/stable) rather than routed through
            # sanitize_url() on a synthetic URL — sanitize_url() strips fragments, which would
            # otherwise collapse every object in a collection onto the same canonical link/id.
            url_id = hashlib.sha256(stix_id.encode("utf-8")).hexdigest()

            external_refs = obj.get("external_references") or []
            ext_url = next((r.get("url") for r in external_refs if r.get("url")), None)
            canonical_link = sanitize_url(ext_url)[0] if ext_url else feed_cfg["url"]

            raw_title = obj.get("name") or (obj.get("pattern") or "")[:120] or f"{obj['type'].title()} Indicator"
            title = clean_title(clean_html_summary(raw_title, max_chars=150), canonical_link)
            if not title:
                continue

            published_at = parse_date(obj.get("created") or obj.get("modified"))
            summary = clean_html_summary(obj.get("description") or obj.get("pattern") or "", max_chars=300)

            tags = set(extract_tags(title, summary, feed_cfg["name"]))
            for label in (obj.get("labels") or []):
                if isinstance(label, str) and label:
                    tags.add(label.replace("-", " ").replace("_", " ").title())

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
                "tags": sorted(tags),
                "secondary_sources": [],
                "due_date": None
            })

    return items


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
        # Surface GitHub's actual structured severity rating as an explicit, filterable tag
        # (e.g. "Critical Severity") rather than leaving it buried in the summary prose — this
        # lets the client distinguish a genuinely critical-severity advisory from a merely
        # CVE-tagged one instead of treating every CVE mention as equally urgent.
        if severity in ("CRITICAL", "HIGH", "MEDIUM", "LOW"):
            tags.append(f"{severity.title()} Severity")

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
            "secondary_sources": [],
            "due_date": None
        })
    return items


def gather_cve_item_map(conn: sqlite3.Connection) -> Dict[str, List[str]]:
    """Build a {CVE_ID: [item_id, ...]} map across all items currently retained in the DB, by
    parsing each item's stored tags JSON for CVE-formatted entries. Used to drive EPSS/CVSS
    enrichment without re-deriving CVE associations from scratch."""
    cursor = conn.cursor()
    cursor.execute("SELECT id, tags FROM items")
    cve_map: Dict[str, List[str]] = {}
    cve_pattern = re.compile(r'^CVE-\d{4}-\d{4,7}$', re.IGNORECASE)

    for item_id, tags_str in cursor.fetchall():
        try:
            tags = json.loads(tags_str or "[]")
        except (json.JSONDecodeError, TypeError):
            continue
        for tag in tags:
            if isinstance(tag, str) and cve_pattern.match(tag):
                cve_map.setdefault(tag.upper(), []).append(item_id)

    return cve_map


def fetch_epss_scores(conn: sqlite3.Connection, headers: Dict[str, str], cve_item_map: Dict[str, List[str]]) -> int:
    """Enrich items with FIRST.org EPSS (Exploit Prediction Scoring System) data: the modeled
    probability (0.0-1.0) that a CVE will be exploited in the wild in the next 30 days, plus its
    percentile rank among all scored CVEs. EPSS's public API accepts a comma-separated CVE list,
    so requests are batched (100 CVEs/request) to keep call volume low. Returns rows updated."""
    if not cve_item_map:
        return 0

    epss_headers = {
        "User-Agent": headers.get("User-Agent", "ThreatPulse-IngestionEngine/1.0"),
        "Accept": "application/json"
    }
    cve_ids = list(cve_item_map.keys())
    epss_by_cve: Dict[str, Tuple[float, float]] = {}
    batch_size = 100

    for i in range(0, len(cve_ids), batch_size):
        batch = cve_ids[i:i + batch_size]
        try:
            resp = requests.get(
                "https://api.first.org/data/v1/epss",
                params={"cve": ",".join(batch)},
                headers=epss_headers,
                timeout=15
            )
            resp.raise_for_status()
            for row in resp.json().get("data", []):
                cve = (row.get("cve") or "").upper()
                if not cve:
                    continue
                try:
                    epss_by_cve[cve] = (float(row.get("epss")), float(row.get("percentile")))
                except (TypeError, ValueError):
                    continue
        except Exception as e:
            logger.warning(f"EPSS enrichment batch [{i}:{i + batch_size}] failed: {e}")

    cursor = conn.cursor()
    updated = 0
    for cve, (score, percentile) in epss_by_cve.items():
        for item_id in cve_item_map.get(cve, []):
            cursor.execute(
                "UPDATE items SET epss_score = ?, epss_percentile = ? WHERE id = ?",
                (score, percentile, item_id)
            )
            updated += 1
    conn.commit()

    if updated:
        logger.info(f"EPSS enrichment: updated {updated} item(s) across {len(epss_by_cve)} scored CVE(s).")
    return updated


def fetch_nvd_cvss(conn: sqlite3.Connection, headers: Dict[str, str], cve_item_map: Dict[str, List[str]], max_lookups: Optional[int] = None) -> int:
    """Enrich items with NVD CVSS base score/severity for their linked CVE(s). NVD's CVE API 2.0
    enforces a tight rate limit for unauthenticated requests (~5/30s) but a much higher one
    (50/30s) once an NVD_API_KEY is set (free signup at nvd.nist.gov/developers/request-an-api-key),
    sent as the `apiKey` header. Only looks up CVEs where at least one linked item is still
    unscored (cvss_score IS NULL), capped at max_lookups per run and paced between requests to
    stay under whichever tier applies. Prefers CVSS v3.1, falling back to v3.0 then v2.
    Returns rows updated."""
    if not cve_item_map:
        return 0

    cursor = conn.cursor()
    cursor.execute("SELECT id FROM items WHERE cvss_score IS NOT NULL")
    already_scored_ids = {row[0] for row in cursor.fetchall()}

    pending_cves = [
        cve for cve, item_ids in cve_item_map.items()
        if any(iid not in already_scored_ids for iid in item_ids)
    ]
    if not pending_cves:
        return 0

    nvd_api_key = os.environ.get("NVD_API_KEY")
    # Unauthenticated: ~5 requests/30s -> keep the conservative 30/run cap. Keyed: 50 requests/30s
    # (10x), so a much larger per-run cap still finishes comfortably inside a single cron run and
    # clears the historical CVSS backlog in a handful of runs instead of 60+. Callers that pass an
    # explicit max_lookups (e.g. tests) still take priority over either default.
    if max_lookups is None:
        max_lookups = 500 if nvd_api_key else 30

    if len(pending_cves) > max_lookups:
        logger.info(
            f"NVD CVSS enrichment: {len(pending_cves)} CVE(s) pending; capping this run to "
            f"{max_lookups} ({'keyed' if nvd_api_key else 'public'} NVD rate limit tier; "
            f"remainder picked up next run)."
        )
    lookups = pending_cves[:max_lookups]

    nvd_headers = {
        "User-Agent": headers.get("User-Agent", "ThreatPulse-IngestionEngine/1.0"),
        "Accept": "application/json"
    }
    if nvd_api_key:
        nvd_headers["apiKey"] = nvd_api_key
    updated = 0
    # 0.7s keeps requests comfortably under NVD's keyed 50/30s ceiling; 6s under the
    # unauthenticated ~5/30s public limit.
    request_pause_seconds = 0.7 if nvd_api_key else 6

    for idx, cve in enumerate(lookups):
        try:
            resp = requests.get(
                "https://services.nvd.nist.gov/rest/json/cves/2.0",
                params={"cveId": cve},
                headers=nvd_headers,
                timeout=15
            )
            resp.raise_for_status()
            vulns = resp.json().get("vulnerabilities", [])
            metrics = vulns[0].get("cve", {}).get("metrics", {}) if vulns else {}

            score, severity = None, None
            for metric_key in ("cvssMetricV31", "cvssMetricV30", "cvssMetricV2"):
                entries = metrics.get(metric_key)
                if entries:
                    cvss_data = entries[0].get("cvssData", {})
                    score = cvss_data.get("baseScore")
                    severity = entries[0].get("baseSeverity") or cvss_data.get("baseSeverity")
                    break

            if score is not None:
                for item_id in cve_item_map.get(cve, []):
                    cursor.execute(
                        "UPDATE items SET cvss_score = ?, cvss_severity = ? WHERE id = ?",
                        (float(score), (severity or "").upper() or None, item_id)
                    )
                    updated += 1
        except Exception as e:
            logger.warning(f"NVD CVSS lookup failed for {cve}: {e}")

        if idx < len(lookups) - 1:
            time.sleep(request_pause_seconds)

    conn.commit()
    if updated:
        tier = "keyed" if nvd_api_key else "public"
        logger.info(f"NVD CVSS enrichment: updated {updated} item(s) across {len(lookups)} looked-up CVE(s) ({tier} tier).")
    return updated


# ---------------------------------------------------------------------------------------------
# Phase 3: IOC Watch — structured atomic indicator ingestion + self-contained confidence scoring
# ---------------------------------------------------------------------------------------------
#
# Design goal (per the approved Phase 3 plan): raw atomic-indicator feeds produce thousands of
# entries/day and a large share are noise, so every IOC gets a computed confidence_score/label
# at ingest instead of being dumped into the UI at face value. The core scoring is self-contained
# (no external reputation API required) and combines five signals, plus an optional sixth once a
# GreyNoise key is configured:
#   1. Base confidence by IOC type (hashes are a byte-exact match with ~zero FP rate; IPs are the
#      most volatile/shared/recycled infrastructure and start lowest).
#   2. Corroboration bonus: the same indicator reported by more than one independent feed is far
#      less likely to be a one-off false positive.
#   3. Native source confidence: ThreatFox ships its own analyst-submitted confidence_level
#      (0-100) per indicator, blended in rather than discarded.
#   4. Freshness decay: indicators with no re-sighting in a while (especially IPs, which churn
#      fast) decay toward Low rather than staying "actionable" forever.
#   5. Allowlist suppression: a small curated list of major CDN/cloud IP ranges hard-suppresses a
#      leading source of false positives (compromised sites/actors sitting behind shared
#      infrastructure) before they ever reach the table.
#   6. GreyNoise cross-reference (optional, IP-type only -- see fetch_greynoise_context() below):
#      RIOT (known business service) or a benign mass-scanner classification suppresses toward
#      Low; a malicious classification corroborates and raises the score. Self-limited to a
#      small weekly budget since the free Community tier only allows 50 lookups/week total.

IOC_TYPE_BASE_CONFIDENCE = {
    "hash_sha256": 75,
    "hash_sha1": 72,
    "hash_md5": 68,   # MD5 collisions are more feasible than SHA family, so trust it slightly less
    "url": 55,
    "domain": 40,
    "ip": 25,
}

# Small curated starter set of major CDN/cloud provider IP ranges -- NOT exhaustive. Intended to
# suppress the most common shared-infrastructure false positives seen in raw atomic IP feeds;
# expand as needed. (Cloudflare / AWS CloudFront / Google Cloud / Azure representative subsets.)
CDN_CLOUD_ALLOWLIST_CIDRS = [
    "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
    "104.16.0.0/13", "108.162.192.0/18", "131.0.72.0/22", "141.101.64.0/18",
    "162.158.0.0/15", "172.64.0.0/13", "188.114.96.0/20", "190.93.240.0/20",
    "197.234.240.0/22", "198.41.128.0/17",
    "13.32.0.0/15", "52.84.0.0/15", "205.251.192.0/19",
    "34.64.0.0/10", "35.190.0.0/17",
    "20.33.0.0/16", "40.64.0.0/10",
]
_CDN_CLOUD_ALLOWLIST_NETWORKS = None  # lazily parsed once; ipaddress.ip_network() isn't free


def is_allowlisted_ip(value: str) -> bool:
    """True if `value` falls inside the curated CDN/cloud allowlist above."""
    global _CDN_CLOUD_ALLOWLIST_NETWORKS
    if _CDN_CLOUD_ALLOWLIST_NETWORKS is None:
        _CDN_CLOUD_ALLOWLIST_NETWORKS = [ipaddress.ip_network(c) for c in CDN_CLOUD_ALLOWLIST_CIDRS]
    try:
        ip = ipaddress.ip_address(value)
    except ValueError:
        return False
    return any(ip in net for net in _CDN_CLOUD_ALLOWLIST_NETWORKS)


def score_ioc_confidence(
    ioc_type: str,
    ioc_value: str,
    source_count: int,
    native_confidence: Optional[float],
    last_seen_iso: str,
    greynoise_classification: Optional[str] = None,
    greynoise_riot: bool = False
) -> Tuple[float, str]:
    """Compute a self-contained 0-100 confidence score and High/Medium/Low label for one IOC.
    See the module-level comment above for the five signals blended here, plus a sixth for IPs
    that have been checked against GreyNoise's Community API (greynoise_classification/_riot,
    both None/False if never checked or not an IP -- entirely optional, self-contained scoring
    still works without it)."""
    if ioc_type == "ip" and is_allowlisted_ip(ioc_value):
        return 5.0, "Low"

    base = IOC_TYPE_BASE_CONFIDENCE.get(ioc_type, 30)
    corroboration_bonus = min(30, max(0, source_count - 1) * 15)
    composite = base + corroboration_bonus

    if native_confidence is not None:
        try:
            composite = (composite + float(native_confidence)) / 2
        except (TypeError, ValueError):
            pass

    try:
        last_seen_dt = dateparser.parse(last_seen_iso)
        if last_seen_dt.tzinfo is None:
            last_seen_dt = last_seen_dt.replace(tzinfo=timezone.utc)
        age_days = (datetime.now(timezone.utc) - last_seen_dt).total_seconds() / 86400.0
    except Exception:
        age_days = 0.0

    # IPs decay fastest (recycled/reassigned quickly); everything else decays more gradually.
    decay_start_days = 3 if ioc_type == "ip" else 10
    decay_span_days = 14 if ioc_type == "ip" else 30
    if age_days > decay_start_days:
        decay_fraction = min(1.0, (age_days - decay_start_days) / decay_span_days)
        composite *= (1 - 0.6 * decay_fraction)  # decays to at most 40% of its pre-decay value

    # GreyNoise cross-reference (IPs only): RIOT (known business service) or a benign scanning
    # classification is a strong false-positive signal that other signals above can't see, so it
    # caps the score low regardless of corroboration/native confidence. A malicious classification
    # is corroborating evidence, not a full override, so it adds rather than replaces.
    if greynoise_riot or greynoise_classification == "benign":
        composite = min(composite, 15.0)
    elif greynoise_classification == "malicious":
        composite = min(100.0, composite + 20.0)

    composite = max(0.0, min(100.0, composite))
    label = "High" if composite >= 70 else ("Medium" if composite >= 40 else "Low")
    return round(composite, 1), label


def fetch_urlhaus_iocs(feed_cfg: Dict[str, Any], auth_key: str) -> List[Dict[str, Any]]:
    """URLhaus (abuse.ch) recent malicious URLs. Docs: https://urlhaus-api.abuse.ch/"""
    resp = requests.get(
        "https://urlhaus-api.abuse.ch/v1/urls/recent/",
        headers={"Auth-Key": auth_key},
        timeout=20
    )
    resp.raise_for_status()
    payload = resp.json()
    if payload.get("query_status") != "ok":
        logger.info(f"URLhaus: query_status={payload.get('query_status')} (no data this run).")
        return []

    out = []
    for entry in payload.get("urls", []) or []:
        url_val = entry.get("url")
        if not url_val:
            continue
        tags = entry.get("tags") or []
        out.append({
            "ioc_type": "url",
            "ioc_value": url_val,
            "malware_family": tags[0] if tags else entry.get("threat"),
            "native_confidence": None,
            "first_seen": parse_date(entry.get("date_added")),
            "last_seen": parse_date(entry.get("date_added")),
            "source_id": feed_cfg.get("id", "urlhaus"),
            "reference": entry.get("urlhaus_reference")
        })
    return out


# ThreatFox reports ioc_type as one of these strings; anything else falls outside our schema's
# four indicator classes and is skipped rather than guessed at.
THREATFOX_TYPE_MAP = {
    "domain": "domain",
    "url": "url",
    "md5_hash": "hash_md5",
    "sha1_hash": "hash_sha1",
    "sha256_hash": "hash_sha256",
}


def fetch_threatfox_iocs(feed_cfg: Dict[str, Any], auth_key: str, days: int = 3) -> List[Dict[str, Any]]:
    """ThreatFox (abuse.ch) recent IOCs. Docs: https://threatfox.abuse.ch/api/"""
    resp = requests.post(
        "https://threatfox-api.abuse.ch/api/v1/",
        json={"query": "get_iocs", "days": max(1, min(7, days))},
        headers={"Auth-Key": auth_key},
        timeout=20
    )
    resp.raise_for_status()
    payload = resp.json()
    if payload.get("query_status") != "ok":
        logger.info(f"ThreatFox: query_status={payload.get('query_status')} (no data this run).")
        return []

    out = []
    for entry in payload.get("data", []) or []:
        raw_type = (entry.get("ioc_type") or "").strip()
        # "ip:port" indicators carry a port suffix on the raw ioc value; strip it for the IP itself.
        if raw_type == "ip:port":
            mapped_type = "ip"
            ioc_val = (entry.get("ioc") or "").split(":")[0]
        else:
            mapped_type = THREATFOX_TYPE_MAP.get(raw_type)
            ioc_val = entry.get("ioc")

        if not mapped_type or not ioc_val:
            continue

        out.append({
            "ioc_type": mapped_type,
            "ioc_value": ioc_val,
            "malware_family": entry.get("malware_printable") or entry.get("malware"),
            "native_confidence": entry.get("confidence_level"),
            "first_seen": parse_date(entry.get("first_seen")),
            "last_seen": parse_date(entry.get("last_seen") or entry.get("first_seen")),
            "source_id": feed_cfg.get("id", "threatfox"),
            "reference": entry.get("reference")
        })
    return out


def fetch_malwarebazaar_iocs(feed_cfg: Dict[str, Any], auth_key: str) -> List[Dict[str, Any]]:
    """MalwareBazaar (abuse.ch) recently added malware samples. Docs: https://bazaar.abuse.ch/api/
    Every entry is a file hash -- the strongest-confidence IOC type in our model."""
    resp = requests.post(
        "https://mb-api.abuse.ch/api/v1/",
        data={"query": "get_recent", "selector": "100"},
        headers={"Auth-Key": auth_key},
        timeout=20
    )
    resp.raise_for_status()
    payload = resp.json()
    if payload.get("query_status") != "ok":
        logger.info(f"MalwareBazaar: query_status={payload.get('query_status')} (no data this run).")
        return []

    out = []
    for entry in payload.get("data", []) or []:
        sha256 = entry.get("sha256_hash")
        if not sha256:
            continue
        out.append({
            "ioc_type": "hash_sha256",
            "ioc_value": sha256,
            "malware_family": entry.get("signature"),
            "native_confidence": None,
            "first_seen": parse_date(entry.get("first_seen")),
            "last_seen": parse_date(entry.get("first_seen")),
            "source_id": feed_cfg.get("id", "malwarebazaar"),
            "reference": f"https://bazaar.abuse.ch/sample/{sha256}/"
        })
    return out


# OTX indicator "type" values map onto our four IOC classes; anything else (CVE, email, etc.) is
# outside the IOC Watch schema and skipped.
OTX_TYPE_MAP = {
    "FileHash-MD5": "hash_md5",
    "FileHash-SHA1": "hash_sha1",
    "FileHash-SHA256": "hash_sha256",
    "URL": "url",
    "URI": "url",
    "domain": "domain",
    "hostname": "domain",
    "IPv4": "ip",
    "IPv6": "ip",
}


def fetch_otx_iocs(feed_cfg: Dict[str, Any], api_key: str, max_pulses: int = 20) -> List[Dict[str, Any]]:
    """AlienVault OTX API v2 (pulses/subscribed) -- structured indicators from pulses the
    configured account is subscribed to, replacing the old headline-only RSS pulse feed so OTX
    now feeds IOC Watch instead of the news kanban. Requires the account behind OTX_API_KEY to
    be subscribed to at least a few pulse authors/pulses on otx.alienvault.com (subscribing to
    a handful of reputable authors is the normal way OTX is used -- there is no unauthenticated
    global firehose). Docs: https://otx.alienvault.com/api"""
    modified_since = (datetime.now(timezone.utc) - timedelta(days=3)).strftime("%Y-%m-%dT%H:%M:%S")
    resp = requests.get(
        "https://otx.alienvault.com/api/v1/pulses/subscribed",
        headers={"X-OTX-API-KEY": api_key},
        params={"limit": max_pulses, "modified_since": modified_since},
        timeout=20
    )
    resp.raise_for_status()
    payload = resp.json()

    out = []
    for pulse in payload.get("results", []) or []:
        pulse_ref = None
        refs = pulse.get("references") or []
        if refs:
            pulse_ref = refs[0]
        elif pulse.get("id"):
            pulse_ref = f"https://otx.alienvault.com/pulse/{pulse['id']}"

        malware_families = pulse.get("malware_families") or []
        family = malware_families[0] if malware_families else None
        created = parse_date(pulse.get("created"))
        modified = parse_date(pulse.get("modified") or pulse.get("created"))

        for indicator in pulse.get("indicators", []) or []:
            mapped_type = OTX_TYPE_MAP.get(indicator.get("type"))
            ioc_val = indicator.get("indicator")
            if not mapped_type or not ioc_val:
                continue
            out.append({
                "ioc_type": mapped_type,
                "ioc_value": ioc_val,
                "malware_family": family,
                "native_confidence": None,
                "first_seen": parse_date(indicator.get("created")) or created,
                "last_seen": modified,
                "source_id": feed_cfg.get("id", "alienvault_otx_iocs"),
                "reference": pulse_ref
            })
    return out


def process_ioc_dedup_and_save(conn: sqlite3.Connection, fetched_iocs: List[Dict[str, Any]]) -> Tuple[int, int]:
    """Insert/merge fetched IOCs into ioc_items, deduplicated on sha256("type:value"). A repeat
    sighting of an existing indicator updates last_seen, folds in the reporting source (driving
    the corroboration bonus), and recomputes its confidence score -- it does not insert a
    duplicate row. Returns (new_inserted_count, resighted_count)."""
    cursor = conn.cursor()
    inserted = 0
    resighted = 0

    for ioc in fetched_iocs:
        ioc_type = ioc["ioc_type"]
        ioc_value = ioc["ioc_value"].strip()
        if not ioc_value:
            continue
        ioc_id = hashlib.sha256(f"{ioc_type}:{ioc_value.lower()}".encode("utf-8")).hexdigest()
        source_id = ioc["source_id"]

        cursor.execute(
            "SELECT sources, source_count, first_seen, last_seen, native_confidence, malware_family, "
            "greynoise_classification, greynoise_riot "
            "FROM ioc_items WHERE id = ?",
            (ioc_id,)
        )
        existing = cursor.fetchone()

        if existing:
            existing_sources = json.loads(existing[0] or "[]")
            existing_source_count = existing[1]
            existing_first_seen = existing[2]
            existing_last_seen = existing[3]
            existing_native_conf = existing[4]
            existing_family = existing[5]
            existing_gn_classification = existing[6]
            existing_gn_riot = bool(existing[7])

            if source_id not in existing_sources:
                existing_sources.append(source_id)
            new_source_count = len(existing_sources)

            new_first_seen = min(existing_first_seen, ioc["first_seen"]) if ioc["first_seen"] else existing_first_seen
            new_last_seen = max(existing_last_seen, ioc["last_seen"]) if ioc["last_seen"] else existing_last_seen
            native_conf = ioc.get("native_confidence") if ioc.get("native_confidence") is not None else existing_native_conf
            family = existing_family or ioc.get("malware_family")

            # Carry forward any prior GreyNoise lookup -- a re-sight recompute must not silently
            # wipe out a classification fetch_greynoise_context() already paid weekly-budget for.
            score, label = score_ioc_confidence(
                ioc_type, ioc_value, new_source_count, native_conf, new_last_seen,
                greynoise_classification=existing_gn_classification, greynoise_riot=existing_gn_riot
            )

            cursor.execute("""
                UPDATE ioc_items
                SET sources = ?, source_count = ?, first_seen = ?, last_seen = ?,
                    native_confidence = ?, malware_family = ?, confidence_score = ?, confidence_label = ?,
                    reference = COALESCE(reference, ?)
                WHERE id = ?
            """, (
                json.dumps(existing_sources), new_source_count, new_first_seen, new_last_seen,
                native_conf, family, score, label, ioc.get("reference"), ioc_id
            ))
            if new_source_count > existing_source_count:
                resighted += 1
        else:
            score, label = score_ioc_confidence(
                ioc_type, ioc_value, 1, ioc.get("native_confidence"), ioc["last_seen"]
            )
            cursor.execute("""
                INSERT INTO ioc_items (
                    id, ioc_type, ioc_value, malware_family, confidence_score, confidence_label,
                    native_confidence, first_seen, last_seen, source_count, sources, reference
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                ioc_id, ioc_type, ioc_value, ioc.get("malware_family"), score, label,
                ioc.get("native_confidence"), ioc["first_seen"], ioc["last_seen"], 1,
                json.dumps([source_id]), ioc.get("reference")
            ))
            inserted += 1

    conn.commit()
    return inserted, resighted


# GreyNoise Community API is heavily rate-limited on the free tier (50 lookups/week, SHARED
# across this automated job and any manual lookups the account does in GreyNoise's own
# Visualizer UI) -- nothing like NVD's per-run cap works here. GREYNOISE_WEEKLY_BUDGET reserves
# a slice of that shared weekly allowance for fetcher.py, leaving headroom for manual use.
GREYNOISE_WEEKLY_BUDGET = 30
GREYNOISE_PER_RUN_CAP = 8


def fetch_greynoise_context(conn: sqlite3.Connection, max_lookups: int = GREYNOISE_PER_RUN_CAP) -> int:
    """Cross-reference IP-type IOCs against GreyNoise's Community API (benign mass-scanner/RIOT
    business-service noise vs. malicious/unknown) and fold the result into confidence_score via
    score_ioc_confidence(). Entirely optional -- returns 0 immediately if GREYNOISE_API_KEY isn't
    set, matching every other optional integration in this file. Rate-limited to
    GREYNOISE_WEEKLY_BUDGET lookups per rolling 7 days (tracked via greynoise_checked_at
    timestamps already in the DB, no separate usage table needed) since the free Community tier
    only allows 50/week total, shared with any manual Visualizer lookups on the same account.
    Prioritizes IPs never checked before, freshest first. Returns rows updated."""
    api_key = os.environ.get("GREYNOISE_API_KEY")
    if not api_key:
        return 0

    cursor = conn.cursor()
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%dT%H:%M:%SZ")
    cursor.execute(
        "SELECT COUNT(*) FROM ioc_items WHERE greynoise_checked_at IS NOT NULL AND greynoise_checked_at >= ?",
        (week_ago,)
    )
    used_this_week = cursor.fetchone()[0]
    remaining_budget = GREYNOISE_WEEKLY_BUDGET - used_this_week
    if remaining_budget <= 0:
        logger.info(
            f"GreyNoise: weekly budget ({GREYNOISE_WEEKLY_BUDGET}/7d) already used this week -- "
            f"skipping until it rolls off."
        )
        return 0

    effective_cap = max(0, min(max_lookups, remaining_budget))
    cursor.execute(
        "SELECT id, ioc_value FROM ioc_items WHERE ioc_type = 'ip' AND greynoise_checked_at IS NULL "
        "ORDER BY last_seen DESC LIMIT ?",
        (effective_cap,)
    )
    pending = cursor.fetchall()
    if not pending:
        return 0

    updated = 0
    checked_at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    for idx, (ioc_id, ip_value) in enumerate(pending):
        try:
            resp = requests.get(
                f"https://api.greynoise.io/v3/community/{ip_value}",
                headers={"key": api_key, "Accept": "application/json"},
                timeout=10
            )
            if resp.status_code == 404:
                # Documented "not observed" response -- valid data, not an error: this IP has no
                # scanning/RIOT history GreyNoise knows about, distinct from a failed lookup.
                classification, riot = "unknown", False
            else:
                resp.raise_for_status()
                payload = resp.json()
                classification = payload.get("classification") or "unknown"
                riot = bool(payload.get("riot"))

            cursor.execute(
                "SELECT ioc_type, ioc_value, source_count, native_confidence, last_seen FROM ioc_items WHERE id = ?",
                (ioc_id,)
            )
            row = cursor.fetchone()
            if row:
                score, label = score_ioc_confidence(
                    row[0], row[1], row[2], row[3], row[4],
                    greynoise_classification=classification, greynoise_riot=riot
                )
                cursor.execute(
                    "UPDATE ioc_items SET greynoise_classification = ?, greynoise_riot = ?, "
                    "greynoise_checked_at = ?, confidence_score = ?, confidence_label = ? WHERE id = ?",
                    (classification, int(riot), checked_at, score, label, ioc_id)
                )
                updated += 1
        except Exception as e:
            logger.warning(f"GreyNoise lookup failed for {ip_value}: {e}")

        if idx < len(pending) - 1:
            time.sleep(1)

    conn.commit()
    if updated:
        logger.info(
            f"GreyNoise: cross-referenced {updated} IP indicator(s) "
            f"({used_this_week + updated}/{GREYNOISE_WEEKLY_BUDGET} of this week's budget used)."
        )
    return updated


def clean_old_iocs(conn: sqlite3.Connection, max_days: int = 7, max_per_source: int = 1500) -> int:
    """Purge IOCs not re-sighted in max_days (short retention -- atomic indicators go stale fast
    and this isn't meant to be a historical archive), then enforce a hard per-source cap by
    dropping the oldest rows beyond it so one noisy feed can't crowd out the rest of IOC Watch."""
    cursor = conn.cursor()
    cutoff_dt = (datetime.now(timezone.utc) - timedelta(days=max_days)).strftime("%Y-%m-%dT%H:%M:%SZ")
    cursor.execute("DELETE FROM ioc_items WHERE last_seen < ?", (cutoff_dt,))
    deleted_count = cursor.rowcount

    cursor.execute("SELECT DISTINCT sources FROM ioc_items")
    seen_source_ids = set()
    for (sources_str,) in cursor.fetchall():
        seen_source_ids.update(json.loads(sources_str or "[]"))

    capped_count = 0
    for source_id in seen_source_ids:
        cursor.execute(
            "SELECT id FROM ioc_items WHERE sources LIKE ? ORDER BY last_seen DESC",
            (f'%"{source_id}"%',)
        )
        ids = [row[0] for row in cursor.fetchall()]
        if len(ids) > max_per_source:
            overflow_ids = ids[max_per_source:]
            cursor.executemany("DELETE FROM ioc_items WHERE id = ?", [(i,) for i in overflow_ids])
            capped_count += len(overflow_ids)

    conn.commit()
    if deleted_count or capped_count:
        logger.info(
            f"IOC maintenance: purged {deleted_count} stale (>{max_days}d) IOC(s), "
            f"{capped_count} over per-source cap ({max_per_source})."
        )
    return deleted_count + capped_count


def generate_iocs_json(conn: sqlite3.Connection) -> None:
    """Generate public/data/iocs.json atomically -- the IOC Watch panel's entire data source.
    Mirrors generate_static_json()'s atomic-write approach but is a fully separate payload/file,
    consistent with IOC Watch being a distinct view rather than merged into the news feed."""
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    cursor = conn.cursor()
    cursor.execute("""
        SELECT id, ioc_type, ioc_value, malware_family, confidence_score, confidence_label,
               native_confidence, first_seen, last_seen, source_count, sources, reference,
               greynoise_classification, greynoise_riot
        FROM ioc_items
        ORDER BY confidence_score DESC, last_seen DESC
    """)
    rows = cursor.fetchall()

    items_payload = []
    label_counts = {"High": 0, "Medium": 0, "Low": 0}
    type_counts: Dict[str, int] = {}

    for row in rows:
        (ioc_id, ioc_type, ioc_value, malware_family, confidence_score, confidence_label,
         native_confidence, first_seen, last_seen, source_count, sources_str, reference,
         greynoise_classification, greynoise_riot) = row

        label_counts[confidence_label] = label_counts.get(confidence_label, 0) + 1
        type_counts[ioc_type] = type_counts.get(ioc_type, 0) + 1

        items_payload.append({
            "id": ioc_id,
            "ioc_type": ioc_type,
            "ioc_value": ioc_value,
            "malware_family": malware_family,
            "confidence_score": confidence_score,
            "confidence_label": confidence_label,
            "native_confidence": native_confidence,
            "first_seen": first_seen,
            "last_seen": last_seen,
            "source_count": source_count,
            "sources": json.loads(sources_str or "[]"),
            "reference": reference,
            "greynoise_classification": greynoise_classification,
            "greynoise_riot": bool(greynoise_riot)
        })

    payload = {
        "generated_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "stats": {
            "total_iocs": len(items_payload),
            "by_confidence": label_counts,
            "by_type": type_counts
        },
        "items": items_payload
    }

    target_dirs = [
        os.path.join(BASE_DIR, "data"),
        os.path.join(BASE_DIR, "public", "data")
    ]
    for out_dir in target_dirs:
        try:
            os.makedirs(out_dir, exist_ok=True)
            out_file = os.path.join(out_dir, "iocs.json")
            temp_file = out_file + ".tmp"
            with open(temp_file, "w", encoding="utf-8") as f:
                json.dump(payload, f, indent=2, ensure_ascii=False)
            os.replace(temp_file, out_file)
            logger.info(f"Successfully generated static IOC Watch payload at {out_file} ({len(items_payload)} IOCs).")
        except Exception as e:
            logger.warning(f"Could not write to {out_dir}: {e}")


def _get_by_path(obj: Any, path: str) -> Any:
    """Dot-path traversal helper for fetch_json_api() (e.g. "data.items" or "meta.published").
    Returns None on any missing key/index rather than raising, since field maps are configured
    per-source and a source's schema can shift without warning."""
    if not path:
        return obj
    current = obj
    for part in path.split("."):
        if isinstance(current, dict):
            current = current.get(part)
        elif isinstance(current, list):
            try:
                current = current[int(part)]
            except (ValueError, IndexError):
                return None
        else:
            return None
    return current


def fetch_json_api(feed_cfg: Dict[str, Any], category_cfg: Dict[str, Any], headers: Dict[str, str], max_items: int = 30) -> List[Dict[str, Any]]:
    """Generic JSON-API news-item adapter, config-driven via a `field_map` block on the feed
    entry instead of bespoke Python per source -- e.g. for CIRCL's CVE-search or similar simple
    JSON sources (left for a future config entry; no source is wired to this yet in Phase 3).

    Expected feed_cfg shape:
        {
          "url": "...",
          "field_map": {
            "items_path": "data.results",   // dot-path to the list of entries (root if omitted)
            "id_path": "id",                // falls back to link if omitted
            "title_path": "title",
            "summary_path": "description",
            "link_path": "url",
            "date_path": "published_at"
          }
        }
    """
    field_map = feed_cfg.get("field_map", {})
    resp = requests.get(feed_cfg["url"], headers=headers, timeout=20)
    resp.raise_for_status()
    raw = resp.json()

    entries = _get_by_path(raw, field_map.get("items_path", "")) or raw
    if not isinstance(entries, list):
        logger.warning(f"fetch_json_api: items_path did not resolve to a list for {feed_cfg.get('name')}.")
        return []

    out = []
    for entry in entries[:max_items]:
        title = _get_by_path(entry, field_map.get("title_path", "title"))
        link = _get_by_path(entry, field_map.get("link_path", "link"))
        if not title or not link:
            continue

        clean_link, url_hash = sanitize_url(link)
        summary_raw = _get_by_path(entry, field_map.get("summary_path", "summary")) or ""
        published_raw = _get_by_path(entry, field_map.get("date_path", "published_at"))

        clean_title_val = clean_title(str(title), clean_link)
        out.append({
            "id": url_hash,
            "title": clean_title_val,
            "normalized_title": normalize_title(clean_title_val),
            "source_id": feed_cfg.get("id"),
            "source_name": feed_cfg.get("name"),
            "category_id": category_cfg.get("id"),
            "category_name": category_cfg.get("name"),
            "link": clean_link,
            "published_at": parse_date(str(published_raw) if published_raw else None),
            "summary": clean_html_summary(str(summary_raw)),
            "tags": extract_tags(clean_title_val, str(summary_raw), feed_cfg.get("name", "")),
            "secondary_sources": [],
            "due_date": None
        })
    return out


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
    # Per-feed outcome for THIS run only (no historical/persisted uptime tracking yet — just
    # enough to stop a degraded source from silently vanishing from the Feed List modal).
    feed_run_status: Dict[str, Dict[str, Any]] = {}

    for category in config.get("categories", []):
        for feed in category.get("feeds", []):
            feed_id = feed.get("id")
            feed_name = feed.get("name")

            # A feed can be configured but kept inactive (e.g. a TAXII source whose discovery
            # URL/collection still needs to be confirmed against the vendor's current docs)
            # without deleting its config entry. Skipped feeds don't count toward totals.
            if feed.get("enabled") is False:
                logger.info(f"Skipping disabled feed [{category['id']}] {feed_name}.")
                feed_run_status[feed_id] = {"status": "disabled", "error": None, "items": 0}
                continue

            total_feeds += 1
            feed_type = feed.get("type", "rss")

            logger.info(f"Fetching [{category['id']}] {feed_name} ({feed['url']})...")
            try:
                if feed_type == "cisa_json":
                    items = fetch_cisa_json(feed, category, headers)
                elif feed_type == "taxii21":
                    items = fetch_taxii_feed(feed, category, headers, max_items)
                elif feed_type == "json_api":
                    items = fetch_json_api(feed, category, headers, max_items)
                elif feed.get("id") == "github_advisories":
                    items = fetch_github_api(feed, category, max_items)
                else:
                    items = fetch_standard_feed(feed, category, headers, max_items)

                all_fetched_items.extend(items)
                successful_feeds += 1
                feed_run_status[feed_id] = {"status": "success", "error": None, "items": len(items)}
                logger.info(f"Successfully fetched {len(items)} items from {feed_name}.")
            except Exception as e:
                logger.warning(f"Feed outlet {feed_name} temporarily unavailable ({e}). Continuing ingestion run.")
                failed_feeds += 1
                feed_run_status[feed_id] = {"status": "failed", "error": str(e), "items": 0}

    logger.info(f"Total raw items fetched across all feeds: {len(all_fetched_items)}")

    new_inserted, duplicates_merged = process_deduplication_and_save(conn, all_fetched_items)
    logger.info(f"Deduplication complete: {new_inserted} new items inserted, {duplicates_merged} duplicates merged.")

    # CVE risk enrichment: EPSS exploit-probability + NVD CVSS severity, merged onto any item
    # (KEV, GitHub advisory, or RSS-extracted) that carries a CVE-* tag.
    cve_item_map = gather_cve_item_map(conn)
    if cve_item_map:
        logger.info(f"Enrichment: {len(cve_item_map)} unique CVE(s) linked to currently retained items.")
        fetch_epss_scores(conn, headers, cve_item_map)
        fetch_nvd_cvss(conn, headers, cve_item_map)

    # Run automated storage maintenance & pruning
    clean_old_records(conn, max_days=30)

    sync_status = "success" if failed_feeds == 0 else ("partial_failure" if successful_feeds > 0 else "failed")

    feed_manifest = build_feed_manifest(config)
    for entry in feed_manifest:
        run_info = feed_run_status.get(entry["id"], {})
        entry["last_run_status"] = run_info.get("status", "unknown")
        entry["last_run_error"] = run_info.get("error")
        entry["last_run_items"] = run_info.get("items", 0)

    generate_static_json(conn, successful_feeds, failed_feeds, sync_status, feed_manifest)

    # --- Phase 3: IOC Watch ingestion -----------------------------------------------------
    # Fully independent of the news pipeline above: separate config section, separate table,
    # separate output file, separate confidence model. A feed here needs both "enabled": true
    # in config.json AND its auth_env_var actually set in api.env -- missing either just skips
    # that one feed with a clear log line, it never fails the whole run.
    all_fetched_iocs: List[Dict[str, Any]] = []
    ioc_feeds_processed = 0
    ioc_feeds_failed = 0

    for ioc_feed in config.get("ioc_feeds", []):
        feed_id = ioc_feed.get("id")
        feed_name = ioc_feed.get("name")

        if ioc_feed.get("enabled") is False:
            logger.info(f"Skipping disabled IOC feed {feed_name}.")
            continue

        auth_env_var = ioc_feed.get("auth_env_var")
        auth_value = os.environ.get(auth_env_var) if auth_env_var else None
        if auth_env_var and not auth_value:
            logger.warning(
                f"IOC feed {feed_name} is enabled but {auth_env_var} is not set in api.env -- skipping."
            )
            continue

        feed_type = ioc_feed.get("type")
        logger.info(f"Fetching IOC feed: {feed_name}...")
        try:
            if feed_type == "urlhaus":
                iocs = fetch_urlhaus_iocs(ioc_feed, auth_value)
            elif feed_type == "threatfox":
                iocs = fetch_threatfox_iocs(ioc_feed, auth_value)
            elif feed_type == "malwarebazaar":
                iocs = fetch_malwarebazaar_iocs(ioc_feed, auth_value)
            elif feed_type == "otx":
                iocs = fetch_otx_iocs(ioc_feed, auth_value)
            else:
                logger.warning(f"IOC feed {feed_name} has unknown type '{feed_type}' -- skipping.")
                continue

            all_fetched_iocs.extend(iocs)
            ioc_feeds_processed += 1
            logger.info(f"Successfully fetched {len(iocs)} indicator(s) from {feed_name}.")
        except Exception as e:
            logger.warning(f"IOC feed {feed_name} temporarily unavailable ({e}). Continuing ingestion run.")
            ioc_feeds_failed += 1

    if all_fetched_iocs or ioc_feeds_processed:
        ioc_inserted, ioc_resighted = process_ioc_dedup_and_save(conn, all_fetched_iocs)
        logger.info(f"IOC Watch: {ioc_inserted} new indicator(s) inserted, {ioc_resighted} re-sighted (corroboration updated).")
        clean_old_iocs(conn)
        fetch_greynoise_context(conn)
        generate_iocs_json(conn)
    else:
        logger.info("IOC Watch: no IOC feeds enabled/configured this run -- skipping iocs.json regeneration.")

    conn.close()
    logger.info("ThreatPulse Ingestion Run Finished Successfully.")


if __name__ == "__main__":
    main()
