import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';

const JWT_ISSUER = 'apexscan-api';
const JWT_AUDIENCE = 'apexscan-client';

export interface AuthRequest extends Request {
    userId?: string;
    userEmail?: string;
}

function getJwtSecret(): string {
    const secret = process.env.JWT_SECRET?.trim();
    if (!secret || secret.length < 32) {
        throw new Error('JWT_SECRET must be configured with at least 32 characters.');
    }
    return secret;
}

export function assertAuthConfiguration(): void {
    getJwtSecret();
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
    const match = /^Bearer\s+([^\s]+)$/i.exec(req.headers.authorization ?? '');
    if (!match) {
        res.status(401).json({ success: false, message: 'Authentication required.' });
        return;
    }

    try {
        const payload = jwt.verify(match[1], getJwtSecret(), {
            algorithms: ['HS256'],
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE,
        }) as JwtPayload;

        if (typeof payload.userId !== 'string' || typeof payload.email !== 'string') {
            throw new Error('Token subject is invalid.');
        }

        req.userId = payload.userId;
        req.userEmail = payload.email;
        next();
    } catch {
        res.status(401).json({ success: false, message: 'Invalid or expired authentication token.' });
    }
}

export function requireAdmin(req: AuthRequest, res: Response, next: NextFunction): void {
    if (!req.userEmail || !isAdminEmail(req.userEmail)) {
        res.status(403).json({ success: false, message: 'Administrator access required.' });
        return;
    }
    next();
}

export function isAdminEmail(email: string): boolean {
    return (process.env.ADMIN_EMAILS ?? '')
        .split(',')
        .map(value => value.trim().toLowerCase())
        .filter(Boolean)
        .includes(email.toLowerCase());
}

export function generateKiteOauthState(userId: string, email: string): string {
    return jwt.sign({ userId, email, purpose: 'kite-oauth' }, getJwtSecret(), {
        algorithm: 'HS256',
        expiresIn: '10m',
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        subject: userId,
    });
}

export function verifyKiteOauthState(token: string): { userId: string; email: string } {
    const payload = jwt.verify(token, getJwtSecret(), {
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
    }) as JwtPayload;
    if (payload.purpose !== 'kite-oauth' || typeof payload.userId !== 'string' || typeof payload.email !== 'string') {
        throw new Error('Invalid OAuth state.');
    }
    return { userId: payload.userId, email: payload.email };
}

export function generateToken(userId: string, email: string): string {
    return jwt.sign({ userId, email }, getJwtSecret(), {
        algorithm: 'HS256',
        expiresIn: '30d',
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
        subject: userId,
    });
}
