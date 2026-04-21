// Artemis II Crew Picker
// 4 crew-member types: White Male, White Female, Black Male, Black Female
// 35 possible unordered combinations of 4 from 4 types (multiset)

const TYPES = [
  { key: 'wm', label: 'White Male',   gender: 'm', skin: '#E0B8B8' },
  { key: 'wf', label: 'White Female', gender: 'f', skin: '#E0B8B8' },
  { key: 'bm', label: 'Black Male',   gender: 'm', skin: '#7A5038' },
  { key: 'bf', label: 'Black Female', gender: 'f', skin: '#7A5038' },
];

const HEAD_IDS = { f: 'f_x5F_head', m: 'm_x5F_head' };
let svgTemplates = {};      // { f: SVGElement, m: SVGElement, rocket: SVGElement }

// ── SVG Loading ────────────────────────────────────────────────────
async function loadSVG(url) {
  const res = await fetch(url);
  const txt = await res.text();
  const doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
  return doc.documentElement;
}

async function init() {
  const base = import.meta.env.BASE_URL;
  const [fSvg, mSvg, rocketSvg] = await Promise.all([
    loadSVG(base + 'artemis/f_astro.svg'),
    loadSVG(base + 'artemis/m_astro.svg'),
    loadSVG(base + 'artemis/rocket_astro.svg'),
  ]);
  svgTemplates.f = fSvg;
  svgTemplates.m = mSvg;
  svgTemplates.rocket = rocketSvg;

  const combos = generateCombinations();
  renderGrid(combos);
}

// ── Astronaut Factory ──────────────────────────────────────────────
function createAstronaut(type) {
  const svg = svgTemplates[type.gender].cloneNode(true);
  svg.removeAttribute('id');
  svg.removeAttribute('xml:space');
  svg.removeAttribute('enable-background');
  svg.classList.add('astro-svg');
  if (type.gender === 'f') svg.classList.add('astro-female');

  const headId = HEAD_IDS[type.gender];
  const head = svg.querySelector(`#${headId}`);
  if (head) head.setAttribute('fill', type.skin);
  return svg;
}

function createRocket() {
  const svg = svgTemplates.rocket.cloneNode(true);
  svg.removeAttribute('id');
  svg.classList.add('rocket-svg');
  return svg;
}

// ── Combination Generator ──────────────────────────────────────────
function generateCombinations() {
  const combos = [];
  for (let wm = 0; wm <= 4; wm++)
    for (let wf = 0; wf <= 4 - wm; wf++)
      for (let bm = 0; bm <= 4 - wm - wf; bm++) {
        const bf = 4 - wm - wf - bm;
        combos.push({ wm, wf, bm, bf });
      }
  return combos; // exactly 35
}

function comboToCrewList(combo) {
  const list = [];
  TYPES.forEach(t => {
    for (let i = 0; i < combo[t.key]; i++) list.push(t);
  });
  return list;
}

function comboLabel(combo) {
  return TYPES
    .filter(t => combo[t.key] > 0)
    .map(t => `${combo[t.key]}× ${t.label}`)
    .join(', ');
}

// ── Grid Rendering ─────────────────────────────────────────────────
function renderGrid(combos) {
  const grid = document.getElementById('artemis-grid');
  grid.innerHTML = '';
  combos.forEach(combo => {
    const card = document.createElement('div');
    card.className = 'artemis-card';

    const crewRow = document.createElement('div');
    crewRow.className = 'artemis-card-crew';
    comboToCrewList(combo).forEach(type => {
      crewRow.appendChild(createAstronaut(type));
    });

    const label = document.createElement('div');
    label.className = 'artemis-card-label';
    label.textContent = comboLabel(combo);

    const btn = document.createElement('button');
    btn.className = 'artemis-pick-btn';
    btn.textContent = 'PICK CREW';
    btn.addEventListener('click', () => openLaunchScene(combo));

    card.append(crewRow, label, btn);
    grid.appendChild(card);
  });
}

// ── Launch Scene ───────────────────────────────────────────────────
let launchEl;

function openLaunchScene(combo) {
  launchEl = document.getElementById('artemis-launch');
  launchEl.classList.remove('hidden');
  launchEl.innerHTML = '';
  document.body.style.overflow = 'hidden';
  showPreLaunch(combo);
}

function closeLaunchScene() {
  launchEl.classList.add('hidden');
  launchEl.innerHTML = '';
  document.body.style.overflow = '';
}

