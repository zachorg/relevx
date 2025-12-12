import fp from "fastify-plugin";

// Firebase-backed API key authentication with short TTL caching.
export default fp(async (app: any) => {
  app.addHook("preHandler", async (req: any, _rep: any) => {
    // Allow unauthenticated health checks so uptime probes don't require auth.
    if (req.routeOptions.url === "/healthz" || req.routeOptions.url === "/api/v1/products/plans") {
      return;
    }

    const idToken = req.headers?.["authorization"] as string;

    // Branch: Firebase Auth JWT
    if (idToken) {
      try {
        const res = await app.introspectIdToken(idToken);
        if (!res?.user?.uid) {
          const err: any = new Error("Missing or invalid token");
          err.statusCode = 401;
          err.code = "unauthorized";
          throw err;
        }
        req.user = res.user;
        try { req.log.debug({ uid: res.user.uid }, "auth: firebase token verified"); } catch { }
        return;
      } catch (e) {
        try { req.log.warn({ err: e && (e as any).message }, "auth: firebase token verification failed"); } catch { }
        const err: any = new Error("Missing or invalid token");
        err.statusCode = 401;
        err.code = "unauthorized";
        throw err;
      }
    }
  });
});