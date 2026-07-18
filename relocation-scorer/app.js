document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const weightTrails = document.getElementById('weight-trails');
  const weightRetail = document.getElementById('weight-retail');
  const weightFitness = document.getElementById('weight-fitness');
  const weightCulinary = document.getElementById('weight-culinary');
  const transitRadius = document.getElementById('transit-radius');

  const valWTrails = document.getElementById('val-w-trails');
  const valWRetail = document.getElementById('val-w-retail');
  const valWFitness = document.getElementById('val-w-fitness');
  const valWCulinary = document.getElementById('val-w-culinary');
  const valTransitRadius = document.getElementById('val-transit-radius');

  const topNeighborhoodName = document.getElementById('top-neighborhood-name');
  const topNeighborhoodScore = document.getElementById('top-neighborhood-score');
  const scoreboardList = document.getElementById('scoreboard-list');
  const matrixTbody = document.getElementById('matrix-tbody');
  const radarSvg = document.getElementById('radar-svg');
  const scannerGrid = document.getElementById('scanner-grid');
  const hdrGpsCoords = document.getElementById('hdr-gps-coords');

  // =========================================================================
  // MOCK NEIGHBORHOOD GIS DATASET
  // =========================================================================
  const neighborhoods = [
    {
      name: "Greenwood Heights",
      lat: 45.1022,
      lon: -122.3491,
      // Raw metrics:
      trailMiles: 12.4,        // Continuous bike/running trails
      groceryDist: 1.6,        // Miles to closest grocery infrastructure
      gymCount: 2,             // Active athletic facilities inside boundaries
      culinaryIndex: 0.15      // Variety index (0-1) for specialized dining
    },
    {
      name: "Metro Core",
      lat: 45.1154,
      lon: -122.3610,
      trailMiles: 0.2,
      groceryDist: 0.1,
      gymCount: 14,
      culinaryIndex: 0.95
    },
    {
      name: "East River Valley",
      lat: 45.0945,
      lon: -122.3211,
      trailMiles: 7.8,
      groceryDist: 0.6,
      gymCount: 5,
      culinaryIndex: 0.45
    },
    {
      name: "North End Hub",
      lat: 45.1321,
      lon: -122.3780,
      trailMiles: 1.5,
      groceryDist: 0.3,
      gymCount: 9,
      culinaryIndex: 0.68
    },
    {
      name: "Soho Ridge",
      lat: 45.0812,
      lon: -122.3921,
      trailMiles: 0.8,
      groceryDist: 2.2,
      gymCount: 1,
      culinaryIndex: 0.85
    }
  ];

  // =========================================================================
  // CALCULATIONS & SCORING SYSTEM (GIS DECISION MATRIX)
  // =========================================================================
  
  /**
   * Normalization helper: Maps a raw value to a 0.0 to 1.0 scale.
   * higherValuesAreBetter: true for positive attributes, false for costs (distance).
   */
  function normalize(value, min, max, higherValuesAreBetter = true) {
    if (max === min) return 1.0;
    const norm = (value - min) / (max - min);
    return higherValuesAreBetter ? norm : 1.0 - norm;
  }

  /**
   * Computes compatibility index for all neighborhoods.
   * Applies user weighting coefficients and dynamic distance decay penalties.
   */
  function calculateScores() {
    const wTrails = parseFloat(weightTrails.value);
    const wRetail = parseFloat(weightRetail.value);
    const wFitness = parseFloat(weightFitness.value);
    const wCulinary = parseFloat(weightCulinary.value);
    const maxRadiusMins = parseInt(transitRadius.value);

    // Sum weights to normalize final scores
    const sumWeights = (wTrails + wRetail + wFitness + wCulinary) || 1.0;

    // Find min and max bounds for normalization
    const trailMilesArr = neighborhoods.map(n => n.trailMiles);
    const groceryDistArr = neighborhoods.map(n => n.groceryDist);
    const gymCountArr = neighborhoods.map(n => n.gymCount);
    const culinaryIndexArr = neighborhoods.map(n => n.culinaryIndex);

    const minTrails = Math.min(...trailMilesArr), maxTrails = Math.max(...trailMilesArr);
    const minGrocery = Math.min(...groceryDistArr), maxGrocery = Math.max(...groceryDistArr);
    const minGyms = Math.min(...gymCountArr), maxGyms = Math.max(...gymCountArr);
    const minCulinary = Math.min(...culinaryIndexArr), maxCulinary = Math.max(...culinaryIndexArr);

    // Calculate score details for each neighborhood
    const scoredList = neighborhoods.map(n => {
      // 1. Normalize raw values (0.0 to 1.0)
      const nTrails = normalize(n.trailMiles, minTrails, maxTrails, true);
      const nRetail = normalize(n.groceryDist, minGrocery, maxGrocery, false); // Closer is better
      const nFitness = normalize(n.gymCount, minGyms, maxGyms, true);
      const nCulinary = normalize(n.culinaryIndex, minCulinary, maxCulinary, true);

      // 2. Apply custom weightings
      const weightedSum = 
        (nTrails * wTrails) + 
        (nRetail * wRetail) + 
        (nFitness * wFitness) + 
        (nCulinary * wCulinary);

      let baseScore = (weightedSum / sumWeights) * 100;

      // 3. Transit Radius Decay Penalty
      // Assume walking/cycling average velocity: 8 minutes per mile.
      const groceryTransitTime = n.groceryDist * 8; 
      let decayPenalty = 0;

      // If travel time exceeds max radius, apply a decay penalty
      if (groceryTransitTime > maxRadiusMins) {
        // Linear decay factor: penalize proportional to the excess time
        const excessTime = groceryTransitTime - maxRadiusMins;
        decayPenalty = Math.min(excessTime * 6, 40); // cap penalty at 40%
        baseScore = Math.max(0, baseScore - decayPenalty);
      }

      return {
        ...n,
        normalized: {
          trails: nTrails,
          retail: nRetail,
          fitness: nFitness,
          culinary: nCulinary
        },
        transitTime: groceryTransitTime,
        decayPenalty: Math.round(decayPenalty),
        finalScore: Math.round(baseScore)
      };
    });

    // Sort by compatibility score descending
    scoredList.sort((a, b) => b.finalScore - a.finalScore);

    return scoredList;
  }

  // =========================================================================
  // TELEMETRY RADAR PLOT DRAWER (SVG VECTOR SHAPE SHIFTER)
  // =========================================================================

  function drawRadarChart(topNeighborhood) {
    radarSvg.innerHTML = ''; // Clear previous elements
    if (!topNeighborhood) return;

    const size = 300;
    const center = size / 2;
    const maxRadius = 100;

    // Angles for 4 axes: Trails (0), Grocery (90), Fitness (180), Culinary (270)
    // Angles converted to radians
    const axes = [
      { name: "TRAILS", angle: 0 },
      { name: "GROCERY", angle: Math.PI / 2 },
      { name: "FITNESS", angle: Math.PI },
      { name: "CULINARY", angle: (3 * Math.PI) / 2 }
    ];

    // Normalized values cache
    const values = [
      topNeighborhood.normalized.trails,
      topNeighborhood.normalized.retail,
      topNeighborhood.normalized.fitness,
      topNeighborhood.normalized.culinary
    ];

    // Draw grid rings (4 circles)
    for (let r = 1; r <= 4; r++) {
      const ringRadius = (r / 4) * maxRadius;
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', center);
      circle.setAttribute('cy', center);
      circle.setAttribute('r', ringRadius);
      circle.setAttribute('class', 'radar-grid-line');
      radarSvg.appendChild(circle);
    }

    // Draw axes lines and labels
    axes.forEach((axis, idx) => {
      const cos = Math.cos(axis.angle);
      const sin = Math.sin(axis.angle);

      const targetX = center + cos * maxRadius;
      const targetY = center + sin * maxRadius;

      // Axis line
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', center);
      line.setAttribute('y1', center);
      line.setAttribute('x2', targetX);
      line.setAttribute('y2', targetY);
      line.setAttribute('class', 'radar-axis-line');
      radarSvg.appendChild(line);

      // Axis Label
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      const offsetFactor = 1.2; // Push text outside bounds
      text.setAttribute('x', center + cos * maxRadius * offsetFactor);
      text.setAttribute('y', center + sin * maxRadius * offsetFactor + 3);
      text.setAttribute('class', 'radar-axis-label font-mono');
      text.textContent = axis.name;
      radarSvg.appendChild(text);
    });

    // Plot footprint points & polygon area path
    const points = axes.map((axis, idx) => {
      const val = values[idx];
      const distance = val * maxRadius;
      const x = center + Math.cos(axis.angle) * distance;
      const y = center + Math.sin(axis.angle) * distance;
      return { x, y };
    });

    const pointsStr = points.map(p => `${p.x},${p.y}`).join(' ');

    const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    polygon.setAttribute('points', pointsStr);
    polygon.setAttribute('class', 'radar-area-path');
    radarSvg.appendChild(polygon);

    // Draw small highlight dots at vertices
    points.forEach(p => {
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', p.x);
      dot.setAttribute('cy', p.y);
      dot.setAttribute('r', 4);
      dot.setAttribute('fill', 'var(--accent-green)');
      radarSvg.appendChild(dot);
    });
  }

  // =========================================================================
  // REAL-TIME RENDERING (INTERFACE BINDINGS)
  // =========================================================================

  function renderDashboard() {
    // 1. Recalculate
    const scoredList = calculateScores();
    const topMatch = scoredList[0];

    // 2. Render Top Match Card
    topNeighborhoodName.textContent = topMatch.name;
    topNeighborhoodScore.textContent = topMatch.finalScore;
    hdrGpsCoords.textContent = `SATFEED // LAT: ${topMatch.lat.toFixed(4)} // LON: ${topMatch.lon.toFixed(4)}`;

    // 3. Draw Radar Chart
    drawRadarChart(topMatch);

    // 4. Render Scoreboard
    scoreboardList.innerHTML = '';
    scoredList.forEach((n, idx) => {
      const item = document.createElement('div');
      item.className = `scoreboard-item ${idx === 0 ? 'rank-1' : ''}`;
      
      const details = document.createElement('div');
      details.className = 'rank-details';
      
      const name = document.createElement('span');
      name.className = 'rank-name';
      name.textContent = `${idx + 1}. ${n.name}`;
      
      details.appendChild(name);

      const score = document.createElement('span');
      score.className = 'rank-score';
      score.textContent = `${n.finalScore}%`;

      item.appendChild(details);
      item.appendChild(score);
      scoreboardList.appendChild(item);
    });

    // 5. Render Infrastructure Table Matrix
    matrixTbody.innerHTML = '';
    const maxRadiusMins = parseInt(transitRadius.value);

    scoredList.forEach(n => {
      const row = document.createElement('tr');

      // Neighborhood name
      const tdName = document.createElement('td');
      tdName.textContent = n.name;
      row.appendChild(tdName);

      // Grocery distance
      const tdGrocery = document.createElement('td');
      tdGrocery.textContent = `${n.groceryDist} miles (${Math.round(n.transitTime)} min)`;
      // Highlight warning if travel time exceeds acceptable travel offset limit
      if (n.transitTime > maxRadiusMins) {
        tdGrocery.className = 'td-error';
      }
      row.appendChild(tdGrocery);

      // Gym count
      const tdGym = document.createElement('td');
      tdGym.textContent = `${n.gymCount} gyms`;
      // Warn if fitness facilities are sparse
      if (n.gymCount < 2) {
        tdGym.className = 'td-warning';
      }
      row.appendChild(tdGym);

      // Trail miles
      const tdTrails = document.createElement('td');
      tdTrails.textContent = `${n.trailMiles} miles`;
      // Warn if trail connectivity is low
      if (n.trailMiles < 1.0) {
        tdTrails.className = 'td-warning';
      }
      row.appendChild(tdTrails);

      // Culinary variety index
      const tdCulinary = document.createElement('td');
      tdCulinary.textContent = `${Math.round(n.culinaryIndex * 100)}% density`;
      if (n.culinaryIndex < 0.2) {
        tdCulinary.className = 'td-warning';
      }
      row.appendChild(tdCulinary);

      // Transit decay penalty
      const tdDecay = document.createElement('td');
      tdDecay.textContent = n.decayPenalty > 0 ? `-${n.decayPenalty}%` : '0%';
      if (n.decayPenalty > 0) {
        tdDecay.className = 'text-orange';
      }
      row.appendChild(tdDecay);

      matrixTbody.appendChild(row);
    });
  }

  // =========================================================================
  // SIMULATED GPS SCANNER DISPLAY LOGGER
  // =========================================================================

  function initScannerLoop() {
    let scanCount = 0;
    setInterval(() => {
      scanCount++;
      const row = document.createElement('div');
      row.className = 'scanner-row';

      const timeSpan = document.createElement('span');
      timeSpan.textContent = `[${new Date().toTimeString().split(' ')[0]}]`;

      const neighborhood = neighborhoods[Math.floor(Math.random() * neighborhoods.length)];
      // Introduce minor random variance to coordinate scan line to simulate real-time mapping sweeps
      const varLat = neighborhood.lat + (Math.random() - 0.5) * 0.005;
      const varLon = neighborhood.lon + (Math.random() - 0.5) * 0.005;

      const coordSpan = document.createElement('span');
      coordSpan.className = 'scan-coord';
      coordSpan.textContent = `COORD: ${varLat.toFixed(4)}, ${varLon.toFixed(4)}`;

      const statusSpan = document.createElement('span');
      if (Math.random() > 0.4) {
        statusSpan.className = 'text-green';
        statusSpan.textContent = 'LOCK // OK';
      } else {
        statusSpan.className = 'scan-pulse';
        statusSpan.textContent = 'SWEEPING...';
      }

      row.appendChild(timeSpan);
      row.appendChild(coordSpan);
      row.appendChild(statusSpan);

      scannerGrid.appendChild(row);

      // Clip grid rows length to prevent overflows
      if (scannerGrid.children.length > 8) {
        scannerGrid.removeChild(scannerGrid.firstChild);
      }
    }, 1200);
  }

  // =========================================================================
  // EVENT LISTENERS & BOOT
  // =========================================================================

  function bindInputSlider(slider, readout, suffix = '') {
    slider.addEventListener('input', () => {
      readout.textContent = slider.value + suffix;
      renderDashboard();
    });
  }

  bindInputSlider(weightTrails, valWTrails);
  bindInputSlider(weightRetail, valWRetail);
  bindInputSlider(weightFitness, valWFitness);
  bindInputSlider(weightCulinary, valWCulinary);
  bindInputSlider(transitRadius, valTransitRadius, ' min');

  // Boot UI
  renderDashboard();
  initScannerLoop();
});
