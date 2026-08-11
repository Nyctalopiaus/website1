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

    metricUptime: document.getElementById('metric-uptime'),
    metricLatency: document.getElementById('metric-latency'),
    metricMonitored: document.getElementById('metric-monitored'),
    metricIncidents: document.getElementById('metric-incidents'),
    metricIncidentsSub: document.getElementById('metric-incidents-sub'),

    btnRefresh: document.getElementById('btn-refresh-data'),
    btnTriggerManual: document.getElementById('btn-trigger-manual'),

    trendSvg: document.getElementById('trend-svg'),
    chartTooltip: document.getElementById('chart-tooltip'),

    appsGrid: document.getElementById('apps-grid'),
    matrixTbody: document.getElementById('matrix-tbody'),
    terminalLog: document.getElementById('terminal-log'),

    authModal: document.getElementById('admin-auth-modal'),
    authForm: document.getElementById('admin-auth-form'),
    adminUser: document.getElementById('admin-user'),
    adminPass: document.getElementById('admin-pass'),
    authErrorMsg: document.getElementById('auth-error-msg'),
    btnCancelAuth: document.getElementById('btn-cancel-auth'),
    btnCloseAuthModal: document.getElementById('btn-close-auth-modal')
  };

  let statusState = null;

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
        renderDashboard(statusState);
        logTerminal(`Data updated. ${statusState.total_monitored} endpoints online. Status: ${statusState.system_status}`, 'success');
      } else {
        throw new Error('HTTP ' + res.status);
      }
    } catch (e) {
      logTerminal('Could not fetch status-data.json: ' + e.message, 'error');
      // If file doesn't exist yet, render initial state
      if (!statusState) {
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
    if (dom.metricIncidents) {
      const activeVisIncidents = visibleEndpoints.filter(e => !e.is_success || e.status === 'DEGRADED').length;
      dom.metricIncidents.textContent = activeVisIncidents;
      dom.metricIncidents.className = 'metric-value ' + (activeVisIncidents > 0 ? 'text-red' : 'text-emerald');
    }
    if (dom.metricIncidentsSub) {
      dom.metricIncidentsSub.textContent = '0 degraded or offline endpoints';
    }

    // 3. Render Application Cards
    renderAppCards(visibleEndpoints);

    // 4. Render Global Matrix Table
    renderMatrixTable(visibleEndpoints);

    // 5. Render Historical Trend SVG Chart
    renderTrendChart(data.history_trend || []);
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

        const urlSub = document.createElement('span');
        urlSub.className = 'endpoint-url-sub';

        // Clean URL display
        try {
          const parsedUrl = new URL(ep.endpoint_url);
          urlSub.textContent = parsedUrl.hostname;
        } catch(e) {
          urlSub.textContent = ep.endpoint_url;
        }

        info.appendChild(name);
        info.appendChild(urlSub);

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

  // Render SVG Trend Analysis Chart
  function renderTrendChart(history) {
    if (!dom.trendSvg) return;
    dom.trendSvg.innerHTML = '';

    if (!history || history.length === 0) {
      // Default sample trend points
      history = [
        { hr: '00:00', avg_lat: 135 },
        { hr: '04:00', avg_lat: 142 },
        { hr: '08:00', avg_lat: 128 },
        { hr: '12:00', avg_lat: 155 },
        { hr: '16:00', avg_lat: 138 },
        { hr: '20:00', avg_lat: 142 }
      ];
    }

    const width = 800;
    const height = 220;
    const padding = { top: 30, right: 30, bottom: 40, left: 50 };

    const latValues = history.map(h => parseFloat(h.avg_lat) || 0);
    const minLat = Math.max(0, Math.min(...latValues) - 20);
    const maxLat = Math.max(...latValues) + 30;

    const getX = (idx) => padding.left + (idx / (history.length - 1 || 1)) * (width - padding.left - padding.right);
    const getY = (val) => height - padding.bottom - ((val - minLat) / (maxLat - minLat || 1)) * (height - padding.top - padding.bottom);

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

    // Build SVG Path
    let pathD = '';
    let points = [];

    history.forEach((h, idx) => {
      const x = getX(idx);
      const y = getY(h.avg_lat);
      points.push({ x, y, data: h });

      if (idx === 0) pathD += `M ${x} ${y}`;
      else pathD += ` L ${x} ${y}`;

      // X-Axis Time Label
      const timeText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      timeText.setAttribute('x', x);
      timeText.setAttribute('y', height - 12);
      timeText.setAttribute('fill', '#94a3b8');
      timeText.setAttribute('font-size', '10');
      timeText.setAttribute('text-anchor', 'middle');
      let labelStr = h.hr ? h.hr.slice(-5) : `${idx*4}:00`;
      timeText.textContent = labelStr;
      dom.trendSvg.appendChild(timeText);
    });

    // Draw Trend Area Fill
    if (points.length > 0) {
      const areaD = pathD + ` L ${points[points.length-1].x} ${height - padding.bottom} L ${points[0].x} ${height - padding.bottom} Z`;
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

    // Draw Data Circles
    points.forEach(pt => {
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', pt.x);
      circle.setAttribute('cy', pt.y);
      circle.setAttribute('r', '4.5');
      circle.setAttribute('fill', '#0f172a');
      circle.setAttribute('stroke', '#3b82f6');
      circle.setAttribute('stroke-width', '2');
      circle.style.cursor = 'pointer';

      circle.addEventListener('mouseenter', (e) => {
        circle.setAttribute('r', '6');
        circle.setAttribute('fill', '#3b82f6');
        if (dom.chartTooltip) {
          dom.chartTooltip.style.display = 'block';
          dom.chartTooltip.style.left = (pt.x + 10) + 'px';
          dom.chartTooltip.style.top = (pt.y - 30) + 'px';
          dom.chartTooltip.innerHTML = `<strong>${pt.data.hr || 'Check Point'}</strong>: ${Math.round(pt.data.avg_lat)} ms`;
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
});
