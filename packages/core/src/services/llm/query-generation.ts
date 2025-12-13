/**
 * Search query generation using OpenAI
 */

import { getClient } from "./client";
import { QUERY_GENERATION_PROMPTS, renderPrompt } from "./prompts";
import type { SearchParameters } from "../../models/project";
import type { QueryPerformance } from "../../models/search-history";
import type { GeneratedQuery } from "./types";

/**
 * Generate optimized search queries from project description
 */
export async function generateSearchQueries(
  description: string,
  searchParams?: SearchParameters,
  previousQueries?: QueryPerformance[],
  iteration: number = 1
): Promise<GeneratedQuery[]> {
  const client = getClient();

  // Build context about what to consider
  const contextParts: string[] = [];

  if (searchParams?.priorityDomains?.length) {
    contextParts.push(
      `Priority domains: ${searchParams.priorityDomains.join(", ")}`
    );
  }

  if (searchParams?.requiredKeywords?.length) {
    contextParts.push(
      `Required keywords: ${searchParams.requiredKeywords.join(", ")}`
    );
  }

  if (searchParams?.excludedKeywords?.length) {
    contextParts.push(
      `Keywords to avoid: ${searchParams.excludedKeywords.join(", ")}`
    );
  }

  if (searchParams?.language) {
    contextParts.push(`Language: ${searchParams.language}`);
  }

  // Add information about previous query performance
  let queryPerformanceContext = "";
  if (previousQueries && previousQueries.length > 0) {
    const topQueries = previousQueries
      .sort((a, b) => b.successRate - a.successRate)
      .slice(0, 3);

    if (topQueries.length > 0) {
      queryPerformanceContext = `\n\nPrevious successful queries (for reference, create NEW variations):\n${topQueries
        .map(
          (q) =>
            `- "${q.query}" (${q.successRate.toFixed(0)}% success rate, ${
              q.relevantUrlsFound
            } relevant results)`
        )
        .join("\n")}`;
    }
  }

  // Adjust strategy based on iteration
  let iterationGuidance = "";
  if (iteration === 2) {
    iterationGuidance =
      "\n\nThis is retry iteration 2. Generate broader queries with less restrictive terms.";
  } else if (iteration === 3) {
    iterationGuidance =
      "\n\nThis is retry iteration 3 (final attempt). Generate very broad queries with alternative phrasings.";
  }

  // Build additional context string
  const additionalContext =
    contextParts.length > 0
      ? `Additional Context:\n${contextParts.join("\n")}\n`
      : "";

  // Render user prompt with template variables
  const userPrompt = renderPrompt(QUERY_GENERATION_PROMPTS.user, {
    description,
    additionalContext,
    queryPerformanceContext: queryPerformanceContext || "",
    iterationGuidance: iterationGuidance || "",
  });

  try {
    const response = await client.chat.completions.create({
      model: QUERY_GENERATION_PROMPTS.model,
      messages: [
        { role: "system", content: QUERY_GENERATION_PROMPTS.system },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: QUERY_GENERATION_PROMPTS.responseFormat || "json_object",
      },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("No content in OpenAI response");
    }

    // Parse the response - handle both array and object with queries array
    let parsed = JSON.parse(content);
    let queries: GeneratedQuery[];

    if (Array.isArray(parsed)) {
      queries = parsed;
    } else if (parsed.queries && Array.isArray(parsed.queries)) {
      queries = parsed.queries;
    } else {
      console.error(
        "Unexpected response format. Received:",
        JSON.stringify(parsed, null, 2)
      );
      throw new Error("Unexpected response format from OpenAI");
    }

    return queries.slice(0, 5); // Ensure max 5 queries
  } catch (error) {
    console.error("Error generating search queries:", error);
    throw error;
  }
}

/**
 * Generate search queries with retry logic
 */
export async function generateSearchQueriesWithRetry(
  description: string,
  searchParams?: SearchParameters,
  previousQueries?: QueryPerformance[],
  iteration: number = 1,
  maxRetries: number = 3
): Promise<GeneratedQuery[]> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await generateSearchQueries(
        description,
        searchParams,
        previousQueries,
        iteration
      );
    } catch (error) {
      lastError = error as Error;
      console.warn(
        `Query generation attempt ${attempt}/${maxRetries} failed:`,
        error
      );

      if (attempt < maxRetries) {
        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(
    `Failed to generate queries after ${maxRetries} attempts: ${lastError?.message}`
  );
}
