import 'dotenv/config';
import { claudeAsk } from './src/claudeClient';

async function test() {
    console.log('Testing Claude...');
    try {
        const res = await claudeAsk('You are a helper', 'Say hello');
        console.log('REPLY:', res);
    } catch (e: any) {
        console.error('FAILED:', e.message);
    }
}
test();
