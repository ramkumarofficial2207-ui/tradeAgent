import * as fs from 'fs';
const content = fs.readFileSync('src/dataService.ts', 'utf-8');
const genData = fs.readFileSync('generated_data.txt', 'utf-8');

const startIdx = content.indexOf('export const NSE_UNIVERSE: Record<string, string> = {');
// The end index should be right before `export const MARKET_CAP_CR_MAP`
// But actually we might still want to keep MARKET_CAP_CR_MAP or just replace the whole block
const endIdx = content.indexOf('function parseYahooCandles(rawData: any): Candle[] {');

if (startIdx !== -1 && endIdx !== -1) {
    const before = content.slice(0, startIdx);
    const after = content.slice(endIdx);

    // We also need to keep MARKET_CAP_CR_MAP empty or just as is. Let's just make it empty since we do dynamic liquidity.
    const newMiddle = genData + "\nexport const MARKET_CAP_CR_MAP: Record<string, number> = {};\n\n";

    fs.writeFileSync('src/dataService.ts', before + newMiddle + after);
    console.log('Successfully updated dataService.ts');
} else {
    console.error('Could not find injection points');
}
