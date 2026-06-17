"use strict";

const DATA_FILE = "erasmus_staff_mobility_new.csv";
const WORLD_FILE = "vendor/countries-50m.json";
const RIJEKA = { lat: 45.3271, lon: 14.4422 };
const DURATION = 1300;
const FIT_PAD = 0.1; // udio margine pri cropanju karte na krugove
const MIN_LON_SPAN = 3; // minimalni geografski raspon da se mapa ne zumira pretjerano
const MIN_LAT_SPAN = 2;
const LABEL_MAX_W = 175; // px, širina nakon koje se labela lomi u više redaka

const SUBTITLES = {
  overview:
    "Krugovi označavaju sastavnice smještene na prosjeku koordinata njihovih odredišta",
  faculty: "Koordinate mjesta razmjena osoblja",
};

const svg = d3.select("#map");
const mapWrap = document.querySelector(".map-wrap");
const tooltip = document.getElementById("tooltip");
const levelEl = document.getElementById("level");
const levelTitleEl = document.getElementById("level-title");
const levelSubtitleEl = document.getElementById("level-subtitle");
const backBtn = document.getElementById("back");

const projection = d3.geoMercator();
const geoPath = d3.geoPath(projection);

// Karta je skrivena na preglednoj razini; vidljivom je čini goTo().
const gMap = svg.append("g").attr("class", "countries").style("opacity", 0);
// Koordinatni sustav (osi kroz Rijeku) vidljiv samo na preglednoj razini.
const gAxis = svg.append("g").attr("class", "axis");
const gPoints = svg.append("g").attr("class", "points");
const gLabels = svg.append("g").attr("class", "labels");

const axisLineH = gAxis.append("line");
const axisLineV = gAxis.append("line");
const axisLabels = {
  istok: gAxis.append("text").attr("text-anchor", "end").text("istok"),
  zapad: gAxis.append("text").attr("text-anchor", "start").text("zapad"),
  sjever: gAxis.append("text").attr("text-anchor", "start").text("sjever"),
  jug: gAxis.append("text").attr("text-anchor", "start").text("jug"),
};

const updateAxis = () => {
  const [ax, ay] = currentTransform.apply(
    projection([RIJEKA.lon, RIJEKA.lat])
  );
  axisLineH.attr("x1", 0).attr("y1", ay).attr("x2", width).attr("y2", ay);
  axisLineV.attr("x1", ax).attr("y1", 0).attr("x2", ax).attr("y2", height);
  axisLabels.istok.attr("x", width - 10).attr("y", ay - 10);
  axisLabels.zapad.attr("x", 10).attr("y", ay - 10);
  axisLabels.sjever.attr("x", ax + 10).attr("y", 20);
  axisLabels.jug.attr("x", ax + 10).attr("y", height - 10);
};

const measureCtx = document.createElement("canvas").getContext("2d");

let width = 0;
let height = 0;
let borders = null;
let faculties = [];
let fitAllCoords = [];
let facRadius = null;
let cityRadius = null;
let currentTransform = d3.zoomIdentity;
let state = { level: "overview", faculty: null };
let currentPts = [];
let transitioning = false;

/* ---------- pomoćne funkcije ---------- */

const plural = (n, one, many) => (n % 10 === 1 && n % 100 !== 11 ? one : many);

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[c]);

const measure = (text, size) => {
  measureCtx.font = `600 ${size}px Degular, "Helvetica Neue", sans-serif`;
  return measureCtx.measureText(text).width;
};

const wrapText = (text, size, maxW) => {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    const trial = line ? `${line} ${word}` : word;
    if (line && measure(trial, size) > maxW) {
      lines.push(line);
      line = word;
    } else {
      line = trial;
    }
  }
  if (line) lines.push(line);
  return lines;
};

/* ---------- podaci ---------- */

const buildFaculties = (rows) => {
  const valid = rows.filter(
    (r) =>
      String(r.faculty || "").trim() &&
      String(r.lat || "").trim() &&
      String(r.lon || "").trim()
  );

  const byFaculty = d3.group(valid, (r) => r.faculty.trim());

  return Array.from(byFaculty, ([name, rs]) => {
    const byCity = d3.group(rs, (r) => `${r.city}|${r.lat}|${r.lon}`);
    const cities = Array.from(byCity, ([key, crs]) => {
      const nameCounts = d3.rollup(
        crs,
        (v) => v.length,
        (r) => r.full_name.trim()
      );
      return {
        id: `${name}::${key}`,
        city: crs[0].city.trim(),
        country: crs[0].country.trim(),
        lat: +crs[0].lat,
        lon: +crs[0].lon,
        mobilities: crs.length,
        profs: Array.from(nameCounts, ([prof, trips]) => ({ name: prof, trips }))
          .sort(
            (a, b) =>
              d3.descending(a.trips, b.trips) || d3.ascending(a.name, b.name)
          ),
      };
    });

    return {
      id: `fac::${name}`,
      name,
      lat: d3.mean(rs, (r) => +r.lat),
      lon: d3.mean(rs, (r) => +r.lon),
      mobilities: rs.length,
      cities,
    };
  }).sort((a, b) => d3.descending(a.mobilities, b.mobilities));
};

