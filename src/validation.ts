import { Request, Response, NextFunction } from 'express';
import { z, ZodTypeAny } from 'zod';

export const registerSchema = z.object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().email().max(120),
    mobileNumber: z.string().trim().regex(/^\+?[0-9]{10,15}$/, 'Provide a valid mobile number.').optional(),
    password: z.string().min(6).max(128).optional(),
    secret: z.string().min(6).max(128).optional(),
    mpin: z.string().trim().regex(/^\d{4,6}$/, 'MPIN must be 4 to 6 digits.').optional(),
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
    mpin: z.string().trim().regex(/^\d{4,6}$/, 'MPIN must be 4 to 6 digits.').optional(),
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

export const portfolioTradeSchema = z.object({
    ticker: z.string().trim().min(1).max(20),
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
});

export const portfolioTradeUpdateSchema = z.object({
    exitPrice: z.coerce.number().positive().optional(),
    exitReason: z.enum(['TARGET', 'STOP', 'TRAIL', 'MANUAL']).optional(),
    currentPrice: z.coerce.number().positive().optional(),
    notes: z.string().trim().max(2000).optional(),
}).superRefine((value, ctx) => {
    const hasClose = value.exitPrice !== undefined || value.exitReason !== undefined;
    const hasPriceUpdate = value.currentPrice !== undefined;
    const hasNotesUpdate = value.notes !== undefined;

    if (!hasClose && !hasPriceUpdate && !hasNotesUpdate) {
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
    notifyBuySignals: z.boolean().optional(),
    notifyEmail: z.boolean().optional(),
    name: z.string().trim().min(2).max(80).optional(),
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
