const fs = require('fs');
const csv = fs.readFileSync('Erasmus_Staff_Mobility_Consolidated CSV UTF_cleaned.csv', 'utf8');
const lines = csv.split(/\r?\n/);
const facs = new Map(); // name -> count
for (let i = 1; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    const cols = [];
    let inQ = false, cur = '';
    for (const c of lines[i]) {
        if (c === '"') inQ = !inQ;
        else if (c === ',' && !inQ) { cols.push(cur.trim()); cur = ''; }
        else cur += c;
    }
    cols.push(cur.trim());
    const fac = cols[5];
    if (fac && fac !== '-') {
        facs.set(fac, (facs.get(fac) || 0) + 1);
    }
}
const sorted = [...facs.entries()].sort((a, b) => b[1] - a[1]);
sorted.forEach(([name, count]) => console.log(`${count}\t${name}`));
console.log(`\nTotal unique names: ${facs.size}`);