/* ---------- krugovi po razinama ---------- */

const originPoint = () => ({
  id: "rijeka",
  type: "origin",
  lon: RIJEKA.lon,
  lat: RIJEKA.lat,
  r: 4,
  prio: Infinity,
  labelLines: [{ text: "Rijeka", size: 12 }],
  tip: null,
});

const overviewPoints = () =>
  faculties
    .map((f) => ({
      id: f.id,
      type: "faculty",
      ref: f,
      lon: f.lon,
      lat: f.lat,
      r: facRadius(f.mobilities),
      prio: f.mobilities,
      labelLines: wrapText(f.name, 12, LABEL_MAX_W).map((t) => ({
        text: t,
        size: 12,
      })),
      tip: `<strong>${esc(f.name)}</strong>${f.mobilities} ${plural(
        f.mobilities,
        "mobilnost",
        "mobilnosti"
      )} · klikni za detalje`,
    }))
    .concat([originPoint()]);

const facultyPoints = (f) =>
  f.cities
    .map((c) => {
      const labelLines = wrapText(c.city, 12, LABEL_MAX_W).map((t) => ({
        text: t,
        size: 12,
      }));
      const subText =
        c.profs.length <= 2
          ? c.profs.map((p) => p.name).join(", ")
          : `${c.profs.length} ${plural(c.profs.length, "djelatnik", "djelatnika")}`;
      wrapText(subText, 11, 210).forEach((t) =>
        labelLines.push({ text: t, size: 11, dim: true })
      );

      const namesHtml = c.profs
        .map((p) => esc(p.name) + (p.trips > 1 ? ` (×${p.trips})` : ""))
        .join(", ");
      return {
        id: c.id,
        type: "city",
        ref: c,
        lon: c.lon,
        lat: c.lat,
        r: cityRadius(c.mobilities),
        prio: c.mobilities,
        labelLines,
        tip: `<strong>${esc(c.city)}, ${esc(c.country)}</strong><span class="names">${namesHtml}</span>`,
      };
    })
    .concat([originPoint()]);

/* ---------- projekcija i transformacije pogleda ---------- */

const refitProjection = () => {
  const rect = mapWrap.getBoundingClientRect();
  width = rect.width;
  height = rect.height;
  projection.fitExtent(
    [
      [0, 0],
      [width, height],
    ],
    { type: "MultiPoint", coordinates: fitAllCoords }
  );
  gMap.select("path").attr("d", geoPath(borders));
};

const toViewArr = (t) => [
  (width / 2 - t.x) / t.k,
  (height / 2 - t.y) / t.k,
  width / t.k,
];

const fromViewArr = (v) => {
  const k = width / v[2];
  return d3.zoomIdentity
    .translate(width / 2 - k * v[0], height / 2 - k * v[1])
    .scale(k);
};

const fitTransform = (geoPts) => {
  let lon0 = d3.min(geoPts, (p) => p[0]);
  let lon1 = d3.max(geoPts, (p) => p[0]);
  let lat0 = d3.min(geoPts, (p) => p[1]);
  let lat1 = d3.max(geoPts, (p) => p[1]);

  const lonPad = Math.max(0, MIN_LON_SPAN - (lon1 - lon0)) / 2;
  const latPad = Math.max(0, MIN_LAT_SPAN - (lat1 - lat0)) / 2;
  lon0 -= lonPad;
  lon1 += lonPad;
  lat0 -= latPad;
  lat1 += latPad;

  // Mercator je monotona u lon i -lat, pa su kutovi dovoljni za okvir.
  const [x0, y0] = projection([lon0, lat1]);
  const [x1, y1] = projection([lon1, lat0]);
  const dx = Math.max(x1 - x0, 1e-9);
  const dy = Math.max(y1 - y0, 1e-9);
  const k = Math.min(
    (width * (1 - 2 * FIT_PAD)) / dx,
    (height * (1 - 2 * FIT_PAD)) / dy
  );
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return d3.zoomIdentity
    .translate(width / 2 - k * cx, height / 2 - k * cy)
    .scale(k);
};

