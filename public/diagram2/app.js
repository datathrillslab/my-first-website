const DATA_FILE = "erasmus_staff_mobility_fully_cleaned.csv";
const ACADEMIC_YEAR = "ALL";
const GEOCODE_CACHE = "geocode_cache.json";
const ORIGIN = { lat: 45.3271, lon: 14.4422 };

const chart = document.getElementById("chart");
const tooltip = document.getElementById("tooltip");
const facultyCount = document.getElementById("faculty-count");
const facultyList = document.getElementById("faculty-list");

const toggles = {
  faculties: document.getElementById("toggle-fac"),
  labels: document.getElementById("toggle-labels"),
};

const getToggleState = (toggle, fallback) =>
  toggle ? toggle.checked : fallback;

const SVG_NS = "http://www.w3.org/2000/svg";
const WIDTH = 1000;
const HEIGHT = 900;
const MARGIN = 38;

const FACULTY_NAME_OVERRIDES = new Map([
  ["Tehni_ki fakultet", "Tehnički fakultet"],
  [
    "Fakultet za menad_ment u turizmu i ugostiteljstvu",
    "Fakultet za menadžment u turizmu i ugostiteljstvu",
  ],
  ["Gra_evinski fakultet", "Građevinski fakultet"],
  ["U_iteljski fakultet", "Učiteljski fakultet"],
  ["Sveu_ili_na knji_nica", "Sveučilišna knjižnica"],
]);

let cachedFaculties = [];
let cachedProfessors = [];
let activeFaculty = null;

const formatNumber = (value) => {
  const abs = Math.abs(value);
  if (abs >= 100) {
    return value.toFixed(1);
  }
  if (abs >= 10) {
    return value.toFixed(2);
  }
  return value.toFixed(3);
};

const toNumber = (value) => {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).trim().replace(",", ".");
  if (!cleaned) return null;
  const num = Number(cleaned);
  return Number.isFinite(num) ? num : null;
};

const parseCoordinate = (value, maxAbs) => {
  if (value === null || value === undefined) return null;
  const cleaned = String(value).trim().replace(",", ".");
  if (!cleaned) return null;
  if ((cleaned.match(/\./g) || []).length > 1) return null;

  const direct = Number(cleaned);
  if (Number.isFinite(direct) && Math.abs(direct) <= maxAbs) return direct;

  const negative = cleaned.startsWith("-");
  const digits = cleaned.replace(/[^0-9]/g, "");
  if (!digits) return null;

  let decimals = 2;
  if (digits.length >= 7) {
    decimals = 5;
  } else if (digits.length >= 6) {
    decimals = 4;
  } else if (digits.length >= 5) {
    decimals = 3;
  }

  let candidate = Number(digits) / 10 ** decimals;
  while (candidate > maxAbs && decimals < digits.length) {
    decimals += 1;
    candidate = Number(digits) / 10 ** decimals;
  }

  return negative ? -candidate : candidate;
};

const createSvg = (tag, attrs = {}) => {
  const el = document.createElementNS(SVG_NS, tag);
  Object.entries(attrs).forEach(([key, val]) => el.setAttribute(key, val));
  return el;
};

const parseCSV = (text, delimiter = ";") => {
  const rows = [];
  let headers = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  const pushRow = () => {
    if (!headers.length) {
      headers = row.map((cell) => cell.trim());
    } else if (row.length) {
      const record = {};
      headers.forEach((key, idx) => {
        record[key] = row[idx] ?? "";
      });
      rows.push(record);
    }
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      row.push(value);
      value = "";
      continue;
    }

    if (!inQuotes && (char === "\n" || char === "\r")) {
      if (char === "\r" && next === "\n") {
        i += 1;
      }
      row.push(value);
      value = "";
      if (row.length > 1 || row[0] !== "") {
        pushRow();
      }
      continue;
    }

    value += char;
  }

  if (value.length || row.length) {
    row.push(value);
    pushRow();
  }

  return rows;
};

