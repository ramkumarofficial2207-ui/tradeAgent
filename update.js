const fs = require('fs');

const file = 'src/dataService.ts';
let code = fs.readFileSync(file, 'utf8');

const regex = /export async function fetchNiftyData\(\): Promise<\{ niftyChange: number; vixChange: number \}> \{([\s\S]*?)return \{ niftyChange: 0, vixChange: 0 \};\r?\n    \}\r?\n\}/m;

const replacement = `export interface MarketDataChange {
    niftyChange: number;
    vixChange: number;
    niftyNext50Change: number;
    niftyMidcapChange: number;
    sensexChange: number;
    goldChange: number;
    silverChange: number;
}

export async function fetchNiftyData(): Promise<MarketDataChange> {
    try {
        const [niftyRes, vixRes, nn50Res, midRes, sensexRes, goldRes, silverRes] = await Promise.allSettled([
            fetchHistoricalData('^NSEI', 10),
            fetchHistoricalData('^INDIAVIX', 10),
            fetchHistoricalData('JUNIORBEES.NS', 10),
            fetchHistoricalData('^NSMIDCP', 10),
            fetchHistoricalData('^BSESN', 10),
            fetchHistoricalData('GOLDBEES.NS', 10),
            fetchHistoricalData('SILVERBEES.NS', 10),
        ]);

        const getChange = (res) => {
            if (res.status === 'fulfilled' && res.value.length >= 2) {
                const c = res.value;
                const prev = c[c.length - 2].close;
                const curr = c[c.length - 1].close;
                return ((curr - prev) / prev) * 100;
            }
            return 0;
        };

        return {
            niftyChange: getChange(niftyRes),
            vixChange: getChange(vixRes),
            niftyNext50Change: getChange(nn50Res),
            niftyMidcapChange: getChange(midRes),
            sensexChange: getChange(sensexRes),
            goldChange: getChange(goldRes),
            silverChange: getChange(silverRes),
        };
    } catch {
        return { niftyChange: 0, vixChange: 0, niftyNext50Change: 0, niftyMidcapChange: 0, sensexChange: 0, goldChange: 0, silverChange: 0 };
    }
}`;

code = code.replace(regex, replacement);
fs.writeFileSync(file, code);
console.log('updated dataService.ts');
