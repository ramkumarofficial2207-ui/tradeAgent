import * as fs from 'fs';
import * as path from 'path';

function parseCSV(filename: string) {
    if (!fs.existsSync(filename)) return [];
    const content = fs.readFileSync(filename, 'utf-8');
    const lines = content.split('\n').filter(l => l.trim().length > 0);
    const headers = lines[0].split(',').map(h => h.trim());
    const data = [];
    // Nifty 500: symbol is usually 'Symbol', industry is 'Industry'
    // Let's find index of 'Symbol'
    const symbolIdx = headers.findIndex(h => h.includes('Symbol'));
    const industryIdx = headers.findIndex(h => h.includes('Industry'));

    for (let i = 1; i < lines.length; i++) {
        // Handle commas in quotes properly if any (crude split might break on some industries)
        // basic regex for csv
        const parts = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/);
        if (parts.length > symbolIdx && symbolIdx !== -1) {
            let sym = parts[symbolIdx].replace(/"/g, '').trim();
            let ind = industryIdx !== -1 && parts.length > industryIdx ? parts[industryIdx].replace(/"/g, '').trim() : 'Diversified';
            data.push({ symbol: sym, industry: ind });
        }
    }
    return data;
}

const allStocks = [
    ...parseCSV('nifty500.csv'),
    ...parseCSV('smallcap250.csv'),
    ...parseCSV('microcap250.csv')
];

const unique = new Map<string, string>();
for (const s of allStocks) {
    if (s.symbol && s.symbol !== 'Symbol') {
        unique.set(s.symbol, s.industry);
    }
}

let outUniverse = "";
let outSector = "";
for (const [sym, ind] of unique.entries()) {
    outUniverse += `    '${sym}': '${sym}.NS',\n`;
    outSector += `    '${sym}': '${ind}',\n`;
}

fs.writeFileSync('generated_data.txt', `\n// Generated Universe\nexport const NSE_UNIVERSE: Record<string, string> = {\n${outUniverse}};\n\nexport const SECTOR_MAP: Record<string, string> = {\n${outSector}};\n`);
console.log(`Generated ${unique.size} unique symbols.`);
