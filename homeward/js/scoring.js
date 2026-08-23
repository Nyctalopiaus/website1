/**
 * Homeward Property Match Scoring Engine
 * Evaluates property specs against user buyer preferences to compute a 0% - 100% Match Score.
 */
class PropertyScorer {
  parsePrice(str) {
    if (!str) return null;
    const s = String(str).trim();
    if (!s) return null;
    const clean = s.replace(/,/g, '');
    const match = clean.match(/\d+(?:\.\d+)?/);
    if (match) {
      return Math.round(parseFloat(match[0]));
    }
    return null;
  }

  parseLotSqFt(str) {
    if (!str) return null;
    const s = String(str).toLowerCase().trim();
    if (!s) return null;
    if (s.includes('acre')) {
      const match = s.match(/\d+(?:\.\d+)?/);
      return match ? Math.round(parseFloat(match[0]) * 43560) : null;
    } else {
      const clean = s.replace(/,/g, '');
      const match = clean.match(/\d+(?:\.\d+)?/);
      return match ? Math.round(parseFloat(match[0])) : null;
    }
  }

  parseHomeSqFt(str) {
    if (!str) return null;
    const s = String(str).toLowerCase().trim();
    if (!s) return null;
    const clean = s.replace(/,/g, '');
    const match = clean.match(/\d+(?:\.\d+)?/);
    return match ? Math.round(parseFloat(match[0])) : null;
  }

  parseHoa(str) {
    if (!str) return 0;
    const s = String(str).toLowerCase().trim();
    if (!s || s.includes('no hoa') || s.includes('none') || s === '0' || s === '$0') return 0;
    const clean = s.replace(/,/g, '');
    const match = clean.match(/\d+(?:\.\d+)?/);
    return match ? Math.round(parseFloat(match[0])) : 0;
  }

  parseYearBuilt(val) {
    if (!val) return null;
    const s = String(val).trim();
    if (!s) return null;
    const match = s.match(/\b(18|19|20)\d{2}\b/);
    if (match) return parseInt(match[0], 10);
    const clean = s.replace(/,/g, '');
    const matchAny = clean.match(/\d+/);
    return matchAny ? parseInt(matchAny[0], 10) : null;
  }


