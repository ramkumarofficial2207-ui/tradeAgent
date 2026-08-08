import crypto from 'crypto';
import axios from 'axios';
import type { PaymentOrder, Prisma } from '@prisma/client';
import prisma from '../prismaClient';

export interface PlanConfig {
    planId: 'MONTHLY' | 'ANNUAL';
    amountRs: number;
    durationDays: number;
    planName: string;
}

export const SUBSCRIPTION_PLANS: Record<'MONTHLY' | 'ANNUAL', PlanConfig> = {
    MONTHLY: {
        planId: 'MONTHLY',
        amountRs: 2999,
        durationDays: 30,
        planName: 'ApexScan Pro Monthly',
    },
    ANNUAL: {
        planId: 'ANNUAL',
        amountRs: 24999,
        durationDays: 365,
        planName: 'ApexScan Pro Annual',
    },
};

interface RazorpayOrderResponse {
    id: string;
    amount: number;
    currency: string;
    status: string;
}

export interface VerifiedSubscription {
    success: true;
    status: 'ACTIVE';
    expiryDate: Date;
    message: string;
}

function requiredPaymentConfig(name: 'RAZORPAY_KEY_ID' | 'RAZORPAY_KEY_SECRET' | 'RAZORPAY_WEBHOOK_SECRET'): string {
    const value = process.env[name]?.trim();
    if (!value) throw new Error(`${name} is not configured.`);
    return value;
}

function signaturesMatch(expectedHex: string, suppliedHex: string): boolean {
    if (!/^[a-f0-9]{64}$/i.test(suppliedHex)) return false;
    const expected = Buffer.from(expectedHex, 'hex');
    const supplied = Buffer.from(suppliedHex, 'hex');
    return expected.length === supplied.length && crypto.timingSafeEqual(expected, supplied);
}

export function verifyRazorpayPaymentSignature(orderId: string, paymentId: string, signature: string): boolean {
    const secret = requiredPaymentConfig('RAZORPAY_KEY_SECRET');
    const expected = crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
    return signaturesMatch(expected, signature);
}

export function verifyRazorpayWebhookSignature(rawBody: Buffer, signature: string): boolean {
    const secret = requiredPaymentConfig('RAZORPAY_WEBHOOK_SECRET');
    const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    return signaturesMatch(expected, signature);
}

export async function createRazorpayOrder(userId: string, planId: 'MONTHLY' | 'ANNUAL') {
    const plan = SUBSCRIPTION_PLANS[planId];
    const keyId = requiredPaymentConfig('RAZORPAY_KEY_ID');
    const keySecret = requiredPaymentConfig('RAZORPAY_KEY_SECRET');
    const amountPaise = plan.amountRs * 100;

    const response = await axios.post<RazorpayOrderResponse>(
        'https://api.razorpay.com/v1/orders',
        {
            amount: amountPaise,
            currency: 'INR',
            receipt: `sub_${userId.slice(0, 8)}_${Date.now().toString(36)}`,
            notes: { userId, planId },
        },
        {
            auth: { username: keyId, password: keySecret },
            timeout: 10_000,
        }
    );

    const providerOrder = response.data;
    if (!providerOrder?.id || providerOrder.amount !== amountPaise || providerOrder.currency !== 'INR') {
        throw new Error('Payment provider returned an invalid order.');
    }

    await prisma.paymentOrder.create({
        data: {
            providerOrderId: providerOrder.id,
            userId,
            planId,
            amountPaise,
            currency: 'INR',
            status: 'CREATED',
        },
    });

    return {
        orderId: providerOrder.id,
        amount: amountPaise,
        currency: 'INR',
        planName: plan.planName,
        key: keyId,
    };
}

async function activatePaymentOrder(
    tx: Prisma.TransactionClient,
    order: PaymentOrder,
    paymentId: string
): Promise<VerifiedSubscription> {
    const plan = SUBSCRIPTION_PLANS[order.planId as 'MONTHLY' | 'ANNUAL'];
    if (!plan || order.amountPaise !== plan.amountRs * 100 || order.currency !== 'INR') {
        throw new Error('Stored payment order does not match the selected plan.');
    }

    if (order.status === 'PAID') {
        if (order.paymentId !== paymentId) throw new Error('Payment order was already settled by another payment.');
        const existingUser = await tx.user.findUniqueOrThrow({ where: { id: order.userId } });
        return {
            success: true,
            status: 'ACTIVE',
            expiryDate: existingUser.subscriptionExpiry ?? new Date(),
            message: `${plan.planName} is already active.`,
        };
    }

    const claimed = await tx.paymentOrder.updateMany({
        where: { id: order.id, status: { not: 'PAID' } },
        data: { status: 'PAID', paymentId, paidAt: new Date() },
    });
    if (claimed.count !== 1) throw new Error('Payment order could not be settled.');

    const user = await tx.user.findUniqueOrThrow({ where: { id: order.userId } });
    const now = new Date();
    const baseDate = user.subscriptionStatus === 'ACTIVE' && user.subscriptionExpiry && user.subscriptionExpiry > now
        ? new Date(user.subscriptionExpiry)
        : now;
    const expiryDate = new Date(baseDate);
    expiryDate.setUTCDate(expiryDate.getUTCDate() + plan.durationDays);

    await tx.user.update({
        where: { id: order.userId },
        data: { subscriptionStatus: 'ACTIVE', subscriptionExpiry: expiryDate },
    });

    return {
        success: true,
        status: 'ACTIVE',
        expiryDate,
        message: `${plan.planName} is active until ${expiryDate.toISOString().slice(0, 10)}.`,
    };
}

export async function verifyAndActivateSubscription(
    userId: string,
    input: { planId: 'MONTHLY' | 'ANNUAL'; orderId: string; paymentId: string; signature: string }
): Promise<VerifiedSubscription> {
    if (!verifyRazorpayPaymentSignature(input.orderId, input.paymentId, input.signature)) {
        throw new Error('Payment signature verification failed.');
    }

    const order = await prisma.paymentOrder.findFirst({
        where: { providerOrderId: input.orderId, userId },
    });
    if (!order || order.planId !== input.planId) throw new Error('Payment order not found.');

    return prisma.$transaction(tx => activatePaymentOrder(tx, order, input.paymentId));
}

export async function processRazorpayWebhook(rawBody: Buffer, signature: string): Promise<{ processed: boolean }> {
    if (!verifyRazorpayWebhookSignature(rawBody, signature)) {
        throw new Error('Webhook signature verification failed.');
    }

    const event = JSON.parse(rawBody.toString('utf8')) as {
        event?: string;
        payload?: {
            payment?: { entity?: { id?: string; order_id?: string } };
            order?: { entity?: { id?: string } };
        };
    };
    if (!['payment.captured', 'order.paid'].includes(event.event ?? '')) return { processed: false };

    const paymentId = event.payload?.payment?.entity?.id;
    const orderId = event.payload?.payment?.entity?.order_id ?? event.payload?.order?.entity?.id;
    if (!paymentId || !orderId) throw new Error('Webhook payment payload is incomplete.');

    const order = await prisma.paymentOrder.findUnique({ where: { providerOrderId: orderId } });
    if (!order) return { processed: false };
    await prisma.$transaction(tx => activatePaymentOrder(tx, order, paymentId));
    return { processed: true };
}
