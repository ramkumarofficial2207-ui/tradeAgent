// ─────────────────────────────────────────────────────────────
// groqClient.ts  —  Thin wrapper around Groq's OpenAI-compatible
//                   REST API. No extra npm package needed.
//
// Model: llama-3.3-70b-versatile  (free, 14,400 req/day)
//   Docs: https://console.groq.com/docs/openai
// ─────────────────────────────────────────────────────────────

import axios from 'axios';

const GROQ_BASE = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.3-70b-versatile';   // best free Groq model

export interface GroqMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

/**
 * Send a chat request to Groq and return the reply text.
 * Throws if GROQ_API_KEY is missing or the request fails.
 */
export async function groqChat(
    messages: GroqMessage[],
    options: { maxTokens?: number; temperature?: number } = {}
): Promise<string> {
    const apiKey = process.env.GROQ_API_KEY;

    if (!apiKey || apiKey === 'paste_your_groq_key_here') {
        throw new Error('GROQ_API_KEY not configured. Visit https://console.groq.com/keys to get a free key and add it to your .env file.');
    }

    let attempts = 0;
    const maxAttempts = 2;
    let baseDelay = 1000; // Start with 1s delay

    while (attempts < maxAttempts) {
        try {
            const resp = await axios.post(
                GROQ_BASE,
                {
                    model: MODEL,
                    messages,
                    max_tokens: options.maxTokens ?? 512,
                    temperature: options.temperature ?? 0.4,
                },
                {
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        'Content-Type': 'application/json',
                    },
                    timeout: 30_000,
                }
            );

            return resp.data.choices?.[0]?.message?.content?.trim() ?? '';
        } catch (error: any) {
            attempts++;
            const status = error.response?.status;
            
            // Retry on temporary server errors (500, 502, 503, 504), fail fast on 429 rate limit
            if (status >= 500 && status <= 504 && attempts < maxAttempts) {
                const backoff = baseDelay * Math.pow(2, attempts - 1) + Math.random() * 500;
                console.warn(`[Groq Client] Request failed (${status}). Retrying attempt ${attempts}/${maxAttempts} in ${Math.round(backoff)}ms...`);
                await new Promise(resolve => setTimeout(resolve, backoff));
            } else {
                throw error;
            }
        }
    }
    throw new Error('Groq request failed after maximum retry attempts');
}

/** Single-turn convenience helper (system prompt + user message). */
export async function groqAsk(
    systemPrompt: string,
    userMessage: string,
    options?: { maxTokens?: number; temperature?: number }
): Promise<string> {
    return groqChat(
        [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
        ],
        options
    );
}
