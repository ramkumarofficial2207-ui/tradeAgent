// telegramAlert.ts — Telegram Bot for BUY signal alerts
// Uses node-telegram-bot-api. Requires TELEGRAM_BOT_TOKEN in .env

let bot: any = null;

function getBot() {
    if (bot) return bot;
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        console.warn('[Telegram] TELEGRAM_BOT_TOKEN not set — notifications disabled.');
        return null;
    }
    try {
        // Lazy import to avoid crashing if module not loaded
        const TelegramBot = require('node-telegram-bot-api');
        bot = new TelegramBot(token, { polling: true });

        // /start command registers user chat ID
        bot.onText(/\/start/, (msg: any) => {
            const chatId = msg.chat.id;
            bot.sendMessage(chatId,
                `🤖 *ApexScan AI Bot Active!*\n\nYour Telegram Chat ID is: \`${chatId}\`\n\nCopy this ID and paste it in *ApexScan AI > Profile > Notifications* to receive BUY signal alerts.\n\n_You will receive alerts every time the AI scanner finds a high-confidence BUY signal._`,
                { parse_mode: 'Markdown' }
            );
            console.log(`[Telegram] /start from chat ${chatId}`);
        });

        console.log('[Telegram] Bot initialized ✓');
    } catch (e: any) {
        console.error('[Telegram] Bot init error:', e.message);
    }
    return bot;
}

// ── Send BUY signal alert to a user ─────────────────────────────────
export async function sendBuyAlert(chatId: string, setup: {
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
    const b = getBot();
    if (!b || !chatId) return;

    const signal = setup.aiSignal === 'BUY' ? '🟢 *BUY*' : '🟡 *LIGHT BUY*';
    const emoji = setup.aiSignal === 'BUY' ? '🎯' : '👁️';

    const msg = `${emoji} *ApexScan AI Signal*

*${setup.ticker}* — ${signal}
📊 Confidence: ${setup.confidenceScore}/10
🏷️ ${setup.setupType} | ${setup.sector}

💰 Entry Zone: ₹${setup.buyZone.toLocaleString('en-IN')}
🎯 Target: ₹${setup.target.toLocaleString('en-IN')} (+${setup.targetPct}%)
🛑 Stop Loss: ₹${setup.stopLoss.toLocaleString('en-IN')} (-${setup.slPct}%)
⚖️ Risk-Reward: ${setup.riskReward}:1

${setup.aiLogic ? `🧠 _${setup.aiLogic.slice(0, 200)}..._` : ''}

⚠️ _Educational only. Not SEBI-registered financial advice._`;

    try {
        await b.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    } catch (err: any) {
        console.error(`[Telegram] Failed to send alert to ${chatId}:`, err.message);
    }
}

// ── Send pre-market digest ────────────────────────────────────────────
export async function sendPreMarketDigest(chatId: string, setups: any[], regime: string): Promise<void> {
    const b = getBot();
    if (!b || !chatId) return;

    const buySetups = setups.filter(s => s.aiSignal === 'BUY' || s.aiSignal === 'LIGHT BUY');
    const regimeLabel = regime === 'BULLISH' ? '✅ BULLISH' : regime === 'NEUTRAL' ? '⚠️ NEUTRAL' : '⛔ RISK-OFF';

    let msg = '';
    if (buySetups.length === 0) {
        msg = `🌅 *ApexScan AI - Pre-Market Brief*\n\nMarket Regime: ${regimeLabel}\n\n_No high-confidence setups found today. Wait for better opportunities._\n\n💡 _Educational only. Not financial advice._`;
    } else {
        const lines = buySetups.slice(0, 5).map((s, i) =>
            `${i + 1}. *${s.ticker}* — ${s.aiSignal} (${s.confidenceScore}/10) | Tgt +${s.targetPct}% | RR ${s.riskReward}:1`
        ).join('\n');
        msg = `🌅 *ApexScan AI - Pre-Market Brief*\n\nMarket Regime: ${regimeLabel}\n🎯 ${buySetups.length} active signal(s):\n\n${lines}\n\n💡 _Educational only. Not financial advice._`;
    }

    try {
        await b.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
    } catch (err: any) {
        console.error(`[Telegram] Digest error for ${chatId}:`, err.message);
    }
}

// Initialize bot on module load (if token exists)
getBot();
