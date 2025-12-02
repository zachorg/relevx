/**
 * Type definitions for OpenAI service
 */

/**
 * Generated search query with metadata
 */
export interface GeneratedQuery {
  query: string; // The actual search query string
  type: "broad" | "specific" | "question" | "temporal"; // Query strategy type
  reasoning?: string; // Why this query was generated
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
