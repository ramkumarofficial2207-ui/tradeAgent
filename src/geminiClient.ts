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
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
        systemInstruction: system
    });


    const timeoutPromise = new Promise<string>((_, reject) =>
        setTimeout(() => reject(new Error("Gemini API request timed out (15s)")), 15000)
    );

    const apiPromise = async () => {
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: user }] }],
            generationConfig: {
                maxOutputTokens: options?.maxTokens || 1000,
                temperature: options?.temperature || 0.2,
            },
        });
        const response = await result.response;
        return response.text();
    };

    return Promise.race([apiPromise(), timeoutPromise]);
}
