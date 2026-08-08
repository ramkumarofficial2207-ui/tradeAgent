import { Request, Response, NextFunction } from 'express';
import { z, ZodTypeAny } from 'zod';

export const registerSchema = z.object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().email().max(120),
    mobileNumber: z.string().trim().regex(/^\+?[0-9]{10,15}$/, 'Provide a valid mobile number.').optional(),
    password: z.string().min(10).max(128).optional(),
    secret: z.string().min(10).max(128).optional(),
    mpin: z.string().trim().regex(/^\d{6}$/, 'MPIN must be exactly 6 digits.').optional(),
}).superRefine((value, ctx) => {
    if (!value.password && !value.secret && !value.mpin) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['password'],
            message: 'Password or MPIN is required.',
        });
    }
});

export const loginSchema = z.object({
    email: z.string().trim().email().max(120).optional(),
    mobileNumber: z.string().trim().regex(/^\+?[0-9]{10,15}$/, 'Provide a valid mobile number.').optional(),
    password: z.string().min(1).max(128).optional(),
    secret: z.string().min(1).max(128).optional(),
    mpin: z.string().trim().regex(/^\d{6}$/, 'MPIN must be exactly 6 digits.').optional(),
}).superRefine((value, ctx) => {
    if (!value.email && !value.mobileNumber) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['email'],
            message: 'Email or mobile number is required.',
        });
    }
    if (!value.password && !value.secret && !value.mpin) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['password'],
            message: 'Password or MPIN is required.',
        });
    }
});

export const chatSchema = z.object({
    message: z.string().trim().min(3).max(2000),
});

export const newsImpactSchema = z.object({
    headline: z.string().trim().max(500).optional(),
    articleText: z.string().trim().max(8000).optional(),
    targetTicker: z.string().trim().max(20).optional(),
    targetSector: z.string().trim().max(120).optional(),
    currentMarketContext: z.string().trim().max(500).optional(),
    technicalContext: z.object({
        price: z.coerce.number().positive().optional(),
        gapPct: z.coerce.number().min(-50).max(50).optional(),
        dayHigh: z.coerce.number().positive().optional(),
        dayLow: z.coerce.number().positive().optional(),
        ema20: z.coerce.number().positive().optional(),
        ema50: z.coerce.number().positive().optional(),
        dma200: z.coerce.number().positive().optional(),
        volumeRatio: z.coerce.number().nonnegative().optional(),
        rsi14: z.coerce.number().min(0).max(100).optional(),
        scannerSetup: z.object({
            setupType: z.string().trim().max(80).optional(),
            confidenceScore: z.coerce.number().min(0).max(10).optional(),
            aiSignal: z.enum(['BUY', 'LIGHT BUY', 'WATCH', 'REJECT']).optional(),
            riskReward: z.coerce.number().positive().optional(),
            targetPct: z.coerce.number().optional(),
            slPct: z.coerce.number().optional(),
        }).optional(),
        regime: z.string().trim().max(40).optional(),
        sectorBreadth: z.object({
            sector: z.string().trim().max(120),
            qualifiedCount: z.coerce.number().int().min(0),
            setupCount: z.coerce.number().int().min(0),
            advancingRatio: z.coerce.number().min(0).max(1),
            breadthScore: z.coerce.number().min(0).max(1),
        }).optional(),
    }).optional(),
}).superRefine((value, ctx) => {
    if (!value.headline && !value.articleText) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['headline'],
            message: 'Provide a headline or articleText.',
        });
    }
});

const tickerSchema = z.string().trim().min(1).max(20)
    .regex(/^[A-Z0-9&.-]+$/i, 'Ticker contains unsupported characters.');

export const portfolioTradeSchema = z.object({
    ticker: tickerSchema,
    entryPrice: z.coerce.number().positive(),
    quantity: z.coerce.number().int().positive(),
    stopLossInit: z.coerce.number().positive(),
    target1: z.coerce.number().positive(),
    target2: z.coerce.number().positive().optional(),
    companyName: z.string().trim().max(120).optional(),
    sector: z.string().trim().max(120).optional(),
    capCategory: z.string().trim().max(40).optional(),
    setupType: z.string().trim().max(80).optional(),
    regimeAtEntry: z.string().trim().max(40).optional(),
    confidenceScore: z.coerce.number().min(0).max(10).optional(),
    notes: z.string().trim().max(2000).optional(),
}).superRefine((value, ctx) => {
    if (value.stopLossInit >= value.entryPrice) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['stopLossInit'],
            message: 'stopLossInit must be below entryPrice for a long trade.',
        });
    }
    if (value.target1 <= value.entryPrice) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['target1'],
            message: 'target1 must be above entryPrice for a long trade.',
        });
    }
    if (value.target2 !== undefined && value.target2 <= value.target1) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['target2'],
            message: 'target2 must be above target1.',
        });
    }
});

