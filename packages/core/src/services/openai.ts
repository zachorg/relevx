/**
 * OpenAI service
 *
 * Handles all OpenAI API interactions for the research assistant:
 * - Query generation from project descriptions
 * - Relevancy analysis of search results
 * - Report compilation in markdown format
 */

import OpenAI from "openai";
import type { SearchParameters } from "../models/project";
import type { ProcessedUrl, QueryPerformance } from "../models/search-history";

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
function getClient(): OpenAI {
  if (!openaiClient) {
    throw new Error(
      "OpenAI client not initialized. Call initializeOpenAI() first."
    );
  }
  return openaiClient;
}

/**
 * Generated search query with metadata
 */
export interface GeneratedQuery {
  query: string; // The actual search query string
  type: "broad" | "specific" | "question" | "temporal"; // Query strategy type
  reasoning?: string; // Why this query was generated
}

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

  const systemPrompt = `You are a search query optimization expert. Your task is to generate diverse, effective search queries that will find relevant content on the web.

Generate 5-7 search queries using different strategies:
1. BROAD queries - general terms that cast a wide net
2. SPECIFIC queries - precise terms with specific details
3. QUESTION queries - phrased as questions people might ask
4. TEMPORAL queries - include recency indicators like "latest", "recent", "2024", "new"

Each query should be distinct and approach the topic from different angles.
Queries should be concise (3-8 words typically) and use natural search language.`;

  const userPrompt = `Project Description:
${description}

${
  contextParts.length > 0
    ? `Additional Context:\n${contextParts.join("\n")}\n`
    : ""
}${queryPerformanceContext}${iterationGuidance}

Generate 5-7 diverse search queries. Return ONLY a JSON object with this structure:
{
  "queries": [
    {
      "query": "the search query text",
      "type": "broad|specific|question|temporal",
      "reasoning": "brief explanation of strategy"
    }
  ]
}`;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-5-nano",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
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

    return queries.slice(0, 7); // Ensure max 7 queries
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

/**
 * Content to analyze for relevancy
 */
export interface ContentToAnalyze {
  url: string;
  title?: string;
  snippet: string;
  publishedDate?: string;
  metadata?: Record<string, any>;
}

/**
 * Relevancy analysis result for a single piece of content
 */
export interface RelevancyResult {
  url: string;
  score: number; // 0-100
  reasoning: string;
  keyPoints: string[]; // Main relevant points found
  isRelevant: boolean; // true if score >= threshold
}

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

  const systemPrompt = `You are a content relevancy analyst. Your task is to analyze web content and determine how relevant it is to a user's research project.

For each piece of content, provide:
1. A relevancy score (0-100) where:
   - 90-100: Highly relevant, directly addresses the topic
   - 70-89: Very relevant, covers important aspects
   - 50-69: Moderately relevant, tangentially related
   - 30-49: Slightly relevant, mentions the topic
   - 0-29: Not relevant or off-topic

2. Clear reasoning explaining the score
3. Key relevant points found in the content
4. Whether it meets the minimum threshold for inclusion`;

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

  const userPrompt = `Project Description:
${projectDescription}

${contextParts.length > 0 ? `Requirements:\n${contextParts.join("\n")}\n` : ""}
Minimum Relevancy Threshold: ${threshold}

Content to Analyze:
${contentsFormatted}

Analyze each piece of content and return ONLY a JSON object with this structure:
{
  "results": [
    {
      "url": "the content URL",
      "score": 0-100,
      "reasoning": "explanation of the score",
      "keyPoints": ["point 1", "point 2", "point 3"],
      "isRelevant": true or false (based on threshold)
    }
  ]
}`;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-5-nano", // Use cheaper model for analysis
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
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

/**
 * Result with content for report compilation
 */
export interface ResultForReport {
  url: string;
  title?: string;
  snippet: string;
  score: number;
  keyPoints: string[];
  publishedDate?: string;
  author?: string;
  imageUrl?: string;
  imageAlt?: string;
}

/**
 * Compiled report output
 */
export interface CompiledReport {
  markdown: string;
  title: string;
  summary: string; // Executive summary
  resultCount: number;
  averageScore: number;
}

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

  const systemPrompt = `You are a research report compiler. Your task is to create a comprehensive, well-structured markdown report from research findings.

The report should:
1. Have a clear executive summary at the top
2. Be organized into logical sections by topic/theme
3. Include all relevant results with proper citations
4. Use markdown formatting (headers, lists, bold, links, images)
5. Include images where available
6. Provide context and analysis, not just list results
7. Be professional and easy to read

Use markdown features:
- # for main title, ## for sections, ### for subsections
- **bold** for emphasis
- [link text](url) for citations
- ![alt text](image-url) for images
- Bullet points for lists
- > for important quotes or highlights`;

  const userPrompt = `Project: ${projectTitle}
Description: ${projectDescription}

Create a comprehensive markdown report from these ${results.length} research findings:

${resultsFormatted}

Return ONLY a JSON object with this structure:
{
  "markdown": "the full markdown report",
  "title": "report title",
  "summary": "2-3 sentence executive summary"
}`;

  try {
    const response = await client.chat.completions.create({
      model: "gpt-4.1-mini", // Use better model for final report
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
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
