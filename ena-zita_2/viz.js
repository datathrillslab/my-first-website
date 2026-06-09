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
  let animFrameId = null;   // rAF handle for cursor animation
  let playTickTimeout = null; // setTimeout handle for play interval
  let cachedBtnPcts = null;   // pre-measured button center positions (% of track)
  let colorScale = null;
  let currentPeople = [], currentCities = [];
  let pinnedHighlight = null;
  let personSearchVal = '', citySearchVal = '';
  let infoPanelTimer = null;

  // Stable positions computed once from all data — nothing ever repositions
  let allCityPositions = new Map();   // cityKey → {x, y}
  let allPersonPositions = new Map(); // personName → {x, y}

  // City color: gold → coral → pink → violet by unique visitor count
  const cityColorScale = d3.scaleSequential()
    .interpolator(d3.interpolateRgbBasis(['#f7e46a','#f0854c','#e8609a','#a05de5']))
    .domain([1, 25]);

  // --- Path helpers ---

  function petalPath(angle, len, wid) {
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const pc = Math.cos(angle + Math.PI/2), ps = Math.sin(angle + Math.PI/2);
    const cp1x = cos*len*0.25 - pc*wid*0.65, cp1y = sin*len*0.25 - ps*wid*0.65;
    const tipx = cos*len, tipy = sin*len;
    const cp2x = cos*len*0.25 + pc*wid*0.65, cp2y = sin*len*0.25 + ps*wid*0.65;
    return `M0,0 C${cp1x},${cp1y} ${tipx-pc*wid*0.2},${tipy-ps*wid*0.2} ${tipx},${tipy}` +
           ` C${tipx+pc*wid*0.2},${tipy+ps*wid*0.2} ${cp2x},${cp2y} 0,0`;
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

  function parseRow(d){
    d.fi_lat  = d.fi_lat  ? +d.fi_lat  : null;
    d.fi_lon  = d.fi_lon  ? +d.fi_lon  : null;
    d.academic_year_start = d.academic_year_start ? +d.academic_year_start : null;
    d.full_name = d.full_name || (d.first_name + ' ' + d.last_name);
    return d;
  }

  d3.csv('erasmus_staff_mobility_fully_cleaned.csv', parseRow).then(rows => {
    dataAll = rows.filter(d => d.fi_lat && d.fi_lon && d.academic_year_start);
    years = Array.from(new Set(dataAll.map(d => d.academic_year_start))).sort((a,b) => a-b);
    selectedYear = years[0];

    const faculties = Array.from(new Set(dataAll.map(d => d.sastavnica_name || 'Other / Unknown'))).sort();
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
    attachZoom();
    update();
    // Measure button positions after layout, then place cursor without animation
    cacheButtonPcts(() => setCursorPct(getBtnPct(0)));
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
      const byCity = d3.group(visitsArr, d => (d.fi_city||'Unknown')+'|'+(d.fi_country||''));
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
        .text(y)
        .attr('data-year', y)
        .on('click', () => { stopPlaying(); setYear(y); });
    });
    setActiveYearButton();
    d3.select('#back').on('click', () => {
      resetZoom();
      pinnedHighlight = null;
      hideInfoPanel();
      applyHighlight();
    });
    d3.select('#play').on('click', () => { togglePlay(); });
  }

  function setupSidebarControls() {
    const dotIcon = d3.select('#info-dot-icon');
    d3.select('#info-dot').on('click', () => {
      const sidebar = d3.select('#sidebar');
      const opening = sidebar.classed('collapsed');
      sidebar.classed('collapsed', !opening);
      d3.select('#info-dot').classed('open', opening);
      dotIcon.text(opening ? '×' : '?');
      if (opening) updateSidebar(); // populate now that it's visible
    });
    d3.select('#person-search').on('input', function() {
      stopPlaying(); personSearchVal = this.value;
      applyHighlight(); updateSidebar();
    });
    d3.select('#city-search').on('input', function() {
      stopPlaying(); citySearchVal = this.value;
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
    if (nextIdx >= years.length) { stopPlaying(); return; }
    animateCursor(getBtnPct(idx), getBtnPct(nextIdx), 2800, t => t);
    playTickTimeout = setTimeout(() => {
      setYear(years[nextIdx]);
      if (isPlaying) playTick();
    }, 2800);
  }

  function setYear(y){
    selectedYear = y;
    setActiveYearButton();
    // Cursor is driven by playTick during play; only update manually when paused
    if (!isPlaying) updateTimeCursor();
    update();
  }

  function setActiveYearButton(){
    d3.selectAll('#years button').each(function(){
      const y = +this.getAttribute('data-year');
      d3.select(this)
        .classed('active', y === selectedYear)
        .classed('past',   y <  selectedYear)
        .classed('future', y >  selectedYear);
    });
  }

  function togglePlay(){
    if (isPlaying) { stopPlaying(); return; }
    isPlaying = true;
    d3.select('#play').text('Pause');
    playTick();
  }

  function stopPlaying(){
    clearTimeout(playTickTimeout); playTickTimeout = null;
    cancelAnimationFrame(animFrameId); animFrameId = null;
    isPlaying = false;
    d3.select('#play').text('Play');
    updateTimeCursor(); // glide back to resting position of current year
  }

  function attachZoom(){
    zoomBehavior = d3.zoom()
      .scaleExtent([0.5, 6])
      .on('zoom', (event) => { g.attr('transform', event.transform); });
    svg.call(zoomBehavior).on('click', () => {
      pinnedHighlight = null;
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

  function showInfoPanel(html){
    clearTimeout(infoPanelTimer);
    d3.select('#info-panel-content').html(html);
    d3.select('#info-panel').classed('hidden', false);
    requestAnimationFrame(() => d3.select('#info-panel').classed('visible', true));
    infoPanelTimer = setTimeout(hideInfoPanel, 6000);
  }

  function hideInfoPanel(){
    clearTimeout(infoPanelTimer);
    d3.select('#info-panel').classed('visible', false);
    setTimeout(() => d3.select('#info-panel').classed('hidden', true), 400);
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
      const key = (d.fi_city||'Unknown')+'|'+(d.fi_country||'');
      if(!map.has(key)){
        map.set(key, {key, city:d.fi_city||'Unknown', country:d.fi_country||'', lons:[], lats:[], visits:[]});
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
    const filtered = dataAll.filter(d => d.academic_year_start <= selectedYear);
    const cities = groupedCities(filtered);

    // Attach stable positions — nothing moves between years
    cities.forEach(c => {
      const pos = allCityPositions.get(c.key);
      if(pos){ c.x = pos.x; c.y = pos.y; }
    });

    if(cities.length === 0){
      g.selectAll('path.visit-vine').remove();
      g.selectAll('g.city-group').remove();
      g.selectAll('g.person-bud').remove();
      currentPeople = []; currentCities = [];
      updateSidebar(); return;
    }

    // Build people with stable positions
    const people = [];
    const personPosMap = new Map();
    const byPersonFiltered = d3.group(filtered, d => d.full_name);
    for(const [person, visitsArr] of byPersonFiltered){
      const pos = allPersonPositions.get(person);
      if(!pos) continue;
      personPosMap.set(person, [pos.x, pos.y]);
      people.push({key:person, x:pos.x, y:pos.y, row:visitsArr[0], visits:visitsArr});
    }

    currentPeople = people;
    currentCities = cities;

    // Build vine data — use Map for O(1) city lookup instead of O(n) find
    const citiesMap = new Map(cities.map(c => [c.key, c]));
    const vines = [];
    const byPersonCity = d3.group(filtered, d=>d.full_name, d=>(d.fi_city||'Unknown')+'|'+(d.fi_country||''));
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
              faculty: v.sastavnica_name||'Other / Unknown'
            });
          });
      }
    }

    // --- Render vines (behind everything) ---
    const vineSel = g.selectAll('path.visit-vine').data(vines, d => d.key);

    const vineEnter = vineSel.enter().append('path')
      .attr('class','visit-vine')
      .attr('d', d => vinePath(d.px,d.py,d.cx,d.cy,d.curvature))
      .attr('stroke', d => colorScale(d.faculty));
    vineEnter.each(function(){ growVineIn(d3.select(this), isPlaying); });

    // Existing vines: update path immediately (stable endpoints, rarely changes)
    vineSel
      .attr('d', d => vinePath(d.px,d.py,d.cx,d.cy,d.curvature))
      .attr('stroke', d => colorScale(d.faculty));

    vineSel.exit().transition().duration(350).style('opacity',0).remove();

    // --- Render city flowers ---
    const cityGroupSel = g.selectAll('g.city-group').data(cities, d => d.key);

    const cityEnter = cityGroupSel.enter().append('g')
      .attr('class','city-group')
      .attr('transform', d => cityTx(d, 0))
      .on('click', function(e, d){
        e.stopPropagation(); stopPlaying();
        const uv = new Set(d.visits.map(v=>v.full_name)).size;
        showInfoPanel(
          `<strong>${d.city}</strong>, ${d.country}` +
          `<span class="info-divider">·</span>` +
          `<span class="info-stat">${uv} visitor${uv!==1?'s':''}</span>` +
          `<span class="info-divider">·</span>` +
          `<span class="info-stat">${d.visits.length} total visit${d.visits.length!==1?'s':''}</span>`
        );
        if(pinnedHighlight && pinnedHighlight.type==='city' && pinnedHighlight.value===d.key){
          pinnedHighlight = null;
        } else {
          pinnedHighlight = {type:'city', value:d.key};
          zoomTo(d.x, d.y, 2);
        }
        applyHighlight();
      });

    // Petal group receives glow filter once (cheaper than per-petal)
    cityEnter.append('g').attr('class','city-petals-group');
    cityEnter.append('circle').attr('class','city-center').attr('r', 2.5);

    // Seed all petals for new cities immediately — the group bloom is the animation
    cityEnter.each(function(d){
      const uv = new Set(d.visits.map(v=>v.full_name)).size;
      const n = Math.min(Math.max(uv, 3), 12);
      const len = 13 + Math.sqrt(d.visits.length)*1.8;
      const wid = len*0.38;
      const pg = d3.select(this).select('g.city-petals-group');
      d3.range(n).forEach(i => {
        pg.append('path').attr('class','city-petal')
          .attr('d', petalPath((i/n)*Math.PI*2-Math.PI/2, len, wid))
          .attr('fill', cityColorScale(uv));
      });
    });

    // New cities bloom in as a whole flower (faster during play to reduce frame budget)
    cityEnter.transition('bloom')
      .duration(isPlaying ? 450 : 1000)
      .ease(d3.easeBackOut.overshoot(1.15))
      .attr('transform', d => cityTx(d));

    // Existing cities: detect and animate new individual petals
    cityGroupSel.each(function(d){
      const uv = new Set(d.visits.map(v=>v.full_name)).size;
      const n = Math.min(Math.max(uv, 3), 12);
      const len = 13 + Math.sqrt(d.visits.length)*1.8;
      const wid = len*0.38;
      const pg = d3.select(this).select('g.city-petals-group');
      const petalSel = pg.selectAll('path.city-petal').data(d3.range(n), x => x);

      // Update existing petals (angle shifts slightly — subtle, acceptable)
      petalSel
        .attr('d', i => petalPath((i/n)*Math.PI*2-Math.PI/2, len, wid))
        .attr('fill', cityColorScale(uv));

      // New petals unfold individually (collapsed stagger during play)
      petalSel.enter().append('path')
        .attr('class','city-petal')
        .attr('d', i => petalPath((i/n)*Math.PI*2-Math.PI/2, len, wid))
        .attr('fill', cityColorScale(uv))
        .attr('transform','scale(0)')
        .transition('petal-bloom')
        .duration(isPlaying ? 300 : 750)
        .delay(isPlaying ? 0 : (d, idx) => idx * 90)
        .ease(d3.easeBackOut.overshoot(1.5))
        .attr('transform','scale(1)');

      petalSel.exit().remove();
    });

    cityGroupSel.exit().transition().duration(400).style('opacity',0).remove();

    // --- Render person seeds ---
    const peopleSel = g.selectAll('g.person-bud').data(people, d => d.key);

    const peopleEnter = peopleSel.enter().append('g')
      .attr('class','person-bud')
      .attr('transform', d => budTx(d, 0))
      .on('click', function(e, d){
        e.stopPropagation(); stopPlaying();
        const destCities = [...new Set(d.visits.map(v=>v.fi_city||'Unknown'))].join(', ');
        showInfoPanel(
          `<strong>${d.key}</strong>` +
          (d.row.sastavnica_name
            ? `<span class="info-divider">·</span><span class="info-faculty">${d.row.sastavnica_name}</span>`
            : '') +
          `<br/><span class="info-stat">${d.visits.length} visit${d.visits.length!==1?'s':''}</span> — ${destCities}`
        );
        if(pinnedHighlight && pinnedHighlight.type==='person' && pinnedHighlight.value===d.key){
          pinnedHighlight = null;
        } else {
          pinnedHighlight = {type:'person', value:d.key};
          zoomTo(d.x, d.y, 2.5);
        }
        applyHighlight();
      });

    peopleEnter.append('path').attr('class','seed-shape')
      .attr('d', seedPathD)
      .attr('fill', d => colorScale(d.row.sastavnica_name||'Other / Unknown'));

    // Seeds sprout — staggered during manual nav, quick burst during play
    peopleEnter.transition('emerge')
      .duration(isPlaying ? 350 : 900)
      .delay(isPlaying ? (d, i) => Math.min(i * 5, 100) : (d, i) => i * 22)
      .ease(d3.easeBackOut.overshoot(1.5))
      .attr('transform', d => budTx(d));

    // Existing seeds: just update color (position is always stable)
    peopleSel.select('path.seed-shape')
      .attr('fill', d => colorScale(d.row.sastavnica_name||'Other / Unknown'));

    peopleSel.exit().transition().duration(350).style('opacity',0).remove();

    updateSidebar();
  }

  function applyHighlight(){
    d3.selectAll('.legend-item').classed('pinned', false);
    d3.selectAll('.stats-item').classed('pinned', false);

    if(pinnedHighlight){
      const {type, value} = pinnedHighlight;
      if(type==='faculty') d3.selectAll('.legend-item').filter(d=>d&&d.name===value).classed('pinned',true);
      else if(type==='person') d3.selectAll('.stats-item').filter(d=>d&&d.key===value).classed('pinned',true);
      else if(type==='city') d3.selectAll('.stats-item').filter(d=>d&&d.key===value).classed('pinned',true);
    }

    interruptVines();

    if(!pinnedHighlight){
      g.selectAll('g.person-bud').style('opacity',0.9).attr('transform', d=>budTx(d));
      g.selectAll('path.visit-vine').style('opacity',0.22).style('stroke-width',1);
      g.selectAll('g.city-group').style('opacity',0.9).attr('transform', d=>cityTx(d));
      return;
    }

    const {type, value} = pinnedHighlight;
    let litVines;

    if(type==='faculty'){
      g.selectAll('g.person-bud')
        .style('opacity', d=>(d.row.sastavnica_name||'Other / Unknown')===value?1.0:0.07)
        .attr('transform', d=>budTx(d));
      litVines = g.selectAll('path.visit-vine')
        .style('opacity', d=>d.faculty===value?0.75:0.02)
        .style('stroke-width', d=>d.faculty===value?1.8:0.5)
        .filter(d=>d.faculty===value);
      const vc = new Set();
      g.selectAll('g.person-bud').filter(d=>(d.row.sastavnica_name||'Other / Unknown')===value)
        .each(d=>d.visits.forEach(v=>vc.add((v.fi_city||'Unknown')+'|'+(v.fi_country||''))));
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
      if(pd) pd.visits.forEach(v=>vc.add((v.fi_city||'Unknown')+'|'+(v.fi_country||'')));
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
      g.selectAll('g.person-bud')
        .style('opacity', d=>vs.has(d.key)?1.0:0.07)
        .attr('transform', d=>budTx(d, vs.has(d.key)?1.4:null));
      growVines(litVines);
    }
  }

  function updateSidebar(){
    // Skip the entire DOM rebuild if the sidebar is collapsed — invisible work
    if (d3.select('#sidebar').classed('collapsed')) return;
    const legendList = d3.select('#legend-list');
    legendList.selectAll('*').remove();
    const facultyCounts = d3.rollup(currentPeople, v=>v.length, d=>d.row.sastavnica_name||'Other / Unknown');
    const allFaculties = colorScale.domain().map(fac=>({name:fac, count:facultyCounts.get(fac)||0}));
    allFaculties.sort((a,b)=>d3.descending(a.count,b.count)||d3.ascending(a.name,b.name));

    allFaculties.forEach(fac=>{
      const item = legendList.append('div').datum(fac)
        .attr('class','legend-item').style('opacity',fac.count>0?1:0.3)
        .on('click', e=>{
          e.stopPropagation(); stopPlaying();
          if(fac.count>0){
            if(pinnedHighlight&&pinnedHighlight.type==='faculty'&&pinnedHighlight.value===fac.name){
              pinnedHighlight=null; hideInfoPanel();
            } else pinnedHighlight={type:'faculty',value:fac.name};
            applyHighlight();
          }
        });
      item.append('div').attr('class','legend-color').style('background-color',colorScale(fac.name));
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
      const fac = p.row.sastavnica_name||'Other / Unknown';
      const item = personList.append('div').datum(p).attr('class','stats-item')
        .on('click', e=>{
          e.stopPropagation(); stopPlaying();
          if(pinnedHighlight&&pinnedHighlight.type==='person'&&pinnedHighlight.value===p.key){
            pinnedHighlight=null; hideInfoPanel();
          } else { pinnedHighlight={type:'person',value:p.key}; zoomTo(p.x,p.y,2.5); }
          applyHighlight();
        });
      const left = item.append('div').attr('class','stats-item-left');
      left.append('div').attr('class','stats-dot').style('background-color',colorScale(fac));
      left.append('span').attr('class','stats-name').attr('title',p.key).text(p.key);
      item.append('span').attr('class','stats-count').text(`${p.visits.length} visit${p.visits.length>1?'s':''}`);
    });
    if(sortedPeople.length===0){
      personList.append('div').style('text-align','center').style('color','#8c9ba5').style('font-size','12px').style('padding','12px').text('No visitors found');
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
            pinnedHighlight=null; hideInfoPanel();
          } else { pinnedHighlight={type:'city',value:c.key}; zoomTo(c.x,c.y,2); }
          applyHighlight();
        });
      const left = item.append('div').attr('class','stats-item-left');
      left.append('span').attr('class','stats-name').attr('title',`${c.city}, ${c.country}`).text(`${c.city}, ${c.country}`);
      item.append('span').attr('class','stats-count').text(`${c.uniqueCount} visitor${c.uniqueCount>1?'s':''}`);
    });
    if(filteredCities.length===0){
      cityList.append('div').style('text-align','center').style('color','#8c9ba5').style('font-size','12px').style('padding','12px').text('No cities found');
    }
  }

})();
