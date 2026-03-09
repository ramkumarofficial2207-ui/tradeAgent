import 'dotenv/config';
import { groqAsk } from './src/groqClient';

async function test() {
    console.log('Testing Groq...');
    try {
        const res = await groqAsk('You are a helper', 'Say hello');
        console.log('REPLY:', res);
    } catch (e: any) {
        console.error('FAILED:', e.message);
    }
}
test();
