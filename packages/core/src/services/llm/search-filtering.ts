/**
 * Search result filtering using OpenAI
 */

import { getClient } from "./client";
import { SEARCH_RESULT_FILTERING_PROMPTS, renderPrompt } from "./prompts";
import type { SearchResultToFilter, FilteredSearchResult } from "./types";

/**
 * Filter search results using LLM to determine if they are worth fetching
 */
export async function filterSearchResults(
  results: SearchResultToFilter[],
  projectDescription: string
): Promise<FilteredSearchResult[]> {
  const client = getClient();

  if (results.length === 0) {
    return [];
  }

  // Format results for the prompt
  const resultsFormatted = results
    .map(
      (r, idx) => `
Result ${idx + 1}:
URL: ${r.url}
Title: ${r.title}
Snippet: ${r.description}
---`
    )
    .join("\n");

  // Render user prompt
  const userPrompt = renderPrompt(SEARCH_RESULT_FILTERING_PROMPTS.user, {
    description: projectDescription,
    results: resultsFormatted,
  });

  try {
    const response = await client.chat.completions.create({
      model: SEARCH_RESULT_FILTERING_PROMPTS.model,
      messages: [
        { role: "system", content: SEARCH_RESULT_FILTERING_PROMPTS.system },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: SEARCH_RESULT_FILTERING_PROMPTS.responseFormat || "json_object",
      },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("No content in OpenAI response");
    }

    const parsed = JSON.parse(content);
    return parsed.results || [];
  } catch (error) {
    console.error("Error filtering search results:", error);
    // In case of error, default to keeping all results to be safe?
    // Or return empty array?
    // Better to log and fallback to standard filtering (which is no filtering)
    // But since this function is 'filterSearchResults', returning empty might mean 'filter all out'.
    // Let's rethrow for now, or the caller should handle it.
    throw error;
  }
}

/**
 * Safe wrapper that falls back to keeping everything on error
 */
export async function filterSearchResultsSafe(
  results: SearchResultToFilter[],
  projectDescription: string
): Promise<FilteredSearchResult[]> {
  try {
    return await filterSearchResults(results, projectDescription);
  } catch (error) {
    console.warn("Falling back to keeping all results due to filter error:", error);
    return results.map(r => ({
      url: r.url,
      keep: true,
      reasoning: "Fallback due to error"
    }));
  }
}
