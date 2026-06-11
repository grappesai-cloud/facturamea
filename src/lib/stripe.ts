// Stripe singleton + product/price helpers.
// Lazy-instantiated so the module loads cleanly without STRIPE_SECRET_KEY
// (build / dev environments without the secret will simply not be able
// to make Stripe calls — endpoints return a clear "not configured" error).

import Stripe from 'stripe';

let cached: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (cached) return cached;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  cached = new Stripe(key, {
    apiVersion: '2024-12-18.acacia' as any,
    appInfo: { name: 'facturamea', url: 'https://www.facturamea.com' },
    maxNetworkRetries: 2,
    timeout: 10_000,
  });
  return cached;
}

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

// Price IDs for subscription tiers + credit packs. Set in Stripe dashboard,
// then reference by env var so we don't hardcode them.
export const PRICE_IDS = {
  // Subscriptions (monthly recurring)
  sub_sprinter: process.env.STRIPE_PRICE_SPRINTER || '',
  sub_cargo:    process.env.STRIPE_PRICE_CARGO    || '',
  sub_premium:  process.env.STRIPE_PRICE_PREMIUM  || '',
  // Credit packs (one-time)
  credits_100:  process.env.STRIPE_PRICE_CREDITS_100  || '',
  credits_500:  process.env.STRIPE_PRICE_CREDITS_500  || '',
  credits_1000: process.env.STRIPE_PRICE_CREDITS_1000 || '',
};
