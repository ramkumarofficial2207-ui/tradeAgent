"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateNewsRisk = validateNewsRisk;
const axios_1 = __importDefault(require("axios"));
const NEGATIVE_PATTERNS = [
    { pattern: /\bpledge\b/i, reason: 'Promoter pledge risk detected' },
    { pattern: /\bregulator|sebi|penalty|probe|fraud|raids?\b/i, reason: 'Regulatory risk headline detected' },
    { pattern: /\bdowngrade|cut to (?:sell|underperform)|negative outlook\b/i, reason: 'Negative analyst/sector downgrade' },
    { pattern: /\bresults today|earnings today|q[1-4] results\b/i, reason: 'Near-term earnings event risk' },
];
function buildRssUrl(ticker) {
    const q = encodeURIComponent(`${ticker} NSE stock`);
    return `https://news.google.com/rss/search?q=${q}&hl=en-IN&gl=IN&ceid=IN:en`;
}
function parseTitles(xml, max = 8) {
    const titles = [...xml.matchAll(/<title>(.*?)<\/title>/g)].map((m) => m[1].trim());
    // First title is feed title; skip it.
    return titles.slice(1, 1 + max);
}
async function validateNewsRisk(ticker) {
    try {
        const { data } = await axios_1.default.get(buildRssUrl(ticker), { timeout: 10000 });
        const headlines = parseTitles(data, 8);
        const joined = headlines.join(' | ');
        const hit = NEGATIVE_PATTERNS.find((rule) => rule.pattern.test(joined));
        if (hit) {
            return { blocked: true, reason: hit.reason, headlines };
        }
        return { blocked: false, reason: 'No high-risk headline flags', headlines };
    }
    catch {
        // Fail-open for signal generation, but include explicit message.
        return { blocked: false, reason: 'News source unavailable; manual check required', headlines: [] };
    }
}
//# sourceMappingURL=newsValidator.js.map