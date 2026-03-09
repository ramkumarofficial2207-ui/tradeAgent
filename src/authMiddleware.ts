// authMiddleware.ts — JWT authentication middleware
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'stocksage_default_secret_change_in_prod';

export interface AuthRequest extends Request {
    userId?: string;
    userEmail?: string;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ success: false, message: 'Unauthorized. Please log in.' });
        return;
    }

    const token = authHeader.split(' ')[1];
    try {
        const payload = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
        req.userId = payload.userId;
        req.userEmail = payload.email;
        next();
    } catch {
        res.status(401).json({ success: false, message: 'Invalid or expired session. Please log in again.' });
    }
}

export function generateToken(userId: string, email: string): string {
    return jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '30d' });
}
