/**
 * AI Prompt Configuration
 *
 * Centralized location for all AI prompts used in the research system.
 * Prompts use template placeholders that are filled at runtime.
 *
 * Template syntax: {{placeholder}} - will be replaced with actual values
 */

export interface PromptConfig {
  system: string;
  user: string;
  model: string;
  responseFormat?: "json_object" | "text";
}

/**
 * Prompt templates for query generation
 */
export const QUERY_GENERATION_PROMPTS: PromptConfig = {
  model: "gpt-4o-mini",
  responseFormat: "json_object",
  system: `You are a search query optimization expert. Your task is to generate diverse, effective search queries that will find relevant content on the web.

Generate 5 search queries using different strategies:
1. BROAD queries - general terms that cast a wide net
2. SPECIFIC queries - precise terms with specific details
3. QUESTION queries - phrased as questions people might ask
4. TEMPORAL queries - include recency indicators like "latest", "recent", "2024", "new"

Each query should be distinct and approach the topic from different angles.
Queries should be concise (3-8 words typically) and use natural search language.`,
  user: `Project Description:
{{description}}

{{additionalContext}}{{queryPerformanceContext}}{{iterationGuidance}}

Generate 5 diverse search queries. Return ONLY a JSON object with this structure:
{
  "queries": [
    {
      "query": "the search query text",
      "type": "broad|specific|question|temporal",
      "reasoning": "brief explanation of strategy"
    }
  ]
}`,
};

/**
 * Prompt templates for search result filtering
 */
export const SEARCH_RESULT_FILTERING_PROMPTS: PromptConfig = {
  model: "gpt-4o-mini",
  responseFormat: "json_object",
  system: `You are a strict research curator. Your task is to filter search results based on their title and snippet to decide if they are worth reading.

Criteria for keeping:
1. Directly relevant to the user's project.
2. Likely to contain substantial information (not just a landing page or login screen).
3. Not a duplicate or low-quality SEO spam site.

Be strict. We only want to fetch the most promising content.`,
  user: `Project Description:
{{description}}

Search Results to Filter:
{{results}}

Evaluate each result and return ONLY a JSON object with this structure:
{
  "results": [
    {
      "url": "the result url",
      "keep": true/false,
      "reasoning": "brief reason"
    }
  ]
}`,
};

/**
 * Prompt templates for relevancy analysis
 */
export const RELEVANCY_ANALYSIS_PROMPTS: PromptConfig = {
  model: "gpt-4o-mini",
  responseFormat: "json_object",
  system: `You are a content relevancy analyst. Your task is to analyze web content and determine how relevant it is to a user's research project.

For each piece of content, provide:
1. A relevancy score (0-100) where:
   - 90-100: Highly relevant, directly addresses the topic
   - 70-89: Very relevant, covers important aspects
   - 50-69: Moderately relevant, tangentially related
   - 30-49: Slightly relevant, mentions the topic
   - 0-29: Not relevant or off-topic

2. Clear reasoning explaining the score
3. Key relevant points found in the content
4. Whether it meets the minimum threshold for inclusion`,
  user: `Project Description:
{{projectDescription}}

{{requirements}}
Minimum Relevancy Threshold: {{threshold}}

Content to Analyze:
{{contentsFormatted}}

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
}`,
};

/**
 * Prompt templates for report compilation
 */
export const REPORT_COMPILATION_PROMPTS: PromptConfig = {
  model: "gpt-4o-mini",
  responseFormat: "json_object",
  system: `You are a direct and efficient personal research assistant. Your task is to synthesize research findings into a concise, high-signal report for the user.

1. **Personalized & Direct**: Write directly to the user about what you found for their specific project.
2. **High Signal, No Noise**: Avoid "journalistic flair", filler words, flowery introductions, or stating the obvious. Get straight to the new information.
3. **Synthesis**: Connect findings logically. Don't just list them.
4. **Embedded Citations**: Embed links directly into the text (e.g., "[New study](url) shows..."). Do not use bibliography lists.
5. **Formatting**: Use clean usage of Markdown (h2, h3, bold).

Do NOT include:
- An "Executive Summary" section (unless the content is extremely long).
- Relevancy scores.
- Generic concluding paragraphs like "In conclusion, AI is changing the world...".

Tone: Professional, direct, efficient.`,
  user: `Project: {{projectTitle}}
Description: {{projectDescription}}

Synthesize the following research findings into a narrative report:

{{resultsFormatted}}

Return ONLY a JSON object with this structure:
{
  "markdown": "the full markdown report",
  "title": "A captivating title for the report",
  "summary": "2-3 sentence executive summary"
}`,
};

/**
 * Helper function to replace template placeholders
 */
export function renderPrompt(
  template: string,
  variables: Record<string, string | number>
): string {
  let rendered = template;
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`;
    rendered = rendered.replace(new RegExp(placeholder, "g"), String(value));
  }
  return rendered;
}

/**
 * Get prompt configuration by type
 */
export type PromptType =
  | "query-generation"
  | "search-result-filtering"
  | "relevancy-analysis"
  | "report-compilation";

export function getPromptConfig(type: PromptType): PromptConfig {
  switch (type) {
    case "query-generation":
      return QUERY_GENERATION_PROMPTS;
    case "relevancy-analysis":
      return RELEVANCY_ANALYSIS_PROMPTS;
    case "search-result-filtering":
      return SEARCH_RESULT_FILTERING_PROMPTS;
    case "report-compilation":
      return REPORT_COMPILATION_PROMPTS;
    default:
      throw new Error(`Unknown prompt type: ${type}`);
  }
}
