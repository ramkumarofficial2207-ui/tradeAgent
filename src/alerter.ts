// =====================================================
// alerter.ts — Gmail Email Alerts for SwingEdge
// =====================================================
// Setup: Add these to your .env file:
//   ALERT_EMAIL_FROM=your.gmail@gmail.com
//   ALERT_EMAIL_TO=your.gmail@gmail.com
//   GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
//
// How to get Gmail App Password (free):
//   1. Go to myaccount.google.com → Security
//   2. Enable 2-Step Verification
//   3. Search "App Passwords" → Create one for "Mail"
//   4. Paste the 16-char code into GMAIL_APP_PASSWORD in .env

import nodemailer from 'nodemailer';
import { TradeSetup } from './types';

function getTransporter() {
    return nodemailer.createTransport({
        service: 'gmail',
        auth: {
            user: process.env.ALERT_EMAIL_FROM,
            pass: process.env.GMAIL_APP_PASSWORD,
        },
    });
}

export async function sendPreMarketAlert(setups: TradeSetup[]): Promise<void> {
    const from = process.env.ALERT_EMAIL_FROM;
    const to = process.env.ALERT_EMAIL_TO;
    const pass = process.env.GMAIL_APP_PASSWORD;

    if (!from || !to || !pass) {
        console.log('[ALERTER] Email not configured — skipping alert. Add ALERT_EMAIL_FROM, ALERT_EMAIL_TO, GMAIL_APP_PASSWORD to .env');
        return;
    }

    if (!setups.length) {
        console.log('[ALERTER] No setups to alert about today.');
        return;
    }

    const rows = setups.map((s, i) => `
        <tr style="border-top:1px solid #374151; background:${i % 2 === 0 ? '#111827' : '#0f172a'}">
            <td style="padding:12px 16px; font-weight:700; color:#f9fafb;">${s.ticker}</td>
            <td style="padding:12px 16px; color:#9ca3af;">${s.sector}</td>
            <td style="padding:12px 16px; color:#6366f1; font-weight:600;">${s.setupType}</td>
            <td style="padding:12px 16px; color:#22d3ee; font-family:monospace;">₹${s.buyZone}</td>
            <td style="padding:12px 16px; color:#10b981; font-family:monospace;">₹${s.target} (+${s.targetPct}%)</td>
            <td style="padding:12px 16px; color:#ef4444; font-family:monospace;">₹${s.stopLoss} (-${s.slPct}%)</td>
            <td style="padding:12px 16px; font-weight:700; color:${s.riskReward >= 2 ? '#10b981' : '#f59e0b'}">${s.riskReward}:1</td>
            <td style="padding:12px 16px;">
                <span style="padding:4px 10px; border-radius:99px; font-size:12px; font-weight:700;
                    background:${s.aiSignal === 'BUY' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)'};
                    color:${s.aiSignal === 'BUY' ? '#10b981' : '#f59e0b'}">
                    ${s.aiSignal ?? 'WATCH'}
                </span>
            </td>
            <td style="padding:12px 16px; color:#9ca3af;">${s.confidenceScore}/10</td>
        </tr>
    `).join('');

    const html = `
    <!DOCTYPE html>
    <html>
    <head><meta charset="UTF-8"/></head>
    <body style="margin:0;padding:0;background:#0d1117;font-family:'Segoe UI',Arial,sans-serif;">
        <div style="max-width:900px;margin:0 auto;padding:24px;">
            <!-- Header -->
            <div style="background:linear-gradient(135deg,#1e1b4b,#312e81);border-radius:12px;padding:28px 32px;margin-bottom:24px;border:1px solid #4c1d95">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
                    <span style="font-size:28px;">⚡</span>
                    <span style="font-size:22px;font-weight:800;color:#f9fafb;">SwingEdge</span>
                    <span style="background:#7c3aed;color:#fff;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700;">PRE-MARKET ALERT</span>
                </div>
                <p style="color:#c4b5fd;margin:0;font-size:15px;">
                    🕛 Today's Swing Watchlist — ${new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                </p>
                <p style="color:#a78bfa;margin:8px 0 0;font-size:13px;">
                    ${setups.length} setup${setups.length > 1 ? 's' : ''} found with Confidence ≥ 7/10 and AI Signal: BUY or WATCH
                </p>
            </div>

            <!-- Table -->
            <div style="background:#111827;border-radius:12px;border:1px solid #1f2937;overflow:hidden;margin-bottom:20px;">
                <table style="width:100%;border-collapse:collapse;font-size:13px;">
                    <thead>
                        <tr style="background:#1f2937;">
                            <th style="padding:12px 16px;color:#6b7280;font-weight:600;text-align:left;">Ticker</th>
                            <th style="padding:12px 16px;color:#6b7280;font-weight:600;text-align:left;">Sector</th>
                            <th style="padding:12px 16px;color:#6b7280;font-weight:600;text-align:left;">Setup</th>
                            <th style="padding:12px 16px;color:#6b7280;font-weight:600;text-align:left;">Entry</th>
                            <th style="padding:12px 16px;color:#6b7280;font-weight:600;text-align:left;">Target</th>
                            <th style="padding:12px 16px;color:#6b7280;font-weight:600;text-align:left;">Stop Loss</th>
                            <th style="padding:12px 16px;color:#6b7280;font-weight:600;text-align:left;">R:R</th>
                            <th style="padding:12px 16px;color:#6b7280;font-weight:600;text-align:left;">AI Signal</th>
                            <th style="padding:12px 16px;color:#6b7280;font-weight:600;text-align:left;">Score</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>

            <!-- Tips -->
            <div style="background:#111827;border:1px solid #1f2937;border-radius:10px;padding:16px 20px;margin-bottom:16px;">
                <p style="color:#6b7280;font-size:12px;margin:0 0 8px;font-weight:700;text-transform:uppercase;letter-spacing:1px;">⚡ How to Execute</p>
                <ul style="color:#9ca3af;font-size:13px;margin:0;padding-left:20px;line-height:1.8;">
                    <li>Open your broker app and set a <strong style="color:#f9fafb">BUY LIMIT order</strong> at the Entry price for each selected stock</li>
                    <li>Set a <strong style="color:#ef4444">Stop Loss (SL) limit order</strong> simultaneously to manage risk automatically</li>
                    <li>Only trade stocks with <strong style="color:#10b981">AI Signal = BUY</strong> with real money; treat WATCH as a secondary list</li>
                    <li>Never risk more than <strong style="color:#f9fafb">1–2% of your capital</strong> on a single trade</li>
                </ul>
            </div>

            <!-- Footer -->
            <p style="color:#374151;font-size:11px;text-align:center;margin:0;">
                ⚠️ SwingEdge is for educational purposes only. Not financial advice. Always use your own judgment.<br/>
                SwingEdge © 2026 — Your Quantitative Edge in the Indian Market
            </p>
        </div>
    </body>
    </html>
    `;

    try {
        const transporter = getTransporter();
        await transporter.sendMail({
            from: `"SwingEdge ⚡" <${from}>`,
            to,
            subject: `📈 SwingEdge Pre-Market: ${setups.length} Swing Setup${setups.length > 1 ? 's' : ''} Found — ${new Date().toLocaleDateString('en-IN')}`,
            html,
        });
        console.log(`[ALERTER] ✅ Pre-market alert sent to ${to} with ${setups.length} setups`);
    } catch (err: any) {
        console.error('[ALERTER] ❌ Failed to send email:', err.message);
    }
}
