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

  function getItemSeverity(item) {
    if (!item) return 'neutral';
    let cat = item.source ? item.source.category_id : '';
    if (cat === 'platform_infrastructure') cat = 'security_advisories';
    if (cat === 'engineering_homelab') cat = 'informational';

    const srcId = item.source ? item.source.id : '';
    const titleLower = (item.title || '').toLowerCase();
    const hasCve = item.tags && item.tags.some(t => t.startsWith('CVE-'));

    // Critical (Red Border & Blinking Dot): Reserved strictly for CVEs, CISA KEVs, Zero-Days, Active Exploits, RCEs, or Ransomware
    const isCritical = (
      srcId === 'cisa_kev_json' ||
      hasCve ||
      titleLower.includes('zero-day') ||
      titleLower.includes('0-day') ||
      titleLower.includes('exploit') ||
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

  function createKanbanCardDOM(item, itemIdx, State, onToggleRead, onToggleBookmark) {
    const isRead = State.readItems.has(item.id);
    const isBookmarked = State.bookmarkedItems.has(item.id);
    const severity = getItemSeverity(item);

    const card = document.createElement('article');
    card.className = `item-card severity-${severity} ${isRead ? 'item-read' : ''}`;
    card.dataset.id = item.id;
    card.dataset.index = itemIdx;

    let sourceBadge = '';
    if (severity === 'critical') {
      sourceBadge = `<span class="badge-critical"><span class="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span> ${escapeHtml(item.source.name)}</span>`;
    } else if (severity === 'warning') {
      sourceBadge = `<span class="badge-warning">☁️ ${escapeHtml(item.source.name)}</span>`;
    } else {
      sourceBadge = `<span class="badge-subdued">${escapeHtml(item.source.name)}</span>`;
    }

    const headerRow = `
      <div class="flex items-center justify-between gap-2">
        ${sourceBadge}
        <span class="text-[11px] font-mono text-slate-400" title="${escapeHtml(formatUtcDate(item.published_at))}">
          ${formatRelativeTime(item.published_at)}
        </span>
      </div>
    `;

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
      const validSec = item.secondary_sources.filter(s => s && s.name && s.url);
      if (validSec.length > 0) {
        const secPills = validSec.map(s => `
          <a href="${escapeHtml(s.url)}" target="_blank" rel="noopener noreferrer" class="sec-source-pill" title="View secondary coverage on ${escapeHtml(s.name)}">
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

    card.innerHTML = headerRow + titleRow + tagsRow + summaryRow + secRow + actionsRow;

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

  window.TPComponents = {
    escapeHtml,
    formatUtcDate,
    formatRelativeTime,
    getItemSeverity,
    getEnrichedItemTags,
    showToast,
    copySlackSnippet,
    createKanbanCardDOM
  };
})(window);
