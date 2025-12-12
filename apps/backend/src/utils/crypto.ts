import crypto from "node:crypto";

// Derive a deterministic lookup hash for API keys using a server-side pepper.
// This hash is safe to store/index in databases; never store raw API keys.
export const hashApiKey = (apiKey: string, pepper: string) =>
  crypto.createHash("sha256")
    .update(`${pepper}:${apiKey}`)
    .digest("hex");