const resolveRowCoordinates = (row, geocodeCache) => {
  let lat = parseCoordinate(row.fi_lat, 90);
  let lon = parseCoordinate(row.fi_lon, 180);

  if (lat === null || lon === null) {
    const city = String(row.fi_city || "").trim();
    const country = String(row.fi_country || "").trim();
    if (city || country) {
      const key = `${city}|${country}`;
      const cached = geocodeCache[key];
      if (cached && cached.lat !== undefined && cached.lon !== undefined) {
        lat = Number(cached.lat);
        lon = Number(cached.lon);
      }
    }
  }

  const country = String(row.fi_country || "").trim();
  const countryKey = country.replace(/[^A-Za-z]/g, "").toLowerCase();
  if (lon !== null && (countryKey.includes("turkiye") || countryKey.includes("turkey"))) {
    lon = Math.abs(lon);
  }

  if (lat === null || lon === null) return null;
  return { lat, lon };
};

const buildData = (rows, geocodeCache) => {
  const facultyTotals = new Map();
  const professors = [];

  rows.forEach((row) => {
    const coords = resolveRowCoordinates(row, geocodeCache);
    if (!coords) return;

    const rawFaculty = String(row.sastavnica_name || "").trim();
    const faculty = FACULTY_NAME_OVERRIDES.get(rawFaculty) || rawFaculty;
    if (!faculty) return;

    const name = String(row.full_name || "").trim();
    const institution = String(row.foreign_institution || "").trim();
    const city = String(row.fi_city || "").trim();
    const country = String(row.fi_country || "").trim();
    const destination = [city, country].filter(Boolean).join(", ");
    professors.push({
      faculty,
      name,
      destination: destination || institution,
      lat: coords.lat,
      lon: coords.lon,
      x: coords.lon - ORIGIN.lon,
      y: coords.lat - ORIGIN.lat,
    });

    const current = facultyTotals.get(faculty) || {
      sumLon: 0,
      sumLat: 0,
      count: 0,
    };
    current.sumLon += coords.lon;
    current.sumLat += coords.lat;
    current.count += 1;
    facultyTotals.set(faculty, current);
  });

  const faculties = Array.from(facultyTotals.entries())
    .map(([faculty, totals]) => ({
      faculty,
      count: totals.count,
      x: totals.sumLon / totals.count - ORIGIN.lon,
      y: totals.sumLat / totals.count - ORIGIN.lat,
    }))
    .sort((a, b) => a.faculty.localeCompare(b.faculty));

  return { faculties, professors };
};

