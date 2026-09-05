/**
 * ThreatPulse — UI Components & Utilities
 */
(function(window) {
  'use strict';

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatUtcDate(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    return d.toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
  }

  function formatRelativeTime(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  // Matches "exploit" only when it refers to an actual exploit event/artifact tied to a
  // vulnerability (exploitation in the wild, a PoC, a weaponized/public/working exploit, an
  // exploit being released/sold/disclosed) — NOT the plain-English verb "hackers/attackers
  // exploit X" used to describe a general technique or trend (e.g. "hackers exploit MFA gaps"),
  // which isn't itself a signal that a specific CVE/zero-day is under active attack.
  const EXPLOIT_SIGNAL_RE = new RegExp(
    '(actively[\\s-]exploited' +
    '|exploited?[\\s-]in[\\s-]the[\\s-]wild' +
    '|mass[\\s-]exploitation' +
    '|widespread[\\s-]exploitation' +
    '|(?:poc|proof-of-concept|public|working|weaponized|zero-day|0-day|n-day|\\d+-day)[\\s-]exploit' +
    '|exploit[\\s-](?:code|kit|chain|released|available|published|disclosed|sold)' +
    '|\\b(?:an|the)[\\s-]exploit\\b' +
    ')',
    'i'
  );

  function getItemSeverity(item) {
    if (!item) return 'neutral';
    let cat = item.source ? item.source.category_id : '';
    if (cat === 'platform_infrastructure') cat = 'security_advisories';
    if (cat === 'engineering_homelab') cat = 'informational';

    const srcId = item.source ? item.source.id : '';
    const titleLower = (item.title || '').toLowerCase();
    const tags = item.tags || [];
    const hasCriticalSeverityRating = tags.includes('Critical Severity');

    // Critical (Red Border & Blinking Dot): reserved for CISA KEVs, advisories with an explicit
    // Critical severity rating (e.g. GitHub Advisories' severity field), Zero-Days, Active
    // Exploits, RCEs, or Ransomware — NOT every item that merely mentions a CVE ID, so "Critical"
    // stays a meaningful triage signal instead of the default state for most of the feed.
    const isCritical = (
      srcId === 'cisa_kev_json' ||
      hasCriticalSeverityRating ||
      titleLower.includes('zero-day') ||
      titleLower.includes('0-day') ||
      EXPLOIT_SIGNAL_RE.test(titleLower) ||
      titleLower.includes('rce') ||
      titleLower.includes('ransomware') ||
      titleLower.includes('critical vulnerability') ||
      titleLower.includes('actively exploited')
    );

    if (isCritical) return 'critical';
    if (cat === 'security_advisories' || cat === 'platform_infrastructure') return 'warning';
    if (cat === 'informational' || cat === 'engineering_homelab') return 'info';
    return 'active';
  }

  // Urgency ranking for the "Most Urgent" sort mode: severity tier first, then (within the same
  // tier) computed risk score, then the nearest CISA KEV remediation deadline, then newest-first
  // as a final tiebreak.
  const SEVERITY_URGENCY_RANK = { critical: 0, active: 1, warning: 2, info: 3, neutral: 4 };

  function getUrgencyWeight(item) {
    const severity = getItemSeverity(item);
    return SEVERITY_URGENCY_RANK[severity] !== undefined ? SEVERITY_URGENCY_RANK[severity] : 5;
  }

  // Blends FIRST.org EPSS (probability a CVE is exploited in the wild in the next 30 days,
  // 0-1) with NVD CVSS base score (0-10) into a single risk number. EPSS is weighted ~2.3x
  // heavier than CVSS because it answers "will this actually get exploited," a sharper triage
  // signal than CVSS's "how bad would it be" alone. Items with no CVE/no enrichment data score
  // 0 and simply fall through to the existing due-date/recency tiebreaks below.
  function getRiskScore(item) {
    if (!item) return 0;
    const epss = typeof item.epss_score === 'number' ? item.epss_score : 0;
    const cvss = typeof item.cvss_score === 'number' ? item.cvss_score : 0;
    return (epss * 70) + (cvss * 3);
  }

  // Site-wide priority score for the "Top Priority" spotlight (distinct from getRiskScore's
  // per-tier tiebreak): blends risk score with a KEV due-date proximity bonus (closer/overdue
  // deadlines matter more) and a flat bonus for anything already in the "critical" severity
  // tier, so the spotlight surfaces genuinely urgent items regardless of which column they're in.
  function getPriorityScore(item) {
    if (!item) return 0;
    let score = getRiskScore(item);

    if (item.due_date) {
      const due = new Date(item.due_date).getTime();
      if (!isNaN(due)) {
        const daysUntil = (due - Date.now()) / (1000 * 60 * 60 * 24);
        // Overdue/imminent deadlines add up to +30; bonus decays to 0 as the deadline recedes.
        score += Math.max(0, Math.min(30, 30 - daysUntil));
      }
    }

    if (getItemSeverity(item) === 'critical') score += 10;

    return score;
  }

  function compareUrgency(a, b) {
    const sevDiff = getUrgencyWeight(a) - getUrgencyWeight(b);
    if (sevDiff !== 0) return sevDiff;

    const riskDiff = getRiskScore(b) - getRiskScore(a); // descending: higher risk first
    if (riskDiff !== 0) return riskDiff;

    const aDue = a.due_date ? new Date(a.due_date).getTime() : null;
    const bDue = b.due_date ? new Date(b.due_date).getTime() : null;
    const aDueValid = aDue !== null && !isNaN(aDue);
    const bDueValid = bDue !== null && !isNaN(bDue);
    if (aDueValid && bDueValid) return aDue - bDue;
    if (aDueValid) return -1;
    if (bDueValid) return 1;

    const aPub = a.published_at ? new Date(a.published_at).getTime() : 0;
    const bPub = b.published_at ? new Date(b.published_at).getTime() : 0;
    return bPub - aPub;
  }

  function formatCvssBadge(cvssScore, cvssSeverity) {
    if (typeof cvssScore !== 'number' || isNaN(cvssScore)) return null;
    let cls = 'risk-low';
    if (cvssScore >= 9.0) cls = 'risk-critical';
    else if (cvssScore >= 7.0) cls = 'risk-high';
    else if (cvssScore >= 4.0) cls = 'risk-medium';
    const label = cvssSeverity ? `CVSS ${cvssScore.toFixed(1)} (${cvssSeverity})` : `CVSS ${cvssScore.toFixed(1)}`;
    return { cls, label };
  }

  function formatEpssBadge(epssScore, epssPercentile) {
    if (typeof epssScore !== 'number' || isNaN(epssScore)) return null;
    let cls = 'risk-low';
    if (epssScore >= 0.7) cls = 'risk-critical';
    else if (epssScore >= 0.3) cls = 'risk-high';
    else if (epssScore >= 0.1) cls = 'risk-medium';
    const pct = Math.round(epssScore * 100);
    const pctLabel = (typeof epssPercentile === 'number' && !isNaN(epssPercentile))
      ? ` · top ${Math.round((1 - epssPercentile) * 100)}%`
      : '';
    return { cls, label: `EPSS ${pct}%${pctLabel}` };
  }

  function formatDueDateBadge(dueDateStr) {
    if (!dueDateStr) return null;
    const due = new Date(dueDateStr);
    if (isNaN(due.getTime())) return null;

    const now = new Date();
    const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
    const dateLabel = due.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    if (diffDays < 0) return { cls: 'due-overdue', label: `Overdue — was due ${dateLabel}` };
    if (diffDays === 0) return { cls: 'due-today', label: `Due Today (${dateLabel})` };
    if (diffDays <= 7) return { cls: 'due-soon', label: `Due in ${diffDays}d (${dateLabel})` };
    return { cls: 'due-normal', label: `Remediate by ${dateLabel}` };
  }

  function getEnrichedItemTags(item) {
    if (!item) return [];
    const tagsSet = new Set(item.tags || []);
    const title = item.title || '';
    const summary = item.summary || '';
    const srcName = item.source ? (item.source.name || '') : '';
    const text = `${srcName} ${title} ${summary}`.toLowerCase();

    // Include Source Name as a filterable tag
    if (srcName) {
      tagsSet.add(srcName);
    }

    // Source Name & Keyword Tag mappings
    if (text.includes('debian')) { tagsSet.add('Debian'); tagsSet.add('Linux'); }
    if (text.includes('ubuntu')) { tagsSet.add('Ubuntu'); tagsSet.add('Linux'); }
    if (text.includes('freebsd')) { tagsSet.add('FreeBSD'); }
    if (text.includes('rocky')) { tagsSet.add('Rocky Linux'); tagsSet.add('Linux'); }
    if (text.includes('windows') || text.includes('microsoft') || text.includes('msrc')) { tagsSet.add('Windows'); }
    if (text.includes('linux') || text.includes('kernel')) { tagsSet.add('Linux'); }
    if (text.includes('macos') || text.includes('apple')) { tagsSet.add('macOS'); }
    if (/\bios\b/i.test(text)) { tagsSet.add('iOS'); }
    if (/\bandroid\b/i.test(text)) { tagsSet.add('Android'); }
    if (text.includes('kubernetes') || text.includes('k8s')) { tagsSet.add('Kubernetes'); }
    if (text.includes('aws') || text.includes('amazon')) { tagsSet.add('AWS'); }
    if (text.includes('docker')) { tagsSet.add('Docker'); }
    if (text.includes('wordpress')) { tagsSet.add('WordPress'); }
    if (text.includes('cisco')) { tagsSet.add('Cisco'); }
    if (text.includes('palo alto') || text.includes('unit 42')) { tagsSet.add('Palo Alto'); }
    if (text.includes('tailscale')) { tagsSet.add('Tailscale'); }
    if (text.includes('proxmox')) { tagsSet.add('Proxmox'); }
    if (text.includes('home assistant')) { tagsSet.add('Home Assistant'); }
    if (text.includes('cloudflare')) { tagsSet.add('Cloudflare'); }
    if (text.includes('apache')) { tagsSet.add('Apache'); }
    if (text.includes('nginx')) { tagsSet.add('Nginx'); }
    if (text.includes('active directory')) { tagsSet.add('Active Directory'); }
    if (text.includes('vpn') || text.includes('pfsense') || text.includes('netgate')) { tagsSet.add('VPN'); }
    if (text.includes('pi-hole')) { tagsSet.add('Pi-hole'); }
    if (text.includes('truenas')) { tagsSet.add('TrueNAS'); }
    if (text.includes('cisa') || text.includes('kev')) { tagsSet.add('CISA-KEV'); }
    if (/\brce\b/i.test(text) || text.includes('remote code execution')) { tagsSet.add('RCE'); }
    if (/\b0-day\b/i.test(text) || text.includes('zero-day')) { tagsSet.add('0-Day'); }
    if (text.includes('ransomware')) { tagsSet.add('Ransomware'); }
    if (text.includes('malware')) { tagsSet.add('Malware'); }
    if (text.includes('phishing')) { tagsSet.add('Phishing'); }
    if (/\bapt\b/i.test(text) || text.includes('advanced persistent threat')) { tagsSet.add('APT'); }
    if (text.includes('supply chain')) { tagsSet.add('Supply Chain'); }

    // CVE Extraction
    const cves = text.match(/\bcve-\d{4}-\d{4,7}\b/gi) || [];
    cves.forEach(cve => tagsSet.add(cve.toUpperCase()));

    return Array.from(tagsSet).sort();
  }

  function showToast(message, duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'px-4 py-2 rounded-lg bg-brand-card border border-brand-accent/40 text-slate-200 text-xs font-mono shadow-xl transition-all duration-300 transform translate-y-2 opacity-0 flex items-center gap-2';
    toast.innerHTML = `<span class="text-brand-accent">ℹ</span> <span>${escapeHtml(message)}</span>`;

    container.appendChild(toast);
    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
    });

    setTimeout(() => {
      toast.classList.add('opacity-0', 'translate-y-2');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  }

  function copySlackSnippet(item) {
    const title = item.title || 'Security Advisory';
    const source = item.source.name || 'ThreatPulse';
    const link = item.link || '#';
    const summary = item.summary ? item.summary.replace(/\n+/g, ' ').trim() : 'No summary provided.';
    const snippet = `*${title}* - ${source} (<${link}>)\n> ${summary}`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(snippet).then(() => {
        showToast('Copied Slack/Discord Markdown Snippet!');
      }).catch(() => fallbackCopyText(snippet));
    } else {
      fallbackCopyText(snippet);
    }
  }

  // Daily Digest export — batches today's top critical/high items into one clipboard copy as
  // Markdown, so a triage lead can paste a single message into Slack/email instead of copying
  // each advisory one at a time via copySlackSnippet(). Reuses the same clipboard mechanics
  // (navigator.clipboard with a fallbackCopyText/execCommand path) rather than a second copy path.
  function copyDailyDigest(items) {
    const list = Array.isArray(items) ? items : [];

    if (list.length === 0) {
      showToast('No critical/high items to include in today\'s digest.');
      return;
    }

    const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
    const lines = [`*ThreatPulse Daily Digest — ${dateLabel}*`, `${list.length} critical/high-priority item${list.length === 1 ? '' : 's'} today:`, ''];

    list.forEach((item, idx) => {
      const source = (item.source && item.source.name) || 'Unknown Source';
      const cvssBadge = formatCvssBadge(item.cvss_score, item.cvss_severity);
      const epssBadge = formatEpssBadge(item.epss_score, item.epss_percentile);
      const riskBits = [cvssBadge ? cvssBadge.label : null, epssBadge ? epssBadge.label : null].filter(Boolean);
      const riskSuffix = riskBits.length > 0 ? ` [${riskBits.join(' · ')}]` : '';
      lines.push(`${idx + 1}. *${item.title}* — ${source}${riskSuffix} (<${item.link || '#'}>)`);
    });

    const digest = lines.join('\n');

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(digest).then(() => {
        showToast(`Copied Daily Digest (${list.length} items)!`);
      }).catch(() => fallbackCopyText(digest));
    } else {
      fallbackCopyText(digest);
    }
  }

  function fallbackCopyText(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      showToast('Copied Markdown Snippet!');
    } catch (e) {
      showToast('Failed to copy snippet');
    }
    document.body.removeChild(textarea);
  }

  // Source trust tier — a small icon prefix so users can gauge authoritativeness at a glance
  // without reading the source name closely, especially once TAXII/JSON sources sit next to
  // blog RSS in the same column. Tier is config-driven (see config.json's per-feed "tier"),
  // resolved server-side, and shipped on item.source.tier.
  // Icon shape per severity tier (used by createKanbanCardDOM's badge below) — each is a distinct
  // silhouette (triangle / bolt / circle), not just a color swap, so the cue survives grayscale
  // and colorblind viewing rather than relying on the card's border-left hue alone.
  const SEVERITY_ICONS = {
    warning: '<svg width="11" height="11" class="w-2.5 h-2.5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/></svg>',
    active: '<svg width="11" height="11" class="w-2.5 h-2.5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 3L4 14h6l-1 7 9-11h-6l1-7z"/></svg>',
    info: '<svg width="11" height="11" class="w-2.5 h-2.5 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>'
  };

  const TIER_META = {
    gov: { icon: '🏛️', label: 'Government / CERT source' },
    vendor: { icon: '🏢', label: 'Vendor / commercial security research' },
    community: { icon: '🧩', label: 'Open-source project / community-maintained' },
    osint: { icon: '🌐', label: 'Open threat intel (OSINT/TAXII)' },
    aggregator: { icon: '📰', label: 'News aggregator / independent commentary' }
  };

  function getTierMeta(tier) {
    return TIER_META[tier] || TIER_META.aggregator;
  }

  function createKanbanCardDOM(item, itemIdx, State, onToggleRead, onToggleBookmark) {
    const isRead = State.readItems.has(item.id);
    const isBookmarked = State.bookmarkedItems.has(item.id);
    const severity = getItemSeverity(item);

    const card = document.createElement('article');
    card.className = `item-card severity-${severity} ${isRead ? 'item-read' : ''}`;
    card.dataset.id = item.id;
    card.dataset.index = itemIdx;

    const tierMeta = getTierMeta(item.source && item.source.tier);
    const sourceLabel = `<span title="${escapeHtml(tierMeta.label)}">${tierMeta.icon} ${escapeHtml(item.source.name)}</span>`;

    // Redundant non-color severity cue: each tier gets its own icon SHAPE (not just a color),
    // so severity reads correctly for colorblind users and at a glance, not only via the card's
    // border-left hue. "critical" already had one (the pulsing dot); "warning" previously used a
    // semantically-mismatched cloud emoji; "active"/"info" had no cue at all (both silently fell
    // through to the same plain .badge-subdued style).
    let sourceBadge = '';
    if (severity === 'critical') {
      sourceBadge = `<span class="badge-critical"><span class="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span> ${sourceLabel}</span>`;
    } else if (severity === 'warning') {
      sourceBadge = `<span class="badge-warning">${SEVERITY_ICONS.warning} ${sourceLabel}</span>`;
    } else if (severity === 'active') {
      sourceBadge = `<span class="badge-active">${SEVERITY_ICONS.active} ${sourceLabel}</span>`;
    } else if (severity === 'info') {
      sourceBadge = `<span class="badge-info">${SEVERITY_ICONS.info} ${sourceLabel}</span>`;
    } else {
      sourceBadge = `<span class="badge-subdued">${sourceLabel}</span>`;
    }

    const headerRow = `
      <div class="flex items-center justify-between gap-2">
        ${sourceBadge}
        <span class="text-[11px] font-mono text-slate-400" title="${escapeHtml(formatUtcDate(item.published_at))}">
          ${formatRelativeTime(item.published_at)}
        </span>
      </div>
    `;

    let dueDateRow = '';
    const dueBadge = formatDueDateBadge(item.due_date);
    if (dueBadge) {
      dueDateRow = `
        <div class="badge-due ${dueBadge.cls}" title="CISA KEV mandated federal remediation deadline">
          ⏰ ${escapeHtml(dueBadge.label)}
        </div>
      `;
    }

    // CVSS (NVD severity) + EPSS (FIRST.org exploit-probability) risk badges — surfaced inline
    // so triage doesn't require a click-through. Only rendered for items that were actually
    // enriched (i.e. carry a recognized CVE); most feed items simply won't have these fields.
    let riskRow = '';
    const cvssBadge = formatCvssBadge(item.cvss_score, item.cvss_severity);
    const epssBadge = formatEpssBadge(item.epss_score, item.epss_percentile);
    if (cvssBadge || epssBadge) {
      const pills = [];
      if (cvssBadge) pills.push(`<span class="badge-risk ${cvssBadge.cls}" title="NVD CVSS base score for this CVE">🎯 ${escapeHtml(cvssBadge.label)}</span>`);
      if (epssBadge) pills.push(`<span class="badge-risk ${epssBadge.cls}" title="FIRST.org EPSS: modeled probability of exploitation in the wild within 30 days">📈 ${escapeHtml(epssBadge.label)}</span>`);
      riskRow = `<div class="flex flex-wrap gap-1.5 mt-1.5">${pills.join('')}</div>`;
    }

    const titleRow = `
      <h3 class="item-title mt-1.5">
        <a href="${escapeHtml(item.link)}" target="_blank" rel="noopener noreferrer" class="hover:text-brand-accent transition-colors">
          ${escapeHtml(item.title)}
        </a>
      </h3>
    `;

    const enrichedTags = getEnrichedItemTags(item);
    let tagsBadges = '';
    if (enrichedTags.length > 0) {
      const tagElements = enrichedTags.map(t => {
        if (t.startsWith('CVE-')) {
          return `<a href="https://nvd.nist.gov/vuln/detail/${escapeHtml(t)}" target="_blank" rel="noopener noreferrer" class="btn-cve-link tag-cve" title="View NIST NVD Advisory">${escapeHtml(t)} ↗</a>`;
        }
        return `<span class="tag-general">${escapeHtml(t)}</span>`;
      }).join(' ');
      tagsBadges = `<div class="flex flex-wrap gap-1 mt-2">${tagElements}</div>`;
    }

    const tagsRow = tagsBadges;

    let summaryRow = '';
    if (item.summary) {
      summaryRow = `
        <p class="item-summary text-xs text-slate-300/90 mt-2 line-clamp-2 leading-relaxed">
          ${escapeHtml(item.summary)}
        </p>
      `;
    }

    let secRow = '';
    if (item.secondary_sources && item.secondary_sources.length > 0) {
      const validSec = item.secondary_sources.filter(s => s && s.name && s.link);
      if (validSec.length > 0) {
        const secPills = validSec.map(s => `
          <a href="${escapeHtml(s.link)}" target="_blank" rel="noopener noreferrer" class="sec-source-pill" title="View secondary coverage on ${escapeHtml(s.name)}">
            ${escapeHtml(s.name)} ↗
          </a>
        `).join(' ');

        secRow = `
          <div class="sec-sources-container">
            <span class="sec-sources-label">Also reported by:</span>
            <div class="sec-sources-list">${secPills}</div>
          </div>
        `;
      }
    }

    const actionsRow = `
      <div class="flex items-center justify-between border-t border-brand-border pt-2.5 mt-1 text-xs">
        <button class="btn-toggle-read flex items-center gap-1 text-slate-400 hover:text-slate-200 transition-colors" title="${isRead ? 'Mark item as unread' : 'Mark item as read'}">
          <svg width="14" height="14" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          <span>${isRead ? 'Mark Unread' : 'Mark Read'}</span>
        </button>

        <div class="flex items-center gap-2">
          <button class="btn-toggle-bookmark flex items-center gap-1 ${isBookmarked ? 'text-amber-400' : 'text-slate-400 hover:text-amber-400'} transition-colors" title="Bookmark Item">
            <svg width="14" height="14" class="w-3.5 h-3.5" fill="${isBookmarked ? 'currentColor' : 'none'}" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
            </svg>
            <span>${isBookmarked ? 'Saved' : 'Save'}</span>
          </button>

          <button class="btn-share-snippet flex items-center gap-1 text-slate-400 hover:text-brand-accent transition-colors" title="Copy formatted Slack/Discord markdown snippet (*Title* - Source (URL) > Summary) for team triage & incident chat sharing">
            <svg width="14" height="14" class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 100-5.367 3 3 0 000 5.367zm0 8a3 3 0 100-5.367 3 3 0 000 5.367z" />
            </svg>
            <span>Snippet</span>
          </button>
        </div>
      </div>
    `;

    card.innerHTML = headerRow + dueDateRow + riskRow + titleRow + tagsRow + summaryRow + secRow + actionsRow;

    card.addEventListener('click', (e) => {
      if (e.target.closest('button') || e.target.closest('a')) return;
      if (item.link) window.open(item.link, '_blank', 'noopener,noreferrer');
    });

    const btnRead = card.querySelector('.btn-toggle-read');
    if (btnRead && onToggleRead) {
      btnRead.addEventListener('click', (e) => {
        e.stopPropagation();
        onToggleRead(item, itemIdx);
      });
    }

    const btnBookmark = card.querySelector('.btn-toggle-bookmark');
    if (btnBookmark && onToggleBookmark) {
      btnBookmark.addEventListener('click', (e) => {
        e.stopPropagation();
        onToggleBookmark(item, itemIdx);
      });
    }

    const btnSnippet = card.querySelector('.btn-share-snippet');
    if (btnSnippet) {
      btnSnippet.addEventListener('click', (e) => {
        e.stopPropagation();
        copySlackSnippet(item);
      });
    }

    return card;
  }

  // IOC Watch (Phase 3) display helpers. Confidence badges reuse the existing risk-* badge
  // color scale (risk-critical/high/low) rather than inventing a new palette: High confidence
  // maps to the most alarming color since it's the "act on this" tier, Medium to caution, Low
  // to subdued -- consistent with how CVSS/EPSS badges already use that scale elsewhere.
  const IOC_CONFIDENCE_META = {
    High: { cls: 'risk-critical', icon: '🔴' },
    Medium: { cls: 'risk-high', icon: '🟡' },
    Low: { cls: 'risk-low', icon: '⚪' }
  };

  function getIocConfidenceMeta(label) {
    return IOC_CONFIDENCE_META[label] || IOC_CONFIDENCE_META.Low;
  }

  // Maps a raw ioc_type (as stored in ioc_items/iocs.json) to its display label, icon, and the
  // filter-chip group it belongs to (the three hash subtypes all group under "hash").
  const IOC_TYPE_META = {
    hash_sha256: { label: 'SHA-256', icon: '#️⃣', group: 'hash' },
    hash_sha1: { label: 'SHA-1', icon: '#️⃣', group: 'hash' },
    hash_md5: { label: 'MD5', icon: '#️⃣', group: 'hash' },
    url: { label: 'URL', icon: '🔗', group: 'url' },
    domain: { label: 'Domain', icon: '🌐', group: 'domain' },
    ip: { label: 'IP', icon: '🖥️', group: 'ip' }
  };

  function getIocTypeMeta(iocType) {
    return IOC_TYPE_META[iocType] || { label: iocType || 'Unknown', icon: '❔', group: 'other' };
  }

  window.TPComponents = {
    escapeHtml,
    formatUtcDate,
    formatRelativeTime,
    getItemSeverity,
    getUrgencyWeight,
    getRiskScore,
    getPriorityScore,
    compareUrgency,
    formatDueDateBadge,
    formatCvssBadge,
    formatEpssBadge,
    getTierMeta,
    getEnrichedItemTags,
    showToast,
    copySlackSnippet,
    copyDailyDigest,
    createKanbanCardDOM,
    getIocConfidenceMeta,
    getIocTypeMeta
  };
})(window);
