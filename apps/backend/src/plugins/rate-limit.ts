import fp from "fastify-plugin";
// Adds helper to apply per-route rate limiting with a default max per minute.
// This wraps the fastify-rate-limit plugin to pull per-tenant defaults from
// tenant settings and allow an override per route.
export default fp(async (app: any) => {
  const RATE_ROUTE_MAX = Number(process.env.RATE_ROUTE_MAX || 30);

  app.decorate(
    "rlPerRoute",
    (max?: number) => {
      return (app as any).rateLimit({
        timeWindow: "1 minute",
        max: async (req: any) => {
          // Always rely on authenticated tenantId set by auth plugin
          const tenantId = req.tenantId as string | undefined;
          const ts = await (app as any).getTenantSettings?.(tenantId);
          const perTenantMax = ts?.routePerMinute ?? RATE_ROUTE_MAX;
          const effective = max ?? perTenantMax;
          try { req.log.debug({ tenantId, effective }, "rate-limit: effective per-route limit"); } catch { }
          return effective;
        }
      });
    }
  );
});