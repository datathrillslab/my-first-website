// Regenerate the inline DATA blob in erasmus.html from the final CSV.
// One CSV row = one mobility event: first_name,last_name,faculty_normalized,institution_normalized,call_period
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';

const CSV = 'erasmus_staff_mobility_final version.csv';
const HTML = 'erasmus.html';

// Curated short labels (carried over from the original; new/renamed faculties added).
const LABELS = {
    'Akademija primijenjenih umjetnosti': 'APU',
    'Ekonomski fakultet': 'Ekonomski',
    'Fakultet biotehnologije i razvoja lijekova': 'Biotehnologija',
    'Fakultet dentalne medicine': 'Dentalna med.',
    'Fakultet informatike i digitalnih tehnologija': 'Informatika',
    'Fakultet za fiziku': 'Fizika',
    'Fakultet za logopediju': 'Logopedija',
    'Fakultet za matematiku': 'Matematika',
    'Fakultet za menadžment u turizmu i ugostiteljstvu': 'Menadžment u turizmu',
    'Fakultet zdravstvenih studija': 'Zdravstveni studiji',
    'Filozofski fakultet': 'Filozofski',
    'Građevinski fakultet': 'Građevinski',
    'Medicinski fakultet': 'Medicinski',
    'Pomorski fakultet': 'Pomorski',
    'Pravni fakultet': 'Pravni',
    'Sveučilišna knjižnica Rijeka': 'Knjižnica',
    'Sveučilišni centri i studiji': 'Centri i studiji',
    'Sveučilište u Rijeci - Rektorat': 'Rektorat',
    'Tehnički fakultet': 'Tehnički',
    'Učiteljski fakultet': 'Učiteljski',
};

// RFC4180-ish parser (handles quoted fields with embedded commas).
function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const rows = [];
    let field = '', row = [], inQ = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i];
        if (inQ) {
            if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
            else field += c;
        } else if (c === '"') inQ = true;
        else if (c === ',') { row.push(field); field = ''; }
        else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
        else if (c === '\r') { /* skip */ }
        else field += c;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows;
}

const rows = parseCSV(readFileSync(CSV, 'utf8'));
const header = rows[0].map(s => s.trim());
const data = rows.slice(1);

const facSet = new Set();
const profMap = new Map();    // name||faculty -> professor accumulator
const destMap = new Map();    // institution -> Set(faculty)
const nameToFacs = new Map(); // name -> Set(faculty)  (collision diagnostics)
let totalMob = 0;

for (const r of data) {
    if (r.length < 5) continue;
    const fn = (r[0] || '').trim(), ln = (r[1] || '').trim();
    const fac = (r[2] || '').trim(), inst = (r[3] || '').trim(), period = (r[4] || '').trim();
    if (!fn && !ln && !fac && !inst) continue; // blank line
    const name = (fn + ' ' + ln).trim();
    const key = name + '||' + fac;
    if (!profMap.has(key)) profMap.set(key, { name, faculty: fac, destinations: [], years: [], yearSet: new Set() });
    const p = profMap.get(key);
    p.destinations.push(inst);
    if (period && !p.yearSet.has(period)) { p.yearSet.add(period); p.years.push(period); }
    facSet.add(fac);
    if (!destMap.has(inst)) destMap.set(inst, new Set());
    destMap.get(inst).add(fac);
    if (!nameToFacs.has(name)) nameToFacs.set(name, new Set());
    nameToFacs.get(name).add(fac);
    totalMob++;
}

const faculties = [...facSet].sort((a, b) => a.localeCompare(b, 'hr')).map(id => ({ id, label: LABELS[id] || id }));

let i = 0;
const professors = [...profMap.values()].map(p => ({
    id: 'prof_' + (i++), name: p.name, faculty: p.faculty,
    count: p.destinations.length, destinations: p.destinations, years: p.years,
}));

const destinations = [...destMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0], 'hr'))
    .map(([name, set]) => ({ name, numSources: set.size, sources: [...set].sort((a, b) => a.localeCompare(b, 'hr')) }));

const DATA = { faculties, professors, destinations, totalMobilities: totalMob };

// ---- inject into HTML (back up first) ----
copyFileSync(HTML, process.env.TEMP + '/erasmus.html.bak');
const html = readFileSync(HTML, 'utf8');
const lines = html.split('\n');
let replaced = 0;
for (let k = 0; k < lines.length; k++) {
    if (lines[k].trimStart().startsWith('const DATA = ')) {
        const indent = lines[k].slice(0, lines[k].length - lines[k].trimStart().length);
        lines[k] = indent + 'const DATA = ' + JSON.stringify(DATA) + ';';
        replaced++;
    }
}
if (replaced !== 1) { console.error(`ERROR: expected exactly 1 DATA line, replaced ${replaced}`); process.exit(1); }
writeFileSync(HTML, lines.join('\n'));

// ---- diagnostics ----
const collisions = [...nameToFacs.entries()].filter(([, s]) => s.size > 1);
const missingLabels = faculties.filter(f => !LABELS[f.id]);
let maxProf = { fac: '', n: 0 };
const byFac = new Map();
professors.forEach(p => byFac.set(p.faculty, (byFac.get(p.faculty) || 0) + 1));
byFac.forEach((n, fac) => { if (n > maxProf.n) maxProf = { fac, n }; });

console.log('faculties      :', faculties.length);
console.log('professors     :', professors.length);
console.log('destinations   :', destinations.length);
console.log('totalMobilities:', totalMob, '(data rows:', data.filter(r => r.length >= 5 && (r[0] || r[1] || r[2] || r[3]).trim()).length + ')');
console.log('max profs/fac  :', maxProf.n, '→', maxProf.fac);
console.log('faculties missing curated label:', missingLabels.map(f => f.id));
console.log('names spanning multiple faculties:', collisions.length);
collisions.slice(0, 10).forEach(([n, s]) => console.log('   -', n, '→', [...s].join(' | ')));
