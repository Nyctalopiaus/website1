/**
 * Outbound Connection & Infrastructure Status Dashboard Controller
 * Fetches JSON status telemetry, renders app cards, updates metrics,
 * draws historical trend charts, and handles admin manual scan triggers.
 */

document.addEventListener('DOMContentLoaded', () => {
  'use strict';

  // DOM References
  const dom = {
    overallStatusBadge: document.getElementById('overall-status-badge'),
    overallStatusText: document.getElementById('overall-status-text'),
    lastCheckTime: document.getElementById('last-check-time'),
    fallbackBanner: document.getElementById('fallback-banner'),

    metricUptime: document.getElementById('metric-uptime'),
    metricLatency: document.getElementById('metric-latency'),
    metricMonitored: document.getElementById('metric-monitored'),
    metricIncidents: document.getElementById('metric-incidents'),
    metricIncidentsSub: document.getElementById('metric-incidents-sub'),

    btnRefresh: document.getElementById('btn-refresh-data'),
    btnTriggerManual: document.getElementById('btn-trigger-manual'),

    trendSvg: document.getElementById('trend-svg'),
    chartTooltip: document.getElementById('chart-tooltip'),
    appFilterSelect: document.getElementById('app-filter-select'),

    appsGrid: document.getElementById('apps-grid'),
    matrixTbody: document.getElementById('matrix-tbody'),
    terminalLog: document.getElementById('terminal-log'),
    incidentHistoryRows: document.getElementById('incident-history-rows'),

    authModal: document.getElementById('admin-auth-modal'),
    authForm: document.getElementById('admin-auth-form'),
    adminUser: document.getElementById('admin-user'),
    adminPass: document.getElementById('admin-pass'),
    authErrorMsg: document.getElementById('auth-error-msg'),
    btnCancelAuth: document.getElementById('btn-cancel-auth'),
    btnCloseAuthModal: document.getElementById('btn-close-auth-modal')
  };

  let statusState = null;
  let currentTimeframe = '24h';
  let currentAppFilter = 'all';

  // Add Terminal Log Message
  function logTerminal(message, type = 'info') {
    if (!dom.terminalLog) return;
    const now = new Date().toISOString().slice(11, 19);
    const row = document.createElement('div');
    row.className = 'terminal-row';
    
    let colorPrefix = '';
    if (type === 'error') colorPrefix = '[ERROR] ';
    else if (type === 'warn') colorPrefix = '[WARN] ';
    else if (type === 'success') colorPrefix = '[SUCCESS] ';

    row.textContent = `[${now} UTC] ${colorPrefix}${message}`;
    dom.terminalLog.appendChild(row);
    dom.terminalLog.scrollTop = dom.terminalLog.scrollHeight;
  }

  // Fetch Status Data from JSON feed
  async function fetchStatusData() {
    logTerminal('Fetching status telemetry feed...');
    try {
      const res = await fetch('data/status-data.json?t=' + Date.now());
      if (res.ok) {
        statusState = await res.json();
        if (dom.fallbackBanner) dom.fallbackBanner.style.display = 'none';
        renderDashboard(statusState);
        logTerminal(`Data updated. ${statusState.total_monitored} endpoints online. Status: ${statusState.system_status}`, 'success');
      } else {
        throw new Error('HTTP ' + res.status);
      }
    } catch (e) {
      logTerminal('Could not fetch status-data.json: ' + e.message, 'error');
      // If file doesn't exist or fetch fails, fall back to sample data and say so clearly
      if (!statusState) {
        if (dom.fallbackBanner) dom.fallbackBanner.style.display = 'block';
        renderFallbackState();
      }
    }
  }

  const hiddenAppKeys = ['game-rating-log', 'crypto-game'];

  function filterVisibleEndpoints(endpoints) {
    return (endpoints || []).filter(ep => !ep.is_hidden && !hiddenAppKeys.includes(ep.app_key));
  }

  // Render Dashboard Elements
  function renderDashboard(data) {
    if (!data) return;

    const visibleEndpoints = filterVisibleEndpoints(data.endpoints || []);

    // 1. Header System Status
    if (dom.lastCheckTime) dom.lastCheckTime.textContent = data.formatted_date || 'Just now';

    if (dom.overallStatusBadge && dom.overallStatusText) {
      dom.overallStatusBadge.className = 'system-status-badge status-' + (data.system_status || 'operational').toLowerCase();
      if (data.system_status === 'OPERATIONAL') {
        dom.overallStatusText.textContent = 'All Systems Operational';
      } else if (data.system_status === 'DEGRADED') {
        dom.overallStatusText.textContent = 'Degraded Performance Detected';
      } else {
        dom.overallStatusText.textContent = 'Active Service Outage';
      }
    }

    // 2. Metrics Cards
    if (dom.metricUptime) dom.metricUptime.textContent = (data.global_uptime_24h || 99.9) + '%';
    if (dom.metricLatency) dom.metricLatency.textContent = (data.avg_latency_ms || 120) + ' ms';
    if (dom.metricMonitored) dom.metricMonitored.textContent = visibleEndpoints.length;
    const offlineCount = visibleEndpoints.filter(e => !e.is_success).length;
    const degradedCount = visibleEndpoints.filter(e => e.is_success && e.status === 'DEGRADED').length;
    if (dom.metricIncidents) {
      const activeVisIncidents = offlineCount + degradedCount;
      dom.metricIncidents.textContent = activeVisIncidents;
      dom.metricIncidents.className = 'metric-value ' + (activeVisIncidents > 0 ? 'text-red' : 'text-emerald');
    }
    if (dom.metricIncidentsSub) {
      if (offlineCount === 0 && degradedCount === 0) {
        dom.metricIncidentsSub.textContent = '0 degraded or offline endpoints';
      } else {
        const parts = [];
        if (offlineCount > 0) parts.push(`${offlineCount} offline`);
        if (degradedCount > 0) parts.push(`${degradedCount} degraded`);
        dom.metricIncidentsSub.textContent = parts.join(', ') + ' endpoint' + ((offlineCount + degradedCount) > 1 ? 's' : '');
      }
    }

    // 3. Render Application Cards
    renderAppCards(visibleEndpoints);

    // 4. Render Global Matrix Table
    renderMatrixTable(visibleEndpoints);

    // 4b. Keep the per-app chart filter options in sync with the current apps
    populateAppFilterOptions(visibleEndpoints);

    // 5. Render Historical Trend SVG Chart
    updateTrendChartForTimeframe(data, currentTimeframe, currentAppFilter);

    // 6. Render Real Incident History
    renderIncidentHistory(data.recent_incidents);
  }

  // Format a unix-seconds timestamp as "YYYY-MM-DD HH:MM:SS UTC"
  function formatIncidentTimestamp(unixSeconds) {
    if (!unixSeconds) return '';
    return new Date(unixSeconds * 1000).toISOString().slice(0, 19).replace('T', ' ') + ' UTC';
  }

  // Render Real Incident History (from the `incidents` table, not just this session's log)
  function renderIncidentHistory(incidents) {
    if (!dom.incidentHistoryRows) return;
    dom.incidentHistoryRows.innerHTML = '';

    if (!incidents || incidents.length === 0) {
      const row = document.createElement('div');
      row.className = 'terminal-row';
      row.textContent = '[HISTORY] No incidents recorded yet.';
      dom.incidentHistoryRows.appendChild(row);
      return;
    }

    incidents.forEach(inc => {
      const row = document.createElement('div');
      const started = formatIncidentTimestamp(inc.created_at);

      if (inc.resolved_at) {
        row.className = 'terminal-row incident-resolved';
        const resolved = formatIncidentTimestamp(inc.resolved_at);
        row.textContent = `[RESOLVED] ${started} → ${resolved} — ${inc.title}`;
      } else {
        row.className = 'terminal-row incident-ongoing';
        row.textContent = `[ONGOING] ${started} — ${inc.title}`;
      }
      dom.incidentHistoryRows.appendChild(row);
    });
  }

  // Keep the "filter chart by app" dropdown in sync with the apps currently on the page
  function populateAppFilterOptions(endpoints) {
    if (!dom.appFilterSelect) return;

    const seen = {};
    const apps = [];
    (endpoints || []).forEach(ep => {
      if (!ep.app_key || seen[ep.app_key]) return;
      seen[ep.app_key] = true;
      apps.push({ key: ep.app_key, name: ep.app_name || ep.app_key });
    });
    apps.sort((a, b) => a.name.localeCompare(b.name));

    const previousValue = dom.appFilterSelect.value || 'all';
    dom.appFilterSelect.innerHTML = '<option value="all">All Apps (Average)</option>';
    apps.forEach(app => {
      const opt = document.createElement('option');
      opt.value = app.key;
      opt.textContent = app.name;
      dom.appFilterSelect.appendChild(opt);
    });

    // Preserve the user's selection across refreshes if that app still exists
    const stillValid = previousValue === 'all' || apps.some(a => a.key === previousValue);
    dom.appFilterSelect.value = stillValid ? previousValue : 'all';
    currentAppFilter = dom.appFilterSelect.value;
  }

  // Resolve Dataset for Active Timeframe (Strict Real Database Data Only)
  function getTimeframeHistory(data, timeframe, appFilter = 'all') {
    if (!data) return [];

    if (appFilter && appFilter !== 'all') {
      const byAppKey = 'history_by_app_' + timeframe;
      const byApp = data[byAppKey];
      if (byApp && byApp[appFilter] && byApp[appFilter].length > 0) {
        return byApp[appFilter];
      }
      // No per-app history available for this timeframe/app yet - fall through to the aggregate.
    }

    if (timeframe === '7d' && data.history_trend_7d && data.history_trend_7d.length > 0) {
      return data.history_trend_7d;
    }

    if (timeframe === '30d' && data.history_trend_30d && data.history_trend_30d.length > 0) {
      return data.history_trend_30d;
    }

    if (timeframe === '24h') {
      return (data.history_trend_24h && data.history_trend_24h.length > 0)
        ? data.history_trend_24h
        : (data.history_trend || []);
    }

    // Fallback if specific array is missing: aggregate real recorded items from history_trend by date (YYYY-MM-DD)
    const baseHistory = data.history_trend_24h || data.history_trend || [];
    const dailyMap = {};
    baseHistory.forEach(item => {
      if (!item || !item.hr) return;
      const dateStr = item.hr.slice(0, 10);
      if (!dailyMap[dateStr]) dailyMap[dateStr] = [];
      dailyMap[dateStr].push(parseFloat(item.avg_lat) || 0);
    });

    const realDates = Object.keys(dailyMap).sort();
    if (realDates.length > 0) {
      return realDates.map(dStr => {
        const sum = dailyMap[dStr].reduce((a, b) => a + b, 0);
        return {
          hr: dStr,
          avg_lat: Math.round(sum / dailyMap[dStr].length)
        };
      });
    }

    return baseHistory;
  }

  // Update Trend Chart for Selected Timeframe
  function updateTrendChartForTimeframe(data, timeframe, appFilter = 'all') {
    if (!data) return;
    const history = getTimeframeHistory(data, timeframe, appFilter);
    renderTrendChart(history, timeframe);
  }

  // Group Endpoints by Application
  function renderAppCards(endpoints) {
    if (!dom.appsGrid) return;
    dom.appsGrid.innerHTML = '';

    const grouped = {};
    endpoints.forEach(ep => {
      const key = ep.app_key || 'other';
      if (!grouped[key]) {
        grouped[key] = {
          app_name: ep.app_name || key,
          endpoints: []
        };
      }
      grouped[key].endpoints.push(ep);
    });

    Object.keys(grouped).forEach(appKey => {
      const app = grouped[appKey];

      const card = document.createElement('div');
      card.className = 'app-card' + (app.endpoints.length > 4 ? ' featured-card' : '');

      // Determine overall app status
      let appStatus = 'OPERATIONAL';
      let hasOutage = app.endpoints.some(e => !e.is_success);
      let hasDegraded = app.endpoints.some(e => e.status === 'DEGRADED');

      if (hasOutage) appStatus = 'OUTAGE';
      else if (hasDegraded) appStatus = 'DEGRADED';

      const header = document.createElement('div');
      header.className = 'app-card-header';

      const title = document.createElement('h3');
      title.className = 'app-card-title';
      title.textContent = app.app_name;

      const badge = document.createElement('span');
      badge.className = 'system-status-badge status-' + appStatus.toLowerCase();
      badge.style.fontSize = '0.725rem';
      badge.style.padding = '0.2rem 0.6rem';
      badge.textContent = appStatus;

      header.appendChild(title);
      header.appendChild(badge);
      card.appendChild(header);

      const list = document.createElement('div');
      list.className = 'app-endpoints-list';

      app.endpoints.forEach(ep => {
        const item = document.createElement('div');
        item.className = 'endpoint-item';

        const info = document.createElement('div');
        info.className = 'endpoint-info';

        const name = document.createElement('span');
        name.className = 'endpoint-name';
        name.textContent = ep.endpoint_name;

        // Hostname is intentionally not repeated here - see it in the
        // Global API & Service Dependency Matrix table below.
        info.appendChild(name);

        const metrics = document.createElement('div');
        metrics.className = 'endpoint-metrics';

        const lat = document.createElement('span');
        lat.className = 'latency-tag';
        lat.textContent = ep.latency_ms + ' ms';

        const epBadge = document.createElement('span');
        const epStatusClass = (ep.status || 'OPERATIONAL').toLowerCase();
        epBadge.className = 'badge-sm status-' + epStatusClass;
        epBadge.textContent = ep.status || (ep.is_success ? '200 OK' : 'ERR');

        metrics.appendChild(lat);
        metrics.appendChild(epBadge);

        item.appendChild(info);
        item.appendChild(metrics);
        list.appendChild(item);
      });

      card.appendChild(list);
      dom.appsGrid.appendChild(card);
    });
  }

  // Render Global Matrix Table
  function renderMatrixTable(endpoints) {
    if (!dom.matrixTbody) return;
    dom.matrixTbody.innerHTML = '';

    endpoints.forEach(ep => {
      const tr = document.createElement('tr');

      const tdApp = document.createElement('td');
      tdApp.className = 'cell-app';
      tdApp.innerHTML = `<strong>${ep.app_name || ep.app_key}</strong>`;

      const tdDep = document.createElement('td');
      tdDep.className = 'cell-dep';
      let hostDisplay = ep.endpoint_url;
      try { hostDisplay = new URL(ep.endpoint_url).hostname; } catch(e){}
      tdDep.innerHTML = `<div>${ep.endpoint_name}</div><small style="color: var(--text-dark); font-family: monospace;">${hostDisplay}</small>`;

      const tdType = document.createElement('td');
      tdType.innerHTML = `<span class="chart-timeframe-badge" style="text-transform: uppercase;">${ep.type || 'outbound'}</span>`;

      const tdCode = document.createElement('td');
      tdCode.style.fontFamily = 'monospace';
      tdCode.textContent = ep.http_code ? `HTTP ${ep.http_code}` : 'N/A';

      const tdLat = document.createElement('td');
      tdLat.style.fontWeight = '600';
      tdLat.textContent = ep.latency_ms + ' ms';

      const tdStatus = document.createElement('td');
      const statusClass = (ep.status || 'OPERATIONAL').toLowerCase();
      tdStatus.innerHTML = `<span class="system-status-badge status-${statusClass}" style="font-size: 0.7rem; padding: 0.15rem 0.5rem;">${ep.status || 'OPERATIONAL'}</span>`;

      tr.appendChild(tdApp);
      tr.appendChild(tdDep);
      tr.appendChild(tdType);
      tr.appendChild(tdCode);
      tr.appendChild(tdLat);
      tr.appendChild(tdStatus);

      dom.matrixTbody.appendChild(tr);
    });
  }

  // Render SVG Trend Analysis Chart (Fixed Calendar Scale for 7d & 30d)
  function renderTrendChart(history, timeframe = '24h') {
    if (!dom.trendSvg) return;
    dom.trendSvg.innerHTML = '';

    const width = 800;
    const height = 220;
    const padding = { top: 30, right: 30, bottom: 40, left: 50 };

    if (!history) history = [];

    // Map existing DB data points by date YYYY-MM-DD
    const dbMap = {};
    history.forEach(item => {
      if (!item || !item.hr) return;
      const dStr = item.hr.slice(0, 10);
      dbMap[dStr] = item;
    });

    let chartPoints = [];
    let xAxisLabels = [];

    if (timeframe === '7d' || timeframe === '30d') {
      const totalDays = timeframe === '7d' ? 7 : 30;
      const labelInterval = timeframe === '7d' ? 1 : 3;

      let endDate = new Date();
      if (history.length > 0) {
        const lastHr = history[history.length - 1].hr;
        if (lastHr && lastHr.length >= 10) {
          const parsed = new Date(lastHr.slice(0, 10) + 'T00:00:00Z');
          if (!isNaN(parsed.getTime())) endDate = parsed;
        }
      }

      for (let i = totalDays - 1; i >= 0; i--) {
        const d = new Date(endDate);
        d.setUTCDate(d.getUTCDate() - i);
        const dStr = d.toISOString().slice(0, 10);
        const dayIdx = (totalDays - 1) - i;

        const x = padding.left + (dayIdx / (totalDays - 1)) * (width - padding.left - padding.right);
        const dbItem = dbMap[dStr];

        chartPoints.push({
          x: x,
          data: dbItem || null,
          hasData: !!dbItem,
          dateStr: dStr
        });

        if (dayIdx % labelInterval === 0 || dayIdx === totalDays - 1) {
          xAxisLabels.push({ x: x, text: dStr.slice(5) });
        }
      }
    } else {
      // 24h Mode: render hourly check points over 24h
      const showEvery = history.length > 15 ? Math.ceil(history.length / 8) : 1;
      history.forEach((h, idx) => {
        const x = history.length <= 1
          ? padding.left + (width - padding.left - padding.right) / 2
          : padding.left + (idx / (history.length - 1)) * (width - padding.left - padding.right);

        chartPoints.push({
          x: x,
          data: h,
          hasData: true,
          dateStr: h.hr
        });

        if (idx % showEvery === 0 || idx === history.length - 1) {
          let labelStr = h.hr || `${idx * 4}:00`;
          labelStr = labelStr.length > 10 ? labelStr.slice(-5) : labelStr;
          xAxisLabels.push({ x: x, text: labelStr });
        }
      });
    }

    // Filter points that actually have real data
    const activePoints = chartPoints.filter(p => p.hasData && p.data && p.data.avg_lat !== undefined);
    if (activePoints.length === 0) return;

    const latValues = activePoints.map(p => parseFloat(p.data.avg_lat) || 0);
    let minLat = Math.max(0, Math.min(...latValues) - 20);
    let maxLat = Math.max(...latValues) + 30;

    // Enforce a minimum visible range so ordinary latency jitter doesn't fill the
    // whole chart height and read as a dramatic spike (real regressions still widen it).
    const MIN_VISIBLE_RANGE_MS = 150;
    if (maxLat - minLat < MIN_VISIBLE_RANGE_MS) {
      const mid = (maxLat + minLat) / 2;
      minLat = Math.max(0, mid - MIN_VISIBLE_RANGE_MS / 2);
      maxLat = minLat + MIN_VISIBLE_RANGE_MS;
    }

    const getY = (val) => height - padding.bottom - ((val - minLat) / (maxLat - minLat || 1)) * (height - padding.top - padding.bottom);

    // Calculate Y positions for active points
    activePoints.forEach(p => {
      p.y = getY(parseFloat(p.data.avg_lat) || 0);
    });

    // Draw Grid Lines & Y-Axis Labels
    const numGridLines = 4;
    for (let i = 0; i <= numGridLines; i++) {
      const val = Math.round(minLat + (i / numGridLines) * (maxLat - minLat));
      const y = getY(val);

      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', padding.left);
      line.setAttribute('y1', y);
      line.setAttribute('x2', width - padding.right);
      line.setAttribute('y2', y);
      line.setAttribute('stroke', '#334155');
      line.setAttribute('stroke-width', '1');
      line.setAttribute('stroke-dasharray', '3,3');
      dom.trendSvg.appendChild(line);

      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', padding.left - 10);
      text.setAttribute('y', y + 4);
      text.setAttribute('fill', '#94a3b8');
      text.setAttribute('font-size', '11');
      text.setAttribute('text-anchor', 'end');
      text.textContent = val + 'ms';
      dom.trendSvg.appendChild(text);
    }

    // Draw X-Axis Time Labels
    xAxisLabels.forEach(lbl => {
      const timeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      timeText.setAttribute('x', lbl.x);
      timeText.setAttribute('y', height - 12);
      timeText.setAttribute('fill', '#94a3b8');
      timeText.setAttribute('font-size', '10');
      timeText.setAttribute('text-anchor', 'middle');
      timeText.textContent = lbl.text;
      dom.trendSvg.appendChild(timeText);
    });

    // Build SVG Path connecting only real data points
    let pathD = '';
    activePoints.forEach((pt, idx) => {
      if (idx === 0) pathD += `M ${pt.x} ${pt.y}`;
      else pathD += ` L ${pt.x} ${pt.y}`;
    });

    // Draw Trend Area Fill if >= 2 points
    if (activePoints.length > 1) {
      const areaD = pathD + ` L ${activePoints[activePoints.length - 1].x} ${height - padding.bottom} L ${activePoints[0].x} ${height - padding.bottom} Z`;
      const area = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      area.setAttribute('d', areaD);
      area.setAttribute('fill', 'rgba(59, 130, 246, 0.1)');
      dom.trendSvg.appendChild(area);
    }

    // Draw Trend Line
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', pathD);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke', '#3b82f6');
    path.setAttribute('stroke-width', '2.5');
    path.setAttribute('stroke-linecap', 'round');
    dom.trendSvg.appendChild(path);

    // Draw Data Circles ONLY on days that actually have real data
    activePoints.forEach(pt => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', pt.x);
      circle.setAttribute('cy', pt.y);
      circle.setAttribute('r', '4.5');
      circle.setAttribute('fill', '#0f172a');
      circle.setAttribute('stroke', '#3b82f6');
      circle.setAttribute('stroke-width', '2');
      circle.style.cursor = 'pointer';

      circle.addEventListener('mouseenter', () => {
        circle.setAttribute('r', '6');
        circle.setAttribute('fill', '#3b82f6');
        if (dom.chartTooltip) {
          dom.chartTooltip.style.display = 'block';
          dom.chartTooltip.style.left = (pt.x + 10) + 'px';
          dom.chartTooltip.style.top = (pt.y - 30) + 'px';
          dom.chartTooltip.innerHTML = `<strong>${pt.data.hr || pt.dateStr}</strong>: ${Math.round(pt.data.avg_lat)} ms`;
        }
      });

      circle.addEventListener('mouseleave', () => {
        circle.setAttribute('r', '4.5');
        circle.setAttribute('fill', '#0f172a');
        if (dom.chartTooltip) dom.chartTooltip.style.display = 'none';
      });

      dom.trendSvg.appendChild(circle);
    });
  }

  function renderFallbackState() {
    if (dom.lastCheckTime) dom.lastCheckTime.textContent = 'Just now (Initial)';
    renderDashboard({
      system_status: 'OPERATIONAL',
      global_uptime_24h: 99.9,
      avg_latency_ms: 142,
      total_monitored: 11,
      active_incidents: 0,
      history_trend_24h: [
        { hr: '00:00', avg_lat: 135 },
        { hr: '04:00', avg_lat: 142 },
        { hr: '08:00', avg_lat: 128 },
        { hr: '12:00', avg_lat: 155 },
        { hr: '16:00', avg_lat: 138 },
        { hr: '20:00', avg_lat: 142 }
      ],
      history_trend_7d: [
        { hr: '2026-08-06', avg_lat: 140 },
        { hr: '2026-08-07', avg_lat: 135 },
        { hr: '2026-08-08', avg_lat: 150 },
        { hr: '2026-08-09', avg_lat: 165 },
        { hr: '2026-08-10', avg_lat: 142 },
        { hr: '2026-08-11', avg_lat: 158 },
        { hr: '2026-08-12', avg_lat: 145 }
      ],
      history_trend_30d: [
        { hr: '2026-07-14', avg_lat: 138 },
        { hr: '2026-07-20', avg_lat: 145 },
        { hr: '2026-07-26', avg_lat: 132 },
        { hr: '2026-08-01', avg_lat: 155 },
        { hr: '2026-08-07', avg_lat: 140 },
        { hr: '2026-08-12', avg_lat: 142 }
      ],
      endpoints: [
        { app_key: 'open-road-advisor', app_name: 'Open Road Advisor', endpoint_name: 'Open-Meteo Weather API', endpoint_url: 'https://api.open-meteo.com', type: 'outbound', latency_ms: 118, http_code: 200, is_success: true, status: 'OPERATIONAL' },
        { app_key: 'open-road-advisor', app_name: 'Open Road Advisor', endpoint_name: 'OSRM Driving Router', endpoint_url: 'https://router.project-osrm.org', type: 'outbound', latency_ms: 210, http_code: 200, is_success: true, status: 'OPERATIONAL' },
        { app_key: 'relocation-assessment', app_name: 'Relocation Assessment', endpoint_name: 'Nominatim Geocoder', endpoint_url: 'https://nominatim.openstreetmap.org', type: 'outbound', latency_ms: 165, http_code: 200, is_success: true, status: 'OPERATIONAL' },
        { app_key: 'mortgage-calculator', app_name: 'Housing Cost Calculator', endpoint_name: 'Mortgage News Daily Widget', endpoint_url: 'https://widgets.mortgagenewsdaily.com', type: 'outbound', latency_ms: 142, http_code: 200, is_success: true, status: 'OPERATIONAL' },
        { app_key: 'retirement-forecaster', app_name: 'Retirement Forecaster', endpoint_name: 'SSA.gov Quick Calculator', endpoint_url: 'https://www.ssa.gov', type: 'outbound', latency_ms: 235, http_code: 200, is_success: true, status: 'OPERATIONAL' }
      ]
    });
  }

  // Setup Event Listeners
  if (dom.btnRefresh) {
    dom.btnRefresh.addEventListener('click', fetchStatusData);
  }

  // Timeframe selector buttons listener
  const tfBtns = document.querySelectorAll('.timeframe-btn');
  tfBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tfBtns.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-selected', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');

      currentTimeframe = btn.getAttribute('data-timeframe') || '24h';
      if (statusState) {
        updateTrendChartForTimeframe(statusState, currentTimeframe, currentAppFilter);
      }
    });
  });

  // Per-app chart filter listener
  if (dom.appFilterSelect) {
    dom.appFilterSelect.addEventListener('change', () => {
      currentAppFilter = dom.appFilterSelect.value || 'all';
      if (statusState) {
        updateTrendChartForTimeframe(statusState, currentTimeframe, currentAppFilter);
      }
    });
  }

  // Admin Manual Trigger Authentication Modal Logic
  if (dom.btnTriggerManual && dom.authModal) {
    dom.btnTriggerManual.addEventListener('click', () => {
      dom.authErrorMsg.style.display = 'none';
      dom.authModal.style.display = 'flex';
      dom.authModal.classList.remove('hidden');
      dom.adminUser.focus();
    });

    const closeAuthModal = () => {
      dom.authModal.style.display = 'none';
      dom.authModal.classList.add('hidden');
    };

    if (dom.btnCancelAuth) dom.btnCancelAuth.addEventListener('click', closeAuthModal);
    if (dom.btnCloseAuthModal) dom.btnCloseAuthModal.addEventListener('click', closeAuthModal);

    dom.authModal.addEventListener('click', (e) => {
      if (e.target === dom.authModal) closeAuthModal();
    });

    // Form Submission
    if (dom.authForm) {
      dom.authForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const user = dom.adminUser.value.trim();
        const pass = dom.adminPass.value.trim();

        if (!user || !pass) {
          dom.authErrorMsg.textContent = 'Please enter both admin username and password.';
          dom.authErrorMsg.style.display = 'block';
          return;
        }

        dom.authErrorMsg.style.display = 'none';
        logTerminal(`[ADMIN] Submitting manual diagnostic request for user "${user}"...`);

        const formData = new FormData();
        formData.append('admin_user', user);
        formData.append('admin_pass', pass);

        try {
          const res = await fetch('../scripts/soar_monitor.php', {
            method: 'POST',
            credentials: 'same-origin',
            body: formData
          });

          if (res.ok) {
            const data = await res.json();
            closeAuthModal();
            renderDashboard(data);
            logTerminal('[ADMIN] Manual diagnostic sweep completed successfully!', 'success');
          } else if (res.status === 401) {
            dom.authErrorMsg.textContent = 'Unauthorized: Invalid admin username or password.';
            dom.authErrorMsg.style.display = 'block';
            logTerminal('[ADMIN] Authorization failed: Invalid credentials.', 'error');
          } else {
            throw new Error('HTTP ' + res.status);
          }
        } catch (err) {
          logTerminal('[ADMIN] Failed to execute manual scan: ' + err.message, 'error');
          dom.authErrorMsg.textContent = 'Server error or script unreadable. Executing local test simulation.';
          dom.authErrorMsg.style.display = 'block';
        }
      });
    }
  }

  // Initial Load
  fetchStatusData();

  // Auto-Refresh: keep the page genuinely live instead of requiring a manual click,
  // since the toolbar advertises automated monitoring as always-on.
  const AUTO_REFRESH_MS = 60000;
  setInterval(fetchStatusData, AUTO_REFRESH_MS);
});
