import { Request, Response, NextFunction } from 'express';
import { z, ZodTypeAny } from 'zod';

export const registerSchema = z.object({
    name: z.string().trim().min(2).max(80),
    email: z.string().trim().email().max(120),
    password: z.string().min(6).max(128).optional(),
    secret: z.string().min(6).max(128).optional(),
}).superRefine((value, ctx) => {
    if (!value.password && !value.secret) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['password'],
            message: 'Password is required.',
        });
    }
});

export const loginSchema = z.object({
    email: z.string().trim().email().max(120),
    password: z.string().min(1).max(128).optional(),
    secret: z.string().min(1).max(128).optional(),
}).superRefine((value, ctx) => {
    if (!value.password && !value.secret) {
        ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['password'],
            message: 'Password is required.',
        });
    }
});

export const chatSchema = z.object({
    message: z.string().trim().min(3).max(2000),
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
