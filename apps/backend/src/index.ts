import path from "node:path";
import dotenv from "dotenv";

// Load environment variables from secrets/.env.local
dotenv.config({ path: path.join(process.cwd(), "secrets", ".env.local") });
dotenv.config(); // fallback to default .env

import Fastify from "fastify";
import fastifyCors from "@fastify/cors";
import fastifyRateLimit from "@fastify/rate-limit";
import auth from "./plugins/auth.js";
import rl from "./plugins/rate-limit.js";
import errors from "./plugins/errors.js";
import firebase from "./plugins/firebase.js";
import stripe from "./plugins/stripe.js";
import userBillingRoutes from "./routes/userBilling.js";
import productsRoutes from "./routes/products.js";
import userAuthRoutes from "./routes/userAuth.js";

// set env path location


// Fastify app with structured logging enabled. We redact sensitive fields by
// default to avoid leaking destinations/PII in application logs.
const app = Fastify({
  logger: {
    level: "info",
    redact: {
      paths: ["destination", "body.destination", "req.body.destination"],
      censor: "[REDACTED]"
    }
  }
});

await app.register(fastifyCors, {
  origin: true, // Accept any origin
  credentials: true, // Allow credentials
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With", "Accept", "Origin", "planId"],
  methods: ["GET", "POST", "DELETE", "OPTIONS"],
});

// Core platform plugins. Registration order matters for dependencies:
// - errors early to ensure consistent error shaping
await app.register(errors);
await app.register(firebase);
await app.register(fastifyRateLimit, { global: false });
await app.register(rl);
await app.register(auth);
await app.register(stripe);

// Business routes
await app.register(userBillingRoutes, { prefix: "/api/v1/user/billing" });
await app.register(productsRoutes, { prefix: "/api/v1/products" });
await app.register(userAuthRoutes, { prefix: "/api/v1/user/auth" });

// Startup log to aid operational visibility
app.log.info({
  env: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT_RELEVX || 8080),
  cors: process.env.CORS_ORIGIN || false
}, "Starting RelevX API server");

await app.listen({ host: "0.0.0.0", port: Number(process.env.PORT || 8080) });


