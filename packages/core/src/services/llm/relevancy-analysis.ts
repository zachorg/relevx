/**
 * Content relevancy analysis using OpenAI
 */

import { getClient } from "./client";
import { RELEVANCY_ANALYSIS_PROMPTS, renderPrompt } from "./prompts";
import type { SearchParameters } from "../../models/project";
import type { ContentToAnalyze, RelevancyResult } from "./types";

/**
 * Analyze relevancy of extracted content
 */
export async function analyzeRelevancy(
  contents: ContentToAnalyze[],
  projectDescription: string,
  searchParams?: SearchParameters,
  threshold: number = 60
): Promise<RelevancyResult[]> {
  const client = getClient();

  // Build context
  const contextParts: string[] = [];

  if (searchParams?.requiredKeywords?.length) {
    contextParts.push(
      `Must include these topics: ${searchParams.requiredKeywords.join(", ")}`
    );
  }

  if (searchParams?.excludedKeywords?.length) {
    contextParts.push(
      `Should NOT contain: ${searchParams.excludedKeywords.join(", ")}`
    );
  }

  const contentsFormatted = contents
    .map(
      (c, idx) => `
Content ${idx + 1}:
URL: ${c.url}
Title: ${c.title || "N/A"}
Published: ${c.publishedDate || "Unknown"}
Snippet:
${c.snippet}
---`
    )
    .join("\n");

  // Build requirements string
  const requirements =
    contextParts.length > 0
      ? `Requirements:\n${contextParts.join("\n")}\n`
      : "";

  // Render user prompt with template variables
  const userPrompt = renderPrompt(RELEVANCY_ANALYSIS_PROMPTS.user, {
    projectDescription,
    requirements,
    threshold,
    contentsFormatted,
  });

  try {
    const response = await client.chat.completions.create({
      model: RELEVANCY_ANALYSIS_PROMPTS.model,
      messages: [
        { role: "system", content: RELEVANCY_ANALYSIS_PROMPTS.system },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: RELEVANCY_ANALYSIS_PROMPTS.responseFormat || "json_object",
      },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("No content in OpenAI response");
    }

    const parsed = JSON.parse(content);
    return parsed.results || [];
  } catch (error) {
    console.error("Error analyzing relevancy:", error);
    throw error;
  }
}

/**
 * Analyze relevancy with retry logic
 */
export async function analyzeRelevancyWithRetry(
  contents: ContentToAnalyze[],
  projectDescription: string,
  searchParams?: SearchParameters,
  threshold: number = 60,
  maxRetries: number = 3
): Promise<RelevancyResult[]> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await analyzeRelevancy(
        contents,
        projectDescription,
        searchParams,
        threshold
      );
    } catch (error) {
      lastError = error as Error;
      console.warn(
        `Relevancy analysis attempt ${attempt}/${maxRetries} failed:`,
        error
      );

      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(
    `Failed to analyze relevancy after ${maxRetries} attempts: ${lastError?.message}`
  );
}