export const portfolioTradeUpdateSchema = z.object({
    exitPrice: z.coerce.number().positive().optional(),
    exitReason: z.enum(['TARGET', 'STOP', 'TRAIL', 'MANUAL']).optional(),
    currentPrice: z.coerce.number().positive().optional(),
    stopLossTrail: z.coerce.number().positive().optional(),
    notes: z.string().trim().max(2000).optional(),
}).superRefine((value, ctx) => {
    const hasClose = value.exitPrice !== undefined || value.exitReason !== undefined;
    const hasPriceUpdate = value.currentPrice !== undefined;
    const hasStopUpdate = value.stopLossTrail !== undefined;
    const hasNotesUpdate = value.notes !== undefined;

    if (!hasClose && !hasPriceUpdate && !hasStopUpdate && !hasNotesUpdate) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'Provide exit details, current price, or notes.',
        });
    }

    if ((value.exitPrice !== undefined) !== (value.exitReason !== undefined)) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['exitReason'],
            message: 'exitPrice and exitReason must be provided together.',
        });
    }
});

export const userPreferencesSchema = z.object({
    whatsappNumber: z.string().trim().max(30).optional(),
    telegramChatId: z.string().trim().max(80).optional(),
    notifyBuySignals: z.boolean().optional(),
    notifyEmail: z.boolean().optional(),
    name: z.string().trim().min(2).max(80).optional(),
});

export const capitalSettingsSchema = z.object({
    tradingCapital: z.coerce.number().min(10_000).max(1_000_000_000).optional(),
    maxRiskPct: z.coerce.number().min(0.1).max(5).optional(),
    maxPositions: z.coerce.number().int().min(1).max(50).optional(),
    maxSectorConc: z.coerce.number().int().min(1).max(20).optional(),
}).refine(value => Object.values(value).some(item => item !== undefined), {
    message: 'Provide at least one capital setting.',
});

export const signalLabsSchema = z.object({
    prompt: z.string().trim().min(3).max(4000),
    model: z.enum(['gemini', 'claude', 'groq']).default('gemini'),
});

export const riskCalculationSchema = z.object({
    portfolioCapital: z.coerce.number().min(10_000).max(1_000_000_000),
    maxRiskPct: z.coerce.number().min(0.1).max(5),
    entryPrice: z.coerce.number().positive(),
    stopLoss: z.coerce.number().positive(),
    regime: z.enum(['BULLISH', 'BEARISH', 'NEUTRAL', 'RISK_OFF']),
}).refine(value => value.stopLoss < value.entryPrice, {
    path: ['stopLoss'],
    message: 'stopLoss must be below entryPrice for a long trade.',
});

export const subscriptionOrderSchema = z.object({
    planId: z.enum(['MONTHLY', 'ANNUAL']),
});

export const paymentVerificationSchema = z.object({
    planId: z.enum(['MONTHLY', 'ANNUAL']),
    orderId: z.string().trim().min(8).max(100),
    paymentId: z.string().trim().min(8).max(100),
    signature: z.string().trim().regex(/^[a-f0-9]{64}$/i, 'Invalid payment signature.'),
});

export const deviceRegistrationSchema = z.object({
    pushToken: z.string().trim().min(20).max(400),
    platform: z.enum(['ios', 'android']),
});

export const adminActivateSchema = z.object({
    email: z.string().trim().email().max(120),
    planDays: z.coerce.number().int().positive().max(365).optional(),
});

export const adminInstitutionalFlowImportSchema = z.object({
    csv: z.string().min(20).max(50000),
    source: z.string().trim().min(3).max(80).optional(),
});

export const watchlistCreateSchema = z.object({
    ticker: z.string().trim().min(1).max(20),
    sector: z.string().trim().max(120).optional(),
    signal: z.string().trim().max(40).optional(),
    ltp: z.coerce.number().positive().optional(),
    target: z.coerce.number().positive().optional(),
    stopLoss: z.coerce.number().positive().optional(),
    targetPct: z.coerce.number().optional(),
    slPct: z.coerce.number().optional(),
    riskReward: z.coerce.number().positive().optional(),
    confidenceScore: z.coerce.number().min(0).max(10).optional(),
    setupType: z.string().trim().max(80).optional(),
    buyZone: z.coerce.number().positive().optional(),
    snapshot: z.record(z.string(), z.unknown()).optional(),
});

export function validateBody<T extends ZodTypeAny>(schema: T) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const result = schema.safeParse(req.body ?? {});
        if (!result.success) {
            const issue = result.error.issues[0];
            res.status(400).json({
                success: false,
                message: issue?.message || 'Invalid request payload.',
                errors: result.error.issues.map(err => ({
                    path: err.path.join('.'),
                    message: err.message,
                })),
            });
            return;
        }
        req.body = result.data;
        next();
    };
}
