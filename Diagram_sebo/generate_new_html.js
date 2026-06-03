const fs = require('fs');

const inputFile = 'c:\\Users\\HP\\Code\\Network Diagram\\erasmus_staff_mobility_fully_cleaned.csv';
const outputFile = 'c:\\Users\\HP\\Code\\Network Diagram\\erasmus.html';

// ── CSV Parser ───────────────────────────────────────────────────────
function parseCSV(text) {
    const lines = text.split(/\r?\n/);
    const headers = lines[0].split(',').map(h => h.trim());
    const results = [];
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const row = [];
        let inQuotes = false;
        let current = '';
        for (let j = 0; j < lines[i].length; j++) {
            const char = lines[i][j];
            if (char === '"') { inQuotes = !inQuotes; }
            else if (char === ',' && !inQuotes) { row.push(current.trim()); current = ''; }
            else { current += char; }
        }
        row.push(current.trim());
        const obj = {};
        headers.forEach((h, idx) => { obj[h] = row[idx] || ''; });
        results.push(obj);
    }
    return results;
}

// ── Faculty Normalization ────────────────────────────────────────────
function normalizeFaculty(name) {
    if (!name) return null;
    const n = name.trim();
    const map = {
        // Academy of Applied Arts
        'APU': 'Akademija primijenjenih umjetnosti',
        'Akademija primijenjenih umjetnosti': 'Akademija primijenjenih umjetnosti',
        // Tourism & Hospitality Management
        'FMTU': 'FMTU',
        'Fakultet za menadžment u turizmu i ugostiteljstvu': 'FMTU',
        'Fakultet za menadžment u turizmu i ugostiteljstvu': 'FMTU',
        // Informatics
        'Odjel za informatiku': 'Fakultet za informatiku',
        'Fakultet za informatiku': 'Fakultet za informatiku',
        'Fakultet za informatiku i digitalne tehnologije': 'Fakultet za informatiku',
        'Fakultet informatike i digitalnih tehnologija': 'Fakultet za informatiku',
        'Frakultet informatike i digitalnih tehnologija': 'Fakultet za informatiku',
        // Mathematics
        'Odjel za matematiku': 'Fakultet za matematiku',
        'Fakultet za matematiku': 'Fakultet za matematiku',
        // Biotechnology
        'Odjel za biotehnologiju': 'Fakultet biotehnologije',
        'Odjel za bioteholgiju': 'Fakultet biotehnologije',
        'Fakultet biotehnologije i razvoja lijekova': 'Fakultet biotehnologije',
        // Physics
        'Odjel za fiziku': 'Fakultet za fiziku',
        'Fakultet za fiziku': 'Fakultet za fiziku',
        // Rector's Office / University admin
        'Rektorat': 'Rektorat',
        'Sveučilište u Rijeci - Rektorat': 'Rektorat',
        'Sveučilište u Rijeci': 'Rektorat',
        'Rektorat Sveučilišta u Rijeci': 'Rektorat',
        'Rektorat Sveučilište u Rijeci': 'Rektorat',
        'Sveučilište u Rijeci, Rektorat': 'Rektorat',
        'Sveučilište u Rijeci (Rektorat)': 'Rektorat',
        'Rektorat / Sveučilište u Rijeci': 'Rektorat',
        'Rektorat/CAS SEE': 'Rektorat',
        'Sveučilište u Rijeci - Rektorat': 'Rektorat',
        // Counseling Center
        'SSC': 'SSC',
        'SSC Sveučilišta u Rijeci': 'SSC',
        'Sveučilišni savjetovališni centar': 'SSC',
        'Sveučilišni savjetovališni centar (Rektorat UNIRI)': 'SSC',
        // AI Research Institute
        'AIRI UNIRI': 'AIRI',
        'Sveučilište u Rijeci, Centar za napredno računanje i modeliranje': 'AIRI',
        'University in Rijeka, Centre for Artificial Intelligence and Cybersecurity': 'AIRI',
        // Speech therapy
        'Studij Logopedija': 'Fakultet za logopediju',
        'Fakultet za logopediju': 'Fakultet za logopediju',
        // Library
        'Sveučilišna knjižnica': 'Sveučilišna knjižnica',
        'Sveučilišna knjižnica Rijeka': 'Sveučilišna knjižnica',
        // Law faculty
        'Pravni fakultet': 'Pravni fakultet',
        'Pravni Fakultet': 'Pravni fakultet',
        // Health Studies
        'Fakultet za zdravstvene studije': 'Fakultet za zdravstvene studije',
        'Fakultet zdravstvenih studija': 'Fakultet za zdravstvene studije',
        // Data-quality issues (not real faculties)
        'Universidad de Oviedo, Oviedo': null,
        'The Highway Institute, Belgrade': null,
        // Other standalone faculties (keep as-is)
        'Filozofski fakultet': 'Filozofski fakultet',
        'Ekonomski fakultet': 'Ekonomski fakultet',
        'Medicinski fakultet': 'Medicinski fakultet',
        'Tehnički fakultet': 'Tehnički fakultet',
        'Građevinski fakultet': 'Građevinski fakultet',
        'Pomorski fakultet': 'Pomorski fakultet',
        'Učiteljski fakultet': 'Učiteljski fakultet',
        'Fakultet dentalne medicine': 'Fakultet dentalne medicine',
        // Misc
        'Centar za studije mira i konflikata': 'Centar za studije mira',
        'Sveučilište u Rijeci, studij politehnike': 'Studij politehnike',
        'Geografski fakultet': 'Geografski fakultet',
    };
    return map[n] !== undefined ? map[n] : n;
}

