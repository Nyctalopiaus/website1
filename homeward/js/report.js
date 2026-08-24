/**
 * BuildRoute Executive Scouting Report Module
 * Renders print-optimized site visit report and triggers PDF export.
 */
class ReportGenerator {
  generateReport(tourData, scheduleData) {
    if (!tourData || !tourData.stops || tourData.stops.length === 0) {
      alert('Please add and optimize at least one house stop before generating a report.');
      return;
    }

    const container = document.getElementById('report-content');
    if (!container) return;

    const todayStr = new Date().toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    let html = `
      <!-- Report Header -->
      <div class="border-b border-slate-700 pb-6 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div class="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/10 border border-sky-500/20 text-sky-400 text-xs font-semibold uppercase tracking-widest mb-2">
            Executive Site Scouting Summary
          </div>
          <h1 class="text-3xl font-extrabold text-slate-100">${tourData.tourName || 'Build Site Scouting Tour'}</h1>
          <p class="text-slate-400 text-sm mt-1">Generated on ${todayStr} • Starting from: <span class="text-slate-200">${tourData.startAddress || 'N/A'}</span></p>
        </div>
        <div class="bg-slate-800/80 border border-slate-700 rounded-xl p-4 flex gap-6 text-center">
          <div>
            <div class="text-xs text-slate-400 font-medium uppercase">Properties</div>
            <div class="text-xl font-bold text-sky-400">${tourData.stops.length}</div>
          </div>
          <div class="border-r border-slate-700"></div>
          <div>
            <div class="text-xs text-slate-400 font-medium uppercase">Total Miles</div>
            <div class="text-xl font-bold text-emerald-400">${scheduleData ? scheduleData.totalDistanceMiles : 0} mi</div>
          </div>
          <div class="border-r border-slate-700"></div>
          <div>
            <div class="text-xs text-slate-400 font-medium uppercase">Est. Duration</div>
            <div class="text-xl font-bold text-amber-400">${scheduleData ? scheduleData.formattedTotalDuration : 'N/A'}</div>
          </div>
        </div>
      </div>

      <!-- Property Cards Grid -->
      <div class="space-y-6">
    `;

    tourData.stops.forEach((stop, idx) => {
      const scheduleItem = scheduleData && scheduleData.orderedStops ? scheduleData.orderedStops[idx] : null;
      const gmapsUrl = window.propertyLinks.getGoogleMapsUrl(stop.address, stop.lat, stop.lng);
      const providerLabel = window.propertyLinks ? window.propertyLinks.getProviderLabel(stop.redfinUrl || stop.address, stop.provider) : 'Listing';
      const redfinUrl = window.propertyLinks.getRedfinUrl(stop.redfinUrl || stop.address);
      const zillowUrl = window.propertyLinks.getZillowUrl(stop.address);
      const streetViewUrl = window.propertyLinks.getStreetViewUrl(stop.lat, stop.lng, stop.address);

      const stars = '★'.repeat(stop.rating || 3) + '☆'.repeat(5 - (stop.rating || 3));
      const matchRes = window.propertyScorer ? window.propertyScorer.calculateMatchScore(stop, tourData.preferences) : { scorePct: 100 };
      const badgeColorClass = matchRes.scorePct >= 80 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : (matchRes.scorePct >= 50 ? 'bg-amber-500/20 text-amber-400 border-amber-500/30' : 'bg-rose-500/20 text-rose-400 border-rose-500/30');

      html += `
        <div class="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 shadow-lg mb-6 break-inside-avoid">
          <div class="flex flex-col lg:flex-row gap-6">
            
            <!-- Property Photo -->
            <div class="lg:w-1/3 flex-shrink-0">
              ${stop.photoUrl ? `
                <img src="${stop.photoUrl}" alt="${stop.address}" class="w-full h-52 object-contain bg-slate-950/80 rounded-xl border border-slate-700 cursor-pointer" data-photo-url="${encodeURI(stop.photoUrl)}" data-photo-title="${stop.address.replace(/"/g, '&quot;')}" title="Click to view photo on screen" onclick="window.openImageLightbox(this)">
              ` : `
                <div class="w-full h-52 bg-slate-800/80 rounded-xl border border-slate-700/80 flex flex-col items-center justify-center text-slate-500">
                  <svg class="w-12 h-12 mb-2 stroke-current" fill="none" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
                  <span class="text-xs">No Photo Attached</span>
                </div>
              `}
              <div class="mt-3 flex items-center justify-around text-xs font-semibold no-print flex-wrap gap-1">
                <a href="${gmapsUrl}" target="_blank" class="text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1">🟢 Google Maps ↗</a>
                <a href="${redfinUrl}" target="_blank" class="text-rose-400 hover:text-rose-300 transition-colors flex items-center gap-1">📍 ${providerLabel} ↗</a>
                <a href="${zillowUrl}" target="_blank" class="text-sky-400 hover:text-sky-300 transition-colors flex items-center gap-1">🔵 Zillow ↗</a>
                <a href="${streetViewUrl}" target="_blank" class="text-amber-400 hover:text-amber-300 transition-colors flex items-center gap-1">🟡 Street View ↗</a>
              </div>
            </div>

            <!-- Property Specs & Notes -->
            <div class="lg:w-2/3 flex flex-col justify-between">
              <div>
                <div class="flex items-start justify-between gap-4">
                  <div>
                    <div class="flex items-center gap-2">
                      <span class="px-2.5 py-0.5 rounded-md bg-sky-500/20 text-sky-400 text-xs font-bold">STOP #${idx + 1}</span>
                      ${scheduleItem ? `<span class="text-xs text-slate-400 font-mono">ETA Arrival: ${scheduleItem.formattedArrival}</span>` : ''}
                      ${stop.visited ? `<span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-xs font-semibold">Visited ✓</span>` : ''}
                      <span class="px-2 py-0.5 rounded-full text-xs font-bold border ${badgeColorClass}">🎯 ${matchRes.scorePct}% Match</span>
                    </div>
                    <h2 class="text-xl font-bold text-slate-100 mt-1">${stop.address}</h2>
                  </div>
                  <div class="text-right">
                    <div class="text-amber-400 text-lg font-bold tracking-widest">${stars}</div>
                    <div class="text-xs text-slate-400">${stop.rating || 3} / 5 Rating</div>
                  </div>
                </div>

                <!-- Key Specs Grid -->
                <div class="grid grid-cols-2 sm:grid-cols-6 gap-3 mt-4 p-3 rounded-xl bg-slate-800/60 border border-slate-700/60 text-xs">
                  <div>
                    <span class="text-slate-400 block uppercase font-medium">Price</span>
                    <span class="font-semibold text-emerald-400 text-sm">${stop.price || 'N/A'}</span>
                  </div>
                  <div>
                    <span class="text-slate-400 block uppercase font-medium">Lot Size</span>
                    <span class="font-semibold text-sky-400 text-sm">${stop.lotSize || 'N/A'}</span>
                  </div>
                  <div>
                    <span class="text-slate-400 block uppercase font-medium">Home Sq Ft 🏠</span>
                    <span class="font-semibold text-sky-400 text-sm">${stop.sqft || 'N/A'}</span>
                  </div>
                  <div>
                    <span class="text-slate-400 block uppercase font-medium">Elevation ⛰️</span>
                    <span class="font-semibold text-amber-400 text-sm">${stop.elevationFt ? (typeof stop.elevationFt === 'number' ? stop.elevationFt.toLocaleString() + ' ft' : stop.elevationFt) + (stop.isAutoDetected ? ' <span class="text-sky-400 font-normal text-xs">(⚡ Auto)</span>' : '') : 'N/A'}</span>
                  </div>
                  <div>
                    <span class="text-slate-400 block uppercase font-medium">House Facing 🧭</span>
                    <span class="font-semibold text-sky-400 text-sm">${stop.facingDirection || 'South (S)'}</span>
                  </div>
                  <div>
                    <span class="text-slate-400 block uppercase font-medium">Terrain</span>
                    <span class="font-semibold text-slate-200 text-sm">${stop.terrain || 'Flat'}</span>
                  </div>
                  <div>
                    <span class="text-slate-400 block uppercase font-medium">Solar System ☀️</span>
                    <span class="font-semibold ${stop.hasSolar ? 'text-amber-400' : 'text-slate-400'} text-sm">${stop.hasSolar ? 'Installed ☀️' : 'No Solar'}</span>
                  </div>
                </div>

                <!-- Notes / Thoughts -->
                <div class="mt-4">
                  <h4 class="text-xs font-bold text-slate-300 uppercase tracking-wider mb-1">Our Thoughts & Inspection Notes</h4>
                  <p class="text-sm text-slate-300 bg-slate-800/30 p-3 rounded-lg border border-slate-800 leading-relaxed italic">
                    "${stop.notes || 'No custom notes recorded for this site yet.'}"
                  </p>
                </div>

                <!-- Pros & Cons Badges -->
                <div class="grid sm:grid-cols-2 gap-3 mt-4 text-xs">
                  ${stop.pros && stop.pros.length > 0 ? `
                    <div>
                      <span class="text-emerald-400 font-bold block mb-1">PROS</span>
                      <div class="flex flex-wrap gap-1.5">
                        ${stop.pros.map(p => `<span class="px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20">+ ${p}</span>`).join('')}
                      </div>
                    </div>
                  ` : ''}

                  ${stop.cons && stop.cons.length > 0 ? `
                    <div>
                      <span class="text-rose-400 font-bold block mb-1">CONS</span>
                      <div class="flex flex-wrap gap-1.5">
                        ${stop.cons.map(c => `<span class="px-2 py-0.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/20">- ${c}</span>`).join('')}
                      </div>
                    </div>
                  ` : ''}
                </div>
              </div>
            </div>

          </div>
        </div>
      `;
    });

    html += `</div>`;
    container.innerHTML = html;

    // Show Report Modal
    const reportModal = document.getElementById('report-modal');
    if (reportModal) {
      reportModal.classList.remove('hidden');
      reportModal.style.display = 'block';
    }
  }

  closeReport() {
    const reportModal = document.getElementById('report-modal');
    if (reportModal) {
      reportModal.classList.add('hidden');
      reportModal.style.display = 'none';
    }
  }

  printReport() {
    window.print();
  }
}

window.reportGenerator = new ReportGenerator();
