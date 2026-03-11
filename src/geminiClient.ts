import { GoogleGenerativeAI } from "@google/generative-ai";

/**
 * Gemini client for high-availability trade analysis fallback.
 */
export async function geminiAsk(system: string, user: string, options?: { maxTokens?: number, temperature?: number }): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not set in environment variables.");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
        model: "gemini-1.5-pro",
        systemInstruction: system
    });

    const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: {
            maxOutputTokens: options?.maxTokens || 1000,
            temperature: options?.temperature || 0.2,
        },
    });

    const response = await result.response;
    return response.text();
}
