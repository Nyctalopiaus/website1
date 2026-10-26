/**
 * Dibs Tour Planner - Interactive Showing Itinerary & Route Workspace
 * Full native implementation replacing external Homeward with 2-Opt TSP optimization,
 * OSRM driving geometry, Leaflet interactive map, custom start locations, showing availability
 * exceptions with realtor/buyer notes, drag/reorder controls, ICS export, and printable dossier.
 */

import { state, CONFIG } from './state.js';
import { apiFetch } from './api.js';
import { showToast } from './toast.js';
import { cleanDisplayAddress, escapeHtml, NO_PHOTO_IMG } from './properties.js';
import { routeOptimizer } from './tourOptimizer.js';


/**
 * Start-time choices for a showing day: 7:00 AM to 7:00 PM every 15 minutes, labeled with AM/PM so
 * a morning tour can't be set to the evening by mistake. A saved time outside that range is kept
 * as its own option so it stays visible.
 */
function startTimeOptions(current) {
    const pad = n => String(n).padStart(2, '0');
    const label = v => { const [h, m] = v.split(':').map(Number); return `${((h + 11) % 12) + 1}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`; };
    const values = [];
    for (let h = 7; h <= 19; h++) for (const m of [0, 15, 30, 45]) if (h < 19 || m === 0) values.push(`${pad(h)}:${pad(m)}`);
    const cur = /^\d{2}:\d{2}$/.test(current || '') ? current : '09:00';
    if (!values.includes(cur)) values.push(cur);
    values.sort();
    return values.map(v => `<option value="${v}" ${v === cur ? 'selected' : ''}>${label(v)}</option>`).join('');
}

class TourViewManager {
    constructor() {
        this.tourData = {
            clientId: null,
            clientName: '',
            isRealtor: false,
            settings: {
                start_address: '',
                start_lat: null,
                start_lng: null,
                start_source: 'my_home',
                start_time: '09:00',
                stay_duration_mins: 20,
                loop_back: 1
            },
            myHomeAddress: '',
            realtorOfficeAddress: '',
            stops: [], // Active stops in itinerary
            exceptions: [], // Unavailable or removed stops
            suggestions: [],
            scheduleMatrix: null
        };

        this.map = null;
        this.markers = [];
        this.routePolyline = null;
        this.isLoading = false;
        this.isSaving = false;
        this.activeClientList = [];
        // Autosave: every edit goes through refreshTimelineAndMap(), which schedules a save.
        this.autosaveTimer = null;
        this.dirty = false;
        this.saveAgain = false;
        window.addEventListener('beforeunload', event => {
            if (this.dirty || this.isSaving) { event.preventDefault(); event.returnValue = ''; }
        });
    }

    /**
     * Initializes or re-renders the Tour Planner view.
     */
    async initTourView(targetClientId = null) {
        const container = document.getElementById('view-tour-container');
        if (!container) return;

        this.isLoading = true;
        this.renderSkeleton(container);

        try {
            await this.loadTourData(targetClientId);
            await this.calculateSchedule(false);
            this.renderFullWorkspace(container);
            setTimeout(() => this.initMap(), 100);
            if (this.plannedTimesStale()) this.scheduleAutosave();
        } catch (e) {
            console.error('[TourView] Error initializing tour view:', e);
            container.innerHTML = `
                <div class="tour-error-state p-8 text-center">
                    <p class="text-rose-400 font-bold mb-2">Failed to load tour itinerary.</p>
                    <p class="text-xs text-muted mb-4">${escapeHtml(e.message || 'Server error')}</p>
                    <button class="btn btn-secondary" onclick="window.tourViewManager.initTourView()"><i data-lucide="refresh-cw"></i> Retry</button>
                </div>
            `;
            if (window.lucide) window.lucide.createIcons();
        } finally {
            this.isLoading = false;
        }
    }

    /**
     * Fetch tour itinerary data from backend.
     */
    async loadTourData(targetClientId = null) {
        let url = CONFIG.API_URL + '?action=get_tour_itinerary';
        const activeClientId = targetClientId || localStorage.getItem('active_tour_client_id') || localStorage.getItem('active_realtor_client_id');
        if (activeClientId && activeClientId !== 'all') {
            url += `&client_id=${encodeURIComponent(activeClientId)}`;
        }

        const res = await apiFetch(url);
        if (!res || !res.success) {
            throw new Error(res?.error || 'Unable to retrieve tour itinerary');
        }

        this.tourData.clientId = res.client_id;
        this.tourData.clientName = res.client_name || 'Client';
        this.tourData.isRealtor = Boolean(res.is_realtor);
        this.tourData.myHomeAddress = res.my_home_address || (state.myHome?.address ? `${state.myHome.address}, ${state.myHome.city || ''}, ${state.myHome.state || 'CO'} ${state.myHome.zip || ''}`.trim() : '');
        this.tourData.realtorOfficeAddress = res.realtor_office_address || '';

        // Hydrate settings
        const s = res.settings || {};
        this.tourData.bufferMins = Math.max(0, parseInt(res.buffer_mins, 10) || 0);
        this.tourData.settings = {
            start_address: s.start_address || this.tourData.myHomeAddress || 'Denver, CO',
            start_lat: s.start_lat ? parseFloat(s.start_lat) : null,
            start_lng: s.start_lng ? parseFloat(s.start_lng) : null,
            start_source: s.start_source || (this.tourData.myHomeAddress ? 'my_home' : 'custom'),
            start_time: s.start_time || '09:00',
            tour_date: /^\d{4}-\d{2}-\d{2}$/.test(s.tour_date || '') ? s.tour_date : '',
            stay_duration_mins: parseInt(s.stay_duration_mins, 10) || 20,
            loop_back: s.loop_back !== undefined ? parseInt(s.loop_back, 10) : 1
        };

        // Split active stops vs exceptions (unavailable / removed)
        const allStops = Array.isArray(res.stops) ? res.stops : [];
        this.tourData.stops = allStops.filter(st => st.status !== 'unavailable' && st.status !== 'removed');
        this.tourData.exceptions = allStops.filter(st => st.status === 'unavailable' || st.status === 'removed');
        this.tourData.suggestions = Array.isArray(res.suggestions) ? res.suggestions : [];

        // If realtor, load client list for the switcher dropdown
        if (this.tourData.isRealtor && (!this.activeClientList || this.activeClientList.length === 0)) {
            try {
                const uRes = await apiFetch('backend/api.php?action=list_users');
                if (uRes && uRes.users) {
                    this.activeClientList = uRes.users.filter(u => u.role === 'client' || u.role === 'buyer');
                }
            } catch (e) {
                console.warn('[TourView] Could not load client list:', e);
            }
        }

        // If start lat/lng is missing, geocode it asynchronously
        if (this.tourData.settings.start_address && (this.tourData.settings.start_lat == null || this.tourData.settings.start_lng == null)) {
            routeOptimizer.geocodeAddress(this.tourData.settings.start_address).then(geo => {
                if (geo) {
                    this.tourData.settings.start_lat = geo.lat;
                    this.tourData.settings.start_lng = geo.lng;
                    this.calculateSchedule(true);
                }
            });
        }
    }

