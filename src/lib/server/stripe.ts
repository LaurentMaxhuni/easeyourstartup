import "server-only";

import Stripe from "stripe";

let stripeClient: Stripe | null = null;

export function getStripeClient() {
  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) return null;
  stripeClient ??= new Stripe(secret, { maxNetworkRetries: 2 });
  return stripeClient;
}