/* ---------- tooltip ---------- */

const showTooltip = (event, html) => {
  if (!html) return;
  tooltip.innerHTML = html;
  tooltip.classList.add("show");
  moveTooltip(event);
};

const moveTooltip = (event) => {
  const rect = mapWrap.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  const flip = x > rect.width - 360;
  tooltip.style.left = `${x + (flip ? -16 : 16)}px`;
  tooltip.style.top = `${y + 12}px`;
  tooltip.style.transform = flip ? "translateX(-100%)" : "none";
};

const hideTooltip = () => tooltip.classList.remove("show");

/* ---------- labele s izbjegavanjem preklapanja ---------- */

const rectsOverlap = (a, b) =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

const overlapArea = (a, b) => {
  const w = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const h = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return w > 0 && h > 0 ? w * h : 0;
};

const labelCandidates = (sx, sy, r, w, h, push) => {
  const g = 7 + push;
  const d = (r + g) * 0.71;
  return [
    { x0: sx + r + g, y0: sy - h / 2 },
    { x0: sx + d, y0: sy - d - h },
    { x0: sx + d, y0: sy + d },
    { x0: sx - r - g - w, y0: sy - h / 2 },
    { x0: sx - d - w, y0: sy - d - h },
    { x0: sx - d - w, y0: sy + d },
    { x0: sx - w / 2, y0: sy - r - g - h },
    { x0: sx - w / 2, y0: sy + r + g },
  ];
};

const placeLabels = (items) => {
  // Krugovi su prepreke da labele ne sjednu preko tuđeg kružića.
  const placed = items.map((it) => ({
    x0: it.sx - it.r,
    y0: it.sy - it.r,
    x1: it.sx + it.r,
    y1: it.sy + it.r,
  }));

  const ordered = [...items].sort((a, b) => d3.descending(a.prio, b.prio));
  const results = [];

  for (const it of ordered) {
    const w = d3.max(it.labelLines, (l) => measure(l.text, l.size));
    const lineHeights = it.labelLines.map((l) => l.size * 1.18);
    const h = d3.sum(lineHeights);

    let chosen = null;
    let leader = false;

    outer: for (const push of [0, 16, 34, 54]) {
      for (const c of labelCandidates(it.sx, it.sy, it.r, w, h, push)) {
        const box = { x0: c.x0, y0: c.y0, x1: c.x0 + w, y1: c.y0 + h };
        if (box.x0 < 2 || box.y0 < 2 || box.x1 > width - 2 || box.y1 > height - 2)
          continue;
        if (!placed.some((p) => rectsOverlap(box, p))) {
          chosen = box;
          leader = push > 0;
          break outer;
        }
      }
    }

    let hidden = false;
    if (!chosen) {
      // Najmanje loš kandidat iz prvog prstena; sitne krugove radije sakrij.
      let best = null;
      let bestArea = Infinity;
      for (const c of labelCandidates(it.sx, it.sy, it.r, w, h, 0)) {
        const box = {
          x0: Math.max(2, Math.min(c.x0, width - 2 - w)),
          y0: Math.max(2, Math.min(c.y0, height - 2 - h)),
        };
        box.x1 = box.x0 + w;
        box.y1 = box.y0 + h;
        const area = d3.sum(placed, (p) => overlapArea(box, p));
        if (area < bestArea) {
          bestArea = area;
          best = box;
        }
      }
      chosen = best;
      hidden = bestArea > 0.12 * w * h && it.prio !== Infinity;
    }

    if (!hidden) {
      placed.push({
        x0: chosen.x0 - 2,
        y0: chosen.y0 - 2,
        x1: chosen.x1 + 2,
        y1: chosen.y1 + 2,
      });
    }
    results.push({ it, box: chosen, leader, hidden, lineHeights });
  }

  return results;
};

