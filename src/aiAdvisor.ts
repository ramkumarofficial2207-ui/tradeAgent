import { GoogleGenerativeAI } from '@google/generative-ai';

export interface AIAssessment {
    ticker: string;
    momentum_score: number;
    signal: 'BUY' | 'WATCH' | 'AVOID';
    logic: string;
    target_range: string;
    stop_loss: string;
}

// Initialize dynamically so it picks up .env changes
export async function analyzeStocksWithAI(stocks: any[]): Promise<Map<string, AIAssessment>> {
    const results = new Map<string, AIAssessment>();

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey || apiKey === 'paste_your_gemini_key_here' || stocks.length === 0) {
        // Return fallback so the UI row doesn't spontaneously disappear
        for (const s of stocks) {
            results.set(s.Ticker || s.ticker, {
                ticker: s.Ticker || s.ticker,
                momentum_score: 5,
                signal: 'WATCH',
                logic: 'AI Advisor requires a valid Gemini API key. Please add it to your environment variables to enable Newgen analysis.',
                target_range: 'N/A',
                stop_loss: 'N/A'
            });
        }
        return results;
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

        // Build the prompt as requested by the user
        const promptInfo = stocks.map(s => JSON.stringify({
            Ticker: s.ticker,
            Current_Price: s.close ?? s.ltp ?? s.currentPrice ?? 0,
            Day_High: s.high ?? 0,
            Volume: s.volume ?? 0,
            Avg_Volume_20D: s.avgVolume20d ?? 0,
            RSI_14: s.rsi14 ?? null,
            Distance_from_200DMA: s.distFromDma200Pct ?? null,
            Sector: s.sector ?? 'Unknown',
            Market_Cap_Cr: s.mcap ?? null,
            Day_Change_Pct: s.dayChangePct ?? 0
        })).join('\n');

        const prompt = `
# ROLE
You are a Professional Momentum Trading Analyst specializing in the Indian NSE market. Your goal is to identify "High Velocity" stocks capable of 5-15% intraday or short-term swing moves.

# INPUT DATA
Here is the list of top gaining stocks today (JSON strings):
${promptInfo}

# ANALYSIS LOGIC
Analyze the data based on these strict "Newgen-style" breakout rules:
1. VOLUME SHOCK: A strict minimum of 1.5x average volume is required to consider it a genuine Volume Shock. (If volume is < 1.2x, automatically grade it AVOID unless the day has just started).
2. PRICE VELOCITY: We only want stocks that are pinned exactly at the top of their candle, showing zero seller resistance. If the current price has retraced more than 1.5% below the Day's High, reject the setup (wick rejection).
3. MOMENTUM ZONE: Is the RSI between 55 and 75? (If RSI > 78, it is extremely overbought and vulnerable to mean-reversion pullbacks).
4. THE "ROOM TO RUN": Calculate the distance to the next major resistance.
5. RUBBER BAND EFFECT: If the stock is >25% above its 200-DMA, it is too extended for a safe entry. Breakouts here are very prone to failure.

# CONSTRAINTS
- Ignore stocks with Market Cap < 500 Cr (Give them AVOID signal).
- Prioritize stocks where the Volume Shock is extremely high and price is pinned at the high of the day.
- If a stock is already up >10% today, flag it as "High Risk/Late Entry" in your logic and downgrade signal to WATCH.
- If the stock's distFromDma200Pct is > 25%, automatically downgrade to WATCH or AVOID due to severe overextension risk.

# OUTPUT FORMAT
Return strictly ONLY a JSON Array containing objects with these exact keys for every single stock provided:
[
  {
    "ticker": "Stock symbol",
    "momentum_score": (Scale 1-10 integer),
    "signal": "BUY" | "WATCH" | "AVOID",
    "logic": "A 1-sentence technical reason for the score.",
    "target_range": "Predicted 5% and 10% gain price levels.",
    "stop_loss": "Recommended exit if the momentum fails."
  }
]
`;

        const result = await model.generateContent(prompt);
        const responseText = result.response.text();

        // Extract JSON array from Markdown backticks if present
        const jsonMatch = responseText.match(/\[[\s\S]*\]/);
        const jsonStr = jsonMatch ? jsonMatch[0] : responseText;

        const parsed = JSON.parse(jsonStr) as AIAssessment[];

        for (const item of parsed) {
            if (item.ticker) {
                results.set(item.ticker, item);
            }
        }
        console.log(`[AI Advisor] Successfully analyzed ${parsed.length} stocks using Gemini.`);
    } catch (e: any) {
        console.error('[AI Advisor] Error analyzing stocks:', e.message);
        // Provide a clear fallback so the UI row doesn't spontaneously disappear
        for (const s of stocks) {
            results.set(s.Ticker || s.ticker, {
                ticker: s.Ticker || s.ticker,
                momentum_score: 5,
                signal: 'WATCH',
                logic: `AI Advisor unavailable (${e.message}). Please review manually.`,
                target_range: 'N/A',
                stop_loss: 'N/A'
            });
        }
    }

    return results;
}
