/**
 * Homeward Route Preview Module
 * Renders a top-down visual route preview timeline with house photos,
 * addresses, expected arrival/departure schedule times, and drive metrics.
 */
class RoutePreviewManager {
  constructor() {
    this.modalId = 'route-preview-modal';
  }

  async openPreview(tourData, scheduleData) {
    const modal = document.getElementById(this.modalId);
    const content = document.getElementById('route-preview-content');
    if (!modal || !content) return;

    modal.classList.remove('hidden');

    if (!tourData || !tourData.stops || tourData.stops.length === 0) {
      this.renderEmptyState(content);
      return;
    }

    // Compute or fall back schedule data if needed
    let sched = scheduleData;
    if (!sched && window.optimizer && tourData.startAddress) {
      try {
        const startGeo = await window.geocoder.geocodeAddress(tourData.startAddress);
        if (startGeo) {
          sched = await window.optimizer.computeScheduleMatrixAsync(
            startGeo,
            tourData.stops,
            tourData.loopBack !== false,
            tourData.stayDurationMins || 20
          );
        }
      } catch (e) {
        console.warn('Could not calculate schedule matrix for preview:', e);
      }
    }

    this.renderTimeline(content, tourData, sched);
  }

  closePreview() {
    const modal = document.getElementById(this.modalId);
    if (modal) modal.classList.add('hidden');
  }

  renderEmptyState(container) {
    container.innerHTML = `
      <div class="text-center py-12 px-4 max-w-md mx-auto">
        <div class="w-16 h-16 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 text-3xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-sky-500/10">
          🗺️
        </div>
        <h3 class="text-lg font-bold text-slate-100 mb-1">No Homes in Tour Yet</h3>
        <p class="text-xs text-slate-400 leading-relaxed mb-6">
          Add Redfin listing URLs, load a sample tour, or click on the map to add homes. Once added, you can preview the full route in chronological order with house pictures, addresses, and expected inspection times.
        </p>
        <div class="flex items-center justify-center gap-3">
          <button type="button" onclick="window.routePreviewManager.closePreview(); if(window.homewardApp) window.homewardApp.loadSampleData();" class="px-4 py-2 rounded-xl bg-gradient-to-r from-sky-500 to-emerald-500 hover:from-sky-400 hover:to-emerald-400 text-slate-950 font-extrabold text-xs shadow-md transition-all">
            ✨ Load Sample Tour & Preview
          </button>
        </div>
      </div>
    `;
  }

