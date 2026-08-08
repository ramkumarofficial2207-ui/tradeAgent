import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { scheduleMock, pushEventMock } = vi.hoisted(() => ({
    scheduleMock: vi.fn(),
    pushEventMock: vi.fn(),
}));

vi.mock('node-cron', () => ({ default: { schedule: scheduleMock } }));
vi.mock('../src/agentEvents', () => ({ pushEvent: pushEventMock }));

import { configuredNseHolidays, initAutoScanner, isConfiguredNseHoliday } from '../src/autoScannerJob';

describe('automatic scanner scheduling', () => {
    const originalEnabled = process.env.ENABLE_AUTO_SCAN;
    const originalHolidays = process.env.NSE_MARKET_HOLIDAYS;

    beforeEach(() => {
        vi.clearAllMocks();
        delete process.env.NSE_MARKET_HOLIDAYS;
    });

    afterEach(() => {
        if (originalEnabled === undefined) delete process.env.ENABLE_AUTO_SCAN;
        else process.env.ENABLE_AUTO_SCAN = originalEnabled;
        if (originalHolidays === undefined) delete process.env.NSE_MARKET_HOLIDAYS;
        else process.env.NSE_MARKET_HOLIDAYS = originalHolidays;
    });

    it('does not register scheduled work when auto-scan is disabled', () => {
        process.env.ENABLE_AUTO_SCAN = 'false';
        initAutoScanner(vi.fn());
        expect(scheduleMock).not.toHaveBeenCalled();
    });

    it('registers market-hour and closing scans in the IST timezone', () => {
        process.env.ENABLE_AUTO_SCAN = 'true';
        initAutoScanner(vi.fn());

        expect(scheduleMock).toHaveBeenCalledTimes(3);
        expect(scheduleMock).toHaveBeenNthCalledWith(
            1,
            '15,45 9-14 * * 1-5',
            expect.any(Function),
            { timezone: 'Asia/Kolkata' },
        );
        expect(scheduleMock).toHaveBeenNthCalledWith(
            2,
            '15 15 * * 1-5',
            expect.any(Function),
            { timezone: 'Asia/Kolkata' },
        );
        expect(scheduleMock).toHaveBeenNthCalledWith(
            3,
            '35 15 * * 1-5',
            expect.any(Function),
            { timezone: 'Asia/Kolkata' },
        );
    });

    it('accepts only valid configured NSE holiday dates', () => {
        process.env.NSE_MARKET_HOLIDAYS = '2026-08-15, invalid, 2026-10-02';
        expect([...configuredNseHolidays()]).toEqual(['2026-08-15', '2026-10-02']);
        expect(isConfiguredNseHoliday(new Date('2026-08-15T06:00:00.000Z'))).toBe(true);
        expect(isConfiguredNseHoliday(new Date('2026-08-16T06:00:00.000Z'))).toBe(false);
    });
});
