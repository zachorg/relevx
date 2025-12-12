import type { FastifyPluginAsync } from "fastify";
import type { PlanInfo, Plan } from "core/models/plans";

// API key management routes: create/list/revoke. All routes rely on the auth
// plugin to populate req.userId and tenant authorization.
const routes: FastifyPluginAsync = async (app) => {
  const firebase = app.firebase;
  const db = firebase.db;
  const stripe = app.stripe;

  app.get("/healthz", async (_req, rep) => {
    return rep.send({ ok: true });
  });

  app.get(
    "/plans",
    { preHandler: [app.rlPerRoute(10)] },
    async (req: any, rep) => {
      try {
        // Create or update user document in Firestore
        const plansRef = db.collection("plans");
        const snapshot = await plansRef.get();

        const plans: PlanInfo[] = await Promise.all(
          snapshot.docs.map(async (doc) => {
            const data: Plan = doc.data() as Plan;
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { infoStripeSubscriptionId, ...planData } = data;
            const price = await stripe.prices.retrieve(
              data.infoStripeSubscriptionId
            );
            const newData: PlanInfo = {
              ...planData,
              infoPrice: (price?.unit_amount ?? 0) / 100,
            };
            return newData;
          })
        );

        return rep.status(200).send({
          ok: true,
          plans,
        });
      } catch (err: any) {
        const isDev = process.env.NODE_ENV !== "production";
        const detail = err instanceof Error ? err.message : String(err);
        req.log?.error({ detail }, "/plans failed");
        return rep.status(500).send({
          error: {
            code: "internal_error",
            message: "Failed to fetch plans",
            ...(isDev ? { detail } : {}),
          },
        });
      }
    }
  );
};

export default routes;
