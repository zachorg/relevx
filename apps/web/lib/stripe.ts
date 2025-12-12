import { loadStripe } from '@stripe/stripe-js';

// Initialize Stripe with your publishable key
// Adding special options to help with adblockers
const stripePromise = await loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "");

export default stripePromise;