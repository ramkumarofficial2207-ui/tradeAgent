import Anthropic from '@anthropic-ai/sdk';
import { addThinkingStep, updateThinkingStep } from './agentEvents';

const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || 'dummy_key_to_prevent_crash'
});

export async function claudeAsk(
    systemPrompt: string,
    userPrompt: string,
    options: { maxTokens?: number, temperature?: number } = {}
): Promise<string> {
    if (!process.env.ANTHROPIC_API_KEY) {
        throw new Error('ANTHROPIC_API_KEY is not set in your .env file. Please add it to use Claude AI features.');
    }

    try {
        const msg = await client.messages.create({
            model: "claude-3-5-sonnet-latest",
            max_tokens: options.maxTokens || 1024,
            temperature: options.temperature ?? 0,
            system: systemPrompt,
            messages: [
                { role: "user", content: userPrompt }
            ]
        });

        if (msg.content[0].type === 'text') {
            return msg.content[0].text;
        }
        return '';
    } catch (e: any) {
        console.error('[Claude API Error]', e.message);
        throw e;
    }
}
