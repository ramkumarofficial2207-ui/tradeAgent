import axios from 'axios';
import prisma from './prismaClient';

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';

export interface PushPayload {
    title: string;
    body: string;
    data?: Record<string, unknown>;
}

function isExpoPushToken(token: string): boolean {
    return /^ExponentPushToken\[[A-Za-z0-9+/=_-]+\]$/.test(token) || /^ExpoPushToken\[[A-Za-z0-9+/=_-]+\]$/.test(token);
}

export async function registerDeviceToken(userId: string, token: string, platform: 'ios' | 'android'): Promise<void> {
    if (!isExpoPushToken(token)) {
        throw new Error('Invalid Expo push token.');
    }

    await prisma.deviceToken.upsert({
        where: { token },
        update: {
            userId,
            platform,
        },
        create: {
            userId,
            token,
            platform,
        },
    });
}

export async function sendPushNotificationToUser(userId: string, payload: PushPayload): Promise<void> {
    const tokens = await prisma.deviceToken.findMany({
        where: { userId },
        select: { token: true },
    });

    if (!tokens.length) return;

    await Promise.allSettled(tokens.map(async ({ token }) => {
        try {
            await axios.post(EXPO_PUSH_ENDPOINT, {
                to: token,
                sound: 'default',
                title: payload.title,
                body: payload.body,
                data: payload.data ?? {},
            }, {
                timeout: 10000,
                headers: {
                    'Content-Type': 'application/json',
                    Accept: 'application/json',
                },
            });
        } catch (error: any) {
            const message = String(error?.response?.data?.errors?.[0]?.message || error?.message || '');
            if (message.toLowerCase().includes('device') || message.toLowerCase().includes('not registered')) {
                await prisma.deviceToken.deleteMany({ where: { token } });
            }
        }
    }));
}
