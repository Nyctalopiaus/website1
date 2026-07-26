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

    const norms = {
      grocery: Math.min(counts.grocery / CATEGORY_META.grocery.target, 1),
      fitness: Math.min(counts.fitness / CATEGORY_META.fitness.target, 1),
      cuisine: Math.min(counts.cuisine / CATEGORY_META.cuisine.target, 1),
      gas: Math.min(counts.gas / CATEGORY_META.gas.target, 1),
      parks: Math.min(counts.parks / CATEGORY_META.parks.target, 1),
      pharmacy: Math.min(counts.pharmacy / CATEGORY_META.pharmacy.target, 1),
      trails: Math.min(counts.trails / CATEGORY_META.trails.target, 1)
    };

    const selected = CATEGORY_ORDER.filter((key) => categoryPrefs[key] !== false);
    let score = 0;
    if (selected.length) {
      const sum = selected.reduce((acc, key) => acc + (norms[key] || 0), 0);
      score = Math.round((sum / selected.length) * 100);
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
      sourceLabel
    };
  }

  window.RelocationScoring = {
    CATEGORY_META,
    CATEGORY_ORDER,
    buildAssessment
  };
})(window);