    /**
     * Compute schedule matrix and OSRM geometry.
     */
    async calculateSchedule(updateMap = true) {
        const startPoint = {
            address: this.tourData.settings.start_address,
            lat: this.tourData.settings.start_lat,
            lng: this.tourData.settings.start_lng
        };

        // Start on the tour date (local), or today when none is set.
        const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(this.tourData.settings.tour_date || '');
        const startTime = d ? new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3])) : new Date();
        const timeParts = (this.tourData.settings.start_time || '09:00').split(':');
        if (timeParts.length >= 2) {
            startTime.setHours(parseInt(timeParts[0], 10), parseInt(timeParts[1], 10), 0, 0);
        }

        this.tourData.scheduleMatrix = await routeOptimizer.computeScheduleMatrixAsync(
            startPoint,
            this.tourData.stops,
            Boolean(this.tourData.settings.loop_back),
            this.tourData.settings.stay_duration_mins,
            startTime,
            this.tourData.bufferMins || 0
        );

        if (updateMap && this.map) {
            this.updateMapLayers();
        }
    }

    /**
     * Loading skeleton placeholder.
     */
    renderSkeleton(container) {
        container.innerHTML = `
            <div class="tour-workspace-container animate-pulse">
                <div class="tour-top-bar" style="height: 60px; background: var(--bg-surface); border-radius: 12px; margin-bottom: 1rem;"></div>
                <div class="tour-split-grid" style="display: grid; grid-template-columns: 460px 1fr; gap: 1.25rem; height: calc(100vh - 200px);">
                    <div style="background: var(--bg-surface); border-radius: 12px;"></div>
                    <div style="background: var(--bg-surface); border-radius: 12px;"></div>
                </div>
            </div>
        `;
    }

    /**
     * Renders the complete Tour Planner view workspace.
     */
    renderFullWorkspace(container) {
        const { isRealtor, clientName, settings, myHomeAddress, realtorOfficeAddress, stops, exceptions, scheduleMatrix } = this.tourData;
        const totalHomes = stops.length;
        const totalDuration = scheduleMatrix ? scheduleMatrix.formattedTotalDuration : '--';
        const totalMiles = scheduleMatrix ? `${scheduleMatrix.totalDistanceMiles} mi` : '--';
        const totalDriveMins = scheduleMatrix ? `${scheduleMatrix.totalDriveMins} mins drive` : '--';
        const finalArrival = scheduleMatrix?.returnLeg ? scheduleMatrix.returnLeg.formattedReturnTime : (scheduleMatrix?.orderedStops?.length ? scheduleMatrix.orderedStops[scheduleMatrix.orderedStops.length - 1].formattedDeparture : '--');

        let clientSelectorHtml = '';
        if (isRealtor && this.activeClientList.length > 0) {
            clientSelectorHtml = `
                <div class="tour-control-item">
                    <label class="tour-control-label"><i data-lucide="user"></i> Client Tour:</label>
                    <select class="select-input tour-select" id="tour-client-selector" onchange="window.tourViewManager.handleClientChange(this.value)">
                        ${this.activeClientList.map(c => `
                            <option value="${c.id}" ${String(c.id) === String(this.tourData.clientId) ? 'selected' : ''}>${escapeHtml(c.full_name || c.username)}</option>
                        `).join('')}
                    </select>
                </div>
            `;
        }

        // Start location options
        let startOptionsHtml = '';
        if (isRealtor) {
            startOptionsHtml = `
                <div class="tour-control-item flex-1">
                    <label class="tour-control-label"><i data-lucide="map-pin"></i> Start From:</label>
                    <div class="tour-start-btn-group">
                        <button type="button" class="tour-start-toggle-btn ${settings.start_source === 'my_home' ? 'active' : ''}" onclick="window.tourViewManager.setStartSource('my_home')" title="Client's Home Address: ${escapeHtml(myHomeAddress || 'Not set')}">
                            🏠 Client Home
                        </button>
                        ${realtorOfficeAddress ? `<button type="button" class="tour-start-toggle-btn ${settings.start_source === 'office' ? 'active' : ''}" onclick="window.tourViewManager.setStartSource('office')" title="Realtor Brokerage Office: ${escapeHtml(realtorOfficeAddress)}">
                            🏢 Office
                        </button>` : ''}
                        <button type="button" class="tour-start-toggle-btn ${settings.start_source === 'custom' ? 'active' : ''}" onclick="window.tourViewManager.setStartSource('custom')">
                            📍 Custom
                        </button>
                    </div>
                    <input type="text" id="tour-start-address-input" class="input-text tour-address-input ${settings.start_source !== 'custom' ? 'readonly' : ''}" value="${escapeHtml(settings.start_address)}" placeholder="Enter starting address..." onchange="window.tourViewManager.handleStartAddressChange(this.value)" ${settings.start_source !== 'custom' ? 'readonly' : ''}>
                </div>
            `;
        } else {
            startOptionsHtml = `
                <div class="tour-control-item flex-1">
                    <label class="tour-control-label"><i data-lucide="map-pin"></i> Start Location:</label>
                    <div class="tour-start-btn-group">
                        <button type="button" class="tour-start-toggle-btn ${settings.start_source === 'my_home' ? 'active' : ''}" onclick="window.tourViewManager.setStartSource('my_home')" title="My Home: ${escapeHtml(myHomeAddress || 'Not set')}">
                            🏠 My Home
                        </button>
                        <button type="button" class="tour-start-toggle-btn ${settings.start_source === 'custom' ? 'active' : ''}" onclick="window.tourViewManager.setStartSource('custom')">
                            📍 Custom Address
                        </button>
                    </div>
                    <input type="text" id="tour-start-address-input" class="input-text tour-address-input ${settings.start_source !== 'custom' ? 'readonly' : ''}" value="${escapeHtml(settings.start_address)}" placeholder="Enter starting address..." onchange="window.tourViewManager.handleStartAddressChange(this.value)" ${settings.start_source !== 'custom' ? 'readonly' : ''}>
                </div>
            `;
        }

        container.innerHTML = `
            <div class="tour-workspace-container">
                <!-- Top Tour Control Header -->
                <header class="tour-top-bar">
                    <div class="tour-bar-left">
                        <div class="tour-title-group">
                            <h2 class="tour-page-title"><i data-lucide="route"></i> Tour Planner</h2>
                            <span class="tour-client-badge">${isRealtor ? `Planning for <strong>${escapeHtml(clientName)}</strong>` : 'My Showing Tour'}</span>
                        </div>
                        <div class="tour-controls-row">
                            ${clientSelectorHtml}
                            ${startOptionsHtml}
                            <div class="tour-control-item">
                                <label class="tour-control-label" for="tour-date"><i data-lucide="calendar"></i> Tour Date:</label>
                                <input type="date" id="tour-date" class="input-text tour-time-input" value="${escapeHtml(settings.tour_date || '')}" onchange="window.tourViewManager.handleTourDateChange(this.value)">
                            </div>
                            <div class="tour-control-item">
                                <label class="tour-control-label"><i data-lucide="clock"></i> Start Time:</label>
                                <select id="tour-start-time" class="select-input tour-time-input" onchange="window.tourViewManager.handleStartTimeChange(this.value)">${startTimeOptions(settings.start_time)}</select>
                            </div>
                            <div class="tour-control-item">
                                <label class="tour-control-label"><i data-lucide="hourglass"></i> Stay Each:</label>
                                <select class="select-input tour-select" id="tour-stay-duration" onchange="window.tourViewManager.handleStayDurationChange(this.value)">
                                    <option value="15" ${settings.stay_duration_mins == 15 ? 'selected' : ''}>15 mins</option>
                                    <option value="20" ${settings.stay_duration_mins == 20 ? 'selected' : ''}>20 mins</option>
                                    <option value="30" ${settings.stay_duration_mins == 30 ? 'selected' : ''}>30 mins</option>
                                    <option value="45" ${settings.stay_duration_mins == 45 ? 'selected' : ''}>45 mins</option>
                                    <option value="60" ${settings.stay_duration_mins == 60 ? 'selected' : ''}>60 mins</option>
                                </select>
                            </div>
                            <div class="tour-control-item tour-control-checkbox">
                                <label class="tour-checkbox-label" title="Calculate return driving leg back to the starting point">
                                    <input type="checkbox" id="tour-loop-back" ${settings.loop_back ? 'checked' : ''} onchange="window.tourViewManager.handleLoopBackChange(this.checked)">
                                    <span>Return to Start</span>
                                </label>
                            </div>
                        </div>
                    </div>

                    <div class="tour-bar-actions">
                        <button type="button" class="btn btn-gold btn-compact font-bold" id="btn-tour-optimize" onclick="window.tourViewManager.optimizeTourOrder()" title="Optimize visiting order using 2-Opt TSP solver to minimize driving distance">
                            <i data-lucide="zap"></i> Optimize Route
                        </button>
                        <button type="button" class="btn btn-secondary btn-compact" onclick="window.tourViewManager.openGoogleMapsRoute()" title="Open multi-stop turn-by-turn driving directions in Google Maps">
                            <i data-lucide="navigation"></i> Google Maps
                        </button>
                        <button type="button" class="btn btn-secondary btn-compact" onclick="window.tourViewManager.exportCalendarICS()" title="Download schedule as an Apple / Google Calendar (.ics) file">
                            <i data-lucide="calendar"></i> Export .ics
                        </button>
                        <button type="button" class="btn btn-secondary btn-compact" onclick="window.tourViewManager.printTourDossier()" title="Print showing itinerary dossier with notes">
                            <i data-lucide="printer"></i> Print Dossier
                        </button>
                        <button type="button" class="btn btn-secondary btn-compact" onclick="window.openTourResults && window.openTourResults(null, ${this.tourData.isRealtor ? `'${escapeHtml(String(this.tourData.clientId || ''))}'` : 'null'})" title="${this.tourData.isRealtor ? "The client's ratings, decisions, top picks and notes from the tour (read-only)" : 'Type in what you wrote on the printed tour packet'}">
                            <i data-lucide="clipboard-check"></i> Tour Results
                        </button>
                        ${this.tourData.isRealtor ? `<button type="button" class="btn btn-secondary btn-compact" onclick="window.openTourPacket && window.openTourPacket()" title="Printable double-sided PDF: itinerary, route map, client brief, and one sheet per home">
                            <i data-lucide="file-text"></i> Tour Packet (PDF)
                        </button>` : ''}
                        <button type="button" class="btn btn-primary btn-compact" id="btn-tour-save" onclick="window.tourViewManager.saveTourItinerary()" title="Save itinerary changes and notes">
                            <i data-lucide="save"></i> Save Tour
                        </button>
                    </div>
                </header>

                <!-- Split Layout: Itinerary on Left, Interactive Map on Right -->
                <div class="tour-split-grid">
                    <!-- Left Panel: Tour Stops & Timeline -->
                    <div class="tour-left-panel">
                        <!-- KPI Metric Strip -->
                        <div class="tour-kpi-strip">
                            <div class="tour-kpi-chip">
                                <span class="kpi-num">${totalHomes}</span>
                                <span class="kpi-tag">${totalHomes === 1 ? 'Home' : 'Homes'}</span>
                            </div>
                            <div class="tour-kpi-chip">
                                <span class="kpi-num">${totalDuration}</span>
                                <span class="kpi-tag">Total Trip</span>
                            </div>
                            <div class="tour-kpi-chip">
                                <span class="kpi-num">${totalMiles}</span>
                                <span class="kpi-tag">${totalDriveMins}</span>
                            </div>
                            <div class="tour-kpi-chip">
                                <span class="kpi-num">${finalArrival}</span>
                                <span class="kpi-tag">${settings.loop_back ? 'Return Home' : 'End Tour'}</span>
                            </div>
                        </div>

                        <!-- Quick Add Bar -->
                        <div class="tour-add-bar">
                            <div class="tour-add-input-wrapper">
                                <select id="tour-quick-add-select" class="select-input tour-add-select">
                                    <option value="">+ Add property from saved favorites / search...</option>
                                    ${this.buildAddSuggestionsOptions()}
                                </select>
                                <button type="button" class="btn btn-secondary btn-compact" onclick="window.tourViewManager.handleAddSelectedProperty()">Add to Tour</button>
                            </div>
                        </div>

                        <!-- Availability Exceptions Tray (if any properties couldn't be scheduled) -->
                        <div class="tour-exceptions-container ${exceptions.length > 0 ? 'has-exceptions' : 'is-empty'}">
                            <div class="tour-exceptions-header" onclick="window.tourViewManager.toggleExceptionsTray()">
                                <div class="exceptions-title">
                                    <i data-lucide="alert-triangle"></i>
                                    <span>Showing Exceptions &amp; Rescheduled Homes (${exceptions.length})</span>
                                </div>
                                <span class="exceptions-toggle-icon"><i data-lucide="chevron-down"></i></span>
                            </div>
                            <div class="tour-exceptions-list" id="tour-exceptions-list" style="${exceptions.length > 0 ? 'display:block;' : 'display:none;'}">
                                ${this.renderExceptionsList(exceptions)}
                            </div>
                        </div>

                        <!-- Active Itinerary Timeline -->
                        <div class="tour-timeline" id="tour-timeline-container">
                            ${this.renderTimeline(stops, scheduleMatrix)}
                        </div>
                    </div>

                    <!-- Right Panel: Interactive Route Map -->
                    <div class="tour-right-panel">
                        <div id="tour-map-element" class="tour-map-canvas"></div>
                        <div class="tour-map-legend">
                            <div class="legend-item"><span class="legend-badge legend-start">START</span> Base Location</div>
                            <div class="legend-item"><span class="legend-badge legend-stop">#</span> Active Stop</div>
                            <div class="legend-item"><span class="legend-badge legend-toured">✓</span> Toured</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Exception / Reason Modal -->
            <div class="modal-overlay" id="modal-stop-status-reason">
                <div class="modal-content tour-reason-modal-content">
                    <div class="drawer-header">
                        <h3 id="reason-modal-title"><i data-lucide="message-square"></i> Showing Status Note</h3>
                        <button class="modal-close" onclick="window.tourViewManager.closeReasonModal()"><i data-lucide="x"></i></button>
                    </div>
                    <div class="p-4">
                        <p class="text-xs text-muted mb-3" id="reason-modal-prompt">Provide a reason note so both buyer and realtor know why this property cannot be shown or was changed.</p>
                        <div class="quick-reasons-chips mb-3">
                            <button type="button" class="chip-reason" onclick="window.tourViewManager.fillReasonPrompt('Seller agent unavailable / showing denied')">Agent Denied</button>
                            <button type="button" class="chip-reason" onclick="window.tourViewManager.fillReasonPrompt('Tenant occupied - 24hr notice required')">Tenant Occupied</button>
                            <button type="button" class="chip-reason" onclick="window.tourViewManager.fillReasonPrompt('Under contract / Backup offers only')">Under Contract</button>
                            <button type="button" class="chip-reason" onclick="window.tourViewManager.fillReasonPrompt('Rescheduling for a future tour date')">Rescheduling</button>
                        </div>
                        <textarea id="tour-reason-input" class="input-text tour-reason-textarea" rows="3" placeholder="e.g. Seller agent cannot show until Saturday afternoon; moved to rescheduled list."></textarea>
                        <div class="flex justify-end gap-2 mt-4">
                            <button type="button" class="btn btn-secondary" onclick="window.tourViewManager.closeReasonModal()">Cancel</button>
                            <button type="button" class="btn btn-primary" id="btn-save-reason" onclick="window.tourViewManager.confirmReasonSave()">Save Status & Note</button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        if (window.lucide) window.lucide.createIcons();
    }

    /**
     * Builds options for the "+ Add property to tour" dropdown.
     */
    buildAddSuggestionsOptions() {
        const activeMls = new Set(this.tourData.stops.map(s => String(s.mls_id)));
        const candidates = [];

        // Add from current user/client favorites & possibilities in state
        (state.allProperties || []).forEach(p => {
            if (!activeMls.has(String(p.mls_id))) {
                if (p.favorite || p.possibility) {
                    candidates.push(p);
                }
            }
        });

        // Add from backend suggestions if any
        (this.tourData.suggestions || []).forEach(s => {
            if (!activeMls.has(String(s.mls_id)) && !candidates.some(c => String(c.mls_id) === String(s.mls_id))) {
                candidates.push(s);
            }
        });

        if (candidates.length === 0) {
            return '<option disabled>No additional favorites found to add</option>';
        }

        return candidates.map(p => {
            const addr = cleanDisplayAddress(p.address, p.mls_id);
            const price = p.price ? `$${Number(p.price).toLocaleString()}` : '';
            const statusTag = p.favorite ? '★ Favorite' : 'Possibility';
            return `<option value="${p.mls_id}">${escapeHtml(addr)} (${price}) - ${statusTag}</option>`;
        }).join('');
    }

    /**
     * Render the active chronological stops timeline.
     */
    renderTimeline(stops, scheduleMatrix) {
        if (!stops || stops.length === 0) {
            return `
                <div class="tour-empty-timeline text-center p-8">
                    <div class="empty-icon text-3xl mb-2">🚗</div>
                    <h3 class="font-bold text-slate-200 mb-1">Your Tour Itinerary is Empty</h3>
                    <p class="text-xs text-muted mb-4 max-w-sm mx-auto">Add properties from your saved favorites or search above to build and optimize your viewing route.</p>
                </div>
            `;
        }

        const startAddr = this.tourData.settings.start_address || 'Starting Base';
        const startTimeStr = this.tourData.settings.start_time || '09:00 AM';

        let html = `
            <!-- Start Node -->
            <div class="timeline-node timeline-start-node">
                <div class="node-pin-wrapper">
                    <div class="node-pin pin-start"><i data-lucide="map-pin"></i></div>
                </div>
                <div class="node-card card-start">
                    <div class="card-start-header">
                        <span class="badge-start-pill">START / BASE</span>
                        <span class="start-time-text">Departs ${escapeHtml(startTimeStr)}</span>
                    </div>
                    <div class="start-address-text">${escapeHtml(startAddr)}</div>
                </div>
            </div>
        `;

        stops.forEach((stop, idx) => {
            const schedItem = scheduleMatrix?.orderedStops?.[idx];
            const arrTime = schedItem ? schedItem.formattedArrival : '--';
            const depTime = schedItem ? schedItem.formattedDeparture : '--';
            const driveMins = schedItem ? schedItem.legDriveMins : 10;
            const driveMiles = schedItem ? `${schedItem.legDistanceMiles} mi` : '';

            const isToured = Boolean(stop.toured);
            const tourNotes = stop.tour_notes || '';
            const status = stop.status || 'confirmed';

            // Leg connector pill
            html += `
                <div class="timeline-leg-connector">
                    <div class="leg-line"></div>
                    <div class="leg-pill">
                        <i data-lucide="car"></i>
                        <span class="leg-mins">${driveMins} min drive</span>
                        ${driveMiles ? `<span class="leg-miles">• ${driveMiles}</span>` : ''}
                    </div>
                </div>
            `;

            // Property Card Node
            const imgSrc = stop.main_image_url || NO_PHOTO_IMG;
            const dispAddr = cleanDisplayAddress(stop.address, stop.mls_id);
            const priceStr = stop.price ? `$${Number(stop.price).toLocaleString()}` : '$--';
            const specsStr = `${stop.beds || '?'} bd • ${stop.baths || '?'} ba • ${stop.sqft_finished ? Number(stop.sqft_finished).toLocaleString() + ' sqft' : ''}`;

            html += `
                <div class="timeline-node timeline-stop-node ${isToured ? 'is-toured' : ''}" data-mls="${stop.mls_id}" id="tour-stop-card-${stop.mls_id}">
                    <div class="node-pin-wrapper">
                        <div class="node-pin pin-stop ${isToured ? 'pin-toured' : ''}" onclick="window.tourViewManager.focusStopOnMap(${idx})">
                            ${isToured ? '<i data-lucide="check"></i>' : (idx + 1)}
                        </div>
                    </div>
                    <div class="node-card card-stop">
                        <div class="stop-card-main">
                            <!-- Drag & Reorder Controls -->
                            <div class="stop-reorder-col">
                                <button type="button" class="btn-reorder" onclick="window.tourViewManager.moveStop(${idx}, -1)" ${idx === 0 ? 'disabled' : ''} title="Move Earlier">▲</button>
                                <span class="stop-index-label">#${idx + 1}</span>
                                <button type="button" class="btn-reorder" onclick="window.tourViewManager.moveStop(${idx}, 1)" ${idx === stops.length - 1 ? 'disabled' : ''} title="Move Later">▼</button>
                            </div>

                            <!-- Property Thumbnail -->
                            <div class="stop-thumb-wrapper" onclick="window.openDetailModal('${stop.mls_id}')">
                                <img src="${escapeHtml(imgSrc)}" alt="${escapeHtml(dispAddr)}" class="stop-thumb" onerror="this.src='${NO_PHOTO_IMG}'">
                                ${isToured ? '<span class="stop-toured-chip">Toured</span>' : ''}
                            </div>

                            <!-- Stop Content -->
                            <div class="stop-info-col">
                                <div class="stop-header-row">
                                    <div class="stop-time-badge">
                                        <i data-lucide="clock"></i> ${arrTime} - ${depTime} (${schedItem?.stayMins || 20}m)
                                    </div>
                                    ${this.tourData.isRealtor ? `<div class="stop-status-select-wrap">
                                        <select class="select-input stop-status-select status-${status}" onchange="window.tourViewManager.handleStatusDropdownChange('${stop.mls_id}', this.value)">
                                            <option value="confirmed" ${status === 'confirmed' ? 'selected' : ''}>✓ Confirmed</option>
                                            <option value="pending" ${status === 'pending' ? 'selected' : ''}>⏳ Pending</option>
                                            <option value="unavailable" ${status === 'unavailable' ? 'selected' : ''}>⚠️ Can't Schedule</option>
                                            <option value="removed" ${status === 'removed' ? 'selected' : ''}>✕ Remove</option>
                                        </select>
                                    </div>` : `<span class="stop-status-chip status-${status}" title="${status === 'pending' ? 'Requested: waiting for your agent to schedule this showing' : 'Your agent confirmed this showing'}">${status === 'pending' ? '⏳ Requested' : '✓ Confirmed'}</span>`}
                                </div>

                                <div class="stop-title-row">
                                    <h4 class="stop-address-link" onclick="window.openDetailModal('${stop.mls_id}')" title="View Property Details">${escapeHtml(dispAddr)}</h4>
                                    <span class="stop-price">${priceStr}</span>
                                </div>
                                <div class="stop-specs-row text-xs text-muted">${specsStr}</div>

                                ${stop.status_reason ? `
                                    <div class="stop-reason-alert">
                                        <i data-lucide="info"></i>
                                        <span><strong>Showing Note:</strong> ${escapeHtml(stop.status_reason)}</span>
                                        ${this.tourData.isRealtor ? `<button type="button" class="btn-edit-reason" onclick="window.tourViewManager.openReasonModal('${stop.mls_id}', '${escapeHtml(stop.status_reason)}')">Edit</button>` : ''}
                                    </div>
                                ` : ''}

                                <!-- Bottom Row: Toured Checkbox, Notes Popover, Remove Button -->
                                <div class="stop-actions-row">
                                    <div class="stop-toured-action">
                                        <label class="card-toured-checkbox-label ${isToured ? 'is-toured' : ''}">
                                            <input type="checkbox" ${isToured ? 'checked' : ''} onchange="window.tourViewManager.toggleStopToured('${stop.mls_id}', this.checked)">
                                            <span class="checkbox-text"><i data-lucide="footprints"></i> ${isToured ? 'Toured' : 'Mark Toured'}</span>
                                        </label>
                                        <button type="button" class="btn-tour-notes-trigger ${tourNotes.trim() ? 'has-notes' : ''}" onclick="window.openTourNotesPopover('${stop.mls_id}', this, event)" title="View & edit shared tour notes">
                                            <i data-lucide="${tourNotes.trim() ? 'notebook-pen' : 'plus'}"></i>
                                            <span>${tourNotes.trim() ? 'Tour Notes' : 'Add Notes'}</span>
                                        </button>
                                    </div>
                                    <div class="stop-remove-action">
                                        <button type="button" class="btn-stop-remove" onclick="window.tourViewManager.removeStop('${stop.mls_id}')" title="Remove stop from itinerary">
                                            <i data-lucide="trash-2"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        });

        // Return Leg Node (if loop back enabled)
        if (this.tourData.settings.loop_back && scheduleMatrix?.returnLeg) {
            const ret = scheduleMatrix.returnLeg;
            html += `
                <div class="timeline-leg-connector">
                    <div class="leg-line"></div>
                    <div class="leg-pill">
                        <i data-lucide="car"></i>
                        <span class="leg-mins">${ret.legDriveMins} min return</span>
                        <span class="leg-miles">• ${ret.legDistanceMiles} mi</span>
                    </div>
                </div>
                <div class="timeline-node timeline-end-node">
                    <div class="node-pin-wrapper">
                        <div class="node-pin pin-end"><i data-lucide="check-check"></i></div>
                    </div>
                    <div class="node-card card-end">
                        <div class="card-start-header">
                            <span class="badge-end-pill">RETURN / HOME BASE</span>
                            <span class="start-time-text">Arrives ~${ret.formattedReturnTime}</span>
                        </div>
                        <div class="start-address-text">${escapeHtml(startAddr)}</div>
                    </div>
                </div>
            `;
        }

        return html;
    }

    /**
     * Renders the list of showing exceptions (homes that couldn't be scheduled).
     */
    renderExceptionsList(exceptions) {
        if (!exceptions || exceptions.length === 0) {
            return '<div class="p-3 text-xs text-muted text-center">No showing availability exceptions or cancelled stops.</div>';
        }

        return exceptions.map(ex => {
            const dispAddr = cleanDisplayAddress(ex.address, ex.mls_id);
            const price = ex.price ? `$${Number(ex.price).toLocaleString()}` : '';
            const reason = ex.status_reason || 'Showing could not be scheduled with listing agent.';

            return `
                <div class="exception-card">
                    <div class="exception-card-top">
                        <div class="exception-prop-info">
                            <strong class="exception-addr">${escapeHtml(dispAddr)}</strong>
                            <span class="exception-price">${price}</span>
                        </div>
                        <span class="exception-badge ${ex.status === 'unavailable' ? 'badge-unavailable' : 'badge-removed'}">
                            ${ex.status === 'unavailable' ? 'Unavailable' : 'Removed'}
                        </span>
                    </div>
                    <div class="exception-reason-box">
                        <i data-lucide="alert-circle"></i>
                        <span class="reason-text">${escapeHtml(reason)}</span>
                    </div>
                    <div class="exception-card-actions">
                        ${(this.tourData.isRealtor || ex.status === 'removed') ? `
                        <button type="button" class="btn btn-secondary btn-compact" onclick="window.tourViewManager.openReasonModal('${ex.mls_id}', '${escapeHtml(reason)}')">
                            <i data-lucide="edit-3"></i> Edit Note
                        </button>
                        <button type="button" class="btn btn-primary btn-compact" onclick="window.tourViewManager.restoreExceptionToTour('${ex.mls_id}')">
                            <i data-lucide="undo-2"></i> Restore to Tour
                        </button>` : ''}
                        <button type="button" class="btn btn-secondary btn-compact" onclick="window.tourViewManager.dismissException('${ex.mls_id}')" title="Take this home off the tour completely">
                            <i data-lucide="check"></i> ${ex.status === 'unavailable' && !this.tourData.isRealtor ? 'Got it, take it off my tour' : 'Dismiss'}
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    /**
     * Toggle the exceptions tray expansion.
     */
    toggleExceptionsTray() {
        const list = document.getElementById('tour-exceptions-list');
        if (!list) return;
        const isHidden = list.style.display === 'none';
        list.style.display = isHidden ? 'block' : 'none';
        const icon = document.querySelector('.exceptions-toggle-icon');
        if (icon) icon.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
    }

    /**
     * Initialize Leaflet interactive map instance for the tour view.
     */
    initMap() {
        const mapContainer = document.getElementById('tour-map-element');
        if (!mapContainer) return;

        if (this.map) {
            this.map.remove();
            this.map = null;
        }

        const defaultCenter = [39.5501, -104.7801]; // Denver / Colorado metro
        this.map = L.map('tour-map-element', {
            zoomControl: false,
            fadeAnimation: false,
            preferCanvas: true
        }).setView(defaultCenter, 11);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap'
        }).addTo(this.map);

        L.control.zoom({ position: 'topright' }).addTo(this.map);

        this.updateMapLayers();
    }

    /**
     * Update markers and OSRM route polyline on the Leaflet map.
     */
    updateMapLayers() {
        if (!this.map) return;

        // Clear existing markers & polyline
        this.markers.forEach(m => this.map.removeLayer(m));
        this.markers = [];
        if (this.routePolyline) {
            this.map.removeLayer(this.routePolyline);
            this.routePolyline = null;
        }

        const latLngBounds = [];
        const startPoint = {
            address: this.tourData.settings.start_address,
            lat: this.tourData.settings.start_lat,
            lng: this.tourData.settings.start_lng
        };

        // Add start pin
        if (startPoint.lat && startPoint.lng) {
            const startIcon = L.divIcon({
                className: 'tour-map-pin-container',
                html: `<div class="tour-pin-marker pin-start-marker">START</div>`,
                iconSize: [44, 28],
                iconAnchor: [22, 28]
            });

            const startMarker = L.marker([startPoint.lat, startPoint.lng], { icon: startIcon })
                .bindPopup(`<div class="tour-pin-popup font-bold text-emerald-400">Starting Base</div><div class="text-xs">${escapeHtml(startPoint.address)}</div>`)
                .addTo(this.map);

            this.markers.push(startMarker);
            latLngBounds.push([startPoint.lat, startPoint.lng]);
        }

        // Add stops pins
        this.tourData.stops.forEach((stop, idx) => {
            const lat = stop.lat || stop.latitude;
            const lng = stop.lng || stop.longitude;
            if (lat == null || lng == null) return;

            const isToured = Boolean(stop.toured);
            const schedItem = this.tourData.scheduleMatrix?.orderedStops?.[idx];
            const arrTime = schedItem ? schedItem.formattedArrival : '';

            const stopIcon = L.divIcon({
                className: 'tour-map-pin-container',
                html: `<div class="tour-pin-marker ${isToured ? 'pin-toured-marker' : 'pin-stop-marker'}">${isToured ? '✓' : (idx + 1)}</div>`,
                iconSize: [32, 32],
                iconAnchor: [16, 32]
            });

            const dispAddr = cleanDisplayAddress(stop.address, stop.mls_id);
            const price = stop.price ? `$${Number(stop.price).toLocaleString()}` : '';

            const marker = L.marker([lat, lng], { icon: stopIcon })
                .bindPopup(`
                    <div class="tour-pin-popup">
                        <div class="font-bold text-sky-400">Stop #${idx + 1}${arrTime ? ` • ${arrTime}` : ''}</div>
                        <div class="text-xs font-semibold text-slate-100">${escapeHtml(dispAddr)}</div>
                        <div class="text-xs text-amber-300 font-bold">${price}</div>
                        ${isToured ? '<div class="text-[10px] text-emerald-400 font-bold mt-1">✓ Marked Toured</div>' : ''}
                    </div>
                `)
                .addTo(this.map);

            marker.on('click', () => {
                const card = document.getElementById(`tour-stop-card-${stop.mls_id}`);
                if (card) {
                    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    card.classList.add('highlight-pulse');
                    setTimeout(() => card.classList.remove('highlight-pulse'), 1500);
                }
            });

            this.markers.push(marker);
            latLngBounds.push([lat, lng]);
        });

        // Draw route polyline
        if (this.tourData.scheduleMatrix?.roadGeometry && this.tourData.scheduleMatrix.roadGeometry.length > 0) {
            this.routePolyline = L.polyline(this.tourData.scheduleMatrix.roadGeometry, {
                color: '#38bdf8',
                weight: 5,
                opacity: 0.85,
                lineJoin: 'round',
                dashArray: null
            }).addTo(this.map);
        } else if (latLngBounds.length > 1) {
            // Direct lines fallback
            const polyCoords = [...latLngBounds];
            if (this.tourData.settings.loop_back && latLngBounds.length > 2) {
                polyCoords.push(latLngBounds[0]);
            }
            this.routePolyline = L.polyline(polyCoords, {
                color: '#38bdf8',
                weight: 3,
                dashArray: '6, 8',
                opacity: 0.7
            }).addTo(this.map);
        }

        // Fit map bounds
        if (latLngBounds.length > 0) {
            this.map.fitBounds(latLngBounds, { padding: [50, 50], maxZoom: 15 });
        }
    }

    /**
     * Pan map to specific stop and open its popup.
     */
    focusStopOnMap(stopIndex) {
        if (!this.map || !this.markers[stopIndex + 1]) return;
        const marker = this.markers[stopIndex + 1];
        this.map.panTo(marker.getLatLng(), { animate: true });
        marker.openPopup();
    }

    /**
     * Start source toggled (client home vs realtor office vs custom).
     */
    setStartSource(source) {
        this.tourData.settings.start_source = source;
        const input = document.getElementById('tour-start-address-input');

        if (source === 'my_home') {
            this.tourData.settings.start_address = this.tourData.myHomeAddress || '';
        } else if (source === 'office') {
            this.tourData.settings.start_address = this.tourData.realtorOfficeAddress || '';
        }

        if (input) {
            input.value = this.tourData.settings.start_address;
            input.readOnly = (source !== 'custom');
            input.classList.toggle('readonly', source !== 'custom');
        }

        document.querySelectorAll('.tour-start-toggle-btn').forEach(btn => {
            const isMatch = (source === 'my_home' && btn.textContent.includes('Home')) ||
                (source === 'office' && btn.textContent.includes('Office')) ||
                (source === 'custom' && btn.textContent.includes('Custom'));
            btn.classList.toggle('active', isMatch);
        });

        // Re-geocode start location
        routeOptimizer.geocodeAddress(this.tourData.settings.start_address).then(geo => {
            if (geo) {
                this.tourData.settings.start_lat = geo.lat;
                this.tourData.settings.start_lng = geo.lng;
            }
            this.refreshTimelineAndMap();
        });
    }

    /**
     * Start address text changed.
     */
    async handleStartAddressChange(val) {
        this.tourData.settings.start_address = val.trim();
        const geo = await routeOptimizer.geocodeAddress(this.tourData.settings.start_address);
        if (geo) {
            this.tourData.settings.start_lat = geo.lat;
            this.tourData.settings.start_lng = geo.lng;
        }
        this.refreshTimelineAndMap();
    }

    handleTourDateChange(val) {
        this.tourData.settings.tour_date = /^\d{4}-\d{2}-\d{2}$/.test(val) ? val : '';
        this.refreshTimelineAndMap();
    }

    handleStartTimeChange(val) {
        this.tourData.settings.start_time = val;
        this.refreshTimelineAndMap();
    }

    handleStayDurationChange(val) {
        this.tourData.settings.stay_duration_mins = parseInt(val, 10) || 20;
        this.refreshTimelineAndMap();
    }

    handleLoopBackChange(isChecked) {
        this.tourData.settings.loop_back = isChecked ? 1 : 0;
        this.refreshTimelineAndMap();
    }

    async handleClientChange(clientId) {
        await this.flushAutosave();
        localStorage.setItem('active_tour_client_id', clientId);
        await this.initTourView(clientId);
        showToast('Switched client tour', 'info');
    }

    /**
     * Move a stop earlier or later in the list.
     */
    async moveStop(index, delta) {
        const newIndex = index + delta;
        if (newIndex < 0 || newIndex >= this.tourData.stops.length) return;

        const stop = this.tourData.stops.splice(index, 1)[0];
        this.tourData.stops.splice(newIndex, 0, stop);

        await this.refreshTimelineAndMap();
    }

    /**
     * Run 2-Opt TSP Route Optimizer.
     */
    async optimizeTourOrder() {
        if (!this.tourData.stops || this.tourData.stops.length <= 1) {
            showToast('Add at least 2 properties to optimize route', 'info');
            return;
        }

        const btn = document.getElementById('btn-tour-optimize');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader-2" class="animate-spin"></i> Optimizing...';
        }

        const startPoint = {
            address: this.tourData.settings.start_address,
            lat: this.tourData.settings.start_lat,
            lng: this.tourData.settings.start_lng
        };

        const optimized = routeOptimizer.optimizeRoute(
            startPoint,
            this.tourData.stops,
            Boolean(this.tourData.settings.loop_back)
        );

        this.tourData.stops = optimized;
        await this.refreshTimelineAndMap();

        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="zap"></i> Optimize Route';
            if (window.lucide) window.lucide.createIcons();
        }

        showToast('Route optimized for minimum driving distance!', 'success');
    }

    /**
     * Recalculate schedule and re-render the timeline and map.
     */
    async refreshTimelineAndMap() {
        await this.calculateSchedule(true);

        const timelineContainer = document.getElementById('tour-timeline-container');
        if (timelineContainer) {
            timelineContainer.innerHTML = this.renderTimeline(this.tourData.stops, this.tourData.scheduleMatrix);
        }

        // Update KPI strip
        const totalHomes = this.tourData.stops.length;
        const totalDuration = this.tourData.scheduleMatrix?.formattedTotalDuration || '--';
        const totalMiles = this.tourData.scheduleMatrix ? `${this.tourData.scheduleMatrix.totalDistanceMiles} mi` : '--';
        const totalDriveMins = this.tourData.scheduleMatrix ? `${this.tourData.scheduleMatrix.totalDriveMins} mins drive` : '--';
        const finalArrival = this.tourData.scheduleMatrix?.returnLeg ? this.tourData.scheduleMatrix.returnLeg.formattedReturnTime : (this.tourData.scheduleMatrix?.orderedStops?.length ? this.tourData.scheduleMatrix.orderedStops[this.tourData.scheduleMatrix.orderedStops.length - 1].formattedDeparture : '--');

        const kpis = document.querySelectorAll('.tour-kpi-chip .kpi-num');
        if (kpis && kpis.length >= 4) {
            kpis[0].textContent = totalHomes;
            kpis[1].textContent = totalDuration;
            kpis[2].textContent = totalMiles;
            kpis[3].textContent = finalArrival;
        }

        if (window.lucide) window.lucide.createIcons();
        this.scheduleAutosave();
    }

    /** True when the saved stop windows (used by the agent's schedule) differ from what's computed now. */
    plannedTimesStale() {
        const pad = n => String(n).padStart(2, '0');
        const local = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        const hasDate = /^\d{4}-\d{2}-\d{2}$/.test(this.tourData.settings.tour_date || '');
        const computed = new Map();
        if (hasDate) (this.tourData.scheduleMatrix?.orderedStops || []).forEach(o => {
            if (o?.stopData && o.arrivalTime instanceof Date) computed.set(String(o.stopData.mls_id), local(o.arrivalTime));
        });
        return this.tourData.stops.some(s => String(s.planned_start || '') !== (computed.get(String(s.mls_id)) || ''));
    }

    /** Called after every edit: save shortly after the user stops changing things. */
    scheduleAutosave() {
        this.dirty = true;
        this.setSaveState('pending');
        clearTimeout(this.autosaveTimer);
        this.autosaveTimer = setTimeout(() => this.saveTourItinerary({ quiet: true }), 1200);
    }

    /** Save now if anything is waiting (before switching clients). */
    async flushAutosave() {
        clearTimeout(this.autosaveTimer);
        if (this.dirty) await this.saveTourItinerary({ quiet: true });
    }

    /** Reflects save progress on the Save button: pending | saving | saved | error. */
    setSaveState(stateName) {
        const btn = document.getElementById('btn-tour-save');
        if (!btn) return;
        const label = { pending: ['save', 'Save Tour'], saving: ['loader-2', 'Saving…'], saved: ['check', 'Saved'], error: ['alert-triangle', 'Retry Save'] }[stateName] || ['save', 'Save Tour'];
        btn.disabled = stateName === 'saving';
        btn.dataset.saveState = stateName;
        btn.innerHTML = `<i data-lucide="${label[0]}" class="${stateName === 'saving' ? 'animate-spin' : ''}"></i> ${label[1]}`;
        if (window.lucide) window.lucide.createIcons();
    }

    /**
     * Add selected property from quick-add dropdown.
     */
    async handleAddSelectedProperty() {
        const select = document.getElementById('tour-quick-add-select');
        if (!select || !select.value) return;

        const mlsId = select.value;
        const found = (state.allProperties || []).find(p => String(p.mls_id) === String(mlsId)) ||
            (this.tourData.suggestions || []).find(s => String(s.mls_id) === String(mlsId));

        if (!found) {
            showToast('Property not found', 'error');
            return;
        }

        // Add to stops
        this.tourData.stops.push({
            mls_id: found.mls_id,
            address: found.address,
            city: found.city,
            state: found.state,
            zip: found.zip,
            price: found.price,
            beds: found.beds,
            baths: found.baths,
            sqft_finished: found.sqft_finished,
            main_image_url: found.main_image_url,
            latitude: found.latitude,
            longitude: found.longitude,
            status: 'confirmed',
            status_reason: '',
            duration_mins: this.tourData.settings.stay_duration_mins || 20,
            toured: found.toured || 0,
            tour_notes: found.tour_notes || ''
        });

        // Re-populate dropdown
        select.innerHTML = `<option value="">+ Add property from saved favorites / search...</option>${this.buildAddSuggestionsOptions()}`;

        await this.refreshTimelineAndMap();
        showToast(`Added ${cleanDisplayAddress(found.address, found.mls_id)} to tour`, 'success');
    }

    /**
     * Remove a stop from the active itinerary.
     */
    async removeStop(mlsId) {
        const idx = this.tourData.stops.findIndex(s => String(s.mls_id) === String(mlsId));
        if (idx !== -1) {
            const removed = this.tourData.stops.splice(idx, 1)[0];
            await this.refreshTimelineAndMap();

            // Re-populate add dropdown
            const select = document.getElementById('tour-quick-add-select');
            if (select) {
                select.innerHTML = `<option value="">+ Add property from saved favorites / search...</option>${this.buildAddSuggestionsOptions()}`;
            }

            showToast(`Removed from tour`, 'info');
        }
    }

    /**
     * Toggle "Toured" status inline on a tour stop.
     */
    async toggleStopToured(mlsId, isChecked) {
        const stop = this.tourData.stops.find(s => String(s.mls_id) === String(mlsId));
        if (stop) {
            stop.toured = isChecked ? 1 : 0;
            if (isChecked && !stop.toured_at) stop.toured_at = new Date().toISOString();
            if (!isChecked) stop.toured_at = null;
        }

        // Sync with global state
        const p = (state.allProperties || []).find(item => String(item.mls_id) === String(mlsId));
        if (p) {
            p.toured = isChecked ? 1 : 0;
            p.toured_at = stop?.toured_at || null;
        }

        try {
            // Recorded on the tour's client, even when their realtor is the one marking it.
            const res = await apiFetch(CONFIG.API_URL + '?action=set_tour_stop_toured', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ client_id: this.tourData.clientId, mls_id: mlsId, toured: isChecked ? 1 : 0 })
            });
            if (!res || !res.success) throw new Error(res?.error || 'Save failed');
            if (stop) stop.toured_at = res.toured_at;

            // Update DOM card
            const card = document.getElementById(`tour-stop-card-${mlsId}`);
            if (card) {
                card.classList.toggle('is-toured', isChecked);
                const pin = card.querySelector('.node-pin');
                if (pin) pin.classList.toggle('pin-toured', isChecked);
                const label = card.querySelector('.card-toured-checkbox-label');
                if (label) {
                    label.classList.toggle('is-toured', isChecked);
                    label.querySelector('.checkbox-text').innerHTML = `<i data-lucide="footprints"></i> ${isChecked ? 'Toured' : 'Mark Toured'}`;
                }
            }

            this.updateMapLayers();
            if (window.lucide) window.lucide.createIcons();
            showToast(isChecked ? 'Marked as Toured' : 'Unmarked as toured', 'info');
        } catch (e) {
            showToast('Failed to save toured status', 'error');
        }
    }

    /**
     * Handle status dropdown change on a stop card (confirmed, pending, unavailable, removed).
     */
    handleStatusDropdownChange(mlsId, newStatus) {
        if (newStatus === 'unavailable' || newStatus === 'removed') {
            this.openReasonModal(mlsId, '', newStatus);
        } else {
            const stop = this.tourData.stops.find(s => String(s.mls_id) === String(mlsId));
            if (stop) {
                stop.status = newStatus;
                this.refreshTimelineAndMap();
            }
        }
    }

    /**
     * Modal for entering/editing showing availability reason notes.
     */
    openReasonModal(mlsId, existingReason = '', targetStatus = 'unavailable') {
        this.activeReasonMlsId = mlsId;
        this.activeReasonTargetStatus = targetStatus;

        const modal = document.getElementById('modal-stop-status-reason');
        const input = document.getElementById('tour-reason-input');
        const title = document.getElementById('reason-modal-title');

        if (title) {
            title.innerHTML = targetStatus === 'removed'
                ? '<i data-lucide="trash-2"></i> Removal Reason'
                : '<i data-lucide="alert-triangle"></i> Showing Availability Note';
        }

        if (input) {
            input.value = existingReason || '';
        }

        if (modal) {
            modal.classList.add('active');
            setTimeout(() => input && input.focus(), 100);
        }
        if (window.lucide) window.lucide.createIcons();
    }

    closeReasonModal() {
        const modal = document.getElementById('modal-stop-status-reason');
        if (modal) modal.classList.remove('active');
        this.activeReasonMlsId = null;
    }

    fillReasonPrompt(text) {
        const input = document.getElementById('tour-reason-input');
        if (input) input.value = text;
    }

    /**
     * Confirm reason save: moves property to exceptions tray if unavailable/removed.
     */
    async confirmReasonSave() {
        if (!this.activeReasonMlsId) return;
        const mlsId = this.activeReasonMlsId;
        const input = document.getElementById('tour-reason-input');
        const reason = input ? input.value.trim() : '';
        const status = this.activeReasonTargetStatus || 'unavailable';

        // Check if in active stops
        const stopIdx = this.tourData.stops.findIndex(s => String(s.mls_id) === String(mlsId));
        if (stopIdx !== -1) {
            const stop = this.tourData.stops[stopIdx];
            stop.status = status;
            stop.status_reason = reason;

            if (status === 'unavailable' || status === 'removed') {
                // Move from active stops to exceptions tray
                this.tourData.stops.splice(stopIdx, 1);
                this.tourData.exceptions.unshift(stop);
            }
        } else {
            // In exceptions tray already
            const ex = this.tourData.exceptions.find(e => String(e.mls_id) === String(mlsId));
            if (ex) {
                ex.status = status;
                ex.status_reason = reason;
            }
        }

        this.closeReasonModal();

        // Update backend
        try {
            await apiFetch(CONFIG.API_URL + '?action=update_tour_stop_status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client_id: this.tourData.clientId,
                    mls_id: mlsId,
                    status,
                    status_reason: reason
                })
            });
        } catch (e) {
            console.warn('[TourView] Status update error:', e);
        }

        // Re-render
        this.renderExceptionsTray();
        await this.refreshTimelineAndMap();
        showToast('Showing note saved & itinerary updated', 'info');
    }

    /**
     * Re-renders just the exceptions container.
     */
    renderExceptionsTray() {
        const container = document.querySelector('.tour-exceptions-container');
        const list = document.getElementById('tour-exceptions-list');
        const titleSpan = document.querySelector('.exceptions-title span');

        if (container) {
            container.className = `tour-exceptions-container ${this.tourData.exceptions.length > 0 ? 'has-exceptions' : 'is-empty'}`;
        }
        if (titleSpan) {
            titleSpan.textContent = `Showing Exceptions & Rescheduled Homes (${this.tourData.exceptions.length})`;
        }
        if (list) {
            list.innerHTML = this.renderExceptionsList(this.tourData.exceptions);
        }
        if (window.lucide) window.lucide.createIcons();
    }

    /**
     * Take an exception (can't schedule / removed) off the tour for good. The next save sends the
     * tour without it, and the server's replace_all drops it.
     */
    async dismissException(mlsId) {
        const exIdx = this.tourData.exceptions.findIndex(e => String(e.mls_id) === String(mlsId));
        if (exIdx === -1) return;
        const [gone] = this.tourData.exceptions.splice(exIdx, 1);
        this.renderExceptionsTray();
        await this.saveTourItinerary({ quiet: true });
        showToast(`${cleanDisplayAddress(gone.address, gone.mls_id)} is off the tour.`, 'success');
    }

    /**
     * Restore a showing exception back into active tour stops.
     */
    async restoreExceptionToTour(mlsId) {
        const exIdx = this.tourData.exceptions.findIndex(e => String(e.mls_id) === String(mlsId));
        if (exIdx === -1) return;

        const restored = this.tourData.exceptions.splice(exIdx, 1)[0];
        // A client's restore comes back Pending; the agent confirms the showing.
        const newStatus = this.tourData.isRealtor ? 'confirmed' : 'pending';
        restored.status = newStatus;
        this.tourData.stops.push(restored);

        try {
            await apiFetch(CONFIG.API_URL + '?action=update_tour_stop_status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client_id: this.tourData.clientId,
                    mls_id: mlsId,
                    status: newStatus
                })
            });
        } catch (e) {
            console.warn('[TourView] Restore error:', e);
        }

        this.renderExceptionsTray();
        await this.refreshTimelineAndMap();
        showToast(`Restored ${cleanDisplayAddress(restored.address, restored.mls_id)} to tour!`, 'success');
    }

    /**
     * Save the entire tour itinerary and settings to backend.
     */
    async saveTourItinerary({ quiet = false } = {}) {
        clearTimeout(this.autosaveTimer);
        if (this.isSaving) { this.saveAgain = true; return; }
        this.isSaving = true;
        this.dirty = false;
        this.setSaveState('saving');
        let ok = false;

        try {
            // Each stop's computed window on the tour date feeds the agent's schedule. No date set
            // means no window (the planner's "today" default isn't a real appointment).
            const pad = n => String(n).padStart(2, '0');
            const local = d => (d instanceof Date && !Number.isNaN(d.getTime()))
                ? `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}` : '';
            const hasDate = /^\d{4}-\d{2}-\d{2}$/.test(this.tourData.settings.tour_date || '');
            const windows = new Map();
            if (hasDate) {
                (this.tourData.scheduleMatrix?.orderedStops || []).forEach(o => {
                    if (o?.stopData) windows.set(String(o.stopData.mls_id), [local(o.arrivalTime), local(o.departureTime)]);
                });
            }
            const payloadStops = [
                ...this.tourData.stops.map((s, idx) => ({
                    planned_start: windows.get(String(s.mls_id))?.[0] || '',
                    planned_end: windows.get(String(s.mls_id))?.[1] || '',
                    mls_id: s.mls_id,
                    sort_order: idx,
                    status: s.status || 'confirmed',
                    status_reason: s.status_reason || '',
                    duration_mins: s.duration_mins || this.tourData.settings.stay_duration_mins,
                    showing_time: s.showing_time || '',
                    access_notes: s.access_notes || ''
                })),
                ...this.tourData.exceptions.map((e, idx) => ({
                    planned_start: '',
                    planned_end: '',
                    mls_id: e.mls_id,
                    sort_order: 900 + idx,
                    status: e.status,
                    status_reason: e.status_reason || '',
                    duration_mins: e.duration_mins || this.tourData.settings.stay_duration_mins,
                    showing_time: e.showing_time || '',
                    access_notes: e.access_notes || ''
                }))
            ];

            const res = await apiFetch(CONFIG.API_URL + '?action=save_tour_itinerary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    client_id: this.tourData.clientId,
                    replace_all: 1,
                    settings: this.tourData.settings,
                    stops: payloadStops
                })
            });

            if (res && res.success) {
                ok = true;
                if (!quiet) showToast('Tour saved', 'success');
            } else {
                throw new Error(res?.error || 'Failed to save');
            }
        } catch (e) {
            console.error('[TourView] Save error:', e);
            this.dirty = true;
            showToast('Unable to save the tour. Your changes are still here; try Save again.', 'error');
        } finally {
            this.isSaving = false;
            this.setSaveState(ok && !this.dirty ? 'saved' : (ok ? 'pending' : 'error'));
            if (this.saveAgain) { this.saveAgain = false; this.scheduleAutosave(); }
        }
    }

    /**
     * Open multi-stop route in Google Maps.
     */
    openGoogleMapsRoute() {
        if (!this.tourData.stops || this.tourData.stops.length === 0) {
            showToast('No properties in tour to map', 'info');
            return;
        }

        const url = routeOptimizer.buildGoogleMapsMultiStopUrl(
            this.tourData.settings.start_address,
            this.tourData.stops,
            Boolean(this.tourData.settings.loop_back)
        );

        window.open(url, '_blank');
    }

    /**
     * Export schedule as an .ics calendar file.
     */
    exportCalendarICS() {
        if (!this.tourData.stops || this.tourData.stops.length === 0) {
            showToast('No properties in tour to export', 'info');
            return;
        }

        const tourTitle = `${this.tourData.clientName || 'Client'} Home Tour`;
        const success = routeOptimizer.downloadICS(
            tourTitle,
            this.tourData.scheduleMatrix,
            this.tourData.settings.start_address
        );

        if (success) {
            showToast('Downloaded .ics calendar file!', 'success');
        } else {
            showToast('Failed to generate calendar file', 'error');
        }
    }

    /**
     * Print tour dossier report.
     */
    printTourDossier() {
        window.print();
    }
}

export const tourViewManager = new TourViewManager();
if (typeof window !== 'undefined') {
    window.tourViewManager = tourViewManager;
}
