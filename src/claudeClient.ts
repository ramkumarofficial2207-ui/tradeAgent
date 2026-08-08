import Anthropic from '@anthropic-ai/sdk';

export async function claudeAsk(
    systemPrompt: string,
    userPrompt: string,
    options: { maxTokens?: number, temperature?: number } = {}
): Promise<string> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY is not set in your .env file. Please add it to use Claude AI features.');
    }

    try {
        const client = new Anthropic({ apiKey });
        const modelName = process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022";
        const msg = await client.messages.create({
            model: modelName,
            max_tokens: options.maxTokens || 1024,
            temperature: options.temperature ?? 0,
            system: systemPrompt,
            messages: [
                { role: "user", content: userPrompt }
            ]
        }, {
            timeout: 10000,
            maxRetries: 1
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
