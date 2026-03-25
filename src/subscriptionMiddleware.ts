import { Request, Response, NextFunction } from 'express';
import prisma from './prismaClient';
import { AuthRequest } from './authMiddleware';

// Subscription check middleware — gates premium features
// TRIAL and ACTIVE users pass through; FREE/EXPIRED get 403
export async function requireSubscription(req: AuthRequest, res: Response, next: NextFunction) {
    if (!req.userId) {
        res.status(401).json({ success: false, message: 'Authentication required.' });
        return;
    }

    try {
        const user = await prisma.user.findUnique({
            where: { id: req.userId },
            select: { subscriptionStatus: true, subscriptionExpiry: true },
        });

        if (!user) {
            res.status(401).json({ success: false, message: 'User not found.' });
            return;
        }

        const { subscriptionStatus, subscriptionExpiry } = user as any;

        // ACTIVE: full access
        if (subscriptionStatus === 'ACTIVE') {
            // Check expiry
            if (subscriptionExpiry && new Date(subscriptionExpiry) < new Date()) {
                await prisma.user.update({
                    where: { id: req.userId },
                    data: { subscriptionStatus: 'EXPIRED' },
                });
                res.status(403).json({
                    success: false,
                    message: 'Your subscription has expired. Please renew to continue using StockSage AI.',
                    code: 'SUBSCRIPTION_EXPIRED',
                });
                return;
            }
            return next();
        }

        // TRIAL: grant access for 7 days from account creation
        if (subscriptionStatus === 'TRIAL') {
            // Trial logic is handled at registration (7-day window)
            if (subscriptionExpiry && new Date(subscriptionExpiry) < new Date()) {
                await prisma.user.update({
                    where: { id: req.userId },
                    data: { subscriptionStatus: 'FREE' },
                });
                res.status(403).json({
                    success: false,
                    message: 'Your 7-day free trial has ended. Subscribe to ₹2999/month to continue.',
                    code: 'TRIAL_EXPIRED',
                });
                return;
            }
            return next();
        }

        // FREE or EXPIRED: block
        const expiredMsg = subscriptionStatus === 'EXPIRED'
            ? 'Your subscription has expired. Please renew to continue using StockSage AI.'
            : 'This feature requires an active StockSage AI subscription (₹2999/month).';

        res.status(403).json({
            success: false,
            message: expiredMsg,
            code: 'SUBSCRIPTION_REQUIRED',
        });
    } catch (err) {
        console.error('[Subscription] Check error:', err);
        // Fail open in case of DB error — don't block users due to infrastructure issues
        next();
    }
}
