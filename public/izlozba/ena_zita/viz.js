// Erasmus staff mobility — botanical data art edition
(function(){
  const width = 1200, height = 700, margin = 40;

  const svg = d3.select('#viz').append('svg')
    .attr('viewBox', `0 0 ${width} ${height}`)
    .attr('preserveAspectRatio','xMidYMid meet')
    .style('touch-action','none');

  const g = svg.append('g');

  let dataAll = [], years = [], selectedYear = null;
  let isPlaying = false, zoomBehavior = null;
  let isPlayAccumulating = false;      // true while play animation is building up
  let playAccumulatedYears = new Set(); // years shown so far in this play session
  let animFrameId = null;   // rAF handle for cursor animation
  let playTickTimeout = null; // setTimeout handle for play interval
  let cachedBtnPcts = null;   // pre-measured button center positions (% of track)
  let colorScale = null;
  let currentPeople = [], currentCities = [];
  let pinnedHighlight = null;
  let navHistory = [];           // [{pinnedHighlight, transform, html}] for panel back navigation
  let personSearchVal = '', citySearchVal = '';
  let infoPanelTimer = null;

  // Stable positions computed once from all data — nothing ever repositions
  let allCityPositions = new Map();   // cityKey → {x, y}
  let allPersonPositions = new Map(); // personName → {x, y}

  // Stable petal angle per city-person pair — hash-based so each visitor always
  // appears at the same position on the flower regardless of year
  function visitorAngle(cityKey, personName) {
    return (hashString(cityKey + '\x00' + personName) / 0xffffffff) * Math.PI * 2;
  }

  // Unique visitor list sorted consistently by name hash, each assigned an evenly-spaced angle
  function uniqueVisitors(d) {
    const seen = new Set();
    const vis = [];
    for (const v of d.visits) {
      if (!seen.has(v.full_name)) {
        seen.add(v.full_name);
        vis.push({name: v.full_name, color: colorScale(v.sastavnica_name || 'Ostalo / Nepoznato')});
      }
    }
    vis.sort((a, b) => hashString(a.name) - hashString(b.name));
    const rings = computeRings(vis.length);
    let idx = 0;
    for (const ring of rings) {
      for (let i = 0; i < ring.count; i++) {
        vis[idx].angle   = (i / ring.count) * Math.PI * 2 + ring.offset;
        vis[idx].innerR  = ring.innerR;
        vis[idx].wid     = ring.wid;
        vis[idx].ringIdx = ring.ringIdx;
        idx++;
      }
    }
    return vis;
  }

  // Petal dimensions matched to SVG reference proportions
  const PETAL_LEN    = 24;
  const CENTER_R     = 4;                         // ~15% of PETAL_LEN, matches SVG ratio
  const RING_INNER   = [CENTER_R, 10, 19];        // ring inner radii: 0→4, 1→10, 2→19
  const MAX_PER_RING = [8, 16, 24];               // fixed capacities per SVG reference
  // Per-ring petal widths — 1.4× the arc spacing so petals clearly overlap
  const RING_WID = MAX_PER_RING.map((n, ri) => {
    const midR = RING_INNER[ri] + PETAL_LEN * 0.4;
    return (2 * Math.PI * midR / n) * 1.4;
  });
  // Each outer ring is rotated by half the inner ring's step, so petals stagger
  // between the row in front rather than stacking directly behind them
  const RING_OFFSET = [0, Math.PI / MAX_PER_RING[0], Math.PI / MAX_PER_RING[1]];

  // Fixed-capacity concentric rings — outer rings filled after inner ones are full
  function computeRings(n) {
    const rings = [];
    let remaining = n;
    for (let ring = 0; ring < MAX_PER_RING.length && remaining > 0; ring++) {
      const count = Math.min(remaining, MAX_PER_RING[ring]);
      rings.push({ innerR: RING_INNER[ring], wid: RING_WID[ring], offset: RING_OFFSET[ring], count, ringIdx: ring });
      remaining -= count;
    }
    return rings;
  }

  // --- Path helpers ---

  // Petal starts at innerR from center and extends outward by len
  function petalPath(angle, len, wid, innerR) {
    innerR = innerR || 0;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const pc = Math.cos(angle + Math.PI/2), ps = Math.sin(angle + Math.PI/2);
    const bx = cos * innerR, by = sin * innerR;
    const tipx = cos * (innerR + len), tipy = sin * (innerR + len);
    const cp1x = bx + cos*len*0.25 - pc*wid*0.65, cp1y = by + sin*len*0.25 - ps*wid*0.65;
    const cp2x = bx + cos*len*0.25 + pc*wid*0.65, cp2y = by + sin*len*0.25 + ps*wid*0.65;
    return `M${bx},${by} C${cp1x},${cp1y} ${tipx-pc*wid*0.2},${tipy-ps*wid*0.2} ${tipx},${tipy}` +
           ` C${tipx+pc*wid*0.2},${tipy+ps*wid*0.2} ${cp2x},${cp2y} ${bx},${by}`;
  }

  // Seed — elongated teardrop, slightly asymmetric
  const seedPathD = `M 0,-9 C 5,-3 4.5,5 0,9 C -4,5 -5,-3 0,-9`;

  // Deterministic rotation per person so seeds look scattered
  function seedRotation(key) {
    const h = hashString(key);
    return ((h >>> 8) & 0xff) / 255 * 360;
  }

  // Organic vine — quadratic bezier
  function vinePath(px, py, cx, cy, curvature) {
    const midX = (px+cx)/2, midY = (py+cy)/2;
    const dx = cx-px, dy = cy-py;
    const len = Math.sqrt(dx*dx + dy*dy) || 1;
    const nx = -dy/len, ny = dx/len;
    return `M${px},${py} Q${midX+nx*curvature},${midY+ny*curvature} ${cx},${cy}`;
  }

  // Transform helpers
  function cityTx(d, sc) {
    return `translate(${d.x},${d.y})${sc != null ? ` scale(${sc})` : ''}`;
  }
  function budTx(d, sc) {
    return `translate(${d.x},${d.y}) rotate(${seedRotation(d.key)})${sc != null ? ` scale(${sc})` : ''}`;
  }

  // ---

  function makeTinyFlowerEl(color, size = 12) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '-5 -5 10 10');
    svg.style.cssText = `width:${size}px;height:${size}px;flex-shrink:0;display:block`;
    for (let i = 0; i < 8; i++) {
      const p = document.createElementNS(ns, 'path');
      p.setAttribute('d', petalPath((i / 8) * Math.PI * 2, 3.2, 1.3, 0.9));
      p.setAttribute('fill', color);
      p.setAttribute('opacity', '0.88');
      svg.appendChild(p);
    }
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('r', '0.9');
    c.setAttribute('fill', '#ffe8c8');
    c.setAttribute('opacity', '0.9');
    svg.appendChild(c);
    return svg;
  }

  function makeTinySeedEl(color) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '-5 -5 10 10');
    svg.style.cssText = 'width:20px;height:20px;flex-shrink:0;display:block';
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', 'M 0,-3.2 C 1.8,-1 1.6,1.8 0,3.2 C -1.4,1.8 -1.8,-1 0,-3.2');
    p.setAttribute('fill', color);
    p.setAttribute('opacity', '0.9');
    svg.appendChild(p);
    return svg;
  }

  function makeTinyCircleEl(color) {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '-6 -6 12 12');
    svg.style.cssText = 'width:12px;height:12px;flex-shrink:0;display:block';
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('r', '5');
    c.setAttribute('fill', color);
    c.setAttribute('opacity', '0.88');
    svg.appendChild(c);
    return svg;
  }

  function buildIntroFlower() {
    const colors = [
      '#5c7cfa','#3bc9db','#38d9a9','#ffd43b','#ffa94d',
      '#ff6b6b','#da77f2','#a9e34b','#ff922b','#f06595',
      '#15aabf','#be4bdb'
    ];
    const rotOffset = Math.random() * Math.PI * 2;
    const numPetals = 8 + Math.floor(Math.random() * 9); // 8–16 petals (ring 0 or ring 0+1)
    const rings = computeRings(numPetals);
    const fs = d3.select('#intro-flower');
    // Outer rings appended first (behind), inner last (in front)
    const ringsRev = [...rings].reverse();
    let delay = 0;
    for (const ring of ringsRev) {
      for (let i = 0; i < ring.count; i++) {
        const angle = (i / ring.count) * Math.PI * 2 + rotOffset + ring.offset;
        const color = colors[Math.floor(Math.random() * colors.length)];
        fs.append('path')
          .attr('d', petalPath(angle, PETAL_LEN, ring.wid, ring.innerR))
          .attr('fill', color)
          .attr('opacity', 0)
          .attr('transform', 'scale(0)')
          .transition().duration(500).delay(150 + delay * 55)
          .ease(d3.easeBackOut.overshoot(1.4))
          .attr('transform', 'scale(1)')
          .attr('opacity', 0.88);
        delay++;
      }
    }
    fs.append('circle').attr('r', CENTER_R).attr('fill', '#ffe8c8').attr('opacity', 0)
      .transition().duration(300).delay(150 + numPetals * 55)
      .attr('opacity', 0.9);
  }

  buildIntroFlower();

  d3.select('#intro-play').on('click', () => {
    d3.select('#intro-overlay').classed('fade-out', true);
    setTimeout(() => d3.select('#intro-overlay').style('display', 'none'), 700);
    togglePlay();
  });

  function parseRow(d){
    d.fi_lat  = d.fi_lat  ? +d.fi_lat  : null;
    d.fi_lon  = d.fi_lon  ? +d.fi_lon  : null;
    d.academic_year_start = d.academic_year_start ? +d.academic_year_start : null;
    d.full_name = d.full_name || (d.first_name + ' ' + d.last_name);
    return d;
  }

  d3.csv('staff_mobility_fi_map.csv', parseRow).then(rows => {
    dataAll = rows.filter(d => d.fi_lat && d.fi_lon && d.academic_year_start);
    years = [...Array.from(new Set(dataAll.map(d => d.academic_year_start))).sort((a,b) => a-b), 'all'];
    selectedYear = years[0];

    const faculties = Array.from(new Set(dataAll.map(d => d.sastavnica_name || 'Ostalo / Nepoznato'))).sort();
    const customColors = [
      '#5c7cfa','#3bc9db','#38d9a9','#4caf50','#a9e34b','#ffd43b','#ffa94d','#ff922b',
      '#ff6b6b','#f06595','#da77f2','#be4bdb','#7048e8','#845ef7','#15aabf','#099268',
      '#a61e4d','#e67700','#2b8a3e','#1c7ed6'
    ];
    colorScale = d3.scaleOrdinal().domain(faculties).range(customColors);

    // Compute all positions once — nothing moves after this
    computeAllPositions();

    setupYearControls();
    setupSidebarControls();
    setupPanelHandlers();
    attachZoom();
    update();
    // Measure button positions after layout, then place cursor without animation
    cacheButtonPcts(() => setCursorPct(getBtnPct(0)));
    fitAllCities();
  });

  // Lay out ALL cities that ever appear across all years and fix their positions.
  // Seed positions are anchored to these same city positions, also fixed.
  function computeAllPositions() {
    const allCities = groupedCities(dataAll);
    allCities.sort((a,b) => d3.ascending(a.key, b.key));
    layoutCitiesRings(allCities);
    allCityPositions = new Map(allCities.map(c => [c.key, {x: c.x, y: c.y}]));

    const cityPosMap = new Map(allCities.map(c => [c.key, [c.x, c.y]]));
    const byPerson = d3.group(dataAll, d => d.full_name);
    for (const [person, visitsArr] of byPerson) {
      const byCity = d3.group(visitsArr, d => (d.fi_city||'Nepoznato')+'|'+(d.fi_country||''));
      let sumX=0, sumY=0, total=0;
      for (const [ck, rows] of byCity) {
        const pos = cityPosMap.get(ck);
        if (!pos) continue;
        sumX += pos[0]*rows.length; sumY += pos[1]*rows.length; total += rows.length;
      }
      const baseX = total ? sumX/total : width/2;
      const baseY = total ? sumY/total : height/2;
      const j = jitterFromKey(person, 180);
      allPersonPositions.set(person, {x: baseX+j.x, y: baseY+j.y});
    }
  }

  function setupYearControls(){
    const yearsDiv = d3.select('#years');
    years.forEach(y => {
      yearsDiv.append('button')
        .text(y === 'all' ? 'Sve' : y)
        .attr('data-year', y)
        .on('click', () => { stopPlaying(); isPlayAccumulating = false; setYear(y); });
    });
    setActiveYearButton();
    d3.select('#back').on('click', () => {
      stopPlaying();
      isPlayAccumulating = false;
      playAccumulatedYears.clear();
      setYear(years[0]);
      resetZoom();
      pinnedHighlight = null;
      navHistory = [];
      hideInfoPanel();
      applyHighlight();
    });
    d3.select('#play').on('click', () => { togglePlay(); });
  }

  function closeSidebar() {
    d3.select('#sidebar').classed('collapsed', true);
    d3.select('#info-dot').classed('open', false);
    d3.select('#info-dot-icon').text('?');
  }

  function setupSidebarControls() {
    d3.select('#info-dot').on('click', () => {
      const sidebar = d3.select('#sidebar');
      const opening = sidebar.classed('collapsed');
      sidebar.classed('collapsed', !opening);
      d3.select('#info-dot').classed('open', opening);
      d3.select('#info-dot-icon').text(opening ? '×' : '?');
      if (opening) updateSidebar();
    });
    d3.select('#sidebar-close').on('click', () => closeSidebar());
    d3.select('#person-search').on('input', function() {
      stopPlaying();
      personSearchVal = this.value.trim().toLowerCase();
      if (personSearchVal) {
        const matches = new Set(currentPeople
          .filter(p => p.key.toLowerCase().includes(personSearchVal))
          .map(p => p.key));
        pinnedHighlight = matches.size > 0 ? {type:'persons', values:matches} : null;
      } else {
        pinnedHighlight = null;
      }
      applyHighlight(); updateSidebar();
    });
    d3.select('#city-search').on('input', function() {
      stopPlaying();
      citySearchVal = this.value.trim().toLowerCase();
      if (citySearchVal) {
        const matches = new Set(currentCities
          .filter(c => c.city.toLowerCase().includes(citySearchVal) ||
                       c.country.toLowerCase().includes(citySearchVal))
          .map(c => c.key));
        pinnedHighlight = matches.size > 0 ? {type:'cities', values:matches} : null;
      } else {
        pinnedHighlight = null;
      }
      applyHighlight(); updateSidebar();
    });
  }

  // --- Cursor animation helpers ---

  function setCursorPct(pct) {
    const el = document.getElementById('time-cursor');
    if (el) el.style.left = `${Math.max(0, Math.min(100, pct))}%`;
  }

  function getCursorPct() {
    const el = document.getElementById('time-cursor');
    return el ? parseFloat(el.style.left) || 0 : 0;
  }

  // Measure and cache each year button's center relative to the track.
  // Called once after DOM layout; pass a callback for when ready.
  function cacheButtonPcts(cb) {
    requestAnimationFrame(() => {
      const btns = document.querySelectorAll('#years button');
      const track = document.getElementById('time-track');
      if (!track || !btns.length) { if (cb) cb(); return; }
      const tr = track.getBoundingClientRect();
      if (!tr.width) { if (cb) cb(); return; }
      cachedBtnPcts = Array.from(btns).map(btn => {
        const r = btn.getBoundingClientRect();
        return ((r.left + r.width / 2 - tr.left) / tr.width) * 100;
      });
      if (cb) cb();
    });
  }

  function getBtnPct(idx) {
    if (cachedBtnPcts && idx >= 0 && idx < cachedBtnPcts.length) return cachedBtnPcts[idx];
    return years.length > 1 ? (idx / (years.length - 1)) * 100 : 50;
  }

  // Animate the cursor from fromPct to toPct over duration ms using easeFn.
  function animateCursor(fromPct, toPct, duration, easeFn) {
    cancelAnimationFrame(animFrameId);
    const t0 = performance.now();
    function tick(now) {
      const t = Math.min((now - t0) / duration, 1);
      setCursorPct(fromPct + (toPct - fromPct) * easeFn(t));
      if (t < 1) animFrameId = requestAnimationFrame(tick);
    }
    animFrameId = requestAnimationFrame(tick);
  }

  // Smooth cursor snap for manual year changes (ease-in-out, 500ms)
  function updateTimeCursor() {
    const idx = years.indexOf(selectedYear);
    const eio = t => t < 0.5 ? 2*t*t : -1 + (4 - 2*t)*t;
    animateCursor(getCursorPct(), getBtnPct(idx), 500, eio);
  }

  // One step of the play loop — moves cursor linearly across the interval,
  // then advances the year at the end and re-triggers itself.
  function playTick() {
    if (!isPlaying) return;
    const idx = years.indexOf(selectedYear);
    const nextIdx = idx + 1;
    if (nextIdx >= years.length) {
      stopPlaying();
      setTimeout(() => openSidebar(), 900);
      return;
    }
    animateCursor(getBtnPct(idx), getBtnPct(nextIdx), 2800, t => t);
    playTickTimeout = setTimeout(() => {
      setYear(years[nextIdx], true);
      if (isPlaying) playTick();
    }, 2800);
  }

  function setYear(y, fromPlay = false){
    if (!fromPlay) {
      // Manual year click — leave accumulated-play mode, show only this year
      isPlayAccumulating = false;
    } else if (y !== 'all') {
      playAccumulatedYears.add(y);
    }
    selectedYear = y;
    setActiveYearButton();
    if (!isPlaying) updateTimeCursor();
    update();
  }

  function setActiveYearButton(){
    const isAll = selectedYear === 'all';
    d3.selectAll('#years button').each(function(){
      const attr = this.getAttribute('data-year');
      const y = attr === 'all' ? 'all' : +attr;
      d3.select(this)
        .classed('active', y === selectedYear)
        .classed('past',   !isAll && typeof y === 'number' && y < selectedYear)
        .classed('future', !isAll && typeof y === 'number' && y > selectedYear);
    });
  }

  function togglePlay(){
    if (isPlaying) { stopPlaying(); return; }
    isPlaying = true;
    // Seed accumulated set with every year up to and including the current one
    isPlayAccumulating = true;
    playAccumulatedYears = new Set();
    const startIdx = years.indexOf(selectedYear);
    for (let i = 0; i <= startIdx; i++) {
      if (years[i] !== 'all') playAccumulatedYears.add(years[i]);
    }
    update(); // re-render current year in accumulated mode before first tick
    d3.select('#play').text('Pauza');
    playTick();
  }

  function stopPlaying(){
    clearTimeout(playTickTimeout); playTickTimeout = null;
    cancelAnimationFrame(animFrameId); animFrameId = null;
    isPlaying = false;
    d3.select('#play').text('Pokreni');
    updateTimeCursor(); // glide back to resting position of current year
  }

  function attachZoom(){
    zoomBehavior = d3.zoom()
      .scaleExtent([0.2, 6])
      .on('zoom', (event) => { g.attr('transform', event.transform); });
    svg.call(zoomBehavior).on('click', (event) => {
      if (event.target !== svg.node()) return;
      pinnedHighlight = null;
      navHistory = [];
      hideInfoPanel();
      applyHighlight();
    });
  }

  function resetZoom(){
    if(!zoomBehavior) return;
    svg.transition().duration(300).call(zoomBehavior.transform, d3.zoomIdentity);
  }

  function zoomTo(x, y, scale = 2){
    if(!zoomBehavior) return;
    svg.transition().duration(750).call(
      zoomBehavior.transform,
      d3.zoomIdentity.translate(width/2 - x*scale, height/2 - y*scale).scale(scale)
    );
  }

  // Zoom to fit a set of {x,y} points with padding
  function zoomToFit(points, padding) {
    if(!zoomBehavior || !points.length) return;
    padding = padding || 120;
    const xs = points.map(p=>p.x), ys = points.map(p=>p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const y0 = Math.min(...ys), y1 = Math.max(...ys);
    const bw = (x1-x0) + padding*2, bh = (y1-y0) + padding*2;
    const scale = Math.min(width/bw, height/bh, 2.5);
    const cx = (x0+x1)/2, cy = (y0+y1)/2;
    svg.transition().duration(750).call(
      zoomBehavior.transform,
      d3.zoomIdentity.translate(width/2 - cx*scale, height/2 - cy*scale).scale(scale)
    );
  }

  // Fit the initial viewport to show all cities with no animation
  function fitAllCities() {
    const positions = Array.from(allCityPositions.values());
    if(!positions.length || !zoomBehavior) return;
    const pad = 90;
    const xs = positions.map(p=>p.x), ys = positions.map(p=>p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs);
    const y0 = Math.min(...ys), y1 = Math.max(...ys);
    const bw = (x1-x0)+pad*2, bh = (y1-y0)+pad*2;
    const scale = Math.min(width/bw, height/bh, 1.0);
    const cx = (x0+x1)/2, cy = (y0+y1)/2;
    svg.call(
      zoomBehavior.transform,
      d3.zoomIdentity.translate(width/2 - cx*scale, height/2 - cy*scale).scale(scale)
    );
  }

  function openSidebar() {
    const sidebar = d3.select('#sidebar');
    if (sidebar.classed('collapsed')) {
      sidebar.classed('collapsed', false);
      d3.select('#info-dot').classed('open', true);
      d3.select('#info-dot-icon').text('×');
      updateSidebar();
    }
  }

  function pushNav() {
    navHistory.push({
      pinnedHighlight: pinnedHighlight ? {...pinnedHighlight} : null,
      transform: d3.zoomTransform(svg.node()),
      html: document.getElementById('info-panel-content').innerHTML
    });
    updateBackButton();
  }

  function updateBackButton() {
    d3.select('#panel-back').classed('hidden', navHistory.length === 0);
  }

  function showInfoPanel(html) {
    d3.select('#info-panel-content').html(html);
    d3.select('#info-panel').classed('visible', true);
    updateBackButton();
  }

  function hideInfoPanel() {
    clearTimeout(infoPanelTimer);
    d3.select('#info-panel').classed('visible', false);
    navHistory = [];
    updateBackButton();
  }

  function interruptVines() {
    g.selectAll('path.visit-vine')
      .interrupt()
      .attr('stroke-dasharray', null)
      .attr('stroke-dashoffset', null);
  }

  // Grow selected vines from nothing then settle solid — used on tap/click
  function growVines(vineSelection) {
    vineSelection.each(function() {
      const el = d3.select(this);
      const len = this.getTotalLength();
      if (!len) return;
      el.attr('stroke-dasharray', `${len} ${len}`)
        .attr('stroke-dashoffset', len)
        .transition('grow')
        .duration(Math.min(600 + len * 1.8, 1800))
        .ease(d3.easeCubicOut)
        .attr('stroke-dashoffset', 0)
        .on('end', function() {
          d3.select(this).attr('stroke-dasharray', null).attr('stroke-dashoffset', null);
        });
    });
  }

  // Grow a brand-new vine — fast=true during play to reduce simultaneous transitions
  function growVineIn(el, fast) {
    const len = el.node().getTotalLength();
    if (!len) return;
    const dur = fast ? Math.min(250 + len * 0.5, 600) : Math.min(500 + len * 1.4, 1600);
    el.attr('stroke-dasharray', `${len} ${len}`)
      .attr('stroke-dashoffset', len)
      .transition('vine-grow')
      .duration(dur)
      .ease(d3.easeCubicOut)
      .attr('stroke-dashoffset', 0)
      .on('end', function() {
        d3.select(this).attr('stroke-dasharray', null).attr('stroke-dashoffset', null);
      });
  }

  function groupedCities(filtered){
    const map = new Map();
    filtered.forEach(d => {
      const key = (d.fi_city||'Nepoznato')+'|'+(d.fi_country||'');
      if(!map.has(key)){
        map.set(key, {key, city:d.fi_city||'Nepoznato', country:d.fi_country||'', lons:[], lats:[], visits:[]});
      }
      const e = map.get(key);
      e.lons.push(d.fi_lon); e.lats.push(d.fi_lat); e.visits.push(d);
    });
    return Array.from(map.values()).map(c => ({...c, lon:d3.mean(c.lons), lat:d3.mean(c.lats)}));
  }

  function layoutCitiesRings(cities){
    const cx = width/2, cy = height/2;
    const ringGap = 140, minPerRing = 10;
    let index = 0, ring = 0;
    while(index < cities.length){
      const count = Math.max(minPerRing, Math.round(minPerRing + ring*6));
      const radius = ringGap * (ring+1);
      for(let i = 0; i < count && index < cities.length; i++){
        const angle = (i/count)*Math.PI*2 + ring*0.2;
        cities[index].x = cx + Math.cos(angle)*radius;
        cities[index].y = cy + Math.sin(angle)*radius;
        index++;
      }
      ring++;
    }
  }

  function hashString(str){
    let h = 0;
    for(let i=0;i<str.length;i++) h = (h*31+str.charCodeAt(i))>>>0;
    return h;
  }

  function jitterFromKey(key, scale){
    const h = hashString(String(key));
    const angle = ((h&0xffff)/0xffff)*Math.PI*2;
    const minR = scale*0.35;
    const r = minR + (((h>>>16)&0xffff)/0xffff)*(scale-minR);
    return {x:Math.cos(angle)*r, y:Math.sin(angle)*r};
  }

  function update(){
    interruptVines();
    const isAll = selectedYear === 'all';
    // Play mode: accumulate all years seen so far. Manual click: just this year.
    const filtered = isAll
      ? dataAll
      : isPlayAccumulating
        ? dataAll.filter(d => playAccumulatedYears.has(d.academic_year_start))
        : dataAll.filter(d => d.academic_year_start === selectedYear);
    const cities = groupedCities(filtered);

    cities.forEach(c => {
      const pos = allCityPositions.get(c.key);
      if(pos){ c.x = pos.x; c.y = pos.y; }
    });

    if(cities.length === 0){
      g.selectAll('path.visit-vine').transition().duration(300).style('opacity',0).remove();
      g.selectAll('g.city-group').transition().duration(300).style('opacity',0).remove();
      g.selectAll('g.person-bud').transition().duration(300).style('opacity',0).remove();
      currentPeople = []; currentCities = [];
      updateSidebar(); return;
    }

    currentCities = cities;

    // --- People + vines ---
    const people = [];
    const personPosMap = new Map();

    // 'all' mode uses full dataset so city-click can reveal every visitor's seed
    const peopleSource = isAll ? dataAll : filtered;
    const byPersonFiltered = d3.group(peopleSource, d => d.full_name);
    for(const [person, visitsArr] of byPersonFiltered){
      const pos = allPersonPositions.get(person);
      if(!pos) continue;
      personPosMap.set(person, [pos.x, pos.y]);
      people.push({key:person, x:pos.x, y:pos.y, row:visitsArr[0], visits:visitsArr});
    }
    currentPeople = people;

    const citiesMap = new Map(cities.map(c => [c.key, c]));
    const vines = [];

    if (!isAll) {
      // Year mode: one vine per visit (multiple per person-city pair = repeat visits)
      const byPersonCity = d3.group(filtered, d=>d.full_name, d=>(d.fi_city||'Nepoznato')+'|'+(d.fi_country||''));
      for(const [person, cityMap] of byPersonCity){
        const pos = personPosMap.get(person);
        if(!pos) continue;
        const [px, py] = pos;
        for(const [cityKey, visitsArr] of cityMap){
          const city = citiesMap.get(cityKey);
          if(!city) continue;
          visitsArr.sort((a,b) => a.academic_year_start-b.academic_year_start)
            .forEach((v, i) => {
              const curvature = (i-(visitsArr.length-1)/2)*28;
              vines.push({
                key: person+'|'+cityKey+'|'+(v.row_id || (v.academic_year_start+'_'+i)),
                px, py, cx:city.x, cy:city.y, curvature,
                faculty: v.sastavnica_name||'Ostalo / Nepoznato'
              });
            });
        }
      }
    } else {
      // 'all' mode: one vine per person-city pair, hidden until city is clicked
      const byPersonCityAll = d3.group(dataAll, d=>d.full_name, d=>(d.fi_city||'Nepoznato')+'|'+(d.fi_country||''));
      for(const [person, cityMap] of byPersonCityAll){
        const pos = personPosMap.get(person);
        if(!pos) continue;
        const [px, py] = pos;
        for(const [cityKey, visitsArr] of cityMap){
          const city = citiesMap.get(cityKey);
          if(!city) continue;
          const curvature = ((hashString(person + cityKey) & 0xff) / 255 - 0.5) * 50;
          vines.push({
            key: person+'|'+cityKey+'|all',
            px, py, cx:city.x, cy:city.y, curvature,
            faculty: visitsArr[0].sastavnica_name||'Ostalo / Nepoznato'
          });
        }
      }
    }

    const vineSel = g.selectAll('path.visit-vine').data(vines, d => d.key);
    const vineEnter = vineSel.enter().append('path')
      .attr('class','visit-vine')
      .attr('d', d => vinePath(d.px,d.py,d.cx,d.cy,d.curvature))
      .attr('stroke', d => colorScale(d.faculty))
      .style('opacity', isAll ? 0 : null);
    if (!isAll) vineEnter.each(function(){ growVineIn(d3.select(this), isPlaying); });
    vineSel.attr('d', d => vinePath(d.px,d.py,d.cx,d.cy,d.curvature))
      .attr('stroke', d => colorScale(d.faculty));
    vineSel.exit().transition().duration(350).style('opacity',0).remove();

    // --- Render city flowers ---
    const cityGroupSel = g.selectAll('g.city-group').data(cities, d => d.key);

    const cityEnter = cityGroupSel.enter().append('g')
      .attr('class','city-group')
      .attr('transform', d => cityTx(d, 0))
      .on('click', function(e, d){
        e.stopPropagation(); stopPlaying();
        if(pinnedHighlight && pinnedHighlight.type==='city' && pinnedHighlight.value===d.key){
          pinnedHighlight = null; navHistory = []; hideInfoPanel();
        } else {
          pushNav();
          pinnedHighlight = {type:'city', value:d.key};
          const visitorNames = new Set(d.visits.map(v=>v.full_name));
          const seedPts = currentPeople.filter(p=>visitorNames.has(p.key)).map(p=>({x:p.x,y:p.y}));
          zoomToFit([{x:d.x,y:d.y}, ...seedPts], 100);
          showInfoPanel(buildCityPanelHtml(d));
        }
        applyHighlight();
      });

    cityEnter.append('g').attr('class','city-petals-group');
    cityEnter.append('circle').attr('class','city-center').attr('r', CENTER_R);

    // Pre-build petals for entering cities using per-ring layers for correct z-order.
    // Ring layers appended in reverse index order so outer rings sit behind inner rings.
    cityEnter.each(function(d){
      const vis = uniqueVisitors(d);
      const pg = d3.select(this).select('g.city-petals-group');
      for (let ri = MAX_PER_RING.length - 1; ri >= 0; ri--) {
        pg.append('g').attr('class', 'ring-layer').attr('data-ring', ri);
      }
      vis.forEach(v => {
        pg.select(`g.ring-layer[data-ring="${v.ringIdx}"]`)
          .append('path').attr('class','city-petal')
          .attr('d', petalPath(v.angle, PETAL_LEN, v.wid, v.innerR))
          .attr('fill', v.color);
      });
    });

    cityEnter.transition('bloom')
      .duration(isPlaying ? 450 : 1000)
      .ease(d3.easeBackOut.overshoot(1.15))
      .attr('transform', d => cityTx(d));

    // Existing cities: petals keyed by visitor name within each ring layer
    cityGroupSel.each(function(d){
      const vis = uniqueVisitors(d);
      const pg = d3.select(this).select('g.city-petals-group');
      const byRing = d3.group(vis, v => v.ringIdx);

      for (let ri = 0; ri < MAX_PER_RING.length; ri++) {
        const ringVis = byRing.get(ri) || [];
        const ringLayer = pg.select(`g.ring-layer[data-ring="${ri}"]`);
        if (ringLayer.empty()) continue;
        const petalSel = ringLayer.selectAll('path.city-petal').data(ringVis, v => v.name);

        petalSel
          .transition('petal-reposition')
          .duration(isPlaying ? 300 : 700)
          .ease(d3.easeQuadInOut)
          .attr('d', v => petalPath(v.angle, PETAL_LEN, v.wid, v.innerR))
          .attr('fill', v => v.color);

        petalSel.enter().append('path')
          .attr('class','city-petal')
          .attr('d', v => petalPath(v.angle, PETAL_LEN, v.wid, v.innerR))
          .attr('fill', v => v.color)
          .attr('transform','scale(0)')
          .transition('petal-bloom')
          .duration(isPlaying ? 300 : 750)
          .delay(isPlaying ? 0 : (v, i) => i * 90)
          .ease(d3.easeBackOut.overshoot(1.5))
          .attr('transform','scale(1)');

        petalSel.exit()
          .transition('petal-exit').duration(350).ease(d3.easeCubicIn)
          .attr('transform','scale(0)').remove();
      }
    });

    cityGroupSel.exit().transition().duration(400).style('opacity',0).remove();

    // --- Render person seeds ---
    // Year mode: visible, emerge animation. 'all' mode: hidden (opacity 0), revealed on city click.
    const peopleSel = g.selectAll('g.person-bud').data(people, d => d.key);

    const peopleEnter = peopleSel.enter().append('g')
      .attr('class','person-bud')
      .attr('transform', d => isAll ? budTx(d) : budTx(d, 0))
      .style('opacity', isAll ? 0 : null)
      .on('click', function(e, d){
        e.stopPropagation(); stopPlaying();
        if(pinnedHighlight && pinnedHighlight.type==='person' && pinnedHighlight.value===d.key){
          pinnedHighlight = null; navHistory = []; hideInfoPanel();
        } else {
          pushNav();
          pinnedHighlight = {type:'person', value:d.key};
          const visitedKeys = new Set(d.visits.map(v=>(v.fi_city||'Nepoznato')+'|'+(v.fi_country||'')));
          const pts = [{x:d.x,y:d.y}, ...currentCities.filter(c=>visitedKeys.has(c.key)).map(c=>({x:c.x,y:c.y}))];
          zoomToFit(pts, 120);
          showInfoPanel(buildPersonPanelHtml(d));
        }
        applyHighlight();
      });

    peopleEnter.append('path').attr('class','seed-shape')
      .attr('d', seedPathD)
      .attr('fill', d => colorScale(d.row.sastavnica_name||'Ostalo / Nepoznato'));

    if (!isAll) {
      peopleEnter.transition('emerge')
        .duration(isPlaying ? 350 : 900)
        .delay(isPlaying ? (d, i) => Math.min(i * 5, 100) : (d, i) => i * 22)
        .ease(d3.easeBackOut.overshoot(1.5))
        .attr('transform', d => budTx(d));
    }

    peopleSel.select('path.seed-shape')
      .attr('fill', d => colorScale(d.row.sastavnica_name||'Ostalo / Nepoznato'));

    if (isAll) {
      peopleSel.transition().duration(400).style('opacity', 0).attr('transform', d => budTx(d));
    } else {
      peopleSel.style('opacity', 0.9).attr('transform', d => budTx(d));
    }

    peopleSel.exit().transition().duration(350).style('opacity',0).remove();

    updateSidebar();
  }

  function applyHighlight(){
    d3.selectAll('.legend-item').classed('pinned', false);
    d3.selectAll('.stats-item').classed('pinned', false);

    if(pinnedHighlight){
      const {type, value, values} = pinnedHighlight;
      if(type==='faculty') d3.selectAll('.legend-item').filter(d=>d&&d.name===value).classed('pinned',true);
      else if(type==='person') d3.selectAll('.stats-item').filter(d=>d&&d.key===value).classed('pinned',true);
      else if(type==='city') d3.selectAll('.stats-item').filter(d=>d&&d.key===value).classed('pinned',true);
      else if(type==='persons') d3.selectAll('.stats-item').filter(d=>d&&values&&values.has(d.key)).classed('pinned',true);
      else if(type==='cities') d3.selectAll('.stats-item').filter(d=>d&&values&&values.has(d.key)).classed('pinned',true);
    }

    interruptVines();

    if(!pinnedHighlight){
      const isAll = selectedYear === 'all';
      g.selectAll('g.person-bud').style('opacity', isAll ? 0 : 0.9).attr('transform', d=>budTx(d));
      g.selectAll('path.visit-vine').style('opacity', isAll ? 0 : 0.22).style('stroke-width',1);
      g.selectAll('g.city-group').style('opacity',0.9).attr('transform', d=>cityTx(d));
      return;
    }

    const {type, value, values} = pinnedHighlight;
    let litVines;

    if(type==='faculty'){
      g.selectAll('g.person-bud')
        .style('opacity', d=>(d.row.sastavnica_name||'Ostalo / Nepoznato')===value?1.0:0.07)
        .attr('transform', d=>budTx(d));
      litVines = g.selectAll('path.visit-vine')
        .style('opacity', d=>d.faculty===value?0.75:0.02)
        .style('stroke-width', d=>d.faculty===value?1.8:0.5)
        .filter(d=>d.faculty===value);
      const vc = new Set();
      g.selectAll('g.person-bud').filter(d=>(d.row.sastavnica_name||'Ostalo / Nepoznato')===value)
        .each(d=>d.visits.forEach(v=>vc.add((v.fi_city||'Nepoznato')+'|'+(v.fi_country||''))));
      g.selectAll('g.city-group').style('opacity', d=>vc.has(d.key)?1.0:0.1).attr('transform',d=>cityTx(d));
      growVines(litVines);

    } else if(type==='person'){
      g.selectAll('g.person-bud')
        .style('opacity', d=>d.key===value?1.0:0.07)
        .attr('transform', d=>budTx(d, d.key===value?1.6:null));
      litVines = g.selectAll('path.visit-vine')
        .style('opacity', d=>d.key.startsWith(value+'|')?0.85:0.02)
        .style('stroke-width', d=>d.key.startsWith(value+'|')?2.2:0.5)
        .filter(d=>d.key.startsWith(value+'|'));
      const vc = new Set();
      const pd = currentPeople.find(p=>p.key===value);
      if(pd) pd.visits.forEach(v=>vc.add((v.fi_city||'Nepoznato')+'|'+(v.fi_country||'')));
      g.selectAll('g.city-group')
        .style('opacity', d=>vc.has(d.key)?1.0:0.1)
        .attr('transform', d=>cityTx(d, vc.has(d.key)?1.2:null));
      growVines(litVines);

    } else if(type==='city'){
      g.selectAll('g.city-group')
        .style('opacity', d=>d.key===value?1.0:0.1)
        .attr('transform', d=>cityTx(d, d.key===value?1.35:null));
      litVines = g.selectAll('path.visit-vine')
        .style('opacity', d=>d.key.includes('|'+value+'|')?0.85:0.02)
        .style('stroke-width', d=>d.key.includes('|'+value+'|')?2.2:0.5)
        .filter(d=>d.key.includes('|'+value+'|'));
      const vs = new Set();
      const cd = currentCities.find(c=>c.key===value);
      if(cd) cd.visits.forEach(v=>vs.add(v.full_name));
      const isAllMode = selectedYear === 'all';
      g.selectAll('g.person-bud')
        .style('opacity', d=>vs.has(d.key)?1.0:(isAllMode?0:0.07))
        .attr('transform', d=>budTx(d, vs.has(d.key)?1.4:null));
      growVines(litVines);

    } else if(type==='persons'){
      // Search-based: highlight all matching people and their connected cities
      g.selectAll('g.person-bud')
        .style('opacity', d=>values.has(d.key)?1.0:0.06)
        .attr('transform', d=>budTx(d, values.has(d.key)?1.4:null));
      litVines = g.selectAll('path.visit-vine')
        .style('opacity', d=>values.has(d.key.split('|')[0])?0.72:0.02)
        .style('stroke-width', d=>values.has(d.key.split('|')[0])?1.8:0.5)
        .filter(d=>values.has(d.key.split('|')[0]));
      const vc = new Set();
      currentPeople.filter(p=>values.has(p.key))
        .forEach(p=>p.visits.forEach(v=>vc.add((v.fi_city||'Nepoznato')+'|'+(v.fi_country||''))));
      g.selectAll('g.city-group')
        .style('opacity', d=>vc.has(d.key)?1.0:0.1)
        .attr('transform', d=>cityTx(d, vc.has(d.key)?1.1:null));
      growVines(litVines);

    } else if(type==='cities'){
      // Search-based: highlight all matching cities and their visitors
      g.selectAll('g.city-group')
        .style('opacity', d=>values.has(d.key)?1.0:0.1)
        .attr('transform', d=>cityTx(d, values.has(d.key)?1.25:null));
      litVines = g.selectAll('path.visit-vine')
        .style('opacity', d=>{ const p=d.key.split('|'); return values.has(p.slice(1,3).join('|'))?0.72:0.02; })
        .style('stroke-width', d=>{ const p=d.key.split('|'); return values.has(p.slice(1,3).join('|'))?1.8:0.5; })
        .filter(d=>{ const p=d.key.split('|'); return values.has(p.slice(1,3).join('|')); });
      const vs = new Set();
      currentCities.filter(c=>values.has(c.key))
        .forEach(c=>c.visits.forEach(v=>vs.add(v.full_name)));
      g.selectAll('g.person-bud')
        .style('opacity', d=>vs.has(d.key)?1.0:0.07)
        .attr('transform', d=>budTx(d, vs.has(d.key)?1.4:null));
      growVines(litVines);
    }
  }

  // --- Inline SVG string helpers for panel HTML ---

  function tinyFlowerSvgStr(color, size = 16) {
    const petals = Array.from({length: 8}, (_, i) =>
      `<path d="${petalPath((i/8)*Math.PI*2, 3.2, 1.3, 0.9)}" fill="${color}" opacity="0.88"/>`
    ).join('');
    return `<svg viewBox="-5 -5 10 10" style="width:${size}px;height:${size}px;flex-shrink:0;display:block;vertical-align:middle">${petals}<circle r="0.9" fill="#ffe8c8" opacity="0.9"/></svg>`;
  }

  function tinySeedSvgStr(color, size = 16) {
    return `<svg viewBox="-5 -5 10 10" style="width:${size}px;height:${size}px;flex-shrink:0;display:block;vertical-align:middle"><path d="M 0,-3.2 C 1.8,-1 1.6,1.8 0,3.2 C -1.4,1.8 -1.8,-1 0,-3.2" fill="${color}" opacity="0.9"/></svg>`;
  }

  function tinyCircleSvgStr(color, size = 10) {
    return `<svg viewBox="-6 -6 12 12" style="width:${size}px;height:${size}px;flex-shrink:0;display:block;vertical-align:middle"><circle r="5" fill="${color}" opacity="0.88"/></svg>`;
  }

  // --- Info panel content builders ---

  function buildCityPanelHtml(d) {
    const uv = new Set(d.visits.map(v => v.full_name)).size;
    const visitorNames = new Set(d.visits.map(v => v.full_name));
    const visitors = currentPeople
      .filter(p => visitorNames.has(p.key))
      .map(p => ({...p, visitCount: d.visits.filter(v => v.full_name === p.key).length}));

    // Group by faculty, sorted by total visits descending
    const byFaculty = d3.group(visitors, p => p.row.sastavnica_name || 'Ostalo / Nepoznato');
    const facGroups = Array.from(byFaculty.entries())
      .map(([fac, members]) => ({
        fac,
        members: members.sort((a,b) => d3.descending(a.visitCount, b.visitCount) || d3.ascending(a.key, b.key)),
        total: members.reduce((s,m) => s + m.visitCount, 0)
      }))
      .sort((a,b) => d3.descending(a.total, b.total) || d3.ascending(a.fac, b.fac));

    const groupsHtml = facGroups.map(({fac, members}) => {
      const col = colorScale(fac);
      const membersHtml = members.map(p =>
        `<div class="panel-list-item" data-type="person" data-key="${p.key}">
          ${tinySeedSvgStr(col, 14)}
          <span class="panel-item-name" title="${p.key}">${p.key}</span>
          <span class="panel-item-count">${p.visitCount}×</span>
        </div>`
      ).join('');
      return `<div class="panel-faculty-group">
        <div class="panel-faculty-header">${tinyCircleSvgStr(col, 9)}<span class="panel-faculty-name">${fac}</span></div>
        ${membersHtml}
      </div>`;
    }).join('');

    const content = facGroups.length
      ? groupsHtml
      : '<span style="color:#4a6a54;font-size:12px">Nema posjetitelja za ovo razdoblje</span>';
    return `<div class="panel-main">
      <strong>${d.city}</strong>
      <span class="panel-subtitle">${d.country}</span>
      <span class="panel-subtitle">${uv} ${uv===1?'posjetitelj':'posjetitelja'} · ${d.visits.length} ${d.visits.length===1?'posjet':'posjeta'}</span>
    </div>
    <div class="panel-section-title">Posjetitelji po fakultetu</div>
    <div>${content}</div>`;
  }

  function buildPersonPanelHtml(p) {
    const fac = p.row.sastavnica_name || 'Ostalo / Nepoznato';
    const byCityKey = d3.group(p.visits, v => (v.fi_city||'Nepoznato')+'|'+(v.fi_country||''));
    const cityEntries = Array.from(byCityKey.entries())
      .map(([ck, vs]) => ({key:ck, city:vs[0].fi_city||'Nepoznato', country:vs[0].fi_country||'', count:vs.length}))
      .sort((a,b) => d3.descending(a.count, b.count) || d3.ascending(a.city, b.city));
    const listHtml = cityEntries.map(c =>
      `<div class="panel-list-item" data-type="city" data-key="${c.key}">
        ${tinyFlowerSvgStr('#c8dece', 16)}
        <span class="panel-item-name" title="${c.city}, ${c.country}">${c.city}${c.country?', '+c.country:''}</span>
        <span class="panel-item-count">${c.count}×</span>
      </div>`
    ).join('');
    return `<div class="panel-main">
      <strong>${p.key}</strong>
      <span class="panel-subtitle" style="color:${colorScale(fac)}">${fac}</span>
      <span class="panel-subtitle">${p.visits.length} ${p.visits.length===1?'posjet':'posjeta'} ukupno</span>
    </div>
    <div class="panel-section-title">Destinacije</div>
    <div>${listHtml}</div>`;
  }

  function buildFacultyPanelHtml(facName) {
    const col = colorScale(facName);
    const members = currentPeople
      .filter(p => (p.row.sastavnica_name||'Ostalo / Nepoznato') === facName)
      .sort((a,b) => d3.descending(a.visits.length, b.visits.length) || d3.ascending(a.key, b.key));
    const totalVisits = members.reduce((s,p) => s + p.visits.length, 0);
    const listHtml = members.map(p =>
      `<div class="panel-list-item" data-type="person" data-key="${p.key}">
        ${tinySeedSvgStr(col, 14)}
        <span class="panel-item-name" title="${p.key}">${p.key}</span>
        <span class="panel-item-count">${p.visits.length} posj.</span>
      </div>`
    ).join('');
    return `<div class="panel-main">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:3px">${tinyCircleSvgStr(col, 13)}<strong style="margin:0">${facName}</strong></div>
      <span class="panel-subtitle">${members.length} ${members.length===1?'djelatnik':'djelatnika'} · ${totalVisits} posjeta</span>
    </div>
    <div class="panel-section-title">Djelatnici</div>
    <div>${listHtml}</div>`;
  }

  function setupPanelHandlers() {
    d3.select('#panel-back').on('click', () => {
      if (!navHistory.length) return;
      const prev = navHistory.pop();
      pinnedHighlight = prev.pinnedHighlight;
      svg.transition().duration(600).call(zoomBehavior.transform, prev.transform);
      if (prev.html) {
        d3.select('#info-panel-content').html(prev.html);
        d3.select('#info-panel').classed('visible', true);
      } else {
        hideInfoPanel();
      }
      updateBackButton();
      applyHighlight();
      updateSidebar();
    });

    d3.select('#panel-close').on('click', () => {
      pinnedHighlight = null;
      navHistory = [];
      hideInfoPanel();
      applyHighlight();
      updateSidebar();
    });

    d3.select('#info-panel-content').on('click', function(event) {
      const item = event.target.closest('.panel-list-item');
      if (!item) return;
      const type = item.dataset.type;
      const key = item.dataset.key;
      if (type === 'person') {
        const person = currentPeople.find(p => p.key === key);
        if (!person) return;
        pushNav();
        pinnedHighlight = {type:'person', value:key};
        const vk = new Set(person.visits.map(v => (v.fi_city||'Nepoznato')+'|'+(v.fi_country||'')));
        const pts = [{x:person.x,y:person.y}, ...currentCities.filter(c=>vk.has(c.key)).map(c=>({x:c.x,y:c.y}))];
        zoomToFit(pts, 120);
        showInfoPanel(buildPersonPanelHtml(person));
        applyHighlight(); updateSidebar();
      } else if (type === 'city') {
        const city = currentCities.find(c => c.key === key)
          || (() => { const pos = allCityPositions.get(key); return pos ? {key, city:key.split('|')[0], country:key.split('|')[1]||'', visits:[], x:pos.x, y:pos.y} : null; })();
        if (!city) return;
        pushNav();
        pinnedHighlight = {type:'city', value:key};
        const vn = new Set(city.visits.map(v => v.full_name));
        const sp = [{x:city.x,y:city.y}, ...currentPeople.filter(p=>vn.has(p.key)).map(p=>({x:p.x,y:p.y}))];
        zoomToFit(sp.length > 1 ? sp : [{x:city.x,y:city.y}], 100);
        showInfoPanel(buildCityPanelHtml(city));
        applyHighlight(); updateSidebar();
      }
    });
  }

  function updateSidebar(){
    // Skip the entire DOM rebuild if the sidebar is collapsed — invisible work
    if (d3.select('#sidebar').classed('collapsed')) return;
    const legendList = d3.select('#legend-list');
    legendList.selectAll('*').remove();
    const facultyCounts = d3.rollup(currentPeople, v=>v.length, d=>d.row.sastavnica_name||'Ostalo / Nepoznato');
    const allFaculties = colorScale.domain().map(fac=>({name:fac, count:facultyCounts.get(fac)||0}));
    allFaculties.sort((a,b)=>d3.descending(a.count,b.count)||d3.ascending(a.name,b.name));

    allFaculties.forEach(fac=>{
      const item = legendList.append('div').datum(fac)
        .attr('class','legend-item').style('opacity',fac.count>0?1:0.3)
        .on('click', e=>{
          e.stopPropagation(); stopPlaying();
          if(fac.count>0){
            if(pinnedHighlight&&pinnedHighlight.type==='faculty'&&pinnedHighlight.value===fac.name){
              pinnedHighlight=null; navHistory=[]; hideInfoPanel();
            } else {
              pushNav();
              pinnedHighlight={type:'faculty',value:fac.name};
              showInfoPanel(buildFacultyPanelHtml(fac.name));
            }
            applyHighlight();
          }
        });
      item.node().appendChild(makeTinyCircleEl(colorScale(fac.name)));
      item.append('span').attr('class','legend-name').text(`${fac.name} (${fac.count})`);
    });

    const personList = d3.select('#person-list');
    personList.selectAll('*').remove();
    let filteredPeople = currentPeople;
    if(personSearchVal.trim()){
      const s = personSearchVal.toLowerCase();
      filteredPeople = currentPeople.filter(p=>p.key.toLowerCase().includes(s));
    }
    const sortedPeople = [...filteredPeople].sort((a,b)=>d3.descending(a.visits.length,b.visits.length)||d3.ascending(a.key,b.key));
    sortedPeople.forEach(p=>{
      const fac = p.row.sastavnica_name||'Ostalo / Nepoznato';
      const item = personList.append('div').datum(p).attr('class','stats-item')
        .on('click', e=>{
          e.stopPropagation(); stopPlaying();
          if(pinnedHighlight&&pinnedHighlight.type==='person'&&pinnedHighlight.value===p.key){
            pinnedHighlight=null; navHistory=[]; hideInfoPanel();
          } else {
            pushNav();
            pinnedHighlight={type:'person',value:p.key};
            const vk = new Set(p.visits.map(v=>(v.fi_city||'Nepoznato')+'|'+(v.fi_country||'')));
            const pts = [{x:p.x,y:p.y}, ...currentCities.filter(c=>vk.has(c.key)).map(c=>({x:c.x,y:c.y}))];
            zoomToFit(pts, 120);
            showInfoPanel(buildPersonPanelHtml(p));
          }
          applyHighlight();
        });
      const left = item.append('div').attr('class','stats-item-left');
      left.node().appendChild(makeTinySeedEl(colorScale(fac)));
      left.append('span').attr('class','stats-name').attr('title',p.key).text(p.key);
      item.append('span').attr('class','stats-count').text(`${p.visits.length} ${p.visits.length===1?'posjet':'posjeta'}`);
    });
    if(sortedPeople.length===0){
      personList.append('div').style('text-align','center').style('color','#8c9ba5').style('font-size','12px').style('padding','12px').text('Nema pronađenih posjetitelja');
    }

    const cityList = d3.select('#city-list');
    cityList.selectAll('*').remove();
    const cityStats = currentCities.map(c=>{
      const uq = new Set(c.visits.map(v=>v.full_name)).size;
      return {key:c.key,city:c.city,country:c.country,uniqueCount:uq,totalCount:c.visits.length,x:c.x,y:c.y};
    });
    let filteredCities = cityStats;
    if(citySearchVal.trim()){
      const s = citySearchVal.toLowerCase();
      filteredCities = cityStats.filter(c=>c.city.toLowerCase().includes(s)||c.country.toLowerCase().includes(s));
    }
    filteredCities.sort((a,b)=>d3.descending(a.uniqueCount,b.uniqueCount)||d3.descending(a.totalCount,b.totalCount)||d3.ascending(a.city,b.city));
    filteredCities.forEach(c=>{
      const item = cityList.append('div').datum(c).attr('class','stats-item')
        .on('click', e=>{
          e.stopPropagation(); stopPlaying();
          if(pinnedHighlight&&pinnedHighlight.type==='city'&&pinnedHighlight.value===c.key){
            pinnedHighlight=null; navHistory=[]; hideInfoPanel();
          } else {
            pushNav();
            pinnedHighlight={type:'city',value:c.key};
            const cd2 = currentCities.find(ci=>ci.key===c.key);
            const vn = new Set(cd2 ? cd2.visits.map(v=>v.full_name) : []);
            const sp = [{x:c.x,y:c.y}, ...currentPeople.filter(p=>vn.has(p.key)).map(p=>({x:p.x,y:p.y}))];
            zoomToFit(sp, 100);
            showInfoPanel(buildCityPanelHtml(cd2 || {city:c.city,country:c.country,visits:[],key:c.key,x:c.x,y:c.y}));
          }
          applyHighlight();
        });
      const left = item.append('div').attr('class','stats-item-left');
      left.node().appendChild(makeTinyFlowerEl('#c8dece', 24));
      left.append('span').attr('class','stats-name').attr('title',`${c.city}, ${c.country}`).text(`${c.city}, ${c.country}`);
      item.append('span').attr('class','stats-count').text(`${c.uniqueCount} ${c.uniqueCount===1?'posjetitelj':'posjetitelja'}`);
    });
    if(filteredCities.length===0){
      cityList.append('div').style('text-align','center').style('color','#8c9ba5').style('font-size','12px').style('padding','12px').text('Nema pronađenih gradova');
    }
  }

})();