const renderChart = (faculties) => {
  chart.setAttribute("viewBox", `0 0 ${WIDTH} ${HEIGHT}`);
  chart.innerHTML = "";
  chart.classList.remove("fade-in");
  void chart.offsetWidth;
  chart.classList.add("fade-in");
  chart.onclick = () => {
    if (!activeFaculty) return;
    activeFaculty = null;
    renderChart(cachedFaculties);
  };

  if (!faculties.length) {
    return;
  }

  const counts = faculties.map((fac) => fac.count);
  const minCount = Math.min(...counts);
  const maxCount = Math.max(...counts);
  const radiusScale = (count) => {
    if (minCount === maxCount) return 13.2;
    const t = (count - minCount) / (maxCount - minCount);
    const eased = Math.sqrt(Math.max(0, Math.min(1, t)));
    return 4.41 + eased * 17.64;
  };

  const professorPoints = activeFaculty
    ? cachedProfessors.filter((prof) => prof.faculty === activeFaculty)
    : [];
  const plotPoints =
    activeFaculty && professorPoints.length ? professorPoints : faculties;

  const allX = [0, ...plotPoints.map((point) => point.x)];
  const allY = [0, ...plotPoints.map((point) => point.y)];
  let minX = Math.min(...allX);
  let maxX = Math.max(...allX);
  let minY = Math.min(...allY);
  let maxY = Math.max(...allY);

  if (minX === maxX) {
    minX -= 1;
    maxX += 1;
  }
  if (minY === maxY) {
    minY -= 1;
    maxY += 1;
  }

  const padX = (maxX - minX) * 0.1;
  const padY = (maxY - minY) * 0.1;
  minX -= padX;
  maxX += padX;
  minY -= padY;
  maxY += padY;

  const plotWidth = WIDTH - MARGIN * 2;
  const plotHeight = HEIGHT - MARGIN * 2;

  const xScale = (value) =>
    MARGIN + ((value - minX) / (maxX - minX)) * plotWidth;
  const yScale = (value) =>
    HEIGHT - MARGIN - ((value - minY) / (maxY - minY)) * plotHeight;

  const axis = createSvg("g", { class: "axis" });
  const labels = createSvg("g", { class: "labels" });
  const facGroup = createSvg("g", { class: "faculties" });
  const profGroup = createSvg("g", { class: "professors" });
  const originGroup = createSvg("g", { class: "origin" });

  const xZero = xScale(0);
  const yZero = yScale(0);

  axis.appendChild(
    createSvg("line", {
      x1: MARGIN,
      y1: yZero,
      x2: WIDTH - MARGIN,
      y2: yZero,
      stroke: "rgba(255,255,255,0.45)",
      "stroke-width": 1.4,
    })
  );

  axis.appendChild(
    createSvg("line", {
      x1: xZero,
      y1: MARGIN,
      x2: xZero,
      y2: HEIGHT - MARGIN,
      stroke: "rgba(255,255,255,0.45)",
      "stroke-width": 1.4,
    })
  );

  labels.appendChild(
    createSvg("text", {
      x: WIDTH - MARGIN,
      y: yZero - 14,
      fill: "#ffffff",
      "font-size": 16,
      "text-anchor": "end",
      opacity: 0.75,
    })
  ).textContent = "istok";

  labels.appendChild(
    createSvg("text", {
      x: MARGIN,
      y: yZero - 14,
      fill: "#ffffff",
      "font-size": 16,
      "text-anchor": "start",
      opacity: 0.75,
    })
  ).textContent = "zapad";

  labels.appendChild(
    createSvg("text", {
      x: xZero + 14,
      y: MARGIN + 16,
      fill: "#ffffff",
      "font-size": 16,
      "text-anchor": "start",
      opacity: 0.75,
    })
  ).textContent = "sjever";

  labels.appendChild(
    createSvg("text", {
      x: xZero + 14,
      y: HEIGHT - MARGIN - 8,
      fill: "#ffffff",
      "font-size": 16,
      "text-anchor": "start",
      "dominant-baseline": "ideographic",
      opacity: 0.75,
    })
  ).textContent = "jug";

  const originPoint = createSvg("circle", {
    cx: xZero,
    cy: yZero,
    r: 6.6,
    fill: "#ffffff",
    stroke: "rgba(255,255,255,0.3)",
    "stroke-width": 2,
  });
  originGroup.appendChild(originPoint);

  const originLabel = createSvg("text", {
    x: xZero + 10,
    y: yZero - 10,
    fill: "#ffffff",
    "font-size": 14,
    "text-anchor": "start",
    opacity: 0.85,
  });
  originLabel.textContent = "Rijeka";
  originGroup.appendChild(originLabel);

  faculties.forEach((fac) => {
    const radius = radiusScale(fac.count);
    const circle = createSvg("circle", {
      cx: xScale(fac.x),
      cy: yScale(fac.y),
      r: radius,
      fill: "var(--accent-2)",
      stroke: "rgba(0,0,0,0.15)",
    });
    circle.dataset.label = fac.faculty;
    circle.dataset.extra = String(fac.count);
    circle.dataset.faculty = fac.faculty;
    circle.setAttribute("cursor", "pointer");
    circle.addEventListener("click", (event) => {
      event.stopPropagation();
      activeFaculty = activeFaculty === fac.faculty ? null : fac.faculty;
      renderChart(cachedFaculties);
    });
    facGroup.appendChild(circle);
  });

  if (activeFaculty && professorPoints.length) {
    professorPoints.forEach((prof) => {
        const coordLabel = `${formatNumber(prof.lat)};${formatNumber(prof.lon)}`;
      const circle = createSvg("circle", {
        cx: xScale(prof.x),
        cy: yScale(prof.y),
        r: 4.41,
        fill: "var(--accent-1)",
        stroke: "rgba(0,0,0,0.15)",
      });
      circle.dataset.label = prof.name || "Professor";
        circle.dataset.extra = [prof.destination, coordLabel]
          .filter(Boolean)
          .join(" • ");
      circle.addEventListener("click", (event) => {
        event.stopPropagation();
      });
      profGroup.appendChild(circle);
    });
  }

  const mapLabel = createSvg("text", {
    x: WIDTH - MARGIN,
    y: MARGIN,
    fill: "#ffffff",
    "font-size": 16,
    "text-anchor": "end",
    "dominant-baseline": "hanging",
    opacity: 0.85,
  });
  mapLabel.textContent = activeFaculty ? `← ${activeFaculty}` : "Svi fakulteti";

  chart.appendChild(axis);
  chart.appendChild(labels);
  chart.appendChild(mapLabel);
  chart.appendChild(originGroup);
  chart.appendChild(facGroup);
  chart.appendChild(profGroup);

  const labelsGroup = createSvg("g", { class: "point-labels" });
  const addLabel = (x, y, text) => {
    const label = createSvg("text", {
      x: x + 8,
      y: y - 8,
      fill: "#ffffff",
      "font-size": 11,
      "text-anchor": "start",
      "pointer-events": "none",
      opacity: 0.8,
    });
    label.textContent = text;
    labelsGroup.appendChild(label);
  };

  if (!activeFaculty && getToggleState(toggles.labels, false)) {
    faculties.forEach((fac) => {
      addLabel(xScale(fac.x), yScale(fac.y), fac.faculty || "Faculty");
    });
  }

  chart.appendChild(labelsGroup);

  const attachTooltip = (element) => {
    element.addEventListener("mouseenter", (event) => {
      const { label, extra } = event.target.dataset;
      if (!label) return;
      tooltip.textContent = extra ? `${label} • ${extra}` : label;
      tooltip.classList.add("show");
    });
    element.addEventListener("mousemove", (event) => {
      const bounds = chart.getBoundingClientRect();
      const x = event.clientX - bounds.left;
      const y = event.clientY - bounds.top;
      tooltip.style.left = `${x}px`;
      tooltip.style.top = `${y}px`;
    });
    element.addEventListener("mouseleave", () => {
      tooltip.classList.remove("show");
    });
  };

  [...facGroup.children, ...profGroup.children].forEach(attachTooltip);

  facGroup.style.display =
    !activeFaculty && getToggleState(toggles.faculties, true) ? "block" : "none";
  profGroup.style.display = activeFaculty ? "block" : "none";
};