  renderTimeline(container, tourData, sched) {
    const stops = tourData.stops;
    const preferences = tourData.preferences || {};
    const startAddr = tourData.startAddress || 'Starting Base';
    const loopBack = tourData.loopBack !== false;
    const stayMins = tourData.stayDurationMins || 20;

    // Total metrics header bar
    const totalStops = stops.length;
    const totalDist = sched && sched.totalDistanceMiles !== undefined ? `${sched.totalDistanceMiles} mi` : 'N/A';
    const totalTime = sched && sched.formattedTotalDuration ? sched.formattedTotalDuration : `${(stops.length * stayMins) + 30} mins est`;

    let html = `
      <!-- Summary Header Bar -->
      <div class="bg-slate-950/80 border border-slate-800 rounded-2xl p-4 mb-6 shadow-md flex flex-wrap items-center justify-between gap-4">
        <div>
          <span class="text-[10px] font-bold text-sky-400 uppercase tracking-widest block mb-0.5">Top-Down Viewing Order</span>
          <h2 class="text-lg font-bold text-slate-100">${tourData.tourName || 'Home Viewing Tour'}</h2>
          <p class="text-xs text-slate-400">Starting from: <span class="text-slate-200 font-medium">${startAddr}</span></p>
        </div>
        <div class="flex flex-wrap items-center gap-2.5 text-xs">
          <div class="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 flex items-center gap-1.5">
            <span class="text-sky-400 font-bold">🏠 ${totalStops}</span> ${totalStops === 1 ? 'Stop' : 'Stops'}
          </div>
          <div class="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 flex items-center gap-1.5">
            <span class="text-amber-400 font-bold">⏱️ ${totalTime}</span> Total
          </div>
          <div class="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 flex items-center gap-1.5">
            <span class="text-emerald-400 font-bold">🚗 ${totalDist}</span>
          </div>
        </div>
      </div>

      <!-- Top-Down Vertical Timeline Flow Container -->
      <div class="relative pl-4 sm:pl-8 space-y-6 before:absolute before:left-5 sm:before:left-9 before:top-4 before:bottom-4 before:w-0.5 before:bg-gradient-to-b before:from-emerald-500 before:via-sky-500 before:to-rose-500">
    `;

    // 1. START NODE
    html += `
      <!-- Start Node -->
      <div class="relative flex items-start gap-4 group">
        <div class="w-8 h-8 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center flex-shrink-0 z-10 shadow-lg shadow-emerald-500/30 ring-4 ring-slate-900">
          <svg class="w-4 h-4 fill-slate-950" viewBox="0 0 24 24"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
        </div>
        <div class="bg-slate-950/90 border border-emerald-500/40 rounded-xl p-3.5 flex-1 shadow-md">
          <div class="flex items-center justify-between gap-2 flex-wrap mb-1">
            <span class="px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-400 text-[10px] font-bold uppercase tracking-wider">START / HOME BASE</span>
            <span class="text-xs font-mono font-bold text-emerald-300">Departs 9:00 AM</span>
          </div>
          <div class="text-xs font-semibold text-slate-200">${startAddr}</div>
        </div>
      </div>
    `;

    // 2. STOPS & DRIVE CONNECTORS
    stops.forEach((stop, idx) => {
      const schedItem = sched && sched.orderedStops ? sched.orderedStops[idx] : null;
      const arrTime = schedItem ? schedItem.formattedArrival : '9:15 AM';
      const depTime = schedItem ? schedItem.formattedDeparture : '9:35 AM';
      
      const driveMins = schedItem ? (schedItem.legDriveMins !== undefined ? schedItem.legDriveMins : (schedItem.driveMinsFromPrev || 15)) : (idx === 0 ? 10 : 15);
      const driveMilesNum = schedItem ? (schedItem.legDistanceMiles !== undefined ? schedItem.legDistanceMiles : schedItem.distanceMilesFromPrev) : null;
      const driveMiles = driveMilesNum ? `${driveMilesNum} mi` : '';
      
      const matchRes = window.propertyScorer ? window.propertyScorer.calculateMatchScore(stop, preferences) : { scorePct: 100 };
      const badgeColor = matchRes.scorePct >= 80 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : (matchRes.scorePct >= 50 ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-rose-500/20 text-rose-400 border-rose-500/30');

      const photoUrl = stop.photoUrl || (stop.photoUrls && stop.photoUrls[0]);
      const providerLabel = window.propertyLinks ? window.propertyLinks.getProviderLabel(stop.redfinUrl || stop.address, stop.provider) : 'Listing';
      const redfinUrl = window.propertyLinks ? window.propertyLinks.getRedfinUrl(stop.redfinUrl || stop.address) : '#';

      // Drive Connector Pill
      html += `
        <div class="relative flex items-center gap-4 py-1">
          <div class="w-8 h-8 rounded-full bg-slate-900 border border-slate-700 text-slate-400 font-bold text-xs flex items-center justify-center flex-shrink-0 z-10 ring-4 ring-slate-900">
            ↓
          </div>
          <div class="px-3 py-1 rounded-full bg-slate-900/90 border border-slate-800 text-[11px] font-mono text-sky-400 flex items-center gap-1.5 shadow-sm">
            <span>🚗</span>
            <span class="font-bold">${driveMins} min drive</span>
            ${driveMiles ? `<span class="text-slate-500">• ${driveMiles}</span>` : ''}
          </div>
        </div>
      `;

      // Stop Node Card
      html += `
        <div class="relative flex items-start gap-4 group">
          <!-- Numbered Pin -->
          <div class="w-8 h-8 rounded-full bg-sky-500 text-slate-950 font-black text-sm flex items-center justify-center flex-shrink-0 z-10 shadow-lg shadow-sky-500/20 ring-4 ring-slate-900">
            ${idx + 1}
          </div>

          <!-- Stop Card Box -->
          <div class="bg-slate-900 border border-slate-800/90 hover:border-slate-700 rounded-2xl p-4 flex-1 shadow-lg space-y-3 transition-all">
            <!-- Header Line: Badges & Times -->
            <div class="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-800/80">
              <div class="flex items-center gap-2">
                <span class="px-2.5 py-0.5 rounded-md bg-sky-500/20 text-sky-400 text-xs font-extrabold">STOP #${idx + 1}</span>
                <span class="px-2 py-0.5 rounded-full text-xs font-bold border ${badgeColor}">🎯 ${matchRes.scorePct}% Match</span>
              </div>
              <div class="flex items-center gap-2 text-xs font-mono">
                <span class="text-amber-300 font-bold">ETA: ${arrTime} – ${depTime}</span>
                <span class="text-slate-500 text-[11px]">(${stayMins}m stay)</span>
              </div>
            </div>

            <!-- Content Grid: Photo Left, Specs Right -->
            <div class="flex flex-col sm:flex-row gap-4">
              <!-- House Photo (Uncropped object-contain preview) -->
              <div class="w-full sm:w-52 h-40 bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex-shrink-0 flex items-center justify-center p-1 relative group/img">
                ${photoUrl ? `
                  <img src="${photoUrl}" alt="${stop.address}" class="w-full h-full object-contain rounded-lg cursor-pointer" data-photo-url="${encodeURI(photoUrl)}" data-photo-title="${stop.address.replace(/"/g, '&quot;')}" title="Click to view photo on screen" onclick="window.openImageLightbox(this)">
                  <span class="absolute bottom-1.5 right-1.5 px-2 py-0.5 rounded bg-slate-900/90 text-[10px] font-mono text-slate-300 border border-slate-700 pointer-events-none opacity-80 group-hover/img:opacity-100 transition-opacity">🔍 Expand</span>
                ` : `
                  <div class="flex flex-col items-center justify-center text-center p-3 text-slate-500">
                    <span class="text-2xl mb-1">🏡</span>
                    <span class="text-[11px]">No Photo Attached</span>
                    <button type="button" onclick="window.routePreviewManager.closePreview(); window.homewardApp.openNotebookForStopId('${stop.id}');" class="mt-2 px-2.5 py-1 rounded-md bg-sky-500/20 text-sky-300 text-[10px] font-bold border border-sky-500/30 hover:bg-sky-500/30 transition-colors">
                      + Add Photo
                    </button>
                  </div>
                `}
              </div>

              <!-- Address & Property Details -->
              <div class="flex-1 flex flex-col justify-between space-y-2">
                <div>
                  <h3 class="text-sm font-bold text-slate-100 leading-snug">${stop.address}</h3>
                  <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-slate-300">
                    ${stop.price ? `<span class="font-bold text-emerald-400">${stop.price}</span>` : ''}
                    ${stop.beds ? `<span>${stop.beds} bds</span>` : ''}
                    ${stop.baths ? `<span>${stop.baths} ba</span>` : ''}
                    ${stop.sqft ? `<span>${typeof stop.sqft === 'number' ? stop.sqft.toLocaleString() : stop.sqft} sqft</span>` : ''}
                    ${stop.lotSize ? `<span>Lot: ${stop.lotSize}</span>` : ''}
                    ${stop.hoaNotes ? `<span class="text-slate-400">${stop.hoaNotes}</span>` : ''}
                  </div>
                  ${stop.notes ? `
                    <div class="mt-2 text-xs text-slate-400 bg-slate-950/60 border border-slate-800/80 rounded-lg p-2 italic line-clamp-2">
                      "${stop.notes}"
                    </div>
                  ` : ''}
                </div>

                <!-- Bottom Quick Action Toolbar -->
                <div class="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/60 text-xs">
                  <button type="button" onclick="window.routePreviewManager.closePreview(); window.homewardApp.openNotebookForStopId('${stop.id}');" class="px-2.5 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 font-bold border border-sky-500/30 transition-colors flex items-center gap-1">
                    📝 Inspection Notebook
                  </button>
                  <a href="${redfinUrl}" target="_blank" class="px-2.5 py-1 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-300 font-semibold border border-rose-500/20 transition-colors">📍 ${providerLabel} ↗</a>
                  <a href="${gmapsUrl}" target="_blank" class="px-2.5 py-1 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 font-semibold border border-emerald-500/20 transition-colors">🟢 Map ↗</a>
                </div>
              </div>
            </div>
          </div>
        </div>
      `;
    });

