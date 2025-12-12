export interface RelevxUserBilling {
    stripeSubscriptionId: string;
    stripeCustomerId: string;
}

export interface BillingIntentResponse {
    // 
    ok: boolean;
    // Stripe setup intent ID
    stripeSetupIntentClientSecret: string;
}

export interface BillingPaymentLinkResponse {
    // 
    ok: boolean;
    // Stripe payment link
    stripePaymentLink: string;
}

export interface ActivateFreeTrialRequest {
    // --
    planId: string;
}

export interface ActivateFreeTrialResponse {
    // 
    ok: boolean;
}