import prisma from './prismaClient';
import { TradeSetup } from './types';
import { sendPreMarketDigestToEmail, sendPostMarketSummaryToEmail } from './alerter';
import { sendPushNotificationToUser } from './pushNotificationService';
import { sendPreMarketDigest as sendWhatsAppDigest } from './whatsappAlert';
import { sendPreMarketDigest as sendTelegramDigest } from './telegramAlert';

function parseAlertTarget(target?: string | null): { channel: 'whatsapp' | 'telegram'; value: string } | null {
    if (!target) return null;
    const trimmed = target.trim();
    if (!trimmed) return null;
    if (trimmed.toLowerCase().startsWith('telegram:')) {
        const chatId = trimmed.slice('telegram:'.length).trim();
        return chatId ? { channel: 'telegram', value: chatId } : null;
    }
    return { channel: 'whatsapp', value: trimmed };
}

function getPremiumSetups(setups: TradeSetup[]): TradeSetup[] {
    return setups
        .filter(s =>
            (s.aiSignal === 'BUY' || s.aiSignal === 'LIGHT BUY') &&
            s.confidenceScore >= 7 &&
            s.newsDistribution?.alertEligible === true
        )
        .slice(0, 8);
}

async function getNotificationUsers() {
    return prisma.user.findMany({
        where: {
            OR: [
                { notifyBuySignals: true },
                { notifyEmail: true },
            ],
        },
        select: {
            id: true,
            email: true,
            telegramChatId: true,
            notifyBuySignals: true,
            notifyEmail: true,
        },
    });
}

export async function notifyUsersWithMorningDigest(setups: TradeSetup[], regime: string): Promise<void> {
    const premiumSetups = getPremiumSetups(setups);
    const users = await getNotificationUsers();

    await Promise.allSettled(users.map(async user => {
        if (user.notifyBuySignals) {
            const target = parseAlertTarget(user.telegramChatId);
            if (target?.channel === 'telegram') {
                await sendTelegramDigest(target.value, premiumSetups, regime);
            } else if (target?.channel === 'whatsapp') {
                await sendWhatsAppDigest(target.value, premiumSetups, regime);
            }
        }

        if (user.notifyEmail) {
            await sendPreMarketDigestToEmail(user.email, premiumSetups, regime);
        }

        if (user.notifyBuySignals && premiumSetups.length > 0) {
            await sendPushNotificationToUser(user.id, {
                title: 'StockSage morning brief',
                body: `${premiumSetups.length} premium setup${premiumSetups.length === 1 ? '' : 's'} ready in ${regime} regime.`,
                data: {
                    screen: '/(tabs)',
                    regime,
                    setupCount: premiumSetups.length,
                },
            });
        }
    }));
}

export async function notifyUsersWithPostMarketSummary(setups: TradeSetup[], regime: string): Promise<void> {
    const premiumSetups = getPremiumSetups(setups);
    const users = await getNotificationUsers();

    await Promise.allSettled(users
        .filter(user => user.notifyEmail || user.notifyBuySignals)
        .map(async user => {
            if (user.notifyEmail) {
                await sendPostMarketSummaryToEmail(user.email, premiumSetups, regime);
            }
            if (user.notifyBuySignals) {
                await sendPushNotificationToUser(user.id, {
                    title: 'StockSage post-market summary',
                    body: premiumSetups.length
                        ? `${premiumSetups.length} premium setup${premiumSetups.length === 1 ? '' : 's'} survived the close.`
                        : 'No premium BUY setups survived the closing scan today.',
                    data: {
                        screen: '/(tabs)',
                        regime,
                        setupCount: premiumSetups.length,
                    },
                });
            }
        }));
}