const renderLabels = () => {
  gLabels.interrupt().selectAll("*").remove();

  const items = currentPts.map((p) => {
    const [sx, sy] = currentTransform.apply(projection([p.lon, p.lat]));
    return { ...p, sx, sy };
  });

  const placements = placeLabels(items);

  for (const { it, box, leader, hidden, lineHeights } of placements) {
    if (hidden) continue;

    if (leader) {
      const lx = Math.max(box.x0, Math.min(it.sx, box.x1));
      const ly = Math.max(box.y0, Math.min(it.sy, box.y1));
      const angle = Math.atan2(ly - it.sy, lx - it.sx);
      gLabels
        .append("line")
        .attr("x1", it.sx + Math.cos(angle) * (it.r + 1.5))
        .attr("y1", it.sy + Math.sin(angle) * (it.r + 1.5))
        .attr("x2", lx)
        .attr("y2", ly);
    }

    const text = gLabels.append("text").attr("x", box.x0).attr("y", box.y0);
    let yOff = 0;
    it.labelLines.forEach((line, i) => {
      yOff += lineHeights[i];
      text
        .append("tspan")
        .attr("x", box.x0)
        .attr("y", box.y0 + yOff - line.size * 0.24)
        .attr("font-size", line.size)
        .attr("class", line.dim ? "dim" : null)
        .text(line.text);
    });
  }

  gLabels.style("opacity", 0).transition("labels-in").duration(350).style("opacity", 1);
};

/* ---------- crtanje i tranzicije ---------- */

const applyPositions = (movers, t) => {
  gMap.attr("transform", currentTransform.toString());
  updateAxis();
  for (const m of movers) {
    const px = m.from[0] + (m.to[0] - m.from[0]) * t;
    const py = m.from[1] + (m.to[1] - m.from[1]) * t;
    m.node.__proj = [px, py];
    m.node.setAttribute("cx", currentTransform.applyX(px));
    m.node.setAttribute("cy", currentTransform.applyY(py));
  }
};

const updateHeader = () => {
  const isFaculty = state.level === "faculty";
  levelTitleEl.textContent = isFaculty ? state.faculty.name : "Sve sastavnice";
  levelSubtitleEl.textContent = SUBTITLES[state.level];
  backBtn.classList.toggle("visible", isFaculty);
  levelEl.classList.remove("swap");
  void levelEl.offsetWidth;
  levelEl.classList.add("swap");
};

const goTo = (level, faculty, animate = true) => {
  if (transitioning) return;
  const prev = state;
  state = { level, faculty: faculty || null };
  updateHeader();
  hideTooltip();

  const pts = level === "overview" ? overviewPoints() : facultyPoints(faculty);
  currentPts = pts;
  const target = fitTransform(pts.map((p) => [p.lon, p.lat]));

  const startGeo = (d) =>
    level === "faculty" && d.type === "city"
      ? [faculty.lon, faculty.lat]
      : [d.lon, d.lat];

  const sel = gPoints.selectAll("circle.pt").data(pts, (d) => d.id);

  const enterSel = sel
    .enter()
    .append("circle")
    .attr("class", (d) => `pt pt--${d.type}`)
    .attr("r", (d) => d.r)
    .style("opacity", 0)
    .on("click", (event, d) => {
      event.stopPropagation();
      if (d.type === "faculty") goTo("faculty", d.ref);
    })
    .on("mouseenter", (event, d) => showTooltip(event, d.tip))
    .on("mousemove", moveTooltip)
    .on("mouseleave", hideTooltip)
    .on("touchstart", (event, d) => {
      event.stopPropagation();
      if (d.tip) {
        const t = event.touches[0];
        showTooltip({ clientX: t.clientX, clientY: t.clientY }, d.tip);
      }
    });

  const exitSel = sel.exit();
  const converge = prev.level === "faculty" && level === "overview";

  const movers = [];
  sel.each(function (d) {
    movers.push({
      node: this,
      from: this.__proj || projection([d.lon, d.lat]),
      to: projection([d.lon, d.lat]),
    });
  });
  enterSel.each(function (d) {
    movers.push({
      node: this,
      from: projection(startGeo(d)),
      to: projection([d.lon, d.lat]),
    });
  });
  exitSel.each(function (d) {
    const from = this.__proj || projection([d.lon, d.lat]);
    movers.push({
      node: this,
      from,
      to:
        converge && d.type === "city"
          ? projection([prev.faculty.lon, prev.faculty.lat])
          : from,
    });
  });

  gLabels.interrupt().transition("labels-out").duration(150).style("opacity", 0);

  // Linijska karta postoji samo na razini sastavnice: pri ulasku se pojavi
  // tijekom zumiranja, pri povratku nestane odmah na početku.
  const mapVisible = level === "faculty";

  if (!animate) {
    gMap.interrupt().style("opacity", mapVisible ? 1 : 0);
    gAxis.interrupt().style("opacity", mapVisible ? 0 : 1);
    currentTransform = target;
    applyPositions(movers, 1);
    exitSel.remove();
    enterSel.transition("fade").duration(600).style("opacity", 1);
    renderLabels();
    return;
  }

  gMap
    .interrupt()
    .transition("map-fade")
    .delay(mapVisible ? DURATION * 0.3 : 0)
    .duration(mapVisible ? 700 : 500)
    .style("opacity", mapVisible ? 1 : 0);

  // Osi se ponašaju obrnuto od karte: nestanu pri ulasku u sastavnicu,
  // vrate se tijekom povratka na pregled.
  gAxis
    .interrupt()
    .transition("axis-fade")
    .delay(mapVisible ? 0 : DURATION * 0.3)
    .duration(mapVisible ? 400 : 700)
    .style("opacity", mapVisible ? 0 : 1);

  // Ulazni krugovi: pri ulasku u sastavnicu gradovi "izlijeću" iz prosjeka;
  // pri povratku kružić aktivne sastavnice se pojavi tek kad se gradovi sliju u njega.
  const enterDelay = (d) => {
    if (level === "overview" && converge) {
      return d.id === prev.faculty.id ? DURATION - 450 : DURATION * 0.45;
    }
    return 100;
  };

  enterSel
    .transition("fade")
    .delay(enterDelay)
    .duration(500)
    .style("opacity", 1);

  if (converge) {
    exitSel
      .transition("fade")
      .delay(DURATION - 500)
      .duration(450)
      .style("opacity", 0)
      .remove();
  } else {
    exitSel.transition("fade").duration(350).style("opacity", 0).remove();
  }

  transitioning = true;
  const iz = d3.interpolateZoom.rho(1.15)(
    toViewArr(currentTransform),
    toViewArr(target)
  );

  svg
    .transition("view")
    .duration(DURATION)
    .ease(d3.easeCubicInOut)
    .tween("view", () => (t) => {
      currentTransform = fromViewArr(iz(t));
      applyPositions(movers, t);
    })
    .on("end interrupt", () => {
      transitioning = false;
      currentTransform = target;
      applyPositions(movers, 1);
      renderLabels();
    });
};

