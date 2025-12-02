/**
 * Hybrid LLM Provider
 * Delegates different research tasks to different providers to optimize cost/performance.
 */

import type {
  LLMProvider,
  GeneratedQuery,
  ContentToAnalyze,
  RelevancyResult,
  ResultForReport,
  CompiledReport,
} from "../../interfaces/llm-provider";

export interface HybridProviderConfig {
  queryProvider: LLMProvider;
  analysisProvider: LLMProvider;
  reportProvider: LLMProvider;
}

export class HybridProvider implements LLMProvider {
  private queryProvider: LLMProvider;
  private analysisProvider: LLMProvider;
  private reportProvider: LLMProvider;

  constructor(config: HybridProviderConfig) {
    this.queryProvider = config.queryProvider;
    this.analysisProvider = config.analysisProvider;
    this.reportProvider = config.reportProvider;
  }

  async generateSearchQueries(
    description: string,
    additionalContext?: string,
    options?: { count?: number; focusRecent?: boolean }
  ): Promise<GeneratedQuery[]> {
    return this.queryProvider.generateSearchQueries(
      description,
      additionalContext,
      options
    );
  }

  async analyzeRelevancy(
    description: string,
    contents: ContentToAnalyze[],
    options?: { threshold?: number; batchSize?: number }
  ): Promise<RelevancyResult[]> {
    return this.analysisProvider.analyzeRelevancy(
      description,
      contents,
      options
    );
  }

  async compileReport(
    description: string,
    results: ResultForReport[],
    options?: { tone?: "professional" | "casual" | "technical"; maxLength?: number }
  ): Promise<CompiledReport> {
    return this.reportProvider.compileReport(description, results, options);
  }
}
