// Skin Color Survey Visualization
// Loads skin_color_icons.json + f_astro.svg, renders 13 country rows × 2 years

const HEAD_ID = 'f_x5F_head';
let svgTemplate = null;

async function loadSVG(url) {
  const res = await fetch(url);
  const txt = await res.text();
  const doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
  return doc.documentElement;
}

function createFigure(hex) {
  const svg = svgTemplate.cloneNode(true);
  svg.removeAttribute('id');
  svg.removeAttribute('xml:space');
  svg.removeAttribute('enable-background');
  svg.classList.add('skin-fig');
  const head = svg.querySelector(`#${HEAD_ID}`);
  if (head) head.setAttribute('fill', hex);
  return svg;
}

function groupByCountry(data) {
  const map = new Map();
  for (const entry of data) {
    if (!map.has(entry.country)) {
      map.set(entry.country, {});
    }
    const key = entry.year === 2010 ? 'y2010' : 'y2023';
    map.get(entry.country)[key] = entry.icons;
  }
  return map;
}

function expandIcons(icons) {
  const expanded = [];
  for (const icon of icons) {
    for (let i = 0; i < icon.count; i++) {
      expanded.push(icon.hex);
    }
  }
  return expanded;
}

function renderViz(countries) {
  const viz = document.getElementById('skin-color-viz');

  // Header row
  const header = document.createElement('div');
  header.className = 'sc-row sc-header';
  header.innerHTML = `
    <div class="sc-country"></div>
    <div class="sc-year-group sc-year-label">2010</div>
    <div class="sc-year-group sc-year-label">2023</div>
  `;
  viz.appendChild(header);

  // Country rows
  for (const [country, years] of countries) {
    const row = document.createElement('div');
    row.className = 'sc-row';

    const label = document.createElement('div');
    label.className = 'sc-country';
    label.textContent = country;
    row.appendChild(label);

    // 2010 group
    const group2010 = document.createElement('div');
    group2010.className = 'sc-year-group';
    for (const hex of expandIcons(years.y2010)) {
      group2010.appendChild(createFigure(hex));
    }
    row.appendChild(group2010);

    // 2023 group
    const group2023 = document.createElement('div');
    group2023.className = 'sc-year-group';
    for (const hex of expandIcons(years.y2023)) {
      group2023.appendChild(createFigure(hex));
    }
    row.appendChild(group2023);

    viz.appendChild(row);
  }
}

function renderLegend(data) {
  const legend = document.getElementById('skin-color-legend');
  const toneMap = new Map();
  for (const entry of data) {
    for (const icon of entry.icons) {
      if (!toneMap.has(icon.tone)) {
        toneMap.set(icon.tone, icon.hex);
      }
    }
  }

  const sorted = [...toneMap.entries()].sort((a, b) => a[0] - b[0]);

  const title = document.createElement('div');
  title.className = 'sc-legend-title';
  title.textContent = 'Skin tone palette';
  legend.appendChild(title);

  const row = document.createElement('div');
  row.className = 'sc-legend-row';
  for (const [tone, hex] of sorted) {
    const swatch = document.createElement('div');
    swatch.className = 'sc-swatch';
    swatch.innerHTML = `
      <div class="sc-swatch-color" style="background:${hex}"></div>
      <div class="sc-swatch-label">${tone}</div>
    `;
    row.appendChild(swatch);
  }
  legend.appendChild(row);
}

async function init() {
  const base = import.meta.env.BASE_URL;
  const [data, fSvg] = await Promise.all([
    fetch(base + 'data/skin_color_icons.json').then(r => r.json()),
    loadSVG(base + 'artemis/f_astro.svg'),
  ]);

  svgTemplate = fSvg;
  const countries = groupByCountry(data);
  renderViz(countries);
  renderLegend(data);
}

init();
