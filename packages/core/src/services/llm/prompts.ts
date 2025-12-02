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

Generate 5-7 search queries using different strategies:
1. BROAD queries - general terms that cast a wide net
2. SPECIFIC queries - precise terms with specific details
3. QUESTION queries - phrased as questions people might ask
4. TEMPORAL queries - include recency indicators like "latest", "recent", "2024", "new"

Each query should be distinct and approach the topic from different angles.
Queries should be concise (3-8 words typically) and use natural search language.`,
  user: `Project Description:
{{description}}

{{additionalContext}}{{queryPerformanceContext}}{{iterationGuidance}}

Generate 5-7 diverse search queries. Return ONLY a JSON object with this structure:
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
  system: `You are a research report compiler. Your task is to create a comprehensive, well-structured markdown report from research findings.

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
- > for important quotes or highlights`,
  user: `Project: {{projectTitle}}
Description: {{projectDescription}}

Create a comprehensive markdown report from these {{resultCount}} research findings:

{{resultsFormatted}}

Return ONLY a JSON object with this structure:
{
  "markdown": "the full markdown report",
  "title": "report title",
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
  | "relevancy-analysis"
  | "report-compilation";

export function getPromptConfig(type: PromptType): PromptConfig {
  switch (type) {
    case "query-generation":
      return QUERY_GENERATION_PROMPTS;
    case "relevancy-analysis":
      return RELEVANCY_ANALYSIS_PROMPTS;
    case "report-compilation":
      return REPORT_COMPILATION_PROMPTS;
    default:
      throw new Error(`Unknown prompt type: ${type}`);
  }
}
