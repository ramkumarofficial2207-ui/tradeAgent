import rateLimit from 'express-rate-limit';

// ── Scanner: 5 requests / 15 min per IP ──────────────────────────
// Protects Gemini/Claude/Groq API costs from abuse
export const scanLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Scanner rate limit reached. Please wait a few minutes before scanning again.'
    }
});

// ── Chat: 20 requests / hour per IP ──────────────────────────────
export const chatLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Chat rate limit reached. You can send 20 messages per hour.'
    }
});

export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many login attempts. Please try again in 15 minutes.'
    }
});

export const paymentLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many payment requests. Please try again later.'
    }
});

// ── General API: 100 requests / 15 min ───────────────────────────
export const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        success: false,
        message: 'Too many requests. Please slow down.'
    }
});
