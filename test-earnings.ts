import { validateEarningsRisk } from './src/earningsValidator';

async function testEarningsGate() {
    console.log('Testing Fundamental Earnings Guardrail...');

    // TCS often has earnings coming up in April, Reliance in May. 
    // Let's test a random mix to see what the Yahoo API returns.
    const tickers = ['TCS.NS', 'RELIANCE.NS', 'HDFCBANK.NS', 'INFY.NS', 'WIPRO.NS'];

    for (const ticker of tickers) {
        console.log(`\nChecking earnings risk for: ${ticker}`);
        const result = await validateEarningsRisk(ticker, 4); // 4 day safe window

        if (result.blocked) {
            console.log(`❌ BLOCKED: ${result.reason}`);
        } else {
            console.log(`✅ SAFE: ${result.reason}`);
        }
    }
}

testEarningsGate();
