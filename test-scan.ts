import { runScanner, buildTradeSetups } from './src/scanner';

(async () => {
    console.log("Running test scan...");
    try {
        const { qualified, marketStatus } = await runScanner();
        console.log(`Qualified stocks: ${qualified.length}`);
        const setups = await buildTradeSetups(qualified);
        console.log(`Setups generated: ${setups.length}`);
        if (setups.length) console.log(JSON.stringify(setups[0], null, 2));
    } catch (e) {
        console.error(e);
    }
})();