// ── Short Labels ─────────────────────────────────────────────────────
function shortLabel(name) {
    const map = {
        'Akademija primijenjenih umjetnosti': 'APU',
        'FMTU': 'FMTU',
        'Fakultet za informatiku': 'Informatika',
        'Fakultet za matematiku': 'Matematika',
        'Fakultet biotehnologije': 'Biotehnologija',
        'Fakultet za fiziku': 'Fizika',
        'Rektorat': 'Rektorat',
        'SSC': 'SSC',
        'AIRI': 'AIRI',
        'Fakultet za logopediju': 'Logopedija',
        'Sveučilišna knjižnica': 'Knjižnica',
        'Filozofski fakultet': 'Filozofski',
        'Ekonomski fakultet': 'Ekonomski',
        'Medicinski fakultet': 'Medicinski',
        'Tehnički fakultet': 'Tehnički',
        'Građevinski fakultet': 'Građevinski',
        'Pravni fakultet': 'Pravni',
        'Pomorski fakultet': 'Pomorski',
        'Učiteljski fakultet': 'Učiteljski',
        'Fakultet dentalne medicine': 'Dentalna med.',
        'Fakultet za zdravstvene studije': 'Zdravstveni',
        'Centar za studije mira': 'Centar za mir',
        'Studij politehnike': 'Politehnika',
        'Geografski fakultet': 'Geografski',
    };
    return map[name] || name;
}

