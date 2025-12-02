/**
 * Report compilation using OpenAI
 */

import { getClient } from "./client";
import { REPORT_COMPILATION_PROMPTS, renderPrompt } from "./prompts";
import type { SearchParameters } from "../../models/project";
import type { ResultForReport, CompiledReport } from "./types";

/**
 * Compile relevant results into a markdown report
 */
export async function compileReport(
  results: ResultForReport[],
  projectTitle: string,
  projectDescription: string,
  searchParams?: SearchParameters
): Promise<CompiledReport> {
  const client = getClient();

  if (results.length === 0) {
    return {
      markdown: `# ${projectTitle}\n\nNo relevant results found for this research period.`,
      title: projectTitle,
      summary: "No relevant results were found.",
      resultCount: 0,
      averageScore: 0,
    };
  }

  // Sort results by score
  const sortedResults = [...results].sort((a, b) => b.score - a.score);

  const resultsFormatted = sortedResults
    .map(
      (r, idx) => `
Result ${idx + 1}:
URL: ${r.url}
Title: ${r.title || "N/A"}
Score: ${r.score}/100
Published: ${r.publishedDate || "Unknown"}
Author: ${r.author || "Unknown"}
Key Points: ${r.keyPoints.join("; ")}
${r.imageUrl ? `Image: ${r.imageUrl} (Alt: ${r.imageAlt || "N/A"})` : ""}
Snippet:
${r.snippet}
---`
    )
    .join("\n");

  // Render user prompt with template variables
  const userPrompt = renderPrompt(REPORT_COMPILATION_PROMPTS.user, {
    projectTitle,
    projectDescription,
    resultCount: results.length,
    resultsFormatted,
  });

  try {
    const response = await client.chat.completions.create({
      model: REPORT_COMPILATION_PROMPTS.model,
      messages: [
        { role: "system", content: REPORT_COMPILATION_PROMPTS.system },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: REPORT_COMPILATION_PROMPTS.responseFormat || "json_object",
      },
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error("No content in OpenAI response");
    }

    const parsed = JSON.parse(content);

    const averageScore =
      results.reduce((sum, r) => sum + r.score, 0) / results.length;

    return {
      markdown: parsed.markdown,
      title: parsed.title || projectTitle,
      summary: parsed.summary || "",
      resultCount: results.length,
      averageScore: Math.round(averageScore),
    };
  } catch (error) {
    console.error("Error compiling report:", error);
    throw error;
  }
}

/**
 * Compile report with retry logic
 */
export async function compileReportWithRetry(
  results: ResultForReport[],
  projectTitle: string,
  projectDescription: string,
  searchParams?: SearchParameters,
  maxRetries: number = 3
): Promise<CompiledReport> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await compileReport(
        results,
        projectTitle,
        projectDescription,
        searchParams
      );
    } catch (error) {
      lastError = error as Error;
      console.warn(
        `Report compilation attempt ${attempt}/${maxRetries} failed:`,
        error
      );

      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw new Error(
    `Failed to compile report after ${maxRetries} attempts: ${lastError?.message}`
  );
}
