import "fastify";
import type { preHandlerHookHandler } from "fastify";
import type Stripe from "stripe";
import type { Plan } from "../models/plan";

declare module "fastify" {
  interface FastifyInstance {
    // Apply per-route rate limiting; default resolved from tenant settings
    rlPerRoute: (max?: number) => preHandlerHookHandler;
    stripe: Stripe;
    firebase: {
      auth: import("firebase-admin/auth").Auth;
      db: import("firebase-admin/firestore").Firestore;
      app: import("firebase-admin/app").App;
    };
    // Verify Firebase ID token and enrich with optional user/plan
    introspectIdToken: (idToken: string) => Promise<{
      user?: {
        uid: string; email?: string; emailVerified?: boolean; plan?: Plan;
      };
    }>;
  }
}


