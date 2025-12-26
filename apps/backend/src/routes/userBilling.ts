import type { FastifyPluginAsync } from "fastify";
import type Stripe from "stripe";
import type {
  ActivateFreeTrialRequest,
  BillingIntentResponse,
  BillingPaymentLinkResponse,
  RelevxUserProfile,
  Plan,
} from "core";

// API key management routes: create/list/revoke. All routes rely on the auth
// plugin to populate req.userId and tenant authorization.
const routes: FastifyPluginAsync = async (app) => {
  const firebase = app.firebase;
  const db = firebase.db;
  const stripe = app.stripe as Stripe;

  app.get("/healthz", async (_req, rep) => {
    return rep.send({ ok: true });
  });

  app.get(
    "/setup-intent",
    { preHandler: [app.rlPerRoute(10)] },
    async (req: any, rep) => {
      try {
        const userId = req.user?.uid;
        if (!userId) {
          return rep
            .status(401)
            .send({ error: { message: "Unauthenticated" } });
        }

        // Create or update user document in Firestore
        const userRef = db.collection("users").doc(userId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
          return rep.status(404).send({ error: { message: "User not found" } });
        }

        const userData = userDoc.data() as RelevxUserProfile;
        const setupIntent = await stripe.setupIntents.create({
          customer: userData.billing.stripeCustomerId,
          payment_method_types: ["card", "us_bank_account"], // or ['us_bank_account'] for ACH
        });

        if (!setupIntent) {
          return rep
            .status(500)
            .send({ error: { message: "Failed to create setup intent" } });
        }

        return rep.status(200).send({
          ok: true,
          stripeSetupIntentClientSecret: setupIntent.client_secret,
        } as BillingIntentResponse);
      } catch (err: any) {
        const isDev = process.env.NODE_ENV !== "production";
        const detail = err instanceof Error ? err.message : String(err);
        req.log?.error({ detail }, "/billing/setup-intent failed");
        return rep.status(500).send({
          error: {
            code: "internal_error",
            message: "Billing setup intent failed",
            ...(isDev ? { detail } : {}),
          },
        });
      }
    }
  );

  app.get(
    "/payment-link",
    { preHandler: [app.rlPerRoute(10)] },
    async (req: any, rep) => {
      try {
        const userId = req.user?.uid;
        if (!userId) {
          return rep
            .status(401)
            .send({ error: { message: "Unauthenticated" } });
        }
        const planId =
          (req.headers as any).planid || (req.headers as any).planId;
        if (!planId) {
          return rep
            .status(400)
            .send({ error: { message: "Plan ID is required" } });
        }
        const planDoc = await db.collection("plans").doc(planId).get();
        if (!planDoc.exists) {
          return rep.status(404).send({ error: { message: "Plan not found" } });
        }
        const planData = planDoc.data() as Plan;
        if (!planData) {
          return rep.status(404).send({ error: { message: "Plan not found" } });
        }

        // Create or update user document in Firestore
        const userRef = db.collection("users").doc(userId);
        const userDoc = await userRef.get();

        if (!userDoc.exists) {
          return rep.status(404).send({ error: { message: "User not found" } });
        }

        const userData = userDoc.data() as RelevxUserProfile;
        const session = await stripe.checkout.sessions.create({
          mode: "subscription",
          customer: userData.billing.stripeCustomerId,
          customer_update: { address: "auto" },
          // payment_method_options: { card: { setup_future_usage: "on_session" } },
          line_items: [
            { price: planData.infoStripeSubscriptionId, quantity: 1 },
          ],
          metadata: {
            userId: userId,
            planId: planId,
          },
          // @TODO: Update this to use the actual success and cancel URLs
          success_url: "https://relevx.ai/pricing?success=true",
          cancel_url: "https://relevx.ai/pricing?success=false",
        });

        if (!session) {
          return rep
            .status(500)
            .send({ error: { message: "Failed to create checkout session" } });
        }

        return rep.status(200).send({
          ok: true,
          stripePaymentLink: session.url,
        } as BillingPaymentLinkResponse);
      } catch (err: any) {
        const isDev = process.env.NODE_ENV !== "production";
        const detail = err instanceof Error ? err.message : String(err);
        req.log?.error({ detail }, "/billing/payment-link failed");
        return rep.status(500).send({
          error: {
            code: "internal_error",
            message: "Billing payment link failed",
            ...(isDev ? { detail } : {}),
          },
        });
      }
    }
  );

  app.post(
    "/activate-free-trial",
    { preHandler: [app.rlPerRoute(10)] },
    async (req: any, rep) => {
      try {
        const userId = req.user?.uid;
        if (!userId) {
          return rep
            .status(401)
            .send({ error: { message: "Unauthenticated" } });
        }

        const request = req.body as ActivateFreeTrialRequest;
        if (!request.planId) {
          return rep
            .status(400)
            .send({ error: { message: "Plan ID is required" } });
        }

        const planRef = db.collection("plans").doc(request.planId);
        const planDoc = await planRef.get();
        if (!planDoc.exists) {
          return rep.status(404).send({ error: { message: "Plan not found" } });
        }
        const planData = planDoc.data() as Plan;
        if (!planData) {
          return rep.status(404).send({ error: { message: "Plan not found" } });
        }

        if (planData.infoStripeSubscriptionId === "") {
          return rep.status(400).send({ error: { message: "Plan not found" } });
        }

        // Check if user has already redeemed free trial
        const userRef = db.collection("users").doc(userId);
        const userDoc = await userRef.get();
        if (!userDoc.exists) {
          return rep.status(404).send({ error: { message: "User not found" } });
        } else {
          const userData = userDoc.data() as RelevxUserProfile;
          if (userData.freeTrailRedeemed) {
            return rep
              .status(400)
              .send({ error: { message: "Free trial already redeemed" } });
          }

          const subscription = await stripe.subscriptions.create({
            customer: userData.billing.stripeCustomerId,
            items: [{ price: planData.infoStripeSubscriptionId }],
            trial_period_days: 7,
            collection_method: "send_invoice",
            days_until_due: 0,
            payment_behavior: "allow_incomplete",
          });

          const newUserData = {
            ...userData,
            planId: planData.id,
            freeTrailRedeemed: true,
            updatedAt: new Date().toISOString(),
            lastLoginAt: new Date().toISOString(),
            billing: {
              ...userData.billing,
              stripeSubscriptionId: subscription.id,
            },
          };

          // Update user document in Firestore
          await userRef.update(newUserData);
        }

        return rep.status(200).send({
          ok: true,
        });
      } catch (err: any) {
        const isDev = process.env.NODE_ENV !== "production";
        const detail = err instanceof Error ? err.message : String(err);
        req.log?.error({ detail }, "/user/billing/activate-free-trial failed");
        return rep.status(500).send({
          error: {
            code: "internal_error",
            message: "User activate free trial failed",
            ...(isDev ? { detail } : {}),
          },
        });
      }
    }
  );

};

export default routes;
