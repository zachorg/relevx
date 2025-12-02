/**
 * OpenAI client initialization and management
 */

import OpenAI from "openai";

// OpenAI client instance
let openaiClient: OpenAI | null = null;

/**
 * Initialize the OpenAI client
 * Must be called before using any other functions
 */
export function initializeOpenAI(apiKey: string): void {
  openaiClient = new OpenAI({
    apiKey,
  });
}

/**
 * Get the OpenAI client instance
 */
export function getClient(): OpenAI {
  if (!openaiClient) {
    throw new Error(
      "OpenAI client not initialized. Call initializeOpenAI() first."
    );
  }
  return openaiClient;
}
