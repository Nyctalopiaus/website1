/* scoring.js - Priority Targets & Relocation Match Score Logic */
(function(window) {
  'use strict';

  const config = window.RelocationKeywords?.CATEGORY_CONFIG || {};

  const CATEGORY_META = {
    grocery: { label: config.grocery?.label || 'Grocery', color: config.grocery?.color || '#f97316', target: config.grocery?.target || 3 },
    fitness: { label: config.fitness?.label || 'Fitness', color: config.fitness?.color || '#22d3ee', target: config.fitness?.target || 4 },
    trails: { label: config.trails?.label || 'Trails', color: config.trails?.color || '#38bdf8', target: config.trails?.target || 2 },
    cuisine: { label: config.cuisine?.label || 'Cuisine', color: config.cuisine?.color || '#f472b6', target: config.cuisine?.target || 6 },
    gas: { label: config.gas?.label || 'Gas', color: config.gas?.color || '#f59e0b', target: config.gas?.target || 3 },
    parks: { label: config.parks?.label || 'Parks', color: config.parks?.color || '#34d399', target: config.parks?.target || 3 },
    pharmacy: { label: config.pharmacy?.label || 'Pharmacy', color: config.pharmacy?.color || '#a78bfa', target: config.pharmacy?.target || 2 }
  };

  const CATEGORY_ORDER = ['grocery', 'fitness', 'trails', 'cuisine', 'gas', 'parks', 'pharmacy'];

  function buildAssessment(slot, query, candidate, parsed, options = {}) {
    const spatial = window.RelocationSpatial;
    const isEstimated = options.isEstimated === true;
    const sourceLabel = options.sourceLabel || 'Live view';
    const radiusMinutes = options.radiusMinutes || 10;
    const radiusMeters = spatial.radiusMetersFromMinutes(radiusMinutes);
    const center = candidate.center;
    const categoryPrefs = options.categoryPrefs || {};
    // Per-category { elements, termsAttempted, termsErrored, allTermsFailed }
    // from a Photon-fallback fetch (see spatial.js's fetchPhotonFallbackData),
    // or null when this assessment's data came straight from Overpass (which
    // doesn't have this per-term failure mode). Passed through untouched so
    // app.js's scoreboard rendering can show "couldn't confirm" instead of a
    // bare 0 for a category whose fallback lookups all failed.
    const categoryFetchStatus = options.categoryFetchStatus || null;

    const groceryInRange = spatial.countWithin(center, parsed.grocery || [], radiusMeters);
    const fitnessInRange = spatial.countWithin(center, parsed.fitness || [], radiusMeters);
    const cuisineInRange = spatial.countWithin(center, parsed.cuisine || [], radiusMeters);
    const gasInRange = spatial.countWithin(center, parsed.gas || [], radiusMeters);
    const parksInRange = spatial.countWithin(center, parsed.parks || [], radiusMeters);
    const pharmacyInRange = spatial.countWithin(center, parsed.pharmacy || [], radiusMeters);

    const trailsInRange = (parsed.cycleways || []).filter((w) => spatial.haversineMeters(center.lat, center.lon, w.lat, w.lon) <= radiusMeters);
    const trailMiles = trailsInRange.reduce((sum, segment) => sum + (segment.miles || 0), 0);

    const counts = {
      grocery: groceryInRange.length,
      fitness: fitnessInRange.length,
      cuisine: cuisineInRange.length,
      gas: gasInRange.length,
      parks: parksInRange.length,
      pharmacy: pharmacyInRange.length,
      trails: Number(trailMiles.toFixed(2))
    };

    // A per-search target override (from the user's own "Target" input, see
    // app.js's getCategoryPrefs()) takes priority; a category with no valid
    // override, or an old caller that never passed categoryPrefs at all,
    // falls back to the CATEGORY_META default -- keeps this function usable
    // even if categoryPrefs is missing/legacy-shaped.
    function targetFor(key) {
      const override = categoryPrefs[key] && typeof categoryPrefs[key] === 'object' ? categoryPrefs[key].target : null;
      return (typeof override === 'number' && override > 0) ? override : CATEGORY_META[key].target;
    }

    const targets = {};
    CATEGORY_ORDER.forEach((key) => { targets[key] = targetFor(key); });

    const norms = {
      grocery: Math.min(counts.grocery / targets.grocery, 1),
      fitness: Math.min(counts.fitness / targets.fitness, 1),
      cuisine: Math.min(counts.cuisine / targets.cuisine, 1),
      gas: Math.min(counts.gas / targets.gas, 1),
      parks: Math.min(counts.parks / targets.parks, 1),
      pharmacy: Math.min(counts.pharmacy / targets.pharmacy, 1),
      trails: Math.min(counts.trails / targets.trails, 1)
    };

    // "Selected" and "weight" both come from the new { enabled, weight,
    // target } shape (see app.js's state.categoryPrefs). A bare `false`
    // (the old pre-weighting shape) is still honored as "not selected" for
    // any caller that hasn't been upgraded.
    function isSelected(key) {
      const pref = categoryPrefs[key];
      if (pref && typeof pref === 'object') return pref.enabled !== false;
      return pref !== false;
    }
    function weightFor(key) {
      const pref = categoryPrefs[key];
      const w = pref && typeof pref === 'object' ? pref.weight : null;
      return (typeof w === 'number' && w > 0) ? w : 1;
    }

    const selected = CATEGORY_ORDER.filter(isSelected);
    const weights = {};
    selected.forEach((key) => { weights[key] = weightFor(key); });

    let score = 0;
    if (selected.length) {
      const weightTotal = selected.reduce((acc, key) => acc + weights[key], 0);
      const weightedSum = selected.reduce((acc, key) => acc + (norms[key] || 0) * weights[key], 0);
      score = weightTotal > 0 ? Math.round((weightedSum / weightTotal) * 100) : 0;
    }

    return {
      slot,
      query,
      displayName: candidate.displayName,
      center,
      radiusMinutes,
      radiusMeters,
      counts,
      norms,
      targets,
      weights,
      score,
      selected,
      markers: {
        grocery: groceryInRange,
        fitness: fitnessInRange,
        cuisine: cuisineInRange,
        gas: gasInRange,
        parks: parksInRange,
        pharmacy: pharmacyInRange,
        trails: trailsInRange
      },
      isEstimated,
      sourceLabel,
      categoryFetchStatus
    };
  }

  window.RelocationScoring = {
    CATEGORY_META,
    CATEGORY_ORDER,
    buildAssessment
  };
})(window);