    // 3. RETURN NODE (If loopback enabled)
    if (loopBack) {
      const returnLeg = sched ? sched.returnLeg : null;
      const retTime = returnLeg ? (returnLeg.formattedReturnTime || returnLeg.formattedArrival || 'Est. Return') : 'Est. Return';
      const retDriveMins = returnLeg ? (returnLeg.legDriveMins !== undefined ? returnLeg.legDriveMins : (returnLeg.driveMinsFromPrev || 15)) : 15;
      const retMilesNum = returnLeg ? (returnLeg.legDistanceMiles !== undefined ? returnLeg.legDistanceMiles : returnLeg.distanceMilesFromPrev) : null;
      const retMiles = retMilesNum ? `${retMilesNum} mi` : '';

      html += `
        <!-- Return Drive Connector -->
        <div class="relative flex items-center gap-4 py-1">
          <div class="w-8 h-8 rounded-full bg-slate-900 border border-slate-700 text-slate-400 font-bold text-xs flex items-center justify-center flex-shrink-0 z-10 ring-4 ring-slate-900">
            ↓
          </div>
          <div class="px-3 py-1 rounded-full bg-slate-900/90 border border-slate-800 text-[11px] font-mono text-purple-400 flex items-center gap-1.5 shadow-sm">
            <span>🚗</span>
            <span class="font-bold">${retDriveMins} min return drive</span>
            ${retMiles ? `<span class="text-slate-500">• ${retMiles}</span>` : ''}
          </div>
        </div>

        <!-- Finish Node -->
        <div class="relative flex items-start gap-4 group">
          <div class="w-8 h-8 rounded-full bg-rose-500 text-slate-950 flex items-center justify-center flex-shrink-0 z-10 shadow-lg shadow-rose-500/30 ring-4 ring-slate-900">
            <svg class="w-4 h-4 fill-slate-950" viewBox="0 0 24 24"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6h-5.6z"/></svg>
          </div>
          <div class="bg-slate-950/90 border border-rose-500/40 rounded-xl p-3.5 flex-1 shadow-md">
            <div class="flex items-center justify-between gap-2 flex-wrap mb-1">
              <span class="px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-400 text-[10px] font-bold uppercase tracking-wider">FINISH / RETURN TO BASE</span>
              <span class="text-xs font-mono font-bold text-rose-300">${retTime}</span>
            </div>
            <div class="text-xs font-semibold text-slate-200">${startAddr}</div>
          </div>
        </div>
      `;
    }

    html += `</div>`;
    container.innerHTML = html;
  }
}

window.routePreviewManager = new RoutePreviewManager();
