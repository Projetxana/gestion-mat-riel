const fs = require('fs');
const path = require('path');

const csvContent = fs.readFileSync(path.join(__dirname, 'Assets_Details .csv'), 'utf8');
const lines = csvContent.split('\n').filter(l => l.trim());
const headers = lines[0].split(';');

const tools = lines.slice(1).map((line, index) => {
    const cols = line.split(';');
    // "Nom de l'outils";"Collaborateur responsable";"Numéro de série";"Code QR"
    // Handle potential quotes wrapping keys
    const clean = (s) => s ? s.replace(/^"|"$/g, '').trim() : '';

    return {
        id: `ht-${index + 1}`,
        name: clean(cols[0]),
        assigned_to_name: clean(cols[1]),
        serial_number: clean(cols[2]),
        qr_code: clean(cols[3] || ''),
        status: 'ok' // default
    };
});

// Extract unique users
const uniqueUsers = [...new Set(tools.map(t => t.assigned_to_name))].filter(n => n).sort();

const fileContent = `
export const initialHiltiTools = ${JSON.stringify(tools, null, 2)};

export const initialHiltiUsers = ${JSON.stringify(uniqueUsers, null, 2)};
`;

fs.writeFileSync(path.join(__dirname, 'src/data/hiltiData.js'), fileContent);
console.log('Data written to src/data/hiltiData.js');
