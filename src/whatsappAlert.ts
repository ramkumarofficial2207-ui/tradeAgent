// whatsappAlert.ts — WhatsApp alerting via Twilio WhatsApp API
// Required .env vars:
//   TWILIO_ACCOUNT_SID=ACxxxxxx
//   TWILIO_AUTH_TOKEN=xxxxxxxxx
//   TWILIO_WHATSAPP_FROM=whatsapp:+14155238886  (Twilio sandbox or your approved sender)

let twilioClient: any = null;
const FROM_NUMBER = process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

function getClient() {
    if (twilioClient) return twilioClient;
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const auth = process.env.TWILIO_AUTH_TOKEN;
    if (!sid || !auth) {
        console.warn('[WhatsApp] TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not set — WhatsApp alerts disabled.');
        return null;
    }
    try {
        const twilio = require('twilio');
        twilioClient = twilio(sid, auth);
        console.log('[WhatsApp] Twilio client initialized ✓');
    } catch (e: any) {
        console.error('[WhatsApp] Twilio init error:', e.message);
    }
    return twilioClient;
}

// Format a WhatsApp-friendly phone number: +91XXXXXXXXXX → whatsapp:+91XXXXXXXXXX
export function formatWhatsApp(phone: string): string {
    const clean = phone.replace(/\D/g, '');
    const withCountry = clean.startsWith('91') ? clean : `91${clean}`;
    return `whatsapp:+${withCountry}`;
}

// ── Send BUY signal alert ────────────────────────────────────────────
export async function sendBuyAlert(whatsappNumber: string, setup: {
    ticker: string;
    aiSignal: string;
    confidenceScore: number;
    buyZone: number;
    target: number;
    stopLoss: number;
    targetPct: number;
    slPct: number;
    riskReward: number;
    setupType: string;
    sector: string;
    aiLogic?: string;
}): Promise<void> {
    const client = getClient();
    if (!client || !whatsappNumber) return;

    const signalEmoji = setup.aiSignal === 'BUY' ? '🟢' : '🟡';
    const to = whatsappNumber.startsWith('whatsapp:') ? whatsappNumber : formatWhatsApp(whatsappNumber);

    const body = `${signalEmoji} *ApexScan AI Signal*

📌 ${setup.ticker} — ${setup.aiSignal}
📊 Confidence: ${setup.confidenceScore}/10
🏷️ ${setup.setupType} | ${setup.sector}

💰 Entry: ₹${setup.buyZone.toFixed(2)}
🎯 Target: ₹${setup.target.toFixed(2)} (+${setup.targetPct}%)
🛑 Stop Loss: ₹${setup.stopLoss.toFixed(2)} (-${setup.slPct}%)
⚖️ R:R = ${setup.riskReward}:1

${setup.aiLogic ? `💡 ${setup.aiLogic.slice(0, 200)}` : ''}

⚠️ For educational purposes only. Not SEBI-registered investment advice.`;

    try {
        await client.messages.create({
            from: FROM_NUMBER,
            to,
            body,
        });
        console.log(`[WhatsApp] Alert sent to ${to} for ${setup.ticker}`);
    } catch (err: any) {
        console.error(`[WhatsApp] Failed to send to ${to}:`, err.message);
    }
}

// ── Pre-market digest ─────────────────────────────────────────────────
export async function sendPreMarketDigest(whatsappNumber: string, setups: any[], regime: string): Promise<void> {
    const client = getClient();
    if (!client || !whatsappNumber) return;

    const to = whatsappNumber.startsWith('whatsapp:') ? whatsappNumber : formatWhatsApp(whatsappNumber);
    const regimeLabel = regime === 'BULLISH' ? '✅ BULLISH' : regime === 'NEUTRAL' ? '⚠️ NEUTRAL' : '⛔ RISK-OFF';
    const buySetups = setups.filter(s => s.aiSignal === 'BUY' || s.aiSignal === 'LIGHT BUY');

    const setupLines = buySetups.slice(0, 5).map((s, i) =>
        `${i + 1}. ${s.ticker} — ${s.aiSignal} (${s.confidenceScore}/10) | Tgt +${s.targetPct}% | RR ${s.riskReward}:1`
    ).join('\n');

    const body = `📅 *ApexScan AI — Pre-Market Brief*

Market: ${regimeLabel}
Signals: ${buySetups.length} active

${setupLines || 'No high-confidence setups today. Stay patient.'}

⚠️ Educational only. Not SEBI financial advice.`;

    try {
        await client.messages.create({ from: FROM_NUMBER, to, body });
    } catch (err: any) {
        console.error(`[WhatsApp] Digest error for ${to}:`, err.message);
    }
}

// Initialize client on load
getClient();