// ── Scene 1: Pre-launch ───────────────────────────────────────────
function showPreLaunch(combo) {
  launchEl.innerHTML = '';
  launchEl.className = 'artemis-launch prelaunch';

  // Ground
  const ground = el('div', 'launch-ground');
  launchEl.appendChild(ground);

  // Crew group
  const crewGroup = el('div', 'launch-crew');
  comboToCrewList(combo).forEach(type => {
    crewGroup.appendChild(createAstronaut(type));
  });
  launchEl.appendChild(crewGroup);

  // Rocket
  const rocketWrap = el('div', 'launch-rocket-wrap');
  rocketWrap.appendChild(createRocket());
  // Flame container (hidden initially)
  const flames = el('div', 'launch-flames hidden');
  for (let i = 0; i < 5; i++) flames.appendChild(el('div', 'flame'));
  rocketWrap.appendChild(flames);
  launchEl.appendChild(rocketWrap);

  // Back button
  const backBtn = el('button', 'launch-back-btn');
  backBtn.textContent = '← Back';
  backBtn.addEventListener('click', closeLaunchScene);
  launchEl.appendChild(backBtn);

  // LAUNCH button
  const launchBtn = el('button', 'launch-go-btn');
  launchBtn.innerHTML = 'LAUNCH';
  launchBtn.addEventListener('click', () => runLaunchSequence(combo));
  launchEl.appendChild(launchBtn);
}

// ── Launch Sequence ─────────────────────────────────────────────
function runLaunchSequence(combo) {
  const launchBtn = launchEl.querySelector('.launch-go-btn');
  const backBtn = launchEl.querySelector('.launch-back-btn');
  if (launchBtn) launchBtn.remove();
  if (backBtn) backBtn.remove();

  const crewGroup = launchEl.querySelector('.launch-crew');
  const rocketWrap = launchEl.querySelector('.launch-rocket-wrap');
  const flames = launchEl.querySelector('.launch-flames');
  const ground = launchEl.querySelector('.launch-ground');

  // Phase 1: Walk to rocket (2s)
  crewGroup.classList.add('walking');

  setTimeout(() => {
    // Phase 2: Board (crew fades)
    crewGroup.classList.remove('walking');
    crewGroup.classList.add('boarding');

    setTimeout(() => {
      // Phase 3: Rumble + flames
      crewGroup.classList.add('hidden');
      flames.classList.remove('hidden');
      rocketWrap.classList.add('rumbling');
      launchEl.classList.add('shaking');

      // Add smoke puffs
      const smokeContainer = el('div', 'smoke-container');
      launchEl.appendChild(smokeContainer);
      const smokeInterval = setInterval(() => spawnSmoke(smokeContainer, rocketWrap), 120);

      setTimeout(() => {
        // Phase 4: Liftoff
        rocketWrap.classList.add('liftoff');
        launchEl.classList.add('shaking-hard');

        setTimeout(() => {
          // Phase 5: Transition to space
          clearInterval(smokeInterval);
          launchEl.classList.remove('shaking', 'shaking-hard');
          launchEl.classList.add('space');
          ground.classList.add('hidden');
          if (smokeContainer) smokeContainer.remove();

          // Stars
          const starField = el('div', 'star-field');
          for (let i = 0; i < 80; i++) {
            const star = el('div', 'star');
            star.style.left = Math.random() * 100 + '%';
            star.style.top = Math.random() * 100 + '%';
            star.style.animationDelay = (Math.random() * 3) + 's';
            star.style.width = star.style.height = (Math.random() * 3 + 1) + 'px';
            starField.appendChild(star);
          }
          launchEl.appendChild(starField);

          setTimeout(() => {
            // Phase 6: Godspeed message
            const msg = el('div', 'godspeed');
            msg.innerHTML = '<div class="godspeed-text">Godspeed, Artemis II</div>';
            const backBtn2 = el('button', 'launch-back-btn godspeed-back');
            backBtn2.textContent = '← Back to crew selection';
            backBtn2.addEventListener('click', closeLaunchScene);
            msg.appendChild(backBtn2);
            launchEl.appendChild(msg);
            requestAnimationFrame(() => msg.classList.add('visible'));
          }, 1500);
        }, 2500);
      }, 1500);
    }, 800);
  }, 2000);
}

function spawnSmoke(container, rocketWrap) {
  const puff = el('div', 'smoke-puff');
  const rect = rocketWrap.getBoundingClientRect();
  const launchRect = launchEl.getBoundingClientRect();
  puff.style.left = (rect.left - launchRect.left + rect.width * 0.3 + Math.random() * rect.width * 0.4) + 'px';
  puff.style.top = (rect.bottom - launchRect.top - 20 + Math.random() * 40) + 'px';
  const size = 20 + Math.random() * 50;
  puff.style.width = puff.style.height = size + 'px';
  container.appendChild(puff);
  setTimeout(() => puff.remove(), 1200);
}

// ── Helpers ─────────────────────────────────────────────────────────
function el(tag, className) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

// ── Boot ────────────────────────────────────────────────────────────
init();