// ── Main ─────────────────────────────────────────────────────────────
try {
    const csvContent = fs.readFileSync(inputFile, 'utf8');
    const data = parseCSV(csvContent);

    // Filter: skip entries with no destination
    const clean = data.filter(d => {
        const dest = (d['fi_canonical_name'] || '').trim();
        const fac = (d['sastavnica_name'] || '').trim();
        return dest && dest !== '-' && fac && fac !== '-';
    });

    // We can use sastavnica_name directly as it's already cleaned
    clean.forEach(d => {
        d._normalizedFaculty = d['sastavnica_name'].trim();
        d._normalizedDest = d['fi_canonical_name'].trim();
    });

    // Build faculty set
    const facultySet = new Set(clean.map(d => d._normalizedFaculty));
    const faculties = [...facultySet].sort();

    // Build destination set and count unique source faculties per destination
    const destFacultyMap = new Map(); // dest -> Set of faculties
    clean.forEach(d => {
        const dest = d._normalizedDest;
        if (!destFacultyMap.has(dest)) destFacultyMap.set(dest, new Set());
        destFacultyMap.get(dest).add(d._normalizedFaculty);
    });

    // Build aggregated professor nodes (group by name + faculty)
    const profKey = (name, faculty) => `${name}|||${faculty}`;
    const profAgg = new Map();
    let totalMobilities = 0;

    clean.forEach(d => {
        const name = `${d['first_name']} ${d['last_name']}`;
        const key = profKey(name, d._normalizedFaculty);
        if (!profAgg.has(key)) {
            profAgg.set(key, {
                id: `prof_${profAgg.size}`,
                name,
                faculty: d._normalizedFaculty,
                count: 0,
                destinations: new Set(),
                years: new Set(),
            });
        }
        const p = profAgg.get(key);
        p.count++;
        totalMobilities++;
        p.destinations.add(d._normalizedDest);
        if (d['academic_year']) p.years.add(d['academic_year']);
    });

    const professors = [...profAgg.values()].map(p => ({
        ...p,
        destinations: [...p.destinations],
        years: [...p.years],
    }));

    // Build data for embedding
    const embeddedData = {
        faculties: faculties.map(f => ({ id: f, label: shortLabel(f) })),
        professors: professors.map(p => ({
            id: p.id,
            name: p.name,
            faculty: p.faculty,
            count: p.count,
            destinations: p.destinations,
            years: p.years,
        })),
        destinations: [...destFacultyMap.entries()].map(([name, facSet]) => ({
            name: name,
            numSources: facSet.size,
            sources: [...facSet],
        })),
        totalMobilities: totalMobilities,
    };

    console.log(`Faculties: ${faculties.length}`);
    console.log(`Professors (unique): ${professors.length}`);
    console.log(`Mobilities (total): ${totalMobilities}`);
    console.log(`Destinations: ${destFacultyMap.size}`);

    // ── HTML Template ────────────────────────────────────────────────
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Erasmus Staff Mobility Network – University of Rijeka</title>
    <meta name="description" content="Interactive network visualization of Erasmus staff mobility at the University of Rijeka, showing how faculties send professors to universities worldwide.">
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <script src="https://d3js.org/d3.v7.min.js"><\/script>
    <style>
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            background: #080c14;
            color: #e0e6ed;
            overflow: hidden;
            height: 100vh;
            width: 100vw;
        }

        /* ── Header ─────────────────────────────────────────────── */
        #header {
            position: fixed;
            top: 0; left: 0; right: 0;
            z-index: 100;
            background: linear-gradient(180deg, rgba(8,12,20,0.95) 0%, rgba(8,12,20,0.7) 80%, transparent 100%);
            padding: 16px 32px 28px;
            display: flex;
            align-items: center;
            gap: 16px;
            pointer-events: none;
        }
        #header > * { pointer-events: auto; }
        #header h1 {
            font-size: 20px;
            font-weight: 600;
            background: linear-gradient(135deg, #60a5fa, #a78bfa);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            letter-spacing: -0.3px;
        }
        #header .subtitle {
            font-size: 12px;
            color: #64748b;
            font-weight: 400;
        }
        .stats-bar {
            margin-left: auto;
            display: flex;
            gap: 20px;
            font-size: 11px;
            color: #94a3b8;
        }
        .stats-bar .stat-val { color: #e0e6ed; font-weight: 600; font-size: 14px; }

        /* ── Legend Panel ───────────────────────────────────────── */
        #legend-panel {
            position: fixed;
            top: 70px; left: 16px;
            z-index: 90;
            background: rgba(15, 20, 35, 0.85);
            backdrop-filter: blur(16px);
            border: 1px solid rgba(100, 116, 139, 0.15);
            border-radius: 12px;
            padding: 14px 16px;
            max-height: calc(100vh - 100px);
            overflow-y: auto;
            width: 220px;
            scrollbar-width: thin;
            scrollbar-color: #334155 transparent;
        }
        #legend-panel h3 {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 1px;
            color: #64748b;
            margin-bottom: 10px;
        }
        .legend-item {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 5px 6px;
            border-radius: 6px;
            cursor: pointer;
            transition: background 0.2s;
            font-size: 12px;
            color: #cbd5e1;
        }
        .legend-item:hover { background: rgba(100, 116, 139, 0.15); }
        .legend-item.active { background: rgba(100, 116, 139, 0.25); }
        .legend-dot {
            width: 10px; height: 10px;
            border-radius: 50%;
            flex-shrink: 0;
        }
        .legend-count {
            margin-left: auto;
            font-size: 10px;
            color: #64748b;
            font-weight: 500;
        }

        /* ── Info Panel ─────────────────────────────────────────── */
        #info-panel {
            position: fixed;
            bottom: 20px; right: 20px;
            z-index: 90;
            background: rgba(15, 20, 35, 0.9);
            backdrop-filter: blur(16px);
            border: 1px solid rgba(100, 116, 139, 0.15);
            border-radius: 12px;
            padding: 16px 20px;
            max-width: 320px;
            font-size: 13px;
            opacity: 0;
            transform: translateY(8px);
            transition: opacity 0.3s, transform 0.3s;
            pointer-events: none;
        }
        #info-panel.visible { opacity: 1; transform: translateY(0); pointer-events: auto; }
        #info-panel h4 {
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 6px;
            color: #f1f5f9;
        }
        #info-panel .info-detail {
            font-size: 12px;
            color: #94a3b8;
            line-height: 1.6;
        }
        #info-panel .info-tag {
            display: inline-block;
            background: rgba(96,165,250,0.15);
            color: #60a5fa;
            padding: 2px 8px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 500;
            margin: 2px 2px;
        }

        /* ── Tooltip ────────────────────────────────────────────── */
        #tooltip {
            position: fixed;
            background: rgba(15, 20, 35, 0.95);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(100, 116, 139, 0.2);
            border-radius: 8px;
            padding: 8px 12px;
            font-size: 12px;
            color: #e0e6ed;
            pointer-events: none;
            opacity: 0;
            transition: opacity 0.15s;
            z-index: 200;
            max-width: 320px;
            line-height: 1.4;
        }

        /* ── Controls ───────────────────────────────────────────── */
        #controls {
            position: fixed;
            bottom: 20px; left: 50%;
            transform: translateX(-50%);
            z-index: 90;
            display: flex;
            gap: 8px;
        }
        .ctrl-btn {
            background: rgba(15, 20, 35, 0.85);
            backdrop-filter: blur(16px);
            border: 1px solid rgba(100, 116, 139, 0.2);
            border-radius: 8px;
            padding: 8px 14px;
            color: #94a3b8;
            font-size: 12px;
            font-family: 'Inter', sans-serif;
            cursor: pointer;
            transition: all 0.2s;
        }
        .ctrl-btn:hover { background: rgba(30, 40, 65, 0.9); color: #e0e6ed; border-color: rgba(100, 116, 139, 0.4); }

        /* ── SVG ────────────────────────────────────────────────── */
        #viz-container { width: 100vw; height: 100vh; }
        svg { display: block; }
    </style>
</head>
<body>
    <div id="header">
        <div>
            <h1>Erasmus Staff Mobility Network</h1>
            <div class="subtitle">University of Rijeka · Faculty → Professor → Destination</div>
        </div>
        <div class="stats-bar">
            <div><div class="stat-val" id="stat-fac">0</div>Faculties</div>
            <div><div class="stat-val" id="stat-prof">0</div>Professors</div>
            <div><div class="stat-val" id="stat-mob">0</div>Mobilities</div>
            <div><div class="stat-val" id="stat-dest">0</div>Destinations</div>
        </div>
    </div>

    <div id="legend-panel">
        <h3>Sending Faculties</h3>
        <div id="legend-list"></div>
    </div>

    <div id="info-panel">
        <h4 id="info-title"></h4>
        <div class="info-detail" id="info-detail"></div>
    </div>

    <div id="tooltip"></div>

    <div id="controls">
        <button class="ctrl-btn" id="btn-reset">Reset View</button>
        <button class="ctrl-btn" id="btn-clear">Clear Selection</button>
    </div>

    <div id="viz-container"></div>

    <script>
    // ── Embedded Data ────────────────────────────────────────────────
    const DATA = ${JSON.stringify(embeddedData)};

    // ── Color Palette ────────────────────────────────────────────────
    const FACULTY_COLORS = [
        '#60a5fa','#f472b6','#34d399','#fbbf24','#a78bfa',
        '#fb923c','#22d3ee','#e879f9','#4ade80','#f87171',
        '#38bdf8','#c084fc','#2dd4bf','#facc15','#fb7185',
        '#818cf8','#a3e635','#f97316','#67e8f9','#d946ef',
        '#86efac','#fda4af','#93c5fd','#fdba74','#6ee7b7',
    ];

    function getFacultyColor(idx) {
        return FACULTY_COLORS[idx % FACULTY_COLORS.length];
    }

    // ── Setup ────────────────────────────────────────────────────────
    const width = window.innerWidth;
    const height = window.innerHeight;
    const centerX = width / 2;
    const centerY = height / 2;

    // Stats
    document.getElementById('stat-fac').textContent = DATA.faculties.length;
    document.getElementById('stat-prof').textContent = DATA.professors.length;
    document.getElementById('stat-mob').textContent = DATA.totalMobilities;
    document.getElementById('stat-dest').textContent = DATA.destinations.length;

    // Build color map
    const facultyColorMap = new Map();
    DATA.faculties.forEach((f, i) => { facultyColorMap.set(f.id, getFacultyColor(i)); });

    // ── Compute Layout ───────────────────────────────────────────────
    const facRadius = Math.min(width, height) * 0.30;
    const profSpread = Math.min(width, height) * 0.08;

    // Faculty positions – arranged in a circle
    const facultyPositions = new Map();
    DATA.faculties.forEach((f, i) => {
        const angle = (i / DATA.faculties.length) * 2 * Math.PI - Math.PI / 2;
        const x = centerX + facRadius * Math.cos(angle);
        const y = centerY + facRadius * Math.sin(angle);
        facultyPositions.set(f.id, { x, y, angle, color: getFacultyColor(i) });
    });

    // Proxy positions (for collapsed state)
    const proxyPositions = new Map();
    facultyPositions.forEach((fpos, facId) => {
        const r = 26; // attached to the edge
        const x = fpos.x + r * Math.cos(fpos.angle);
        const y = fpos.y + r * Math.sin(fpos.angle);
        proxyPositions.set(facId, { x, y, color: fpos.color });
    });

    // Group professors by faculty
    const profByFaculty = new Map();
    DATA.faculties.forEach(f => profByFaculty.set(f.id, []));
    DATA.professors.forEach(p => {
        if (profByFaculty.has(p.faculty)) profByFaculty.get(p.faculty).push(p);
    });

    // Count total mobilities per faculty (for faculty node sizing)
    const mobCountByFaculty = new Map();
    DATA.faculties.forEach(f => mobCountByFaculty.set(f.id, 0));
    DATA.professors.forEach(p => {
        if (mobCountByFaculty.has(p.faculty)) {
            mobCountByFaculty.set(p.faculty, mobCountByFaculty.get(p.faculty) + p.count);
        }
    });

    // Professor node radius function – scales with participation count
    function profRadius(count) { return 2.5 + Math.sqrt(count - 1) * 2.5; }

    // Professor positions – start with a math layout and resolve overlaps with a force simulation
    const profPositions = new Map();
    const profNodeData = [];
    profByFaculty.forEach((profs, facId) => {
        const fpos = facultyPositions.get(facId);
        const n = profs.length;
        profs.forEach((p, i) => {
            // Strict cone layout: restrict wedge to safely fit within this faculty's angular slice
            const baseAngle = fpos.angle;
            const goldenRatio = 0.61803398875;
            const fraction = (i * goldenRatio) % 1; 
            
            // Maximum half-angle allowed so it doesn't touch neighboring faculties (95% to leave a tiny gap)
            const maxAllowedWedge = (Math.PI / DATA.faculties.length) * 0.95; 
            // Allow the cone to be much wider naturally
            const maxWedge = Math.min(maxAllowedWedge, 0.2 + n * 0.03); 
            const a = baseAngle + (fraction * 2 - 1) * maxWedge;
            
            // Softer radial extension since the cone is wider
            const minR = 30; 
            const r = minR + Math.pow(i, 0.55) * 12; 
            
            const x = fpos.x + r * Math.cos(a);
            const y = fpos.y + r * Math.sin(a);
            
            profNodeData.push({ 
                id: p.id, x, y, initialX: x, initialY: y,
                faculty: facId, destinations: p.destinations, name: p.name, years: p.years, count: p.count 
            });
        });
    });

    // Resolve overlaps compactly while strictly preserving the cone shape
    const profSim = d3.forceSimulation(profNodeData)
        .force('collide', d3.forceCollide().radius(d => profRadius(d.count) + 1.5).strength(1))
        .force('x', d3.forceX(d => d.initialX).strength(0.4))
        .force('y', d3.forceY(d => d.initialY).strength(0.4))
        .stop();

    for (let i = 0; i < 150; i++) profSim.tick();

    profNodeData.forEach(d => {
        profPositions.set(d.id, d);
    });

    // Calculate max professor extension to form the invisible boundary
    let maxProfDist = 0;
    profPositions.forEach(p => {
        const dist = Math.sqrt((p.x - centerX)**2 + (p.y - centerY)**2);
        if (dist > maxProfDist) maxProfDist = dist;
    });

    // Destination positions – initially at centroid of connected professors, then force-separated
    const destPositions = new Map();
    const destProfMap = new Map(); // dest -> [{x,y}]
    DATA.professors.forEach(p => {
        const pp = profPositions.get(p.id);
        if (!pp) return;
        p.destinations.forEach(dest => {
            if (!destProfMap.has(dest)) destProfMap.set(dest, []);
            destProfMap.get(dest).push(pp);
        });
    });

    // Define the invisible circular boundary
    // Bring it even closer to the centre
    const baseRadius = Math.max(facRadius + 60, maxProfDist + 15);

    function destRadius(totalProfs) { return 3 + Math.sqrt(totalProfs) * 2; }

    const destData = DATA.destinations.map(d => {
        const profs = destProfMap.get(d.name) || [];
        let cx = centerX, cy = centerY;
        if (profs.length > 0) {
            cx = profs.reduce((s, p) => s + p.x, 0) / profs.length;
            cy = profs.reduce((s, p) => s + p.y, 0) / profs.length;
        }
        const dx = cx - centerX;
        const dy = cy - centerY;
        const angle = Math.atan2(dy, dx);
        
        // Target an orbit slightly outside the strict inner boundary to allow them to pack into a 2D band
        const targetDist = baseRadius + 40;
        
        return {
            name: d.name,
            numSources: d.numSources,
            sources: d.sources,
            targetAngle: angle,
            targetDist: targetDist,
            x: centerX + targetDist * Math.cos(angle),
            y: centerY + targetDist * Math.sin(angle),
            totalProfs: profs.length,
        };
    });

    // Simulate to resolve overlaps.
    // By using a weaker radial force and a stronger collision force, the nodes will organically 
    // push each other outwards/inwards into a nicely packed donut shape instead of a crowded 1D line.
    const destSim = d3.forceSimulation(destData)
        .force('collide', d3.forceCollide().radius(d => destRadius(d.totalProfs) + 6).strength(1).iterations(3))
        .force('radial', d3.forceRadial(d => d.targetDist, centerX, centerY).strength(0.3))
        .force('x', d3.forceX(d => centerX + d.targetDist * Math.cos(d.targetAngle)).strength(0.01))
        .force('y', d3.forceY(d => centerY + d.targetDist * Math.sin(d.targetAngle)).strength(0.01))
        .stop();
    for (let i = 0; i < 400; i++) destSim.tick();
    
    // Clamp to ensure absolutely NONE slip inside the inner boundary
    destData.forEach(d => { 
        const dist = Math.sqrt((d.x - centerX)**2 + (d.y - centerY)**2);
        if (dist < baseRadius) {
            d.x = centerX + (d.x - centerX) / dist * baseRadius;
            d.y = centerY + (d.y - centerY) / dist * baseRadius;
        }
        destPositions.set(d.name, d);
    });

    // ── Build SVG ────────────────────────────────────────────────────
    const svg = d3.select('#viz-container')
        .append('svg')
        .attr('width', width)
        .attr('height', height);

    // Background gradient
    const defs = svg.append('defs');
    const bgGrad = defs.append('radialGradient').attr('id', 'bg-grad')
        .attr('cx', '50%').attr('cy', '50%').attr('r', '60%');
    bgGrad.append('stop').attr('offset', '0%').attr('stop-color', '#0f1729');
    bgGrad.append('stop').attr('offset', '100%').attr('stop-color', '#080c14');

    // Glow filter
    const glow = defs.append('filter').attr('id', 'glow');
    glow.append('feGaussianBlur').attr('stdDeviation', '3').attr('result', 'blur');
    const feMerge = glow.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'blur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    svg.append('rect').attr('width', width).attr('height', height).attr('fill', 'url(#bg-grad)');

    let globalExpanded = false;

    // Zoom container
    const g = svg.append('g').attr('id', 'zoom-container');

    const zoom = d3.zoom()
        .scaleExtent([0.2, 5])
        .on('zoom', (event) => {
            g.attr('transform', event.transform);
            const scale = event.transform.k;
            // Hide text labels if zoomed out too far
            const showFacText = scale >= 0.6;
            const showDestText = scale >= 1.2;
            facGroups.selectAll('text').style('visibility', showFacText ? 'visible' : 'hidden');
            destCircles.selectAll('text').style('visibility', showDestText ? 'visible' : 'hidden');

            // Handle global expansion
            const newGlobalExpanded = scale >= 1.5;
            if (newGlobalExpanded !== globalExpanded) {
                globalExpanded = newGlobalExpanded;
                updateVisibility();
            }
        });
    svg.call(zoom);

    // ── Draw Links ───────────────────────────────────────────────────
    // Layer 0: proxy → destination links
    const proxyDestLinksGroup = g.append('g').attr('class', 'proxy-dest-links');
    // Layer 1: faculty → professor links
    const facProfLinks = g.append('g').attr('class', 'fac-prof-links');
    // Layer 2: professor → destination links
    const profDestLinks = g.append('g').attr('class', 'prof-dest-links');

    // Draw proxy-dest links
    DATA.faculties.forEach(f => {
        const facId = f.id;
        const ppos = proxyPositions.get(facId);
        if (!ppos) return;
        const color = facultyColorMap.get(facId);
        
        const dests = new Set();
        DATA.professors.forEach(p => { if (p.faculty === facId) p.destinations.forEach(d => dests.add(d)); });
        
        dests.forEach(dest => {
            const dpos = destPositions.get(dest);
            if (!dpos) return;
            proxyDestLinksGroup.append('line')
                .attr('x1', ppos.x).attr('y1', ppos.y)
                .attr('x2', dpos.x).attr('y2', dpos.y)
                .attr('stroke', color)
                .attr('stroke-opacity', 0.25)
                .attr('stroke-width', 1.2)
                .datum({ faculty: facId, destination: dest });
        });
    });

    const allFacProfLines = [];
    const allProfDestLines = [];

    DATA.professors.forEach(p => {
        const fpos = facultyPositions.get(p.faculty);
        const ppos = profPositions.get(p.id);
        if (!fpos || !ppos) return;

        const color = facultyColorMap.get(p.faculty);

        // One link from faculty to professor
        const line1 = facProfLinks.append('line')
            .attr('x1', fpos.x).attr('y1', fpos.y)
            .attr('x2', ppos.x).attr('y2', ppos.y)
            .attr('stroke', color)
            .attr('stroke-opacity', 0.15)
            .attr('stroke-width', 0.8)
            .datum({ faculty: p.faculty, destinations: p.destinations, profId: p.id });
        allFacProfLines.push(line1);

        // One link per destination the professor visited
        p.destinations.forEach(dest => {
            const dpos = destPositions.get(dest);
            if (!dpos) return;
            const line2 = profDestLinks.append('line')
                .attr('x1', ppos.x).attr('y1', ppos.y)
                .attr('x2', dpos.x).attr('y2', dpos.y)
                .attr('stroke', color)
                .attr('stroke-opacity', 0.08)
                .attr('stroke-width', 0.6)
                .datum({ faculty: p.faculty, destination: dest, profId: p.id });
            allProfDestLines.push(line2);
        });
    });

    // ── Draw Destination Nodes ───────────────────────────────────────
    const destNodes = g.append('g').attr('class', 'dest-nodes');
    const destCircles = destNodes.selectAll('g')
        .data(destData)
        .enter().append('g')
        .attr('transform', d => \`translate(\${d.x},\${d.y})\`);

    destCircles.append('circle')
        .attr('r', d => destRadius(d.totalProfs))
        .attr('fill', '#f1f5f9')
        .attr('fill-opacity', 0.8)
        .attr('stroke', '#94a3b8')
        .attr('stroke-width', 1)
        .attr('filter', 'none')
        .style('cursor', 'pointer');

    // Destination labels (only for highly shared ones)
    destCircles.filter(d => d.totalProfs >= 4)
        .append('text')
        .attr('dy', d => -destRadius(d.totalProfs) - 6)
        .attr('text-anchor', 'middle')
        .attr('fill', '#94a3b8')
        .attr('font-size', '9px')
        .attr('font-weight', '500')
        .text(d => d.name.length > 30 ? d.name.substring(0, 28) + '…' : d.name);

    // ── Draw Proxy Nodes ─────────────────────────────────────────────
    const proxyNodesGroup = g.append('g').attr('class', 'proxy-nodes');
    const proxyCircles = proxyNodesGroup.selectAll('circle')
        .data([...proxyPositions.entries()].map(([id, p]) => ({ id, ...p })))
        .enter().append('circle')
        .attr('cx', d => d.x).attr('cy', d => d.y)
        .attr('r', 4.5)
        .attr('fill', d => d.color)
        .attr('stroke', '#fff')
        .attr('stroke-width', 1)
        .style('cursor', 'pointer');


    // ── Draw Professor Nodes ─────────────────────────────────────────
    const profNodes = g.append('g').attr('class', 'prof-nodes');
    const profData = [...profPositions.entries()].map(([id, p]) => ({ id, ...p }));

    const profCircles = profNodes.selectAll('circle')
        .data(profData)
        .enter().append('circle')
        .attr('cx', d => d.x)
        .attr('cy', d => d.y)
        .attr('r', d => profRadius(d.count))
        .attr('fill', d => facultyColorMap.get(d.faculty))
        .attr('fill-opacity', 0.7)
        .attr('stroke', d => d.count > 1 ? '#fff' : 'none')
        .attr('stroke-width', d => d.count > 1 ? 0.8 : 0)
        .attr('stroke-opacity', 0.5)
        .style('cursor', 'pointer');

    // ── Draw Faculty Nodes ───────────────────────────────────────────
    const facNodes = g.append('g').attr('class', 'fac-nodes');
    const facData = DATA.faculties.map(f => ({
        ...f,
        ...facultyPositions.get(f.id),
        count: mobCountByFaculty.get(f.id) || 0,
        profCount: (profByFaculty.get(f.id) || []).length,
    }));

    const facGroups = facNodes.selectAll('g')
        .data(facData)
        .enter().append('g')
        .attr('transform', d => \`translate(\${d.x},\${d.y})\`)
        .style('cursor', 'pointer');

    // Outer glow ring
    facGroups.append('circle')
        .attr('r', d => 14 + Math.sqrt(d.count) * 1.5)
        .attr('fill', 'none')
        .attr('stroke', d => d.color)
        .attr('stroke-opacity', 0.15)
        .attr('stroke-width', 3);

    // Main circle
    facGroups.append('circle')
        .attr('r', d => 10 + Math.sqrt(d.count))
        .attr('fill', d => d.color)
        .attr('fill-opacity', 0.9)
        .attr('stroke', '#fff')
        .attr('stroke-width', 1.5)
        .attr('stroke-opacity', 0.4)
        .attr('filter', 'url(#glow)');

    // Faculty label
    facGroups.append('text')
        .attr('dy', d => -(14 + Math.sqrt(d.count)) - 8)
        .attr('text-anchor', 'middle')
        .attr('fill', d => d.color)
        .attr('font-size', '11px')
        .attr('font-weight', '600')
        .text(d => d.label);

    // Count badge
    facGroups.append('text')
        .attr('dy', 4)
        .attr('text-anchor', 'middle')
        .attr('fill', '#fff')
        .attr('font-size', '9px')
        .attr('font-weight', '700')
        .text(d => d.count);

    // ── Update Visibility Function ───────────────────────────────────
    function updateVisibility(immediate = false) {
        const isExpanded = () => globalExpanded;
        const duration = immediate ? 0 : 400;

        proxyCircles.transition().duration(duration)
            .style('opacity', isExpanded() ? 0 : 1)
            .style('pointer-events', isExpanded() ? 'none' : 'all');
            
        proxyDestLinksGroup.selectAll('line').transition().duration(duration)
            .style('opacity', isExpanded() ? 0 : 1);
        
        profCircles.transition().duration(duration)
            .style('opacity', isExpanded() ? 1 : 0)
            .style('pointer-events', isExpanded() ? 'all' : 'none');
            
        facProfLinks.selectAll('line').transition().duration(duration)
            .style('opacity', isExpanded() ? 1 : 0);
            
        profDestLinks.selectAll('line').transition().duration(duration)
            .style('opacity', isExpanded() ? 1 : 0);
    }
    updateVisibility(true);

    // ── Legend ────────────────────────────────────────────────────────
    const legendList = document.getElementById('legend-list');
    facData.sort((a, b) => b.count - a.count).forEach(f => {
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.dataset.faculty = f.id;
        item.innerHTML = \`
            <span class="legend-dot" style="background:\${f.color}"></span>
            <span>\${f.label}</span>
            <span class="legend-count">\${f.profCount} / \${f.count}</span>
        \`;
        item.addEventListener('click', () => highlightFaculty(f.id));
        legendList.appendChild(item);
    });

    // ── Interaction ──────────────────────────────────────────────────
    const tooltip = document.getElementById('tooltip');
    const infoPanel = document.getElementById('info-panel');
    const infoTitle = document.getElementById('info-title');
    const infoDetail = document.getElementById('info-detail');

    let activeFaculty = null;

    function highlightFaculty(facId) {
        if (activeFaculty === facId) { clearSelection(); return; }
        activeFaculty = facId;
        const color = facultyColorMap.get(facId);

        // Dim everything with transitions
        facProfLinks.selectAll('line').transition().duration(300)
            .attr('stroke-opacity', d => d.faculty === facId ? 0.5 : 0.02)
            .attr('stroke-width', d => d.faculty === facId ? 1.2 : 0.4);

        profDestLinks.selectAll('line').transition().duration(300)
            .attr('stroke-opacity', d => d.faculty === facId ? 0.3 : 0.01)
            .attr('stroke-width', d => d.faculty === facId ? 1 : 0.3);
        
        proxyDestLinksGroup.selectAll('line').transition().duration(300)
            .attr('stroke-opacity', d => d.faculty === facId ? 0.6 : 0.02)
            .attr('stroke-width', d => d.faculty === facId ? 2 : 0.4);

        profCircles.transition().duration(300)
            .attr('fill-opacity', d => d.faculty === facId ? 1 : 0.05)
            .attr('r', d => d.faculty === facId ? profRadius(d.count) * 1.3 : profRadius(d.count) * 0.5);
            
        proxyCircles.transition().duration(300)
            .attr('fill-opacity', d => d.id === facId ? 1 : 0.15)
            .attr('stroke-opacity', d => d.id === facId ? 1 : 0.2);

        facGroups.selectAll('circle:nth-child(2)').transition().duration(300)
            .attr('fill-opacity', d => d.id === facId ? 1 : 0.15);
        facGroups.selectAll('text').transition().duration(300)
            .attr('fill-opacity', d => d.id === facId ? 1 : 0.2);

        // Get connected destinations
        const connDests = new Set();
        DATA.professors.filter(p => p.faculty === facId).forEach(p => p.destinations.forEach(d => connDests.add(d)));

        destCircles.selectAll('circle').transition().duration(300)
            .attr('fill-opacity', d => connDests.has(d.name) ? 1 : 0.08)
            .attr('stroke-opacity', d => connDests.has(d.name) ? 1 : 0.1);
        destCircles.selectAll('text').transition().duration(300)
            .attr('fill-opacity', d => connDests.has(d.name) ? 1 : 0.1);

        // Legend
        document.querySelectorAll('.legend-item').forEach(el => {
            el.classList.toggle('active', el.dataset.faculty === facId);
        });

        // Info panel
        const facInfo = facData.find(f => f.id === facId);
        infoTitle.textContent = facId;
        infoDetail.innerHTML = \`
            <strong>\${facInfo.profCount}</strong> professors · <strong>\${facInfo.count}</strong> mobility events<br>
            <strong>\${connDests.size}</strong> destination universities<br><br>
            <strong>Destinations:</strong><br>
            \${[...connDests].slice(0, 12).map(d => '<span class="info-tag">' + (d.length > 35 ? d.substring(0,33) + '…' : d) + '</span>').join('')}
            \${connDests.size > 12 ? '<br><span style="color:#64748b;font-size:10px">+' + (connDests.size - 12) + ' more</span>' : ''}
        \`;
        infoPanel.classList.add('visible');
    }

    function highlightDestination(dest) {
        const dData = destData.find(d => d.name === dest);
        if (!dData) return;

        // Highlight all connections to this destination with transitions
        facProfLinks.selectAll('line').transition().duration(300)
            .attr('stroke-opacity', d => d.destinations && d.destinations.includes(dest) ? 0.6 : 0.02)
            .attr('stroke-width', d => d.destinations && d.destinations.includes(dest) ? 1.5 : 0.4);

        profDestLinks.selectAll('line').transition().duration(300)
            .attr('stroke-opacity', d => d.destination === dest ? 0.5 : 0.01)
            .attr('stroke-width', d => d.destination === dest ? 1.2 : 0.3);

        proxyDestLinksGroup.selectAll('line').transition().duration(300)
            .attr('stroke-opacity', d => d.destination === dest ? 0.6 : 0.02)
            .attr('stroke-width', d => d.destination === dest ? 2 : 0.4);

        profCircles.transition().duration(300)
            .attr('fill-opacity', d => d.destinations.includes(dest) ? 1 : 0.05)
            .attr('r', d => d.destinations.includes(dest) ? profRadius(d.count) * 1.4 : profRadius(d.count) * 0.5);

        // Highlight source faculties
        const srcFacs = new Set(dData.sources);
        facGroups.selectAll('circle:nth-child(2)').transition().duration(300)
            .attr('fill-opacity', d => srcFacs.has(d.id) ? 1 : 0.15);
        facGroups.selectAll('text').transition().duration(300)
            .attr('fill-opacity', d => srcFacs.has(d.id) ? 1 : 0.2);
            
        proxyCircles.transition().duration(300)
            .attr('fill-opacity', d => srcFacs.has(d.id) ? 1 : 0.15)
            .attr('stroke-opacity', d => srcFacs.has(d.id) ? 1 : 0.2);

        destCircles.selectAll('circle').transition().duration(300)
            .attr('fill-opacity', d => d.name === dest ? 1 : 0.08);
        destCircles.selectAll('text').transition().duration(300)
            .attr('fill-opacity', d => d.name === dest ? 1 : 0.1);

        infoTitle.textContent = dest;
        infoDetail.innerHTML = \`
            <strong>\${dData.totalProfs}</strong> professors · <strong>\${dData.numSources}</strong> sending facult\${dData.numSources > 1 ? 'ies' : 'y'}<br><br>
            <strong>From:</strong><br>
            \${dData.sources.map(s => '<span class="info-tag" style="background:' + facultyColorMap.get(s) + '22;color:' + facultyColorMap.get(s) + '">' + (DATA.faculties.find(f=>f.id===s)?.label || s) + '</span>').join('')}
        \`;
        infoPanel.classList.add('visible');
    }

    function clearSelection() {
        activeFaculty = null;
        facProfLinks.selectAll('line').transition().duration(300).attr('stroke-opacity', 0.15).attr('stroke-width', 0.8);
        profDestLinks.selectAll('line').transition().duration(300).attr('stroke-opacity', 0.08).attr('stroke-width', 0.6);
        proxyDestLinksGroup.selectAll('line').transition().duration(300).attr('stroke-opacity', 0.25).attr('stroke-width', 1.2);
        
        profCircles.transition().duration(300)
            .attr('fill-opacity', 0.7)
            .attr('r', d => profRadius(d.count))
            .attr('stroke', d => d.count > 1 ? '#fff' : 'none')
            .attr('stroke-opacity', d => d.count > 1 ? 0.5 : 0);
        proxyCircles.transition().duration(300).attr('fill-opacity', 1).attr('stroke-opacity', 1);
        
        facGroups.selectAll('circle:nth-child(2)').transition().duration(300).attr('fill-opacity', 0.9);
        facGroups.selectAll('text').transition().duration(300).attr('fill-opacity', 1);
        destCircles.selectAll('circle').transition().duration(300).attr('fill-opacity', d => d.numSources > 1 ? 0.9 : 0.5).attr('stroke-opacity', 1);
        destCircles.selectAll('text').transition().duration(300).attr('fill-opacity', 1);
        
        document.querySelectorAll('.legend-item').forEach(el => el.classList.remove('active'));
        infoPanel.classList.remove('visible');
    }

    // Tooltip events
    profCircles.on('mouseover', function(event, d) {
        tooltip.style.opacity = 1;
        const destList = d.destinations.slice(0, 6).map(dest => '→ ' + (dest.length > 40 ? dest.substring(0, 38) + '…' : dest)).join('<br>');
        const moreCount = d.destinations.length > 6 ? '<br><span style="color:#64748b">+' + (d.destinations.length - 6) + ' more destinations</span>' : '';
        const yearList = d.years ? d.years.join(', ') : '';
        tooltip.innerHTML = \`<strong>\${d.name}</strong>\${d.count > 1 ? ' <span style="color:#fbbf24;font-weight:600">(' + d.count + '× participations)</span>' : ''}<br><span style="color:\${facultyColorMap.get(d.faculty)}">\${d.faculty}</span><br>\${destList}\${moreCount}<br><span style="color:#64748b">\${yearList}</span>\`;
        tooltip.style.left = (event.clientX + 12) + 'px';
        tooltip.style.top = (event.clientY - 10) + 'px';
        d3.select(this).attr('r', profRadius(d.count) * 1.6).attr('fill-opacity', 1).attr('stroke', '#fff').attr('stroke-width', 1.5).attr('stroke-opacity', 1);
    }).on('mouseout', function(event, d) {
        tooltip.style.opacity = 0;
        if (activeFaculty) {
            d3.select(this)
                .attr('r', d.faculty === activeFaculty ? profRadius(d.count) * 1.3 : profRadius(d.count) * 0.5)
                .attr('fill-opacity', d.faculty === activeFaculty ? 1 : 0.05)
                .attr('stroke', d.count > 1 ? '#fff' : 'none')
                .attr('stroke-width', d.count > 1 ? 0.8 : 0)
                .attr('stroke-opacity', 0.5);
        } else {
            d3.select(this)
                .attr('r', profRadius(d.count))
                .attr('fill-opacity', 0.7)
                .attr('stroke', d.count > 1 ? '#fff' : 'none')
                .attr('stroke-width', d.count > 1 ? 0.8 : 0)
                .attr('stroke-opacity', 0.5);
        }
    });

    destCircles.on('mouseover', function(event, d) {
        tooltip.style.opacity = 1;
        tooltip.innerHTML = \`<strong>\${d.name}</strong><br>\${d.totalProfs} professor\${d.totalProfs>1?'s':''} from \${d.numSources} facult\${d.numSources>1?'ies':'y'}\`;
        tooltip.style.left = (event.clientX + 12) + 'px';
        tooltip.style.top = (event.clientY - 10) + 'px';
    }).on('mouseout', function() {
        tooltip.style.opacity = 0;
    }).on('click', function(event, d) {
        event.stopPropagation();
        highlightDestination(d.name);
    });

    facGroups.on('mouseover', function(event, d) {
        tooltip.style.opacity = 1;
        tooltip.innerHTML = \`<strong>\${d.id}</strong><br>\${d.profCount} professors · \${d.count} mobilities\`;
        tooltip.style.left = (event.clientX + 12) + 'px';
        tooltip.style.top = (event.clientY - 10) + 'px';
    }).on('mouseout', function() {
        tooltip.style.opacity = 0;
    }).on('click', function(event, d) {
        event.stopPropagation();
        highlightFaculty(d.id);
    });

    // Background click to clear
    svg.on('click', clearSelection);

    // Controls
    document.getElementById('btn-reset').addEventListener('click', () => {
        svg.transition().duration(750).call(zoom.transform, d3.zoomIdentity);
    });
    document.getElementById('btn-clear').addEventListener('click', clearSelection);

    // Intro animation
    g.attr('opacity', 0).transition().duration(1200).attr('opacity', 1);

    // Window resize
    window.addEventListener('resize', () => {
        const w = window.innerWidth;
        const h = window.innerHeight;
        svg.attr('width', w).attr('height', h);
        svg.select('rect').attr('width', w).attr('height', h);
    });
    <\/script>
</body>
</html>`;

    fs.writeFileSync(outputFile, html, 'utf8');
    console.log('\\n✅ New erasmus.html generated successfully!');
    console.log(`   → ${outputFile}`);
    console.log(`   → ${faculties.length} faculties, ${professors.length} professors, ${totalMobilities} mobilities, ${destFacultyMap.size} destinations`);

} catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
}
