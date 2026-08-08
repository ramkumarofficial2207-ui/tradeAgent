import { describe, expect, it } from 'vitest';
import {
    isValidMobileNumber,
    normalizeMobileNumberInput,
} from '../apex-intelligence/src/lib/loginForm';

describe('MPIN login mobile number input', () => {
    it('does not allow a saved full name to become a mobile number', () => {
        const value = normalizeMobileNumberInput('ApexAdmin');

        expect(value).toBe('');
        expect(isValidMobileNumber(value)).toBe(false);
    });

    it('normalizes common mobile number formatting', () => {
        expect(normalizeMobileNumberInput('+91 98765 43210')).toBe('+919876543210');
        expect(normalizeMobileNumberInput('(987) 654-3210')).toBe('9876543210');
    });

    it('accepts only normalized mobile numbers containing 10 to 15 digits', () => {
        expect(isValidMobileNumber('9876543210')).toBe(true);
        expect(isValidMobileNumber('+919876543210')).toBe(true);
        expect(isValidMobileNumber('98765')).toBe(false);
        expect(isValidMobileNumber('ApexAdmin')).toBe(false);
    });
});
