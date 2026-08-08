import type { NextFunction, Response } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    assertAuthConfiguration,
    generateToken,
    requireAuth,
    type AuthRequest,
} from '../src/authMiddleware';

function responseMock() {
    const response = {
        status: vi.fn(),
        json: vi.fn(),
    };
    response.status.mockReturnValue(response);
    return response as unknown as Response & {
        status: ReturnType<typeof vi.fn>;
        json: ReturnType<typeof vi.fn>;
    };
}

describe('JWT authentication middleware', () => {
    const originalSecret = process.env.JWT_SECRET;

    beforeEach(() => {
        process.env.JWT_SECRET = 'test-secret-that-is-at-least-32-characters-long';
    });

    afterEach(() => {
        if (originalSecret === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = originalSecret;
        vi.restoreAllMocks();
    });

    it('fails startup validation when JWT_SECRET is missing', () => {
        delete process.env.JWT_SECRET;
        expect(() => assertAuthConfiguration()).toThrow(/JWT_SECRET/);
    });

    it('rejects requests without a bearer token', () => {
        const request = { headers: {} } as AuthRequest;
        const response = responseMock();
        const next = vi.fn() as NextFunction;

        requireAuth(request, response, next);

        expect(response.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
        expect(request.userId).toBeUndefined();
    });

    it('accepts a valid signed token and attaches its identity', () => {
        const token = generateToken('user-123', 'owner@example.com');
        const request = { headers: { authorization: `Bearer ${token}` } } as AuthRequest;
        const response = responseMock();
        const next = vi.fn() as NextFunction;

        requireAuth(request, response, next);

        expect(next).toHaveBeenCalledOnce();
        expect(response.status).not.toHaveBeenCalled();
        expect(request.userId).toBe('user-123');
        expect(request.userEmail).toBe('owner@example.com');
    });

    it('rejects a token whose signature was altered', () => {
        const token = generateToken('user-123', 'owner@example.com');
        const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
        const request = { headers: { authorization: `Bearer ${tampered}` } } as AuthRequest;
        const response = responseMock();
        const next = vi.fn() as NextFunction;

        requireAuth(request, response, next);

        expect(response.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
    });
});
