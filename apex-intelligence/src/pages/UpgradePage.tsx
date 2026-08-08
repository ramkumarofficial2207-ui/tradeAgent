import React, { useState } from 'react';
import { CheckCircle2, CreditCard, Crown, ShieldCheck } from 'lucide-react';
import { apiJson } from '../lib/api';

type PlanId = 'MONTHLY' | 'ANNUAL';

interface RazorpayCheckoutResponse {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayOrder {
  orderId: string;
  amount: number;
  currency: string;
  planName: string;
  key: string;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

function loadRazorpayCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-razorpay-checkout]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Unable to load Razorpay Checkout.')), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    script.dataset.razorpayCheckout = 'true';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Unable to load Razorpay Checkout.'));
    document.head.appendChild(script);
  });
}

const plans: Array<{ id: PlanId; name: string; price: string; period: string; features: string[] }> = [
  {
    id: 'MONTHLY',
    name: 'Pro Monthly',
    price: '₹2,999',
    period: '30 days',
    features: ['Authenticated market scanner', 'Signal Labs and institutional feeds', 'Paper portfolio and risk intelligence'],
  },
  {
    id: 'ANNUAL',
    name: 'Pro Annual',
    price: '₹24,999',
    period: '365 days',
    features: ['All Pro capabilities', 'One annual payment', 'Subscription extends from the active expiry date'],
  },
];

export const UpgradePage: React.FC = () => {
  const [processingPlan, setProcessingPlan] = useState<PlanId | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const startCheckout = async (planId: PlanId) => {
    setProcessingPlan(planId);
    setError(null);
    setSuccess(null);
    try {
      await loadRazorpayCheckout();
      const order = await apiJson<RazorpayOrder>('/api/subscription/create-order', {
        method: 'POST',
        body: JSON.stringify({ planId }),
      });
      if (!window.Razorpay) throw new Error('Razorpay Checkout is unavailable.');

      const checkout = new window.Razorpay({
        key: order.key,
        amount: order.amount,
        currency: order.currency,
        name: 'ApexScan AI',
        description: order.planName,
        order_id: order.orderId,
        handler: async (response: RazorpayCheckoutResponse) => {
          try {
            const result = await apiJson<{ message: string }>('/api/subscription/verify-payment', {
              method: 'POST',
              body: JSON.stringify({
                planId,
                orderId: response.razorpay_order_id,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
              }),
            });
            setSuccess(result.message);
          } catch (verificationError: any) {
            setError(verificationError?.message || 'Payment verification failed. Contact support with your payment ID.');
          } finally {
            setProcessingPlan(null);
          }
        },
        modal: {
          ondismiss: () => setProcessingPlan(null),
        },
        theme: { color: '#06B6D4' },
      });
      checkout.open();
    } catch (checkoutError: any) {
      setError(checkoutError?.message || 'Checkout is unavailable.');
      setProcessingPlan(null);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="bg-[#0D1117] border border-white/10 rounded-2xl p-6 text-center">
        <Crown className="w-8 h-8 text-amber-400 mx-auto" />
        <h1 className="text-2xl font-extrabold text-white mt-2">ApexScan Pro Subscription</h1>
        <p className="text-xs text-gray-400 mt-2">Payments are processed by Razorpay and activated only after server-side signature verification.</p>
      </div>

      {error && <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-sm text-red-300">{error}</div>}
      {success && <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-sm text-emerald-300 flex gap-2"><CheckCircle2 className="w-5 h-5" />{success}</div>}

      <div className="grid md:grid-cols-2 gap-6">
        {plans.map(plan => (
          <div key={plan.id} className="bg-[#0D1117] border border-white/10 rounded-2xl p-6 space-y-5">
            <div>
              <h2 className="text-lg font-bold text-white">{plan.name}</h2>
              <p className="font-mono mt-2"><span className="text-3xl font-black text-cyan-300">{plan.price}</span><span className="text-xs text-gray-500"> / {plan.period}</span></p>
            </div>
            <div className="space-y-2">
              {plan.features.map(feature => <p key={feature} className="text-xs text-gray-300 flex gap-2"><ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />{feature}</p>)}
            </div>
            <button
              onClick={() => startCheckout(plan.id)}
              disabled={processingPlan !== null}
              className="w-full py-3 rounded-xl bg-cyan-500 hover:bg-cyan-600 disabled:opacity-50 text-black text-xs font-bold flex items-center justify-center gap-2"
            >
              <CreditCard className="w-4 h-4" />
              {processingPlan === plan.id ? 'Opening secure checkout…' : `Choose ${plan.name}`}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};


