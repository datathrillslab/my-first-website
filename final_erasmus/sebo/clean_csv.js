const fs = require('fs');
const path = require('path');

const inputFile = path.join(__dirname, 'Erasmus_Staff_Mobility_Consolidated CSV UTF.csv');
const outputFile = path.join(__dirname, 'Erasmus_Staff_Mobility_Consolidated CSV UTF_cleaned.csv');

// Read file
const content = fs.readFileSync(inputFile, 'utf8');
const lines = content.split(/\r?\n/);

const newLines = [];

for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    // Parse CSV line respecting quoted fields
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let j = 0; j < line.length; j++) {
        const ch = line[j];
        if (ch === '"') {
            inQuotes = !inQuotes;
            current += ch;
        } else if (ch === ',' && !inQuotes) {
            fields.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    fields.push(current);

    if (i === 0) {
        // Header row - remove "Purpose / Table" column (index 2)
        fields.splice(2, 1);
        // Rename "Round" to "Date" for clarity
        fields[1] = 'Date';
        newLines.push(fields.join(','));
    } else {
        // Extract date from Round column (index 1)
        // Matches patterns like "Initial round (10.9.2020)", "1st round (16.9.2021)", etc.
        const roundField = fields[1];
        const dateMatch = roundField.match(/\((\d+\.\d+\.\d+)\)/);
        if (dateMatch) {
            fields[1] = dateMatch[1];
        }
        // Remove "Purpose / Table" column (index 2)
        fields.splice(2, 1);
        newLines.push(fields.join(','));
    }
}

fs.writeFileSync(outputFile, newLines.join('\r\n'), 'utf8');
console.log(`Done! Processed ${newLines.length} lines.`);
console.log(`Output saved to: ${outputFile}`);

// Show first 5 lines as preview
console.log('\nPreview (first 5 lines):');
newLines.slice(0, 5).forEach(l => console.log(l));