const renderList = (faculties) => {
  if (!facultyList) return;
  facultyList.innerHTML = "";
  faculties.forEach((fac) => {
    const item = document.createElement("div");
    item.className = "list__item";
    const name = document.createElement("span");
    name.textContent = fac.faculty;
    const coords = document.createElement("span");
    coords.textContent = `(${formatNumber(fac.x)}, ${formatNumber(fac.y)})`;
    item.appendChild(name);
    item.appendChild(coords);
    facultyList.appendChild(item);
  });
};

const init = async () => {
  const response = await fetch(DATA_FILE);
  const buffer = await response.arrayBuffer();
  const text = new TextDecoder("iso-8859-1").decode(buffer);
  const rows = parseCSV(text, ";");
  let geocodeCache = {};
  try {
    const cacheResponse = await fetch(GEOCODE_CACHE);
    if (cacheResponse.ok) {
      geocodeCache = await cacheResponse.json();
    }
  } catch (error) {
    console.warn("Failed to load geocode cache.", error);
  }

  const { faculties, professors } = buildData(rows, geocodeCache);

  cachedFaculties = faculties;
  cachedProfessors = professors;
  if (facultyCount) {
    facultyCount.textContent = faculties.length;
  }

  renderList(faculties);
  renderChart(faculties);

  if (toggles.faculties) {
    toggles.faculties.addEventListener("change", () => {
      renderChart(cachedFaculties);
    });
  }

  if (toggles.labels) {
    toggles.labels.addEventListener("change", () => {
      renderChart(cachedFaculties);
    });
  }
};

init().catch((error) => {
  console.error(error);
});