  calculateMatchScore(stop, preferences = {}) {
    if (!stop) {
      return { scorePct: 100, badgeColor: 'sky', passedCriteria: [], failedCriteria: [] };
    }

    let earnedPoints = 0;
    let totalMaxPoints = 0;
    const passedCriteria = [];
    const failedCriteria = [];

    // 1. Price Check (20 pts)
    const maxPrice = preferences.maxPrice ? parseInt(preferences.maxPrice, 10) : null;
    if (maxPrice && maxPrice > 0) {
      totalMaxPoints += 20;
      const price = this.parsePrice(stop.price);
      if (price !== null && price <= maxPrice) {
        earnedPoints += 20;
        passedCriteria.push(`Price: $${price.toLocaleString()} <= $${maxPrice.toLocaleString()}`);
      } else if (price !== null) {
        failedCriteria.push(`Price: $${price.toLocaleString()} > $${maxPrice.toLocaleString()} max`);
      } else {
        earnedPoints += 10; // Partial score if unlisted
        passedCriteria.push(`Price: Unlisted (Partial Score)`);
      }
    }

    // 2. Lot Size Check (20 pts)
    const minLotSqFt = preferences.minLotSqFt ? parseInt(preferences.minLotSqFt, 10) : null;
    if (minLotSqFt && minLotSqFt > 0) {
      totalMaxPoints += 20;
      const lotSqFt = this.parseLotSqFt(stop.lotSize);
      if (lotSqFt !== null && lotSqFt >= minLotSqFt) {
        earnedPoints += 20;
        const display = lotSqFt >= 43560 ? `${(lotSqFt / 43560).toFixed(2)} Acres` : `${lotSqFt.toLocaleString()} sq ft`;
        passedCriteria.push(`Lot Size: ${display} >= requirement`);
      } else if (lotSqFt !== null) {
        const display = lotSqFt >= 43560 ? `${(lotSqFt / 43560).toFixed(2)} Acres` : `${lotSqFt.toLocaleString()} sq ft`;
        failedCriteria.push(`Lot Size: ${display} below minimum requirement`);
      } else {
        earnedPoints += 10;
        passedCriteria.push(`Lot Size: Unspecified (Partial Score)`);
      }
    }

    // 3. Home Sq Ft Check (15 pts)
    const minHomeSqFt = preferences.minHomeSqFt ? parseInt(preferences.minHomeSqFt, 10) : null;
    if (minHomeSqFt && minHomeSqFt > 0) {
      totalMaxPoints += 15;
      const homeSqFt = this.parseHomeSqFt(stop.sqft || stop.notes);
      if (homeSqFt !== null && homeSqFt >= minHomeSqFt) {
        earnedPoints += 15;
        passedCriteria.push(`Home Size: ${homeSqFt.toLocaleString()} sq ft >= min requirement`);
      } else if (homeSqFt !== null) {
        failedCriteria.push(`Home Size: ${homeSqFt.toLocaleString()} sq ft below min requirement`);
      } else {
        earnedPoints += 7;
        passedCriteria.push(`Home Size: Unspecified (Partial Score)`);
      }
    }

    // 4. Max HOA Dues Check (15 pts)
    const maxHoa = preferences.maxHoa !== undefined && preferences.maxHoa !== '' ? parseInt(preferences.maxHoa, 10) : null;
    if (maxHoa !== null && maxHoa >= 0) {
      totalMaxPoints += 15;
      const hoa = this.parseHoa(stop.hoaNotes);
      if (hoa <= maxHoa) {
        earnedPoints += 15;
        passedCriteria.push(hoa === 0 ? `HOA: No HOA ($0/mo)` : `HOA: $${hoa}/mo <= $${maxHoa}/mo max`);
      } else {
        failedCriteria.push(`HOA: $${hoa}/mo exceeds $${maxHoa}/mo budget`);
      }
    }

    // 5. Min Year Built Check (10 pts)
    const minYearBuilt = preferences.minYearBuilt ? parseInt(preferences.minYearBuilt, 10) : null;
    if (minYearBuilt && minYearBuilt > 0) {
      totalMaxPoints += 10;
      const year = this.parseYearBuilt(stop.yearBuilt || stop.notes);
      if (year !== null && year >= minYearBuilt) {
        earnedPoints += 10;
        passedCriteria.push(`Year Built: ${year} >= ${minYearBuilt}`);
      } else if (year !== null) {
        failedCriteria.push(`Year Built: ${year} older than ${minYearBuilt}`);
      } else {
        earnedPoints += 5;
        passedCriteria.push(`Year Built: Unspecified (Partial Score)`);
      }
    }

    // 6. Preferred House Facing Direction (10 pts)
    const prefFacing = preferences.prefFacing ? preferences.prefFacing.trim().toLowerCase() : null;
    if (prefFacing && prefFacing !== 'any') {
      totalMaxPoints += 10;
      const facing = (stop.facingDirection || '').toLowerCase();
      if (facing.includes(prefFacing)) {
        earnedPoints += 10;
        passedCriteria.push(`House Facing: ${stop.facingDirection} matches preference`);
      } else if (facing) {
        failedCriteria.push(`House Facing: ${stop.facingDirection} (Preferred: ${preferences.prefFacing})`);
      } else {
        earnedPoints += 5;
        passedCriteria.push(`House Facing: Unspecified (Partial Score)`);
      }
    }

    // 7. Preferred Terrain / Slope (5 pts)
    const prefTerrain = preferences.prefTerrain ? preferences.prefTerrain.trim().toLowerCase() : null;
    if (prefTerrain && prefTerrain !== 'any') {
      totalMaxPoints += 5;
      const terrain = (stop.terrain || 'flat').toLowerCase();
      if (terrain.includes(prefTerrain) || (prefTerrain.includes('flat') && terrain.includes('flat'))) {
        earnedPoints += 5;
        passedCriteria.push(`Terrain: ${stop.terrain} matches preference`);
      } else {
        failedCriteria.push(`Terrain: ${stop.terrain} (Preferred: ${preferences.prefTerrain})`);
      }
    }

    // 8. Solar Panel Preferred (5 pts)
    if (preferences.prefSolar) {
      totalMaxPoints += 5;
      if (stop.hasSolar) {
        earnedPoints += 5;
        passedCriteria.push(`Solar System: ☀️ Solar Installed`);
      } else {
        failedCriteria.push(`Solar System: No Solar Installed`);
      }
    }

    // If no active preferences set, default to 100%
    if (totalMaxPoints === 0) {
      return {
        scorePct: 100,
        badgeColor: 'emerald',
        passedCriteria: ['All specs default match (no active preference filters)'],
        failedCriteria: []
      };
    }

    const scorePct = Math.round((earnedPoints / totalMaxPoints) * 100);
    let badgeColor = 'emerald';
    if (scorePct < 50) {
      badgeColor = 'rose';
    } else if (scorePct < 80) {
      badgeColor = 'amber';
    }

    return {
      scorePct: scorePct,
      earnedPoints: earnedPoints,
      totalMaxPoints: totalMaxPoints,
      badgeColor: badgeColor,
      passedCriteria: passedCriteria,
      failedCriteria: failedCriteria
    };
  }
}

window.propertyScorer = new PropertyScorer();
