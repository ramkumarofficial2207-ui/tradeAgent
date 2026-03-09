import 'dotenv/config';
import { claudeAsk } from './src/claudeClient';

async function testClaude() {
    console.log('Testing Anthropic Claude Integration...');
    try {
        if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'paste_your_anthropic_key_here') {
            console.log('⚠️ Skipping true test because ANTHROPIC_API_KEY is not set.');
            return;
        }

        const res = await claudeAsk(
            'You are a testing bot. Reply with "CLAUDE_ONLINE".',
            'Hello.',
            { maxTokens: 10, temperature: 0 }
        );

        console.log('✅ Response:', res);
        if (res.includes('CLAUDE_ONLINE')) {
            console.log('✅ Claude API is working perfectly.');
        } else {
            console.log('❌ Claude replied, but unexpected:', res);
        }
    } catch (e: any) {
        console.error('❌ Error testing Claude API:', e.message);
    }
}

testClaude();
