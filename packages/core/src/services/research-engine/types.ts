/**
 * Type definitions for research engine
 */

import type { SearchResult } from "../../models/search-result";
import type { LLMProvider } from "../../interfaces/llm-provider";
import type { SearchProvider } from "../../interfaces/search-provider";

/**
 * Research execution options
 */
export interface ResearchOptions {
  maxIterations?: number; // Max retry iterations (default: 3)
  minResults?: number; // Min results to find (default: from project.settings)
  maxResults?: number; // Max results to include (default: from project.settings)
  relevancyThreshold?: number; // Min score (default: from project.settings)
  concurrentExtractions?: number; // Parallel extractions (default: 3)
  ignoreFrequencyCheck?: boolean; // Skip frequency validation (default: false)

  // Provider injection (for switching between providers)
  llmProvider?: LLMProvider; // Custom LLM provider (default: OpenAI)
  searchProvider?: SearchProvider; // Custom search provider (default: Brave)
}

/**
 * Research execution result
 */
export interface ResearchResult {
  success: boolean;
  projectId: string;

  // Results
  relevantResults: SearchResult[];
  totalResultsAnalyzed: number;
  iterationsUsed: number;

  // Queries
  queriesGenerated: string[];
  queriesExecuted: string[];

  // URLs
  urlsFetched: number;
  urlsSuccessful: number;
  urlsRelevant: number;

  // Report
  report?: {
    markdown: string;
    title: string;
    summary: string;
    averageScore: number;
    resultCount: number;
  };

  // Delivery
  deliveryLogId?: string; // ID of the created delivery log (if results were saved)

  // Errors
  error?: string;

  // Timing
  startedAt: number;
  completedAt: number;
  durationMs: number;
}
