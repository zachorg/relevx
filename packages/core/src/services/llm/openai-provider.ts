/**
 * OpenAI Provider Implementation
 *
 * Adapter that wraps the existing OpenAI service to implement LLMProvider interface
 */

import type {
  LLMProvider,
  GeneratedQuery,
  ContentToAnalyze,
  RelevancyResult,
  ResultForReport,
  CompiledReport,
  SearchResultToFilter,
  FilteredSearchResult,
} from "../../interfaces/llm-provider";
import {
  generateSearchQueries as openaiGenerateQueries,
  generateSearchQueriesWithRetry as openaiGenerateQueriesRetry,
} from "./query-generation";
import {
  analyzeRelevancy as openaiAnalyzeRelevancy,
  analyzeRelevancyWithRetry as openaiAnalyzeRelevancyRetry,
} from "./relevancy-analysis";
import {
  compileReport as openaiCompileReport,
  compileReportWithRetry as openaiCompileReportRetry,
} from "./report-compilation";
import { filterSearchResultsSafe } from "./search-filtering"; 
import { initializeOpenAI as initOpenAI, getClient } from "./client";

/**
 * OpenAI implementation of LLMProvider
 */
export class OpenAIProvider implements LLMProvider {
  private initialized: boolean = false;

  constructor(apiKey?: string) {
    if (apiKey) {
      initOpenAI(apiKey);
      this.initialized = true;
    }
  }

  /**
   * Ensure the provider is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      try {
        getClient(); // This will throw if not initialized
        this.initialized = true;
      } catch (error) {
        throw new Error(
          "OpenAI provider not initialized. Call initializeOpenAI() first or provide API key in constructor."
        );
      }
    }
  }

  /**
   * Generate search queries from project description
   */
  async generateSearchQueries(
    projectDescription: string,
    additionalContext?: string,
    options?: {
      count?: number;
      focusRecent?: boolean;
    }
  ): Promise<GeneratedQuery[]> {
    this.ensureInitialized();

    // The existing OpenAI function takes different parameters
    // We'll call it with retry logic
    const queries = await openaiGenerateQueriesRetry(
      projectDescription,
      undefined, // searchParams
      undefined, // previousQueries
      1, // iteration
      3 // maxRetries
    );

    return queries;
  }

  /**
   * Filter search results based on title/snippet
   */
  async filterSearchResults(
    results: SearchResultToFilter[],
    projectDescription: string
  ): Promise<FilteredSearchResult[]> {
    this.ensureInitialized();
    return filterSearchResultsSafe(results, projectDescription);
  }

  /**
   * Analyze relevancy of content against project description
   */
  async analyzeRelevancy(
    projectDescription: string,
    contents: ContentToAnalyze[],
    options?: {
      threshold?: number;
      batchSize?: number;
    }
  ): Promise<RelevancyResult[]> {
    this.ensureInitialized();

    const threshold = options?.threshold || 60;

    // Use the existing OpenAI function with retry logic
    const results = await openaiAnalyzeRelevancyRetry(
      contents,
      projectDescription,
      undefined, // searchParams
      threshold,
      3 // maxRetries
    );

    return results;
  }

  /**
   * Compile a report from relevant results
   */
  async compileReport(
    projectDescription: string,
    results: ResultForReport[],
    options?: {
      tone?: "professional" | "casual" | "technical";
      maxLength?: number;
    }
  ): Promise<CompiledReport> {
    this.ensureInitialized();

    // Use the existing OpenAI function with retry logic
    const report = await openaiCompileReportRetry(
      results,
      "Research Report", // projectTitle - use a default since interface doesn't require it
      projectDescription,
      undefined, // searchParams
      3 // maxRetries
    );

    return report;
  }
}

/**
 * Factory function to create OpenAI provider
 */
export function createOpenAIProvider(apiKey: string): OpenAIProvider {
  return new OpenAIProvider(apiKey);
}