/* ---------- inicijalizacija ---------- */

const init = async () => {
  const [csvText, world] = await Promise.all([
    fetch(DATA_FILE).then((r) => r.text()),
    fetch(WORLD_FILE).then((r) => r.json()),
  ]);

  try {
    await Promise.all([
      document.fonts.load('600 12px "Degular"'),
      document.fonts.load('600 16px "Degular"'),
    ]);
  } catch (e) {
    /* mjerenje pada na fallback font */
  }

  const rows = d3.csvParse(csvText.replace(/^\uFEFF/, ""));
  faculties = buildFaculties(rows);

  facRadius = d3
    .scaleSqrt()
    .domain([0, d3.max(faculties, (f) => f.mobilities)])
    .range([0, 38])
    .clamp(true);
  const facR = facRadius;
  facRadius = (n) => Math.max(8, facR(n));

  const maxCity = d3.max(faculties, (f) => d3.max(f.cities, (c) => c.mobilities));
  const cityR = d3.scaleSqrt().domain([0, maxCity]).range([0, 28]).clamp(true);
  // Gradovi s jednom mobilnošću (jedan djelatnik, jednom) dobiju najmanji krug.
  cityRadius = (n) => (n <= 1 ? 3.5 : Math.max(6, cityR(n)));

  borders = topojson.mesh(world, world.objects.countries);
  gMap.append("path");

  fitAllCoords = faculties
    .flatMap((f) => f.cities.map((c) => [c.lon, c.lat]))
    .concat([[RIJEKA.lon, RIJEKA.lat]]);

  refitProjection();

  // Uvodna animacija: od pogleda na sve destinacije do pregleda sastavnica.
  currentTransform = fitTransform(fitAllCoords);
  gMap.attr("transform", currentTransform.toString());
  goTo("overview", null, true);

  backBtn.addEventListener("click", () => {
    if (state.level === "faculty") goTo("overview");
  });
  svg.on("click", () => {
    hideTooltip();
    if (state.level === "faculty") goTo("overview");
  }).on("touchstart.bg", () => hideTooltip());
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && state.level === "faculty") goTo("overview");
  });

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      refitProjection();
      currentTransform = fitTransform(currentPts.map((p) => [p.lon, p.lat]));
      gMap.attr("transform", currentTransform.toString());
      gPoints.selectAll("circle.pt").each(function (d) {
        const proj = projection([d.lon, d.lat]);
        this.__proj = proj;
        this.setAttribute("cx", currentTransform.applyX(proj[0]));
        this.setAttribute("cy", currentTransform.applyY(proj[1]));
      });
      updateAxis();
      renderLabels();
    }, 200);
  });
};

init().catch((error) => console.error(error));
